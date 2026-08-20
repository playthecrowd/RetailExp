"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import {
  DeviceMotionIcon,
  MuteIcon,
  PauseIcon,
  PlayIcon,
  RecenterIcon,
  ReplayIcon,
  SoundIcon,
} from "./icons";
import { cn } from "@/lib/cn";

/**
 * A 2:1 equirectangular video viewer.
 *
 * WHAT IT IS FOR
 *   An OPTIONAL immersive view offered alongside a decision. It is opened from
 *   a button and closed back to exactly what was underneath. It is not a second
 *   journey, it never replaces the standard playback path, and closing it never
 *   advances anything.
 *
 * IT WILL NOT FAKE 360
 *   The caller is responsible for only rendering this when the source is a
 *   genuine 2:1 equirectangular asset. Mapping a normal 16:9 video onto a
 *   sphere produces a smeared band with a hole at each pole, which looks like
 *   a bug and is one.
 *
 * WHY A SPHERE WITH INVERTED NORMALS
 *   The camera sits at the centre of a sphere whose geometry is scaled by -1
 *   on X, which flips the faces inward and un-mirrors the texture. This is the
 *   standard equirectangular projection and needs no shader of its own.
 *
 * THE END OF THE CLIP IS NOT THE END OF THE VISIT
 *   Reaching 0:00 keeps the overlay open on the final frame, still draggable,
 *   still explorable, with Replay offered. A lounge that evicted the visitor
 *   the moment the minute ran out would punish them for looking around slowly,
 *   which is the one thing this feature exists to encourage.
 *
 * MOTION SOURCES, IN ORDER OF PREFERENCE
 *   1. Device orientation, if the visitor grants it. iOS requires a call in
 *      response to a user gesture, which is why it is a button and not an
 *      automatic request.
 *   2. Drag and touch, always available.
 *   There is no third mode and no auto-rotation: a view that moves on its own
 *   is disorienting on a phone held at arm's length.
 *
 * EVERY EXIT IS THE SAME EXIT
 *   Return to Choices, Escape and browser Back all call the one `exit` path.
 *   The clip ending is deliberately NOT one of them.
 *
 * ACCESSIBILITY AND SAFETY
 *   Motion control is OFF until explicitly enabled, which is also the
 *   no-motion fallback — someone who is motion-sensitive, or whose device has
 *   no gyroscope, drags instead and loses nothing. Under prefers-reduced-motion
 *   the clip does not start itself, the attention pulse becomes a static
 *   highlight, and the controls appear without staggered movement.
 */

/** Vertical look limit. Past this the horizon inverts and the view is
 *  disorienting rather than immersive. */
const MAX_PITCH = Math.PI / 2 - 0.05;

/** Radians per pixel of drag. Tuned so a full turn is roughly one screen
 *  width, which matches how people expect a panorama to behave. */
const DRAG_SENSITIVITY = 0.0042;

/** Timer ring geometry. The circumference is the dash array, so the visible
 *  arc is simply circumference * fraction-remaining. */
const RING_RADIUS = 26;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

export interface Video360ViewerProps {
  src: string;
  poster?: string;
  /** Where the standard player had got to, so 360 opens in the same place.
   *  Omitted when the 360 asset is its own clip rather than an alternate cut
   *  of the chapter — a lounge that always starts at the beginning. */
  startTime?: number;
  /** Receives the 360 view's position. The caller decides whether that means
   *  anything: for an alternate cut of a chapter it does, for a standalone
   *  environment it does not. */
  onExit: (currentTime: number) => void;
  title?: string;
  /**
   * Label on the primary exit. Opened from a decision it reads "Return to
   * Choices", because that is where it returns to and saying so is the whole
   * reassurance that looking around costs the visitor nothing.
   */
  exitLabel?: string;
}

type Phase = "loading" | "ready" | "error";

/**
 * Where the device-orientation offer stands.
 *
 * `idle` is the only state that asks for attention. Everything else is a
 * settled answer, and a control that keeps pulsing after it has been answered
 * is nagging rather than helping.
 */
type MotionState = "idle" | "enabled" | "denied" | "unavailable" | "dismissed";

