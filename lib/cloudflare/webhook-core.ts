import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Stream webhook signature verification — PURE.
 *
 * Deliberately has no `server-only` import and reads no configuration: the
 * secret is a parameter. That makes every branch reachable from a plain Node
 * test with fixtures, which is the only way the failure paths below are
 * genuinely exercised rather than assumed.
 *
 * Cloudflare documents (18 August 2026):
 *   https://developers.cloudflare.com/stream/manage-video-library/using-webhooks/
 *
 *   Header:    Webhook-Signature: time=1230811200,sig1=<hex>
 *   Algorithm: HMAC-SHA256, hex encoded
 *   Source:    "<time>" + "." + "<request body>"
 *   Body:      "Every byte in the request body must remain unaltered for
 *              successful signature verification."
 *   Compare:   "Preferably, use a constant-time comparison function."
 *
 * BYTES, NOT STRINGS. The body is taken as raw bytes and fed to the HMAC
 * without ever round-tripping through a string. Decoding to UTF-8 and back
 * can alter bytes for invalid sequences, and re-serializing parsed JSON
 * certainly does; either would break verification for a legitimate payload or,
 * worse, make an illegitimate one verify.
 */

/** Cloudflare recommends discarding stale timestamps but names no tolerance,
 *  so this value is ours. Five minutes each way covers clock skew and provider
 *  retry latency without leaving a usable replay window. */
export const WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS = 300;

export type WebhookRejection =
  | "missing_signature"
  | "malformed_signature"
  | "invalid_signature"
  | "stale_timestamp";

export type WebhookVerification =
  | { ok: true; timestamp: number }
  | { ok: false; reason: WebhookRejection };

export interface ParsedSignature {
  time: string;
  sig1: string;
}

/** Parses `time=...,sig1=...`, tolerating spacing and unknown future fields,
 *  and rejecting anything that is not a plain hex digest. */
export function parseSignatureHeader(header: string | null): ParsedSignature | null {
  if (typeof header !== "string" || header.length === 0 || header.length > 512) return null;

  let time: string | null = null;
  let sig1: string | null = null;

  for (const part of header.split(",")) {
    const separator = part.indexOf("=");
    if (separator <= 0) continue;
    const key = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (key === "time") time = value;
    else if (key === "sig1") sig1 = value;
  }

  if (time === null || sig1 === null) return null;
  if (!/^\d{1,15}$/.test(time)) return null;
  if (!/^[0-9a-f]{64}$/i.test(sig1)) return null;

  return { time, sig1 };
}

/** Constant-time comparison. Lengths are checked first because
 *  timingSafeEqual throws on a mismatch, and a digest's length is not secret. */
function constantTimeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/**
 * @param rawBody the EXACT bytes received — never a re-serialized object
 * @param signatureHeader the raw `Webhook-Signature` header value
 * @param secret the Stream webhook secret
 * @param nowSeconds injectable clock, so freshness is testable without waiting
 */
export function verifyStreamSignature(
  rawBody: Uint8Array,
  signatureHeader: string | null,
  secret: string,
  nowSeconds: number,
): WebhookVerification {
  if (signatureHeader === null || signatureHeader.trim().length === 0) {
    return { ok: false, reason: "missing_signature" };
  }

  const parsed = parseSignatureHeader(signatureHeader);
  if (parsed === null) {
    return { ok: false, reason: "malformed_signature" };
  }

  // Signature BEFORE freshness: both reject, but checking the signature first
  // means an unauthenticated caller learns nothing about our clock.
  const expected = createHmac("sha256", secret)
    .update(Buffer.from(`${parsed.time}.`, "utf8"))
    .update(rawBody)
    .digest("hex");

  if (!constantTimeEquals(expected, parsed.sig1.toLowerCase())) {
    return { ok: false, reason: "invalid_signature" };
  }

  const timestamp = Number.parseInt(parsed.time, 10);
  if (!Number.isFinite(timestamp)) {
    return { ok: false, reason: "malformed_signature" };
  }
  if (Math.abs(nowSeconds - timestamp) > WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS) {
    return { ok: false, reason: "stale_timestamp" };
  }

  return { ok: true, timestamp };
}

/**
 * A deterministic event identifier.
 *
 * Cloudflare documents no stable event id and no retry or duplicate-delivery
 * semantics for Stream webhooks, so idempotency cannot rely on the provider.
 * Deriving one from the fields that define the transition means a redelivery
 * of the same event produces the same id and is dropped, while a genuinely new
 * transition produces a new one.
 */
export function deriveEventId(uid: string, state: string, modified: string): string {
  return createHmac("sha256", "cloudflare-stream-event")
    .update(`${uid}.${state}.${modified}`, "utf8")
    .digest("hex");
}
