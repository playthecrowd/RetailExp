import "server-only";

import { nullableArgumentRpc } from "./provider-rpc";
import { mediaEnvironment } from "@/lib/cloudflare/config";
import { getImageDetails } from "@/lib/cloudflare/images";
import { getVideoDetails } from "@/lib/cloudflare/stream";
import { logProviderEvent } from "./provider-assets";

/**
 * Trusted provider validation.
 *
 * Nothing here accepts a value that originated in a browser, and nothing here
 * decides the environment. The environment is stamped by the database FROM
 * THE LEDGER ROW; validate_testimonial_provider_asset takes no environment
 * argument, so there is no parameter through which a wrong environment could
 * be introduced — not by a provider payload, and not by a bug in this file.
 *
 * What this file DOES check about the environment is agreement: the metadata
 * Cloudflare hands back must match this deployment's configured environment.
 * A mismatch means the asset belongs to the other environment's deployment,
 * and validation stops without touching the database.
 */

export type ValidationOutcome =
  | { status: "validated"; submissionId: string; environment: string }
  | { status: "processing"; reason: string }
  | { status: "ignored"; reason: string }
  | { status: "failed"; reason: string };

/**
 * Metadata Cloudflare echoes back.
 *
 * The parameter is an arbitrary JSON object because that is genuinely what the
 * provider returns — narrowing it to a hand-written shape here would assert a
 * guarantee Cloudflare does not give. It is read defensively and every field
 * is type-checked before use. This is untrusted-input parsing, NOT a way of
 * bypassing a generated database type: no RPC result passes through it.
 */
function readMetadata(raw: Record<string, unknown>): { ref: string | null; env: string | null } {
  const ref = typeof raw.ref === "string" ? raw.ref : null;
  const env = typeof raw.env === "string" ? raw.env : null;
  return { ref, env };
}

/**
 * IMAGES — authenticated polling only.
 *
 * The unsigned Images webhook is not consumed anywhere in this codebase.
 * Cloudflare documents that it fires but publishes no payload schema, no
 * signature header, no algorithm and no retry semantics, so it cannot be
 * verified and must never reach a database write.
 *
 * Required, all of them:
 *   - the exact attached image id
 *   - provider-held opaque reference matching the ledger
 *   - provider-held environment matching this deployment
 *   - `draft` ABSENT (Cloudflare removes it once the creator has uploaded)
 *   - requireSignedURLs true
 *   - a current, non-superseded ledger attempt (enforced by the RPC)
 *   - an eligible submission lifecycle (enforced by the RPC)
 */
export async function reconcileImage(
  providerAssetId: string,
  opaqueReference: string,
): Promise<ValidationOutcome> {
  const environment = mediaEnvironment();

  let details;
  try {
    details = await getImageDetails(providerAssetId);
  } catch {
    return { status: "processing", reason: "provider_unreachable" };
  }

  if (details.id !== providerAssetId) {
    return { status: "ignored", reason: "identifier_mismatch" };
  }

  const { ref, env } = readMetadata(details.metadata);
  if (ref !== opaqueReference) {
    return { status: "ignored", reason: "reference_mismatch" };
  }
  if (env !== environment) {
    return { status: "ignored", reason: "environment_mismatch" };
  }

  // The authoritative "the image exists" signal.
  if (details.draft) {
    return { status: "processing", reason: "draft_not_cleared" };
  }
  if (!details.requireSignedURLs) {
    return { status: "failed", reason: "signed_urls_not_required" };
  }

  const supabase = nullableArgumentRpc();
  const result = await supabase
    .rpc("validate_testimonial_provider_asset", {
      p_provider: "cloudflare_images",
      p_provider_asset_id: providerAssetId,
      p_opaque_reference: opaqueReference,
      p_signed_urls_required: true,
      // Cloudflare Images documents no size, dimensions or duration on the
      // details response, so these stay null. The base table's CHECK requires
      // them for video only, which matches the provider's actual asymmetry.
      p_size_bytes: null,
      p_duration_seconds: null,
      p_width: null,
      p_height: null,
      p_processing_status: "uploaded",
      p_event_id: null,
    })
    .single();

  // Narrowed, not asserted. The RPC returns NULL for both fields on its
  // not-found and not-eligible branches, and the compatibility layer types
  // them that way, so the null case is handled rather than cast away.
  const row = result.data;
  if (result.error || row === null || !row.validated) {
    return { status: "ignored", reason: "not_validatable" };
  }
  if (row.submission_id === null || row.environment_marker === null) {
    return { status: "ignored", reason: "incomplete_validation_result" };
  }

  logProviderEvent({
    correlationId: row.submission_id,
    provider: "cloudflare_images",
    event: "validated",
  });

  return {
    status: "validated",
    submissionId: row.submission_id,
    environment: row.environment_marker,
  };
}

