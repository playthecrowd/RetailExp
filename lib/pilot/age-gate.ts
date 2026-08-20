import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * The 21+ age affirmation — PURE.
 *
 * No `server-only`, no configuration read, no clock of its own: the secret and
 * "today" both arrive as parameters, so every branch is reachable from a plain
 * Node test. Same shape as lib/cloudflare/webhook-core.ts.
 *
 * WHAT THIS IS
 *   An AFFIRMATION, not identity verification. Nobody's government ID is
 *   checked and none is asked for. It records that a person stated they are of
 *   legal drinking age, which is what a beverage experience is expected to ask
 *   and all it can honestly claim.
 *
 * WHAT IS NEVER KEPT
 *   The date of birth is used to compute one boolean and is then gone. It is
 *   not stored, not logged, not sent to Supabase, Cloudflare or anywhere else,
 *   and it is not in the cookie — the cookie is a signed constant that says
 *   only "this browser affirmed", and cannot be run backwards into a birthday.
 *
 * WHY THE MATH IS HERE AND NOT IN THE BROWSER
 *   A client-side check is a suggestion. The server recomputes from the three
 *   numbers it was given, against its own clock.
 */

export const AGE_COOKIE_NAME = "kameleon_age_affirmed";

/** Long enough not to re-ask a stakeholder mid-evaluation, short enough that
 *  the affirmation does not outlive the evaluation by months. */
export const AGE_COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

/** Domain separation, so the value cannot be reused as any other HMAC in this
 *  codebase — and specifically so it is not interchangeable with the retention
 *  cron's or Cloudflare's. */
const COOKIE_PURPOSE = "kameleon-age-affirmed-21-v1";

export const MINIMUM_AGE = 21;

export type AgeCheck =
  | { ok: true }
  | { ok: false; reason: "incomplete" | "invalid_date" | "future_date" | "underage" };

function constantTimeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function ageGateConfigured(secret: string | null | undefined): boolean {
  return typeof secret === "string" && secret.trim().length > 0;
}

/** Deterministic, so verification needs no stored state and rotating the
 *  secret invalidates every outstanding affirmation at once. */
export function deriveAgeCookie(secret: string): string {
  return createHmac("sha256", secret.trim()).update(COOKIE_PURPOSE, "utf8").digest("hex");
}

export function cookieAffirmsAge(
  cookieValue: string | null | undefined,
  secret: string | null | undefined,
): boolean {
  // FAILS CLOSED. A deployment with no signing secret cannot verify an
  // affirmation, so it must not honour one.
  if (!ageGateConfigured(secret)) return false;
  if (typeof cookieValue !== "string" || cookieValue.length === 0) return false;
  return constantTimeEquals(cookieValue, deriveAgeCookie(secret as string));
}

/**
 * Whether the three fields describe a real calendar date.
 *
 * Round-tripping through Date is what rejects 31 February and 31 April: the
 * constructor happily rolls them into March and May, and comparing the parts
 * back catches exactly that. A range check alone would accept both.
 */
export function isRealCalendarDate(year: number, month: number, day: number): boolean {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  // Below the lowest plausible birth year, and above any real one.
  if (year < 1900 || year > 2200) return false;

  const probe = new Date(Date.UTC(year, month - 1, day));
  return (
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() === month - 1 &&
    probe.getUTCDate() === day
  );
}

/**
 * Completed years between two dates, by calendar parts.
 *
 * LEAP DAY, EXPLICITLY. Someone born 29 February 2004 turns 21 on 1 March
 * 2025, not 28 February: the (month, day) comparison puts 28 February BEFORE
 * 29 February, so the year is not yet credited. That is the conventional
 * treatment and the conservative one — it never lets somebody in a day early.
 */
export function completedYears(
  birth: { year: number; month: number; day: number },
  today: { year: number; month: number; day: number },
): number {
  let age = today.year - birth.year;
  const beforeBirthdayThisYear =
    today.month < birth.month || (today.month === birth.month && today.day < birth.day);
  if (beforeBirthdayThisYear) age -= 1;
  return age;
}

/**
 * The authoritative check.
 *
 * @param today the SERVER's date, passed in so the boundary is testable
 *        without waiting for midnight.
 */
export function checkAgeAffirmation(
  raw: { year: unknown; month: unknown; day: unknown },
  today: { year: number; month: number; day: number },
): AgeCheck {
  const year = Number(raw.year);
  const month = Number(raw.month);
  const day = Number(raw.day);

  if (
    raw.year === "" || raw.month === "" || raw.day === "" ||
    raw.year === null || raw.month === null || raw.day === null ||
    raw.year === undefined || raw.month === undefined || raw.day === undefined ||
    Number.isNaN(year) || Number.isNaN(month) || Number.isNaN(day)
  ) {
    return { ok: false, reason: "incomplete" };
  }

  if (!isRealCalendarDate(year, month, day)) {
    return { ok: false, reason: "invalid_date" };
  }

  // A birth date cannot be in the future, and treating one as merely underage
  // would be the wrong message.
  const birthValue = year * 10000 + month * 100 + day;
  const todayValue = today.year * 10000 + today.month * 100 + today.day;
  if (birthValue > todayValue) {
    return { ok: false, reason: "future_date" };
  }

  // Accepts somebody whose 21st birthday is TODAY; rejects one whose 21st is
  // tomorrow.
  return completedYears({ year, month, day }, today) >= MINIMUM_AGE
    ? { ok: true }
    : { ok: false, reason: "underage" };
}
