"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { LoadingState } from "@/components/ui/states";
import { useKameleonSound } from "@/lib/kameleon/useKameleonSound";
import { playKameleonSound } from "@/lib/kameleon/sound";
import { detectARCapability } from "@/lib/kameleon/ar/capability-detection";
import { startARSession, endARSession } from "@/lib/kameleon/ar/webxr-session";
import { createHitTestSource, getHitPose, applyHitPose, type HitTestController } from "@/lib/kameleon/ar/hit-test";
import {
  loadSampleModel,
  cloneLoadedModel,
  applyPlacementScale,
  disposeModel,
  type LoadedModel,
} from "@/lib/kameleon/ar/model-loader";
import { AnimationController } from "@/lib/kameleon/ar/animation-controller";
import { createReticle, type ReticleHandle } from "@/lib/kameleon/ar/reticle";
import { createEnergyRings, type EnergyRingsHandle } from "@/lib/kameleon/ar/energy-rings";
import {
  SAMPLE_MODEL_ANIMATIONS,
  type ARCapabilityResult,
  type ARError,
  type ARHitPose,
  type ARPathway,
  type ARPhase,
} from "@/lib/kameleon/ar/ar-types";
import { cn } from "@/lib/cn";
import { ARStartScreen } from "./ARStartScreen";
import { ARUnsupportedFallback } from "./ARUnsupportedFallback";
import { ARQuickLookScreen } from "./ARQuickLookScreen";
import { ARErrorState } from "./ARErrorState";
import { ARScanningOverlay } from "./ARScanningOverlay";
import { ARControls } from "./ARControls";
import { ARHelpPanel } from "./ARHelpPanel";

const LIVE_PHASES: ARPhase[] = ["requesting-session", "scanning", "surface-found", "placed", "tracking-lost"];

function normalizeError(err: unknown): ARError {
  if (err && typeof err === "object" && "code" in err && "message" in err && "recoverable" in err) {
    return err as ARError;
  }
  return {
    code: "unknown",
    message: "AR could not start on this device. You can continue without AR.",
    recoverable: true,
  };
}

/**
 * Top-level orchestrator for the Phase 5 real WebXR ground-plane AR
 * prototype. Owns the Three.js/WebXR imperative lifecycle (never React
 * state for the render loop itself) and layers the Kameleon-styled React UI
 * on top via a WebXR dom-overlay. Must only ever be mounted client-side
 * (see the dynamic(..., { ssr: false }) import at the call site).
 */
