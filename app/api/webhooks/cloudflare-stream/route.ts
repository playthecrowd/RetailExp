import { nullableArgumentRpc } from "@/lib/testimonials/provider-rpc";
import { readBoundedBody } from "@/lib/cloudflare/body";
import { webhookConfigurationComplete } from "@/lib/cloudflare/config";
import { deriveEventId, verifyStreamWebhook } from "@/lib/cloudflare/webhook";
import { isStreamState, parsePctComplete } from "@/lib/cloudflare/stream";
import { logProviderEvent } from "@/lib/testimonials/provider-assets";
import { reconcileVideo } from "@/lib/testimonials/validation";

/**
 * The single account-level Stream webhook receiver.
 *
 * ONE ACCOUNT, ONE SUBSCRIPTION. Cloudflare's webhook API sets a single
 * `notificationUrl` per account, so Preview and Production cannot have
 * separate endpoints while sharing one account. This receiver therefore lives
 * on the stable Production domain and receives callbacks for BOTH
 * environments. That is safe because the receiving deployment never decides
 * the environment: the database stamps it from the ledger row that the
 * creating deployment wrote.
 *
 * WHAT "INERT" ACTUALLY MEANS HERE — stated precisely, because the earlier
 * wording overclaimed. This route is NOT permanently write-free. It performs
 * trusted progress and reconciliation writes as soon as three things are true:
 * a valid webhook secret is configured, the Stream subscription points at it,
 * and the ledger holds reservations to correlate against.
 *
 * It is inert TODAY for two separable reasons, and either one alone is enough:
 *   1. the Cloudflare configuration is absent, so it answers 503 without
 *      reading the request at all; and
 *   2. no reservations exist, so any callback that did arrive would resolve to
 *      an unknown asset and change nothing.
 *
 * Treat it as a live, security-critical endpoint from the moment a secret is
 * configured - not as a stub.
 *
 * NOT BEHIND AUTH. proxy.ts matches only /experience/kameleon/* and /admin/*,
 * so this path is already outside the session proxy — no exclusion is needed
 * and none was added. Cloudflare cannot present a session cookie, and the
 * signature is the authentication.
 *
 * RESPONSE MATRIX
 *   incomplete Cloudflare configuration     -> 503, request never read
 *   body over the byte cap                  -> 413, stream cancelled
 *   missing / malformed / invalid signature -> 403, zero writes
 *   stale timestamp                         -> 403, zero writes
 *   malformed payload (post-verification)   -> 400, zero transition writes
 *   unknown / superseded / deleted asset    -> 200, no transition
 *   duplicate of an accepted event          -> 200, idempotent no-op
 *   accepted                                -> 200
 *
 * NO DATABASE CALL HAPPENS until size, signature, timestamp and payload shape
 * have all passed. The first nullableArgumentRpc() call in this file is after every
 * one of those gates.
 *
 * LOGGING. Never the raw body, the full payload, the signature, the secret, an
 * upload URL, a playback token or any contact field. Only a correlation id,
 * the provider, a safe event name and a safe code.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Bounded so an oversized body cannot be buffered before verification. A
 *  Stream callback is a small JSON object; 64 KB is generous for it. */
const MAX_BODY_BYTES = 64 * 1024;

