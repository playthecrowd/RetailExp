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

async function unlockRewardInternal(experienceUserId: string, clientId: string, rewardKey: string) {
  const catalogEntry = REWARD_CATALOG.find((r) => r.id === rewardKey);
  if (!catalogEntry) throw new Error(`Unknown reward key: ${rewardKey}`);

  const supabase = await createClient();
  const { error } = await supabase.from("experience_user_rewards").upsert(
    {
      experience_user_id: experienceUserId,
      client_id: clientId,
      reward_key: rewardKey,
      points_awarded: catalogEntry.points,
    },
    { onConflict: "experience_user_id,reward_key", ignoreDuplicates: true },
  );
  if (error) throw new Error(`Could not unlock reward "${rewardKey}": ${error.message}`);
}

/**
 * Quick Account submit — creates (or reuses) the caller's experience_users
 * row and unlocks the first reward. Awaited by the UI: account creation
 * must actually succeed before the journey proceeds, since every later
 * reward unlock depends on this row existing.
 */
export async function enrollKameleonUser(profile: { firstName: string; lastName: string; email: string }) {
  const { id, clientId } = await getOrCreateExperienceUser(profile);
  await unlockRewardInternal(id, clientId, "kameleon_bottle_pedestal");
  return { experienceUserId: id };
}

/**
 * Fire-and-forget from client components at each later reward moment (AR
 * completion, first pathway decision, PP-FINAL). No-ops quietly if the
 * caller has no session or hasn't completed Quick Account yet — that
 * shouldn't happen given the required screen order, but this must never
 * throw and block the actual journey UI over a rewards hiccup.
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

  await unlockRewardInternal(existing.id, existing.client_id, rewardKey);
}

export interface KameleonRewardState {
  experienceUserId: string;
  unlockedRewardKeys: string[];
  unlockedAtByKey: Record<string, string>;
  totalPointsEarned: number;
}

/** Read-side for the rewards page. Returns null if there's no session/enrollment yet. */
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
    .select("reward_key, points_awarded, unlocked_at")
    .eq("experience_user_id", experienceUser.id);
  if (error) throw new Error(`Could not load reward state: ${error.message}`);

  const unlockedAtByKey: Record<string, string> = {};
  let totalPointsEarned = 0;
  for (const row of rewardRows ?? []) {
    unlockedAtByKey[row.reward_key] = row.unlocked_at;
    totalPointsEarned += row.points_awarded;
  }

  return {
    experienceUserId: experienceUser.id,
    unlockedRewardKeys: Object.keys(unlockedAtByKey),
    unlockedAtByKey,
    totalPointsEarned,
  };
}
