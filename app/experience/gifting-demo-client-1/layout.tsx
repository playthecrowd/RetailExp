import type { Metadata } from "next";
import { GiftingSimulationProvider } from "@/lib/gifting/simulation/store";

/**
 * The Gifting Demo Client 1 prototype.
 *
 * ISOLATION
 *   This route tree is outside proxy.ts's matcher, which is
 *   ["/experience/kameleon/:path*", "/admin/:path*"] — so nothing here passes
 *   through the Kameleon age gate, the Supabase session refresh, or the admin
 *   redirect, and none of those change to accommodate it. It touches no
 *   database, so it also builds and runs with the gifting migration unapplied.
 *
 *   The provider sits at the layout so the three entry routes below share one
 *   in-memory session; nothing is persisted anywhere.
 */
export const metadata: Metadata = {
  title: "Gifting Demo — Prototype",
  robots: { index: false, follow: false },
};

export default function GiftingDemoLayout({ children }: { children: React.ReactNode }) {
  return <GiftingSimulationProvider>{children}</GiftingSimulationProvider>;
}
