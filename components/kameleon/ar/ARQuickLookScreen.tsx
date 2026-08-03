"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { KameleonFlowHeader } from "@/components/kameleon/FlowHeader";
import { CheckCircleIcon } from "@/components/kameleon/icons";
import { SAMPLE_MODEL_URL, SAMPLE_MODEL_USDZ_URL } from "@/lib/kameleon/ar/ar-types";

/**
 * iPhone/iPad AR path: Apple AR Quick Look, launched via a plain
 * `<a rel="ar" href="....usdz">` — the standards-based mechanism WebKit
 * (Safari, and every other iOS browser, which all run on WebKit per Apple's
 * App Store policy) intercepts to open the native camera-based AR viewer.
 * Deliberately not routed through model-viewer's own built-in AR button —
 * the correction explicitly calls for one obvious, custom launch action
 * rather than a small icon the user has to find.
 */
export function ARQuickLookScreen({
  onEnterJourney,
  onSkipAr,
}: {
  onEnterJourney: () => void;
  onSkipAr: () => void;
}) {
  const [viewedAR, setViewedAR] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [modelViewerReady, setModelViewerReady] = useState(false);
  const arLinkRef = useRef<HTMLAnchorElement | null>(null);

  useEffect(() => {
    const anchor = arLinkRef.current;
    if (!anchor) return;
    const handleEndFullscreen = () => setViewedAR(true);
    // `webkitendfullscreen` is the WebKit-specific event AR Quick Look fires
    // on the triggering anchor when the user dismisses it — there is no
    // standardized cross-browser equivalent for "AR Quick Look was closed".
    anchor.addEventListener("webkitendfullscreen", handleEndFullscreen);
    return () => anchor.removeEventListener("webkitendfullscreen", handleEndFullscreen);
  }, []);

  useEffect(() => {
    if (!showPreview || modelViewerReady) return;
    let cancelled = false;
    import("@google/model-viewer").then(() => {
      if (!cancelled) setModelViewerReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [showPreview, modelViewerReady]);

  return (
    <div className="flex flex-1 flex-col gap-4 px-6 pb-6">
      <KameleonFlowHeader
        steps={[
          { id: "commercial", label: "Commercial", status: "complete" },
          { id: "ar", label: "AR", status: "current" },
          { id: "journey", label: "Journey", status: "upcoming" },
        ]}
      />

      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
        {viewedAR ? (
          <>
            <CheckCircleIcon className="h-8 w-8 text-kameleon-copper-light" />
            <h1 className="font-display text-xl font-semibold uppercase tracking-wide text-kameleon-copper-light">
              AR experience viewed
            </h1>
            <p className="max-w-xs text-sm text-kameleon-text-muted">
              You explored the Kameleon prototype in your space using Apple AR Quick Look.
            </p>
          </>
        ) : (
          <>
            <h1 className="font-display text-xl font-semibold uppercase tracking-wide text-kameleon-copper-light">
              Place the experience in your space
            </h1>
            <p className="max-w-xs text-sm text-kameleon-text-muted">
              Tap below to open the camera, find a surface, and place the Kameleon prototype.
            </p>
          </>
        )}

        {showPreview && (
          <div className="mt-1 aspect-square w-full max-w-[200px] overflow-hidden rounded-2xl border border-kameleon-border bg-kameleon-surface">
            {modelViewerReady ? (
              <model-viewer
                src={SAMPLE_MODEL_URL}
                alt="Sample prototype model"
                camera-controls
                auto-rotate
                autoplay
                animation-name="Survey"
                style={{ width: "100%", height: "100%", backgroundColor: "transparent" }}
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-xs text-kameleon-text-muted">
                Loading…
              </div>
            )}
          </div>
        )}

        <p className="mt-1 max-w-xs text-[11px] text-kameleon-text-muted">
          iPhone uses Apple AR Quick Look — a native, camera-based placement view outside the
          browser page. Supported Android devices use an embedded WebXR view instead. Both place
          the object on a real surface using your camera; only the controls and presentation
          differ.
        </p>
      </div>

      <div className="flex shrink-0 flex-col items-center gap-3">
        {viewedAR ? (
          <Button brand="kameleon" size="lg" fullWidth onClick={onEnterJourney}>
            Enter the Journey
          </Button>
        ) : (
          <a
            ref={arLinkRef}
            rel="ar"
            href={SAMPLE_MODEL_USDZ_URL}
            className="flex min-h-11 w-full items-center justify-center rounded-full bg-kameleon-copper-light px-6 py-3 text-center text-sm font-semibold uppercase tracking-wide text-kameleon-bg transition-colors hover:bg-kameleon-copper"
          >
            Open AR on iPhone
          </a>
        )}

        <button
          type="button"
          onClick={() => setShowPreview((v) => !v)}
          className="text-sm font-medium text-kameleon-copper-light underline-offset-4 hover:underline"
        >
          {showPreview ? "Hide 3D preview" : "View 3D preview"}
        </button>

        {!viewedAR && (
          <button
            type="button"
            onClick={onSkipAr}
            className="text-xs text-kameleon-text-muted underline-offset-4 hover:underline"
          >
            Continue without AR
          </button>
        )}
      </div>
    </div>
  );
}
