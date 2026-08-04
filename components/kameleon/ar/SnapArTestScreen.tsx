"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  bootstrapCameraKit,
  createMediaStreamSource,
  type CameraKit,
  type CameraKitSession as CoreCameraKitSession,
  type CameraKitSessionEvents,
  type Lens,
} from "@snap/camera-kit";
import {
  getSnapCameraKitConfig,
  getSnapCameraKitConfigStatus,
  type SnapCameraKitConfig,
} from "@/lib/kameleon/ar/snap-camera-kit-config";
import { mapSnapArError, CONFIG_MISSING_ERROR, NO_FRAME_TIMEOUT_ERROR, type SnapArError } from "@/lib/kameleon/ar/snap-error-messages";
import {
  createInitialDiagnostics,
  STAGE_LABELS,
  type SnapArDiagnostics,
  type SnapArStage,
} from "@/lib/kameleon/ar/snap-ar-diagnostics";

type Phase = "start" | "session" | "completed" | "error";

/** Stage-specific timeout for the first rendered frame after play() resolves. */
const FIRST_FRAME_TIMEOUT_MS = 8000;
/** Outer safety net covering the entire bootstrap→active-session sequence, in case some stage's promise never settles. */
const OVERALL_TIMEOUT_MS = 25000;

/** Sentinel thrown by the local first-frame watchdog — distinguished from real SDK errors so it maps to a specific message. */
class NoFrameTimeoutMarker extends Error {}

/**
 * Isolated Phase 5B Checkpoint 3→4 prototype — NOT wired to the production
 * Kameleon session/Quick Account flow. Lives only at
 * /experience/kameleon/ar-snap-test.
 *
 * This route uses @snap/camera-kit's CORE API directly (not
 * @snap/react-camera-kit). That wrapper's `useCameraKit()` only exposes
 * three coarse buckets (`sdkStatus` / `source.status` / `lens.status`),
 * which isn't enough to tell apart "Lens metadata/group lookup failed" from
 * "Lens content download failed" from "Lens apply failed" — three distinct
 * core-API calls the wrapper collapses into one "lens.status === 'error'".
 * It also gave this project no direct handle on the underlying
 * `MediaStream` it created internally, which is why a prior version of this
 * route (relying on unmounting `<CameraKitProvider>` for cleanup) left the
 * camera indicator on after an error on real iPhones — unmounting the
 * wrapper doesn't synchronously/reliably stop tracks it created itself.
 *
 * Here, this component owns `getUserMedia()` directly, so cleanup can
 * always call `track.stop()` on every track it created, regardless of what
 * state the Camera Kit SDK itself is in.
 */
export function SnapArTestScreen() {
  const [phase, setPhase] = useState<Phase>("start");
  const [error, setError] = useState<SnapArError | null>(null);
  const [diagnostics, setDiagnostics] = useState<SnapArDiagnostics>(createInitialDiagnostics());
  const [helpOpen, setHelpOpen] = useState(false);
  const [sessionKey, setSessionKey] = useState(0);
  const [config, setConfig] = useState<SnapCameraKitConfig | null>(null);

  function handleStart() {
    const status = getSnapCameraKitConfigStatus();
    if (!status.configured) {
      setError(CONFIG_MISSING_ERROR);
      setDiagnostics(createInitialDiagnostics());
      setPhase("error");
      return;
    }
    setConfig(getSnapCameraKitConfig());
    setError(null);
    setPhase("session");
  }

  /** Only called by the child AFTER its own cleanup has fully completed — see SnapArSession's runCleanup. */
  const handleSessionError = useCallback((err: SnapArError, diag: SnapArDiagnostics) => {
    setError(err);
    setDiagnostics(diag);
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
        <SnapArSession
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
        <ErrorScreen error={error} diagnostics={diagnostics} onRetry={handleRetry} onExit={handleExitAr} />
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
  diagnostics,
  onRetry,
  onExit,
}: {
  error: SnapArError;
  diagnostics: SnapArDiagnostics;
  onRetry: () => void;
  onExit: () => void;
}) {
  const [diagOpen, setDiagOpen] = useState(false);
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="font-display text-lg font-semibold uppercase tracking-wide text-kameleon-red">
        AR test couldn&apos;t continue
      </h1>
      <p className="max-w-xs text-sm text-kameleon-text-muted">{error.message}</p>
      <div className="mt-2 flex w-full max-w-xs flex-col items-center gap-3">
        {error.recoverable && diagnostics.cleanupCompleted === "yes" && (
          <button
            type="button"
            onClick={onRetry}
            className="flex min-h-11 w-full items-center justify-center rounded-full bg-kameleon-copper-light px-6 py-3 text-sm font-semibold uppercase tracking-wide text-kameleon-bg hover:bg-kameleon-copper"
          >
            Try again
          </button>
        )}
        {error.recoverable && diagnostics.cleanupCompleted !== "yes" && (
          <p className="text-xs text-kameleon-text-muted">Finishing cleanup…</p>
        )}
        <button
          type="button"
          onClick={onExit}
          className="text-sm font-medium text-kameleon-copper-light underline-offset-4 hover:underline"
        >
          Exit test
        </button>
        <button
          type="button"
          onClick={() => setDiagOpen((v) => !v)}
          className="text-xs text-kameleon-text-muted underline-offset-4 hover:underline"
        >
          {diagOpen ? "Hide" : "View"} diagnostics
        </button>
        {diagOpen && <DiagnosticsPanel diagnostics={diagnostics} />}
      </div>
    </div>
  );
}

