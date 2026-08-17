/**
 * Phone-number normalization for the Kameleon passport capture screen.
 *
 * Scope is deliberately narrow (V1 is US/Canada-primary):
 *
 * - A bare national number is interpreted as US/Canada and normalized to +1.
 * - A complete `+`-prefixed number is accepted if it is a well-formed E.164
 *   value, whatever its country code.
 * - Nothing else is accepted, and no country selector is offered.
 *
 * IMPORTANT: this is *format acceptance*, not validation of a real phone
 * line. A value that normalizes successfully has NOT been shown to exist,
 * to be reachable, to be a mobile, or to belong to the person who typed it.
 * Possession is only ever established by a completed SMS verification, which
 * this project does not have — so nothing anywhere may describe a stored
 * number as "verified". See docs/RETAILEXP_PHASE_TRACKER.md.
 *
 * This module never logs, throws with, or otherwise echoes the value it was
 * given: rejection messages describe the problem, never the input, so a
 * phone number can't leak into a console line, an error report, or a
 * screenshot of an error state.
 *
 * The E164 pattern below is duplicated verbatim as a CHECK constraint in
 * supabase/migrations/20260817101500_experience_user_contact.sql. Client,
 * server action, and database all apply the identical rule, so a value can
 * never be accepted by one layer and rejected by another.
 */

/** Longest raw input accepted before rejection — a real entry never approaches this. */
const MAX_RAW_LENGTH = 32;

/**
 * E.164: '+', a non-zero country digit, then 9-14 more digits (10-15 total).
 * Written with an explicit [0-9] class so it is character-for-character the
 * same pattern as the Postgres CHECK constraint in the migration — Postgres
 * ARE and JavaScript agree on this form with no shorthand-class ambiguity.
 */
const E164_PATTERN = /^\+[1-9][0-9]{9,14}$/;

/** Digits plus the punctuation people actually type: + ( ) - . and spaces. */
const ALLOWED_CHARACTERS = /^[+0-9()\-.\s]*$/;

export type PhoneRejectionReason =
  | "invalid-characters"
  | "misplaced-plus"
  | "too-short"
  | "too-long"
  | "unsupported-national-format";

export type PhoneNormalization =
  /** Nothing entered. Phone is optional — this is a success, and stores NULL. */
  | { status: "empty" }
  | { status: "valid"; e164: string }
  | { status: "invalid"; reason: PhoneRejectionReason; message: string };

export const PHONE_REJECTION_MESSAGES: Record<PhoneRejectionReason, string> = {
  "invalid-characters": "Phone numbers can only contain digits, spaces, and + ( ) - .",
  "misplaced-plus": "A + can only appear at the very start of a phone number.",
  "too-short": "That doesn't look like a complete phone number. Check the digits and try again.",
  "too-long": "That phone number has too many digits.",
  "unsupported-national-format":
    "Enter a 10-digit US or Canada number, or a complete number starting with + and its country code.",
};

function reject(reason: PhoneRejectionReason): PhoneNormalization {
  return { status: "invalid", reason, message: PHONE_REJECTION_MESSAGES[reason] };
}

/**
 * The one structural rule applied to bare US/Canada input: a NANP area code
 * (and, by the same rule, a country-code-1 number's area code) never begins
 * with 0 or 1. This rejects obvious garbage without pretending to be a
 * numbering-plan validator — no exchange-code, prefix, or per-country rules
 * are applied here, deliberately. Broader per-country validity would require
 * libphonenumber-js and its maintained metadata, which V1 does not include.
 */
function hasPlausibleNanpAreaCode(tenDigits: string): boolean {
  const first = tenDigits.charCodeAt(0);
  return first >= /* '2' */ 50 && first <= /* '9' */ 57;
}

export function normalizePhoneInput(raw: string): PhoneNormalization {
  const trimmed = (raw ?? "").trim();
  if (trimmed.length === 0) return { status: "empty" };
  if (trimmed.length > MAX_RAW_LENGTH) return reject("too-long");
  if (!ALLOWED_CHARACTERS.test(trimmed)) return reject("invalid-characters");

  // A '+' is only meaningful as an international prefix. Anywhere else it's
  // a typo, and silently dropping it could change which number we store.
  const plusIndex = trimmed.indexOf("+");
  if (plusIndex > 0) return reject("misplaced-plus");
  if (trimmed.indexOf("+", 1) !== -1) return reject("misplaced-plus");

  const hasCountryPrefix = plusIndex === 0;
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 0) return reject("too-short");

  if (hasCountryPrefix) {
    const candidate = `+${digits}`;
    if (!E164_PATTERN.test(candidate)) {
      return reject(digits.length < 10 ? "too-short" : "too-long");
    }
    // Country code 1 is North America, so an explicitly-prefixed +1 number
    // is held to exactly the same NANP rules as bare national input below.
    // Without this, typing "+1" would be a way to store a malformed US
    // number — "+1 212 555 012" is a well-formed 10-digit E.164 string, so
    // the generic shape check alone accepts it, while the same digits typed
    // without the prefix are correctly rejected.
    if (digits.startsWith("1")) {
      const national = digits.slice(1);
      if (national.length !== 10 || !hasPlausibleNanpAreaCode(national)) {
        return reject("unsupported-national-format");
      }
      return { status: "valid", e164: `+1${national}` };
    }
    return { status: "valid", e164: candidate };
  }

  // No '+' — treat as US/Canada, the only national format V1 supports.
  if (digits.length === 10) {
    if (!hasPlausibleNanpAreaCode(digits)) return reject("unsupported-national-format");
    return { status: "valid", e164: `+1${digits}` };
  }
  // "1" + 10 digits is how many people type their own number.
  if (digits.length === 11 && digits.startsWith("1")) {
    const national = digits.slice(1);
    if (!hasPlausibleNanpAreaCode(national)) return reject("unsupported-national-format");
    return { status: "valid", e164: `+1${national}` };
  }

  return reject(digits.length < 10 ? "too-short" : "unsupported-national-format");
}

/**
 * Submit-gate helper: an empty field is fine (phone is optional), a valid
 * one is fine, anything else blocks submission.
 */
export function isSubmittablePhoneInput(raw: string): boolean {
  return normalizePhoneInput(raw).status !== "invalid";
}

/**
 * Canonical value to persist: the E.164 string, or null when nothing usable
 * was entered. Callers must have already gated on `normalizePhoneInput`
 * for the error path — this collapses "empty" and "invalid" to null and is
 * only safe after validation.
 */
export function toStorablePhone(raw: string): string | null {
  const result = normalizePhoneInput(raw);
  return result.status === "valid" ? result.e164 : null;
}
