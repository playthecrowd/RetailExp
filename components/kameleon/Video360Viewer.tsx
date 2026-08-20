"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";

/**
 * A 2:1 equirectangular video viewer.
 *
 * WHAT IT IS FOR
 *   An OPTIONAL immersive view offered alongside a decision, and an optional
 *   alternate view of a chapter that has a genuine 360 asset. Either way it is
 *   opened from a button and closed back to exactly what was underneath. It is
 *   not a second journey, it never replaces the standard playback path, and
 *   closing it never advances anything.
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
 * MOTION SOURCES, IN ORDER OF PREFERENCE
 *   1. Device orientation, if the visitor grants it. iOS requires a call in
 *      response to a user gesture, which is why it is a button and not an
 *      automatic request.
 *   2. Drag and touch, always available.
 *   There is no third mode and no auto-rotation: a view that moves on its own
 *   is disorienting on a phone held at arm's length.
 *
 * EVERY EXIT IS THE SAME EXIT
 *   Return, close, Escape, browser Back and the video's own end all call the
 *   one `exit` path. That is deliberate: the caller restores the same state
 *   however the visitor leaves, so there is no route out that behaves
 *   differently from the others.
 *
 * ACCESSIBILITY AND SAFETY
 *   Motion control is OFF until explicitly enabled, which is also the
 *   no-motion fallback — someone who is motion-sensitive, or whose device has
 *   no gyroscope, drags instead and loses nothing. Under prefers-reduced-motion
 *   the video does not start itself either: an immersive clip that begins
 *   moving the instant it opens is precisely what that setting asks us not to
 *   do, so it opens on the poster frame with Play available.
 */

/** Vertical look limit. Past this the horizon inverts and the view is
 *  disorienting rather than immersive. */
const MAX_PITCH = Math.PI / 2 - 0.05;

/** Radians per pixel of drag. Tuned so a full turn is roughly one screen
 *  width, which matches how people expect a panorama to behave. */
const DRAG_SENSITIVITY = 0.0042;

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

  const [motionEnabled, setMotionEnabled] = useState(false);
  const [phase, setPhase] = useState<Phase>("loading");
  const [playing, setPlaying] = useState(false);
  // Muted at open, always. Autoplay of audible video is refused by every
  // current mobile browser, so starting unmuted would mean starting stopped.
  const [muted, setMuted] = useState(true);
  /** Bumped by Retry to force a fresh <video> element rather than asking a
   *  failed one to try again, which browsers will not reliably do. */
  const [attempt, setAttempt] = useState(0);

  // These are facts about the DEVICE, decided once at mount rather than
  // synchronised in an effect. This component is only ever loaded with
  // ssr: false, so touching window in an initializer is safe — and computing
  // them here avoids a cascading render on every open.
  const [motionAvailable] = useState(
    () => typeof window !== "undefined" && "DeviceOrientationEvent" in window,
  );
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

  // exit is called from a keydown listener, a popstate listener and the video's
  // ended event as well as from buttons. A ref guard makes it idempotent:
  // browser Back fires popstate AND unwinds the history entry this component
  // pushed, and without the guard a close could be counted twice and pop an
  // entry belonging to the Journey itself.
  const exitedRef = useRef(false);
  // Held in a ref, and refreshed in an effect rather than during render, so
  // that `exit` keeps a stable identity. The keydown, popstate and ended
  // listeners below are all keyed on it; a new identity every render would
  // tear down and re-add all three, and would re-push a history entry each
  // time the parent re-rendered.
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

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) void video.play().catch(() => setPhase("error"));
    else video.pause();
  }, []);

  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setMuted(video.muted);
  }, []);

  const retry = useCallback(() => {
    setPhase("loading");
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

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", onResize);
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
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    // Natural completion is an exit, not a stop. The visitor came from a
    // decision popup and that is where the end of the clip returns them.
    const onEnded = () => exit();

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
  }, [src, startTime, reducedMotion, exit, attempt]);

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

  // ---- Device orientation, only after an explicit grant -------------------
  useEffect(() => {
    orientationRef.current = motionEnabled;
    if (!motionEnabled) return;

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
  }, [motionEnabled]);

  const enableMotion = useCallback(async () => {
    // iOS gates this behind a permission call that must happen inside a user
    // gesture, which is why this is a button rather than something automatic.
    const api = window.DeviceOrientationEvent as unknown as {
      requestPermission?: () => Promise<"granted" | "denied">;
    };
    if (typeof api?.requestPermission === "function") {
      try {
        if ((await api.requestPermission()) !== "granted") return;
      } catch {
        return;
      }
    }
    setMotionEnabled(true);
  }, []);

  const chip =
    "pointer-events-auto rounded-full bg-white/15 px-4 py-2 text-xs text-white backdrop-blur";

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
          <button type="button" onClick={exit} className={chip}>
            {exitLabel}
          </button>
        </div>
      )}

      {webglSupported && phase === "loading" && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3">
          <span
            className="h-8 w-8 animate-spin rounded-full border-2 border-white/25 border-t-white/80"
            aria-hidden="true"
          />
          <p className="text-xs text-white/70">Loading the 360° lounge…</p>
        </div>
      )}

      {webglSupported && phase === "error" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/80 px-6 text-center">
          <p className="text-sm text-white">The 360° view could not be loaded.</p>
          <div className="flex gap-2">
            <button type="button" onClick={retry} className={chip}>
              Retry
            </button>
            <button type="button" onClick={exit} className={chip}>
              {exitLabel}
            </button>
          </div>
        </div>
      )}

      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-4">
        {title && (
          <p className="pointer-events-none max-w-[60%] text-xs text-white/80">{title}</p>
        )}
        <button type="button" onClick={exit} className={`${chip} ml-auto`}>
          {exitLabel}
        </button>
      </div>

      {/* The controls sit at the bottom because the bottle is the centre of
          the forward view, and the brief is explicit that nothing may cover
          its label. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-wrap items-center justify-center gap-2 p-4">
        <button
          type="button"
          onClick={togglePlay}
          aria-label={playing ? "Pause" : "Play"}
          className={chip}
        >
          {playing ? "Pause" : "Play"}
        </button>
        <button
          type="button"
          onClick={toggleMute}
          aria-label={muted ? "Unmute" : "Mute"}
          className={chip}
        >
          {muted ? "Unmute" : "Mute"}
        </button>
        <button type="button" onClick={recenter} className={chip}>
          Recenter
        </button>
        {motionAvailable && !motionEnabled && (
          <button type="button" onClick={enableMotion} className={chip}>
            Use device motion
          </button>
        )}
        {motionEnabled && (
          <button type="button" onClick={() => setMotionEnabled(false)} className={chip}>
            Stop device motion
          </button>
        )}
        <p className="pointer-events-none w-full text-center text-[11px] text-white/60">
          Drag to look around. Your choices are waiting when you return.
        </p>
      </div>
    </div>
  );
}
