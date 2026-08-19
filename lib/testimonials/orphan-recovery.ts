import "server-only";

import { createSecretClient } from "@/lib/supabase/secret";
import { accountPath } from "@/lib/cloudflare/client";
import { imagesApiToken, mediaEnvironment, streamApiToken } from "@/lib/cloudflare/config";
import {
  recoverImagesAsset,
  recoverStreamAsset,
  type FetchPage,
  type PageResult,
} from "@/lib/cloudflare/recovery-core";
import { logProviderEvent } from "./provider-assets";

/**
 * Recovering assets whose identifier we never received.
 *
 * THE FAILURE THIS EXISTS FOR
 *   Reservation succeeds, the create call to Cloudflare TIMES OUT, and the
 *   provider may or may not have created an asset. If it did, its identifier
 *   died with the request. Nothing local can find it, because we never held
 *   it — the opaque reference generated BEFORE the call is the only thing both
 *   sides share.
 *
 *   Such a row sits in the ledger as failed with provider_asset_id NULL, and
 *   the deletion sweep filters exactly that out (`provider_asset_id is not
 *   null`). So without this, a timed-out create leaves a billable asset that
 *   nothing in the system knows about and nothing will ever delete.
 *
 * WHY IT WORKS AT ALL
 *   Because `creator` and `meta.ref` are set at creation time with our own
 *   reference, and both products document filtering on them. An asset created
 *   without one would be findable only by paging the entire account, which
 *   this deliberately does not attempt.
 *
 * WHAT IT DOES WITH WHAT IT FINDS
 *   Records the identifier via record_orphaned_testimonial_provider_asset,
 *   which writes the row superseded AND failed AND orphaned in one statement —
 *   inert by CONSTRAINT, not by this function's good behaviour. The row then
 *   becomes visible to the deletion sweep, which deletes it on the same run.
 *
 *   It never makes anything usable. A recovered asset is rubbish to be
 *   collected, not a submission to be rescued: the visitor's attempt already
 *   failed and was superseded.
 *
 * FAILS CLOSED
 *   classifyRecoveryFailure in recovery-core has no path to `no_match` — an
 *   auth error, a network error or exhausted pagination is `unresolved`, never
 *   "there is nothing there". A row we could not resolve is left alone and
 *   retried, because recording "nothing to delete" on a failed lookup is how
 *   an asset becomes permanently invisible.
 */

/** Bounded per run: each row costs at least one authenticated provider call. */
export const ORPHAN_RECOVERY_BATCH = 10;

function pageFetcher(token: string, path: string): FetchPage {
  return async (query: URLSearchParams): Promise<PageResult> => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    let response: Response;
    try {
      response = await fetch(
        `https://api.cloudflare.com/client/v4${accountPath(path)}?${query.toString()}`,
        {
          method: "GET",
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
          cache: "no-store",
        },
      );
    } catch {
      // Status null means the request never completed. The core treats that as
      // unresolved, never as an empty result.
      return { ok: false, status: null };
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) return { ok: false, status: response.status };

    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      return { ok: false, status: response.status };
    }

    const envelope = body as {
      success?: boolean;
      result?: unknown;
      result_info?: { continuation_token?: unknown };
    } | null;

    if (envelope?.success !== true) return { ok: false, status: response.status };

    // Images v2 wraps its page in `result.images` with a continuation token;
    // Stream returns the array directly. Both are read defensively — the shape
    // is the provider's, not ours.
    const result = envelope.result;
    const images = (result as { images?: unknown } | null)?.images;
    const items = Array.isArray(images) ? images : Array.isArray(result) ? result : [];

    const raw =
      (result as { continuation_token?: unknown } | null)?.continuation_token ??
      envelope.result_info?.continuation_token;

    return {
      ok: true,
      items,
      continuationToken: typeof raw === "string" && raw.length > 0 ? raw : null,
    };
  };
}

export async function recoverOrphanedAssets(
  limit: number = ORPHAN_RECOVERY_BATCH,
): Promise<{ examined: number; recovered: number }> {
  const supabase = createSecretClient();
  const environment = mediaEnvironment();
  const summary = { examined: 0, recovered: 0 };

  // The ambiguous-timeout shape exactly: a failed attempt in this environment
  // that never received an identifier, and has not already been resolved.
  const { data, error } = await supabase
    .from("testimonial_provider_assets")
    .select("id, provider, opaque_reference")
    .eq("environment_marker", environment)
    .not("failed_at", "is", null)
    .is("provider_asset_id", null)
    .is("orphaned_at", null)
    .is("deleted_at", null)
    .order("reserved_at", { ascending: true })
    .limit(limit);

  if (error || !data) return summary;

  for (const row of data) {
    summary.examined += 1;

    const images = row.provider === "cloudflare_images";
    const outcome = await (images
      ? recoverImagesAsset(
          pageFetcher(imagesApiToken(), "/images/v2"),
          row.opaque_reference,
          environment,
        )
      : recoverStreamAsset(
          pageFetcher(streamApiToken(), "/stream"),
          row.opaque_reference,
          environment,
        ));

    if (outcome.status === "recovered") {
      const { error: recordError } = await supabase
        .rpc("record_orphaned_testimonial_provider_asset", {
          p_ledger_id: row.id,
          p_provider: row.provider,
          p_provider_asset_id: outcome.providerAssetId,
          // Pending, not deleted: the deletion sweep does the deleting, and it
          // runs later in the same invocation.
          p_deletion_status: "pending",
        })
        .single();
      if (!recordError) summary.recovered += 1;
    }

    logProviderEvent({
      correlationId: row.opaque_reference,
      provider: row.provider,
      event: `orphan_${outcome.status}`,
      code: outcome.status === "unresolved" ? outcome.reason : undefined,
    });
  }

  return summary;
}
