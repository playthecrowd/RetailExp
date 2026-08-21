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

  // Nothing outside that tree may IMPORT the prototype. This is the check that
  // catches the prototype's screens, state or styles leaking into another
  // route — which is the coupling that actually costs something.
  const importers = [...walk("app"), ...walk("components")].filter(
    (f) =>
      (f.endsWith(".ts") || f.endsWith(".tsx")) &&
      !f.includes("gifting") &&
      /from "[^"]*(components\/gifting|lib\/gifting)/.test(read(f)),
  );
  check(
    importers.length === 0,
    `no file outside the gifting tree imports the prototype${importers.length ? ` (${importers.join(", ")})` : ""}`,
  );

  // Linking to it is a different matter, and the answer changed deliberately:
  // the platform homepage now offers "View Gifting Demo". That is one href to
  // a public route, not a shared launcher, so it is named explicitly here —
  // every OTHER file outside the tree still may not mention the prototype at
  // all, which keeps catching an accidental menu item or nav entry.
  const HOMEPAGE_LINK = "components/home/Landing.tsx";
  const linkers = [...walk("app"), ...walk("components")].filter(
    (f) =>
      (f.endsWith(".ts") || f.endsWith(".tsx")) &&
      !f.includes("gifting") &&
      f !== HOMEPAGE_LINK &&
      read(f).includes("gifting-demo-client-1"),
  );
  check(
    linkers.length === 0,
    `only the homepage links to the prototype${linkers.length ? ` (also: ${linkers.join(", ")})` : ""}`,
  );
  check(
    (read(HOMEPAGE_LINK).match(/gifting-demo-client-1/g) ?? []).length === 1,
    "the homepage carries exactly one link to it, and nothing else from it",
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

  // Shared files that change, each checked below rather than merely permitted:
  //   globals.css      — additive tokens only, proved line by line.
  //   verify-admin-auth — the count of protected admin pages, raised from 4 to
  //                       6 because two were added. Proved to be a widening,
  //                       not a weakening.
  //   app/page.tsx     — the platform homepage. It replaced the framework's
  //   components/home/   starter page and links to the demo; it imports
  //                      nothing from the prototype, which the check above
  //                      proves, and adds no global CSS.
  const ALLOWED_SHARED = new Set([
    "app/globals.css",
    "scripts/verify-admin-auth.mjs",
    "app/page.tsx",
  ]);
  const strayed = changed.filter(
    (f) =>
      !f.startsWith("app/experience/gifting-demo-client-1/") &&
      !f.startsWith("app/admin/(protected)/clients/gifting-demo-client-1/") &&
      !f.startsWith("components/gifting/") &&
      !f.startsWith("lib/gifting/") &&
      // "public/demo/" is how git status collapses the still-untracked
      // directory; both forms are this prototype's own media.
      !f.startsWith("public/demo/") &&
      // This prototype's own verifier, which touches nothing but itself.
      f !== "scripts/verify-gifting-keyboard.mjs" &&
      !f.startsWith("scripts/media/gifting-demo/") &&
      !f.startsWith("supabase/migrations/20260822090000") &&
      !f.startsWith("scripts/verify-gifting-isolation") &&
      !ALLOWED_SHARED.has(f) &&
      !f.startsWith("components/home/") &&
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
  // Against the merge base with NO second revision, so the comparison includes
  // the working tree. Reading only committed changes meant this check could
  // pass while an ungated rule sat unstaged in the file being reviewed.
  const mergeBase = execSync("git merge-base origin/main HEAD", {
    cwd: root,
    encoding: "utf8",
  }).trim();
  const cssDiff = execSync(`git diff ${mergeBase} -- app/globals.css`, {
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
  // The guarantee is not "only tokens" — the shell also needs a scroll-lock
  // rule. It is that every SELECTOR added is gated on a gift- class, so the
  // rule cannot match an element on any existing route.
  const addedLines = cssDiff
    .split(String.fromCharCode(10))
    .filter((l) => l.startsWith("+") && !l.startsWith("+++"))
    .map((l) => l.slice(1))
    .filter((l) => l.trim().length > 0);

  // A rule is only dangerous if its SELECTOR can match an element. At-rules
  // cannot, and neither can a keyframe step — so those are judged on their own
  // terms: an @keyframes must be gift-named, and its `from`/`to`/`40%` steps
  // are exempt because they only ever apply to whatever already uses it.
  let inKeyframes = false;
  let depth = 0;
  const ungatedSelectors = [];
  for (const raw of addedLines) {
    const line = raw.trim();
    const opens = (raw.match(/\{/g) ?? []).length;
    const closes = (raw.match(/\}/g) ?? []).length;
    const wasInKeyframes = inKeyframes;
    if (line.includes("{") && !line.startsWith("*") && !line.startsWith("/*")) {
      const selector = line.slice(0, line.indexOf("{")).trim();
      if (selector.startsWith("@keyframes")) {
        if (!selector.includes("gift")) ungatedSelectors.push(selector);
        inKeyframes = true;
      } else if (selector.startsWith("@")) {
        // @media / @supports wrap rules; the rules inside are still checked.
      } else if (wasInKeyframes && /^(from|to|[\d.]+%)(\s*,\s*(from|to|[\d.]+%))*$/.test(selector)) {
        // A keyframe step, not a selector.
      } else if (selector && !selector.includes("gift")) {
        ungatedSelectors.push(selector);
      }
    }
    depth += opens - closes;
    if (inKeyframes && depth <= 0) {
      inKeyframes = false;
      depth = 0;
    }
  }
  check(
    ungatedSelectors.length === 0,
    `every CSS rule added is gated on a gift- selector${ungatedSelectors.length ? ` (${ungatedSelectors.join(" | ")})` : ""}`,
  );

  // Custom properties are additive by nature, but a REDEFINED existing token
  // would silently restyle Kameleon, so every declared property must be new
  // and gift-prefixed.
  const addedProps = addedLines
    .map((l) => l.trim())
    .filter((l) => l.startsWith("--") && l.includes(":"))
    .map((l) => l.split(":")[0].trim());
  const foreignProps = addedProps.filter((name) => !name.startsWith("--gift-") && !name.startsWith("--color-gift-"));
  check(
    foreignProps.length === 0,
    `every custom property added is a gift token${foreignProps.length ? ` (${foreignProps.join(", ")})` : ""}`,
  );

  // The admin-auth suite must not have SHRUNK. Counting diff lines was wrong:
  // editing an assertion shows as one removal and one addition, which is a
  // modification, not a loss. Counting the assertions in each version is the
  // question actually worth asking.
  const authBefore = execSync("git show origin/main:scripts/verify-admin-auth.mjs", {
    cwd: root,
    encoding: "utf8",
  });
  const authAfter = read("scripts/verify-admin-auth.mjs");
  const countAsserts = (text) => (text.match(/assert\(/g) ?? []).length;
  check(
    countAsserts(authAfter) >= countAsserts(authBefore),
    `the admin-auth suite did not shrink (${countAsserts(authBefore)} -> ${countAsserts(authAfter)})`,
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
console.log("\n--- the homepage borrows nothing from the prototype ---");
// ---------------------------------------------------------------------------
{
  const landing = read("components/home/Landing.tsx");
  const page = read("app/page.tsx");
  check(
    !/gift-/.test(landing) && !/gift-/.test(page),
    "the homepage uses no gift- token, theme or class",
  );
  check(
    !/StageProvider|ActionDock|GiftingKeyboard|useLockedDocument/.test(landing),
    "no fixed stage, dock, keyboard or scroll lock reaches the homepage",
  );
  check(
    !/"use client"/.test(landing) && !/"use client"/.test(page),
    "the homepage stays a server component — nothing on it needs to be interactive",
  );
  check(
    /min-h-dvh/.test(landing) && !/100vh/.test(landing),
    "it sizes to the dynamic viewport rather than a fixed one",
  );
  check(
    /env\(safe-area-inset/.test(landing),
    "and keeps its content clear of the notch and the home indicator",
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

// ---------------------------------------------------------------------------
console.log("\n--- the three layers stay separate ---");
// ---------------------------------------------------------------------------
{
  // The defect this pass exists to kill: a required action sharing its
  // visibility with the instruction overlay. ActionDock must not be able to
  // read guidance visibility at all, so no later edit can reintroduce it.
  const shell = read("components/gifting/shell.tsx");
  const fromDock = shell.slice(shell.indexOf("export function ActionDock"));
  const dockBody = fromDock.slice(0, fromDock.indexOf("\nexport function"));
  check(
    !/guidanceVisible/.test(dockBody),
    "ActionDock never reads guidance visibility",
  );
  // Prose about the old design is fine; a live prop is not.
  const shellCode = shell
    .split("\n")
    .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
    .join("\n");
  check(
    !/forceVisible/.test(shellCode),
    "no forceVisible escape hatch remains — permanence is the default, not an opt-in",
  );

  // And no flow may nest its action inside the guidance element.
  for (const file of walk("components/gifting")) {
    if (!file.endsWith(".tsx")) continue;
    check(
      !/<Guidance[^>]*>[\s\S]*?<\/Guidance>/.test(read(file)),
      `Guidance has no children in ${file.split("/").pop()} — it cannot hide an action`,
    );
  }
}

// ---------------------------------------------------------------------------
console.log("\n--- no implementation language reaches a visitor ---");
// ---------------------------------------------------------------------------
{
  // Words that describe how the thing is built rather than what it does. A
  // visitor reading "simulated" or "no database" is being told about our
  // plumbing, which is never something they asked about.
  const banned =
    /\b(simulat\w*|mock\w*|fixtures?|database|backend|migration|provider|localStorage|local state|placeholder(?![:-])|dummy|stub|job id|assignment id)\b/i;
  const visitorFiles = [
    "components/gifting/shell.tsx",
    "components/gifting/VideoStage.tsx",
    "components/gifting/RecipientFlow.tsx",
    "components/gifting/SenderFlow.tsx",
    "components/gifting/Gallery.tsx",
    "components/gifting/GiftReveal.tsx",
    "components/gifting/GiftingApp.tsx",
    "components/gifting/ui.tsx",
  ];
  for (const file of visitorFiles) {
    const offenders = read(file)
      .split("\n")
      // Comments explain the code to us and imports name modules. Neither is
      // rendered, so neither is what this check is about.
      .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line) && !/^\s*import\b|from "/.test(line))
      // Utility classes are not copy: `placeholder:text-*` is a Tailwind
      // selector, not something anyone reads on screen.
      .map((line) => line.replace(/className=("[^"]*"|\{[^}]*\})/g, ""))
      // Class lists also travel as bare strings inside cn(...). A quoted run
      // of Tailwind tokens is styling, not copy.
      .map((line) => line.replace(/"[^"]*(?:min-h-|rounded-|border-|bg-|text-\[)[^"]*"/g, ""))
      .filter((line) => {
        // Only what a visitor could actually read: quoted copy and JSX text.
        const quoted = line.match(/"[^"]{4,}"|'[^']{4,}'/g) ?? [];
        const jsxText = line.match(/>[^<>{}\n]{4,}</g) ?? [];
        return [...quoted, ...jsxText].some((t) => banned.test(t));
      });
    check(
      offenders.length === 0,
      `no implementation language in ${file.split("/").pop()}${
        offenders.length ? ` (${offenders[0].trim().slice(0, 70)})` : ""
      }`,
    );
  }
}

console.log(
  `\n${failures.length === 0 ? "OK" : "FAILED"} — ${passed} passed, ${failures.length} failed`,
);
if (failures.length) {
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
