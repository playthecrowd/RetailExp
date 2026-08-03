"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { KameleonFlowHeader } from "@/components/kameleon/FlowHeader";
import { SAMPLE_MODEL_URL, SAMPLE_MODEL_ANIMATIONS } from "@/lib/kameleon/ar/ar-types";

/**
 * Honest fallback for devices/browsers that can't run immersive ground-plane
 * WebXR AR here (or for a viewer who explicitly chose to skip it). Never
 * fakes scanning or ground detection — offers a real `<model-viewer>` 3D
 * preview instead, with native AR handoff (`webxr`/`scene-viewer`/
 * `quick-look`) enabled wherever the device/browser actually supports it.
 *
 * iOS note: Quick Look's AR mode requires a USDZ asset via `ios-src`, which
 * this prototype doesn't have (see docs/KAMELEON_AR_ASSET_MANIFEST.md) — so
 * on iOS this renders as a real, but non-AR, orbiting 3D preview. That's
 * disclosed in the copy below rather than implied to be full AR.
 */
export function ARUnsupportedFallback({
  reason,
  onTryAr,
  onContinue,
}: {
  reason: string;
  onTryAr: () => void;
  onContinue: () => void;
}) {
  const [modelViewerReady, setModelViewerReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    import("@google/model-viewer").then(() => {
      if (!cancelled) setModelViewerReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex flex-1 flex-col gap-6 px-6 pb-8">
      <KameleonFlowHeader
        steps={[
          { id: "commercial", label: "Commercial", status: "complete" },
          { id: "ar", label: "AR", status: "complete" },
          { id: "journey", label: "Journey", status: "current" },
        ]}
      />

      <div className="flex flex-1 flex-col items-center gap-4 text-center">
        <h1 className="font-display text-xl font-semibold uppercase tracking-wide text-kameleon-copper-light">
          Full ground-plane AR isn&apos;t available here
        </h1>
        <p className="max-w-xs text-sm text-kameleon-text-muted">{reason}</p>

        <div className="mt-2 aspect-square w-full max-w-xs overflow-hidden rounded-2xl border border-kameleon-border bg-kameleon-surface">
          {modelViewerReady ? (
            <model-viewer
              src={SAMPLE_MODEL_URL}
              alt="Sample animated prototype model"
              ar
              ar-modes="webxr scene-viewer quick-look"
              camera-controls
              auto-rotate
              autoplay
              animation-name={SAMPLE_MODEL_ANIMATIONS[0]}
              exposure="0.9"
              shadow-intensity="0.6"
              style={{ width: "100%", height: "100%", backgroundColor: "transparent" }}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-xs text-kameleon-text-muted">
              Loading 3D preview…
            </div>
          )}
        </div>
        <p className="max-w-xs text-[11px] text-kameleon-text-muted">
          This is the temporary prototype model (see the AR asset manifest) — drag to rotate. On
          supported Android devices, tap the AR icon for a native placement preview. iOS Quick
          Look AR requires a separate USDZ asset not yet included in this prototype, so this stays
          a 3D preview on iPhone.
        </p>
      </div>

      <div className="flex flex-col items-center gap-4">
        <Button brand="kameleon" size="lg" fullWidth onClick={onContinue}>
          Continue to journey
        </Button>
        <button
          type="button"
          onClick={onTryAr}
          className="text-sm font-medium text-kameleon-copper-light underline-offset-4 hover:underline"
        >
          Try AR again
        </button>
      </div>
    </div>
  );
}
