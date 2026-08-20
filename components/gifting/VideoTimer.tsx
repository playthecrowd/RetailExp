"use client";

import { useEffect, useState, type RefObject } from "react";
import { cn } from "@/lib/cn";

/**
 * How much of the film is left, as a ring.
 *
 * THE VIDEO IS THE ONLY CLOCK
 *   There is no interval, no Date.now(), no elapsed-time variable and no CSS
 *   countdown anywhere in this file. Every number rendered is read from the
 *   media element at the moment it tells us something changed. That is not
 *   fastidiousness — a timer with its own clock drifts away from the picture
 *   the first time a phone throttles a background tab or a decoder stalls, and
 *   a countdown that disagrees with the video is worse than no countdown.
 *
 *   The useful consequence is that pause, seek and replay need no handling of
 *   their own. A paused video stops reporting a new currentTime, so the ring
 *   simply stops. Seeking reports a new one, so the ring jumps to it. Nothing
 *   has to be told what happened.
 *
 * WHY THE STROKE TRANSITIONS
 *   `timeupdate` fires about four times a second, which would step the ring
 *   visibly. A 250ms transition on the stroke smooths between the values the
 *   video actually reported — it interpolates between two real readings rather
 *   than inventing motion, and it stops dead when the readings stop.
 */

const SIZE = 44;
const STROKE = 2.5;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/** Seconds remaining, and how much of the ring should still be drawn. Pure, so
 *  it can be reasoned about without a browser. */
export function computeRemaining(currentTime: number, duration: number) {
  if (!Number.isFinite(duration) || duration <= 0) return { remaining: 0, fraction: 1 };
  const clamped = Math.min(Math.max(currentTime, 0), duration);
  const remaining = Math.max(0, duration - clamped);
  return { remaining, fraction: remaining / duration };
}

export function formatRemaining(seconds: number) {
  const whole = Math.ceil(seconds - 0.0001);
  if (whole < 60) return String(Math.max(0, whole));
  const m = Math.floor(whole / 60);
  const sec = whole % 60;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

export function VideoTimer({
  videoRef,
  className,
  style,
}: {
  videoRef: RefObject<HTMLVideoElement | null>;
  className?: string;
  /** The caller owns the safe-area inset, because it knows which gutter the
   *  rest of that screen is using. */
  style?: React.CSSProperties;
}) {
  const [{ remaining, fraction, known }, setState] = useState({
    remaining: 0,
    fraction: 1,
    known: false,
  });

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const sync = () => {
      const { currentTime, duration } = video;
      if (!Number.isFinite(duration) || duration <= 0) {
        setState({ remaining: 0, fraction: 1, known: false });
        return;
      }
      const next = computeRemaining(currentTime, duration);
      setState({ ...next, known: true });
    };

    // Every event that can change either number, and nothing else. `ended` is
    // included so the ring lands on exactly zero even if the last timeupdate
    // arrived a frame early.
    const events = [
      "loadedmetadata",
      "durationchange",
      "timeupdate",
      "play",
      "pause",
      "seeking",
      "seeked",
      "ended",
      "emptied",
    ] as const;
    for (const event of events) video.addEventListener(event, sync);
    sync();
    return () => {
      for (const event of events) video.removeEventListener(event, sync);
    };
  }, [videoRef]);

  if (!known) return null;

  return (
    <div
      className={cn(
        "pointer-events-none flex items-center justify-center rounded-full border border-white/60 bg-[rgba(250,249,246,0.72)] backdrop-blur-md",
        className,
      )}
      style={{ width: SIZE + 8, height: SIZE + 8, ...style }}
      role="timer"
      aria-live="off"
      aria-label={`${formatRemaining(remaining)} seconds remaining`}
    >
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden="true">
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke="var(--gift-border)"
          strokeWidth={STROKE}
        />
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke="var(--gift-accent)"
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - fraction)}
          transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
          style={{ transition: "stroke-dashoffset 250ms linear" }}
        />
        <text
          x="50%"
          y="50%"
          dominantBaseline="central"
          textAnchor="middle"
          className="fill-gift-ink font-mono"
          style={{ fontSize: 12 }}
        >
          {formatRemaining(remaining)}
        </text>
      </svg>
    </div>
  );
}
