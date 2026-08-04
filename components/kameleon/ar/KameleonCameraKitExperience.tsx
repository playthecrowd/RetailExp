"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  bootstrapCameraKit,
  createMediaStreamSource,
  type CameraKit,
  type CameraKitSession as CoreCameraKitSession,
  type CameraKitSessionEvents,
} from "@snap/camera-kit";
import { Button } from "@/components/ui/Button";
import { KameleonFlowHeader } from "@/components/kameleon/FlowHeader";
import { Viewfinder } from "@/components/kameleon/art/Viewfinder";
import {
  CameraIcon,
  NoAppIcon,
  EyeOffIcon,
  ShieldIcon,
  SoundIcon,
  MuteIcon,
  HelpIcon,
  ExitIcon,
} from "@/components/kameleon/icons";
import { useKameleonSound } from "@/lib/kameleon/useKameleonSound";
import { detectSnapCameraKitCapability } from "@/lib/kameleon/ar/snap-camera-kit-capability";
import { getSnapCameraKitConfig } from "@/lib/kameleon/ar/snap-camera-kit-config";
import {
  mapSnapArError,
  CONFIG_MISSING_ERROR,
  NO_FRAME_TIMEOUT_ERROR,
  type SnapArError,
} from "@/lib/kameleon/ar/snap-error-messages";

/** Stage-specific timeout for the first rendered frame after play() resolves. */
const FIRST_FRAME_TIMEOUT_MS = 8000;
/** Outer safety net covering the entire bootstrap→active-session sequence, in case some stage's promise never settles. */
const OVERALL_TIMEOUT_MS = 25000;

/** Sentinel thrown by the local first-frame watchdog — distinguished from real SDK errors so it maps to a specific message. */
class NoFrameTimeoutMarker extends Error {}

type Phase = "unsupported" | "start" | "session" | "error";

/**
 * Production embedded Snap Camera Kit AR experience — the primary AR
 * pathway on both iPhone and Android per Phase 5B. Mounted at the
 * `ar-permission` screen exactly like the (now dormant, kept for possible
 * future use, never routed to) WebXR `KameleonARExperience` it replaces —
 * same `onEnterJourney`/`onSkipAr` contract, so app/experience/kameleon/
 * page.tsx and the session reducer needed no changes.
 *
 * The session lifecycle (bootstrap → getUserMedia → createSession → Lens
 * lookup/load/apply → play → first-frame watchdog → cleanup) is ported
 * from the isolated diagnostic route's proven implementation
 * (components/kameleon/ar/SnapArTestScreen.tsx), built directly on the
 * core `@snap/camera-kit` API (not `@snap/react-camera-kit`) for the same
 * reason: reliable, guaranteed camera cleanup requires owning the
 * `MediaStream` directly rather than trusting a wrapper's unmount
 * behavior. This component drops that route's diagnostics panel (internal
 * tooling only) and adds production-only concerns: the commercial-gate
 * flow, Kameleon sound, and releasing the camera when the tab/app is
 * backgrounded.
 */
