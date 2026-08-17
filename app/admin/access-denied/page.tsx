import { Button } from "@/components/ui/Button";
import { signOutAdminAction } from "@/app/admin/actions";

export const metadata = { title: "Access denied" };

/**
 * Also outside app/admin/(protected), so it cannot bounce back to itself.
 *
 * Deliberately says nothing about *why*: not whether the account exists, not
 * which role it holds, not whether it belongs to another client, not whether
 * a Kameleon membership was found at all. Someone who lands here learns only
 * that this account is not an administrator of this area.
 *
 * There is no authorization check on this page and there must not be one —
 * a check here is exactly how the access-denied page starts redirecting to
 * itself.
 */
export default function AdminAccessDeniedPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-admin-bg px-4 py-12 text-admin-text">
      <div className="w-full max-w-sm text-center">
        <h1 className="text-lg font-semibold">Access denied</h1>
        <p className="mt-2 text-sm text-admin-text-muted">
          This account does not have access to the RetailExp admin area.
        </p>

        <form action={signOutAdminAction} className="mt-6">
          <Button type="submit" variant="secondary" fullWidth>
            Sign in with a different account
          </Button>
        </form>
      </div>
    </main>
  );
}
