import { redirect } from "next/navigation";
import { AdminLoginForm } from "@/components/admin/AdminLoginForm";
import { resolveAdminAccess } from "@/lib/auth/admin";
import { resolveSafeAdminRedirect } from "@/lib/auth/safe-redirect";

export const metadata = { title: "Sign in" };

/**
 * Public by construction: this page sits outside app/admin/(protected), so
 * the authorization gate in that layout never runs on it. That is what makes
 * the sign-in page reachable while signed out without any path-exemption
 * logic that could be got wrong.
 */
export const dynamic = "force-dynamic";

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const params = await searchParams;
  const rawNext = Array.isArray(params.next) ? params.next[0] : params.next;
  const next = resolveSafeAdminRedirect(rawNext);

  // An administrator who is already signed in has no reason to see a sign-in
  // form; send them straight through. Only a fully authorized session is
  // bounced — an anonymous visitor session must be able to reach this form,
  // which is the whole point of the admin area being reachable from a phone
  // that has already been through the Kameleon experience.
  const access = await resolveAdminAccess();
  if (access.status === "authorized") redirect(next);

  return (
    <main className="flex min-h-screen items-center justify-center bg-admin-bg px-4 py-12 text-admin-text">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-lg font-semibold tracking-wide">RetailExp Admin</h1>
          <p className="mt-1 text-sm text-admin-text-muted">
            Sign in with your administrator account.
          </p>
        </div>

        <AdminLoginForm next={next} />

        {/*
          No "create an account", "request access" or "forgot password" link.
          Administrator accounts are provisioned by the platform owner in the
          Supabase Dashboard — there is no self-service path into this area,
          and adding one here would be the single easiest way to undo the
          rest of this phase.
        */}
        <p className="mt-6 text-center text-xs text-admin-text-muted">
          Access is granted by the platform owner. Contact them if you need an account.
        </p>
      </div>
    </main>
  );
}
