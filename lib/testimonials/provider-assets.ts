import "server-only";

import { createSecretClient } from "@/lib/supabase/secret";
import { mediaEnvironment } from "@/lib/cloudflare/config";
import {
  createImageUploadDestination,
  deleteImage,
  IMAGES_UPLOAD_EXPIRY_MINUTES,
} from "@/lib/cloudflare/images";
import { createVideoUploadDestination, deleteVideo } from "@/lib/cloudflare/stream";
import type { CaptureMediaType } from "@/lib/testimonials/limits";
import {
  imagesRecoveryQuery,
  streamRecoveryQuery,
} from "@/lib/cloudflare/recovery-core";
import { runDestinationSequence } from "./destination-sequence";

/**
 * The reservation → provider → attachment sequence.
 *
 * THE ORPHAN WINDOW THIS EXISTS TO CLOSE
 *   Calling Cloudflare first and writing the ledger row afterwards means a
 *   crash between the two leaves a billable provider asset that nothing in
 *   our system knows about — invisible to cleanup, and indistinguishable
 *   later from a legitimate asset if a callback arrives for it.
 *
 *   So the order is: RESERVE (database) → CREATE (provider) → ATTACH
 *   (database). Every provider asset is therefore created against a row that
 *   already exists, and the only remaining failure — provider succeeded,
 *   attachment failed — is recoverable because we still hold the identifier
 *   in memory and delete it immediately.
 *
 * WHAT NEVER LEAVES THIS MODULE
 *   The one-time upload URL is returned to exactly one authorized caller and
 *   is never persisted, logged, or included in an error. The ledger has no
 *   column for it. Failure reasons written to the database are short
 *   sanitized codes.
 */

const PROVIDER_BY_MEDIA: Record<CaptureMediaType, "cloudflare_images" | "cloudflare_stream"> = {
  image: "cloudflare_images",
  video: "cloudflare_stream",
};

export interface UploadDestination {
  /** One-time. Hand straight to the caller; never store. */
  uploadUrl: string;
  expiresAt: string;
  transport: "multipart-post";
  fileFieldName: "file";
}

export type DestinationResult =
  | { ok: true; destination: UploadDestination }
  | { ok: false; reason: string };

/**
 * Sanitized operational logging.
 *
 * Deliberately narrow: a correlation id, the provider, and a safe code. Never
 * a raw body, payload, signature, secret, upload URL, playback token or
 * contact field. Every log site in the Phase 4C surface goes through here so
 * the rule is enforced in one place rather than remembered at each call.
 */
export function logProviderEvent(fields: {
  correlationId: string;
  provider: string;
  event: string;
  code?: string;
}): void {
  const { correlationId, provider, event, code } = fields;
  console.info(
    `[testimonial-provider] correlation=${correlationId} provider=${provider} event=${event}` +
      (code ? ` code=${code}` : ""),
  );
}

/**
 * Requests an upload destination for an existing intent.
 *
 * `visitorId` must already have been verified by the caller against the
 * visitor's own session. The reservation RPC re-resolves it anyway and
 * re-checks anonymity, ownership, both capture gates, the active consent
 * version, the lifecycle state and the attempt budget — this function trusts
 * the caller's claim no further than the database can verify it.
 */
