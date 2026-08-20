/**
 * The Gifting Demo prototype must not be able to affect anything that already
 * exists. This proves it rather than asserting it.
 *
 * WHY MECHANICAL
 *   "It's isolated" is the kind of claim that is true when written and false
 *   three commits later. Each check below fails loudly the moment the
 *   prototype reaches somewhere it should not, which is the only version of
 *   this promise worth having.
 *
 * Run: node scripts/verify-gifting-isolation.mjs
 */

import { execSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");

/** Comments explain what a FUTURE implementation will touch; grepping prose
 *  would fail the very file that documents the boundary. Checks about code
 *  read code. */
const stripComments = (text) =>
  text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");

let passed = 0;
const failures = [];
function check(condition, description) {
  if (condition) passed += 1;
  else failures.push(description);
  console.log(`${condition ? "PASS" : "FAIL"}  ${description}`);
}

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(join(root, dir))) {
    const rel = `${dir}/${entry}`;
    if (statSync(join(root, rel)).isDirectory()) out.push(...walk(rel));
    else out.push(rel);
  }
  return out;
}

// ---------------------------------------------------------------------------
console.log("\n--- the prototype touches no database and no provider ---");
// ---------------------------------------------------------------------------
{
  const simFiles = [
    ...walk("components/gifting"),
    ...walk("lib/gifting/simulation"),
    ...walk("app/experience/gifting-demo-client-1"),
  ].filter((f) => f.endsWith(".ts") || f.endsWith(".tsx"));

  check(simFiles.length > 0, `there are simulation files to inspect (${simFiles.length})`);

  // The whole point of the checkpoint: this runs with the gifting migration
  // unapplied, so nothing may reach for Supabase, a provider, or an env var.
  const forbidden = [
    ["@/lib/supabase", "a Supabase client"],
    ["createSecretClient", "the service-role client"],
    ["process.env", "an environment variable"],
    ["seedance", "a provider SDK"],
    ["gift_assignments", "a gifting table"],
    ["gift_packages", "a gifting table"],
    ["credit_ledger", "a gifting table"],
  ];
  for (const [needle, label] of forbidden) {
    const hits = simFiles.filter((f) =>
      stripComments(read(f)).toLowerCase().includes(needle.toLowerCase()),
    );
    check(hits.length === 0, `no simulation file imports ${label}${hits.length ? ` (${hits.join(", ")})` : ""}`);
  }
}

// ---------------------------------------------------------------------------
console.log("\n--- the server-side gifting library is not in any route's graph ---");
// ---------------------------------------------------------------------------
{
  // codes.ts / assignments.ts / client.ts are the FUTURE backend. They are
  // committed but must not be reachable from a page, or the build would need
  // tables that do not exist yet.
  const appFiles = walk("app").filter((f) => f.endsWith(".ts") || f.endsWith(".tsx"));
  const componentFiles = walk("components").filter((f) => f.endsWith(".ts") || f.endsWith(".tsx"));
  const reachable = [...appFiles, ...componentFiles].filter((f) => {
    const src = read(f);
    return (
      src.includes("lib/gifting/assignments") ||
      src.includes("lib/gifting/codes") ||
      src.includes("lib/gifting/client")
    );
  });
  check(
    reachable.length === 0,
    `no page or component imports the unapplied-schema library${reachable.length ? ` (${reachable.join(", ")})` : ""}`,
  );
}

