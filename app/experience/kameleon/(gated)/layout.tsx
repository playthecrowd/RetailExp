import { requirePilotAccess } from "@/lib/pilot/gate";

/**
 * The stakeholder gate, enforced for everything beneath it.
 *
 * A ROUTE GROUP, NOT A CHECK IN EVERY PAGE. `(gated)` changes no URL — the
 * experience is still /experience/kameleon and the Gallery is still
 * /experience/kameleon/gallery — but it makes the gate structural: a page
 * added inside this folder is gated because of where it lives, not because
 * somebody remembered a line. The admin area uses the same shape for the same
 * reason, in app/admin/(protected).
 *
 * The gate page itself sits OUTSIDE this group, at
 * app/experience/kameleon/access, which is what stops the redirect from
 * pointing at a route that would redirect again.
 *
 * WHY THIS AND NOT proxy.ts ALONE. The proxy redirect is an optimistic
 * pre-filter that runs on prefetches and must stay cheap. This is the boundary
 * — the same division proxy.ts already documents for /admin. Deleting the
 * proxy redirect would cost a redirect; deleting this would open the
 * evaluation to anyone with the URL.
 *
 * The experience's own chrome stays in the parent layout, so the gate page
 * inherits the same styling without inheriting the gate.
 */
export default async function GatedKameleonLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requirePilotAccess();
  return <>{children}</>;
}