export async function createUploadDestination(
  visitorId: string,
  submissionId: string,
  mediaType: CaptureMediaType,
): Promise<DestinationResult> {
  const supabase = createSecretClient();
  const environment = mediaEnvironment();
  const provider = PROVIDER_BY_MEDIA[mediaType];
  const expiresAt = new Date(Date.now() + IMAGES_UPLOAD_EXPIRY_MINUTES * 60_000);

  // The ordering and failure guarantees live in runDestinationSequence, which
  // takes every dependency as a parameter so each failure path can be driven
  // by a fake in scripts/verify-provider-integration.mjs. This function only
  // binds the real ones.
  const outcome = await runDestinationSequence(
    {
      async reserve() {
        const result = await supabase
          .rpc("reserve_testimonial_provider_attempt", {
            p_visitor_id: visitorId,
            p_submission_id: submissionId,
            p_provider: provider,
            p_environment: environment,
            p_expires_at: expiresAt.toISOString(),
          })
          .single();
        if (result.error || !result.data) return { ok: false };
        return {
          ok: true,
          ledgerId: result.data.ledger_id,
          opaqueReference: result.data.opaque_reference,
        };
      },

      createDestination(opaqueReference) {
        return mediaType === "image"
          ? createImageUploadDestination({ opaqueReference, environment, expiresAt })
          : createVideoUploadDestination({ opaqueReference, environment, expiresAt });
      },

      async attach(ledgerId, providerAssetId) {
        const result = await supabase
          .rpc("attach_testimonial_provider_asset", {
            p_ledger_id: ledgerId,
            p_provider: provider,
            p_provider_asset_id: providerAssetId,
          })
          .single();
        return { ok: !result.error && result.data !== null };
      },

      deleteAsset(providerAssetId) {
        return mediaType === "image" ? deleteImage(providerAssetId) : deleteVideo(providerAssetId);
      },

      async recordOrphan(ledgerId, providerAssetId, status) {
        const result = await supabase
          .rpc("record_orphaned_testimonial_provider_asset", {
            p_ledger_id: ledgerId,
            p_provider: provider,
            p_provider_asset_id: providerAssetId,
            p_deletion_status: status,
          })
          .single();
        return { ok: !result.error };
      },

      async markDeleted(ledgerId, status) {
        await supabase.rpc("mark_testimonial_provider_asset_deleted", {
          p_ledger_id: ledgerId,
          p_status: status,
        });
      },

      async failAttempt(ledgerId, reason) {
        await supabase.rpc("fail_testimonial_provider_attempt", {
          p_ledger_id: ledgerId,
          p_reason: reason,
        });
      },

      log(event, code) {
        logProviderEvent({ correlationId: "sequence", provider, event, code });
      },
    },
    expiresAt,
  );

  if (!outcome.ok) {
    // The visitor is told only that it did not work. The failure code
    // distinguishes an orphan for operators; it never reaches the browser.
    return { ok: false, reason: outcome.reason };
  }

  return {
    ok: true,
    destination: {
      uploadUrl: outcome.destination.uploadUrl,
      expiresAt: outcome.destination.expiresAt,
      transport: "multipart-post",
      fileFieldName: "file",
    },
  };
}

/**
 * Recovery for the ambiguous-timeout case.
 *
 * WHAT THIS SOLVES, AND WHAT IT DOES NOT
 *   If a create call times out, Cloudflare may have created an asset whose
 *   identifier never reached us. Nothing local can recover it, because we
 *   never held it. The opaque reference we generated BEFORE the call is the
 *   only thing both sides share, so recovery means asking the provider what it
 *   holds for that reference.
 *
 *   Both products document a filter that makes this possible:
 *     Stream  GET /accounts/{id}/stream?creator=<ref>
 *     Images  GET /accounts/{id}/images/v2?creator=<ref>
 *   Verified 18 August 2026. The Images list endpoint additionally documents
 *   `meta` filtering; `creator` is used for both because it is documented on
 *   both and needs no operator syntax.
 *
 *   This is therefore recoverable, not merely detectable — but only because we
 *   set `creator` at creation time. An asset created without one would be
 *   findable only by paging the whole account, which this does not attempt.
 *
 * Not implemented as a live call in this phase: no Cloudflare request is made
 * anywhere in Phase 4C. This is the contract the sweeper will use.
 */
export interface OrphanReconciliationPlan {
  ledgerId: string;
  provider: "cloudflare_images" | "cloudflare_stream";
  opaqueReference: string;
  /** The documented filter that locates an asset by our own reference. */
  lookup: { path: string; query: URLSearchParams };
}

export function planOrphanReconciliation(
  ledgerId: string,
  provider: "cloudflare_images" | "cloudflare_stream",
  opaqueReference: string,
): OrphanReconciliationPlan {
  return {
    ledgerId,
    provider,
    opaqueReference,
    lookup:
      provider === "cloudflare_stream"
        ? { path: "/stream", query: streamRecoveryQuery(opaqueReference) }
        : { path: "/images/v2", query: imagesRecoveryQuery(opaqueReference, null) },
  };
}