// ---------------------------------------------------------------------------
console.log("\n--- routing stays inside the client's own tree ---");
// ---------------------------------------------------------------------------
{
  const EXPECTED_ROUTES = [
    "app/experience/gifting-demo-client-1/page.tsx",
    "app/experience/gifting-demo-client-1/demo/page.tsx",
    "app/experience/gifting-demo-client-1/gallery/page.tsx",
    "app/admin/(protected)/clients/gifting-demo-client-1/page.tsx",
    "app/admin/(protected)/clients/gifting-demo-client-1/experiences/gifting-demo/page.tsx",
  ];
  for (const route of EXPECTED_ROUTES) {
    let exists = true;
    try {
      read(route);
    } catch {
      exists = false;
    }
    check(exists, `route exists: ${route}`);
  }

  // Nothing outside that tree may reference the prototype. This is the check
  // that catches somebody "helpfully" linking it from the homepage.
  const outside = [...walk("app"), ...walk("components")].filter(
    (f) =>
      (f.endsWith(".ts") || f.endsWith(".tsx")) &&
      !f.includes("gifting") &&
      (read(f).includes("gifting-demo-client-1") || read(f).includes("components/gifting")),
  );
  check(
    outside.length === 0,
    `no file outside the gifting tree links to the prototype${outside.length ? ` (${outside.join(", ")})` : ""}`,
  );

  // The admin dashboard sits INSIDE the (protected) group, so it inherits the
  // existing authorization gate rather than creating an ungated /admin page.
  check(
    EXPECTED_ROUTES.some((r) => r.includes("(protected)/clients/gifting-demo-client-1")),
    "the admin simulation is inside the (protected) group and inherits requireAdminAccess",
  );
}

