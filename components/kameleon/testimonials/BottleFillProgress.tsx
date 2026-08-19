"use client";

/**
 * The video upload experience: a Kameleon bottle filling from the bottom.
 *
 * TWO LAYERS, AND THE DIFFERENCE MATTERS
 *   BASE   a dim chameleon wash across the whole interior, always drifting. It
 *          gives the bottle life while the destination is being prepared,
 *          which is before there is anything to measure.
 *   LIQUID a bright, high-contrast fill whose HEIGHT IS THE PERCENTAGE. Its
 *          rect height is computed straight from `percent`, so 25 is a quarter
 *          of the glass and 50 is half of it - no transform, no easing curve
 *          standing between the number and what is on screen.
 *
 *   The first version had one layer and a shimmer, which is why an upload in
 *   progress looked identical to an upload that had not started.
 *
 * THE NUMBER IS SHOWN WHENEVER THERE IS ONE
 *   Dots appear during `preparing` only - the one phase with genuinely nothing
 *   to report. Once bytes move, the percentage is on screen and stays there.
 *
 * Inline SVG and CSS. No image, no external dependency, nothing to fetch while
 * the visitor is already waiting on a transfer.
 */

export type UploadPhase = "preparing" | "uploading" | "finalizing" | "complete";

const MESSAGE: Record<UploadPhase, string> = {
  preparing: "Preparing your upload…",
  uploading: "Uploading your video…",
  finalizing: "Preparing your testimonial…",
  complete: "Submission complete",
};

/** Interior bounds of the bottle in viewBox units. The liquid maps linearly
 *  across this span, so "half full" means half the glass. */
const LIQUID_TOP = 26;
const LIQUID_BOTTOM = 224;
const LIQUID_SPAN = LIQUID_BOTTOM - LIQUID_TOP;

const BOTTLE_PATH =
  "M46 22 h28 v34 c0 10 4 15 10 22 c8 9 12 20 12 32 v112 c0 12 -9 22 -21 22 h-30 c-12 0 -21 -10 -21 -22 v-112 c0 -12 4 -23 12 -32 c6 -7 10 -12 10 -22 z";

export function BottleFillProgress({
  phase,
  percent,
}: {
  phase: UploadPhase;
  /** Transferred-byte percentage. Drives the number AND the liquid height. */
  percent: number;
}) {
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));
  const level = phase === "complete" ? 100 : clamped;

  // Dots only where there is nothing to measure.
  const showNumber = phase !== "preparing";

  const liquidHeight = (level / 100) * LIQUID_SPAN;
  const liquidY = LIQUID_BOTTOM - liquidHeight;

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-8">
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        {...(showNumber ? { "aria-valuenow": level } : {})}
        aria-label={MESSAGE[phase]}
        className="relative w-full max-w-[230px]"
      >
        <svg
          viewBox="0 0 120 260"
          className="h-auto w-full drop-shadow-[0_0_30px_rgba(196,120,60,0.3)]"
          aria-hidden="true"
        >
          <defs>
            <clipPath id="kameleon-bottle-interior">
              <path d={BOTTLE_PATH} />
            </clipPath>

            {/* Base: the existing chameleon treatment, dimmed. */}
            <linearGradient id="kameleon-base" x1="0" y1="1" x2="1" y2="0">
              <stop offset="0%" stopColor="#5c3011" />
              <stop offset="50%" stopColor="#8a5326" />
              <stop offset="100%" stopColor="#38583c" />
            </linearGradient>

            {/* Progress liquid: deliberately brighter and cooler at the top so
                it reads as a SECOND liquid rising over the base rather than
                more of the same. */}
            <linearGradient id="kameleon-progress" x1="0" y1="1" x2="0.6" y2="0">
              <stop offset="0%" stopColor="#e8963f" />
              <stop offset="55%" stopColor="#f7c66b" />
              <stop offset="100%" stopColor="#8fe0a2" />
            </linearGradient>
          </defs>

          <g clipPath="url(#kameleon-bottle-interior)">
            {/* --- base layer, always present, always moving ---------------- */}
            <rect x="0" y="0" width="120" height="260" fill="url(#kameleon-base)" opacity="0.4" />
            <path
              className="kameleon-base-drift"
              d="M-120 120 q30 -10 60 0 t60 0 t60 0 t60 0 t60 0 v140 h-360 z"
              fill="rgba(255,255,255,0.05)"
            />

            {/* --- progress layer, height bound to the percentage ----------- */}
            <g className="kameleon-liquid">
              <rect
                x="0"
                y={liquidY}
                width="120"
                height={liquidHeight}
                fill="url(#kameleon-progress)"
              />
              {/* Surface, drawn at the liquid line so the level is legible
                  even at low percentages. */}
              {level > 0 && (
                <>
                  <path
                    className="kameleon-wave"
                    d={`M-120 ${liquidY} q30 -6 60 0 t60 0 t60 0 t60 0 t60 0 v10 h-360 z`}
                    fill="url(#kameleon-progress)"
                    opacity="0.9"
                  />
                  <rect
                    x="0"
                    y={liquidY - 1.5}
                    width="120"
                    height="2"
                    fill="rgba(255,255,255,0.55)"
                  />
                </>
              )}
            </g>
          </g>

          {/* Glass over everything, so the outline stays crisp at any level. */}
          <path d={BOTTLE_PATH} fill="none" stroke="rgba(232,196,140,0.8)" strokeWidth="2.5" />
          <rect x="44" y="12" width="32" height="12" rx="3" fill="rgba(232,196,140,0.8)" />
        </svg>

        {/* The readout. A dark disc sits behind it so the figure stays legible
            whether the liquid behind it is dark base or bright progress. */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          {showNumber ? (
            <span className="flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-full bg-black/45 text-3xl font-semibold tabular-nums text-white backdrop-blur-[2px]">
              {level}%
            </span>
          ) : (
            <span className="kameleon-pulse text-2xl text-white drop-shadow" aria-hidden="true">
              •••
            </span>
          )}
        </div>
      </div>

      {/* One live region for the whole flow: four phase changes, not one per
          byte. */}
      <p role="status" aria-live="polite" className="text-center text-sm text-kameleon-text">
        {MESSAGE[phase]}
      </p>

      {phase === "finalizing" && (
        <p className="max-w-xs text-center text-xs text-kameleon-text-muted">
          Your video has been sent. We&rsquo;re getting it ready — this can take a moment.
        </p>
      )}

      <style>{`
        .kameleon-liquid rect,
        .kameleon-liquid path {
          transition: y 300ms linear, height 300ms linear, d 300ms linear;
        }
        .kameleon-base-drift { animation: kameleon-drift 9s linear infinite; }
        .kameleon-wave { animation: kameleon-drift 5s linear infinite; }
        .kameleon-pulse { animation: kameleon-pulse 1.4s ease-in-out infinite; }
        @keyframes kameleon-drift {
          from { transform: translateX(0); }
          to   { transform: translateX(120px); }
        }
        @keyframes kameleon-pulse {
          0%, 100% { opacity: 0.35; }
          50%      { opacity: 1; }
        }
        /* Motion is decoration: the level, the number and the message all
           still convey progress without any of it. */
        @media (prefers-reduced-motion: reduce) {
          .kameleon-liquid rect,
          .kameleon-liquid path { transition: none; }
          .kameleon-base-drift,
          .kameleon-wave,
          .kameleon-pulse { animation: none; }
        }
      `}</style>
    </div>
  );
}