export function KameleonARExperience({
  onEnterJourney,
  onSkipAr,
}: {
  /** AR completed (placed or not) — end session, return to the pathway journey. */
  onEnterJourney: () => void;
  /** Skip/decline/exit AR entirely — still returns to the same journey entry point. */
  onSkipAr: () => void;
}) {
  const [pathway, setPathway] = useState<ARPathway>("checking");
  const [phase, setPhase] = useState<ARPhase>("start-screen");
  const [capability, setCapability] = useState<ARCapabilityResult | null>(null);
  const [error, setError] = useState<ARError | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const { muted: soundMuted, toggleMuted } = useKameleonSound();

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayRootRef = useRef<HTMLDivElement | null>(null);

  const phaseRef = useRef<ARPhase>("start-screen");
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const clockRef = useRef<THREE.Clock | null>(null);
  const sessionRef = useRef<XRSession | null>(null);
  const referenceSpaceRef = useRef<XRReferenceSpace | null>(null);
  const hitTestControllerRef = useRef<HitTestController | null>(null);
  const reticleRef = useRef<ReticleHandle | null>(null);
  const lastHitPoseRef = useRef<ARHitPose | null>(null);
  const modelLoadPromiseRef = useRef<Promise<LoadedModel> | null>(null);
  const placedModelRef = useRef<THREE.Object3D | null>(null);
  const animationControllerRef = useRef<AnimationController | null>(null);
  const energyRingsRef = useRef<EnergyRingsHandle | null>(null);
  const endingIntentRef = useRef<"none" | "enter-journey" | "exit-ar" | "error-already-set">("none");
  const cleanedUpRef = useRef(true);
  const resizeHandlerRef = useRef<(() => void) | null>(null);
  const selectListenerRef = useRef<(() => void) | null>(null);

  function setPhaseBoth(next: ARPhase) {
    phaseRef.current = next;
    setPhase(next);
  }

  // --- Capability check, once on mount — resolves which of the three real
  // AR paths (webxr / quicklook / unsupported) this device/browser gets. ---
  useEffect(() => {
    let cancelled = false;
    detectARCapability().then((result) => {
      if (cancelled) return;
      setCapability(result);
      setPathway(result.pathway);
      if (result.pathway === "webxr") setPhaseBoth("start-screen");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function recheckCapability() {
    setPathway("checking");
    detectARCapability().then((result) => {
      setCapability(result);
      setPathway(result.pathway);
      if (result.pathway === "webxr") setPhaseBoth("start-screen");
    });
  }

  // --- Full teardown on unmount, regardless of how the user left ---
  // Routed through a ref (updated every render, below) rather than closing
  // over `cleanupScene` directly, so this mount/unmount-only effect doesn't
  // need it in a dependency array — cleanupScene only ever touches refs
  // anyway, so there's no real staleness risk, just an unwanted re-run.
  const cleanupSceneRef = useRef<() => Promise<void>>(async () => {});
  // No dependency array — intentionally runs after every render, purely to
  // keep the ref pointed at the latest `cleanupScene` closure. Writing to a
  // ref during render itself isn't allowed by this project's lint rules.
  useEffect(() => {
    cleanupSceneRef.current = cleanupScene;
  });
  useEffect(() => {
    return () => {
      void cleanupSceneRef.current();
      if (sessionRef.current) void endARSession(sessionRef.current);
    };
  }, []);

  function ensureThreeSetup() {
    if (rendererRef.current && sceneRef.current && cameraRef.current) {
      return { renderer: rendererRef.current, scene: sceneRef.current, camera: cameraRef.current };
    }
    const canvas = canvasRef.current;
    if (!canvas) throw new Error("AR canvas not mounted");

    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 20);

    // Basic lighting for when light-estimation isn't granted/available.
    scene.add(new THREE.HemisphereLight(0xffffff, 0x3a3a3a, 1.2));
    const directional = new THREE.DirectionalLight(0xffffff, 1.0);
    directional.position.set(0.5, 1, 0.3);
    scene.add(directional);

    const reticle = createReticle();
    scene.add(reticle.object);
    reticleRef.current = reticle;

    clockRef.current = new THREE.Clock();

    const onResize = () => {
      renderer.setSize(window.innerWidth, window.innerHeight);
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
    };
    window.addEventListener("resize", onResize);
    resizeHandlerRef.current = onResize;

    rendererRef.current = renderer;
    sceneRef.current = scene;
    cameraRef.current = camera;
    cleanedUpRef.current = false;

    return { renderer, scene, camera };
  }

  function onXRFrame(_timestamp: number, frame?: XRFrame) {
    const renderer = rendererRef.current;
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    const clock = clockRef.current;
    if (!renderer || !scene || !camera || !clock) return;

    const delta = clock.getDelta();
    const elapsed = clock.getElapsedTime();

    if (frame) {
      const hitController = hitTestControllerRef.current;
      const referenceSpace = referenceSpaceRef.current;
      const reticle = reticleRef.current;

      if (!placedModelRef.current && hitController && referenceSpace && reticle) {
        const pose = getHitPose(frame, hitController.source, referenceSpace);
        if (pose) {
          applyHitPose(reticle.object, pose);
          reticle.setVisible(true);
          lastHitPoseRef.current = pose;
          if (phaseRef.current !== "surface-found") setPhaseBoth("surface-found");
        } else {
          reticle.setVisible(false);
          lastHitPoseRef.current = null;
          if (phaseRef.current === "surface-found") setPhaseBoth("scanning");
        }
        reticle.update(elapsed);
      }
    }

    if (placedModelRef.current) {
      animationControllerRef.current?.update(delta);
      energyRingsRef.current?.update(elapsed);
    }

    renderer.render(scene, camera);
  }

  async function handleSelect() {
    if (phaseRef.current !== "surface-found" || placedModelRef.current) return;
    const pose = lastHitPoseRef.current;
    const scene = sceneRef.current;
    if (!pose || !scene || !modelLoadPromiseRef.current) return;

    let modelData: LoadedModel;
    try {
      modelData = await modelLoadPromiseRef.current;
    } catch (err) {
      const arError = normalizeError(err);
      if (sessionRef.current) {
        // Ending the session fires handleSessionEnded, which would otherwise
        // overwrite this specific error with a generic "ended unexpectedly"
        // one — this flag tells it the error is already accounted for.
        endingIntentRef.current = "error-already-set";
        await endARSession(sessionRef.current);
      } else {
        await cleanupScene();
      }
      sessionRef.current = null;
      setError(arError);
      setPhaseBoth("error");
      return;
    }

    // Re-check eligibility — phase/placement could have changed while awaiting the load.
    if (phaseRef.current !== "surface-found" || placedModelRef.current) return;

    const modelInstance = cloneLoadedModel(modelData.scene);
    applyPlacementScale(modelInstance);
    applyHitPose(modelInstance, pose);
    scene.add(modelInstance);
    placedModelRef.current = modelInstance;

    const animController = new AnimationController(modelInstance, modelData.animations);
    animController.playPreferred(SAMPLE_MODEL_ANIMATIONS);
    animationControllerRef.current = animController;

    const energyRings = createEnergyRings();
    applyHitPose(energyRings.object, pose);
    scene.add(energyRings.object);
    energyRingsRef.current = energyRings;

    reticleRef.current?.setVisible(false);
    playKameleonSound("arComplete");
    setPhaseBoth("placed");
  }

  function handleVisibilityChange() {
    const session = sessionRef.current;
    if (!session) return;
    if (session.visibilityState === "visible-blurred") {
      if (placedModelRef.current) setPhaseBoth("tracking-lost");
    } else if (session.visibilityState === "visible" && phaseRef.current === "tracking-lost") {
      setPhaseBoth(placedModelRef.current ? "placed" : "scanning");
    }
  }

  async function handleSessionEnded() {
    const intent = endingIntentRef.current;
    endingIntentRef.current = "none";
    await cleanupScene();
    sessionRef.current = null;

    if (intent === "enter-journey") {
      onEnterJourney();
    } else if (intent === "exit-ar") {
      onSkipAr();
    } else if (intent === "error-already-set") {
      // A caller already set the specific error + phase before ending the
      // session — nothing further to do here.
    } else {
      // The session ended without this component initiating it — OS
      // interruption, browser back gesture, etc.
      setError({
        code: "session-ended-unexpectedly",
        message: "The AR session ended unexpectedly.",
        recoverable: true,
      });
      setPhaseBoth("error");
    }
  }

  function clearPlacement() {
    const scene = sceneRef.current;
    if (placedModelRef.current && scene) {
      scene.remove(placedModelRef.current);
      disposeModel(placedModelRef.current);
    }
    placedModelRef.current = null;

    animationControllerRef.current?.dispose();
    animationControllerRef.current = null;

    if (energyRingsRef.current && scene) {
      scene.remove(energyRingsRef.current.object);
      energyRingsRef.current.dispose();
    }
    energyRingsRef.current = null;

    lastHitPoseRef.current = null;
    setPhaseBoth("scanning");
  }

  async function cleanupScene() {
    if (cleanedUpRef.current) return;
    cleanedUpRef.current = true;

    const renderer = rendererRef.current;
    renderer?.setAnimationLoop(null);

    if (selectListenerRef.current) {
      sessionRef.current?.removeEventListener("select", selectListenerRef.current);
      selectListenerRef.current = null;
    }
    sessionRef.current?.removeEventListener("visibilitychange", handleVisibilityChange);

    hitTestControllerRef.current?.dispose();
    hitTestControllerRef.current = null;

    const scene = sceneRef.current;
    if (placedModelRef.current && scene) {
      scene.remove(placedModelRef.current);
      disposeModel(placedModelRef.current);
    }
    placedModelRef.current = null;

    animationControllerRef.current?.dispose();
    animationControllerRef.current = null;

    if (energyRingsRef.current && scene) {
      scene.remove(energyRingsRef.current.object);
      energyRingsRef.current.dispose();
    }
    energyRingsRef.current = null;

    if (reticleRef.current && scene) {
      scene.remove(reticleRef.current.object);
      reticleRef.current.dispose();
    }
    reticleRef.current = null;

    if (resizeHandlerRef.current) {
      window.removeEventListener("resize", resizeHandlerRef.current);
      resizeHandlerRef.current = null;
    }

    renderer?.dispose();
    rendererRef.current = null;
    sceneRef.current = null;
    cameraRef.current = null;
    clockRef.current = null;
    referenceSpaceRef.current = null;
    lastHitPoseRef.current = null;
    modelLoadPromiseRef.current = null;
  }

  async function handleStartAr() {
    if (phaseRef.current === "requesting-session") return; // guard double-tap
    setError(null);
    setPhaseBoth("requesting-session");

    let renderer: THREE.WebGLRenderer;
    try {
      ({ renderer } = ensureThreeSetup());
    } catch {
      setError({ code: "unknown", message: "AR could not start on this device.", recoverable: true });
      setPhaseBoth("error");
      return;
    }

    modelLoadPromiseRef.current = loadSampleModel();

    let session: XRSession | null = null;
    try {
      const result = await startARSession({
        renderer,
        domOverlayRoot: overlayRootRef.current ?? undefined,
        onSessionEnd: () => void handleSessionEnded(),
      });
      session = result.session;
      sessionRef.current = session;
      referenceSpaceRef.current = result.referenceSpace;

      const hitTestController = await createHitTestSource(session);
      hitTestControllerRef.current = hitTestController;

      const onSelect = () => void handleSelect();
      selectListenerRef.current = onSelect;
      session.addEventListener("select", onSelect);
      session.addEventListener("visibilitychange", handleVisibilityChange);

      clockRef.current?.start();
      renderer.setAnimationLoop(onXRFrame);
      setPhaseBoth("scanning");
    } catch (err) {
      const arError = normalizeError(err);
      if (session) {
        // Same reasoning as handleSelect's catch: ending an already-obtained
        // session (e.g. hit-test-source request failed) fires the "end"
        // event, so flag that this specific error is already accounted for.
        endingIntentRef.current = "error-already-set";
        await endARSession(session);
      } else {
        await cleanupScene();
      }
      sessionRef.current = null;
      setError(arError);
      setPhaseBoth("error");
    }
  }

  async function handleExitAr() {
    if (!sessionRef.current) {
      onSkipAr();
      return;
    }
    endingIntentRef.current = "exit-ar";
    await endARSession(sessionRef.current);
  }

  async function handleEnterJourney() {
    if (!sessionRef.current) {
      onEnterJourney();
      return;
    }
    endingIntentRef.current = "enter-journey";
    await endARSession(sessionRef.current);
  }

  function handleRetry() {
    // Error phases only ever happen within the webxr pathway (session
    // start/hit-test/model-load failures), so retrying just resets back to
    // that pathway's own start screen — no need to re-run capability
    // detection here.
    setError(null);
    cleanedUpRef.current = true;
    endingIntentRef.current = "none";
    setPhaseBoth("start-screen");
  }

  const isLive = pathway === "webxr" && LIVE_PHASES.includes(phase);

  return (
    <div className="relative flex flex-1 flex-col overflow-hidden">
      {/* Canvas + DOM overlay stay permanently mounted from first render so
          the WebGL context and the dom-overlay root both already exist in
          the DOM by the time a session is requested from a user gesture. */}
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-hidden="true" />
      <div ref={overlayRootRef} className="pointer-events-none absolute inset-0 flex flex-col justify-between">
        {isLive && <ARScanningOverlay phase={phase} />}
        {isLive && (
          <ARControls
            soundMuted={soundMuted}
            placed={phase === "placed"}
            onToggleSound={toggleMuted}
            onReposition={clearPlacement}
            onReset={clearPlacement}
            onHelp={() => setHelpOpen(true)}
            onExitAr={() => void handleExitAr()}
            onEnterJourney={() => void handleEnterJourney()}
          />
        )}
        {helpOpen && <ARHelpPanel onClose={() => setHelpOpen(false)} />}
      </div>

      {/* Pathway/phase-specific screens paint over the (empty, transparent
          until a webxr session starts) canvas — normal DOM order puts them
          on top. */}
      <div className={cn("relative flex flex-1 flex-col bg-kameleon-bg", isLive && "pointer-events-none opacity-0")}>
        {pathway === "checking" && (
          <div className="flex flex-1 items-center justify-center">
            <LoadingState brand="kameleon" message="Checking AR support…" />
          </div>
        )}
        {pathway === "webxr" && phase === "start-screen" && (
          <ARStartScreen checking={false} onStart={() => void handleStartAr()} onSkip={onSkipAr} />
        )}
        {pathway === "webxr" && phase === "error" && error && (
          <ARErrorState error={error} onRetry={handleRetry} onContinueWithoutAr={onSkipAr} />
        )}
        {pathway === "quicklook" && <ARQuickLookScreen onEnterJourney={onEnterJourney} onSkipAr={onSkipAr} />}
        {pathway === "unsupported" && (
          <ARUnsupportedFallback
            reason={capability?.reason ?? "AR isn't available on this device or browser."}
            onTryAr={recheckCapability}
            onContinue={onSkipAr}
          />
        )}
      </div>
    </div>
  );
}
