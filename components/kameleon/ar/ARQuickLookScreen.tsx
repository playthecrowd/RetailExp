"use client";

import { useEffect, useRef, useState } from "react";
import { KameleonFlowHeader } from "@/components/kameleon/FlowHeader";
import { SAMPLE_MODEL_USDZ_URL } from "@/lib/kameleon/ar/ar-types";

/** How long to wait after tapping the AR button before assuming Quick Look never actually opened. */
const LAUNCH_TIMEOUT_MS = 2500;

/**
 * Apple's documented custom-action banner for AR Quick Look: these keys, in
 * the USDZ link's URL *fragment* (not query string), make Quick Look show a
 * bottom banner with our own call-to-action button instead of just a close
 * button. Tapping that button dispatches a `message` event carrying
 * `_apple_ar_quicklook_button_tapped` back to the triggering anchor — that's
 * what actually drives the "Continue Your Journey" transition below, not
 * Quick Look's dismissal on its own (the user might just close it via the
 * native X without tapping our banner).
 */
function buildQuickLookHref(): string {
  const parts = [
    `callToAction=${encodeURIComponent("Continue Your Journey")}`,
    `checkoutTitle=${encodeURIComponent("Kameleon")}`,
    `checkoutSubtitle=${encodeURIComponent("Every Pour Is a Transformation")}`,
  ];
  if (typeof window !== "undefined") {
    parts.push(`canonicalWebPageURL=${encodeURIComponent(window.location.href)}`);
  }
  return `${SAMPLE_MODEL_USDZ_URL}#${parts.join("&")}`;
}

/**
 * iPhone/iPad AR-first path: one primary action opens Apple AR Quick Look
 * directly (via a plain `<a rel="ar">` — the standards-based WebKit trigger,
 * not a small icon). No inline 3D preview or AR/preview choice is offered
 * in the normal flow — "Continue without AR" only appears after a launch
 * failure, on an explicit help request, or (upstream, in
 * KameleonARExperience) when the device genuinely can't do AR at all.
 *
 * IMPORTANT PLATFORM LIMITATION: once Quick Look opens, its AR/Object tabs,
 * close button, and share button are rendered and owned entirely by iOS —
 * nothing on this page can hide, restyle, or remove them. The only
 * page-controllable outcomes are (a) the custom call-to-action banner
 * configured above, and (b) reacting to the two WebKit events below once
 * the user interacts with or dismisses Quick Look.
 */
export function ARQuickLookScreen({
  onEnterJourney,
  onSkipAr,
}: {
  onEnterJourney: () => void;
  onSkipAr: () => void;
}) {
  const [launchFailed, setLaunchFailed] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const arLinkRef = useRef<HTMLAnchorElement | null>(null);
  const launchTimeoutRef = useRef<number | null>(null);

  function clearLaunchTimeout() {
    if (launchTimeoutRef.current !== null) {
      window.clearTimeout(launchTimeoutRef.current);
      launchTimeoutRef.current = null;
    }
  }

  // The banner's call-to-action tap — the real "Continue Your Journey"
  // signal. Fires while Quick Look is still visually open/animating closed,
  // so the page underneath has already switched to Quick Account by the
  // time Quick Look actually hands control back.
  useEffect(() => {
    const anchor = arLinkRef.current;
    if (!anchor) return;
    function handleMessage(event: MessageEvent) {
      if (event.data === "_apple_ar_quicklook_button_tapped") {
        clearLaunchTimeout();
        onEnterJourney();
      }
    }
    anchor.addEventListener("message", handleMessage as EventListener);
    return () => anchor.removeEventListener("message", handleMessage as EventListener);
  }, [onEnterJourney]);

  // Confirms Quick Look actually took over the screen (cancels the launch-
  // failure timer) and, on return without a banner tap, just resets to the
  // idle button rather than assuming success or failure.
  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === "hidden") clearLaunchTimeout();
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);

  useEffect(() => {
    const anchor = arLinkRef.current;
    if (!anchor) return;
    function handleEndFullscreen() {
      clearLaunchTimeout();
    }
    anchor.addEventListener("webkitendfullscreen", handleEndFullscreen);
    return () => anchor.removeEventListener("webkitendfullscreen", handleEndFullscreen);
  }, []);

  useEffect(() => clearLaunchTimeout, []);

  function handleArClick() {
    setLaunchFailed(false);
    clearLaunchTimeout();
    launchTimeoutRef.current = window.setTimeout(() => {
      if (document.visibilityState !== "hidden") {
        setLaunchFailed(true);
      }
    }, LAUNCH_TIMEOUT_MS);
  }

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
        <h1 className="font-display text-2xl font-semibold uppercase tracking-wide text-kameleon-copper-light">
          Place the experience in your space
        </h1>
        <p className="max-w-xs text-sm text-kameleon-text-muted">
          Move your phone slowly to find a surface, then place the Kameleon experience in your
          world.
        </p>

        {launchFailed && (
          <div className="mt-2 flex flex-col items-center gap-3 rounded-xl border border-kameleon-red/40 bg-kameleon-surface px-4 py-3">
            <p className="max-w-xs text-sm text-kameleon-text-muted">
              AR didn&apos;t open. You can try again, or continue without it.
            </p>
            <button
              type="button"
              onClick={onSkipAr}
              className="text-sm font-medium text-kameleon-copper-light underline-offset-4 hover:underline"
            >
              Continue without AR
            </button>
          </div>
        )}
      </div>

      <div className="flex shrink-0 flex-col items-center gap-3">
        <a
          ref={arLinkRef}
          rel="ar"
          href={buildQuickLookHref()}
          onClick={handleArClick}
          className="flex min-h-11 w-full items-center justify-center rounded-full bg-kameleon-copper-light px-6 py-3 text-center text-sm font-semibold uppercase tracking-wide text-kameleon-bg transition-colors hover:bg-kameleon-copper"
        >
          Open AR Experience
        </a>

        <button
          type="button"
          onClick={() => setHelpOpen(true)}
          className="text-xs text-kameleon-text-muted underline-offset-4 hover:underline"
        >
          Need help?
        </button>
      </div>

      {helpOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]"
          role="dialog"
          aria-modal="true"
          aria-label="AR help"
        >
          <div className="w-full max-w-sm rounded-2xl border border-kameleon-copper/40 bg-kameleon-surface p-5 text-center">
            <h2 className="font-display text-lg font-semibold uppercase tracking-wide text-kameleon-copper-light">
              Need help?
            </h2>
            <p className="mt-2 text-sm text-kameleon-text-muted">
              Tap &quot;Open AR Experience,&quot; allow camera access if asked, then slowly move your
              phone until a surface is found and the experience appears.
            </p>
            <div className="mt-4 flex flex-col gap-3">
              <button
                type="button"
                onClick={() => setHelpOpen(false)}
                className="w-full rounded-full bg-kameleon-copper-light py-3 text-sm font-semibold uppercase tracking-wide text-kameleon-bg"
              >
                Got it
              </button>
              <button
                type="button"
                onClick={onSkipAr}
                className="text-sm font-medium text-kameleon-copper-light underline-offset-4 hover:underline"
              >
                Continue without AR
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
