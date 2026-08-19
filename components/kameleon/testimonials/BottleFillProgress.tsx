"use client";

/**
 * The video upload experience: a Kameleon bottle filling from the bottom.
 *
 * WHY A BOTTLE AND NOT A BAR
 *   A video upload on a phone takes long enough that a thin bar reads as "the
 *   page is stuck". The bottle gives the wait a shape and a direction, and it
 *   is the one object this brand already owns.
 *
 * HONESTY IS THE WHOLE POINT
 *   The fill height is driven by bytes the browser has actually sent. When the
 *   transfer finishes there is no percentage to show for provider processing,
 *   so the component goes INDETERMINATE rather than inventing one: no number,
 *   no aria-valuenow, and a slow shimmer instead of a growing level. 100% is
 *   reached only when the caller says finalization succeeded.
 *
 *   `phase` is what makes that impossible to get wrong by accident — there is
 *   no way to render a number during finalizing, because the number is not
 *   read in that branch.
 *
 * Inline SVG and CSS only. No image, no external dependency, nothing to load
 * while the visitor is already waiting on a load.
 */

export type UploadPhase = "uploading" | "finalizing" | "complete";

const MESSAGE: Record<UploadPhase, string> = {
  uploading: "Uploading your video…",
  finalizing: "Preparing your testimonial…",
  complete: "Submission complete",
};

