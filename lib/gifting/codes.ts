import { createHash, randomInt, timingSafeEqual } from "node:crypto";

/**
 * Package codes and gift message codes.
 *
 * TWO CODES, ON PURPOSE
 *   A package code identifies one physical product. A gift message code
 *   identifies one private message a sender recorded. Neither alone opens
 *   anything: private content is released only when both resolve to the SAME
 *   active assignment inside the SAME tenant. Someone holding a bottle they
 *   found cannot watch a stranger's message, and someone forwarded a message
 *   code cannot attach it to a different bottle.
 *
 * WHAT IS STORED
 *   A SHA-256 hash, plus a short non-secret prefix. The plaintext is shown
 *   once, at generation, and is not recoverable afterwards — so a copy of the
 *   database is not a set of working codes. The prefix exists because support
 *   needs to identify a package from a customer reading four characters off a
 *   card, and four characters are not enough to open anything.
 *
 * WHY NOT AN ID
 *   Visitor ids, submission ids, asset ids and provider ids are all either
 *   guessable, enumerable, or leak how many exist. A code is generated from a
 *   CSPRNG over an alphabet chosen so a human can read it aloud without
 *   ambiguity, and carries no information about anything else.
 */

/**
 * No 0/O, no 1/I/L, no 5/S, no 8/B. A gift card gets read down a phone line
 * and typed by someone holding a glass of something, and every one of those
 * pairs is a support ticket waiting to happen.
 */
const ALPHABET = "23467９ACDEFGHJKMNPQRTUVWXYZ".replace("９", "9");

/** 10 characters over a 27-character alphabet is ~47 bits. Combined with the
 *  rate limit, guessing one is not a plausible attack. */
const CODE_LENGTH = 10;
const GROUP = 5;

export interface GeneratedCode {
  /** Shown to a human exactly once. Never persisted. */
  plaintext: string;
  /** Stored, and what a submitted code is matched against. */
  hash: string;
  /** Stored, non-secret, for support lookup. */
  prefix: string;
}

function normalise(raw: string): string {
  // People type spaces, hyphens and lower case. None of those are meaningful,
  // so they are removed before hashing rather than rejected with an error.
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function hashCode(raw: string): string {
  return createHash("sha256").update(normalise(raw)).digest("hex");
}

export function codePrefix(raw: string): string {
  return normalise(raw).slice(0, 4);
}

/** Formats as XXXXX-XXXXX, which is what goes on the printed card. */
export function formatCode(raw: string): string {
  const clean = normalise(raw);
  return clean.length > GROUP ? `${clean.slice(0, GROUP)}-${clean.slice(GROUP)}` : clean;
}

export function generateCode(): GeneratedCode {
  let plaintext = "";
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    // randomInt is the CSPRNG path and is free of the modulo bias that
    // Math.random() % length would introduce.
    plaintext += ALPHABET[randomInt(ALPHABET.length)];
  }
  return { plaintext: formatCode(plaintext), hash: hashCode(plaintext), prefix: codePrefix(plaintext) };
}

/**
 * Constant-time comparison of two hashes.
 *
 * The lookup itself is by hash, so this is belt-and-braces rather than the
 * primary defence — but a comparison that returns early on the first differing
 * byte is a free timing oracle, and there is no reason to leave one lying
 * around.
 */
export function hashesMatch(a: string, b: string): boolean {
  const left = Buffer.from(a, "hex");
  const right = Buffer.from(b, "hex");
  if (left.length !== right.length || left.length === 0) return false;
  return timingSafeEqual(left, right);
}

/** A submitted code is plausible before it is ever looked up. Cheap rejection
 *  of obvious rubbish keeps the rate-limit budget for real attempts. */
export function looksLikeCode(raw: string): boolean {
  const clean = normalise(raw);
  return clean.length === CODE_LENGTH && [...clean].every((c) => ALPHABET.includes(c));
}
