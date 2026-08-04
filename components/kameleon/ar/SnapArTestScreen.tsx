"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CameraKitProvider, LensPlayer, LiveCanvas, useCameraKit } from "@snap/react-camera-kit";
import {
  getSnapCameraKitConfig,
  getSnapCameraKitConfigStatus,
  type SnapCameraKitConfig,
} from "@/lib/kameleon/ar/snap-camera-kit-config";
import { mapSnapArError, CONFIG_MISSING_ERROR, type SnapArError } from "@/lib/kameleon/ar/snap-error-messages";

type Phase = "start" | "session" | "completed" | "error";

/** If the session hasn't become ready within this long, treat it as a soft failure rather than staying stuck. */
const READY_TIMEOUT_MS = 20000;

/**
 * Isolated Phase 5B Checkpoint 3 prototype — NOT wired to the production
 * Kameleon session/Quick Account flow (see the "isolated test-completion
 * state" below, deliberately not calling any production navigation). Lives
 * only at /experience/kameleon/ar-snap-test.
 *
 * Cleanup strategy: `@snap/react-camera-kit`'s `CameraKitProvider` "...
 * manages SDK lifecycle, including initialization, cleanup, and
 * re-initialization" tied to its own React mount/unmount (per its own
 * JSDoc) — the public `useCameraKit()` context deliberately exposes no
 * separate "dispose" method, which is itself the signal that unmounting
 * *is* the supported teardown path. So every exit here (Continue Your
 * Journey, Exit AR, navigating away, this component unmounting) works by
 * transitioning `phase` away from `"session"`, which stops rendering
 * `<CameraKitProvider>` entirely and lets React's own unmount lifecycle
 * drive the camera/session teardown — not by calling an internal API this
 * project can't see or verify.
 */
export function SnapArTestScreen() {
  const [phase, setPhase] = useState<Phase>("start");
  const [error, setError] = useState<SnapArError | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [sessionKey, setSessionKey] = useState(0);
  const [config, setConfig] = useState<SnapCameraKitConfig | null>(null);

  function handleStart() {
    const status = getSnapCameraKitConfigStatus();
    if (!status.configured) {
      setError(CONFIG_MISSING_ERROR);
      setPhase("error");
      return;
    }
    setConfig(getSnapCameraKitConfig());
    setError(null);
    setPhase("session");
  }

  const handleSessionError = useCallback((err: unknown) => {
    setError(mapSnapArError(err));
    setPhase("error");
  }, []);

  function handleContinueJourney() {
    setPhase("completed");
  }

  function handleExitAr() {
    setPhase("start");
    setConfig(null);
    setSessionKey((k) => k + 1);
  }

  function handleRetry() {
    setError(null);
    setPhase("start");
    setConfig(null);
    setSessionKey((k) => k + 1);
  }

  return (
    <div className="relative flex flex-1 flex-col overflow-hidden bg-kameleon-bg">
      {phase === "start" && (
        <StartScreen onStart={handleStart} onHelp={() => setHelpOpen(true)} />
      )}

      {phase === "session" && config && (
        <CameraKitSession
          key={sessionKey}
          config={config}
          onError={handleSessionError}
          onContinueJourney={handleContinueJourney}
          onExitAr={handleExitAr}
          onHelp={() => setHelpOpen(true)}
        />
      )}

      {phase === "completed" && <CompletedScreen onExitAr={handleExitAr} />}

      {phase === "error" && error && (
        <ErrorScreen error={error} onRetry={handleRetry} onExit={handleExitAr} />
      )}

      {helpOpen && <HelpPanel onClose={() => setHelpOpen(false)} />}
    </div>
  );
}

function StartScreen({ onStart, onHelp }: { onStart: () => void; onHelp: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-xs uppercase tracking-widest text-kameleon-text-muted">
        Phase 5B — isolated Snap AR test
      </p>
      <h1 className="font-display text-xl font-semibold uppercase tracking-wide text-kameleon-copper-light">
        Start Snap AR Test
      </h1>
      <p className="max-w-xs text-sm text-kameleon-text-muted">
        This opens your rear camera and loads the Kameleon Lens, powered by Snap AR.
      </p>
      <div className="mt-2 flex w-full max-w-xs flex-col items-center gap-3">
        <button
          type="button"
          onClick={onStart}
          className="flex min-h-11 w-full items-center justify-center rounded-full bg-kameleon-copper-light px-6 py-3 text-center text-sm font-semibold uppercase tracking-wide text-kameleon-bg transition-colors hover:bg-kameleon-copper"
        >
          Start Snap AR Test
        </button>
        <button
          type="button"
          onClick={onHelp}
          className="text-xs text-kameleon-text-muted underline-offset-4 hover:underline"
        >
          Help
        </button>
      </div>
    </div>
  );
}

