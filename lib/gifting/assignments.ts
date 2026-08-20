import "server-only";

import { giftingClient } from "./client";
import { hashCode, looksLikeCode } from "./codes";

/**
 * Resolving a pair of gift codes to the private content they unlock.
 *
 * THE RULE THIS FILE EXISTS TO ENFORCE
 *   A package code and a gift message code must resolve to the SAME active
 *   assignment, in the SAME tenant, before anything private is released.
 *   Either code alone reveals nothing. Two valid codes from two DIFFERENT
 *   gifts are still a failure — that is the case worth testing, because it is
 *   the one a naive implementation gets wrong: both lookups succeed, so it
 *   feels like a match.
 *
 * WHY THIS IS SERVER-ONLY AND SERVICE-ROLE
 *   Validation has to be rate limited and has to fail closed, and neither is
 *   expressible as a row policy. The gifting tables therefore carry no
 *   anonymous read policy at all; the browser never queries them. It asks this
 *   code, which decides.
 *
 * WHAT A FAILURE SAYS
 *   "That combination did not match." Never which of the two codes was wrong,
 *   never whether a code exists, never whether it was revoked or expired or
 *   simply unknown. A caller who can distinguish those has an oracle for
 *   enumerating valid codes one half at a time.
 */

/** Failed attempts allowed from one identifier before lookups stop happening
 *  at all. Generous enough for someone mistyping a card, far too small to
 *  search a 47-bit space. */
const MAX_FAILURES = 8;
const WINDOW_MINUTES = 15;

export type GiftLookupFailure =
  | "invalid" // wrong, unknown, mismatched, revoked, expired — deliberately one bucket
  | "rate_limited";

export interface GiftLookupSuccess {
  ok: true;
  assignment: {
    id: string;
    clientId: string;
    experienceId: string;
    senderName: string;
    recipientName: string;
    recipientNote: string | null;
    videoKind: "standard" | "ai";
    completedVideoAssetId: string | null;
    sourceVideoAssetId: string | null;
    status: string;
    packageId: string;
  };
}

export interface GiftLookupRejected {
  ok: false;
  reason: GiftLookupFailure;
}

export type GiftLookupResult = GiftLookupSuccess | GiftLookupRejected;

/** Assignment states that may release private content. A revoked, expired or
 *  superseded assignment is not one of them — regifting must not leave the
 *  previous recipient able to reopen the gift. */
const OPENABLE = ["active", "opened"];

async function recordAttempt(
  identifier: string,
  clientId: string | null,
  succeeded: boolean,
): Promise<void> {
  const supabase = giftingClient();
  await supabase.from("gift_code_attempts").insert({
    identifier,
    client_id: clientId,
    succeeded,
  });
}

async function isRateLimited(identifier: string): Promise<boolean> {
  const supabase = giftingClient();
  const since = new Date(Date.now() - WINDOW_MINUTES * 60_000).toISOString();
  const { count, error } = await supabase
    .from("gift_code_attempts")
    .select("id", { count: "exact", head: true })
    .eq("identifier", identifier)
    .eq("succeeded", false)
    .gte("created_at", since);

  // Fail CLOSED. If the limiter cannot be consulted we refuse rather than wave
  // the request through — an unavailable limiter is exactly when an attacker
  // would prefer us to be permissive.
  if (error) return true;
  return (count ?? 0) >= MAX_FAILURES;
}

/**
 * @param identifier Something stable per caller for rate limiting — an IP hash
 *   or session id. Never a raw visitor id, and never shown to anyone.
 */
export async function resolveGiftCodes(
  experienceId: string,
  packageCode: string,
  messageCode: string,
  identifier: string,
): Promise<GiftLookupResult> {
  if (await isRateLimited(identifier)) {
    return { ok: false, reason: "rate_limited" };
  }

  // Shape check first: rejecting obvious rubbish without a database round trip
  // keeps the limiter's budget for attempts that could plausibly be real.
  if (!looksLikeCode(packageCode) || !looksLikeCode(messageCode)) {
    await recordAttempt(identifier, null, false);
    return { ok: false, reason: "invalid" };
  }

  const supabase = giftingClient();

  // Both lookups are scoped to the experience, so a code from another tenant
  // cannot resolve here even if it is otherwise valid.
  const { data: pkg } = await supabase
    .from("gift_packages")
    .select("id, client_id, status")
    .eq("experience_id", experienceId)
    .eq("code_hash", hashCode(packageCode))
    .maybeSingle();

  const { data: assignment } = await supabase
    .from("gift_assignments")
    .select(
      "id, client_id, experience_id, package_id, sender_name, recipient_name, recipient_note, video_kind, completed_video_asset_id, source_video_asset_id, status, expires_at",
    )
    .eq("experience_id", experienceId)
    .eq("message_code_hash", hashCode(messageCode))
    .maybeSingle();

  // Every rejection below returns the SAME reason. The checks are separate for
  // readability, not because the caller is told them apart.
  const expired = assignment?.expires_at ? new Date(assignment.expires_at) < new Date() : false;
  const matched =
    pkg &&
    assignment &&
    // The binding: the message must belong to THIS package. Two individually
    // valid codes from two different gifts stop here.
    assignment.package_id === pkg.id &&
    assignment.client_id === pkg.client_id &&
    OPENABLE.includes(assignment.status) &&
    pkg.status !== "revoked" &&
    pkg.status !== "expired" &&
    !expired;

  if (!matched) {
    await recordAttempt(identifier, pkg?.client_id ?? null, false);
    return { ok: false, reason: "invalid" };
  }

  await recordAttempt(identifier, assignment.client_id, true);

  return {
    ok: true,
    assignment: {
      id: assignment.id,
      clientId: assignment.client_id,
      experienceId: assignment.experience_id,
      senderName: assignment.sender_name,
      recipientName: assignment.recipient_name,
      recipientNote: assignment.recipient_note,
      videoKind: assignment.video_kind,
      completedVideoAssetId: assignment.completed_video_asset_id,
      sourceVideoAssetId: assignment.source_video_asset_id,
      status: assignment.status,
      packageId: assignment.package_id,
    },
  };
}

/**
 * Marks a gift opened, once.
 *
 * Guarded on the current status rather than read-then-write, so two devices
 * opening the same gift at the same moment cannot both claim the first open.
 */
export async function markOpened(assignmentId: string): Promise<void> {
  const supabase = giftingClient();
  await supabase
    .from("gift_assignments")
    .update({ status: "opened", opened_at: new Date().toISOString() })
    .eq("id", assignmentId)
    .eq("status", "active");

  await supabase.from("gift_assignment_events").insert({
    assignment_id: assignmentId,
    client_id: (
      await supabase.from("gift_assignments").select("client_id").eq("id", assignmentId).single()
    ).data?.client_id,
    event: "opened",
  });
}
