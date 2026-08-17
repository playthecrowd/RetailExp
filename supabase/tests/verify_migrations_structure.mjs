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

// --- The expected number of migration files exist ---------------------------
//
// This asserted 9 from the phase in which it was written and has been failing
// ever since as migrations were legitimately added — reported as a known stale
// assertion at each checkpoint rather than silently adjusted. Corrected here,
// as part of an explicit instruction to update the structural migration
// assertions, to the real current count. A mismatch now means a migration was
// added or removed without updating this file, which is the signal it was
// always meant to give.

assert(files.length === 17, `exactly 17 migration files exist (found ${files.length})`);

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

// --- experience_users identity/tenant immutability -------------------------
// Scoped to the corrective migration that introduces it, so these assertions
// describe that file specifically rather than "somewhere in the schema".

const identityMigrationFile = "20260817143000_protect_experience_user_identity.sql";
assert(
  files.includes(identityMigrationFile),
  `the experience_users identity-protection migration exists (${identityMigrationFile})`,
);

const identitySql = files.includes(identityMigrationFile)
  ? readFileSync(join(migrationsDir, identityMigrationFile), "utf8")
  : "";
const identitySqlWithoutComments = identitySql
  .split("\n")
  .filter((line) => !line.trim().startsWith("--"))
  .join("\n");

assert(
  /create or replace function public\.protect_experience_user_identity\(\)/.test(identitySql),
  "protect_experience_user_identity() is defined",
);
assert(
  /create or replace function public\.protect_experience_user_deletion\(\)/.test(identitySql),
  "protect_experience_user_deletion() is defined",
);
assert(
  (identitySql.match(/set search_path = public/g) || []).length >= 2,
  "both experience_users protection functions pin an explicit search_path",
);
assert(
  (identitySql.match(/auth\.role\(\) = 'service_role' or auth\.role\(\) is null/g) || []).length === 2,
  "both protection functions use the strict auth.role() bypass (service_role OR no JWT/API role context), in both the UPDATE and DELETE paths",
);
assert(
  !/auth\.uid\(\) is null/i.test(identitySql),
  "the identity-protection migration never uses the rejected auth.uid() IS NULL bypass (it would match every real anonymous API request)",
);
// Every raise in this migration is an authorization failure, so every one of
// them must carry 42501 rather than falling back to the generic P0001.
const identityRaises = [...identitySql.matchAll(/raise exception[\s\S]*?;/g)];
assert(
  identityRaises.length >= 5 && identityRaises.every((m) => /errcode = '42501'/.test(m[0])),
  `every RAISE EXCEPTION in the identity-protection migration uses SQLSTATE 42501 (found ${identityRaises.length})`,
);
// Deterministic ordering: Postgres fires BEFORE row triggers in name order, so
// the protection triggers must sort ahead of the consistency trigger or a
// client_id change would surface as the consistency trigger's generic P0001.
assert(
  /create trigger experience_users_00_protect_identity\s+before update on public\.experience_users/.test(identitySql),
  "the identity trigger is BEFORE UPDATE and named to sort before experience_users_enforce_client_consistency",
);
assert(
  /create trigger experience_users_00_protect_deletion\s+before delete on public\.experience_users/.test(identitySql),
  "the deletion trigger is BEFORE DELETE and named to sort before experience_users_enforce_client_consistency",
);
assert(
  "experience_users_00_protect_identity" < "experience_users_enforce_client_consistency",
  "trigger name ordering actually places identity protection first (deterministic 42501)",
);
for (const column of ["id", "auth_user_id", "client_id", "experience_id"]) {
  assert(
    new RegExp(`new\\.${column} is distinct from old\\.${column}`).test(identitySql),
    `experience_users.${column} is compared NEW vs OLD and rejected when changed`,
  );
}
assert(
  /revoke execute on function public\.protect_experience_user_identity\(\)[\s\S]*?from public, anon, authenticated/.test(identitySql) &&
    /revoke execute on function public\.protect_experience_user_deletion\(\)[\s\S]*?from public, anon, authenticated/.test(identitySql),
  "direct EXECUTE on both trigger-only protection functions is revoked from public/anon/authenticated",
);
assert(
  !/execute\s+(format|'|")/i.test(identitySqlWithoutComments),
  "the identity-protection migration contains no dynamic SQL",
);

// Privileges.
assert(
  /revoke update on public\.experience_users from anon, authenticated/.test(identitySql),
  "table-level UPDATE on experience_users is revoked from anon and authenticated",
);
assert(
  /revoke delete on public\.experience_users from anon, authenticated/.test(identitySql),
  "DELETE on experience_users is revoked from anon and authenticated",
);
const grantMatch = identitySql.match(
  /grant update \(([^)]*)\)\s*\n?\s*on public\.experience_users to authenticated/,
);
assert(
  grantMatch !== null &&
    grantMatch[1].split(",").map((c) => c.trim()).sort().join(",") ===
      "display_name,email,phone_e164",
  "authenticated is granted column-level UPDATE on exactly display_name, email and phone_e164",
);
assert(
  !/grant update[\s\S]{0,120}to anon/.test(identitySql),
  "anon is granted no UPDATE on experience_users",
);
assert(
  !/(revoke|grant)\s+select[\s\S]{0,80}experience_users/i.test(identitySql),
  "SELECT privileges on experience_users are left untouched (existing PII visibility unchanged)",
);