export function KameleonCameraKitExperience({
  onEnterJourney,
  onSkipAr,
}: {
  /** AR completed — end session, continue into the journey (Quick Account). */
  onEnterJourney: () => void;
  /** Skip/decline/exit AR entirely — still returns to the same journey entry point. */
  onSkipAr: () => void;
}) {
  // Synchronous feature detection (no network/permission calls), so this
  // can be computed directly during the initial client-only render — this
  // component is only ever mounted client-side (see the dynamic(...,
  // { ssr: false }) import in page.tsx), so reading window/navigator here
  // is safe with no SSR mismatch risk. Avoids a set-state-in-effect for
  // something that was never actually asynchronous.
  const [capability] = useState(() => detectSnapCameraKitCapability());
  const [phase, setPhase] = useState<Phase>(capability.supported ? "start" : "unsupported");
  const [error, setError] = useState<SnapArError | null>(null);
  const [sessionKey, setSessionKey] = useState(0);

  function handleStart() {
    // Defensive re-check — detectSnapCameraKitCapability() already
    // confirmed configuration before the Start screen was ever shown, so
    // this should never actually trigger in practice.
    try {
      getSnapCameraKitConfig();
    } catch {
      setError(CONFIG_MISSING_ERROR);
      setPhase("error");
      return;
    }
    setError(null);
    setPhase("session");
  }

  const handleSessionError = useCallback((err: SnapArError) => {
    setError(err);
    setPhase("error");
  }, []);

  function handleRetry() {
    setError(null);
    setPhase("start");
    setSessionKey((k) => k + 1);
  }

  /** Camera released because the tab/app was backgrounded — return to the pre-permission screen, not out of AR entirely. */
  function handleInterrupted() {
    setPhase("start");
    setSessionKey((k) => k + 1);
  }

  if (phase === "unsupported") {
    return <CameraKitUnsupportedScreen reason={capability.reason} onContinue={onSkipAr} />;
  }

  if (phase === "start") {
    return <CameraKitStartScreen onStart={handleStart} onSkip={onSkipAr} />;
  }

  if (phase === "error" && error) {
    return <CameraKitErrorScreen error={error} onRetry={handleRetry} onContinueWithoutAr={onSkipAr} />;
  }

  return (
    <CameraKitSessionRuntime
      key={sessionKey}
      onComplete={onEnterJourney}
      onExit={onSkipAr}
      onInterrupted={handleInterrupted}
      onError={handleSessionError}
    />
  );
}

function CameraKitStartScreen({ onStart, onSkip }: { onStart: () => void; onSkip: () => void }) {
  return (
    <div className="flex flex-1 flex-col gap-8 px-6 pb-8">
      <KameleonFlowHeader
        steps={[
          { id: "commercial", label: "Commercial", status: "complete" },
          { id: "ar", label: "AR", status: "current" },
          { id: "journey", label: "Journey", status: "upcoming" },
        ]}
      />

      <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
        <Viewfinder />

        <div>
          <h1 className="font-display text-2xl font-semibold uppercase tracking-wide text-kameleon-copper-light">
            Bring the bottle to life
          </h1>
          <p className="mt-3 max-w-xs text-sm text-kameleon-text-muted">
            Open your camera to see Kameleon come alive right where you&apos;re standing, powered
            by Snap AR.
          </p>
        </div>

        <div className="flex items-center justify-center gap-6 text-kameleon-text-muted">
          <span className="flex flex-col items-center gap-1.5 text-xs">
            <CameraIcon className="h-6 w-6" />
            Camera access
          </span>
          <span className="flex flex-col items-center gap-1.5 text-xs">
            <NoAppIcon className="h-6 w-6" />
            No app required
          </span>
          <span className="flex flex-col items-center gap-1.5 text-xs">
            <EyeOffIcon className="h-6 w-6" />
            Nothing is recorded
          </span>
        </div>
      </div>

      <div className="flex flex-col items-center gap-4">
        <Button brand="kameleon" size="lg" fullWidth onClick={onStart}>
          Allow camera & begin AR
        </Button>
        <button
          type="button"
          onClick={onSkip}
          className="text-sm font-medium text-kameleon-copper-light underline-offset-4 hover:underline"
        >
          Continue without AR
        </button>
        <p className="flex items-center gap-1.5 text-center text-xs text-kameleon-text-muted">
          <ShieldIcon className="h-3.5 w-3.5 shrink-0" />
          Camera access is requested only when you tap above, is used only for this experience,
          and is never recorded or uploaded.
        </p>
      </div>
    </div>
  );
}

