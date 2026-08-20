import { requireAdminAccess } from "@/lib/auth/admin";
import { GiftingSimulationProvider } from "@/lib/gifting/simulation/store";
import { GiftingDashboard } from "@/components/gifting/Dashboard";

/**
 * The same simulation reached by its experience-scoped path, matching the breadcrumb the brief specifies: Experiences / Gifting Demo Client 1.
 *
 * INSIDE THE EXISTING GATE, DELIBERATELY
 *   This sits in the (protected) route group, so it inherits
 *   app/admin/(protected)/layout.tsx's gate — and it calls requireAdminAccess()
 *   again itself, which is this codebase's standing convention and the one
 *   scripts/verify-admin-auth.mjs enforces. The repeat is defence in depth and
 *   it is free, because resolveAdminAccess is request-cached.
 *
 *   Putting an ungated page under /admin would have been the easy way to make
 *   this reviewable, and it would have set a precedent that eventually gets
 *   copied onto a page holding real data. Reviewers without an admin session
 *   reach the same simulation through the prototype's own scenario selector at
 *   /experience/gifting-demo-client-1/demo, which is ungated because it holds
 *   nothing but fixtures.
 *
 * NO DATA LAYER
 *   Fixtures only. It runs no query, so it neither reads another tenant's rows
 *   nor requires the unapplied gifting migration.
 */
export const dynamic = "force-dynamic";

export const metadata = { title: "Gifting Demo" };

export default async function GiftingDemoExperienceDashboard() {
  await requireAdminAccess();
  return (
    <GiftingSimulationProvider>
      <GiftingDashboard />
    </GiftingSimulationProvider>
  );
}
