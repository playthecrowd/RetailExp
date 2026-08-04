"use client";

import dynamic from "next/dynamic";
import { LoadingState } from "@/components/ui/states";

/**
 * `next/dynamic(..., { ssr: false })` is only allowed inside a Client
 * Component in this Next.js version (confirmed via a real build error,
 * not assumed) — the server-component route page
 * (app/experience/kameleon/ar-snap-test/page.tsx) renders this small
 * client wrapper instead of calling `dynamic()` itself.
 */
const SnapArTestScreen = dynamic(
  () => import("@/components/kameleon/ar/SnapArTestScreen").then((m) => m.SnapArTestScreen),
  {
    ssr: false,
    loading: () => (
      <div className="flex flex-1 items-center justify-center">
        <LoadingState brand="kameleon" message="Loading AR test…" />
      </div>
    ),
  },
);

export function SnapArTestClientLoader() {
  return <SnapArTestScreen />;
}