function CameraKitUnsupportedScreen({ reason, onContinue }: { reason: string; onContinue: () => void }) {
  return (
    <div className="flex flex-1 flex-col gap-6 px-6 pb-8">
      <KameleonFlowHeader
        steps={[
          { id: "commercial", label: "Commercial", status: "complete" },
          { id: "ar", label: "AR", status: "complete" },
          { id: "journey", label: "Journey", status: "current" },
        ]}
      />
      <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
        <h1 className="font-display text-xl font-semibold uppercase tracking-wide text-kameleon-copper-light">
          AR isn&apos;t available here
        </h1>
        <p className="max-w-xs text-sm text-kameleon-text-muted">{reason}</p>
      </div>
      <div className="flex flex-col items-center gap-4">
        <Button brand="kameleon" size="lg" fullWidth onClick={onContinue}>
          Continue to journey
        </Button>
      </div>
    </div>
  );
}

function CameraKitErrorScreen({
  error,
  onRetry,
  onContinueWithoutAr,
}: {
  error: SnapArError;
  onRetry: () => void;
  onContinueWithoutAr: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="font-display text-lg font-semibold uppercase tracking-wide text-kameleon-red">
        AR couldn&apos;t continue
      </h1>
      <p className="max-w-xs text-sm text-kameleon-text-muted">{error.message}</p>
      <div className="mt-2 flex w-full max-w-xs flex-col items-center gap-3">
        {error.recoverable && (
          <Button brand="kameleon" size="lg" fullWidth onClick={onRetry}>
            Try again
          </Button>
        )}
        <button
          type="button"
          onClick={onContinueWithoutAr}
          className="text-sm font-medium text-kameleon-copper-light underline-offset-4 hover:underline"
        >
          Continue without AR
        </button>
      </div>
    </div>
  );
}

