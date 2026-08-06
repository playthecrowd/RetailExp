import type { Metadata } from "next";
import { LinkButton } from "@/components/ui/Button";
import { KameleonEmblem } from "@/components/kameleon/art/Emblem";
import { CheckCircleIcon, LockIcon } from "@/components/kameleon/icons";
import { getKameleonRewardState } from "@/app/experience/kameleon/actions";
import { REWARD_CATALOG, TOTAL_REWARD_POINTS } from "@/lib/kameleon/rewards";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/cn";

export const metadata: Metadata = {
  title: "Kameleon — Your Rewards",
};

/**
 * Real route (not another internal reducer `screen`), matching the
 * existing app/experience/kameleon/ar-snap-test sub-route precedent.
 * Reward unlock state is read server-side via lib/supabase/server.ts,
 * scoped by RLS to the caller's own real (Anonymous Sign-In) session —
 * see app/experience/kameleon/actions.ts.
 */
export default async function KameleonRewardsPage() {
  const rewardState = await getKameleonRewardState();

  if (!rewardState) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
        <KameleonEmblem className="h-7 w-auto" />
        <p className="font-display text-lg font-semibold uppercase tracking-wide text-kameleon-copper-light">
          No Passport Found
        </p>
        <p className="max-w-xs text-sm text-kameleon-text-muted">
          Create your KAMELEON passport first to start unlocking rewards.
        </p>
        <LinkButton brand="kameleon" href="/experience/kameleon">
          Back to Kameleon
        </LinkButton>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-5 px-4 pb-8 pt-5">
      <div className="text-center">
        <KameleonEmblem className="mx-auto h-7 w-auto" />
        <h1 className="mt-3 font-display text-2xl font-semibold uppercase tracking-wide text-kameleon-copper-light">
          Your Rewards
        </h1>
        <p className="mt-1 text-sm text-kameleon-text-muted">
          <span className="font-semibold text-kameleon-text">{rewardState.totalPointsEarned}</span> /{" "}
          {TOTAL_REWARD_POINTS} points earned
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {REWARD_CATALOG.map((reward) => {
          const unlockedAt = rewardState.unlockedAtByKey[reward.id];
          const unlocked = Boolean(unlockedAt);
          return (
            <div
              key={reward.id}
              className={cn(
                "relative flex flex-col overflow-hidden rounded-2xl border",
                unlocked ? "border-kameleon-copper/50 bg-kameleon-surface" : "border-kameleon-border bg-kameleon-surface/60",
              )}
            >
              <div className="relative aspect-square w-full">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={reward.image}
                  alt=""
                  className={cn("h-full w-full object-cover", !unlocked && "opacity-40 grayscale")}
                />
                {!unlocked && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                    <LockIcon className="h-7 w-7 text-kameleon-text-muted" />
                  </div>
                )}
              </div>
              <div className="flex flex-1 flex-col gap-1 p-3">
                <p className="font-display text-sm font-semibold uppercase tracking-wide text-kameleon-text">
                  {reward.name}
                </p>
                <p className="text-[11px] text-kameleon-text-muted">{reward.description}</p>
                <div className="mt-auto flex items-center justify-between pt-2 text-[10px] uppercase tracking-widest">
                  <span className="text-kameleon-copper-light">{reward.points} pts</span>
                  {unlocked ? (
                    <span className="flex items-center gap-1 text-kameleon-text-muted">
                      <CheckCircleIcon className="h-3.5 w-3.5 text-kameleon-copper-light" />
                      {formatDate(unlockedAt)}
                    </span>
                  ) : (
                    <span className="text-kameleon-text-muted">Locked</span>
                  )}
                </div>
                {!unlocked && <p className="text-[10px] text-kameleon-text-muted/80">{reward.unlockDescription}</p>}
              </div>
            </div>
          );
        })}
      </div>

      <LinkButton brand="kameleon" variant="secondary" size="lg" fullWidth href="/experience/kameleon">
        Back to Journey
      </LinkButton>
    </div>
  );
}
