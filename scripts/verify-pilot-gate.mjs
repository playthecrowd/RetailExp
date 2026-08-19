/**
 * Tests for the stakeholder access gate.
 *
 * The comparison logic is pure — lib/pilot/access-gate.ts reads no
 * configuration and the code arrives as a parameter — so every branch below is
 * genuinely exercised rather than assumed. The structural half at the bottom
 * covers the properties that are about what the wiring does NOT do.
 *
 * Run: node scripts/verify-pilot-gate.mjs
 */

import { readFileSync } from "node:fs";
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
  PILOT_COOKIE_NAME,
  PILOT_COOKIE_MAX_AGE_SECONDS,
  MAX_SUBMITTED_CODE_LENGTH,
  derivePilotCookie,
  cookieUnlocksPilot,
  submittedCodeMatches,
  pilotGateConfigured,
} = await import(mod("lib/pilot/access-gate.ts"));

let passed = 0;
const failures = [];

function check(condition, description) {
  if (condition) passed += 1;
  else failures.push(description);
  console.log(`${condition ? "PASS" : "FAIL"}  ${description}`);
}

const CODE = "pilot-code-not-a-real-credential";

// ---------------------------------------------------------------------------
console.log("\n--- configuration ---");
// ---------------------------------------------------------------------------
check(pilotGateConfigured(CODE), "a real code counts as configured");
for (const [label, value] of [
  ["undefined", undefined],
  ["null", null],
  ["empty", ""],
  ["whitespace", "   "],
]) {
  check(!pilotGateConfigured(value), `a ${label} code does not count as configured`);
}

// ---------------------------------------------------------------------------
console.log("\n--- submitted codes ---");
// ---------------------------------------------------------------------------
check(submittedCodeMatches(CODE, CODE), "the right code opens the gate");
check(
  submittedCodeMatches(`  ${CODE}  `, CODE),
  "a pasted code with surrounding whitespace still opens it",
);
check(
  !submittedCodeMatches("x".repeat(CODE.length), CODE),
  "a wrong code of EQUAL LENGTH is refused",
);
check(!submittedCodeMatches(CODE.slice(0, -1), CODE), "a truncated code is refused");
check(!submittedCodeMatches(CODE.toUpperCase(), CODE), "the comparison is case-sensitive");
check(!submittedCodeMatches("", CODE), "an empty submission is refused");
check(!submittedCodeMatches(null, CODE), "a null submission is refused");
check(
  !submittedCodeMatches("x".repeat(MAX_SUBMITTED_CODE_LENGTH + 1), CODE),
  "an oversized submission is refused before it is compared",
);

// FAIL CLOSED. There is no submission that opens an unconfigured deployment.
for (const [label, value] of [
  ["undefined", undefined],
  ["empty", ""],
  ["whitespace", "   "],
]) {
  check(
    !submittedCodeMatches(CODE, value),
    `a ${label} configured code refuses even a correct-looking submission`,
  );
  check(
    !submittedCodeMatches("", value),
    `a ${label} configured code is never matched by an empty submission`,
  );
}

// ---------------------------------------------------------------------------
console.log("\n--- the cookie ---");
// ---------------------------------------------------------------------------
const cookie = derivePilotCookie(CODE);

check(/^[0-9a-f]{64}$/.test(cookie), "the cookie value is a hex digest");
check(
  PILOT_COOKIE_NAME === "kameleon_pilot_access" &&
    read("proxy.ts").includes(PILOT_COOKIE_NAME),
  "the proxy and the gate agree on the cookie name",
);
check(!cookie.includes(CODE), "the cookie does NOT contain the access code");
check(derivePilotCookie(CODE) === cookie, "derivation is deterministic, so no state is stored");
check(
  derivePilotCookie(`  ${CODE}  `) === cookie,
  "derivation trims, so a whitespace-padded code produces the same cookie",
);
check(cookieUnlocksPilot(cookie, CODE), "a correctly derived cookie unlocks the gate");
check(
  !cookieUnlocksPilot(derivePilotCookie("a-different-code"), CODE),
  "ROTATING THE CODE invalidates every outstanding cookie",
);
check(!cookieUnlocksPilot("1", CODE), "a short forged cookie is refused");
check(!cookieUnlocksPilot("f".repeat(64), CODE), "a same-length forged cookie is refused");
check(!cookieUnlocksPilot(CODE, CODE), "presenting the raw code as the cookie does not work");
check(!cookieUnlocksPilot("", CODE), "an empty cookie is refused");
check(!cookieUnlocksPilot(null, CODE), "a missing cookie is refused");
for (const value of [undefined, "", "   "]) {
  check(
    !cookieUnlocksPilot(cookie, value),
    "an unconfigured deployment refuses even a previously valid cookie",
  );
}

