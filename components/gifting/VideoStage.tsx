"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import type { MediaRef } from "@/lib/gifting/simulation/types";
import { ActionTray, GuidanceTray, HelpDot, LiveRegion, Stage, useStage } from "./shell";
import { Button } from "./ui";

/**
 * A full-screen video step.
 *
 * THE CONTINUE BUTTON IS STICKY ONCE EARNED
 *   It stays hidden while the clip is playing and appears when playback
 *   reaches the end — and then it STAYS. Replaying does not take it away and
 *   does not make it animate again, because a control that has already been
 *   offered should not be withdrawn: a visitor who replays to catch something
 *   they missed has not un-finished the video, and making them watch to the
 *   end a second time to get the button back would be a punishment for paying
 *   attention.
 *
 *   `completedOnce` is therefore a one-way latch, and the spring runs only on
 *   the first reveal.
 *
 * GUIDANCE GETS OUT OF THE WAY
 *   Instructions show briefly, hide during playback, and come back on a tap,
 *   on pause, and on failure. The tap target deliberately excludes the video's
 *   own controls, so recalling the trays never fights the play button.
 */
export function VideoStage({
  source,
  title,
  instruction,
  step,
  total,
  continueLabel,
  onContinue,
  autoPlay = true,
}: {
  source: MediaRef;
  title: string;
  instruction: string;
  step?: number;
  total?: number;
  continueLabel: string;
  onContinue: () => void;
  autoPlay?: boolean;
}) {
  return (
    <Stage
      media={
        <div className="absolute inset-0">
          <Image
            src={source.poster}
            alt={source.alt}
            fill
            sizes="100vw"
            className="object-cover"
            priority
          />
        </div>
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
        autoPlay={autoPlay}
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
  autoPlay,
}: {
  source: MediaRef;
  title: string;
  instruction: string;
  step?: number;
  total?: number;
  continueLabel: string;
  onContinue: () => void;
  autoPlay: boolean;
}) {
  const { reveal, noteInteraction, announce, reducedMotion, setPinned } = useStage();
  const videoRef = useRef<HTMLVideoElement>(null);
  const continueRef = useRef<HTMLButtonElement>(null);

  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);
  const [muted, setMuted] = useState(true);
  /** One-way. Once the clip has been finished, Continue is permanent. */
  const [completedOnce, setCompletedOnce] = useState(false);
  const focusedOnce = useRef(false);

  // A finished video means a required action is on screen, so the tray must
  // stop auto-hiding from that moment on.
  useEffect(() => {
    setPinned(completedOnce || failed);
  }, [completedOnce, failed, setPinned]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = true;

    const onPlay = () => {
      setPlaying(true);
      setFailed(false);
      noteInteraction();
    };
    const onPause = () => {
      setPlaying(false);
      reveal();
    };
    const onEnded = () => {
      setPlaying(false);
      setCompletedOnce(true);
      reveal();
      announce(`${continueLabel} is now available.`);
    };
    const onError = () => {
      setFailed(true);
      setPlaying(false);
      reveal();
    };

    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("ended", onEnded);
    video.addEventListener("error", onError);

    if (autoPlay) {
      void video.play().catch(() => {
        // Refusal is not failure: the poster is up and Play is offered.
      });
    }
    return () => {
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("ended", onEnded);
      video.removeEventListener("error", onError);
      video.pause();
    };
  }, [autoPlay, announce, continueLabel, noteInteraction, reveal]);

  // Focus the action the moment it is earned — without scrolling, because the
  // document cannot scroll and the attempt would shift the fixed stage on iOS.
  useEffect(() => {
    if (!completedOnce || focusedOnce.current) return;
    focusedOnce.current = true;
    continueRef.current?.focus({ preventScroll: true });
  }, [completedOnce]);

  const toggle = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) void video.play().catch(() => setFailed(true));
    else video.pause();
  }, []);

  const replay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = 0;
    void video.play().catch(() => setFailed(true));
  }, []);

  return (
    <>
      <LiveRegion />

      {/* The video itself, full bleed over the poster. */}
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
            playing || completedOnce ? "opacity-100" : "opacity-0",
          )}
        />
      )}

      {/* Tap-to-recall covers the frame but stops short of the controls below,
          so recalling guidance never steals a tap from Play or Mute. */}
      <button
        type="button"
        aria-label="Show instructions"
        onClick={reveal}
        tabIndex={-1}
        className="absolute inset-x-0 top-0 z-10 h-full cursor-default focus:outline-none"
        style={{ bottom: "calc(env(safe-area-inset-bottom) + 9rem)" }}
      />

      <GuidanceTray title={title} instruction={instruction} step={step} total={total} onHelp={reveal} />
      <HelpDot onClick={reveal} />

      {/* Playback controls sit above the tap layer and below the action tray. */}
      <div
        className="pointer-events-none absolute inset-x-0 z-30 flex items-center justify-center gap-2 px-4"
        style={{ bottom: "calc(env(safe-area-inset-bottom) + 6.4rem)" }}
      >
        <button
          type="button"
          onClick={toggle}
          aria-label={playing ? "Pause" : "Play"}
          className="pointer-events-auto flex h-12 min-w-12 items-center justify-center rounded-full border border-white/70 bg-[rgba(250,249,246,0.82)] px-5 text-[12px] text-gift-ink backdrop-blur-xl"
        >
          {playing ? "Pause" : completedOnce ? "Replay" : "Play"}
        </button>
        <button
          type="button"
          onClick={() => {
            const video = videoRef.current;
            if (!video) return;
            video.muted = !video.muted;
            setMuted(video.muted);
          }}
          aria-label={muted ? "Unmute" : "Mute"}
          className="pointer-events-auto flex h-12 min-w-12 items-center justify-center rounded-full border border-white/70 bg-[rgba(250,249,246,0.82)] px-5 text-[12px] text-gift-ink backdrop-blur-xl"
        >
          {muted ? "Unmute" : "Mute"}
        </button>
        {completedOnce && (
          <button
            type="button"
            onClick={replay}
            className="pointer-events-auto flex h-12 items-center justify-center rounded-full border border-white/70 bg-[rgba(250,249,246,0.82)] px-5 text-[12px] text-gift-ink backdrop-blur-xl"
          >
            Watch again
          </button>
        )}
      </div>

      {/* The action. Hidden until the clip finishes, then permanent. */}
      {(completedOnce || failed) && (
        <ActionTray
          forceVisible
          spring={!reducedMotion}
          error={failed ? "That video could not be played. You can still continue." : null}
        >
          <Button onClick={onContinue} className="min-h-14" ref={continueRef}>
            {continueLabel}
          </Button>
        </ActionTray>
      )}
    </>
  );
}