/**
 * STREAM — authenticated reconciliation.
 *
 * A signed webhook may record processing state, but it must NOT mark a
 * submission valid on readyToStream alone: Cloudflare documents that a video
 * in `ready` "may still be encoding certain quality levels until the
 * pctComplete reaches 100". Since every submission passes human moderation
 * afterwards, there is no latency argument for accepting a partial encode.
 *
 * Required, all of them:
 *   - the exact active ledger asset (enforced by the RPC)
 *   - creator/metadata reference matching the ledger
 *   - environment metadata matching this deployment
 *   - readyToStream === true
 *   - status.state === "ready"
 *   - pctComplete === 100, parsed safely
 *   - trusted size, duration, width and height all present
 *   - requireSignedURLs true
 *   - recognized state and error values only
 */
export async function reconcileVideo(
  providerAssetId: string,
  opaqueReference: string,
): Promise<ValidationOutcome> {
  const environment = mediaEnvironment();

  let video;
  try {
    video = await getVideoDetails(providerAssetId);
  } catch {
    return { status: "processing", reason: "provider_unreachable" };
  }

  if (video.uid !== providerAssetId) {
    return { status: "ignored", reason: "identifier_mismatch" };
  }

  const { ref, env } = readMetadata(video.meta);
  // Stream echoes the reference through `creator` as well as `meta`; either
  // proving the match is sufficient, but one of them must.
  if (ref !== opaqueReference && video.creator !== opaqueReference) {
    return { status: "ignored", reason: "reference_mismatch" };
  }
  if (env !== environment) {
    return { status: "ignored", reason: "environment_mismatch" };
  }

  if (video.state === null) {
    return { status: "ignored", reason: "unrecognized_state" };
  }
  if (video.state === "live-inprogress") {
    return { status: "ignored", reason: "unsupported_state" };
  }
  if (video.state === "error") {
    return { status: "failed", reason: video.errorReasonCode ?? "provider_error" };
  }
  if (video.state !== "ready" || !video.readyToStream) {
    return { status: "processing", reason: video.state };
  }

  // The explicit full-quality decision.
  if (video.pctComplete === null || video.pctComplete < 100) {
    return { status: "processing", reason: "encoding_incomplete" };
  }

  if (!video.requireSignedURLs) {
    return { status: "failed", reason: "signed_urls_not_required" };
  }

  if (
    video.durationSeconds === null ||
    video.sizeBytes === null ||
    video.width === null ||
    video.height === null
  ) {
    return { status: "processing", reason: "trusted_metadata_incomplete" };
  }

  const supabase = nullableArgumentRpc();
  const result = await supabase
    .rpc("validate_testimonial_provider_asset", {
      p_provider: "cloudflare_stream",
      p_provider_asset_id: providerAssetId,
      p_opaque_reference: opaqueReference,
      p_signed_urls_required: true,
      p_size_bytes: video.sizeBytes,
      p_duration_seconds: video.durationSeconds,
      p_width: video.width,
      p_height: video.height,
      p_processing_status: video.state,
      p_event_id: null,
    })
    .single();

  const row = result.data;
  if (result.error || row === null || !row.validated) {
    return { status: "ignored", reason: "not_validatable" };
  }
  if (row.submission_id === null || row.environment_marker === null) {
    return { status: "ignored", reason: "incomplete_validation_result" };
  }

  logProviderEvent({
    correlationId: row.submission_id,
    provider: "cloudflare_stream",
    event: "validated",
  });

  return {
    status: "validated",
    submissionId: row.submission_id,
    environment: row.environment_marker,
  };
}
