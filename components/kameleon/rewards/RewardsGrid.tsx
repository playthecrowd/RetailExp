"use client";

import { useState } from "react";
import { REWARD_CATALOG, TOTAL_REWARD_POINTS, ASSET_CLASSIFICATION, type RewardDefinition } from "@/lib/kameleon/rewards";
import { claimKameleonReward, type KameleonRewardEntry } from "@/app/experience/kameleon/actions";
import { CheckCircleIcon, LockIcon } from "@/components/kameleon/icons";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/cn";

type CardStatus = "locked" | "pending" | "claimed";

function statusFor(entry: KameleonRewardEntry | undefined): CardStatus {
  if (!entry) return "locked";
  return entry.status === "claimed" ? "claimed" : "pending";
}

export function RewardsGrid({ initialRewards, initialTotalPoints }: {
  initialRewards: Record<string, KameleonRewardEntry>;
  initialTotalPoints: number;
}) {
  const [rewards, setRewards] = useState(initialRewards);
  const [totalPoints, setTotalPoints] = useState(initialTotalPoints);
  const [claimingKey, setClaimingKey] = useState<string | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [detailKey, setDetailKey] = useState<string | null>(null);

  async function handleClaim(rewardKey: string) {
    setClaimingKey(rewardKey);
    setClaimError(null);
    try {
      const result = await claimKameleonReward(rewardKey);
      // wasAlreadyClaimed is read from render-time state (not recomputed
      // inside the setRewards updater) deliberately: nesting a setState
      // call inside another state updater function causes it to be
      // invoked as a genuine side effect on every re-invocation of that
      // updater — including React Strict Mode's dev-only double-invoke —
      // which double-counted points here previously.
      const wasAlreadyClaimed = rewards[rewardKey]?.status === "claimed";
      setRewards((prev) => ({
        ...prev,
        [rewardKey]: {
          status: "claimed",
          pointsAwarded: result.pointsAwarded,
          unlockedAt: prev[rewardKey]?.unlockedAt ?? result.claimedAt,
          claimedAt: result.claimedAt,
        },
      }));
      if (!wasAlreadyClaimed) setTotalPoints((p) => p + result.pointsAwarded);
    } catch (err) {
      setClaimError(err instanceof Error ? err.message : "Could not claim this reward. Please try again.");
    } finally {
      setClaimingKey(null);
    }
  }

  const detailReward = detailKey ? REWARD_CATALOG.find((r) => r.id === detailKey) : undefined;
  const detailEntry = detailKey ? rewards[detailKey] : undefined;

  return (
    <>
      <div className="flex flex-1 flex-col gap-5 px-4 pb-8 pt-5">
        <div className="text-center">
          <h1 className="font-display text-2xl font-semibold uppercase tracking-wide text-kameleon-copper-light">
            Your Rewards
          </h1>
          <p className="mt-1 text-sm text-kameleon-text-muted">
            <span className="font-semibold text-kameleon-text">{totalPoints}</span> / {TOTAL_REWARD_POINTS} points earned
          </p>
        </div>

        {claimError && (
          <p role="alert" className="text-center text-sm text-kameleon-red">
            {claimError}
          </p>
        )}

        <div className="grid grid-cols-2 gap-3">
          {REWARD_CATALOG.map((reward) => (
            <RewardCard
              key={reward.id}
              reward={reward}
              entry={rewards[reward.id]}
              claiming={claimingKey === reward.id}
              onClaim={() => handleClaim(reward.id)}
              onOpenDetail={() => setDetailKey(reward.id)}
            />
          ))}
        </div>

        <a
          href="/experience/kameleon"
          className="flex h-14 w-full items-center justify-center rounded-lg border border-kameleon-copper text-sm font-semibold uppercase tracking-wide text-kameleon-copper-light hover:bg-kameleon-surface-raised"
        >
          Back to Journey
        </a>
      </div>

      {detailReward && (
        <RewardDetailModal
          reward={detailReward}
          status={statusFor(detailEntry)}
          entry={detailEntry}
          onClose={() => setDetailKey(null)}
        />
      )}
    </>
  );
}

