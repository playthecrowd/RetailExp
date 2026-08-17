"use server";

import { createClient } from "@/lib/supabase/server";
import { REWARD_CATALOG } from "@/lib/kameleon/rewards";
import { normalizePhoneInput } from "@/lib/kameleon/phone";

const KAMELEON_EXPERIENCE_SLUG = "kameleon";

const MAX_NAME_LENGTH = 80;
/** RFC 5321's maximum reverse-path length. */
const MAX_EMAIL_LENGTH = 254;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface KameleonEnrollmentProfile {
  firstName: string;
  lastName: string;
  email: string;
  /** Optional. Raw as typed — normalized and validated here, never trusted from the client. */
  phone?: string;
}

/**
 * Exactly the three values this action is allowed to persist. Names are
 * deliberately NOT carried through as separate fields: the database
 * representation of the visitor's name is unchanged (a single derived
 * `display_name`), and shaping this type that way makes writing a
 * first_name/last_name column structurally impossible rather than merely
 * discouraged.
 */
interface NormalizedContact {
  displayName: string;
  email: string;
  phoneE164: string | null;
}

/**
 * A Server Action is a public POST endpoint, so the client's own checks are
 * a UX affordance and nothing more — everything below is re-derived and
 * re-validated here regardless of what the browser sent (see
 * node_modules/next/dist/docs/01-app/02-guides/server-actions.md, "Security").
 *
 * None of these messages ever echo the submitted value, so a rejected email
 * or phone number cannot reach a log line or an error report. Next.js masks
 * thrown Server Action messages in production anyway; these exist for local
 * diagnosis and as a backstop against a bypassed client, not as the primary
 * error surface (QuickAccount validates inline before it ever submits).
 */
function normalizeName(raw: string, field: "First name" | "Last name"): string {
  const value = (raw ?? "").normalize("NFC").replace(/\s+/g, " ").trim();
  if (value.length === 0) throw new Error(`${field} is required.`);
  if (value.length > MAX_NAME_LENGTH) throw new Error(`${field} is too long.`);
  return value;
}

function normalizeEmail(raw: string): string {
  const value = (raw ?? "").trim().toLowerCase();
  if (value.length === 0) throw new Error("Email address is required.");
  if (value.length > MAX_EMAIL_LENGTH) throw new Error("Email address is too long.");
  if (!EMAIL_PATTERN.test(value)) throw new Error("Enter a valid email address.");
  return value;
}

function normalizeContact(profile: KameleonEnrollmentProfile): NormalizedContact {
  const firstName = normalizeName(profile.firstName, "First name");
  const lastName = normalizeName(profile.lastName, "Last name");

  const phone = normalizePhoneInput(profile.phone ?? "");
  if (phone.status === "invalid") throw new Error(phone.message);

  return {
    // Unchanged behaviour: the two names are normalized, then joined into
    // the single display_name column that already exists.
    displayName: `${firstName} ${lastName}`,
    email: normalizeEmail(profile.email),
    phoneE164: phone.status === "valid" ? phone.e164 : null,
  };
}

/**
 * Runs under the caller's own real (Anonymous Sign-In) session via
 * lib/supabase/server.ts's publishable-key client — relies on RLS, never
 * bypasses it (see docs/PHASE7_CHECKPOINT_7_3_AUTHENTICATION_PLAN.md §1B).
 */
async function getOrCreateExperienceUser(
  profile?: KameleonEnrollmentProfile,
): Promise<{ id: string; clientId: string }> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No authenticated session — sign in before enrolling.");

  // Validate before any write round-trip, so a malformed submission never
  // reaches the database and never half-creates a row.
  const contact = profile ? normalizeContact(profile) : undefined;

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
  if (existing) {
    // The row can already exist on a legitimate re-submit — a resumed
    // session, a re-entry on the same anonymous identity, or a retry after
    // a partial failure. Returning early here (as this did before contact
    // details were captured) would silently discard everything the visitor
    // just typed, so the contact fields are refreshed instead.
    //
    // phone_e164 is only written when a value was actually supplied: the
    // form never pre-fills with what is already stored, so treating a blank
    // field as "delete my number" would erase data the visitor never saw
    // and never intended to clear. Deliberate erasure belongs in a separate
    // explicit request, not in a blank re-submit.
    if (contact) {
      // Explicit allow-list payload, built field by field — never a spread
      // of anything the browser submitted. Only these three columns can
      // appear in the UPDATE: identity and tenancy (id, auth_user_id,
      // client_id, experience_id), rewards, progress, roles and every other
      // relationship are unreachable from this statement by construction.
      const updatePayload: {
        display_name: string;
        email: string;
        phone_e164?: string;
      } = {
        display_name: contact.displayName,
        email: contact.email,
      };
      if (contact.phoneE164) {
        updatePayload.phone_e164 = contact.phoneE164;
      }

      const { error: updateError } = await supabase
        .from("experience_users")
        .update(updatePayload)
        .eq("id", existing.id);
      if (updateError) throw new Error(`Could not update experience_users row: ${updateError.message}`);
    }
    return { id: existing.id, clientId: existing.client_id };
  }

  const { data: inserted, error: insertError } = await supabase
    .from("experience_users")
    .insert({
      experience_id: experience.id,
      client_id: experience.client_id,
      auth_user_id: user.id,
      display_name: contact?.displayName ?? null,
      email: contact?.email ?? null,
      phone_e164: contact?.phoneE164 ?? null,
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
 * Quick Account submit — creates (or reuses and refreshes) the caller's
 * experience_users row and qualifies the first reward as pending. The
 * optional phone number is written as part of this same operation; there is
 * deliberately no second request that saves contact details after the
 * account exists. Awaited by the UI:
 * account creation must actually succeed before the journey proceeds,
 * since every later reward depends on this row existing.
 */
export async function enrollKameleonUser(profile: KameleonEnrollmentProfile) {
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
