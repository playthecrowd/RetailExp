import { classifyIdentity, isAnonymousIdentity } from "@/lib/auth/identity";

/**
 * The rule that separates a Kameleon visitor passport from a permanent
 * account, in one place so the server action and the form cannot drift apart.
 *
 * Lives here rather than in app/experience/kameleon/actions.ts because a
 * `"use server"` module may only export async functions — a shared constant
 * exported from there is a build error, not a style preference.
 */

/**
 * Shown when an account that is not a confirmed anonymous visitor opens the
 * visitor flow.
 *
 * Deliberately neutral: it names no role, no client and no administrator
 * area, because the visitor experience is public and this message would
 * otherwise tell any passer-by that the signed-in account is privileged.
 */
export const PERMANENT_ACCOUNT_MESSAGE =
  "This account can't start a Kameleon visitor passport. Sign out and reopen the experience to continue as a guest.";

/**
 * A Kameleon visitor passport belongs to an explicitly anonymous identity and
 * nothing else.
 *
 * Requires `is_anonymous === true`. An identity whose anonymity cannot be
 * established — the property absent, null, or not a boolean — is refused a
 * passport rather than enrolled on a guess, which is the same fail-closed
 * posture the administrator boundary takes in the opposite direction (see
 * lib/auth/identity.ts for why the two directions cannot share one
 * expression).
 *
 * Without this, an administrator with a live session who opens the visitor
 * experience would be enrolled as a visitor: QuickAccount previously called
 * signInAnonymously() only when no session existed, so the administrator's
 * own session would be used, and their auth_user_id would end up on an
 * experience_users row carrying a name, email, phone number, journey progress
 * and reward entitlements.
 *
 * Nothing anywhere links, promotes or migrates an anonymous identity into a
 * permanent one; the two are kept entirely separate.
 */
export function isAnonymousVisitor(user: { is_anonymous?: boolean | null } | null | undefined): boolean {
  return isAnonymousIdentity(user);
}

/** Re-exported so callers that want to log or branch on the third state have
 *  it without reaching past this module. */
export { classifyIdentity };
