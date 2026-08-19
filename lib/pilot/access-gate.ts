import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * The stakeholder access gate — PURE.
 *
 * No `server-only`, no configuration read: the code arrives as a parameter, so
 * every branch is reachable from a plain Node test. Same shape as
 * lib/cloudflare/webhook-core.ts and lib/testimonials/retention-core.ts.
 *
 * WHAT THIS IS FOR
 *   The evaluation is a CLOSED pilot. /experience/kameleon/* has never had any
 *   authorization at all — proxy.ts gates /admin only — so the experience and
 *   the Gallery were reachable by anyone with the URL.
 *
 * WHY NOT VERCEL DEPLOYMENT PROTECTION
 *   It would also block POST /api/webhooks/cloudflare-stream on the Production
 *   domain, and Cloudflare cannot present a bypass header. The gate has to be
 *   application-level and must not cover /api/*, which the proxy matcher
 *   already excludes.
 *
 * WHAT IS STORED IN THE BROWSER
 *   Not the code. The cookie holds an HMAC derived FROM the code, so a stolen
 *   cookie does not reveal the shared secret, and rotating the code
 *   invalidates every outstanding cookie at once with no server-side state to
 *   clear. That is the entire reason this is a derivation rather than a flag:
 *   `unlocked=1` would survive a rotation and could be set by hand.
 *
 * WHAT THIS IS NOT
 *   One shared code is not per-person authentication and cannot be. It gates
 *   access to the evaluation; it identifies nobody, and nothing downstream
 *   treats it as identity. Visitor identity remains the anonymous Supabase
 *   session, and administrator authority remains lib/auth/admin.ts.
 */

export const PILOT_COOKIE_NAME = "kameleon_pilot_access";

/** Long enough that a stakeholder is not re-prompted mid-evaluation, short
 *  enough that access does not outlive the pilot by months. */
export const PILOT_COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

/** Domain separation, so the derived value cannot be reused as any other
 *  HMAC this codebase computes. */
const COOKIE_PURPOSE = "kameleon-pilot-access-v1";

/** Bounds what a caller may submit, so an enormous body cannot be pushed
 *  through the comparison path. */
export const MAX_SUBMITTED_CODE_LENGTH = 256;

function constantTimeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/** True only when a usable code is configured. */
export function pilotGateConfigured(code: string | null | undefined): boolean {
  return typeof code === "string" && code.trim().length > 0;
}

/** The value written to the cookie. Deterministic, so verification needs no
 *  stored state. */
export function derivePilotCookie(code: string): string {
  return createHmac("sha256", code.trim()).update(COOKIE_PURPOSE, "utf8").digest("hex");
}

/**
 * Whether a submitted code opens the gate.
 *
 * Compared in constant time and trimmed on both sides — a stakeholder pasting
 * a code out of an email brings whitespace with it, and refusing that would
 * produce support traffic without buying any security.
 */
export function submittedCodeMatches(
  submitted: string | null | undefined,
  code: string | null | undefined,
): boolean {
  if (!pilotGateConfigured(code)) return false;
  if (typeof submitted !== "string") return false;
  if (submitted.length > MAX_SUBMITTED_CODE_LENGTH) return false;
  return constantTimeEquals(submitted.trim(), (code as string).trim());
}

/**
 * Whether a request's cookie opens the gate.
 *
 * FAILS CLOSED WHEN UNCONFIGURED, and that is a deliberate operational choice
 * rather than an oversight. This is a closed evaluation: a deployment that has
 * lost its access code must become unreachable, not public. The consequence is
 * that KAMELEON_PILOT_ACCESS_CODE has to be set before deploying, or the
 * experience answers with the gate for everyone.
 */
export function cookieUnlocksPilot(
  cookieValue: string | null | undefined,
  code: string | null | undefined,
): boolean {
  if (!pilotGateConfigured(code)) return false;
  if (typeof cookieValue !== "string" || cookieValue.length === 0) return false;
  return constantTimeEquals(cookieValue, derivePilotCookie(code as string));
}
