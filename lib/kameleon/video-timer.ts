/**
 * The 360 viewer's countdown, as a pure function of the video element's own
 * clock.
 *
 * WHY THIS IS A MODULE AND NOT A FEW LINES IN THE COMPONENT
 *   Because "the timer cannot advance unless the video advances" is a claim
 *   that should be TESTABLE, and a claim buried in a `.tsx` render body is
 *   not — Node cannot import JSX. Everything the display depends on lives
 *   here, takes `(currentTime, duration)` and nothing else, and is exercised
 *   directly by scripts/verify-360-experience.mjs.
 *
 * THE RULE
 *   There is no clock in this file. No Date.now(), no performance.now(), no
 *   interval, no elapsed-time accumulator, no CSS animation driving a value.
 *   The only inputs are the two numbers the HTMLVideoElement reports. Feed it
 *   the same currentTime twice and it returns the same answer twice, however
 *   much real time passed in between — which is the whole property, and the
 *   reason the previous implementation drifted.
 *
 * WHAT WENT WRONG BEFORE
 *   The maths was already derived from currentTime, but it was only ever
 *   EVALUATED inside a requestAnimationFrame callback. A browser that throttles
 *   animation frames — a backgrounded tab, a locked phone, a heavy page — stops
 *   evaluating it while the media pipeline plays on, so the display freezes
 *   mid-count and the ring stops with it. Measured on production: zero frames
 *   in 1.5 seconds, the readout showing 0:46 while the playhead sat at 57s.
 *   The fix is not different arithmetic, it is more places that run it — every
 *   media event, with animation frames as a smoothness bonus rather than the
 *   only source.
 */

/** Radius of the countdown ring, and the circumference that becomes its dash
 *  array — the visible arc is circumference × (1 − progress). */
export const RING_RADIUS = 26;
export const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

export interface TimerState {
  /** Whole seconds left, via Math.ceil, so a clip shows 1:00 until it is
   *  genuinely below a minute and 0:00 only when it is truly done. */
  remainingSeconds: number;
  /** 0 → 1 elapsed fraction, for the ring. Clamped, because a browser can
   *  report a currentTime a hair beyond duration at the end of a file. */
  progress: number;
  /** The same remaining time as M:SS. */
  clock: string;
}

/** M:SS. Seconds are ceiled so the readout only reaches 0:00 at the end. */
export function formatClock(seconds: number): string {
  const safe = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
}

/**
 * The whole display, derived from the video element's two numbers.
 *
 * Returns null when the element cannot yet say how long it is — before
 * `loadedmetadata`, after `emptied`, or for a stream with no duration. The
 * caller shows a loading state for null rather than counting down from a
 * number it does not have.
 */
export function computeTimerState(currentTime: number, duration: number): TimerState | null {
  if (!Number.isFinite(duration) || duration <= 0) return null;
  if (!Number.isFinite(currentTime)) return null;

  // Clamped both ends: a seek can momentarily report a negative currentTime,
  // and the end of a file can report slightly past duration. Neither should
  // produce a negative countdown or a ring past full.
  const played = Math.min(Math.max(currentTime, 0), duration);
  const remaining = duration - played;

  return {
    remainingSeconds: Math.ceil(remaining),
    progress: played / duration,
    clock: formatClock(remaining),
  };
}
