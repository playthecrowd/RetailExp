"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import type { MediaRef } from "@/lib/gifting/simulation/types";
import {
  ActionDock,
  Guidance,
  LiveRegion,
  RecallDot,
  Stage,
  useStage,
} from "./shell";
import { Button } from "./ui";

/**
 * A full-screen video step.
 *
 * COMPLETION IS EARNED ONCE AND KEPT
 *   `completionEarned` is a one-way latch. Replaying does not revoke it, and
 *   neither does pausing, seeking or rotating the phone: a visitor who replays
 *   to catch a line they missed has not un-finished the video, and making them
 *   sit through it again to get the button back would punish paying attention.
 *
 * WHY `ended` ALONE IS NOT ENOUGH
 *   On a phone the `ended` event is genuinely unreliable — a clip that stalls
 *   on the last frame, a decoder that rounds duration down, a backgrounded tab
 *   that resumes past the end. Any of those leaves a visitor on a finished
 *   video with no way forward. So completion is ALSO inferred from
 *   `timeupdate` once the playhead is within a quarter second of the end, and
 *   a playback error unlocks the action too. Being generous here costs
 *   nothing; being strict traps people.
 *
 * THE ACTION IS NOT PART OF THE GUIDANCE
 *   It lives in ActionDock, which has no visibility state. Instructions can
 *   fade or be dismissed and the way forward stays exactly where it was.
 */

/** Close enough to the end to call it finished. Wide enough to survive a
 *  decoder that reports duration a frame short. */
const END_EPSILON = 0.25;

export function VideoStage({
  source,
  title,
  instruction,
  step,
  total,
  continueLabel,
  onContinue,
  onExit,
  autoPlay = true,
  extraActions,
}: {
  source: MediaRef;
  title: string;
  instruction: string;
  step?: number;
  total?: number;
  continueLabel: string;
  onContinue: () => void;
  onExit?: () => void;
  autoPlay?: boolean;
  /** Optional secondary actions rendered under the primary one, inside the
   *  same permanent dock. */
  extraActions?: ReactNode;
}) {
  return (
    <Stage
      media={
        <Image
          src={source.poster}
          alt={source.alt}
          fill
          sizes="100vw"
          className="object-cover"
          priority
        />
      }
    >
      <Inner
        source={source}
        title={title}
        instruction={instruction}
        step={step}
        total={total}
        continueLabel={continueLabel}
        onContinue={onContinue}
        onExit={onExit}
        autoPlay={autoPlay}
        extraActions={extraActions}
      />
    </Stage>
  );
}