// Policies: the misleading FOR ALL policy is gone, replaced by explicit verbs.
assert(
  /drop policy if exists experience_users_write_own on public\.experience_users/.test(identitySql),
  "the FOR ALL experience_users_write_own policy is dropped",
);
assert(
  /create policy experience_users_insert_own on public\.experience_users\s+for insert/.test(identitySql),
  "an explicit INSERT policy (experience_users_insert_own) replaces it",
);
assert(
  /create policy experience_users_update_own on public\.experience_users\s+for update/.test(identitySql),
  "an explicit UPDATE policy (experience_users_update_own) replaces it",
);
assert(
  !/create policy[\s\S]{0,200}on public\.experience_users\s+for (delete|all)\b/.test(identitySql),
  "no end-user DELETE (or FOR ALL) policy is created on experience_users",
);
for (const policy of ["experience_users_insert_own", "experience_users_update_own"]) {
  const body = identitySql.slice(identitySql.indexOf(`create policy ${policy}`));
  assert(
    /publication_status = 'published'/.test(body.slice(0, 500)),
    `${policy} retains the published-experience guard`,
  );
}
assert(
  /auth_user_id = auth\.uid\(\)/.test(identitySql),
  "both replacement policies remain scoped to the caller's own row",
);

// The pre-existing tenant-consistency protection must survive untouched.
assert(
  !/drop trigger[\s\S]{0,120}experience_users_enforce_client_consistency/i.test(sql) &&
    !/drop function[\s\S]{0,120}enforce_experience_user_client_consistency/i.test(sql),
  "the experience_users tenant-consistency trigger and function are preserved, not dropped or replaced",
);

// --- Testimonial submissions: direct-to-provider pipeline ------------------

const testimonialMigrationFile = "20260817160000_testimonial_submissions.sql";
assert(
  files.includes(testimonialMigrationFile),
  `the testimonial submissions migration exists (${testimonialMigrationFile})`,
);

const tsSql = files.includes(testimonialMigrationFile)
  ? readFileSync(join(migrationsDir, testimonialMigrationFile), "utf8")
  : "";
const tsBody = tsSql
  .split("\n")
  .filter((line) => !line.trim().startsWith("--"))
  .join("\n");

// Capture-only scope.
assert(!/\bsource_type\b/.test(tsBody), "no source_type column - capture is phone-camera only");
assert(!/\boriginal_filename\b/.test(tsBody), "no original_filename column - there is no file picker");
assert(
  /capture_mode[\s\S]{0,120}check \(capture_mode in \('stream', 'native_input'\)\)/.test(tsSql),
  "capture_mode is constrained to the two capture paths",
);

// NO Supabase media custody. The provider is quarantine, processing and delivery.
assert(
  !/storage\.buckets/.test(tsBody),
  "the migration creates NO storage bucket - media never enters Supabase Storage",
);
assert(
  !/on storage\.objects/.test(tsBody),
  "the migration creates NO storage policies",
);
assert(
  !/storage\.foldername/.test(tsBody),
  "no storage path convention is encoded - there are no Supabase media paths",
);
for (const col of ["source_storage_path", "delivery_storage_path", "poster_storage_path"]) {
  assert(!new RegExp(`\\b${col}\\b`).test(tsBody), `no Supabase media path column ${col} remains`);
}
assert(!/platform-media/.test(tsBody), "the existing platform-media bucket is untouched");