function formatClock(seconds: number): string {
  const safe = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
}

export function Video360Viewer({
  src,
  poster,
  startTime = 0,
  onExit,
  title,
  exitLabel = "Return to Choices",
}: Video360ViewerProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Look direction, in refs rather than state: this changes every frame and a
  // re-render per frame would be both pointless and janky.
  const yawRef = useRef(0);
  const pitchRef = useRef(0);
  const draggingRef = useRef(false);
  const lastPointerRef = useRef<{ x: number; y: number } | null>(null);
  const orientationRef = useRef(false);

  const [phase, setPhase] = useState<Phase>("loading");
  const [playing, setPlaying] = useState(false);
  const [finished, setFinished] = useState(false);
  // Muted at open, always. Autoplay of audible video is refused by every
  // current mobile browser, so starting unmuted would mean starting stopped.
  const [muted, setMuted] = useState(true);
  // A device fact, decided once at mount like webglSupported above rather than
  // corrected afterwards in an effect: a device with no orientation API gets no
  // offer at all, rather than a button that pulses for attention and then does
  // nothing when tapped.
  const [motionState, setMotionState] = useState<MotionState>(() =>
    typeof window !== "undefined" && "DeviceOrientationEvent" in window ? "idle" : "unavailable",
  );
  /** Bumped by Retry to force a fresh <video> element rather than asking a
   *  failed one to try again, which browsers will not reliably do. */
  const [attempt, setAttempt] = useState(0);

  /** Whole seconds left, for the readout and the screen-reader label. The RING
   *  is not driven from state — see the countdown effect. */
  const [remaining, setRemaining] = useState<number | null>(null);
  const [duration, setDuration] = useState(0);

  // These are facts about the DEVICE, decided once at mount rather than
  // synchronised in an effect. This component is only ever loaded with
  // ssr: false, so touching window in an initializer is safe — and computing
  // them here avoids a cascading render on every open.
  const [webglSupported] = useState(() => {
    try {
      const probe = document.createElement("canvas");
      return Boolean(probe.getContext("webgl2") ?? probe.getContext("webgl"));
    } catch {
      return false;
    }
  });
  const [reducedMotion] = useState(
    () =>
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  /** Drives the one-per-opening entry animation. Starts false so the first
   *  paint commits with the controls in their "before" position, then flips on
   *  a later frame so the transition actually has something to run from. */
  const [entered, setEntered] = useState(false);

  const ringRef = useRef<SVGCircleElement>(null);

  // exit is called from a keydown listener, a popstate listener and buttons.
  // A ref guard makes it idempotent: browser Back fires popstate AND unwinds
  // the history entry this component pushed, and without the guard a close
  // could be counted twice and pop an entry belonging to the Journey itself.
  const exitedRef = useRef(false);
  // Held in a ref, and refreshed in an effect rather than during render, so
  // that `exit` keeps a stable identity. The keydown and popstate listeners
  // below are keyed on it; a new identity every render would tear down and
  // re-add both, and would re-push a history entry each time the parent
  // re-rendered.
  const onExitRef = useRef(onExit);
  useEffect(() => {
    onExitRef.current = onExit;
  }, [onExit]);

  const exit = useCallback(() => {
    if (exitedRef.current) return;
    exitedRef.current = true;
    // Take our history entry back off the stack, here rather than in an effect
    // cleanup. When the visitor got here by pressing Back the browser has
    // already popped it and the marker is gone, so this correctly does nothing
    // and cannot eat the Journey's own entry.
    if (window.history.state?.kameleon360) window.history.back();
    onExitRef.current(videoRef.current?.currentTime ?? startTime);
  }, [startTime]);

  const recenter = useCallback(() => {
    yawRef.current = 0;
    pitchRef.current = 0;
  }, []);

  /**
   * A rejected play() is NOT a broken video.
   *
   * It is usually NotAllowedError, the autoplay policy asking for a gesture,
   * or AbortError, a play interrupted by a load or a pause. Escalating either
   * to the error screen is what shipped, and it showed "The 360 view could not
   * be loaded" over a perfectly healthy 4K video the moment a throttled tab
   * declined to start it. Only the element's own `error` event means the media
   * actually failed; a refusal just leaves the clip paused with Play offered,
   * which is already the honest state.
   */
  const play = useCallback(() => {
    void videoRef.current?.play().catch(() => {});
  }, []);

  const pause = useCallback(() => {
    videoRef.current?.pause();
  }, []);

  const replay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    // Rewind BEFORE clearing `finished`, so no frame is ever rendered in which
    // the clip claims to be running while currentTime still sits at the end
    // and the ring is still empty.
    video.currentTime = 0;
    setFinished(false);
    // Same reasoning as `play`: a refusal is not a failure. The clip is
    // rewound either way, so the visitor gets a Play control on frame one
    // rather than an error over a working video.
    void video.play().catch(() => {});
  }, []);

  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setMuted(video.muted);
  }, []);

  const retry = useCallback(() => {
    setPhase("loading");
    setFinished(false);
    setAttempt((n) => n + 1);
  }, []);

  // ---- The scene ---------------------------------------------------------
  useEffect(() => {
    const mount = mountRef.current;
    const video = videoRef.current;
    // Checked before constructing anything: a device with no WebGL renders the
    // fallback below instead of a black rectangle, and the effect does no work
    // it would only have to undo.
    if (!mount || !video || !webglSupported) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true });

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      75,
      mount.clientWidth / mount.clientHeight,
      0.1,
      100,
    );

    const texture = new THREE.VideoTexture(video);
    texture.colorSpace = THREE.SRGBColorSpace;

    // Inverted normals: the camera is INSIDE this sphere.
    const geometry = new THREE.SphereGeometry(50, 60, 40);
    geometry.scale(-1, 1, 1);
    const material = new THREE.MeshBasicMaterial({ map: texture });
    const sphere = new THREE.Mesh(geometry, material);
    // Put the video's OWN forward direction at the visitor's initial heading.
    //
    // SphereGeometry maps the middle of the texture to +X (and the -1 scale
    // above flips that to -X), while the camera opens looking down -Z. So a
    // 360 video whose hero is centred in the frame - which is what an
    // equirectangular delivery means by "forward" - opens 90 degrees to the
    // side of it. In production that showed as the lounge opening on an empty
    // alcove with the bottle out of frame, which is precisely the thing the
    // brief asks for: the bottle is meant to be the first thing seen.
    //
    // A quarter turn on the MESH rather than the camera, so yaw 0 still means
    // "the hero", and Recenter therefore returns to the hero rather than to an
    // arbitrary wall.
    sphere.rotation.y = -Math.PI / 2;
    scene.add(sphere);

    let frame = 0;
    const render = () => {
      frame = requestAnimationFrame(render);
      camera.rotation.order = "YXZ";
      camera.rotation.y = yawRef.current;
      camera.rotation.x = pitchRef.current;
      renderer.render(scene, camera);
    };
    render();

    const onResize = () => {
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    };
    window.addEventListener("resize", onResize);
    // Rotating a phone does not fire resize on every browser, and a stale
    // aspect ratio stretches the whole lounge.
    window.addEventListener("orientationchange", onResize);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
      geometry.dispose();
      texture.dispose();
      material.dispose();
      renderer.dispose();
      // Explicit: WebGL contexts are a limited resource and a phone that opens
      // 360 a few times per session will run out if these are left dangling.
      renderer.forceContextLoss();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
    };
  }, [webglSupported, attempt]);

  // ---- Load, position, and the decision about starting -------------------
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // Belt and braces. React sets `muted` as a DOM property rather than an
    // attribute, and the timing of that against the first play() attempt has
    // historically been unreliable enough that an unmuted 4K video gets its
    // autoplay refused on mobile - which presents as "the 360 view opens
    // frozen". Setting it directly costs nothing and removes the question.
    // Literal true rather than the state: this runs on open and on Retry, and
    // both of those are starts, which the brief says begin muted.
    video.muted = true;

    // Self-healing, because the cleanup below strips the source to cancel the
    // download and StrictMode re-invokes this effect straight after running
    // it. React will not re-set an attribute it believes is unchanged, so
    // without this the video sat at networkState EMPTY with a src it was never
    // going to load, and the sphere rendered black - in development only,
    // which is the worst place for a bug to hide.
    if (video.getAttribute("src") !== src) {
      video.setAttribute("src", src);
      video.load();
    }

    const onReady = () => {
      setPhase("ready");
      setDuration(Number.isFinite(video.duration) ? video.duration : 0);
      // Seeking before metadata exists is silently ignored, which is how a
      // chapter's 360 cut used to open at zero however far in the visitor was.
      if (startTime > 0 && Number.isFinite(video.duration)) {
        video.currentTime = Math.min(startTime, video.duration - 0.1);
      }
      if (reducedMotion) return;
      void video.play().catch(() => {
        // Autoplay refusal is not an error worth surfacing: the Play control
        // is right there and the visitor can start it.
      });
    };
    const onError = () => setPhase("error");
    const onPlay = () => {
      setPlaying(true);
      setFinished(false);
    };
    const onPause = () => setPlaying(false);
    // The end of the clip is NOT an exit. The overlay stays open on the final
    // frame, still draggable, with Replay offered - see the component note.
    const onEnded = () => {
      setFinished(true);
      setPlaying(false);
    };

    video.addEventListener("loadedmetadata", onReady);
    video.addEventListener("error", onError);
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("ended", onEnded);

    // A source that is already loaded fires nothing, so the ready path has to
    // be taken directly rather than waited for.
    if (video.readyState >= 1) onReady();

    return () => {
      video.removeEventListener("loadedmetadata", onReady);
      video.removeEventListener("error", onError);
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("ended", onEnded);
      video.pause();
      // Drop the download. Without this a closed viewer keeps pulling a 4K
      // video over someone's mobile data.
      video.removeAttribute("src");
      video.load();
    };
  }, [src, startTime, reducedMotion, attempt]);

  // ---- The countdown -----------------------------------------------------
  //
  // The RING is written straight to the DOM from an animation frame, and only
  // the whole-second readout goes through state. Driving the ring from state
  // would mean a React render per frame to move a stroke offset; driving the
  // readout from the frame loop would mean hand-managing a text node for
  // something that changes once a second. Each half is done the cheap way.
  //
  // Pause, seek and replay all need no bookkeeping of their own: the ring is a
  // pure function of video.currentTime, so it freezes when playback freezes
  // and snaps the moment the playhead moves.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let frame = 0;
    let lastWhole = -1;

    const tick = () => {
      frame = requestAnimationFrame(tick);
      const total = Number.isFinite(video.duration) ? video.duration : 0;
      if (total <= 0) return;

      const left = Math.max(0, total - video.currentTime);
      const ring = ringRef.current;
      if (ring) {
        // Visible arc = circumference * fraction remaining, so the ring
        // shortens as the clip plays and reaches empty exactly at 0:00.
        ring.style.strokeDashoffset = String(RING_CIRCUMFERENCE * (1 - left / total));
      }
      const whole = Math.ceil(left);
      if (whole !== lastWhole) {
        lastWhole = whole;
        setRemaining(whole);
      }
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [attempt]);

  // ---- Drag and touch ----------------------------------------------------
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const down = (event: PointerEvent) => {
      draggingRef.current = true;
      lastPointerRef.current = { x: event.clientX, y: event.clientY };
    };
    const move = (event: PointerEvent) => {
      if (!draggingRef.current || !lastPointerRef.current || orientationRef.current) return;
      const dx = event.clientX - lastPointerRef.current.x;
      const dy = event.clientY - lastPointerRef.current.y;
      lastPointerRef.current = { x: event.clientX, y: event.clientY };
      yawRef.current -= dx * DRAG_SENSITIVITY;
      pitchRef.current = Math.max(
        -MAX_PITCH,
        Math.min(MAX_PITCH, pitchRef.current - dy * DRAG_SENSITIVITY),
      );
    };
    const up = () => {
      draggingRef.current = false;
      lastPointerRef.current = null;
    };

    mount.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      mount.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, []);

  // ---- Escape exits ------------------------------------------------------
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") exit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [exit]);

  // ---- Browser Back closes the overlay, not the Journey -------------------
  useEffect(() => {
    // The overlay is not a route, so without an entry of its own Back would
    // leave the Journey entirely and lose the chapter the visitor was on.
    // Pushing one makes Back mean "close this", which is what a full-screen
    // overlay looks like it should do.
    //
    // Guarded on the marker rather than pushed unconditionally, and unwound in
    // `exit` rather than in this cleanup, because StrictMode runs an effect,
    // its cleanup, and the effect again on mount. Popping in the cleanup made
    // that sequence push, pop, push - and the pop's popstate then arrived at
    // the freshly re-registered listener and closed the overlay the instant it
    // opened. It worked in production, where effects do not double-invoke, and
    // failed in development, which is the worst way round for a bug to sit.
    if (!window.history.state?.kameleon360) {
      window.history.pushState({ kameleon360: true }, "");
    }
    const onPop = () => exit();
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [exit]);

  // ---- The entry animation, once per opening ------------------------------
  useEffect(() => {
    // Two frames, not one: the first paint has to actually commit with the
    // controls in their "before" state, or the browser coalesces both styles
    // and there is no transition left to run. Nothing here gates interaction —
    // the controls are mounted and clickable from the first frame, they are
    // only travelling the last few pixels.
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => setEntered(true));
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, []);

  // ---- Device orientation, only after an explicit grant -------------------
  useEffect(() => {
    const active = motionState === "enabled";
    orientationRef.current = active;
    if (!active) return;

    const onOrientation = (event: DeviceOrientationEvent) => {
      if (event.alpha === null || event.beta === null) return;
      yawRef.current = THREE.MathUtils.degToRad(event.alpha);
      pitchRef.current = Math.max(
        -MAX_PITCH,
        Math.min(MAX_PITCH, THREE.MathUtils.degToRad(event.beta - 90)),
      );
    };

    window.addEventListener("deviceorientation", onOrientation);
    return () => window.removeEventListener("deviceorientation", onOrientation);
  }, [motionState]);

  const enableMotion = useCallback(async () => {
    // iOS gates this behind a permission call that must happen inside a user
    // gesture, which is why this is a button rather than something automatic.
    const api = window.DeviceOrientationEvent as unknown as {
      requestPermission?: () => Promise<"granted" | "denied">;
    };
    if (typeof api?.requestPermission === "function") {
      try {
        if ((await api.requestPermission()) !== "granted") {
          setMotionState("denied");
          return;
        }
      } catch {
        setMotionState("denied");
        return;
      }
    }
    // Android and desktop have no permission gate: the same control simply
    // starts listening.
    setMotionState("enabled");
  }, []);

  // ---- Presentation -------------------------------------------------------

  /** The pulse runs only while the offer is still open, and stops the instant
   *  it is answered — granted, refused, or waved away. */
  const wantsAttention = motionState === "idle" && phase === "ready";

  const clock = formatClock(remaining ?? duration);
  const ringVisible = phase === "ready" && duration > 0;

  /** Shared chrome for every control: dark glass over the panorama, a copper
   *  hairline, and a copper-light focus ring that stays visible against both
   *  the bright skyline and the near-black marble. */
  const chrome =
    "pointer-events-auto inline-flex items-center justify-center gap-2 rounded-full " +
    "border border-kameleon-copper/45 bg-black/55 text-kameleon-text backdrop-blur-md " +
    "transition-colors hover:border-kameleon-copper hover:bg-black/70 " +
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kameleon-copper-light " +
    "focus-visible:ring-offset-2 focus-visible:ring-offset-black/60";

  /** 44px minimum on every side, per the brief and per anyone using this on a
   *  phone with one thumb. */
  const secondary = `${chrome} min-h-11 min-w-11 px-4 text-xs`;

  /** The two primary controls. The label's own gradient — deep red into teal
   *  under a copper rim — quotes the bottle's palette; the mark itself is
   *  never redrawn. */
  const primary =
    `${chrome} min-h-14 px-6 text-sm font-semibold uppercase tracking-widest ` +
    "border-kameleon-copper/80 bg-gradient-to-r from-kameleon-red/45 via-black/70 to-kameleon-teal/45 " +
    "shadow-[0_2px_20px_-6px_rgba(192,133,82,0.55)] hover:border-kameleon-copper-light";

  /** Entry animation: a short rise and fade, staggered, once per opening.
   *  Reduced motion gets the same controls with no movement and no delay. */
  const enterClass = reducedMotion
    ? ""
    : cn(
        "transition-[opacity,transform] duration-500 ease-out",
        entered ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0",
      );
  // Inline, not an arbitrary Tailwind class: a delay built from a template
  // literal is invisible to the compiler's source scan and would never be
  // generated.
  const enterStyle = (delayMs: number) =>
    reducedMotion ? undefined : { transitionDelay: `${delayMs}ms` };

  return (
    <div
      className="fixed inset-0 z-50 bg-black"
      role="dialog"
      aria-modal="true"
      aria-label={title ? `${title} in 360°` : "360° view"}
    >
      <div ref={mountRef} className="h-full w-full touch-none" aria-hidden="true" />

      <video
        key={attempt}
        ref={videoRef}
        src={src}
        poster={poster}
        playsInline
        // React does not emit the legacy attribute, and older iOS WebViews
        // still read it. Without it they take the video fullscreen on play,
        // which destroys the sphere the whole view is made of.
        {...{ "webkit-playsinline": "true" }}
        muted={muted}
        loop={false}
        preload="auto"
        crossOrigin="anonymous"
        className="sr-only"
      />

      {!webglSupported && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
          <p className="text-sm text-white">This device cannot show the 360° view.</p>
          <p className="max-w-xs text-xs text-white/70">
            The standard version of this chapter is still available.
          </p>
          <button type="button" onClick={exit} className={secondary}>
            {exitLabel}
          </button>
        </div>
      )}

      {webglSupported && phase === "loading" && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3">
          <span
            className="h-8 w-8 animate-spin rounded-full border-2 border-kameleon-copper/25 border-t-kameleon-copper-light"
            aria-hidden="true"
          />
          <p className="text-xs text-white/70">Loading the 360° lounge…</p>
        </div>
      )}

      {webglSupported && phase === "error" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/80 px-6 text-center">
          <p className="text-sm text-white">The 360° view could not be loaded.</p>
          <div className="flex gap-2">
            <button type="button" onClick={retry} className={secondary}>
              Retry
            </button>
            <button type="button" onClick={exit} className={secondary}>
              {exitLabel}
            </button>
          </div>
        </div>
      )}

      {/* Top rail. The timer takes the corner and the exit sits directly under
          it — the brief's stated fallback for when those two would collide.
          Both stay reachable and neither covers the hero. */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-4"
        style={{
          paddingTop: "max(1rem, env(safe-area-inset-top))",
          paddingLeft: "max(1rem, env(safe-area-inset-left))",
          paddingRight: "max(1rem, env(safe-area-inset-right))",
        }}
      >
        {title && (
          <p className="max-w-[45%] text-xs text-white/80 landscape:max-w-[30%]">{title}</p>
        )}

        <div className="ml-auto flex flex-col items-end gap-2">
          {ringVisible && (
            <div
              className={cn("pointer-events-none relative h-16 w-16 landscape:h-12 landscape:w-12", enterClass)}
              style={enterStyle(0)}
              role="timer"
              aria-live="off"
              aria-label={`${Math.max(0, remaining ?? 0)} seconds remaining`}
              data-testid="countdown"
            >
              <svg viewBox="0 0 64 64" className="h-full w-full -rotate-90">
                <circle
                  cx="32"
                  cy="32"
                  r={RING_RADIUS}
                  fill="rgba(0,0,0,0.55)"
                  stroke="rgba(192,133,82,0.22)"
                  strokeWidth="4"
                />
                <circle
                  ref={ringRef}
                  cx="32"
                  cy="32"
                  r={RING_RADIUS}
                  fill="none"
                  // Teal once it is spent, copper while it runs. The colour is
                  // a second signal, never the only one: the readout says the
                  // same thing in words.
                  stroke={finished ? "var(--kameleon-teal-light)" : "var(--kameleon-copper)"}
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeDasharray={RING_CIRCUMFERENCE}
                  strokeDashoffset={0}
                />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-[13px] font-semibold tabular-nums text-kameleon-text landscape:text-[11px]">
                {clock}
              </span>
            </div>
          )}

          <button
            type="button"
            onClick={exit}
            className={cn(secondary, enterClass)}
            style={enterStyle(260)}
          >
            {exitLabel}
          </button>
        </div>
      </div>

      {/* The controls sit at the bottom because the bottle is the centre of
          the forward view, and the brief is explicit that nothing may cover
          its label. */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center gap-3 p-4 landscape:gap-2"
        style={{
          paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
          paddingLeft: "max(1rem, env(safe-area-inset-left))",
          paddingRight: "max(1rem, env(safe-area-inset-right))",
        }}
      >
        {/* Primary row. Play/Replay and Use Device Motion are the two controls
            the brief wants found first, so they are the only ones at this
            size, in this colour, and on their own line. */}
        <div
          className={cn("flex flex-wrap items-center justify-center gap-3", enterClass)}
          style={enterStyle(120)}
        >
          {finished ? (
            <button type="button" onClick={replay} className={primary} data-testid="primary-replay">
              <ReplayIcon className="h-5 w-5" />
              Replay
            </button>
          ) : (
            !playing && (
              <button type="button" onClick={play} className={primary} data-testid="primary-play">
                <PlayIcon className="h-5 w-5" />
                Play
              </button>
            )
          )}

          {motionState !== "unavailable" && motionState !== "enabled" && (
            <button
              type="button"
              onClick={enableMotion}
              aria-describedby="kameleon-motion-state"
              className={cn(
                primary,
                wantsAttention &&
                  (reducedMotion ? "kameleon-attention-static" : "kameleon-attention"),
              )}
              data-testid="primary-device-motion"
            >
              <DeviceMotionIcon className="h-5 w-5" />
              {motionState === "denied" ? "Try Motion Again" : "Use Device Motion"}
            </button>
          )}

          {motionState === "enabled" && (
            <button
              type="button"
              onClick={() => setMotionState("dismissed")}
              className={primary}
              data-testid="primary-device-motion"
            >
              <DeviceMotionIcon className="h-5 w-5" />
              Stop Device Motion
            </button>
          )}
        </div>

        {/* Secondary rail: smaller, quieter, and never competing with the two
            above. Pause lives here rather than in the primary row because the
            brief ranks it below Play/Replay. */}
        <div
          className={cn("flex flex-wrap items-center justify-center gap-2", enterClass)}
          style={enterStyle(320)}
        >
          {playing && (
            <button type="button" onClick={pause} aria-label="Pause" className={secondary}>
              <PauseIcon className="h-4 w-4" />
              Pause
            </button>
          )}
          <button
            type="button"
            onClick={toggleMute}
            aria-label={muted ? "Unmute" : "Mute"}
            className={secondary}
          >
            {muted ? <MuteIcon className="h-4 w-4" /> : <SoundIcon className="h-4 w-4" />}
            {muted ? "Unmute" : "Mute"}
          </button>
          <button type="button" onClick={recenter} aria-label="Recenter" className={secondary}>
            <RecenterIcon className="h-4 w-4" />
            Recenter
          </button>
        </div>

        {/* Hidden in landscape, where vertical room is the scarce thing and
            the panorama has to stay dominant. */}
        <p
          id="kameleon-motion-state"
          className="w-full text-center text-[11px] text-white/60 landscape:hidden"
        >
          {motionState === "enabled"
            ? "Device motion on — move your phone to look around."
            : motionState === "denied"
              ? "Motion access was declined. Drag to look around instead."
              : motionState === "unavailable"
                ? "Drag to look around. Your choices are waiting when you return."
                : finished
                  ? "Still here — look around, or replay the lounge."
                  : "Drag to look around. Your choices are waiting when you return."}
        </p>
      </div>
    </div>
  );
}
