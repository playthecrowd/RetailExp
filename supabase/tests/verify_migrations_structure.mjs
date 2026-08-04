// Static structural verification of the Phase 7 Checkpoint 2 migrations —
// NOT a substitute for actually running them against Postgres (no Docker
// is available in this environment, and no real Supabase project exists
// yet — see the Checkpoint 2 report). This checks properties that ARE
// verifiable from the SQL text alone: every tenant table has RLS enabled,
// every tenant table has a client_id column (directly or is explicitly
// exempted with a documented reason), and no table/column name violates
// the "no Kameleon-specific names in shared schema" requirement.
//
// Run with: node supabase/tests/verify_migrations_structure.mjs

import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(__dirname, "..", "migrations");

const files = readdirSync(migrationsDir)
  .filter((f) => f.endsWith(".sql"))
  .sort();

const sql = files.map((f) => readFileSync(join(migrationsDir, f), "utf8")).join("\n");
const seedSql = readFileSync(join(__dirname, "..", "seed.sql"), "utf8");
const seedSqlWithoutComments = seedSql
  .split("\n")
  .filter((line) => !line.trim().startsWith("--"))
  .join("\n");
const rlsPoliciesSql = readFileSync(join(migrationsDir, "20260804152549_rls_policies.sql"), "utf8");

// SQL with `-- line comments`, `comment on ... is '...'` statements, AND
// `insert into ... ;` statement bodies stripped, for checks that must
// only look at actual schema identifiers (table/column/enum names), not
// explanatory prose or client-owned DATA. Rationale comments legitimately
// reference "Kameleon" as the real first client by name, and — since the
// review moved the initial client records into a tracked migration —
// so does that migration's actual INSERT ... VALUES ('Kameleon', ...)
// data. Both are expected, not violations: the schema itself must stay
// universal; the data it stores is exactly where client-specific names
// belong.
const sqlWithoutComments = sql
  .split("\n")
  .filter((line) => !line.trim().startsWith("--"))
  .join("\n")
  .replace(/comment on [\s\S]*?;/g, "")
  .replace(/insert into [\s\S]*?;/gi, "");

let failed = 0;
function assert(condition, message) {
  if (condition) {
    console.log(`PASS: ${message}`);
  } else {
    failed++;
    console.error(`FAIL: ${message}`);
  }
}

// --- Exactly nine migration files exist -------------------------------------

assert(files.length === 9, `exactly 9 migration files exist (found ${files.length})`);

// --- Every expected table exists ------------------------------------------

const expectedTables = [
  "clients",
  "profiles",
  "client_memberships",
  "experiences",
  "pathways",
  "content_nodes",
  "choices",
  "media_assets",
  "experience_users",
  "journey_progress",
  "engagement_events",
  "brand_settings",
  "publication_versions",
];

for (const table of expectedTables) {
  assert(
    new RegExp(`create table public\\.${table}\\s*\\(`).test(sql),
    `table "${table}" is created`,
  );
}

// --- Every expected table has RLS enabled ----------------------------------

for (const table of expectedTables) {
  assert(
    new RegExp(`alter table public\\.${table} enable row level security`).test(sql),
    `RLS is enabled on "${table}"`,
  );
}

// --- Tenant-owned tables carry a client_id column (denormalized per Decision 2) ---

const tablesRequiringClientId = [
  "client_memberships",
  "experiences",
  "content_nodes",
  "choices",
  "media_assets",
  "experience_users",
  "journey_progress",
  "engagement_events",
  "brand_settings",
];

for (const table of tablesRequiringClientId) {
  const tableBlockMatch = sql.match(new RegExp(`create table public\\.${table} \\(([\\s\\S]*?)\\n\\);`));
  assert(
    !!tableBlockMatch &&
      /client_id uuid not null( unique)? references public\.clients/.test(tableBlockMatch[1]),
    `"${table}" has a real (not-null, FK-validated) client_id column`,
  );
}

// pathways and publication_versions are the two documented exceptions —
// reached via experience_id -> experiences.client_id instead, per the RLS
// policies file (their policies join through experiences explicitly).
for (const table of ["pathways", "publication_versions"]) {
  assert(
    new RegExp(`from public\\.experiences e[\\s\\S]*?e\\.id = ${table}\\.experience_id`).test(sql) ||
      new RegExp(`e\\.id = ${table}\\.experience_id`).test(sql),
    `"${table}" (no direct client_id) has an RLS policy joining through experiences.client_id`,
  );
}

// --- No Kameleon-specific / campaign-specific names in shared schema -------

