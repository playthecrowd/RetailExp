"use client";

import { useState } from "react";
import Link from "next/link";
import { REWARD_CATALOG } from "@/lib/kameleon/rewards";
import { claimKameleonReward } from "@/app/experience/kameleon/actions";
import { CheckCircleIcon } from "@/components/kameleon/icons";
import { cn } from "@/lib/cn";

type Stage = "congrats" | "claiming" | "success" | "error";

/**
 * Reward-unlock celebration shown over JourneyCompletion when a pending
 * final-pathway reward is detected. Opening this popup does NOT claim the
 * reward — it only displays the already-pending entitlement (created by
 * ensureFinalRewardPending() before this mounts); the reward becomes
 * claimed, and points are awarded, only when the user taps Claim.
 */
export function RewardClaimPopup({ rewardKey, onClose }: { rewardKey: string; onClose: () => void }) {
  const [stage, setStage] = useState<Stage>("congrats");
  const [error, setError] = useState<string | null>(null);
  const [pointsAwarded, setPointsAwarded] = useState<number | null>(null);

  const reward = REWARD_CATALOG.find((r) => r.id === rewardKey);
  if (!reward) return null;

  async function handleClaim() {
    setStage("claiming");
    setError(null);
    try {
      const result = await claimKameleonReward(rewardKey);
      setPointsAwarded(result.pointsAwarded);
      setStage("success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong claiming this reward. Please try again.");
      setStage("error");
    }
  }

  const isCircular = stage === "success";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={isCircular ? "Reward claimed" : "Reward unlocked"}
    >
      <div
        className={cn(
          "kameleon-claim-pop relative flex w-full max-w-sm flex-col items-center gap-3 overflow-hidden border-2 border-kameleon-copper bg-kameleon-bg p-6 text-center shadow-[0_0_60px_rgba(178,58,58,0.35)] transition-all duration-500",
          isCircular ? "aspect-square rounded-full justify-center" : "rounded-3xl",
        )}
      >
        <div className="kameleon-claim-glow pointer-events-none absolute inset-0" aria-hidden="true" />
        {!isCircular && (
          <div className="kameleon-claim-particles pointer-events-none absolute inset-0" aria-hidden="true" />
        )}

        {stage !== "success" ? (
          <div className="relative flex w-full flex-col items-center gap-3">
            <p className="font-display text-2xl font-bold uppercase tracking-wide text-kameleon-copper-light">
              Congratulations!
            </p>
            <p className="text-sm text-kameleon-text-muted">You unlocked a new KAMELEON reward.</p>

            <div className="mt-1 flex h-40 w-40 items-center justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={reward.image} alt={reward.name} className="h-full w-full object-contain" />
            </div>

            <p className="font-display text-lg font-semibold uppercase tracking-wide text-kameleon-text">
              {reward.name}
            </p>
            <p className="text-xs text-kameleon-text-muted">{reward.shortDescription}</p>
            <p className="text-sm font-semibold text-kameleon-copper-light">{reward.points} points</p>

            {stage === "error" && error && (
              <p role="alert" className="text-sm text-kameleon-red">
                {error}
              </p>
            )}

            <button
              type="button"
              onClick={handleClaim}
              disabled={stage === "claiming"}
              className="mt-2 flex h-14 w-full items-center justify-center rounded-lg bg-kameleon-copper text-base font-semibold uppercase tracking-wide text-kameleon-bg transition-colors hover:bg-kameleon-copper-light disabled:opacity-60"
            >
              {stage === "claiming" ? "Claiming…" : "Claim"}
            </button>
          </div>
        ) : (
          <div className="relative flex flex-col items-center gap-2 px-4">
            <CheckCircleIcon className="h-12 w-12 text-kameleon-copper-light" />
            <p className="font-display text-xl font-bold uppercase tracking-wide text-kameleon-copper-light">
              Success
            </p>
            <p className="max-w-[14rem] text-xs text-kameleon-text-muted">
              Your reward has been added to your collection.
              {pointsAwarded ? ` +${pointsAwarded} points.` : ""}
            </p>
            <Link
              href="/experience/kameleon/rewards"
              className="mt-2 flex h-11 items-center justify-center rounded-full bg-kameleon-copper px-5 text-xs font-semibold uppercase tracking-wide text-kameleon-bg transition-colors hover:bg-kameleon-copper-light"
            >
              View Your Rewards
            </Link>
            <button
              type="button"
              onClick={onClose}
              className="text-[11px] text-kameleon-text-muted underline-offset-4 hover:underline"
            >
              Close
            </button>
          </div>
        )}
      </div>

      <style>{`
        .kameleon-claim-pop { animation: kameleon-claim-enter 0.45s cubic-bezier(0.2, 0.8, 0.2, 1); }
        @keyframes kameleon-claim-enter {
          0% { opacity: 0; transform: scale(0.85) translateY(12px); }
          100% { opacity: 1; transform: scale(1) translateY(0); }
        }
        .kameleon-claim-glow {
          background: radial-gradient(60% 60% at 50% 40%, rgba(178,58,58,0.35), transparent 70%);
        }
        .kameleon-claim-particles {
          background-image:
            radial-gradient(1.5px 1.5px at 20% 30%, rgba(224,181,131,0.9), transparent),
            radial-gradient(1.5px 1.5px at 70% 20%, rgba(224,181,131,0.7), transparent),
            radial-gradient(1.5px 1.5px at 40% 70%, rgba(224,181,131,0.8), transparent),
            radial-gradient(1.5px 1.5px at 85% 65%, rgba(224,181,131,0.6), transparent),
            radial-gradient(1.5px 1.5px at 60% 45%, rgba(224,181,131,0.7), transparent);
          animation: kameleon-claim-particles-drift 6s ease-in-out infinite;
        }
        @keyframes kameleon-claim-particles-drift {
          0%, 100% { opacity: 0.6; transform: translateY(0); }
          50% { opacity: 1; transform: translateY(-6px); }
        }
        @media (prefers-reduced-motion: reduce) {
          .kameleon-claim-pop { animation: none; }
          .kameleon-claim-particles { animation: none; }
        }
      `}</style>
    </div>
  );
}
