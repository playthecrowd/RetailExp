"use server";

import { createClient } from "@/lib/supabase/server";
import { REWARD_CATALOG } from "@/lib/kameleon/rewards";

const KAMELEON_EXPERIENCE_SLUG = "kameleon";

/**
 * Runs under the caller's own real (Anonymous Sign-In) session via
 * lib/supabase/server.ts's publishable-key client — relies on RLS, never
 * bypasses it (see docs/PHASE7_CHECKPOINT_7_3_AUTHENTICATION_PLAN.md §1B).
 */
async function getOrCreateExperienceUser(profile?: {
  firstName: string;
  lastName: string;
  email: string;
}): Promise<{ id: string; clientId: string }> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No authenticated session — sign in before enrolling.");

  const { data: experience, error: experienceError } = await supabase
    .from("experiences")
    .select("id, client_id")
    .eq("slug", KAMELEON_EXPERIENCE_SLUG)
    .single();
  if (experienceError || !experience) {
    throw new Error(`Could not resolve Kameleon experience: ${experienceError?.message}`);
  }

  const { data: existing, error: existingError } = await supabase
    .from("experience_users")
    .select("id, client_id")
    .eq("experience_id", experience.id)
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (existingError) throw new Error(`Could not look up experience_users: ${existingError.message}`);
  if (existing) return { id: existing.id, clientId: existing.client_id };

  const { data: inserted, error: insertError } = await supabase
    .from("experience_users")
    .insert({
      experience_id: experience.id,
      client_id: experience.client_id,
      auth_user_id: user.id,
      display_name: profile ? `${profile.firstName} ${profile.lastName}` : null,
      email: profile?.email ?? null,
    })
    .select("id, client_id")
    .single();
  if (insertError || !inserted) throw new Error(`Could not create experience_users row: ${insertError?.message}`);

  return { id: inserted.id, clientId: inserted.client_id };
}

/**
 * Reward eligibility and reward claiming are separate events (see
 * IMPORTANT DATA RULE in the Phase 7 spec): this only ever creates a
 * PENDING entitlement at 0 points — claimKameleonReward() below is what
 * actually awards points. Idempotent via the unique (experience_user_id,
 * reward_key) constraint + ignoreDuplicates.
 */
async function qualifyRewardInternal(experienceUserId: string, clientId: string, rewardKey: string) {
  if (!REWARD_CATALOG.some((r) => r.id === rewardKey)) throw new Error(`Unknown reward key: ${rewardKey}`);

  const supabase = await createClient();
  const { error } = await supabase.from("experience_user_rewards").upsert(
    {
      experience_user_id: experienceUserId,
      client_id: clientId,
      reward_key: rewardKey,
      status: "pending",
      points_awarded: 0,
    },
    { onConflict: "experience_user_id,reward_key", ignoreDuplicates: true },
  );
  if (error) throw new Error(`Could not create reward entitlement "${rewardKey}": ${error.message}`);
}

/**
 * Quick Account submit — creates (or reuses) the caller's experience_users
 * row and qualifies the first reward as pending. Awaited by the UI:
 * account creation must actually succeed before the journey proceeds,
 * since every later reward depends on this row existing.
 */
export async function enrollKameleonUser(profile: { firstName: string; lastName: string; email: string }) {
  const { id, clientId } = await getOrCreateExperienceUser(profile);
  await qualifyRewardInternal(id, clientId, "kameleon_bottle_pedestal");
  return { experienceUserId: id };
}

/**
 * Fire-and-forget from client components at each later qualifying moment
 * (AR completion, first pathway decision). No-ops quietly if the caller
 * has no session or hasn't completed Quick Account yet — that shouldn't
 * happen given the required screen order, but this must never throw and
 * block the actual journey UI over a rewards hiccup.
 */
export async function unlockKameleonReward(rewardKey: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { data: experience } = await supabase
    .from("experiences")
    .select("id")
    .eq("slug", KAMELEON_EXPERIENCE_SLUG)
    .single();
  if (!experience) return;

  const { data: existing } = await supabase
    .from("experience_users")
    .select("id, client_id")
    .eq("experience_id", experience.id)
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!existing) return;

  await qualifyRewardInternal(existing.id, existing.client_id, rewardKey);
}

/**
 * PP-FINAL reached — called from JourneyCompletion.tsx on mount (not from
 * JourneyPlayer, to avoid a race between the fire-and-forget qualify call
 * and the completion screen immediately needing to know whether to show
 * the claim popup). Qualifies the reward as pending if this is the first
 * time, then returns its current status either way.
 */
