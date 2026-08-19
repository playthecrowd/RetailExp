import "server-only";

import { createSecretClient } from "@/lib/supabase/secret";
import { logProviderEvent } from "./provider-assets";
import { reconcileImage, reconcileVideo } from "./validation";

/**
 * Upload finalization.
 *
 * THE GAP THIS CLOSES
 *   A video reaches validation through the signed Stream webhook. A PHOTO had
 *   no path at all: reconcileImage() has existed since Phase 4C with no
 *   caller, because Cloudflare Images publishes no webhook this codebase can
 *   verify — no payload schema, no signature header, no algorithm, no retry
 *   semantics — and an unverifiable callback must never reach a database
 *   write. So an image submission stayed 'initiated' until it expired, and
 *   photo capture could not complete. That is the single largest hole in the
 *   capture chain.
 *
 * THE BROWSER IS A PROMPT, NEVER EVIDENCE
 *   This is called after the browser's own POST to Cloudflare returns. That
 *   claim is treated as nothing more than "it is worth looking now": the
 *   actual decision is made by reconcileImage/reconcileVideo, which perform an
 *   AUTHENTICATED read from Cloudflare and check the reference, the
 *   environment, the draft state and the signed-URL requirement before the
 *   database is touched. A browser that lies about having uploaded gets a
 *   provider lookup that disagrees with it.
 *
 * WHAT NEVER REACHES THE BROWSER
 *   The provider asset id and the opaque reference are read here and used
 *   here. The caller learns one of three words. A failure reason is logged,
 *   never returned — the visitor cannot act on "environment_mismatch" and an
 *   attacker should not be handed it.
 */

export type FinalizeState = "validated" | "processing" | "failed";

/**
 * @param visitorId already verified against the visitor's own session by the
 *        caller. Re-checked here against the submission's owner, so a verified
 *        identity still cannot finalize somebody else's upload.
 */
export async function finalizeUpload(
  visitorId: string,
  submissionId: string,
): Promise<FinalizeState> {
  const supabase = createSecretClient();

  // OWNERSHIP FIRST. Both predicates in one query, so there is no window in
  // which the submission is fetched and then checked — and the same answer is
  // returned for "no such submission" and "not yours", so this cannot be used
  // to discover which ids exist.
  const submission = await supabase
    .from("testimonial_submissions")
    .select("id, upload_status, validation_status")
    .eq("id", submissionId)
    .eq("auth_user_id", visitorId)
    .maybeSingle();

  if (submission.error || submission.data === null) return "failed";

  // Already settled. Re-running validation would be harmless — the RPC is
  // idempotent — but answering from the row we already hold saves a provider
  // round trip on every duplicate call, and duplicates are expected: this runs
  // on a browser retry loop.
  if (submission.data.validation_status === "valid") return "validated";
  if (submission.data.validation_status !== "pending") return "failed";
  if (submission.data.upload_status === "abandoned") return "failed";

  // The ACTIVE attempt, defined exactly as the one-active partial unique index
  // defines it. A superseded attempt from an earlier retry must never be the
  // one finalized: its asset is scheduled for deletion.
  const attempt = await supabase
    .from("testimonial_provider_assets")
    .select("provider, provider_asset_id, opaque_reference, media_type")
    .eq("submission_id", submissionId)
    .not("attached_at", "is", null)
    .is("superseded_at", null)
    .is("failed_at", null)
    .is("deleted_at", null)
    .maybeSingle();

  if (attempt.error || attempt.data === null) return "failed";

  const { provider_asset_id: assetId, opaque_reference: reference, media_type: mediaType } =
    attempt.data;

  // provider_asset_id is nullable in the schema: a reservation exists before
  // the provider call returns. A reservation with no asset id simply has
  // nothing to reconcile yet.
  if (assetId === null) return "processing";

  const outcome =
    mediaType === "image"
      ? await reconcileImage(assetId, reference)
      : await reconcileVideo(assetId, reference);

  logProviderEvent({
    // The ledger's own opaque reference, not the submission id and not the
    // provider asset id.
    correlationId: reference,
    provider: attempt.data.provider,
    event: `finalize_${outcome.status}`,
    code: "reason" in outcome ? outcome.reason : undefined,
  });

  if (outcome.status === "validated") return "validated";
  // `processing` is the only state worth retrying: the provider has the asset
  // but has not finished with it. `ignored` means the attempt is not eligible
  // — superseded, already moderated, wrong environment — and retrying would
  // spin for ever.
  if (outcome.status === "processing") return "processing";
  return "failed";
}
