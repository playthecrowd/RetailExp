import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isPermanentIdentity } from "@/lib/auth/identity";
import type { Database } from "@/lib/supabase/database.types";

/**
 * The single administrator authorization decision for the whole application.
 *
 * Every /admin route, layout and Server Action resolves access through this
 * module and nothing else. The reason for centralising it is not tidiness: a
 * second, slightly-different copy of "is this person an administrator" is the
 * usual way an admin area grows a hole, and the structural check in
 * scripts/verify-admin-auth.mjs fails the build if the membership/role query
 * appears anywhere outside this file.
 *
 * Runs entirely under the caller's own session with the publishable key, so
 * RLS applies exactly as it does for any other request — the secret-key
 * client (lib/supabase/secret.ts) is deliberately NOT used here. That is
 * possible because client_memberships_select_members is
 * `is_client_member(client_id) or is_platform_admin()` and both helpers are
 * SECURITY DEFINER, so a member can read their own membership row without
 * anything bypassing RLS.
 */

if (typeof window !== "undefined") {
  throw new Error("lib/auth/admin.ts must never be imported from client-side code.");
}

type MembershipRole = Database["public"]["Enums"]["membership_role"];

/** The Kameleon tenant. Not secret — it is the seeded client row, and it is
 *  already present in the seed migrations and the mock data. */
const KAMELEON_CLIENT_SLUG = "kameleon";

/** Only these two membership roles may reach the admin area. Editors and
 *  viewers are members of the client but are NOT administrators. */
const ADMIN_ROLES: readonly MembershipRole[] = ["owner", "admin"];

export type AdminAccess =
  /** No Supabase session at all. */
  | { status: "unauthenticated" }
  /**
   * A real session that is NOT a confirmed permanent account.
   *
   * Covers two cases, both rejected identically:
   *   - an Anonymous Sign-In identity (`is_anonymous === true`). Every
   *     Kameleon visitor holds one, and it carries the `authenticated`
   *     Postgres role, so "is the user logged in" is true for the entire
   *     public.
   *   - an identity whose anonymity cannot be established at all
   *     (`is_anonymous` absent, null, or not a boolean). Admission requires
   *     positive proof of a permanent account, so an unknown state is
   *     refused rather than assumed benign.
   */
  | { status: "anonymous" }
  /** A permanent account with no membership of the Kameleon client. This is
   *  also what a cross-client owner/admin resolves to: their membership is of
   *  a different tenant, so for Kameleon they have none. */
  | { status: "no-membership" }
  /** A Kameleon member whose role is below administrator (editor, viewer). */
  | { status: "insufficient-role"; role: MembershipRole }
  | {
      status: "authorized";
      userId: string;
      email: string | null;
      clientId: string;
      /** `platform-admin` when access came from profiles.is_platform_admin
       *  rather than from a membership row. */
      grantedBy: "platform-admin" | MembershipRole;
    };

/** Every non-authorized state, for exhaustive handling at call sites. */
export type AdminAccessDenied = Exclude<AdminAccess, { status: "authorized" }>;

/**
 * Resolves the caller's administrator access from scratch, every call.
 *
 * Never throws for an ordinary denial — the denial is a value, so a call site
 * cannot accidentally treat a thrown-and-swallowed error as success.
 *
 * This is the uncached implementation. Use it for anything that MUTATES or
 * that authenticates: a Server Action must decide on the state of the world
 * as it is when the action runs, not on a decision made earlier in the same
 * request. See resolveAdminAccess (cached) below for the rendering path.
 */
