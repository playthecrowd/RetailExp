"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { resolveAdminAccessUncached } from "@/lib/auth/admin";
import { resolveSafeAdminRedirect } from "@/lib/auth/safe-redirect";

/**
 * Administrator sign-in and sign-out.
 *
 * There is deliberately no sign-up action, no password-reset action and no
 * invite action in this file. Administrator accounts are created by the
 * platform owner in the Supabase Dashboard; the application has no code path
 * that can mint one, which means a bug in this file cannot produce an
 * administrator.
 */

/** RFC 5321's maximum reverse-path length — matches the visitor enrollment
 *  action so the two surfaces agree on what an email can be. */
const MAX_EMAIL_LENGTH = 254;

/**
 * Every authentication failure returns this exact string.
 *
 * Wrong password, unknown address, unconfirmed address, rate-limited, and
 * "signed in fine but it turned out to be an anonymous identity" are all
 * indistinguishable to the caller. Anything more specific is an account
 * enumeration oracle: an attacker who can tell "no such user" from "wrong
 * password" can harvest valid administrator addresses without ever guessing
 * a password.
 */
const GENERIC_FAILURE = "Those sign-in details were not accepted.";

export interface AdminLoginState {
  error: string | null;
}

/**
 * Authenticates, then immediately authorizes.
 *
 * Authentication alone means nothing here: anonymous Kameleon visitors hold
 * the same `authenticated` role, and a permanent account with no Kameleon
 * membership is not an administrator. So a successful signInWithPassword is
 * followed by resolveAdminAccessUncached(), and anyone who fails it is signed back
 * out before being sent to the access-denied page — leaving an authenticated
 * session in place for someone who just failed authorization would hand them
 * a foothold for whatever gets built next.
 *
 * The password is read from FormData, passed straight to Supabase, and never
 * logged, returned, stored, or placed in a URL. It is not echoed back into
 * the form on failure either.
 */
export async function signInAdminAction(
  _previous: AdminLoginState,
  formData: FormData,
): Promise<AdminLoginState> {
  const rawEmail = formData.get("email");
  const rawPassword = formData.get("password");

  if (typeof rawEmail !== "string" || typeof rawPassword !== "string") {
    return { error: GENERIC_FAILURE };
  }

  const email = rawEmail.trim().toLowerCase();
  if (email.length === 0 || email.length > MAX_EMAIL_LENGTH || rawPassword.length === 0) {
    return { error: GENERIC_FAILURE };
  }

  // Read and validated before any redirect is issued. An invalid or hostile
  // value degrades to /admin rather than failing the sign-in.
  const destination = resolveSafeAdminRedirect(
    typeof formData.get("next") === "string" ? (formData.get("next") as string) : null,
  );

  const supabase = await createClient();

  const { error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password: rawPassword,
  });

  if (signInError) return { error: GENERIC_FAILURE };

  // Uncached deliberately. This request changed the identity partway through:
  // a request-cached decision could only have been computed BEFORE
  // signInWithPassword, i.e. for whoever held the session on arrival — an
  // anonymous visitor, or nobody. Authorizing the person who just signed in
  // requires resolving after the sign-in, from scratch.
  const access = await resolveAdminAccessUncached();

  if (access.status !== "authorized") {
    // Authenticated but not an administrator. Drop the session first, then
    // send them somewhere that explains it without revealing whether the
    // account exists, what role it holds, or which tenant it belongs to.
    await supabase.auth.signOut();
    redirect("/admin/access-denied");
  }

  redirect(destination);
}

/**
 * Clears the administrator session and returns to the sign-in page.
 *
 * signOut() revokes the refresh token server-side and clears the auth
 * cookies, so this is a real session teardown rather than a client-side
 * forget. Returning to /admin/login (not /admin) avoids an immediate
 * gate-and-redirect round trip.
 */
export async function signOutAdminAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/admin/login");
}
