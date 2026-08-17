/**
 * The one place that decides whether a Supabase identity is anonymous,
 * permanent, or neither.
 *
 * WHY A THIRD STATE EXISTS
 *
 * `is_anonymous` is an optional property on the Supabase `User` object. It is
 * typed `boolean | undefined`, and it is absent from a user object whose JWT
 * or GoTrue response did not carry the claim. So a boolean test has three
 * possible inputs, not two, and which of them is safe depends entirely on
 * which way the question is being asked:
 *
 *   - The visitor flow REQUIRES anonymity. There, `=== true` is fail-closed:
 *     an absent flag means "don't enroll".
 *   - The admin boundary REQUIRES a permanent account. There, `!== true` is
 *     fail-OPEN: an absent flag would sail past the anonymity check and go on
 *     to be tested for membership.
 *
 * The same expression is therefore correct in one direction and a hole in the
 * other, which is exactly the kind of asymmetry that should not be re-derived
 * at each call site. Both directions are named explicitly below, and an
 * indeterminate identity is eligible for neither.
 */

export type IdentityKind = "anonymous" | "permanent" | "indeterminate";

/** Only the property this module reads — deliberately structural, so it can
 *  be exercised with hand-built objects that a real `User` type would not
 *  permit (a missing property, an explicit null, a wrong type). */
export interface IdentityLike {
  is_anonymous?: boolean | null;
}

/**
 * Classifies an identity by explicit value. Anything that is not exactly the
 * boolean `true` or exactly the boolean `false` — undefined, null, a missing
 * property, a truthy string, a null user — is `indeterminate` and qualifies
 * for nothing.
 */
export function classifyIdentity(user: IdentityLike | null | undefined): IdentityKind {
  if (!user) return "indeterminate";
  if (user.is_anonymous === true) return "anonymous";
  if (user.is_anonymous === false) return "permanent";
  return "indeterminate";
}

/**
 * True only for an explicitly permanent (non-anonymous) account.
 *
 * This is the administrator-boundary test. It requires `is_anonymous === false`
 * rather than merely `!== true`, so an unknown identity state is rejected
 * instead of being promoted to "not anonymous, therefore a real account".
 */
export function isPermanentIdentity(user: IdentityLike | null | undefined): boolean {
  return classifyIdentity(user) === "permanent";
}

/**
 * True only for an explicitly anonymous identity.
 *
 * This is the Kameleon visitor test. An indeterminate identity is refused a
 * visitor passport rather than being enrolled on a guess.
 */
export function isAnonymousIdentity(user: IdentityLike | null | undefined): boolean {
  return classifyIdentity(user) === "anonymous";
}
