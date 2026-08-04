import type { Metadata } from "next";
import { SnapArTestClientLoader } from "@/components/kameleon/ar/SnapArTestClientLoader";
import { getSnapCameraKitConfigStatus } from "@/lib/kameleon/ar/snap-camera-kit-config";

export const metadata: Metadata = {
  title: "Kameleon — Snap Camera Kit (test)",
};

/**
 * Isolated Phase 5B evaluation route, deliberately separate from the
 * production Kameleon AR experience (app/experience/kameleon/page.tsx,
 * unchanged and untouched by this route). Nested under
 * app/experience/kameleon/layout.tsx like every other Kameleon screen, so
 * it inherits the same mobile frame/safe-area/font setup for free.
 */
export default function ArSnapTestPage() {
  const status = getSnapCameraKitConfigStatus();

  if (!status.configured) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-xs uppercase tracking-widest text-kameleon-text-muted">
          Phase 5B — Snap Camera Kit evaluation (isolated test route)
        </p>
        <p className="font-display text-lg font-semibold uppercase tracking-wide text-kameleon-copper-light">
          Snap Camera Kit configuration pending.
        </p>
        <p className="max-w-xs text-xs text-kameleon-text-muted">
          This page will remain inactive until the project owner sets the required values in a
          local, git-ignored <code>.env.local</code> file.
        </p>
      </div>
    );
  }

  return <SnapArTestClientLoader />;
}
