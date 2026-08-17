"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/Button";
import { signOutAdminAction } from "@/app/admin/actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="secondary" size="sm" loading={pending}>
      {pending ? "Signing out…" : "Sign out"}
    </Button>
  );
}

/**
 * A form posting to a Server Action rather than a client-side
 * supabase.auth.signOut(): the session cookies are httpOnly and set by the
 * server, so clearing them has to happen there too. A browser-side sign-out
 * would leave the server-side session cookie intact.
 */
export function AdminSignOutButton() {
  return (
    <form action={signOutAdminAction}>
      <SubmitButton />
    </form>
  );
}