// Provider-neutral identifiers, and never a credential.
for (const col of [
  "provider", "provider_asset_id", "provider_upload_id", "provider_processing_status",
  "provider_delivery_id", "provider_poster_id", "provider_error_code",
  "provider_deletion_status", "last_provider_event_id", "last_provider_event_at",
  "delivery_ready_at", "poster_ready_at",
]) {
  assert(new RegExp(`\\n  ${col}\\s`).test(tsSql), `provider-neutral column ${col} exists`);
}
assert(
  !/\b(api_token|api_key|webhook_secret|signing_secret|upload_url|signed_url|playback_token|access_token|bearer)\b/i.test(tsBody),
  "no API token, webhook secret, one-time upload URL, signed URL or expiring token is ever stored",
);
assert(
  /create unique index testimonial_submissions_provider_asset_unique/.test(tsSql),
  "one provider asset may back at most one submission",
);

// Three independent lifecycles.
for (const t of ["testimonial_upload_status", "testimonial_validation_status", "testimonial_moderation_status"]) {
  assert(new RegExp(`create type public\\.${t} as enum`).test(tsSql), `${t} enum is defined`);
}
assert(
  !/^\s{2}status\s+/m.test(tsBody),
  "there is no overloaded generic status column",
);

// Provider completion is not validation, and validation is not publication.
assert(
  /validation requires a completed provider upload with an asset id/.test(tsSql),
  "validation cannot be decided before the provider holds a completed asset",
);
assert(
  /validation_status is conclusive and cannot be re-decided/.test(tsSql),
  "a conclusive validation result cannot be re-decided",
);
assert(
  /submission is not moderation-eligible/.test(tsSql) &&
    /new\.validation_status <> 'valid'/.test(tsSql) &&
    /new\.provider_asset_id is null/.test(tsSql),
  "moderation requires uploaded + trusted-valid + a provider asset + trusted metadata, so a provider failure can never reach the queue",
);
assert(
  /cannot be approved before a trusted delivery rendition is ready/.test(tsSql),
  "an approved record without delivery readiness cannot publish",
);
assert(
  /constraint testimonial_approved_requires_ready_delivery[\s\S]{0,320}published_at is not null/.test(tsSql),
  "a CHECK constraint makes an approved-but-unservable row impossible to store",
);
assert(
  /constraint testimonial_submission_key_unique[\s\S]{0,140}unique \(experience_user_id, client_submission_key\)/.test(tsSql),
  "duplicate-submit protection: unique (experience_user_id, client_submission_key)",
);
assert(/upload_expires_at/.test(tsSql), "upload intents carry an expiry for orphan reconciliation");

// The browser sets none of the trusted values.
const trustedControls = [
  ["upload completion", /new\.upload_status\s+:= 'initiated'/],
  ["validation result", /new\.validation_status\s+:= 'pending'/],
  ["provider references", /new\.provider_asset_id\s+:= null/],
  ["delivery readiness", /new\.delivery_ready_at\s+:= null/],
  ["moderation state", /new\.moderation_status := 'pending'/],
  ["identity binding", /new\.auth_user_id := auth\.uid\(\)/],
  ["review provenance", /new\.reviewed_by := auth\.uid\(\)/],
];
for (const [label, re] of trustedControls) {
  assert(re.test(tsSql), `the triggers control ${label} server-side`);
}
for (const msg of [
  "upload completion is recorded by a trusted component",
  "validation results and trusted metadata cannot be self-reported",
  "provider references and processing state are written only by the trusted server",
  "moderation state and review provenance are server-controlled",
  "recorded consent cannot be altered after submission",
]) {
  assert(tsSql.includes(msg), `browser identities are rejected for: ${msg}`);
}

// PUBLIC READ BOUNDARY.
assert(
  /revoke all on public\.testimonial_submissions from anon/.test(tsSql),
  "anon has no privilege of any kind on the raw testimonial table",
);
assert(
  /revoke select, update, delete on public\.testimonial_submissions from authenticated/.test(tsSql),
  "authenticated cannot SELECT, UPDATE or DELETE the raw testimonial table",
);
assert(
  !/create policy testimonial_submissions_select_approved/.test(tsSql),
  "no direct public-approved row policy - RLS filters rows but cannot hide columns",
);
const tsGrant = tsSql.match(/grant update \(([\s\S]*?)\)\s*on public\.testimonial_submissions to authenticated/);
assert(tsGrant !== null, "authenticated receives an explicit column-level UPDATE grant");
if (tsGrant) {
  const granted = tsGrant[1].split(",").map((c) => c.trim()).filter(Boolean);
  assert(
    granted.length === 1 && granted[0] === "caption",
    `authenticated may update ONLY caption (found: ${granted.join(", ")})`,
  );
}