export async function resolveAdminAccessUncached(): Promise<AdminAccess> {
  const supabase = await createClient();

  // getUser(), never getSession(): getSession() returns whatever is in the
  // cookie without revalidating it, so a tampered or stale cookie could be
  // read as a live identity. getUser() validates against the Auth server.
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) return { status: "unauthenticated" };

  // Checked before anything else that could grant access, and expressed as a
  // POSITIVE requirement: admission needs `is_anonymous === false`, not merely
  // "not true".
  //
  // `is_anonymous` is optional on the Supabase User type (auth-js 2.112.0:
  // `is_anonymous?: boolean`), so undefined is a real runtime possibility, not
  // a hypothetical. Rejecting only `=== true` would let undefined, null or an
  // absent property fall straight through to the membership lookup — an
  // identity of unknown provenance being treated as a permanent account.
  // Requiring an explicit false makes the unknown case a denial.
  if (!isPermanentIdentity(user)) return { status: "anonymous" };

  // Platform administrators are authorized regardless of membership. Read
  // through the same SECURITY DEFINER function the RLS policies use, so the
  // application and the database can never disagree about who this is.
  const { data: isPlatformAdmin } = await supabase.rpc("is_platform_admin");

  const { data: client, error: clientError } = await supabase
    .from("clients")
    .select("id")
    .eq("slug", KAMELEON_CLIENT_SLUG)
    .maybeSingle();

  if (clientError || !client) {
    // Fail closed. If the tenant cannot be resolved we cannot prove
    // membership, so nobody is authorized — including a platform admin,
    // because there would be no client id to scope them to.
    return { status: "no-membership" };
  }

  if (isPlatformAdmin === true) {
    return {
      status: "authorized",
      userId: user.id,
      email: user.email ?? null,
      clientId: client.id,
      grantedBy: "platform-admin",
    };
  }

  const { data: membership, error: membershipError } = await supabase
    .from("client_memberships")
    .select("role")
    .eq("client_id", client.id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (membershipError || !membership) return { status: "no-membership" };

  // Membership activity is row existence: the current schema has no
  // active/status column, so revocation is deletion of the row. Approved for
  // this phase; revisit if a status column is ever added.
  if (!ADMIN_ROLES.includes(membership.role)) {
    return { status: "insufficient-role", role: membership.role };
  }

  return {
    status: "authorized",
    userId: user.id,
    email: user.email ?? null,
    clientId: client.id,
    grantedBy: membership.role,
  };
}

/**
 * Request-scoped deduplication of the SAME decision — not an extra check.
 *
 * React's `cache` memoises by argument list for the lifetime of one request,
 * so when the protected layout and the page beneath it both call this, the
 * second call returns the first call's result without re-querying. That is
 * the intended behaviour for rendering: one coherent decision for one page,
 * and no chance of a layout and its page disagreeing halfway through a
 * render. It must not be described as two independent verifications, because
 * it is one verification observed twice.
 *
 * The cache is per-request by construction — React creates a fresh cache for
 * each request — so a result can never outlive the request that produced it
 * or be observed by a different user.
 *
 * Rendering only. Anything that mutates state or authenticates must call
 * resolveAdminAccessUncached / requireFreshAdminAccess instead.
 */
export const resolveAdminAccess = cache(resolveAdminAccessUncached);

/** True when the denial should send the visitor to sign in rather than to the
 *  access-denied page. Signing in cannot help someone who is already signed
 *  in as the wrong person. */
export function deniedShouldSignIn(access: AdminAccessDenied): boolean {
  return access.status === "unauthenticated" || access.status === "anonymous";
}

/**
 * Enforces administrator access, redirecting on any denial. Returns the
 * authorized result so call sites get the user id and tenant without a
 * second lookup.
 *
 * `redirect()` throws a control-flow signal that React does not catch, so a
 * caller cannot proceed past this line unauthorized — there is no returned
 * "false" to forget to check.
 *
 * @param currentPath Optional path to return to after signing in. Passed
 *   through resolveSafeAdminRedirect at read time on the login page, so an
 *   unexpected value here can never become an open redirect.
 */
export async function requireAdminAccess(currentPath?: string) {
  const access = await resolveAdminAccess();
  return enforce(access, currentPath);
}

/**
 * The same enforcement for privileged Server Actions and mutations, resolved
 * fresh rather than from the request cache.
 *
 * A mutation must not inherit a decision computed for a render: the render
 * happened at a different moment, possibly before a sign-in, a sign-out or a
 * revoked membership. The extra round trip is the correct price for a write.
 *
 * Nothing calls this yet — the admin pages are read-only — but the moderation
 * dashboard's actions must, and having the uncached path exist and be tested
 * now means the first privileged mutation has the right helper to reach for
 * instead of the convenient wrong one.
 */
export async function requireFreshAdminAccess(currentPath?: string) {
  const access = await resolveAdminAccessUncached();
  return enforce(access, currentPath);
}

function enforce(access: AdminAccess, currentPath?: string) {
  if (access.status === "authorized") return access;

  if (deniedShouldSignIn(access)) {
    const next = currentPath ? `?next=${encodeURIComponent(currentPath)}` : "";
    redirect(`/admin/login${next}`);
  }

  redirect("/admin/access-denied");
}