function CameraKitHelpPanel({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="pointer-events-auto fixed inset-0 z-50 flex items-end justify-center bg-black/70 px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]"
      role="dialog"
      aria-modal="true"
      aria-label="AR help"
    >
      <div className="w-full max-w-sm rounded-2xl border border-kameleon-copper/40 bg-kameleon-surface p-5 text-center">
        <h2 className="font-display text-lg font-semibold uppercase tracking-wide text-kameleon-copper-light">
          About this AR experience
        </h2>
        <p className="mt-2 text-sm text-kameleon-text-muted">
          Point your rear camera at the space in front of you to see Kameleon come alive.
          Nothing is recorded, saved, or uploaded.
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
type SessionOutcome =
  | { type: "complete" }
  | { type: "exit" }
  | { type: "interrupted" }
  | { type: "error"; error: SnapArError };

function CameraKitSessionRuntime({
  onComplete,
  onExit,
  onInterrupted,
  onError,
}: {
  onComplete: () => void;
  onExit: () => void;
  onInterrupted: () => void;
  onError: (error: SnapArError) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [uiState, setUiState] = useState<UiState>("loading");
  const [helpOpen, setHelpOpen] = useState(false);
  const { muted: soundMuted, toggleMuted, play } = useKameleonSound();

  // Teardown handles — populated as each stage succeeds, so cleanup can
  // always reach whatever was actually created, no matter which stage failed.
  const cameraKitRef = useRef<CameraKit | null>(null);
  const sessionRef = useRef<CoreCameraKitSession | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafIdRef = useRef<number | null>(null);

  // cancelledRef is this attempt's cancellation/disposed guard: set exactly
  // once, synchronously, the instant runCleanup() first runs (unmount,
  // Exit AR, Continue Your Journey, a fatal error, or backgrounding — see
  // runCleanup below). Every `await` in the startup sequence (run(),
  // further down) re-checks it immediately on resume, before touching any
  // ref or React state, so a slow-resolving stage from an attempt that's
  // already being torn down can never win a race against the teardown.
  //
  // There's deliberately no separate "session generation" counter: this
  // component only ever runs ONE attempt per mounted instance (there's no
  // in-place retry — see handleRetry() in the parent, which returns to the
  // Start screen and bumps `sessionKey` so "Try Again" always mounts a
  // brand-new CameraKitSessionRuntime with entirely fresh refs). Two
  // attempts can therefore never share this ref or race each other; a
  // generation counter would be redundant with what React's own
  // mount/unmount identity already guarantees here.
  const cancelledRef = useRef(false);
  // Only the first exit path (complete / exit / interrupted / error) wins —
  // guards against e.g. a runtime LensExecutionError firing right as the
  // user taps "Continue Your Journey".
  const finishStartedRef = useRef(false);
  const cleanupStartedRef = useRef(false);
  const cleanupDoneRef = useRef(false);
  // On some mobile browsers, the native getUserMedia permission prompt
  // itself can toggle document.visibilityState to "hidden" (the OS-level
  // dialog briefly takes over). The visibilitychange handler below must not
  // treat that as backgrounding — doing so would cancel the session before
  // the visitor ever answers the prompt.
  const awaitingPermissionRef = useRef(false);

  // Plain (non-useCallback) function declarations below: they're hoisted,
  // which sidesteps ordering issues from their circular references
  // (runCleanup detaches handleSessionEvent; handleSessionEvent can trigger
  // finishWith; finishWith calls runCleanup). None of them need stable
  // identity across renders — the effect below has an empty dependency
  // array and only ever reads the versions from its own mount.

  function handleSessionEvent(event: CameraKitSessionEvents) {
    const { error: sdkError } = event.detail;
    if (sdkError.name === "LensExecutionError" || sdkError.name === "LensAbortError") {
      void finishWith({ type: "error", error: mapSnapArError(sdkError) });
    }
    // LensImagePickerError / LensVideoPlaybackMutedError are documented as
    // non-fatal (the lens keeps rendering) and aren't relevant to this
    // fixed camera source, so they're intentionally not escalated.
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

    cleanupDoneRef.current = true;
  }

  async function finishWith(outcome: SessionOutcome) {
    if (finishStartedRef.current) return;
    finishStartedRef.current = true;

    setUiState("ending");
    await runCleanup();

    if (outcome.type === "complete") onComplete();
    else if (outcome.type === "exit") onExit();
    else if (outcome.type === "interrupted") onInterrupted();
    else onError(outcome.error);
  }

  async function handleFatalError(err: unknown) {
    const mapped = err instanceof NoFrameTimeoutMarker ? NO_FRAME_TIMEOUT_ERROR : mapSnapArError(err);
    await finishWith({ type: "error", error: mapped });
  }

  // Release the camera immediately if the tab/app is backgrounded, per the
  // production security/privacy requirement — not just on unmount/refresh
  // (both already covered by the browser's own teardown of getUserMedia
  // streams and the effect cleanup below).
  useEffect(() => {
    function handleVisibility() {
      if (document.visibilityState === "hidden" && !awaitingPermissionRef.current) {
        void finishWith({ type: "interrupted" });
      }
    }
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let outerTimeoutId: number | null = null;

    async function run() {
      try {
        const config = getSnapCameraKitConfig();
        const cameraKit = await bootstrapCameraKit({ apiToken: config.apiToken });
        // Stale-attempt check #1 (SDK bootstrap): if this attempt was
        // cancelled (unmounted, or a fresher "Try Again" attempt — though
        // in this component's design each attempt is its own component
        // instance with its own refs, see the comment on cancelledRef,
        // so there is only ever one attempt per instance) while bootstrap
        // was in flight, the returned CameraKit instance is otherwise
        // never referenced anywhere and would leak — destroy it here
        // rather than just discarding the reference.
        if (cancelledRef.current) {
          await cameraKit.destroy().catch(() => undefined);
          return;
        }
        cameraKitRef.current = cameraKit;

        awaitingPermissionRef.current = true;
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: false,
        });
        awaitingPermissionRef.current = false;
        // Stale-attempt check #2 (camera permission): this is the exact
        // race the whole guard system exists for — getUserMedia() can
        // resolve well after the user navigated away, closed the
        // experience, or this component unmounted. If so: stop every
        // track on the just-returned stream immediately, never assign it
        // to streamRef (so cleanup can't double-stop it and nothing else
        // can pick it up), and never proceed to create a Camera Kit
        // session with it. No state update happens on this branch.
        if (cancelledRef.current) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        // Distinct from cancellation: permission may resolve while the
        // tab/app is still genuinely backgrounded (the visitor switched
        // away instead of answering, then answered later without
        // returning). Don't silently start bootstrapping AR in the
        // background — stop the stream and run the same "interrupted"
        // path used for backgrounding an active session.
        if (document.visibilityState === "hidden") {
          stream.getTracks().forEach((track) => track.stop());
          await finishWith({ type: "interrupted" });
          return;
        }
        streamRef.current = stream;

        const session = await cameraKit.createSession({
          liveRenderTarget: canvasRef.current ?? undefined,
        });
        if (cancelledRef.current) {
          await session.destroy().catch(() => undefined);
          return;
        }
        sessionRef.current = session;
        session.events.addEventListener("error", handleSessionEvent);

        const lens = await cameraKit.lensRepository.loadLens(config.lensId, config.lensGroupId);
        if (cancelledRef.current) return;

        await cameraKit.lensRepository.cacheLensContent([lens]);
        if (cancelledRef.current) return;

        const source = createMediaStreamSource(stream, { cameraType: "environment" });
        await session.setSource(source);
        if (cancelledRef.current) return;
        const applied = await session.applyLens(lens);
        if (cancelledRef.current) return;
        if (!applied) {
          throw new Error("Lens application was interrupted before it completed.");
        }

        const measurement = session.metrics.beginMeasurement();
        await session.play();
        if (cancelledRef.current) {
          measurement.end();
          return;
        }

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

        setUiState("ready");
        play("arComplete");
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

  return (
    <div className="relative flex flex-1 flex-col overflow-hidden">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full [object-fit:cover]" />

      {uiState !== "ready" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-kameleon-bg/90 px-6 text-center">
          <div
            className="h-8 w-8 animate-spin rounded-full border-2 border-kameleon-copper/30 border-t-kameleon-copper-light"
            aria-hidden="true"
          />
          <p className="text-sm text-kameleon-text-muted">
            {uiState === "ending" ? "Ending AR…" : "Starting AR…"}
          </p>
        </div>
      )}

      {uiState === "ready" && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center gap-3 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <div className="pointer-events-auto flex items-center justify-center gap-1 rounded-full bg-black/55 px-2 py-2 backdrop-blur-sm">
            <button
              type="button"
              onClick={toggleMuted}
              aria-label={soundMuted ? "Unmute Kameleon sound" : "Mute Kameleon sound"}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-kameleon-copper-light hover:bg-white/10"
            >
              {soundMuted ? <MuteIcon className="h-5 w-5" /> : <SoundIcon className="h-5 w-5" />}
            </button>
            <button
              type="button"
              onClick={() => setHelpOpen(true)}
              aria-label="AR help"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-kameleon-copper-light hover:bg-white/10"
            >
              <HelpIcon className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => void finishWith({ type: "exit" })}
              aria-label="Exit AR"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-kameleon-copper-light hover:bg-white/10"
            >
              <ExitIcon className="h-5 w-5" />
            </button>
          </div>
          <button
            type="button"
            onClick={() => void finishWith({ type: "complete" })}
            className="pointer-events-auto min-h-11 w-full max-w-xs rounded-full bg-kameleon-copper-light px-6 py-3 text-sm font-semibold uppercase tracking-wide text-kameleon-bg transition-colors hover:bg-kameleon-copper"
          >
            Continue Your Journey
          </button>
        </div>
      )}

      {helpOpen && <CameraKitHelpPanel onClose={() => setHelpOpen(false)} />}
    </div>
  );
}