export function BottleFillProgress({
  phase,
  percent,
  determinate,
}: {
  phase: UploadPhase;
  /** Real transferred-byte percentage. Ignored unless the phase is uploading. */
  percent: number;
  /** False when the browser could not report length — no number is shown. */
  determinate: boolean;
}) {
  const showNumber = phase === "uploading" && determinate;
  const displayPercent = phase === "complete" ? 100 : Math.max(0, Math.min(100, percent));

  // Finalizing holds the level where the transfer left it. Dropping back would
  // read as progress lost; climbing would be a number nobody measured.
  const fillPercent = phase === "complete" ? 100 : displayPercent;

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-8">
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        {...(showNumber || phase === "complete" ? { "aria-valuenow": displayPercent } : {})}
        aria-label={MESSAGE[phase]}
        className="relative w-full max-w-[220px]"
      >
        <svg
          viewBox="0 0 120 260"
          className="h-auto w-full drop-shadow-[0_0_28px_rgba(196,120,60,0.28)]"
          aria-hidden="true"
        >
          <defs>
            {/* The bottle interior. Everything liquid is clipped to it, so the
                fill can be a plain rectangle and still take the bottle's
                shape at every height. */}
            <clipPath id="kameleon-bottle-interior">
              <path d="M46 22 h28 v34 c0 10 4 15 10 22 c8 9 12 20 12 32 v112 c0 12 -9 22 -21 22 h-30 c-12 0 -21 -10 -21 -22 v-112 c0 -12 4 -23 12 -32 c6 -7 10 -12 10 -22 z" />
            </clipPath>

            {/* The chameleon shift: the brand's copper through to its green,
                travelling as the liquid settles. */}
            <linearGradient id="kameleon-liquid" x1="0" y1="1" x2="1" y2="0">
              <stop offset="0%" stopColor="#7a3f16" />
              <stop offset="35%" stopColor="#c4783c" />
              <stop offset="65%" stopColor="#e0a468" />
              <stop offset="100%" stopColor="#4c7a52" />
            </linearGradient>

            <linearGradient id="kameleon-sheen" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="rgba(255,255,255,0)" />
              <stop offset="50%" stopColor="rgba(255,255,255,0.30)" />
              <stop offset="100%" stopColor="rgba(255,255,255,0)" />
            </linearGradient>
          </defs>

          <g clipPath="url(#kameleon-bottle-interior)">
            <rect x="0" y="0" width="120" height="260" fill="rgba(255,255,255,0.05)" />

            {/* Bottom-up fill. y is driven by the real percentage; the
                transition is what makes byte updates read as a rise rather
                than a jump. */}
            <g
              className="kameleon-fill"
              style={{ transform: `translateY(${100 - fillPercent}%)` }}
            >
              <rect x="0" y="0" width="120" height="260" fill="url(#kameleon-liquid)" />
              {/* The meniscus. Two offset curves drifting against each other
                  read as liquid without a physics simulation. */}
              <path
                className="kameleon-wave"
                d="M-120 4 q30 -8 60 0 t60 0 t60 0 t60 0 t60 0 v-14 h-360 z"
                fill="url(#kameleon-liquid)"
                opacity="0.85"
              />
              <path
                className="kameleon-wave kameleon-wave-2"
                d="M-120 6 q30 7 60 0 t60 0 t60 0 t60 0 t60 0 v-16 h-360 z"
                fill="rgba(255,255,255,0.18)"
              />
            </g>

            <rect className="kameleon-sheen" x="24" y="0" width="26" height="260" fill="url(#kameleon-sheen)" />
          </g>

          {/* Glass over the liquid, so the outline stays crisp at every level. */}
          <path
            d="M46 22 h28 v34 c0 10 4 15 10 22 c8 9 12 20 12 32 v112 c0 12 -9 22 -21 22 h-30 c-12 0 -21 -10 -21 -22 v-112 c0 -12 4 -23 12 -32 c6 -7 10 -12 10 -22 z"
            fill="none"
            stroke="rgba(224,164,104,0.75)"
            strokeWidth="2.5"
          />
          <rect x="44" y="12" width="32" height="12" rx="3" fill="rgba(224,164,104,0.75)" />
        </svg>

        {/* The readout, centred in the bottle. Indeterminate phases show a
            pulse instead of a number - there is no number to show. */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          {showNumber ? (
            <span className="text-3xl font-semibold tabular-nums text-white drop-shadow">
              {displayPercent}%
            </span>
          ) : phase === "complete" ? (
            <span className="text-3xl font-semibold tabular-nums text-white drop-shadow">100%</span>
          ) : (
            <span className="kameleon-pulse text-2xl text-white drop-shadow" aria-hidden="true">
              •••
            </span>
          )}
        </div>
      </div>

      {/* One live region for the whole flow. Phase changes are few, so this
          announces three times rather than on every byte. */}
      <p role="status" aria-live="polite" className="text-center text-sm text-kameleon-text">
        {MESSAGE[phase]}
      </p>

      {phase === "finalizing" && (
        <p className="max-w-xs text-center text-xs text-kameleon-text-muted">
          Your video has been sent. We&rsquo;re getting it ready — this can take a moment.
        </p>
      )}

      <style>{`
        .kameleon-fill {
          transition: transform 420ms cubic-bezier(0.22, 0.61, 0.36, 1);
          will-change: transform;
        }
        .kameleon-wave {
          animation: kameleon-drift 5s linear infinite;
        }
        .kameleon-wave-2 {
          animation: kameleon-drift 7s linear infinite reverse;
        }
        .kameleon-sheen {
          animation: kameleon-sheen 4.5s ease-in-out infinite;
        }
        .kameleon-pulse {
          animation: kameleon-pulse 1.4s ease-in-out infinite;
        }
        @keyframes kameleon-drift {
          from { transform: translateX(0); }
          to   { transform: translateX(120px); }
        }
        @keyframes kameleon-sheen {
          0%, 100% { opacity: 0.15; transform: translateX(0); }
          50%      { opacity: 0.4;  transform: translateX(38px); }
        }
        @keyframes kameleon-pulse {
          0%, 100% { opacity: 0.35; }
          50%      { opacity: 1; }
        }
        /* Motion is decoration here: the level, the number and the message all
           still convey progress without it. */
        @media (prefers-reduced-motion: reduce) {
          .kameleon-fill { transition: none; }
          .kameleon-wave,
          .kameleon-wave-2,
          .kameleon-sheen,
          .kameleon-pulse { animation: none; }
        }
      `}</style>
    </div>
  );
}