check(
  PILOT_COOKIE_MAX_AGE_SECONDS > 0 && PILOT_COOKIE_MAX_AGE_SECONDS <= 60 * 60 * 24 * 90,
  "access expires on its own, within a quarter at the outside",
);

// ---------------------------------------------------------------------------
console.log("\n--- the wiring ---");
// ---------------------------------------------------------------------------
{
  const proxy = stripComments(read("proxy.ts"));
  const gate = stripComments(read("lib/pilot/gate.ts"));
  const groupLayout = stripComments(read("app/experience/kameleon/(gated)/layout.tsx"));
  const action = stripComments(read("app/experience/kameleon/access/actions.ts"));

  check(
    /matcher: \["\/experience\/kameleon\/:path\*", "\/admin\/:path\*"\]/.test(proxy),
    "the proxy matcher still excludes /api, so the Stream webhook and the cron are unaffected",
  );
  check(
    /pathname !== PILOT_GATE_PATH/.test(proxy),
    "the gate route is excluded from its own redirect, so it cannot loop",
  );
  check(
    /request\.cookies\.has\(PILOT_COOKIE\)/.test(proxy) &&
      !/derivePilotCookie|cookieUnlocksPilot/.test(proxy),
    "the proxy checks PRESENCE only - the real verification is not done on prefetches",
  );
  check(
    /await requirePilotAccess\(\)/.test(groupLayout),
    "the gated route group enforces the gate for everything beneath it",
  );
  check(
    /cookieUnlocksPilot\(/.test(gate),
    "the layout path performs the real derivation check",
  );
  check(
    /redirect\(PILOT_GATE_ROUTE\)/.test(gate),
    "an unverified browser is redirected rather than shown the experience",
  );

  check(
    /httpOnly: true/.test(action) && /secure: true/.test(action) && /sameSite: "lax"/.test(action),
    "the cookie is httpOnly, secure and same-site",
  );
  check(
    /value: derivePilotCookie\(/.test(action) && !/value: code/.test(action),
    "the cookie stores the derivation, never the code itself",
  );
  check(
    /path: "\/experience\/kameleon"/.test(action),
    "the cookie is scoped to the experience, so it is not sent to /admin or /api",
  );

  const messages = action.match(/"[^"]*"/g) ?? [];
  check(
    !messages.some((m) => /not configured|unconfigured|no code/i.test(m)),
    "a refusal never distinguishes a wrong code from an unconfigured deployment",
  );

  // The gate page must sit OUTSIDE the gated group, or it would redirect to
  // itself. Checked by path, because this is a structural fact about the tree.
  const { existsSync } = await import("node:fs");
  check(
    existsSync(join(root, "app/experience/kameleon/access/page.tsx")),
    "the gate page exists outside the gated route group",
  );
  check(
    !existsSync(join(root, "app/experience/kameleon/(gated)/access/page.tsx")),
    "the gate page is NOT inside the gated group",
  );
  for (const gated of ["page.tsx", "rewards/page.tsx", "gallery/page.tsx"]) {
    check(
      existsSync(join(root, "app/experience/kameleon/(gated)", gated)),
      `${gated} is inside the gated group, so it is covered by where it lives`,
    );
  }
}

// ---------------------------------------------------------------------------
console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length > 0) {
  console.error("\nFAILURES:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