const forbiddenPatterns = [/kameleon/i, /\bwine\b/i, /\bbottle\b/i, /private_pour/i, /perfect_pour/i];
for (const pattern of forbiddenPatterns) {
  assert(!pattern.test(sqlWithoutComments), `no schema identifier matches forbidden pattern ${pattern}`);
}

// --- choices has no hardcoded 2-choice limit --------------------------------

assert(
  !/check\s*\(.*choices.*<=\s*2/i.test(sql) && !/max.*2.*choice/i.test(sql),
  "no hardcoded two-choice limit found anywhere in the migrations",
);

// --- role-promotion protection triggers exist -------------------------------

assert(
  /create trigger profiles_protect_platform_admin_flag/.test(sql),
  "is_platform_admin is protected by a trigger",
);
assert(
  /create trigger client_memberships_protect_role_changes/.test(sql),
  "client_memberships.role changes are protected by a trigger",
);

// --- Review correction: seed.sql is now empty of actual data ---------------
// --- (Supabase advises against `db push --include-seed` on a real project;
// --- the legitimate initial records moved into a tracked migration below) --

assert(
  !/insert into/i.test(seedSqlWithoutComments),
  "seed.sql contains no INSERT statements — it's explanatory comments only",
);
assert(
  !/tenant-isolation-test|isolation-check|Tenant Isolation Test/i.test(seedSql),
  "seed.sql contains no throwaway test tenant",
);

// --- The initial-client-records migration contains no throwaway/fixture ----
// --- tenant, and is idempotent on the real unique business keys ------------

const initialRecordsMigration = sql.match(
  /-- Phase 7 Checkpoint 2 — initial legitimate platform records\.[\s\S]*$/,
)?.[0] ?? "";
assert(initialRecordsMigration.length > 0, "the initial-client-records migration was found");
assert(
  !/tenant-isolation-test|isolation-check|Tenant Isolation Test/i.test(initialRecordsMigration),
  "the initial-client-records migration contains no throwaway test tenant",
);
assert(
  (initialRecordsMigration.match(/insert into public\.clients/g) || []).length === 1,
  "the initial-client-records migration inserts exactly one client (Kameleon)",
);
assert(
  /on conflict \(slug\) do nothing/.test(initialRecordsMigration),
  "the client insert is conflict-safe on the unique slug, not a hardcoded id",
);
assert(
  /on conflict \(client_id, slug\) do nothing/.test(initialRecordsMigration),
  "the experience insert is conflict-safe on the unique (client_id, slug)",
);
assert(
  !/do update/i.test(
    initialRecordsMigration
      .split("\n")
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n"),
  ),
  "the initial-client-records migration never uses DO UPDATE (would risk overwriting legitimate edits)",
);

// --- Correction 3: membership management and PII access exclude 'editor' ---

assert(
  /create policy client_memberships_insert_admins[\s\S]*?can_manage_members/.test(sql) &&
    /create policy client_memberships_update_admins[\s\S]*?can_manage_members/.test(sql),
  "client_memberships insert/update policies use can_manage_members (owner/admin only), not can_edit_client",
);
assert(
  /can_manage_members[\s\S]*?role in \('owner', 'admin'\)/.test(sql),
  "can_manage_members excludes 'editor'",
);
assert(
  /create policy experience_users_select_members[\s\S]*?can_view_experience_user_pii/.test(sql),
  "experience_users admin-read policy uses can_view_experience_user_pii (owner/admin only)",
);
assert(
  /can_view_experience_user_pii[\s\S]*?role in \('owner', 'admin'\)/.test(sql),
  "can_view_experience_user_pii excludes 'editor' and 'viewer'",
);

// --- Correction 4: private bucket, published-only anon media authorization -

assert(
  /values \('platform-media', 'platform-media', false\)/.test(sql),
  "the platform-media Storage bucket is created with public = false",
);
assert(
  /media_assets_select_published_public[\s\S]{0,80}is_source_master = false/.test(sql),
  "the public media_assets read policy excludes is_source_master assets",
);
assert(
  /m\.is_source_master = false/.test(sql),
  "the public Storage object read policy excludes is_source_master assets",
);

// --- Item 3: every SECURITY DEFINER function has an explicit search_path ---

const definerFunctionBlocks = [...sql.matchAll(/create or replace function[\s\S]*?\$\$;/g)].filter((m) =>
  /security definer/.test(m[0]),
);
assert(definerFunctionBlocks.length >= 8, `found ${definerFunctionBlocks.length} SECURITY DEFINER functions (expected >= 8)`);
for (const match of definerFunctionBlocks) {
  const nameMatch = match[0].match(/function public\.(\w+)/);
  assert(/set search_path = public/.test(match[0]), `SECURITY DEFINER function "${nameMatch?.[1]}" sets an explicit search_path`);
}

// --- Item 3: internal-only SECURITY DEFINER functions have EXECUTE revoked -

for (const fn of ["handle_new_user", "protect_platform_admin_flag", "protect_membership_role_changes"]) {
  assert(
    new RegExp(`revoke execute on function public\\.${fn}\\(\\) from public, anon, authenticated`).test(sql),
    `"${fn}" (trigger-only) has EXECUTE revoked from public/anon/authenticated`,
  );
}

// --- Item 4: RLS helper functions used inside client_memberships' own ------
// --- policies are all SECURITY DEFINER (recursion safety) ------------------

const clientMembershipsPolicyBlock = rlsPoliciesSql.match(
  /-- client_memberships --[\s\S]*?(?=-- experiences ---)/,
)?.[0] ?? "";
const helpersUsedInMembershipsPolicies = [
  ...new Set([...clientMembershipsPolicyBlock.matchAll(/public\.(is_client_member|is_platform_admin|can_manage_members|is_client_owner)\(/g)].map((m) => m[1])),
];
assert(helpersUsedInMembershipsPolicies.length >= 3, "client_memberships' own policies call at least 3 distinct helper functions");
for (const helper of helpersUsedInMembershipsPolicies) {
  const fnBlock = sql.match(new RegExp(`create or replace function public\\.${helper}\\([\\s\\S]*?\\$\\$;`));
  assert(
    !!fnBlock && /security definer/.test(fnBlock[0]),
    `helper "${helper}" (used inside client_memberships' own policies) is SECURITY DEFINER, preventing recursive RLS evaluation`,
  );
}

// --- Item 5: every FK-adjacent tenant table has a client-consistency trigger

const consistencyTriggerTables = ["choices", "content_nodes", "media_assets", "experience_users", "journey_progress", "engagement_events"];
for (const table of consistencyTriggerTables) {
  assert(
    new RegExp(`create trigger ${table}_enforce_client_consistency`).test(sql),
    `"${table}" has a client-consistency trigger preventing cross-tenant relationships`,
  );
}

// --- Item 6: choices cannot connect nodes across experiences ---------------

assert(
  /choices cannot connect content_nodes across different experiences/.test(sql),
  "the choices consistency trigger blocks cross-experience connections",
);

// --- Corrective migration: ambient-connection bypass + SQLSTATE 42501 ------

assert(
  /auth\.role\(\) = 'service_role' or auth\.role\(\) is null/.test(sql),
  "protect_membership_role_changes() bypasses on auth.role() (not auth.uid()) — a genuine service_role request OR no JWT/API role context at all (ambient/direct connection). auth.role() is never null for a real anon/authenticated request, unlike auth.uid().",
);
assert(
  !/or acting_user_id is null/.test(sql),
  "the rejected auth.uid() IS NULL bypass condition is not present anywhere (would also match real anonymous API requests)",
);
// Scoped to ONLY the corrective migration — the original (still-applied,
// intentionally untouched per the remote-migration rule)
// 20260804152547_role_promotion_protections.sql still has the old,
// unqualified RAISE EXCEPTIONs textually, superseded at runtime by this
// migration's CREATE OR REPLACE, not edited in place.
const correctiveMigrationSql = readFileSync(
  join(migrationsDir, "20260804210404_fix_role_promotion_ambient_connection.sql"),
  "utf8",
);
const raiseExceptionBlocks = [...correctiveMigrationSql.matchAll(/raise exception[\s\S]*?;/g)];
const membershipRelatedRaises = raiseExceptionBlocks.filter((m) =>
  /cannot change their own client_memberships row|only an owner of this client|is_platform_admin cannot be changed/.test(m[0]),
);
assert(
  membershipRelatedRaises.length === 3 && membershipRelatedRaises.every((m) => /errcode = '42501'/.test(m[0])),
  `all 3 role-promotion-protection RAISE EXCEPTIONs in the corrective migration use the explicit 42501 (insufficient_privilege) SQLSTATE (found ${membershipRelatedRaises.length} matching raises)`,
);
assert(
  /fixture_membership_count/.test(sql) === false, // migrations dir shouldn't contain test-only fixture code
  "no fixture/test-only code leaked into the migrations directory",
);

console.log(`\n${files.length} migration files checked.`);
if (failed > 0) {
  console.error(`\n${failed} check(s) FAILED.`);
  process.exit(1);
}
console.log("\nAll structural checks passed.");