export async function ensureFinalRewardPending(): Promise<"pending" | "claimed" | "unavailable"> {
  const REWARD_KEY = "atlanta_rooftop_gathering";
  try {
    await unlockKameleonReward(REWARD_KEY);
  } catch {
    return "unavailable";
  }
  const state = await getKameleonRewardState();
  const entry = state?.rewards[REWARD_KEY];
  return entry ? entry.status : "unavailable";
}

export interface ClaimRewardResult {
  rewardKey: string;
  pointsAwarded: number;
  claimedAt: string;
  /** True if this call found the reward already claimed rather than actually claiming it just now — still a success from the UI's point of view. */
  alreadyClaimed: boolean;
}

/**
 * Marks a pending reward claimed and awards its points — exactly once.
 * The UPDATE ... WHERE status = 'pending' is the entire idempotency
 * mechanism: a double-click, refresh-mid-claim, retry after a network
 * delay, or reopened popup all resolve to the same 0-row no-op once the
 * first call has committed, under normal Postgres read-committed row
 * locking. Never throws for "already claimed" — that's treated as success
 * so the UI can move straight to the Success state either way.
 */
export async function claimKameleonReward(rewardKey: string): Promise<ClaimRewardResult> {
  const catalogEntry = REWARD_CATALOG.find((r) => r.id === rewardKey);
  if (!catalogEntry) throw new Error(`Unknown reward key: ${rewardKey}`);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No authenticated session.");

  const { data: experience } = await supabase
    .from("experiences")
    .select("id")
    .eq("slug", KAMELEON_EXPERIENCE_SLUG)
    .single();
  if (!experience) throw new Error("Could not resolve Kameleon experience.");

  const { data: experienceUser } = await supabase
    .from("experience_users")
    .select("id")
    .eq("experience_id", experience.id)
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!experienceUser) throw new Error("Reward not yet unlocked for this account.");

  const nowIso = new Date().toISOString();
  const { data: claimedRow, error: claimError } = await supabase
    .from("experience_user_rewards")
    .update({ status: "claimed", claimed_at: nowIso, points_awarded: catalogEntry.points })
    .eq("experience_user_id", experienceUser.id)
    .eq("reward_key", rewardKey)
    .eq("status", "pending")
    .select("points_awarded, claimed_at")
    .maybeSingle();
  if (claimError) throw new Error(`Could not claim reward: ${claimError.message}`);

  if (claimedRow) {
    return { rewardKey, pointsAwarded: claimedRow.points_awarded, claimedAt: claimedRow.claimed_at!, alreadyClaimed: false };
  }

  // 0 rows updated: either already claimed, or never qualified at all.
  const { data: existingRow, error: existingError } = await supabase
    .from("experience_user_rewards")
    .select("status, points_awarded, claimed_at")
    .eq("experience_user_id", experienceUser.id)
    .eq("reward_key", rewardKey)
    .maybeSingle();
  if (existingError) throw new Error(`Could not verify reward state: ${existingError.message}`);
  if (!existingRow || existingRow.status !== "claimed") {
    throw new Error("This reward isn't ready to claim yet. Please try again.");
  }

  return { rewardKey, pointsAwarded: existingRow.points_awarded, claimedAt: existingRow.claimed_at!, alreadyClaimed: true };
}

export interface KameleonRewardEntry {
  status: "pending" | "claimed";
  pointsAwarded: number;
  unlockedAt: string;
  claimedAt: string | null;
}

export interface KameleonRewardState {
  experienceUserId: string;
  rewards: Record<string, KameleonRewardEntry>;
  totalPointsEarned: number;
}

/** Read-side for the rewards page and the completion popup. Returns null if there's no session/enrollment yet. */
export async function getKameleonRewardState(): Promise<KameleonRewardState | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: experience } = await supabase
    .from("experiences")
    .select("id")
    .eq("slug", KAMELEON_EXPERIENCE_SLUG)
    .single();
  if (!experience) return null;

  const { data: experienceUser } = await supabase
    .from("experience_users")
    .select("id")
    .eq("experience_id", experience.id)
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!experienceUser) return null;

  const { data: rewardRows, error } = await supabase
    .from("experience_user_rewards")
    .select("reward_key, status, points_awarded, unlocked_at, claimed_at")
    .eq("experience_user_id", experienceUser.id);
  if (error) throw new Error(`Could not load reward state: ${error.message}`);

  const rewards: Record<string, KameleonRewardEntry> = {};
  let totalPointsEarned = 0;
  for (const row of rewardRows ?? []) {
    rewards[row.reward_key] = {
      status: row.status as "pending" | "claimed",
      pointsAwarded: row.points_awarded,
      unlockedAt: row.unlocked_at,
      claimedAt: row.claimed_at,
    };
    totalPointsEarned += row.points_awarded;
  }

  return { experienceUserId: experienceUser.id, rewards, totalPointsEarned };
}
