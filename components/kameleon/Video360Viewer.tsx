"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";

/**
 * A 2:1 equirectangular video viewer.
 *
 * WHAT IT IS FOR
 *   An OPTIONAL alternate view of a chapter that has a genuine 360 asset. The
 *   Journey plays standard video; this is opened from a button and closed back
 *   to the same chapter at the same position. It is not a second journey and
 *   it never replaces the standard playback path.
 *
 * IT WILL NOT FAKE 360
 *   The caller is responsible for only rendering this when video360Source is
 *   non-empty. Mapping a normal 16:9 video onto a sphere produces a smeared
 *   band with a hole at each pole, which looks like a bug and is one.
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
 * ACCESSIBILITY AND SAFETY
 *   Motion control is OFF until explicitly enabled, which is also the
 *   no-motion fallback — someone who is motion-sensitive, or whose device has
 *   no gyroscope, drags instead and loses nothing. Escape exits.
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
  /** Where the standard player had got to, so 360 opens in the same place. */
  startTime: number;
  /** Receives the 360 view's position, so the standard player can resume. */
  onExit: (currentTime: number) => void;
  title?: string;
}

export function Video360Viewer({ src, poster, startTime, onExit, title }: Video360ViewerProps) {
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

  // Both of these are facts about the DEVICE, decided once at mount rather
  // than synchronised in an effect. This component is only ever loaded with
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

  const exit = useCallback(() => {
    onExit(videoRef.current?.currentTime ?? startTime);
  }, [onExit, startTime]);

  const recenter = useCallback(() => {
    yawRef.current = 0;
    pitchRef.current = 0;
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
    const sphere = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ map: texture }));
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
      sphere.material.dispose();
      renderer.dispose();
      // Explicit: WebGL contexts are a limited resource and a phone that opens
      // 360 a few times per session will run out if these are left dangling.
      renderer.forceContextLoss();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
    };
  }, [webglSupported]);

  // ---- Playback position -------------------------------------------------
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = startTime;
    void video.play().catch(() => {
      // Autoplay refusal is not an error worth surfacing: the controls are
      // visible and the visitor can start it.
    });
  }, [startTime]);

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

  return (
    <div className="fixed inset-0 z-50 bg-black">
      <div ref={mountRef} className="h-full w-full touch-none" aria-hidden="true" />

      <video
        ref={videoRef}
        src={src}
        poster={poster}
        playsInline
        loop={false}
        crossOrigin="anonymous"
        className="sr-only"
      />

      {!webglSupported && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
          <p className="text-sm text-white">This device cannot show the 360° view.</p>
          <p className="max-w-xs text-xs text-white/70">
            The standard version of this chapter is still available.
          </p>
        </div>
      )}

      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-4">
        {title && (
          <p className="pointer-events-none max-w-[60%] text-xs text-white/80">{title}</p>
        )}
        <button
          type="button"
          onClick={exit}
          className="pointer-events-auto rounded-full bg-white/15 px-4 py-2 text-xs text-white backdrop-blur"
        >
          Exit 360°
        </button>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-wrap items-center justify-center gap-2 p-4">
        <button
          type="button"
          onClick={recenter}
          className="pointer-events-auto rounded-full bg-white/15 px-4 py-2 text-xs text-white backdrop-blur"
        >
          Recenter
        </button>
        {motionAvailable && !motionEnabled && (
          <button
            type="button"
            onClick={enableMotion}
            className="pointer-events-auto rounded-full bg-white/15 px-4 py-2 text-xs text-white backdrop-blur"
          >
            Use device motion
          </button>
        )}
        {motionEnabled && (
          <button
            type="button"
            onClick={() => setMotionEnabled(false)}
            className="pointer-events-auto rounded-full bg-white/15 px-4 py-2 text-xs text-white backdrop-blur"
          >
            Stop device motion
          </button>
        )}
        <p className="pointer-events-none w-full text-center text-[11px] text-white/60">
          Drag to look around.
        </p>
      </div>
    </div>
  );
}
