"use client";

import { useEffect, useRef, useState } from "react";
import { LoadingState, ErrorState } from "@/components/ui/states";
import { formatDuration } from "@/lib/format";
import {
  PlayIcon,
  PauseIcon,
  SoundIcon,
  MuteIcon,
  CaptionsIcon,
  FullscreenIcon,
  ReplayIcon,
} from "./icons";

/**
 * Real playback (via the `src` prop) and a simulated fallback coexist here:
 * pass `src` to render an actual `<video>` element wired to the same
 * control surface below; omit it to keep the original simulated-timer
 * behavior (see docs/RETAILEXP_PHASE_TRACKER.md, Phase 3) for any caller
 * that doesn't have real media yet. Both modes write to the same
 * `currentTime` state, so the seek bar, `onProgress`, and the completion
 * effect are shared and source-agnostic. The touch-and-drag 360 engine
 * itself is still Phase 4 scope in either mode.
 */
export function MockVideoPlayer({
  title,
  durationSeconds,
  posterLabel,
  captionText,
  is360 = false,
  onComplete,
  completionThreshold = 1,
  initialTime = 0,
  startPaused = false,
  onProgress,
  background,
  src,
  posterSrc,
  captionsSrc,
}: {
  title: string;
  durationSeconds: number;
  posterLabel: string;
  captionText?: string;
  is360?: boolean;
  onComplete: () => void;
  completionThreshold?: number;
  /** Resume position, seconds — used when Continue Journey reopens a mid-chapter node. */
  initialTime?: number;
  /** Mount already paused at initialTime (e.g. re-showing a finished frame under a choice overlay). */
  startPaused?: boolean;
  onProgress?: (currentTime: number) => void;
  background?: React.ReactNode;
  /** Real playable video URL. When set, renders an actual <video> element instead of the simulated timer. */
  src?: string;
  /** Real poster image URL for the <video> element. */
  posterSrc?: string;
  /** Real VTT captions URL for a <track> element. */
  captionsSrc?: string;
}) {
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(initialTime);
  const [muted, setMuted] = useState(false);
  const [showCaptions, setShowCaptions] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const completedRef = useRef(initialTime >= durationSeconds * completionThreshold);

  useEffect(() => {
    if (src) return;
    const loadTimer = window.setTimeout(() => {
      setStatus("ready");
      if (!startPaused) setPlaying(true);
    }, 500);
    return () => window.clearTimeout(loadTimer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (src) return;
    if (status !== "ready" || !playing) return;
    const interval = window.setInterval(() => {
      setCurrentTime((prev) => {
        const next = Math.min(durationSeconds, prev + 0.25);
        if (next >= durationSeconds) setPlaying(false);
        return next;
      });
    }, 250);
    return () => window.clearInterval(interval);
  }, [src, status, playing, durationSeconds]);

  // Real-<video> mode: keep the DOM element in sync with the `playing` state
  // (button clicks, autoplay-policy rejections, OS media keys via onPlay/onPause below).
  useEffect(() => {
    if (!src || !videoRef.current) return;
    if (playing) {
      videoRef.current.play().catch(() => setPlaying(false));
    } else {
      videoRef.current.pause();
    }
  }, [src, playing]);

  function handleVideoLoadedData() {
    setStatus("ready");
    if (videoRef.current && initialTime > 0) {
      videoRef.current.currentTime = initialTime;
    }
    if (!startPaused) setPlaying(true);
  }

  useEffect(() => {
    onProgress?.(currentTime);
    if (completedRef.current) return;
    if (currentTime >= durationSeconds * completionThreshold) {
      completedRef.current = true;
      onComplete();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTime, durationSeconds, completionThreshold]);

  function handleReplay() {
    completedRef.current = false;
    setCurrentTime(0);
    if (src && videoRef.current) {
      videoRef.current.currentTime = 0;
      videoRef.current.play().catch(() => {});
    }
    setPlaying(true);
    setStatus("ready");
  }

  function handleSeek(event: React.ChangeEvent<HTMLInputElement>) {
    const next = Number(event.target.value);
    setCurrentTime(next);
    if (src && videoRef.current) {
      videoRef.current.currentTime = next;
    }
  }

  async function handleFullscreen() {
    if (!containerRef.current) return;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await containerRef.current.requestFullscreen();
      }
    } catch {
      // Fullscreen can be denied/unsupported — not fatal.
    }
  }

  if (status === "error") {
    return (
      <div className="flex aspect-[9/16] w-full items-center justify-center rounded-xl bg-kameleon-surface">
        <ErrorState
          brand="kameleon"
          title="Playback error"
          message="This video couldn't be played."
          retryLabel="Retry"
          onRetry={handleReplay}
        />
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="relative flex aspect-[9/16] w-full flex-col overflow-hidden rounded-xl bg-gradient-to-br from-kameleon-surface-raised via-kameleon-surface to-black"
    >
      {src ? (
        <video
          ref={videoRef}
          src={src}
          poster={posterSrc}
          muted={muted}
          playsInline
          className="absolute inset-0 h-full w-full object-cover"
          onLoadedData={handleVideoLoadedData}
          onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setCurrentTime(durationSeconds)}
          onError={() => setStatus("error")}
        >
          {captionsSrc && <track kind="captions" src={captionsSrc} srcLang="en" label="English" default={showCaptions} />}
        </video>
      ) : (
        background && <div className="absolute inset-0">{background}</div>
      )}

      {is360 && (
        <span className="absolute right-3 top-3 z-10 rounded-full border border-kameleon-copper/50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-widest text-kameleon-copper-light">
          Interactive Video
        </span>
      )}

      {status === "loading" ? (
        <div className="relative flex flex-1 items-center justify-center">
          <LoadingState brand="kameleon" message={`Loading ${title}…`} />
        </div>
      ) : (
        <button
          type="button"
          aria-label={playing ? "Pause" : "Play"}
          onClick={() => setPlaying((p) => !p)}
          className="relative flex flex-1 items-center justify-center"
        >
          <span className="flex flex-col items-center gap-3 text-kameleon-text-muted/70">
            <span className="rounded-full border border-kameleon-text-muted/30 bg-black/30 p-4 backdrop-blur-sm">
              {playing ? (
                <PauseIcon className="h-7 w-7 text-kameleon-text" />
              ) : (
                <PlayIcon className="h-7 w-7 text-kameleon-text" />
              )}
            </span>
            {!background && <span className="text-xs uppercase tracking-widest">{posterLabel}</span>}
          </span>
        </button>
      )}

      {showCaptions && captionText && status === "ready" && (
        <p className="relative mx-6 mb-2 rounded-md bg-black/50 px-3 py-1.5 text-center text-sm italic text-kameleon-text">
          {captionText}
        </p>
      )}


      <div className="relative flex flex-col gap-2 px-4 pb-4">
        <div className="flex items-center gap-2 text-xs text-kameleon-text-muted">
          <span>{formatDuration(currentTime)}</span>
          <input
            type="range"
            aria-label="Seek"
            min={0}
            max={durationSeconds}
            step={0.25}
            value={currentTime}
            onChange={handleSeek}
            disabled={status !== "ready"}
            className="h-1 flex-1 cursor-pointer accent-kameleon-red"
          />
          <span>{formatDuration(durationSeconds)}</span>
        </div>
        <div className="flex items-center justify-center gap-6">
          <button
            type="button"
            aria-label={muted ? "Unmute" : "Mute"}
            aria-pressed={muted}
            onClick={() => setMuted((m) => !m)}
            className="text-kameleon-text-muted hover:text-kameleon-text"
          >
            {muted ? <MuteIcon className="h-5 w-5" /> : <SoundIcon className="h-5 w-5" />}
          </button>
          <button
            type="button"
            aria-label="Toggle captions"
            aria-pressed={showCaptions}
            onClick={() => setShowCaptions((c) => !c)}
            className={showCaptions ? "text-kameleon-copper-light" : "text-kameleon-text-muted hover:text-kameleon-text"}
          >
            <CaptionsIcon className="h-5 w-5" />
          </button>
          <button
            type="button"
            aria-label="Replay from start"
            onClick={handleReplay}
            className="text-kameleon-text-muted hover:text-kameleon-text"
          >
            <ReplayIcon className="h-5 w-5" />
          </button>
          <button
            type="button"
            aria-label="Toggle fullscreen"
            onClick={handleFullscreen}
            className="text-kameleon-text-muted hover:text-kameleon-text"
          >
            <FullscreenIcon className="h-5 w-5" />
          </button>
        </div>
        <button
          type="button"
          onClick={() => setStatus("error")}
          className="self-center text-[11px] text-kameleon-text-muted/50 underline-offset-2 hover:underline"
        >
          Dev: simulate playback error
        </button>
      </div>
    </div>
  );
}
