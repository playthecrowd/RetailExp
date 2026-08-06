import type { Metadata } from "next";
import { LinkButton } from "@/components/ui/Button";
import { KameleonEmblem } from "@/components/kameleon/art/Emblem";
import { getKameleonRewardState } from "@/app/experience/kameleon/actions";
import { RewardsGrid } from "@/components/kameleon/rewards/RewardsGrid";

export const metadata: Metadata = {
  title: "Kameleon — Your Rewards",
};

/**
 * Real route (not another internal reducer `screen`), matching the
 * existing app/experience/kameleon/ar-snap-test sub-route precedent.
 * Reward state is read server-side via lib/supabase/server.ts, scoped by
 * RLS to the caller's own real (Anonymous Sign-In) session — see
 * app/experience/kameleon/actions.ts. The interactive grid (claim buttons,
 * detail modal) is a client component fed this initial state as props.
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
    <>
      <div className="pt-5 text-center">
        <KameleonEmblem className="mx-auto h-7 w-auto" />
      </div>
      <RewardsGrid initialRewards={rewardState.rewards} initialTotalPoints={rewardState.totalPointsEarned} />
    </>
  );
}
