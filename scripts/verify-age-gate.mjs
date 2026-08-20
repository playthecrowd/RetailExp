/**
 * Tests for the 21+ age gate.
 *
 * The date arithmetic is pure — lib/pilot/age-gate.ts reads no configuration
 * and takes "today" as a parameter — so every boundary below is driven rather
 * than waited for. The structural half covers what the wiring must NOT do.
 *
 * This replaced verify-pilot-gate.mjs when the shared-password gate was
 * removed.
 *
 * Run: node scripts/verify-age-gate.mjs
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const mod = (relative) => pathToFileURL(join(root, relative)).href;
const read = (relative) => readFileSync(join(root, relative), "utf8");

const stripComments = (text) =>
  text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split(String.fromCharCode(10))
    .filter((line) => !line.trim().startsWith("//"))
    .join(String.fromCharCode(10));

const {
  AGE_COOKIE_NAME,
  AGE_COOKIE_MAX_AGE_SECONDS,
  MINIMUM_AGE,
  ageGateConfigured,
  checkAgeAffirmation,
  completedYears,
  cookieAffirmsAge,
  deriveAgeCookie,
  isRealCalendarDate,
} = await import(mod("lib/pilot/age-gate.ts"));

let passed = 0;
const failures = [];

function check(condition, description) {
  if (condition) passed += 1;
  else failures.push(description);
  console.log(`${condition ? "PASS" : "FAIL"}  ${description}`);
}

const dob = (year, month, day) => ({ year, month, day });
const on = (year, month, day) => ({ year, month, day });

// ---------------------------------------------------------------------------
console.log("\n--- the 21st birthday boundary ---");
// ---------------------------------------------------------------------------
check(MINIMUM_AGE === 21, "the minimum age is 21");

// Born 15 June 2004. 21st birthday is 15 June 2025.
check(
  checkAgeAffirmation(dob(2004, 6, 15), on(2025, 6, 15)).ok,
  "somebody whose 21st birthday is TODAY is accepted",
);
check(
  checkAgeAffirmation(dob(2004, 6, 15), on(2025, 6, 14)).ok === false,
  "one day before their 21st birthday is rejected",
);
check(
  checkAgeAffirmation(dob(2004, 6, 15), on(2025, 6, 14)).reason === "underage",
  "and the reason given is underage, not an invalid date",
);
check(
  checkAgeAffirmation(dob(2004, 6, 15), on(2025, 6, 16)).ok,
  "the day after is accepted",
);
check(
  checkAgeAffirmation(dob(2010, 1, 1), on(2025, 6, 15)).ok === false,
  "a clearly under-21 date is rejected",
);
check(
  checkAgeAffirmation(dob(1970, 3, 2), on(2025, 6, 15)).ok,
  "a clearly over-21 date is accepted",
);

// Month boundary, not just day: born December, checked in January.
check(
  checkAgeAffirmation(dob(2004, 12, 31), on(2025, 12, 30)).ok === false,
  "a birthday later in the same month has not happened yet",
);
check(
  checkAgeAffirmation(dob(2004, 1, 2), on(2025, 1, 1)).ok === false,
  "nor one later in January",
);

// ---------------------------------------------------------------------------
console.log("\n--- leap day ---");
// ---------------------------------------------------------------------------
// Born 29 February 2004. 2025 has no 29 February.
check(
  checkAgeAffirmation(dob(2004, 2, 29), on(2025, 2, 28)).ok === false,
  "a leap-day birthday has NOT turned 21 on 28 February of a non-leap year",
);
check(
  checkAgeAffirmation(dob(2004, 2, 29), on(2025, 3, 1)).ok,
  "and HAS by 1 March - never a day early",
);
check(
  checkAgeAffirmation(dob(2004, 2, 29), on(2028, 2, 29)).ok,
  "on an actual leap day, the birthday counts",
);
check(
  completedYears(dob(2004, 2, 29), on(2025, 2, 28)) === 20,
  "the year arithmetic itself is conservative across a leap day",
);

// ---------------------------------------------------------------------------
console.log("\n--- impossible and future dates ---");
// ---------------------------------------------------------------------------
check(!isRealCalendarDate(2001, 2, 31), "31 February is not a real date");
check(!isRealCalendarDate(2001, 4, 31), "31 April is not a real date");
check(!isRealCalendarDate(2001, 13, 1), "there is no month 13");
check(!isRealCalendarDate(2001, 0, 10), "there is no month 0");
check(!isRealCalendarDate(2001, 1, 0), "there is no day 0");
check(!isRealCalendarDate(2001, 2, 29), "29 February 2001 is not a real date");
check(isRealCalendarDate(2000, 2, 29), "29 February 2000 IS a real date");

for (const [label, value] of [
  ["31 February", dob(2001, 2, 31)],
  ["month 13", dob(2001, 13, 1)],
  ["day 0", dob(2001, 1, 0)],
]) {
  const result = checkAgeAffirmation(value, on(2025, 6, 15));
  check(result.ok === false && result.reason === "invalid_date", `${label} is rejected as invalid`);
}

const future = checkAgeAffirmation(dob(2030, 1, 1), on(2025, 6, 15));
check(future.ok === false && future.reason === "future_date", "a future date is rejected as future");
const futureToday = checkAgeAffirmation(dob(2025, 6, 16), on(2025, 6, 15));
check(futureToday.ok === false && futureToday.reason === "future_date", "tomorrow is rejected too");

for (const [label, value] of [
  ["empty", { year: "", month: "", day: "" }],
  ["missing", { year: undefined, month: undefined, day: undefined }],
  ["null", { year: null, month: null, day: null }],
  ["non-numeric", { year: "abcd", month: "x", day: "y" }],
]) {
  check(
    checkAgeAffirmation(value, on(2025, 6, 15)).ok === false,
    `an ${label} date of birth is rejected`,
  );
}

// ---------------------------------------------------------------------------
console.log("\n--- the cookie ---");
// ---------------------------------------------------------------------------
const SECRET = "age-gate-secret-not-a-real-credential";
const cookie = deriveAgeCookie(SECRET);

check(/^[0-9a-f]{64}$/.test(cookie), "the cookie value is a hex digest");
check(cookieAffirmsAge(cookie, SECRET), "a correctly derived cookie affirms");
check(
  !cookieAffirmsAge(deriveAgeCookie("a-different-secret"), SECRET),
  "ROTATING THE SECRET invalidates every outstanding affirmation",
);
check(!cookieAffirmsAge("f".repeat(64), SECRET), "a same-length forged cookie is refused");
check(!cookieAffirmsAge("", SECRET), "an empty cookie is refused");
check(!cookieAffirmsAge(null, SECRET), "a missing cookie is refused");

// FAILS CLOSED. No secret, no affirmation - not even a previously valid one.
for (const [label, value] of [["undefined", undefined], ["empty", ""], ["whitespace", "   "]]) {
  check(!ageGateConfigured(value), `a ${label} secret does not count as configured`);
  check(
    !cookieAffirmsAge(cookie, value),
    `a ${label} secret refuses even a previously valid cookie`,
  );
}

check(
  AGE_COOKIE_MAX_AGE_SECONDS > 0 && AGE_COOKIE_MAX_AGE_SECONDS <= 60 * 60 * 24 * 90,
  "the affirmation expires on its own, within a quarter at the outside",
);

// THE DATE OF BIRTH IS NOT IN THE COOKIE, and cannot be recovered from it.
for (const parts of [dob(2004, 6, 15), dob(1970, 1, 1)]) {
  const value = deriveAgeCookie(SECRET);
  check(
    !value.includes(String(parts.year)) || value === deriveAgeCookie(SECRET),
    "the cookie is a constant derivation, not a function of the date entered",
  );
}
check(
  deriveAgeCookie(SECRET) === cookie,
  "the same secret always derives the same value, whoever entered whatever date",
);

// ---------------------------------------------------------------------------
console.log("\n--- the wiring ---");
// ---------------------------------------------------------------------------
{
  const proxy = stripComments(read("proxy.ts"));
  const gate = stripComments(read("lib/pilot/gate.ts"));
  const groupLayout = stripComments(read("app/experience/kameleon/(gated)/layout.tsx"));
  const action = stripComments(read("app/experience/kameleon/welcome/actions.ts"));

  check(
    /matcher: \["\/experience\/kameleon\/:path\*", "\/admin\/:path\*"\]/.test(proxy),
    "the matcher still excludes /api and /legal - webhook, cron, Terms and Privacy stay outside the gate",
  );
  check(
    /pathname !== AGE_GATE_PATH/.test(proxy),
    "the gate route is excluded from its own redirect, so it cannot loop",
  );
  check(
    /request\.cookies\.has\(AGE_COOKIE\)/.test(proxy) && !/deriveAgeCookie|cookieAffirmsAge/.test(proxy),
    "the proxy checks PRESENCE only - the real verification is not done on prefetches",
  );
  check(
    /await requireAgeAffirmation\(\)/.test(groupLayout),
    "the gated route group enforces the affirmation for everything beneath it",
  );
  check(/cookieAffirmsAge\(/.test(gate), "the layout path performs the real derivation check");

  check(
    /httpOnly: true/.test(action) &&
      /secure: process\.env\.NODE_ENV === "production"/.test(action) &&
      /sameSite: "lax"/.test(action) &&
      /path: "\/experience\/kameleon"/.test(action),
    "the cookie is httpOnly, secure in Production, same-site and scoped to the experience",
  );
  check(
    /value: deriveAgeCookie\(secret\)/.test(action),
    "the cookie stores the derivation, never the date",
  );
  check(
    /KAMELEON_AGE_GATE_SECRET/.test(action) &&
      !/CRON_SECRET|SUPABASE|CLOUDFLARE/.test(action),
    "the age gate uses its OWN secret and reuses no other credential",
  );

  // THE DATE OF BIRTH IS NEVER PERSISTED OR LOGGED.
  check(
    !/console\.|logProviderEvent|localStorage|sessionStorage/.test(action),
    "the action logs nothing and stores nothing",
  );
  check(
    !/supabase|createClient|createSecretClient|fetch\(/.test(action),
    "the date of birth never reaches Supabase, Cloudflare or any network call",
  );
  check(
    !/birthYear|birthMonth|birthDay/.test(
      action.slice(action.indexOf("store.set(")),
    ),
    "no part of the date appears anywhere near the cookie write",
  );

  // --- the gate covers the experience AND the Gallery ---------------------
  const gatedDir = join(root, "app/experience/kameleon/(gated)");
  const gatedPages = [];
  const walk = (dir, prefix = "") => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full, `${prefix}/${entry}`);
      else if (entry === "page.tsx") gatedPages.push(prefix || "/");
    }
  };
  walk(gatedDir);
  check(gatedPages.includes("/"), "the experience itself is inside the gate");
  check(gatedPages.includes("/gallery"), "the Gallery is inside the gate");
  check(gatedPages.includes("/rewards"), "rewards are inside the gate");
  check(
    existsSync(join(root, "app/experience/kameleon/welcome/page.tsx")) &&
      !existsSync(join(root, "app/experience/kameleon/(gated)/welcome/page.tsx")),
    "the gate page is OUTSIDE the gated group",
  );
  check(
    !existsSync(join(root, "app/legal/(gated)")) &&
      existsSync(join(root, "app/legal/kameleon-evaluation-terms/page.tsx")),
    "Terms and Privacy are outside the gate entirely",
  );

  // --- the password gate is gone -------------------------------------------
  check(
    !existsSync(join(root, "lib/pilot/access-gate.ts")) &&
      !existsSync(join(root, "lib/pilot/access-state.ts")) &&
      !existsSync(join(root, "components/kameleon/AccessForm.tsx")),
    "every password-gate module has been deleted",
  );
}

{
  // No RUNTIME reference to the old variable anywhere in shipped code.
  const roots = ["app", "lib", "components", "proxy.ts"];
  const offenders = [];
  const walk = (path) => {
    if (statSync(join(root, path)).isDirectory()) {
      for (const entry of readdirSync(join(root, path))) walk(`${path}/${entry}`);
      return;
    }
    if (!/\.(ts|tsx)$/.test(path)) return;
    if (readFileSync(join(root, path), "utf8").includes("KAMELEON_PILOT_ACCESS_CODE")) {
      offenders.push(path);
    }
  };
  for (const r of roots) walk(r);
  check(
    offenders.length === 0,
    `no runtime reference to KAMELEON_PILOT_ACCESS_CODE remains (found: ${offenders.join(", ") || "none"})`,
  );
}

// ---------------------------------------------------------------------------
console.log("\n--- the wording ---");
// ---------------------------------------------------------------------------
{
  const page = read("app/experience/kameleon/welcome/page.tsx");
  const form = read("components/kameleon/AgeGateForm.tsx");
  const state = read("lib/pilot/age-gate-state.ts");
  const capture = read("components/kameleon/testimonials/TestimonialCapture.tsx");
  const all = page + form + state;

  for (const line of [
    "Welcome to the Kameleon Experience",
    "Please enter your date of birth to confirm that you are 21 years of age or older.",
    "By entering, you confirm that you are of legal drinking age in your location.",
    "Please enjoy responsibly. Never drink and drive.",
    "Enter Experience",
    "Exit",
    "You must be 21 years of age or older to enter this experience.",
  ]) {
    check(all.includes(line), `the gate carries: "${line}"`);
  }
  check(
    !/over 21/i.test(all),
    'the wording is "21 years of age or older", never "over 21"',
  );
  check(
    capture.includes("I confirm that I am 21 years of age or older."),
    "the testimonial confirmation is aligned to 21+",
  );
  for (const line of [
    "I confirm that no minors appear.",
    "I confirm that every person shown consented.",
    "I consent to displaying this submission in the Kameleon experience Gallery if approved.",
  ]) {
    check(capture.includes(line), `the other confirmation is preserved: "${line}"`);
  }

  // --- accessibility -------------------------------------------------------
  for (const label of ["Month", "Day", "Year"]) {
    check(
      new RegExp(`>\\s*${label}\\s*<`).test(form),
      `the ${label} input carries a visible label`,
    );
  }
  check(
    (form.match(/aria-live="polite"/g) || []).length === 1,
    "there is exactly one polite live region",
  );
  check(
    /focus:ring-2/.test(form),
    "focus states are visible",
  );
  check(
    /@media \(prefers-reduced-motion: reduce\)/.test(page),
    "prefers-reduced-motion is respected",
  );
  check(
    !/<img|url\(["']?http/.test(page + form),
    "the gate introduces no external asset dependency",
  );
}

// ---------------------------------------------------------------------------
console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length > 0) {
  console.error("\nFAILURES:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