function CompletedScreen({ onExitAr }: { onExitAr: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-xs uppercase tracking-widest text-kameleon-text-muted">
        Phase 5B — isolated Snap AR test
      </p>
      <h1 className="font-display text-xl font-semibold uppercase tracking-wide text-kameleon-copper-light">
        Test complete
      </h1>
      <p className="max-w-xs text-sm text-kameleon-text-muted">
        The camera has been released. This isolated test does not continue into Quick Account —
        that connection happens once this prototype is approved for production use.
      </p>
      <button
        type="button"
        onClick={onExitAr}
        className="mt-2 min-h-11 rounded-full border border-kameleon-copper/50 px-6 py-3 text-sm font-semibold uppercase tracking-wide text-kameleon-copper-light hover:bg-white/5"
      >
        Restart test
      </button>
    </div>
  );
}

function ErrorScreen({
  error,
  onRetry,
  onExit,
}: {
  error: SnapArError;
  onRetry: () => void;
  onExit: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="font-display text-lg font-semibold uppercase tracking-wide text-kameleon-red">
        AR test couldn&apos;t continue
      </h1>
      <p className="max-w-xs text-sm text-kameleon-text-muted">{error.message}</p>
      <div className="mt-2 flex w-full max-w-xs flex-col items-center gap-3">
        {error.recoverable && (
          <button
            type="button"
            onClick={onRetry}
            className="flex min-h-11 w-full items-center justify-center rounded-full bg-kameleon-copper-light px-6 py-3 text-sm font-semibold uppercase tracking-wide text-kameleon-bg hover:bg-kameleon-copper"
          >
            Try again
          </button>
        )}
        <button
          type="button"
          onClick={onExit}
          className="text-sm font-medium text-kameleon-copper-light underline-offset-4 hover:underline"
        >
          Exit test
        </button>
      </div>
    </div>
  );
}

function HelpPanel({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]"
      role="dialog"
      aria-modal="true"
      aria-label="AR test help"
    >
      <div className="w-full max-w-sm rounded-2xl border border-kameleon-copper/40 bg-kameleon-surface p-5 text-center">
        <h2 className="font-display text-lg font-semibold uppercase tracking-wide text-kameleon-copper-light">
          About this test
        </h2>
        <p className="mt-2 text-sm text-kameleon-text-muted">
          This page is an internal evaluation of Snap&apos;s AR technology and isn&apos;t part of
          the live Kameleon experience yet. Starting it opens your rear camera. Nothing is
          recorded, saved, or uploaded by this page.
        </p>
        <p className="mt-3 text-xs text-kameleon-text-muted">
          Snap AR is provided by Snap Inc. —{" "}
          <a
            href="https://support.snapchat.com/article/camera-information-use"
            target="_blank"
            rel="noreferrer"
            className="text-kameleon-copper-light underline-offset-4 hover:underline"
          >
            Learn more
          </a>
          .
        </p>
        <button
          type="button"
          onClick={onClose}
          className="mt-4 w-full rounded-full bg-kameleon-copper-light py-3 text-sm font-semibold uppercase tracking-wide text-kameleon-bg"
        >
          Got it
        </button>
      </div>
    </div>
  );
}

function CameraKitSession({
  config,
  onError,
  onContinueJourney,
  onExitAr,
  onHelp,
}: {
  config: SnapCameraKitConfig;
  onError: (err: unknown) => void;
  onContinueJourney: () => void;
  onExitAr: () => void;
  onHelp: () => void;
}) {
  return (
    <CameraKitProvider apiToken={config.apiToken}>
      <SessionContent
        lensId={config.lensId}
        lensGroupId={config.lensGroupId}
        onError={onError}
        onContinueJourney={onContinueJourney}
        onExitAr={onExitAr}
        onHelp={onHelp}
      />
    </CameraKitProvider>
  );
}

