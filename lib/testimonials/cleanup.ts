import "server-only";

import { deleteImage } from "@/lib/cloudflare/images";
import { deleteVideo } from "@/lib/cloudflare/stream";
import { mediaEnvironment } from "@/lib/cloudflare/config";
import { finalizePendingUploads } from "./finalize";
import { recoverOrphanedAssets } from "./orphan-recovery";
import { logProviderEvent } from "./provider-assets";
import { createSecretClient } from "@/lib/supabase/secret";
import {
  runRetentionSweep,
  type RetentionDeps,
  type RetentionSummary,
} from "./retention-core";

/**
 * Retention enforcement, bound to the real database and the real provider.
 *
 * All of the ordering, deadline, counting and failure logic lives in
 * retention-core.ts, which takes every dependency as a parameter. This file
 * only supplies the real ones — which is what makes the core's branches
 * testable without a database, a network or a clock.
 *
 * WHY THIS IS NOT OPTIONAL
 *   A one-time upload URL cannot be reused, so every retry mints a NEW
 *   provider asset and supersedes the previous one. Without a sweep, each
 *   retry leaves a billable asset the product will never serve. Rejected,
 *   removed and abandoned submissions leave the same residue — and their
 *   media outlives the retention window the schema promises.
 *
 * THE ENVIRONMENT IS NOT NEGOTIABLE HERE
 *   Preview and Production share one database and one Cloudflare account. The
 *   environment comes from this deployment's own configuration and is passed
 *   to the database, which filters on it. Nothing in a request can influence
 *   it, and the listing RPC refuses an unrecognised value rather than
 *   returning an empty set — an empty result and a wrong-environment result
 *   are indistinguishable to a caller, so the database raises instead.
 */

export type { RetentionSummary } from "./retention-core";

/**
 * @param deadlineMs absolute epoch-ms after which no NEW provider deletion is
 *        started. Leftover rows are picked up by the next scheduled run.
 */
export function runRetention(deadlineMs: number): Promise<RetentionSummary> {
  const supabase = createSecretClient();
  const environment = mediaEnvironment();

  const deps: RetentionDeps = {
    async finalizePending(limit) {
      const result = await finalizePendingUploads(limit);
      return result.validated;
    },

    async recoverOrphans(limit) {
      const result = await recoverOrphanedAssets(limit);
      return result.recovered;
    },

    async expireIntents(limit) {
      const { data, error } = await supabase.rpc("expire_testimonial_upload_intents", {
        p_limit: limit,
      });
      if (error) throw new Error("expiry failed");
      return data?.length ?? 0;
    },

    async listDeletable(limit) {
      const { data, error } = await supabase.rpc("list_deletable_testimonial_provider_assets", {
        p_environment: environment,
        p_limit: limit,
      });
      if (error || !data) return [];
      return data.map((row) => ({
        ledgerId: row.ledger_id,
        provider: row.provider,
        providerAssetId: row.provider_asset_id,
        reason: row.reason,
        deletionAttemptCount: row.deletion_attempt_count,
      }));
    },

    async markAttempt(ledgerId, status) {
      await supabase
        .rpc("mark_testimonial_provider_asset_deleted", {
          p_ledger_id: ledgerId,
          p_status: status,
        })
        .single();
    },

    deleteAsset(provider, providerAssetId) {
      // The ledger's own provider column decides, never the submission's.
      // Deleting a superseded asset must not depend on, or affect, the attempt
      // that replaced it.
      return provider === "cloudflare_images"
        ? deleteImage(providerAssetId)
        : deleteVideo(providerAssetId);
    },

    async listPurgeable(limit) {
      const { data, error } = await supabase.rpc("list_purgeable_testimonial_submissions", {
        p_environment: environment,
        p_limit: limit,
      });
      if (error || !data) return [];
      return data.map((row) => ({
        submissionId: row.submission_id,
        providerAssetsSeen: row.provider_assets_seen,
      }));
    },

    async recordPurged(submissionId, status) {
      const { error } = await supabase
        .rpc("record_testimonial_media_purged", {
          p_submission_id: submissionId,
          p_status: status,
        })
        .single();
      // The refusal path matters: the database raises 55000 when a provider
      // asset is still undeleted. Throwing here is what makes the core count
      // it as refused and leave the submission for the next run, rather than
      // recording a deletion that did not happen.
      if (error) throw new Error("purge refused");
    },

    log(event, code, ledgerId) {
      logProviderEvent({
        // A ledger id is our own opaque row identifier. A provider asset id, a
        // submission id and every contact field are deliberately absent.
        correlationId: ledgerId ?? "retention",
        provider: "cloudflare",
        event,
        code,
      });
    },

    now: () => Date.now(),
  };

  return runRetentionSweep(deps, deadlineMs);
}
