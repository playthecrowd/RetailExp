import "server-only";

/**
 * The testimonial-capture feature gate.
 *
 * Server-only, and **default false when missing**. The variable holds no
 * secret — it is a switch, not a credential — but it is deliberately not
 * NEXT_PUBLIC_, because a flag the browser can read is a flag the browser can
 * be wrong about, and hiding a button is not access control.
 *
 * Two independent gates must BOTH be open before a visitor can create a
 * submission:
 *
 *   1. this environment variable, which is how Production stays closed until
 *      Cloudflare, Terms and Privacy are all genuinely finished;
 *   2. `experiences.testimonial_capture_enabled`, a per-experience column that
 *      the database RPCs check for themselves.
 *
 * The second is checked inside the RPCs themselves, so it does not depend on
 * this file being reached at all. The capture RPCs are granted to service_role
 * only and are unreachable from any browser role, but the database gate is
 * deliberately not justified by that grant: it is the control that still holds
 * if a future migration ever widens EXECUTE again. A gate that lives only in
 * application code would be bypassed by exactly that route.
 */

const FLAG = "KAMELEON_TESTIMONIAL_CAPTURE_ENABLED";

/**
 * True only for an explicit affirmative value.
 *
 * Anything else — unset, empty, "false", "0", "no", a typo, whitespace — is
 * off. Same fail-closed posture as the identity classification in
 * lib/auth/identity.ts: a flag whose value cannot be read as a clear yes is a
 * no, not a maybe.
 */
export function isTestimonialCaptureEnabled(): boolean {
  const raw = process.env[FLAG];
  if (typeof raw !== "string") return false;
  const value = raw.trim().toLowerCase();
  return value === "true" || value === "1";
}

/** Thrown when an action is invoked while capture is disabled. Carries no
 *  configuration detail — the browser learns only that it is unavailable. */
export const CAPTURE_DISABLED_MESSAGE =
  "Sharing your Kameleon story isn't available yet. Please check back soon.";