function SessionContent({
  lensId,
  lensGroupId,
  onError,
  onContinueJourney,
  onExitAr,
  onHelp,
}: {
  lensId: string;
  lensGroupId: string;
  onError: (err: unknown) => void;
  onContinueJourney: () => void;
  onExitAr: () => void;
  onHelp: () => void;
}) {
  const { sdkStatus, sdkError, source, lens } = useCameraKit();
  // Fully derivable from context state every render — no separate
  // useState/useEffect needed (and no set-state-in-effect lint issue as a
  // result) to just mirror values already available synchronously.
  const ready = sdkStatus === "ready" && source.status === "ready" && lens.status === "ready";
  const readyTimeoutRef = useRef<number | null>(null);
  const reportedErrorRef = useRef(false);

  const reportError = useCallback(
    (err: unknown) => {
      if (reportedErrorRef.current) return; // only the first real error should navigate away
      reportedErrorRef.current = true;
      onError(err);
    },
    [onError],
  );

  useEffect(() => {
    if (sdkStatus === "error" && sdkError) reportError(sdkError);
  }, [sdkStatus, sdkError, reportError]);

  useEffect(() => {
    if (source.status === "error" && source.error) reportError(source.error);
  }, [source.status, source.error, reportError]);

  useEffect(() => {
    if (lens.status === "error" && lens.error) reportError(lens.error);
  }, [lens.status, lens.error, reportError]);

  // "No frozen or blank camera screen" — if the session never becomes ready
  // within a reasonable window, treat it as a failure with a retry action
  // instead of leaving the visitor on an indefinite loading state.
  useEffect(() => {
    readyTimeoutRef.current = window.setTimeout(() => {
      if (!ready) {
        reportError(new Error("Camera Kit session did not become ready in time."));
      }
    }, READY_TIMEOUT_MS);
    return () => {
      if (readyTimeoutRef.current !== null) window.clearTimeout(readyTimeoutRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (ready && readyTimeoutRef.current !== null) {
      window.clearTimeout(readyTimeoutRef.current);
      readyTimeoutRef.current = null;
    }
  }, [ready]);

  return (
    <div className="absolute inset-0 h-full w-full overflow-hidden">
      <LensPlayer
        lensId={lensId}
        lensGroupId={lensGroupId}
        source={{ kind: "camera", options: { cameraFacing: "environment" } }}
        onError={(err) => reportError(err)}
        className="absolute inset-0 h-full w-full"
      >
        <LiveCanvas className="absolute inset-0 h-full w-full [object-fit:cover]" />
      </LensPlayer>

      {!ready && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-kameleon-bg/90 px-6 text-center">
          <div
            className="h-8 w-8 animate-spin rounded-full border-2 border-kameleon-copper/30 border-t-kameleon-copper-light"
            aria-hidden="true"
          />
          <p className="text-sm text-kameleon-text-muted">Starting AR…</p>
        </div>
      )}

      {ready && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center gap-3 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <div className="pointer-events-auto flex items-center justify-center gap-2 rounded-full bg-black/55 px-3 py-2 backdrop-blur-sm">
            <button
              type="button"
              onClick={onExitAr}
              className="flex min-h-11 min-w-11 items-center justify-center rounded-full px-3 text-xs font-semibold uppercase tracking-wide text-kameleon-text-muted hover:text-kameleon-text"
            >
              Exit AR
            </button>
            <button
              type="button"
              onClick={onHelp}
              className="flex min-h-11 min-w-11 items-center justify-center rounded-full px-3 text-xs font-semibold uppercase tracking-wide text-kameleon-text-muted hover:text-kameleon-text"
            >
              Help
            </button>
          </div>
          <button
            type="button"
            onClick={onContinueJourney}
            className="pointer-events-auto min-h-11 w-full max-w-xs rounded-full bg-kameleon-copper-light px-6 py-3 text-sm font-semibold uppercase tracking-wide text-kameleon-bg transition-colors hover:bg-kameleon-copper"
          >
            Continue Your Journey
          </button>
        </div>
      )}
    </div>
  );
}
