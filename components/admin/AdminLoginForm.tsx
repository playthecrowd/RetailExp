"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { signInAdminAction, type AdminLoginState } from "@/app/admin/actions";

const INITIAL: AdminLoginState = { error: null };

/**
 * The credential form. It holds no authorization logic of its own — it
 * collects two fields and hands them to a Server Action, which is where
 * authentication and authorization both actually happen. Anything this
 * component decided could be decided differently by a caller who never loads
 * it.
 *
 * The password field is uncontrolled: its value is never lifted into React
 * state, never round-tripped through a re-render, and never echoed back on
 * failure. On an error the browser simply re-renders the form with the field
 * as the user left it.
 */
export function AdminLoginForm({ next }: { next: string }) {
  const [state, formAction, pending] = useActionState(signInAdminAction, INITIAL);

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      {/* Already passed through resolveSafeAdminRedirect on the server before
          reaching this component, and validated again inside the action —
          a tampered value degrades to /admin rather than redirecting away. */}
      <input type="hidden" name="next" value={next} />

      <div className="flex flex-col gap-1.5">
        <label htmlFor="admin-email" className="text-sm font-medium">
          Email address
        </label>
        <input
          id="admin-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          autoFocus
          disabled={pending}
          aria-describedby={state.error ? "admin-login-error" : undefined}
          aria-invalid={state.error ? true : undefined}
          className="h-11 rounded-md border border-admin-border bg-admin-surface px-3 text-sm text-admin-text outline-none focus-visible:ring-2 focus-visible:ring-admin-primary disabled:opacity-50"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="admin-password" className="text-sm font-medium">
          Password
        </label>
        <input
          id="admin-password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          disabled={pending}
          aria-describedby={state.error ? "admin-login-error" : undefined}
          aria-invalid={state.error ? true : undefined}
          className="h-11 rounded-md border border-admin-border bg-admin-surface px-3 text-sm text-admin-text outline-none focus-visible:ring-2 focus-visible:ring-admin-primary disabled:opacity-50"
        />
      </div>

      {/* One message for every failure mode — see GENERIC_FAILURE in
          app/admin/actions.ts. role="alert" so it is announced rather than
          silently appearing. */}
      {state.error && (
        <p
          id="admin-login-error"
          role="alert"
          className="rounded-md bg-admin-danger-bg px-3 py-2 text-sm text-admin-danger"
        >
          {state.error}
        </p>
      )}

      <Button type="submit" loading={pending} fullWidth>
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