function RewardCard({
  reward,
  entry,
  claiming,
  onClaim,
  onOpenDetail,
}: {
  reward: RewardDefinition;
  entry: KameleonRewardEntry | undefined;
  claiming: boolean;
  onClaim: () => void;
  onOpenDetail: () => void;
}) {
  const status = statusFor(entry);

  return (
    <div
      className={cn(
        "relative flex flex-col overflow-hidden rounded-2xl border",
        status === "claimed" ? "border-kameleon-copper/50 bg-kameleon-surface" : "border-kameleon-border bg-kameleon-surface/60",
      )}
    >
      <button type="button" onClick={onOpenDetail} className="relative aspect-square w-full text-left">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={reward.image}
          alt=""
          className={cn("h-full w-full object-cover", status === "locked" && "opacity-40 grayscale")}
        />
        {status === "locked" && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <LockIcon className="h-7 w-7 text-kameleon-text-muted" />
          </div>
        )}
      </button>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <button type="button" onClick={onOpenDetail} className="text-left">
          <p className="font-display text-sm font-semibold uppercase tracking-wide text-kameleon-text">{reward.name}</p>
        </button>
        <p className="text-[11px] text-kameleon-text-muted">{reward.shortDescription}</p>
        <div className="mt-auto flex items-center justify-between pt-2 text-[10px] uppercase tracking-widest">
          <span className="text-kameleon-copper-light">{reward.points} pts</span>
          {status === "claimed" && (
            <span className="flex items-center gap-1 text-kameleon-text-muted">
              <CheckCircleIcon className="h-3.5 w-3.5 text-kameleon-copper-light" />
              {entry?.claimedAt ? formatDate(entry.claimedAt) : "Claimed"}
            </span>
          )}
          {status === "locked" && <span className="text-kameleon-text-muted">Locked</span>}
          {status === "pending" && <span className="text-kameleon-copper-light">Ready to Claim</span>}
        </div>
        {status === "locked" && <p className="text-[10px] text-kameleon-text-muted/80">{reward.unlockDescription}</p>}
        {status === "pending" && (
          <button
            type="button"
            onClick={onClaim}
            disabled={claiming}
            className="mt-1 flex h-9 w-full items-center justify-center rounded-md bg-kameleon-copper text-[11px] font-semibold uppercase tracking-wide text-kameleon-bg transition-colors hover:bg-kameleon-copper-light disabled:opacity-60"
          >
            {claiming ? "Claiming…" : "Claim"}
          </button>
        )}
      </div>
    </div>
  );
}

function RewardDetailModal({
  reward,
  status,
  entry,
  onClose,
}: {
  reward: RewardDefinition;
  status: CardStatus;
  entry: KameleonRewardEntry | undefined;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={reward.name}
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-sm overflow-y-auto rounded-2xl border border-kameleon-copper/40 bg-kameleon-surface p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="aspect-square w-full overflow-hidden rounded-xl">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={reward.image}
            alt=""
            className={cn("h-full w-full object-cover", status === "locked" && "opacity-40 grayscale")}
          />
        </div>
        <p className="mt-4 font-display text-lg font-semibold uppercase tracking-wide text-kameleon-copper-light">
          {reward.name}
        </p>
        <p className="mt-2 text-sm text-kameleon-text">{reward.fullDescription}</p>
        <p className="mt-3 text-xs uppercase tracking-widest text-kameleon-text-muted">Symbolic meaning</p>
        <p className="mt-1 text-sm text-kameleon-text-muted">{reward.symbolicMeaning}</p>

        <div className="mt-4 flex items-center justify-between text-xs">
          <span className="text-kameleon-copper-light">{reward.points} points</span>
          <span className="text-kameleon-text-muted">
            {status === "claimed" && entry?.claimedAt
              ? `Claimed ${formatDate(entry.claimedAt)}`
              : status === "pending"
                ? "Ready to Claim"
                : "Locked"}
          </span>
        </div>

        <p className="mt-3 rounded-full border border-kameleon-border px-3 py-1 text-center text-[10px] uppercase tracking-widest text-kameleon-text-muted">
          {ASSET_CLASSIFICATION}
        </p>

        <button
          type="button"
          onClick={onClose}
          className="mt-4 flex h-11 w-full items-center justify-center rounded-full bg-kameleon-copper-light text-sm font-semibold uppercase tracking-wide text-kameleon-bg"
        >
          Close
        </button>
      </div>
    </div>
  );
}