function Inner({
  source,
  title,
  instruction,
  step,
  total,
  continueLabel,
  onContinue,
  onExit,
  autoPlay,
  extraActions,
}: {
  source: MediaRef;
  title: string;
  instruction: string;
  step?: number;
  total?: number;
  continueLabel: string;
  onContinue: () => void;
  onExit?: () => void;
  autoPlay: boolean;
  extraActions?: ReactNode;
}) {
  const { announce, reducedMotion } = useStage();
  const videoRef = useRef<HTMLVideoElement>(null);
  const continueRef = useRef<HTMLButtonElement>(null);

  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);
  const [muted, setMuted] = useState(true);
  const [completionEarned, setCompletionEarned] = useState(false);
  const announcedRef = useRef(false);

  const earnCompletion = useCallback(() => {
    setCompletionEarned((already) => {
      if (already) return already;
      if (!announcedRef.current) {
        announcedRef.current = true;
        announce(`${continueLabel} is now available.`);
      }
      return true;
    });
  }, [announce, continueLabel]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = true;

    const onPlay = () => {
      setPlaying(true);
      setFailed(false);
    };
    const onPause = () => setPlaying(false);
    const onEnded = () => {
      setPlaying(false);
      earnCompletion();
    };
    // The fallback that matters on a phone.
    const onTimeUpdate = () => {
      const { currentTime, duration } = video;
      if (Number.isFinite(duration) && duration > 0 && currentTime >= duration - END_EPSILON) {
        earnCompletion();
      }
    };
    const onError = () => {
      setFailed(true);
      setPlaying(false);
      // A broken video must not become a dead end.
      earnCompletion();
      announce("This video could not be played. You can continue.");
    };
    // A clip that stalls on the final frame never fires `ended`.
    const onStalled = () => {
      const { currentTime, duration } = video;
      if (Number.isFinite(duration) && duration > 0 && currentTime >= duration - END_EPSILON) {
        earnCompletion();
      }
    };

    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("ended", onEnded);
    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("error", onError);
    video.addEventListener("stalled", onStalled);
    video.addEventListener("suspend", onStalled);

    if (autoPlay) {
      void video.play().catch(() => {
        // A refusal is not a failure: the poster is up and Play is offered.
      });
    }
    return () => {
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("ended", onEnded);
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("error", onError);
      video.removeEventListener("stalled", onStalled);
      video.removeEventListener("suspend", onStalled);
      video.pause();
    };
  }, [autoPlay, earnCompletion, announce]);

  // Focus the action once it is earned — without scrolling, because the
  // document cannot scroll and the attempt shifts the fixed stage on iOS.
  const focusedRef = useRef(false);
  useEffect(() => {
    if (!completionEarned || focusedRef.current) return;
    focusedRef.current = true;
    continueRef.current?.focus({ preventScroll: true });
  }, [completionEarned]);

  const toggle = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) void video.play().catch(() => setFailed(true));
    else video.pause();
  }, []);

  const retry = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    setFailed(false);
    video.load();
    video.currentTime = 0;
    void video.play().catch(() => setFailed(true));
  }, []);

  return (
    <>
      <LiveRegion />

      {source.video && (
        <video
          ref={videoRef}
          src={source.video}
          playsInline
          {...{ "webkit-playsinline": "true" }}
          muted={muted}
          preload="auto"
          className={cn(
            "absolute inset-0 z-0 h-full w-full object-cover transition-opacity duration-500",
            playing || completionEarned ? "opacity-100" : "opacity-0",
          )}
        />
      )}

      <Guidance
        title={title}
        instruction={instruction}
        step={step}
        total={total}
        onExit={onExit}
      />
      <RecallDot />

      {/* Playback controls: above the video, below the dock, and clear of it. */}
      <div
        className="pointer-events-none absolute inset-x-0 z-40 flex flex-wrap items-center justify-center gap-2 px-4"
        style={{ bottom: "calc(env(safe-area-inset-bottom) + 7.2rem)" }}
      >
        <ControlChip onClick={toggle} label={playing ? "Pause" : completionEarned ? "Replay" : "Play"} />
        <ControlChip
          onClick={() => {
            const video = videoRef.current;
            if (!video) return;
            video.muted = !video.muted;
            setMuted(video.muted);
          }}
          label={muted ? "Unmute" : "Mute"}
        />
      </div>

      {/* Permanent. Before completion it explains what to do; after, it is the
          way forward. It never fades, and it is never a child of Guidance. */}
      <ActionDock
        note={completionEarned ? undefined : "Watch to the end to continue."}
        error={failed ? "This video could not be played." : null}
      >
        {failed && <Button variant="secondary" onClick={retry}>Try Again</Button>}
        <Button
          ref={continueRef}
          onClick={onContinue}
          disabled={!completionEarned}
          className={cn(
            !reducedMotion && completionEarned && "transition-transform duration-300",
          )}
        >
          {continueLabel}
        </Button>
        {extraActions}
      </ActionDock>
    </>
  );
}

function ControlChip({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="pointer-events-auto flex h-12 min-w-[5.5rem] items-center justify-center rounded-full border border-white/70 bg-[rgba(250,249,246,0.86)] px-5 text-[12px] text-gift-ink backdrop-blur-xl"
    >
      {label}
    </button>
  );
}