/**
 * Every value rendered here comes from SnapArDiagnostics, which by
 * construction can never hold an API token, Lens ID, Lens Group ID, or any
 * other environment-variable value — only stage names, booleans, and a
 * normalized error category name.
 */
function DiagnosticsPanel({ diagnostics }: { diagnostics: SnapArDiagnostics }) {
  const rows: [string, string][] = [
    ["Last successful stage", diagnostics.lastSuccessfulStage ? STAGE_LABELS[diagnostics.lastSuccessfulStage] : "None"],
    ["Failed stage", diagnostics.failedStage ? STAGE_LABELS[diagnostics.failedStage] : "None"],
    ["Error category", diagnostics.errorCategory ?? "None"],
    ["Camera Kit SDK initialized", diagnostics.sdkInitialized],
    ["Camera started", diagnostics.cameraStarted],
    ["Lens group queried", diagnostics.lensGroupQueried],
    ["Lens found in configured group", diagnostics.lensFoundInGroup],
    ["Lens content loaded", diagnostics.lensLoaded],
    ["Lens applied", diagnostics.lensApplied],
    ["Session playing", diagnostics.sessionPlaying],
    ["First rendered frame received", diagnostics.firstFrameReceived],
    ["Cleanup completed", diagnostics.cleanupCompleted],
  ];
  return (
    <div className="w-full rounded-xl border border-kameleon-copper/30 bg-black/40 p-3 text-left">
      <ul className="space-y-1">
        {rows.map(([label, value]) => (
          <li key={label} className="flex items-center justify-between gap-3 text-xs">
            <span className="text-kameleon-text-muted">{label}</span>
            <span className="font-mono text-kameleon-copper-light">{value}</span>
          </li>
        ))}
      </ul>
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

type UiState = "loading" | "ready" | "ending";

function SnapArSession({
  config,
  onError,
  onContinueJourney,
  onExitAr,
  onHelp,
}: {
  config: SnapCameraKitConfig;
  onError: (error: SnapArError, diagnostics: SnapArDiagnostics) => void;
  onContinueJourney: () => void;
  onExitAr: () => void;
  onHelp: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [uiState, setUiState] = useState<UiState>("loading");
  const [diagnostics, setDiagnostics] = useState<SnapArDiagnostics>(createInitialDiagnostics());
  const [diagOpen, setDiagOpen] = useState(false);

  // Mirrors `diagnostics` state synchronously so handleFatalError can read
  // the truly-latest values right after cleanup without relying on a
  // setState-updater side effect (which could double-fire onError under
  // React StrictMode's dev double-invoke behavior).
  const diagnosticsRef = useRef<SnapArDiagnostics>(createInitialDiagnostics());
  const updateDiagnostics = useCallback((patch: Partial<SnapArDiagnostics>) => {
    diagnosticsRef.current = { ...diagnosticsRef.current, ...patch };
    setDiagnostics(diagnosticsRef.current);
  }, []);

  // Teardown handles — populated as each stage succeeds, so cleanup can
  // always reach whatever was actually created, no matter which stage failed.
  const cameraKitRef = useRef<CameraKit | null>(null);
  const sessionRef = useRef<CoreCameraKitSession | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafIdRef = useRef<number | null>(null);

  const cancelledRef = useRef(false);
  const currentStageRef = useRef<SnapArStage>("configuration");
  const lastSuccessRef = useRef<SnapArStage | null>(null);
  const errorHandledRef = useRef(false);
  const cleanupStartedRef = useRef(false);
  const cleanupDoneRef = useRef(false);

  // Plain (non-useCallback) function declarations below: they're hoisted,
  // which sidesteps ordering issues from their circular references
  // (runCleanup detaches handleSessionEvent; handleSessionEvent can trigger
  // handleFatalError; handleFatalError calls runCleanup). None of them need
  // stable identity across renders — the effect below has an empty
  // dependency array and only ever reads the versions from its own mount.

  function handleSessionEvent(event: CameraKitSessionEvents) {
    const { error: sdkError } = event.detail;
    if (sdkError.name === "LensExecutionError" || sdkError.name === "LensAbortError") {
      currentStageRef.current = "active-session";
      void handleFatalError(sdkError);
    }
    // LensImagePickerError / LensVideoPlaybackMutedError are documented as
    // non-fatal (the lens keeps rendering) and aren't relevant to this
    // test's fixed camera source, so they're intentionally not escalated.
  }

  async function runCleanup(): Promise<void> {
    if (cleanupStartedRef.current) {
      while (!cleanupDoneRef.current) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      return;
    }
    cleanupStartedRef.current = true;
    cancelledRef.current = true;

    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }

    const session = sessionRef.current;
    if (session) {
      session.events.removeEventListener("error", handleSessionEvent);
    }

    // Stop every accessible MediaStreamTrack first and unconditionally —
    // this is the actual camera indicator, and must go off regardless of
    // whether any Camera Kit SDK teardown call below succeeds or hangs.
    const stream = streamRef.current;
    if (stream) {
      for (const track of stream.getTracks()) {
        try {
          track.stop();
        } catch (stopError) {
          void stopError;
        }
      }
    }
    streamRef.current = null;

    if (session) {
      await session.pause().catch(() => undefined);
      await session.removeLens().catch(() => undefined);
      await session.destroy().catch(() => undefined);
    }
    sessionRef.current = null;

    const cameraKit = cameraKitRef.current;
    if (cameraKit) {
      await cameraKit.destroy().catch(() => undefined);
    }
    cameraKitRef.current = null;

    updateDiagnostics({ cleanupCompleted: "yes" });
    cleanupDoneRef.current = true;
  }

  async function handleFatalError(err: unknown) {
    if (errorHandledRef.current) return;
    errorHandledRef.current = true;

    const failedStage = currentStageRef.current;
    const mapped = err instanceof NoFrameTimeoutMarker ? NO_FRAME_TIMEOUT_ERROR : mapSnapArError(err);

    setUiState("ending");
    updateDiagnostics({
      failedStage,
      lastSuccessfulStage: lastSuccessRef.current,
      errorCategory: mapped.category,
    });

    await runCleanup();

    onError(mapped, diagnosticsRef.current);
  }

  useEffect(() => {
    let outerTimeoutId: number | null = null;

    async function run() {
      try {
        currentStageRef.current = "sdk-bootstrap";
        const cameraKit = await bootstrapCameraKit({ apiToken: config.apiToken });
        if (cancelledRef.current) return;
        cameraKitRef.current = cameraKit;
        lastSuccessRef.current = "sdk-bootstrap";
        updateDiagnostics({ sdkInitialized: "yes" });

        // No public hook exists to observe Snap's legal/consent prompt
        // directly (see snap-ar-diagnostics.ts's top comment) — attributed
        // by exclusion once bootstrap succeeds without a LegalError.
        lastSuccessRef.current = "terms-consent";

        currentStageRef.current = "camera-request";
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: false,
        });
        if (cancelledRef.current) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        lastSuccessRef.current = "camera-request";
        updateDiagnostics({ cameraStarted: "yes" });
        lastSuccessRef.current = "camera-ready";

        const session = await cameraKit.createSession({
          liveRenderTarget: canvasRef.current ?? undefined,
        });
        if (cancelledRef.current) {
          await session.destroy().catch(() => undefined);
          return;
        }
        sessionRef.current = session;
        session.events.addEventListener("error", handleSessionEvent);

        currentStageRef.current = "lens-lookup";
        updateDiagnostics({ lensGroupQueried: "yes" });
        let lens: Lens;
        try {
          lens = await cameraKit.lensRepository.loadLens(config.lensId, config.lensGroupId);
        } catch (lookupError) {
          updateDiagnostics({ lensFoundInGroup: "fail" });
          throw lookupError;
        }
        if (cancelledRef.current) return;
        updateDiagnostics({ lensFoundInGroup: "pass" });
        lastSuccessRef.current = "lens-lookup";

        currentStageRef.current = "lens-load";
        await cameraKit.lensRepository.cacheLensContent([lens]);
        if (cancelledRef.current) return;
        updateDiagnostics({ lensLoaded: "yes" });
        lastSuccessRef.current = "lens-load";

        currentStageRef.current = "lens-apply";
        const source = createMediaStreamSource(stream, { cameraType: "environment" });
        await session.setSource(source);
        if (cancelledRef.current) return;
        const applied = await session.applyLens(lens);
        if (cancelledRef.current) return;
        if (!applied) {
          throw new Error("Lens application was interrupted before it completed.");
        }
        updateDiagnostics({ lensApplied: "yes" });
        lastSuccessRef.current = "lens-apply";

        currentStageRef.current = "session-play";
        const measurement = session.metrics.beginMeasurement();
        await session.play();
        if (cancelledRef.current) {
          measurement.end();
          return;
        }
        updateDiagnostics({ sessionPlaying: "yes" });
        lastSuccessRef.current = "session-play";

        currentStageRef.current = "first-frame";
        const gotFrame = await new Promise<boolean>((resolve) => {
          const start = performance.now();
          const tick = () => {
            if (cancelledRef.current) {
              resolve(false);
              return;
            }
            if (measurement.measure().lensFrameProcessingN > 0) {
              resolve(true);
              return;
            }
            if (performance.now() - start > FIRST_FRAME_TIMEOUT_MS) {
              resolve(false);
              return;
            }
            rafIdRef.current = requestAnimationFrame(tick);
          };
          rafIdRef.current = requestAnimationFrame(tick);
        });
        measurement.end();
        if (cancelledRef.current) return;
        if (!gotFrame) {
          throw new NoFrameTimeoutMarker("No rendered frame was received within the timeout window.");
        }
        updateDiagnostics({ firstFrameReceived: "yes" });
        lastSuccessRef.current = "first-frame";

        currentStageRef.current = "active-session";
        lastSuccessRef.current = "active-session";
        setUiState("ready");
      } catch (runError) {
        if (cancelledRef.current) return;
        await handleFatalError(runError);
      }
    }

    const timeoutPromise = new Promise<never>((_, reject) => {
      outerTimeoutId = window.setTimeout(() => {
        reject(new Error("Camera Kit session did not become ready in time."));
      }, OVERALL_TIMEOUT_MS);
    });

    Promise.race([run(), timeoutPromise])
      .catch((raceError) => {
        if (!cancelledRef.current) void handleFatalError(raceError);
      })
      .finally(() => {
        if (outerTimeoutId !== null) window.clearTimeout(outerTimeoutId);
      });

    return () => {
      if (outerTimeoutId !== null) window.clearTimeout(outerTimeoutId);
      void runCleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleContinueJourney() {
    setUiState("ending");
    await runCleanup();
    onContinueJourney();
  }

  async function handleExitAr() {
    setUiState("ending");
    await runCleanup();
    onExitAr();
  }

  return (
    <div className="absolute inset-0 h-full w-full overflow-hidden">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full [object-fit:cover]" />

      {uiState !== "ready" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-kameleon-bg/90 px-6 text-center">
          <div
            className="h-8 w-8 animate-spin rounded-full border-2 border-kameleon-copper/30 border-t-kameleon-copper-light"
            aria-hidden="true"
          />
          <p className="text-sm text-kameleon-text-muted">
            {uiState === "ending" ? "Ending AR test…" : "Starting AR…"}
          </p>
          {uiState === "loading" && (
            <>
              <button
                type="button"
                onClick={() => setDiagOpen((v) => !v)}
                className="text-xs text-kameleon-text-muted underline-offset-4 hover:underline"
              >
                {diagOpen ? "Hide" : "View"} diagnostics
              </button>
              {diagOpen && (
                <div className="w-full max-w-xs">
                  <DiagnosticsPanel diagnostics={diagnostics} />
                </div>
              )}
            </>
          )}
        </div>
      )}

      {uiState === "ready" && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center gap-3 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <div className="pointer-events-auto flex items-center justify-center gap-2 rounded-full bg-black/55 px-3 py-2 backdrop-blur-sm">
            <button
              type="button"
              onClick={() => void handleExitAr()}
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
            onClick={() => void handleContinueJourney()}
            className="pointer-events-auto min-h-11 w-full max-w-xs rounded-full bg-kameleon-copper-light px-6 py-3 text-sm font-semibold uppercase tracking-wide text-kameleon-bg transition-colors hover:bg-kameleon-copper"
          >
            Continue Your Journey
          </button>
        </div>
      )}
    </div>
  );
}