// Sanitized gallery view.
assert(/create view public\.testimonial_gallery_items/.test(tsSql), "a sanitized gallery view exists");
assert(
  /grant select on public\.testimonial_gallery_items to anon, authenticated/.test(tsSql),
  "the gallery view is the surface granted to browser roles",
);
const galleryView = tsSql.slice(
  tsSql.indexOf("create view public.testimonial_gallery_items"),
  tsSql.indexOf("comment on view public.testimonial_gallery_items"),
);
for (const forbidden of [
  "auth_user_id", "experience_user_id", "consent_version", "consented_at",
  "reviewed_by", "moderation_note", "rejection_reason", "client_submission_key",
  "detected_mime_type", "provider_upload_id", "validation_failure_reason",
]) {
  assert(!new RegExp(`\\b${forbidden}\\b`).test(galleryView), `the gallery view never selects ${forbidden}`);
}
for (const required of [
  "moderation_status = 'approved'", "validation_status = 'valid'",
  "published_at is not null", "delivery_ready_at is not null", "media_deleted_at is null",
]) {
  assert(galleryView.includes(required), `the gallery view requires ${required}`);
}
assert(
  /create view public\.testimonial_moderation_queue[\s\S]*?validation_status = 'valid'/.test(tsSql),
  "the moderation queue view contains only trusted-valid submissions",
);
assert(
  !/grant select on public\.testimonial_moderation_queue to (anon|authenticated)/.test(tsSql),
  "the moderation queue view is not granted to any browser role",
);

// Consent and attestations.
assert(
  /constraint testimonial_attestations_required[\s\S]{0,160}attested_no_minors and attested_subjects_consented/.test(tsSql),
  "both attestations are mandatory - minors prohibited, enforced by CHECK not UI copy",
);
assert(
  /consent_scope[\s\S]{0,220}check \(consent_scope in \('experience_gallery_display'\)\)/.test(tsSql),
  "consent scope is limited to gallery display - marketing/social reuse is not covered",
);
assert(
  /media_purge_after := now\(\) \+ interval '30 days'/.test(tsSql),
  "rejected and removed media get a 30-day private retention deadline",
);

// Webhook replay protection.
assert(
  /create table public\.testimonial_processing_events/.test(tsSql),
  "a provider event ledger exists for replay protection",
);
assert(
  /constraint testimonial_processing_event_unique unique \(provider, provider_event_id\)/.test(tsSql),
  "unique (provider, provider_event_id) is the replay-protection mechanism",
);
assert(
  /alter table public\.testimonial_processing_events enable row level security/.test(tsSql) &&
    /revoke all on public\.testimonial_processing_events from anon, authenticated/.test(tsSql) &&
    !/create policy[\s\S]{0,140}on public\.testimonial_processing_events/.test(tsSql),
  "the event ledger has RLS enabled, no policies and no browser privilege - service_role only",
);
assert(
  /signature_verified_at timestamptz not null/.test(tsSql),
  "signature_verified_at is NOT NULL - an unverified or stale-signed event cannot be recorded at all",
);
assert(
  !/payload\s+jsonb/.test(tsSql) && /payload_hash\s+text not null/.test(tsSql),
  "the ledger stores a payload HASH, never the full raw payload",
);
assert(
  /constraint testimonial_processing_payload_hash_shape[\s\S]{0,120}\[0-9a-f\]\{64\}/.test(tsSql),
  "payload_hash is constrained to a sha256 hex digest",
);
assert(
  /read the raw body under a strict size limit/.test(tsSql) &&
    /reject stale timestamps/.test(tsSql) &&
    /constant-time comparison/.test(tsSql) &&
    /writing NOTHING to the database/.test(tsSql),
  "the handler contract requires size-limited raw read, stale-timestamp rejection and constant-time verification BEFORE any database write",
);

// --- Upload method contract: providers do not share one HTTP method --------