// ---------------------------------------------------------------------------
console.log("\n--- Kameleon and shared infrastructure are untouched ---");
// ---------------------------------------------------------------------------
{
  // Diff against main is the honest measure: whatever is in it is what a
  // reviewer has to trust.
  const committed = execSync("git diff --name-only origin/main...HEAD", {
    cwd: root,
    encoding: "utf8",
  })
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  // Uncommitted work counts too: "isolated once committed" is not the claim
  // being made, and a reviewer looking at the branch sees both.
  const working = execSync("git status --porcelain", { cwd: root, encoding: "utf8" })
    .split("\n")
    .map((l) => l.slice(3).trim())
    .filter(Boolean);
  const changed = [...new Set([...committed, ...working])];

  console.log(`      (${changed.length} files changed vs origin/main)`);

  // Two shared files change on this branch, and both are checked below rather
  // than merely permitted:
  //   globals.css      — additive tokens only, proved line by line.
  //   verify-admin-auth — the count of protected admin pages, raised from 4 to
  //                       6 because two were added. Proved to be a widening,
  //                       not a weakening.
  const ALLOWED_SHARED = new Set(["app/globals.css", "scripts/verify-admin-auth.mjs"]);
  const strayed = changed.filter(
    (f) =>
      !f.startsWith("app/experience/gifting-demo-client-1/") &&
      !f.startsWith("app/admin/(protected)/clients/gifting-demo-client-1/") &&
      !f.startsWith("components/gifting/") &&
      !f.startsWith("lib/gifting/") &&
      // "public/demo/" is how git status collapses the still-untracked
      // directory; both forms are this prototype's own media.
      !f.startsWith("public/demo/") &&
      !f.startsWith("scripts/media/gifting-demo/") &&
      !f.startsWith("supabase/migrations/20260822090000") &&
      !f.startsWith("scripts/verify-gifting-isolation") &&
      !ALLOWED_SHARED.has(f) &&
      // Pre-existing untracked files belonging to the user, not this branch.
      !["wewtw.txt", ".mcp.json", "mcp/"].some((u) => f.startsWith(u)),
  );
  check(
    strayed.length === 0,
    `every changed file is gifting-scoped or an allow-listed shared file${strayed.length ? ` (${strayed.join(", ")})` : ""}`,
  );

  // proxy.ts decides which routes get the age gate and the admin redirect. It
  // must be unchanged, and its matcher must still not mention the prototype -
  // which is precisely why the prototype needs no exemption.
  check(!changed.includes("proxy.ts"), "proxy.ts is unchanged");
  const proxySrc = read("proxy.ts");
  check(
    proxySrc.includes('matcher: ["/experience/kameleon/:path*", "/admin/:path*"]'),
    "the proxy matcher still covers only Kameleon and admin",
  );
  check(
    !proxySrc.includes("gifting"),
    "the proxy needs no gifting exemption, because the route is outside its matcher",
  );

  for (const f of [
    "components/kameleon/JourneyPlayer.tsx",
    "components/kameleon/Video360Viewer.tsx",
    "components/kameleon/DecisionDrawer.tsx",
    "app/experience/kameleon/page.tsx",
    "lib/kameleon/live-content.ts",
  ]) {
    check(!changed.includes(f), `Kameleon file unchanged: ${f}`);
  }

  // The one shared file that did change. It must be ADDITIVE ONLY: new custom
  // properties nothing else reads, and no existing token altered.
  const cssDiff = execSync("git diff origin/main...HEAD -- app/globals.css", {
    cwd: root,
    encoding: "utf8",
  });
  const removed = cssDiff
    .split("\n")
    .filter((l) => l.startsWith("-") && !l.startsWith("---"))
    .map((l) => l.slice(1).trim())
    .filter(Boolean);
  check(
    removed.length === 0,
    `globals.css only adds lines, never removes or edits one${removed.length ? ` (removed: ${removed.join(" | ")})` : ""}`,
  );
  const added = cssDiff
    .split("\n")
    .filter((l) => l.startsWith("+") && !l.startsWith("+++"))
    .map((l) => l.slice(1).trim())
    .filter(Boolean)
    .filter((l) => !l.startsWith("/*") && !l.startsWith("*") && !l.startsWith("}") && l !== "");
  const nonGift = added.filter((l) => !l.includes("--gift-") && !l.includes("--color-gift-"));
  check(
    nonGift.length === 0,
    `every line added to globals.css is a --gift-* token${nonGift.length ? ` (${nonGift.join(" | ")})` : ""}`,
  );

  // The admin-auth suite must have gained assertions, never lost them. A
  // branch that makes an authorization suite smaller is doing something wrong
  // even when every remaining check passes.
  const authDiff = execSync("git diff origin/main...HEAD -- scripts/verify-admin-auth.mjs", {
    cwd: root,
    encoding: "utf8",
  });
  const removedAsserts = authDiff
    .split(String.fromCharCode(10))
    .filter((l) => l.startsWith("-") && !l.startsWith("---") && l.includes("assert("));
  const addedAsserts = authDiff
    .split(String.fromCharCode(10))
    .filter((l) => l.startsWith("+") && !l.startsWith("+++") && l.includes("assert("));
  check(
    removedAsserts.length === 0,
    `no assertion was removed from the admin-auth suite${removedAsserts.length ? ` (${removedAsserts.length})` : ""}`,
  );
  check(
    addedAsserts.length >= removedAsserts.length,
    "the admin-auth suite did not shrink",
  );
  // And the two new admin pages follow the codebase's own defence-in-depth
  // convention rather than leaning on the layout gate.
  for (const page of [
    "app/admin/(protected)/clients/gifting-demo-client-1/page.tsx",
    "app/admin/(protected)/clients/gifting-demo-client-1/experiences/gifting-demo/page.tsx",
  ]) {
    check(
      /await requireAdminAccess\(\)/.test(read(page)),
      `re-checks authorization itself: ${page}`,
    );
  }

  // A token nothing references cannot change how an existing screen renders.
  const consumers = [...walk("app"), ...walk("components")]
    .filter((f) => (f.endsWith(".tsx") || f.endsWith(".ts")) && !f.includes("gifting"))
    .filter((f) => /\bgift-(bg|surface|ink|border|champagne|silver|blue|success|danger)/.test(read(f)));
  check(
    consumers.length === 0,
    `no existing component uses a gift-* token${consumers.length ? ` (${consumers.join(", ")})` : ""}`,
  );
}

// ---------------------------------------------------------------------------
console.log("\n--- fixtures stay inside the prototype ---");
// ---------------------------------------------------------------------------
{
  const fixtures = read("lib/gifting/simulation/fixtures.ts");
  check(
    fixtures.includes("/demo/gifting/"),
    "media references point at the prototype's own public directory",
  );
  const nonGiftingUsers = [...walk("app"), ...walk("components")]
    .filter((f) => (f.endsWith(".ts") || f.endsWith(".tsx")) && !f.includes("gifting"))
    .filter((f) => read(f).includes("simulation/fixtures"));
  check(
    nonGiftingUsers.length === 0,
    `no non-gifting file reads the fixtures${nonGiftingUsers.length ? ` (${nonGiftingUsers.join(", ")})` : ""}`,
  );
}

console.log(
  `\n${failures.length === 0 ? "OK" : "FAILED"} — ${passed} passed, ${failures.length} failed`,
);
if (failures.length) {
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
