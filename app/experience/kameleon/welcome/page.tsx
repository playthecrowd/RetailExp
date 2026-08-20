import type { Metadata } from "next";
import { AgeGateForm } from "@/components/kameleon/AgeGateForm";
import { KameleonEmblem } from "@/components/kameleon/art/Emblem";

export const metadata: Metadata = {
  title: "Kameleon — Welcome",
  robots: { index: false, follow: false },
};

/**
 * The 21+ age gate.
 *
 * Deliberately OUTSIDE the (gated) route group — a gate that redirected to
 * itself would loop — while still inside the Kameleon layout, so it inherits
 * the experience's own typography and safe-area handling.
 *
 * PREMIUM, NOT PLAYFUL. This is the first thing anyone sees, and it is the
 * moment the experience says what kind of product it is. A bottle silhouette
 * in glass, a slow chameleon shift behind it, and nothing that moves quickly.
 *
 * Every colour, the emblem and the bottle are inline SVG and existing tokens:
 * no image is fetched, so the gate cannot be the thing that makes the first
 * load slow.
 */
export default function KameleonWelcomePage() {
  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-6 py-10">
      {/* Ambient chameleon field. Two very slow, very large washes — the shift
          should be noticed only if you look for it. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="kameleon-aurora kameleon-aurora-a absolute -left-1/3 top-[-20%] h-[70vh] w-[110vw] rounded-full blur-3xl" />
        <div className="kameleon-aurora kameleon-aurora-b absolute -right-1/3 bottom-[-25%] h-[70vh] w-[110vw] rounded-full blur-3xl" />
      </div>

      {/* Glass. Sits behind the content as a watermark rather than beside it,
          so the portrait layout stays a single column. */}
      <svg
        aria-hidden="true"
        viewBox="0 0 120 260"
        className="pointer-events-none absolute left-1/2 top-1/2 h-[78vh] w-auto -translate-x-1/2 -translate-y-1/2 opacity-[0.13]"
      >
        <defs>
          <linearGradient id="kameleon-gate-glass" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0%" stopColor="#7a3f16" />
            <stop offset="50%" stopColor="#e0a468" />
            <stop offset="100%" stopColor="#4c7a52" />
          </linearGradient>
        </defs>
        <path
          d="M46 22 h28 v34 c0 10 4 15 10 22 c8 9 12 20 12 32 v112 c0 12 -9 22 -21 22 h-30 c-12 0 -21 -10 -21 -22 v-112 c0 -12 4 -23 12 -32 c6 -7 10 -12 10 -22 z"
          fill="none"
          stroke="url(#kameleon-gate-glass)"
          strokeWidth="2"
        />
        <rect x="44" y="12" width="32" height="12" rx="3" fill="url(#kameleon-gate-glass)" />
      </svg>

      <div className="relative flex w-full max-w-sm flex-col items-center gap-7 text-center">
        <KameleonEmblem className="h-14 w-14" />

        <div className="flex flex-col gap-3">
          <h1 className="font-display text-2xl font-semibold uppercase tracking-wide text-kameleon-copper-light sm:text-3xl">
            Welcome to the Kameleon Experience
          </h1>
          <p className="text-sm text-kameleon-text">
            Please enter your date of birth to confirm that you are 21 years of age or older.
          </p>
        </div>

        <AgeGateForm />

        <div className="flex flex-col gap-2 border-t border-kameleon-copper/20 pt-5 text-xs text-kameleon-text-muted">
          <p>By entering, you confirm that you are of legal drinking age in your location.</p>
          <p className="uppercase tracking-widest text-kameleon-copper-light/80">
            Please enjoy responsibly. Never drink and drive.
          </p>
        </div>
      </div>

      <style>{`
        .kameleon-aurora {
          background: radial-gradient(closest-side, rgba(196,120,60,0.42), rgba(196,120,60,0) 72%);
        }
        .kameleon-aurora-a { animation: kameleon-shift-a 26s ease-in-out infinite; }
        .kameleon-aurora-b {
          background: radial-gradient(closest-side, rgba(76,122,82,0.38), rgba(76,122,82,0) 72%);
          animation: kameleon-shift-b 32s ease-in-out infinite;
        }
        @keyframes kameleon-shift-a {
          0%, 100% { transform: translate3d(0,0,0)      scale(1);    opacity: 0.55; }
          50%      { transform: translate3d(6%,4%,0)    scale(1.12); opacity: 0.85; }
        }
        @keyframes kameleon-shift-b {
          0%, 100% { transform: translate3d(0,0,0)      scale(1.08); opacity: 0.45; }
          50%      { transform: translate3d(-5%,-4%,0)  scale(1);    opacity: 0.75; }
        }
        /* The gate must be perfectly usable without any of this: the washes are
           atmosphere, and every word and control is already static. */
        @media (prefers-reduced-motion: reduce) {
          .kameleon-aurora-a,
          .kameleon-aurora-b { animation: none; }
        }
      `}</style>
    </main>
  );
}