assert(
  /POST multipart\/form-data to the one-time upload URL/.test(tsSql),
  "Images upload is documented as POST multipart/form-data, not PUT",
);
assert(
  /It is NOT a PUT/.test(tsSql),
  "the contract explicitly rules out PUT for the Images upload",
);
assert(
  /basic upload\s+-> the provider's documented multipart POST/.test(tsSql) &&
    /resumable\s+-> the TUS protocol/.test(tsSql),
  "Stream basic vs resumable upload methods are documented separately",
);
assert(
  /MUST NOT build a generic upload helper that assumes PUT/.test(tsSql),
  "a generic PUT-assuming upload helper is explicitly forbidden",
);
assert(
  !/phone (PUTs|puts) the/.test(tsSql),
  "no statement claims the phone PUTs the captured file",
);

// --- Provider/media-type aware trusted metadata ----------------------------

assert(
  /provider_draft_cleared_at\s+timestamptz/.test(tsSql) &&
    /provider_signed_urls_required boolean not null default false/.test(tsSql),
  "every valid asset must be out of draft with signed delivery required",
);
assert(
  /constraint testimonial_valid_requires_provider_evidence/.test(tsSql),
  "a CHECK encodes provider/media-type aware validity",
);
const validityCheck = tsSql.slice(
  tsSql.indexOf("constraint testimonial_valid_requires_provider_evidence"),
  tsSql.indexOf("-- Both attestations are mandatory"),
);
assert(
  /media_type = 'image'[\s\S]{0,40}or \(media_type = 'video'/.test(validityCheck),
  "an IMAGE can become valid without size/MIME/dimension fields Images never exposes",
);
for (const f of ["validated_duration_seconds", "validated_size_bytes", "validated_width", "validated_height"]) {
  assert(
    new RegExp(`${f} is not null`).test(validityCheck),
    `a VIDEO must carry trusted ${f} that Stream documents`,
  );
}
assert(
  !/new\.detected_mime_type is null/.test(tsSql),
  "detected_mime_type is no longer required for eligibility (Images does not expose it)",
);
assert(
  /a video is not moderation-eligible without the trusted duration, size and dimensions/.test(tsSql),
  "the moderation gate enforces video-specific trusted metadata",
);

// --- Cost baseline documented with minimum billing increments -------------

assert(
  /purchased in MINIMUM BILLING INCREMENTS/.test(tsSql),
  "the cost note states that both storage products have minimum billing increments",
);
for (const figure of ["$5 per 100,000 stored images", "$1 per 100,000 delivered images",
                      "$5 per 1,000 stored minutes", "$1 per 1,000 delivered minutes",
                      "~$11.60/month", "$10-15/month"]) {
  assert(tsSql.includes(figure), `cost baseline documents ${figure}`);
}

// Protection functions and the strict bypass.
for (const fn of ["protect_testimonial_insert", "protect_testimonial_update", "protect_testimonial_deletion"]) {
  assert(new RegExp(`create or replace function public\\.${fn}\\(\\)`).test(tsSql), `${fn}() is defined`);
  assert(
    new RegExp(`revoke execute on function public\\.${fn}\\(\\)[\\s\\S]{0,80}from public, anon, authenticated`).test(tsSql),
    `direct EXECUTE on ${fn}() is revoked`,
  );
}
assert(
  (tsSql.match(/auth\.role\(\) = 'service_role' or auth\.role\(\) is null/g) || []).length === 3,
  "all three testimonial protection functions use the strict auth.role() bypass",
);
assert(!/auth\.uid\(\) is null/i.test(tsSql), "the rejected auth.uid() IS NULL bypass is never used");
const tsRaises = [...tsSql.matchAll(/raise exception[\s\S]*?;/g)].filter((m) =>
  /immutable|trusted component|trusted server|self-reported|server-controlled|transition|moderation-eligible|deleted through|caption can only|conclusive|requires a completed provider|before a trusted delivery|recorded consent/.test(m[0]),
);
assert(
  tsRaises.length >= 12 && tsRaises.every((m) => /errcode = '42501'/.test(m[0])),
  `every authorization/lifecycle RAISE EXCEPTION uses SQLSTATE 42501 (found ${tsRaises.length})`,
);
for (const trg of [
  "testimonial_submissions_00_protect_insert",
  "testimonial_submissions_00_protect_update",
  "testimonial_submissions_00_protect_deletion",
]) {
  assert(new RegExp(`create trigger ${trg}\\b`).test(tsSql), `${trg} trigger is created`);
  assert(
    trg < "testimonial_submissions_enforce_client_consistency",
    `${trg} sorts before the consistency trigger (deterministic 42501)`,
  );
}

// --- Corrective migration: testimonial privileges --------------------------
// Supabase grants a broad default privilege set on new public-schema objects to
// anon/authenticated. 20260817160000 revoked on the base table and granted
// SELECT on the views, but never revoked those inherited defaults - leaving
// TRUNCATE on the base table and full access on all three views.

const privMigrationFile = "20260817193000_protect_testimonial_privileges.sql";
assert(files.includes(privMigrationFile), `the testimonial privilege correction exists (${privMigrationFile})`);

const privSql = files.includes(privMigrationFile)
  ? readFileSync(join(migrationsDir, privMigrationFile), "utf8")
  : "";

for (const obj of [
  "testimonial_submissions",
  "testimonial_processing_events",
  "testimonial_gallery_items",
  "testimonial_my_submissions",
  "testimonial_moderation_queue",
]) {
  assert(
    new RegExp(`revoke all on public\\.${obj}\\s+from public, anon, authenticated`).test(privSql),
    `ALL privileges are revoked from public/anon/authenticated on ${obj}`,
  );
}
assert(
  /grant select on public\.testimonial_gallery_items to anon, authenticated/.test(privSql),
  "the gallery view is re-granted SELECT to anon and authenticated",
);
assert(
  /grant select on public\.testimonial_my_submissions to authenticated/.test(privSql) &&
    !/grant select on public\.testimonial_my_submissions to [^;]*anon/.test(privSql),
  "my_submissions is re-granted SELECT to authenticated only, never anon",
);
assert(
  !/grant [\s\S]{0,80}on public\.testimonial_moderation_queue to/.test(privSql),
  "the moderation queue is re-granted to NO browser role",
);
assert(
  /grant insert on public\.testimonial_submissions to authenticated/.test(privSql) &&
    /grant update \(caption\) on public\.testimonial_submissions to authenticated/.test(privSql),
  "the base table keeps only INSERT and column-level UPDATE(caption) for authenticated",
);
assert(
  !/grant[^;]*\b(truncate|references|trigger)\b[^;]*on public\.testimonial/i.test(privSql),
  "TRUNCATE/REFERENCES/TRIGGER are never re-granted on any testimonial object",
);
assert(
  /alter view public\.testimonial_gallery_items\s+set \(security_barrier = true\)/.test(privSql) &&
    /alter view public\.testimonial_my_submissions set \(security_barrier = true\)/.test(privSql),
  "both browser-readable views are hardened with security_barrier",
);
assert(
  !/create table|drop table|drop view|alter table public\.testimonial_submissions (add|drop) column/i.test(privSql),
  "the correction changes privileges only - it does not alter the applied schema",
);
assert(
  /TRUNCATE is not subject to RLS[\s\S]{0,60}does not[\s\S]{0,40}fire/i.test(privSql),
  "the migration records why TRUNCATE was the severe part of the finding",
);

// --- Moderation provenance RPC ---------------------------------------------
// 20260817160000 revoked browser UPDATE, so moderation could only run as
// service_role - where auth.uid() is NULL and reviewed_by would always be lost.
// The fix keeps reviewed_by := auth.uid() as the ONLY writer of that column and
// makes the real administrator's JWT the calling context instead.

const rpcMigrationFile = "20260817193500_add_testimonial_moderation_rpc.sql";
assert(files.includes(rpcMigrationFile), `the moderation RPC migration exists (${rpcMigrationFile})`);

const rpcSql = files.includes(rpcMigrationFile)
  ? readFileSync(join(migrationsDir, rpcMigrationFile), "utf8")
  : "";

assert(
  /create or replace function public\.moderate_testimonial_submission\(/.test(rpcSql),
  "moderate_testimonial_submission() is defined",
);
assert(/security definer/.test(rpcSql), "the RPC is SECURITY DEFINER");
assert(
  /set search_path = public, pg_catalog/.test(rpcSql),
  "the RPC pins a fixed safe search_path",
);
assert(
  /revoke all on function public\.moderate_testimonial_submission[\s\S]{0,160}from public, anon/.test(rpcSql),
  "EXECUTE is revoked from PUBLIC and anon",
);
assert(
  /grant execute on function public\.moderate_testimonial_submission[\s\S]{0,160}to authenticated/.test(rpcSql),
  "EXECUTE is granted only to authenticated",
);

// Parameter surface: decisions and notes only.
const rpcSig = rpcSql.slice(
  rpcSql.indexOf("create or replace function public.moderate_testimonial_submission("),
  rpcSql.indexOf("returns table"),
);
for (const forbidden of [
  "reviewed_by", "client_id", "experience_id", "experience_user_id", "auth_user_id",
  "provider", "validation", "upload", "published_at", "media_deleted_at",
]) {
  assert(
    !new RegExp(`\\b${forbidden}\\b`).test(rpcSig),
    `the RPC signature never accepts ${forbidden}`,
  );
}
assert(
  /p_submission_id\s+uuid/.test(rpcSig) && /p_decision\s+public\.testimonial_moderation_status/.test(rpcSig),
  "the RPC takes a submission id and a typed decision",
);

// Authorization inside the function.
assert(
  /if auth\.uid\(\) is null then[\s\S]{0,200}errcode = '42501'/.test(rpcSql),
  "the RPC rejects a null auth.uid()",
);
assert(
  /is_anonymous[\s\S]{0,300}anonymous identities cannot moderate/.test(rpcSql),
  "the RPC rejects anonymous Supabase identities",
);
assert(
  /can_view_experience_user_pii\(v_client_id\) or public\.is_platform_admin\(\)/.test(rpcSql),
  "authorization uses the owner/admin PII boundary, so editors and viewers are excluded",
);
assert(
  /select s\.client_id into v_client_id/.test(rpcSql),
  "the tenant is resolved internally from the submission, never supplied by the caller",
);
assert(
  /p_decision not in \('approved', 'rejected', 'removed'\)/.test(rpcSql),
  "only approved/rejected/removed are accepted - pending is never a decision",
);
assert(
  /v_client_id is null\s*\n\s*or not \(public\.can_view_experience_user_pii/.test(rpcSql),
  "absent and unauthorized return the SAME error, so the RPC cannot probe which ids exist",
);

// The update itself writes exactly three fields on exactly one row.
const rpcUpdate = rpcSql.slice(rpcSql.indexOf("update public.testimonial_submissions s"), rpcSql.indexOf("returning s.id"));
assert(
  /set moderation_status = p_decision/.test(rpcUpdate) &&
    /moderation_note   = coalesce\(p_moderation_note/.test(rpcUpdate) &&
    /rejection_reason  = coalesce\(p_rejection_reason/.test(rpcUpdate),
  "the RPC writes exactly moderation_status, moderation_note and rejection_reason",
);
assert(
  !/reviewed_by\s*=/.test(rpcUpdate),
  "the RPC never writes reviewed_by - the trigger does, from auth.uid()",
);
assert(
  /where s\.id = p_submission_id/.test(rpcUpdate),
  "the RPC updates only the exact submission id",
);

// Provenance remains database-written and unsuppliable.
assert(
  /new\.reviewed_by := auth\.uid\(\)/.test(rpcSql),
  "the superseded trigger still sets reviewed_by from auth.uid() unconditionally",
);
assert(
  !/new\.reviewed_by := coalesce/.test(rpcSql),
  "no caller-supplied reviewer is ever preserved",
);
assert(
  /moderator := \(not trusted\)[\s\S]{0,200}can_view_experience_user_pii/.test(rpcSql),
  "the trigger gains a moderator tier scoped to owner/admin of the row's tenant",
);
assert(
  /physical deletion is recorded only by the trusted deletion tier/.test(rpcSql),
  "a moderator still cannot record physical deletion",
);
assert(
  /create or replace function public\.protect_testimonial_update/.test(rpcSql) &&
    !/drop trigger[\s\S]{0,80}testimonial_submissions_00_protect_update/.test(rpcSql),
  "the guard is superseded with CREATE OR REPLACE, not dropped or edited in place",
);

// --- Profile privilege hardening -------------------------------------------
// The Phase 2.5A audit found public.profiles carrying Supabase's inherited
// default privileges: anon and authenticated held DELETE, INSERT, REFERENCES,
// SELECT, TRIGGER, TRUNCATE and UPDATE, with column-level UPDATE reaching
// is_platform_admin. The escalation trigger was the only barrier, and the
// UPDATE policy had no WITH CHECK.

const profileMigrationFile = "20260818094500_protect_profile_privileges.sql";
assert(files.includes(profileMigrationFile), `the profile privilege migration exists (${profileMigrationFile})`);

const profSql = files.includes(profileMigrationFile)
  ? readFileSync(join(migrationsDir, profileMigrationFile), "utf8")
  : "";

assert(
  /revoke all on public\.profiles from public, anon, authenticated;/.test(profSql),
  "inherited default privileges are revoked from public, anon AND authenticated",
);
assert(
  /grant select on public\.profiles to anon, authenticated;/.test(profSql),
  "SELECT is re-granted, so the existing profile read policy keeps working",
);
assert(
  /grant update \(display_name, avatar_url\) on public\.profiles to authenticated;/.test(profSql),
  "UPDATE is re-granted as COLUMN privileges on display_name and avatar_url only",
);
assert(
  !/grant update[^;]*is_platform_admin/.test(profSql),
  "is_platform_admin is never re-granted to any browser role",
);
assert(
  !/grant (insert|delete|truncate|references|trigger)[^;]*on public\.profiles/i.test(profSql),
  "INSERT, DELETE, TRUNCATE, REFERENCES and TRIGGER are never re-granted on profiles",
);
assert(
  !/\bto (anon|authenticated|public)\b[^;]*\bmaintain\b/i.test(profSql) && !/grant maintain/i.test(profSql),
  "MAINTAIN is never granted to a browser role",
);
// Strip -- comments AND `comment on ... ;` statements. Both legitimately
// mention service_role and handle_new_user in prose; what must be absent is a
// PRIVILEGE statement naming service_role, or any redefinition of the trigger
// function.
const profExec = profSql
  .replace(/--[^\n]*/g, "")
  .replace(/comment on [\s\S]*?;/gi, "");

assert(
  !/\b(grant|revoke|alter)\b[^;]*service_role/i.test(profExec),
  "no grant, revoke or alter statement names service_role, so its trusted access is untouched",
);
assert(
  !/(create|drop|alter)\s+(or replace\s+)?function[^;]*handle_new_user/i.test(profExec) &&
    !/(create|drop)\s+trigger[^;]*handle_new_user/i.test(profExec),
  "handle_new_user() is neither redefined nor detached",
);

// The UPDATE policy gains its missing half.
assert(
  /drop policy if exists profiles_update_own on public\.profiles;/.test(profSql),
  "the old UPDATE policy is superseded explicitly",
);
assert(
  /create policy profiles_update_own on public\.profiles[\s\S]{0,200}using \(id = auth\.uid\(\)\)[\s\S]{0,80}with check \(id = auth\.uid\(\)\)/.test(profSql),
  "the replacement policy has BOTH using and with check on id = auth.uid()",
);
assert(
  /create policy profiles_update_own on public\.profiles\s*\n\s*for update\s*\n\s*to authenticated\b/.test(profSql),
  "the replacement policy is scoped TO authenticated, not left applying to PUBLIC",
);
assert(
  !/create policy profiles_update_own[\s\S]{0,200}\bto (public|anon)\b/i.test(profSql),
  "the policy is never granted to public or anon",
);

// TRUNCATE hardening across exactly the audited tables.
const TRUNCATE_TABLES = [
  "brand_settings", "choices", "client_memberships", "clients", "content_nodes",
  "engagement_events", "experience_user_rewards", "experience_users", "experiences",
  "journey_progress", "media_assets", "pathways", "profiles", "publication_versions",
];
const revokeBlock = profSql.slice(profSql.indexOf("revoke truncate on"));
for (const t of TRUNCATE_TABLES) {
  assert(
    new RegExp(`public\\.${t}\\b`).test(revokeBlock),
    `TRUNCATE is revoked on public.${t}`,
  );
}
assert(
  /revoke truncate on[\s\S]*?from public, anon, authenticated;/.test(profSql),
  "TRUNCATE is revoked from public, anon AND authenticated",
);
assert(
  TRUNCATE_TABLES.length === 14,
  "the revoke covers exactly the 14 audited tables",
);
assert(
  !/revoke (select|insert|update|delete)[^;]*on\s+public\.(brand_settings|choices|clients|content_nodes|engagement_events|experience_user_rewards|experience_users|experiences|journey_progress|media_assets|pathways|publication_versions)/i.test(profSql),
  "no verb other than TRUNCATE is altered on the other 13 tables",
);

console.log(`\n${files.length} migration files checked.`);
if (failed > 0) {
  console.error(`\n${failed} check(s) FAILED.`);
  process.exit(1);
}
console.log("\nAll structural checks passed.");
