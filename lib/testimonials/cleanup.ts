import "server-only";

import { createSecretClient } from "@/lib/supabase/secret";
import { deleteImage } from "@/lib/cloudflare/images";
import { deleteVideo } from "@/lib/cloudflare/stream";
import { logProviderEvent } from "./provider-assets";

/**
 * Provider cleanup.
 *
 * WHY THIS IS NOT OPTIONAL
 *   A one-time upload URL cannot be reused, so every retry mints a NEW
 *   provider asset and supersedes the previous one. Without a sweep, each
 *   retry leaves a billable asset the product will never serve. Rejected and
 *   purged submissions leave the same residue.
 *
 * IDEMPOTENT BY CONSTRUCTION
 *   `not_found` is recorded as success: the goal is that the provider is no
 *   longer storing the asset, and a 404 proves that as well as a 200 does.
 *   Re-running the sweep is therefore always safe.
 *
 * NOT A VALIDATOR
 *   Nothing here changes a submission's lifecycle. Deleting a superseded
 *   asset must never affect the attempt that replaced it, which is why the
 *   ledger — not testimonial_submissions.provider_asset_id — is the thing
 *   being swept.
 */

export interface CleanupSummary {
  examined: number;
  deleted: number;
  notFound: number;
  failed: number;
}

export async function sweepDeletableProviderAssets(limit = 50): Promise<CleanupSummary> {
  const supabase = createSecretClient();
  const summary: CleanupSummary = { examined: 0, deleted: 0, notFound: 0, failed: 0 };

  const { data, error } = await supabase.rpc("list_deletable_testimonial_provider_assets", {
    p_limit: limit,
  });

  if (error || !data) return summary;

  // No casts: every field below comes from the generated Returns type of
  // list_deletable_testimonial_provider_assets. The SQL selects only rows
  // where provider_asset_id is not null, which is why it is typed non-null.
  for (const row of data) {
    const { ledger_id: ledgerId, provider, provider_asset_id: assetId } = row;
    if (assetId.length === 0) continue;

    summary.examined += 1;

    // Marked pending first, so an asset whose deletion crashes mid-flight is
    // visibly in progress rather than silently untouched.
    await supabase.rpc("mark_testimonial_provider_asset_deleted", {
      p_ledger_id: ledgerId,
      p_status: "pending",
    });

    let status: "deleted" | "not_found" | "failed";
    try {
      status =
        provider === "cloudflare_images"
          ? await deleteImage(assetId)
          : await deleteVideo(assetId);
    } catch {
      status = "failed";
    }

    if (status === "deleted") summary.deleted += 1;
    else if (status === "not_found") summary.notFound += 1;
    else summary.failed += 1;

    await supabase.rpc("mark_testimonial_provider_asset_deleted", {
      p_ledger_id: ledgerId,
      p_status: status,
    });

    logProviderEvent({
      correlationId: ledgerId,
      provider,
      event: "cleanup",
      code: `${row.reason}:${status}`,
    });
  }

  return summary;
}
