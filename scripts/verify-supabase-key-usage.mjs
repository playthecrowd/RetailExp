// Static verification that the Supabase secret key can never end up in
// client-reachable code, and that no legacy (anon/service_role) key name
// remains anywhere in executable source after the publishable/secret key
// rename. Complements supabase/tests/verify_migrations_structure.mjs
// (which checks the SQL side only) — this checks the TypeScript side.
//
// This is a standalone script, not wired into `next build` itself (that
// would need a custom Next.js/webpack plugin, out of scope here) — run it
// alongside tsc/lint/build as part of the normal verification pass.
//
// Run with: node scripts/verify-supabase-key-usage.mjs

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, extname, relative } from "node:path";

const ROOT = process.cwd();
const SCAN_DIRS = ["app", "components", "lib", "scripts"];
const EXTENSIONS = new Set([".ts", ".tsx", ".mjs", ".js"]);
const IGNORE_DIR_NAMES = new Set(["node_modules", ".next", ".git"]);

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    if (IGNORE_DIR_NAMES.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, files);
    } else if (EXTENSIONS.has(extname(full))) {
      files.push(full);
    }
  }
  return files;
}

// Excludes this script's own file — it necessarily contains the very
// patterns it searches for (as string/regex literals), which would
// otherwise be flagged as a false positive against itself.
const SELF_RELATIVE = "scripts/verify-supabase-key-usage.mjs";
const sourceFiles = SCAN_DIRS.filter((d) => existsSync(join(ROOT, d)))
  .flatMap((d) => walk(join(ROOT, d)))
  .filter((f) => relative(ROOT, f).replace(/\\/g, "/") !== SELF_RELATIVE);

let failed = 0;
function assert(condition, message) {
  if (condition) {
    console.log(`PASS: ${message}`);
  } else {
    failed++;
    console.error(`FAIL: ${message}`);
  }
}

// --- No legacy environment variable names remain in executable source ------

const legacyPatterns = [/NEXT_PUBLIC_SUPABASE_ANON_KEY/, /SUPABASE_SERVICE_ROLE_KEY/];
let legacyHits = [];
for (const file of sourceFiles) {
  const content = readFileSync(file, "utf8");
  for (const pattern of legacyPatterns) {
    if (pattern.test(content)) legacyHits.push(`${relative(ROOT, file)} (${pattern})`);
  }
}
assert(legacyHits.length === 0, `no legacy env var names remain in executable source (found: ${legacyHits.join(", ") || "none"})`);

// --- SUPABASE_SECRET_KEY is referenced only where expected, never from a ---
// --- "use client" file -------------------------------------------------------

const ALLOWED_SECRET_KEY_FILES = new Set(["lib/supabase/secret.ts", "scripts/seed-kameleon-content.mjs"]);
const filesReferencingSecretKey = sourceFiles.filter((f) => readFileSync(f, "utf8").includes("SUPABASE_SECRET_KEY"));

for (const file of filesReferencingSecretKey) {
  const relPath = relative(ROOT, file).replace(/\\/g, "/");
  const content = readFileSync(file, "utf8");

  assert(
    ALLOWED_SECRET_KEY_FILES.has(relPath),
    `SUPABASE_SECRET_KEY is only referenced from an allow-listed file (found in: ${relPath})`,
  );

  assert(
    !/^\s*["']use client["']/m.test(content),
    `the file referencing SUPABASE_SECRET_KEY (${relPath}) is not a "use client" component`,
  );
}

assert(filesReferencingSecretKey.length > 0, "SUPABASE_SECRET_KEY is referenced somewhere (the secret client actually exists)");

// --- The secret key is never NEXT_PUBLIC_-prefixed anywhere (would ship it
// --- to the browser bundle) --------------------------------------------------

for (const file of sourceFiles) {
  const content = readFileSync(file, "utf8");
  assert(
    !/NEXT_PUBLIC_SUPABASE_SECRET_KEY/.test(content),
    `${relative(ROOT, file)} does not NEXT_PUBLIC_-prefix the secret key`,
  );
}

// --- .env.example never NEXT_PUBLIC_-prefixes the secret key ---------------

const envExamplePath = join(ROOT, ".env.example");
if (existsSync(envExamplePath)) {
  const envExample = readFileSync(envExamplePath, "utf8");
  assert(/^SUPABASE_SECRET_KEY=/m.test(envExample), ".env.example declares SUPABASE_SECRET_KEY without a NEXT_PUBLIC_ prefix");
  assert(
    /^NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=/m.test(envExample),
    ".env.example declares NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  );
  assert(!/NEXT_PUBLIC_SUPABASE_SECRET_KEY/.test(envExample), ".env.example never NEXT_PUBLIC_-prefixes the secret key");
}

// --- The browser and server (publishable-key) clients never reference the --
// --- secret key --------------------------------------------------------------

for (const relPath of ["lib/supabase/client.ts", "lib/supabase/server.ts"]) {
  const full = join(ROOT, relPath);
  if (!existsSync(full)) continue;
  const content = readFileSync(full, "utf8");
  assert(!/SUPABASE_SECRET_KEY/.test(content), `${relPath} never references SUPABASE_SECRET_KEY`);
  assert(/NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/.test(content), `${relPath} uses the publishable key`);
}

console.log(`\n${sourceFiles.length} source files scanned.`);
if (failed > 0) {
  console.error(`\n${failed} check(s) FAILED.`);
  process.exit(1);
}
console.log("\nAll Supabase key-usage checks passed.");