function json(status: number, body: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

export async function POST(request: Request): Promise<Response> {
  // FAIL CLOSED ON PARTIAL CONFIGURATION, before the request is even read.
  // A deployment holding some Cloudflare variables but not the webhook secret
  // cannot verify a signature, and must not answer as though it could.
  if (!webhookConfigurationComplete()) {
    logProviderEvent({
      correlationId: "unconfigured",
      provider: "cloudflare_stream",
      event: "webhook_unconfigured",
    });
    return json(503, { error: "unconfigured" });
  }

  // The RAW BYTES, read under a hard cap.
  //
  // Not request.text(): that buffers the entire body first and only then
  // measures it, so the cap would be a decision taken after already paying the
  // cost. readBoundedBody rejects an over-large declared Content-Length before
  // reading, and otherwise stops and cancels the stream the moment the limit
  // is crossed - so a missing, malformed or dishonest header changes nothing.
  const body = await readBoundedBody(request, MAX_BODY_BYTES);

  if (!body.ok) {
    logProviderEvent({
      correlationId: "unknown",
      provider: "cloudflare_stream",
      event: "webhook_rejected",
      code: body.reason,
    });
    return json(body.reason === "too_large" ? 413 : 400, {
      error: body.reason === "too_large" ? "payload_too_large" : "unreadable",
    });
  }

  const rawBody = body.bytes;

  // Bytes, never a re-serialized string: Cloudflare signs exactly what it
  // sent, and decoding round-trips can alter bytes.
  const verification = verifyStreamWebhook(rawBody, request.headers.get("Webhook-Signature"));

  if (!verification.ok) {
    // 403 matches Cloudflare's own documented example for a failed
    // verification. The reason code is logged; the body and header are not.
    logProviderEvent({
      correlationId: "unknown",
      provider: "cloudflare_stream",
      event: "webhook_rejected",
      code: verification.reason,
    });
    return json(403, { error: "forbidden" });
  }

  // ---- Only now may the payload be parsed --------------------------------
  let payload: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(rawBody));
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("not_an_object");
    }
    payload = parsed as Record<string, unknown>;
  } catch {
    logProviderEvent({
      correlationId: "unknown",
      provider: "cloudflare_stream",
      event: "webhook_malformed",
      code: "unparsable",
    });
    return json(400, { error: "malformed" });
  }

  const uid = typeof payload.uid === "string" ? payload.uid : null;
  const status = (payload.status ?? {}) as Record<string, unknown>;
  const state = isStreamState(status.state) ? status.state : null;
  const modified = typeof payload.modified === "string" ? payload.modified : "";

  if (uid === null || state === null) {
    logProviderEvent({
      correlationId: uid ?? "unknown",
      provider: "cloudflare_stream",
      event: "webhook_malformed",
      code: uid === null ? "missing_uid" : "unrecognized_state",
    });
    return json(400, { error: "malformed" });
  }

  // Stream echoes our opaque reference through `creator`. Without it the
  // callback cannot be correlated to an attempt, so nothing is written.
  const creator = typeof payload.creator === "string" ? payload.creator : null;
  const meta = (payload.meta ?? {}) as Record<string, unknown>;
  const reference = creator ?? (typeof meta.ref === "string" ? meta.ref : null);

  if (reference === null) {
    logProviderEvent({
      correlationId: uid,
      provider: "cloudflare_stream",
      event: "webhook_ignored",
      code: "no_reference",
    });
    return json(200, { status: "ignored" });
  }

  const supabase = nullableArgumentRpc();
  const eventId = deriveEventId(uid, state, modified);

  // Record processing state only. readyToStream alone must not validate;
  // pctComplete is checked during authenticated reconciliation below.
  const progress = await supabase
    .rpc("record_testimonial_provider_progress", {
      p_provider: "cloudflare_stream",
      p_provider_asset_id: uid,
      p_opaque_reference: reference,
      p_processing_status: state,
      p_error_code:
        typeof status.errorReasonCode === "string" ? status.errorReasonCode : null,
      p_event_id: eventId,
    })
    .single();

  // Unknown, superseded or deleted asset: acknowledge so the provider stops
  // retrying, but change nothing.
  if (progress.error || progress.data?.recorded !== true) {
    logProviderEvent({
      correlationId: uid,
      provider: "cloudflare_stream",
      event: "webhook_ignored",
      code: "unknown_or_superseded_asset",
    });
    return json(200, { status: "ignored" });
  }

  if (state === "error") {
    logProviderEvent({
      correlationId: uid,
      provider: "cloudflare_stream",
      event: "webhook_error_state",
      code: typeof status.errorReasonCode === "string" ? status.errorReasonCode : "unknown",
    });
    return json(200, { status: "recorded" });
  }

  // A ready callback is a PROMPT to reconcile, never the proof itself. The
  // authenticated GET is what establishes pctComplete and the trusted
  // metadata; a forged-but-somehow-signed payload could not shortcut it.
  if (state === "ready" && parsePctComplete(status.pctComplete) !== null) {
    const outcome = await reconcileVideo(uid, reference);
    logProviderEvent({
      correlationId: uid,
      provider: "cloudflare_stream",
      event: `reconcile_${outcome.status}`,
      code: "reason" in outcome ? outcome.reason : undefined,
    });
  }

  return json(200, { status: "ok" });
}

/** Anything other than POST is not a Cloudflare callback. */
export async function GET(): Promise<Response> {
  return json(405, { error: "method_not_allowed" });
}
