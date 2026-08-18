-- ============================================================================
-- RetailExp administrator authorization — database-layer verification.
--
-- Verification gate for lib/auth/admin.ts. That helper resolves administrator
-- access from three database facts:
--
--   1. auth.users.is_anonymous
--   2. profiles.is_platform_admin
--   3. a client_memberships row for the Kameleon client whose role is
--      'owner' or 'admin'
--
-- This file asserts those facts behave as the helper assumes, against the real
-- schema and real RLS, for every identity class the helper distinguishes. It
-- does NOT execute the TypeScript helper — see scripts/verify-admin-auth.mjs
-- for the structural half, and note that neither file can prove browser
-- behaviour.
--
-- HOW TO RUN
--   Paste the whole file into a NEW Supabase SQL Editor query and run it.
--   One transaction, ending in ROLLBACK — no fixture survives.
--   Results appear as RAISE NOTICE lines and as a grid from the SELECT just
--   before the ROLLBACK. If no grid appears, run up to and including that
--   SELECT, read it, then run ROLLBACK on its own.
--
-- SAFETY
--   Only fixture rows under fixed 0000...-prefixed UUIDs are touched. No real
--   client, experience, visitor or membership is read, written or deleted, and
--   no password, hash, key or token appears anywhere in this file.
--   encrypted_password is set to '' — these fixtures cannot be signed in to.
-- ============================================================================

begin;

create temporary table _aa_check_results (
  seq        serial primary key,
  section    text not null,
  check_name text not null,
  expected   text not null,
  actual     text not null,
  passed     boolean not null
) on commit drop;

-- Narrow SECURITY DEFINER, same rationale as the testimonial suite: sections
-- below switch to authenticated/anon so RLS is genuinely enforced, and those
-- roles hold no INSERT on this ambient-owned temp table. Only the bookkeeping
-- is elevated, and only after the tested statement has run. The collector is
-- referenced as pg_temp._aa_check_results explicitly — an unqualified name
-- does not reliably resolve inside a SECURITY DEFINER function's context.
create or replace function pg_temp.record(
  p_section text, p_check text, p_expected text, p_actual text
) returns void
language plpgsql
security definer
set search_path = pg_temp, pg_catalog
as $$
begin
  insert into pg_temp._aa_check_results (section, check_name, expected, actual, passed)
  values (p_section, p_check, p_expected, p_actual, p_expected is not distinct from p_actual);
  raise notice '[%] % | expected=% actual=% | %',
    p_section, p_check, p_expected, p_actual,
    case when p_expected is not distinct from p_actual then 'PASS' else 'FAIL' end;
end $$;

create or replace function pg_temp.note(p_section text, p_check text, p_value text)
returns void
language plpgsql
security definer
set search_path = pg_temp, pg_catalog
as $$
begin
  insert into pg_temp._aa_check_results (section, check_name, expected, actual, passed)
  values (p_section, p_check, p_value, p_value, true);
  raise notice '[%] % | %', p_section, p_check, p_value;
end $$;

create or replace function pg_temp.act_as(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user::text, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  execute 'set local role authenticated';
end $$;

create or replace function pg_temp.act_as_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('role','anon')::text, true);
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.role', 'anon', true);
  execute 'set local role anon';
end $$;

create or replace function pg_temp.act_as_ambient() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.role', '', true);
end $$;

-- Needed for exactly one fixture write.
--
-- public.protect_platform_admin_flag() raises 42501 on any change to
-- is_platform_admin unless auth.role() = 'service_role'. Under the ambient
-- SQL Editor role the JWT claims are empty, so auth.role() is NULL, the
-- guard does not match, and the exception fires — which would abort this
-- whole transaction during setup rather than in a test. Claiming the
-- service role for that single statement is also the faithful simulation:
-- in production the flag is only ever set by a trusted server operation.
-- The Postgres role is NOT switched, only the claim the trigger reads.
create or replace function pg_temp.act_as_service_role() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('role','service_role')::text, true);
  perform set_config('request.jwt.claim.role', 'service_role', true);
  perform set_config('request.jwt.claim.sub', '', true);
end $$;

-- ---------------------------------------------------------------------------
-- Exact-SQLSTATE probe.
--
-- Runs a statement as the CURRENT simulated caller (SECURITY INVOKER, so the
-- role and JWT claims set by act_as* apply) and records precisely what came
-- back: 'ALLOWED' when the statement unexpectedly succeeded, or
-- 'blocked-<sqlstate>' carrying the real SQLSTATE. Because the expectation is
-- compared literally, a statement blocked by the WRONG error fails the check
-- just as loudly as one that was not blocked at all. This replaces an earlier
-- handler that collapsed every exception to 'blocked'.
-- ---------------------------------------------------------------------------
create or replace function pg_temp.try_sql(p_section text, p_label text, p_expected text, p_sql text)
returns void language plpgsql as $$
declare outcome text;
begin
  begin
    execute p_sql;
    outcome := 'ALLOWED';
  exception when others then
    outcome := 'blocked-' || sqlstate;
  end;
  perform pg_temp.record(p_section, p_label, p_expected, outcome);
end $$;

-- ---------------------------------------------------------------------------
-- auth.users is not readable by the `authenticated` role, so the anonymity
-- lookup is isolated into a SECURITY DEFINER function — the same shape
-- moderate_testimonial_submission() uses for exactly the same reason. In the
-- application this fact arrives from GoTrue via getUser(), not from SQL; this
-- is the closest faithful equivalent.
-- ---------------------------------------------------------------------------
create or replace function pg_temp.is_anonymous_identity(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce((select u.is_anonymous from auth.users u where u.id = p_user), false);
$$;

-- ---------------------------------------------------------------------------
-- The authorization rule under test, expressed exactly as lib/auth/admin.ts
-- expresses it. Kept in one place so a drift between this file and the helper
-- is a single visible edit rather than a scattered one.
--
-- Deliberately NOT security definer: the membership read must see precisely
-- what the calling identity can see, because part of what is being verified
-- is that RLS does not hand one tenant's membership to another.
-- ---------------------------------------------------------------------------
create or replace function pg_temp.admin_access(p_client uuid)
returns text
language plpgsql
as $$
declare
  v_uid       uuid := auth.uid();
  v_anonymous boolean;
  v_platform  boolean;
  v_role      text;
begin
  if v_uid is null then return 'unauthenticated'; end if;

  -- Mirrors the helper's strict `=== true`: an absent flag must not be read
  -- as "not anonymous" by accident.
  select pg_temp.is_anonymous_identity(v_uid) into v_anonymous;
  if v_anonymous is true then return 'anonymous'; end if;

  select public.is_platform_admin() into v_platform;
  if v_platform is true then return 'authorized:platform-admin'; end if;

  select m.role::text into v_role
  from public.client_memberships m
  where m.client_id = p_client and m.user_id = v_uid;

  if v_role is null then return 'no-membership'; end if;
  if v_role in ('owner','admin') then return 'authorized:' || v_role; end if;
  return 'insufficient-role:' || v_role;
end $$;

-- ===========================================================================
-- PRE-FLIGHT — the previous run left nothing behind
--
-- Read-only, and deliberately BEFORE any fixture is written. The suite is a
-- single transaction ending in ROLLBACK, so a prior run should be invisible
-- here; this proves it rather than assuming it. If any of these report a
-- non-zero count, a previous run committed when it should not have, and the
-- results below would be standing on dirty state.
-- ===========================================================================
select pg_temp.act_as_ambient();

do $$
declare n int;
begin
  select count(*) into n from auth.users
  where id::text like '00000000-0000-4000-8000-0000000000f%';
  perform pg_temp.record('0 preflight', 'no fixture auth.users rows survive from a prior run', '0', n::text);

  select count(*) into n from public.testimonial_submissions
  where id::text like '00000000-0000-4000-8000-00000000f%';
  perform pg_temp.record('0 preflight', 'no fixture submissions survive from a prior run', '0', n::text);

  select count(*) into n from public.clients
  where id::text like '00000000-0000-4000-8000-00000000c%';
  perform pg_temp.record('0 preflight', 'no fixture clients survive from a prior run', '0', n::text);

  select count(*) into n from public.experiences
  where id::text like '00000000-0000-4000-8000-00000000e%';
  perform pg_temp.record('0 preflight', 'no fixture experiences survive from a prior run', '0', n::text);

  select count(*) into n from public.experience_users
  where id::text like '00000000-0000-4000-8000-00000000d%';
  perform pg_temp.record('0 preflight', 'no fixture enrollments survive from a prior run', '0', n::text);

  -- The consent registry must be genuinely empty in the real database: the
  -- migration ships it empty so capture fails closed, and section 17 writes
  -- test rows into it. A survivor here would be both residue AND a live
  -- legal-gate change.
  select count(*) into n from public.consent_document_versions;
  perform pg_temp.record('0 preflight', 'the consent registry is empty before fixtures', '0', n::text);
end $$;

-- ===========================================================================
-- FIXTURES
-- ===========================================================================
select pg_temp.act_as_ambient();

insert into auth.users
  (id, instance_id, aud, role, email, encrypted_password,
   email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
values
  -- Anonymous Kameleon visitor. Carries the `authenticated` role, which is
  -- exactly why "is the user authenticated" is not an authorization test.
  ('00000000-0000-4000-8000-0000000000f1','00000000-0000-0000-0000-000000000000','authenticated','authenticated','aa-visitor@example.com','', now(), now(), now(), '{}', '{}'),
  ('00000000-0000-4000-8000-0000000000f2','00000000-0000-0000-0000-000000000000','authenticated','authenticated','aa-owner@example.com','',   now(), now(), now(), '{}', '{}'),
  ('00000000-0000-4000-8000-0000000000f3','00000000-0000-0000-0000-000000000000','authenticated','authenticated','aa-admin@example.com','',   now(), now(), now(), '{}', '{}'),
  ('00000000-0000-4000-8000-0000000000f4','00000000-0000-0000-0000-000000000000','authenticated','authenticated','aa-editor@example.com','',  now(), now(), now(), '{}', '{}'),
  ('00000000-0000-4000-8000-0000000000f5','00000000-0000-0000-0000-000000000000','authenticated','authenticated','aa-viewer@example.com','',  now(), now(), now(), '{}', '{}'),
  ('00000000-0000-4000-8000-0000000000f6','00000000-0000-0000-0000-000000000000','authenticated','authenticated','aa-nomember@example.com','',now(), now(), now(), '{}', '{}'),
  ('00000000-0000-4000-8000-0000000000f7','00000000-0000-0000-0000-000000000000','authenticated','authenticated','aa-crossowner@example.com','', now(), now(), now(), '{}', '{}'),
  ('00000000-0000-4000-8000-0000000000f8','00000000-0000-0000-0000-000000000000','authenticated','authenticated','aa-platform@example.com','',now(), now(), now(), '{}', '{}');

update auth.users set is_anonymous = true where id = '00000000-0000-4000-8000-0000000000f1';

-- profiles rows are created by the handle_new_user trigger; ensure they exist
-- either way so the platform-admin flag has somewhere to live.
insert into public.profiles (id, display_name)
select u.id, 'AA fixture'
from auth.users u
where u.id::text like '00000000-0000-4000-8000-0000000000f%'
on conflict (id) do nothing;

-- Guarded by protect_platform_admin_flag(); see act_as_service_role() above.
select pg_temp.act_as_service_role();

update public.profiles set is_platform_admin = true
where id = '00000000-0000-4000-8000-0000000000f8';

select pg_temp.act_as_ambient();

-- Two tenants: one standing in for Kameleon, one for an unrelated client, so
-- cross-tenant access is tested against a membership that genuinely exists
-- rather than against an absent row.
insert into public.clients (id, slug, name, status) values
  ('00000000-0000-4000-8000-00000000ca01','aa-fixture-kameleon','AA Fixture Kameleon','active'),
  ('00000000-0000-4000-8000-00000000cb01','aa-fixture-other','AA Fixture Other','active');

insert into public.client_memberships (client_id, user_id, role) values
  ('00000000-0000-4000-8000-00000000ca01','00000000-0000-4000-8000-0000000000f2','owner'),
  ('00000000-0000-4000-8000-00000000ca01','00000000-0000-4000-8000-0000000000f3','admin'),
  ('00000000-0000-4000-8000-00000000ca01','00000000-0000-4000-8000-0000000000f4','editor'),
  ('00000000-0000-4000-8000-00000000ca01','00000000-0000-4000-8000-0000000000f5','viewer'),
  -- Owner of the OTHER tenant. Fully privileged there, nothing here.
  ('00000000-0000-4000-8000-00000000cb01','00000000-0000-4000-8000-0000000000f7','owner');

-- ===========================================================================
-- SECTION 1 — the authorization decision, one identity class at a time
-- ===========================================================================
do $$
declare
  k uuid := '00000000-0000-4000-8000-00000000ca01';
  r text;
begin
  -- Signed out entirely.
  perform pg_temp.act_as_anon();
  select pg_temp.admin_access(k) into r;
  perform pg_temp.record('1 decision', 'signed-out user is unauthenticated', 'unauthenticated', r);

  -- Anonymous Kameleon visitor. The single most important row in this file:
  -- this identity holds the `authenticated` Postgres role.
  perform pg_temp.act_as('00000000-0000-4000-8000-0000000000f1');
  select pg_temp.admin_access(k) into r;
  perform pg_temp.record('1 decision', 'anonymous Kameleon visitor is rejected', 'anonymous', r);

  perform pg_temp.act_as('00000000-0000-4000-8000-0000000000f2');
  select pg_temp.admin_access(k) into r;
  perform pg_temp.record('1 decision', 'same-client owner is authorized', 'authorized:owner', r);

  perform pg_temp.act_as('00000000-0000-4000-8000-0000000000f3');
  select pg_temp.admin_access(k) into r;
  perform pg_temp.record('1 decision', 'same-client admin is authorized', 'authorized:admin', r);

  perform pg_temp.act_as('00000000-0000-4000-8000-0000000000f4');
  select pg_temp.admin_access(k) into r;
  perform pg_temp.record('1 decision', 'editor is denied', 'insufficient-role:editor', r);

  perform pg_temp.act_as('00000000-0000-4000-8000-0000000000f5');
  select pg_temp.admin_access(k) into r;
  perform pg_temp.record('1 decision', 'viewer is denied', 'insufficient-role:viewer', r);

  perform pg_temp.act_as('00000000-0000-4000-8000-0000000000f6');
  select pg_temp.admin_access(k) into r;
  perform pg_temp.record('1 decision', 'permanent account with no membership is denied', 'no-membership', r);

  perform pg_temp.act_as('00000000-0000-4000-8000-0000000000f7');
  select pg_temp.admin_access(k) into r;
  perform pg_temp.record('1 decision', 'cross-tenant owner is denied on this client', 'no-membership', r);

  perform pg_temp.act_as('00000000-0000-4000-8000-0000000000f8');
  select pg_temp.admin_access(k) into r;
  perform pg_temp.record('1 decision', 'platform admin is authorized without a membership', 'authorized:platform-admin', r);

  -- ...and the cross-tenant owner IS still an owner of their own client, so
  -- the denial above is scoping, not a broken fixture.
  perform pg_temp.act_as('00000000-0000-4000-8000-0000000000f7');
  select pg_temp.admin_access('00000000-0000-4000-8000-00000000cb01') into r;
  perform pg_temp.record('1 decision', 'cross-tenant owner IS authorized on their own client', 'authorized:owner', r);
end $$;

-- ===========================================================================
-- SECTION 2 — RLS: a membership row must not leak across tenants
-- ===========================================================================
do $$
declare n int;
begin
  perform pg_temp.act_as('00000000-0000-4000-8000-0000000000f7');
  select count(*) into n from public.client_memberships
  where client_id = '00000000-0000-4000-8000-00000000ca01';
  perform pg_temp.record('2 rls', 'cross-tenant owner sees zero Kameleon memberships', '0', n::text);

  perform pg_temp.act_as('00000000-0000-4000-8000-0000000000f2');
  select count(*) into n from public.client_memberships
  where client_id = '00000000-0000-4000-8000-00000000ca01';
  perform pg_temp.record('2 rls', 'same-client owner can read the client roster', '4', n::text);

  -- The helper only ever needs the caller's OWN row; confirm that specific
  -- read works, since the whole authorization path depends on it.
  perform pg_temp.act_as('00000000-0000-4000-8000-0000000000f5');
  select count(*) into n from public.client_memberships
  where client_id = '00000000-0000-4000-8000-00000000ca01'
    and user_id = '00000000-0000-4000-8000-0000000000f5';
  perform pg_temp.record('2 rls', 'a viewer can still read their own membership row', '1', n::text);

  perform pg_temp.act_as('00000000-0000-4000-8000-0000000000f6');
  select count(*) into n from public.client_memberships;
  perform pg_temp.record('2 rls', 'a member of nothing sees no memberships at all', '0', n::text);

  perform pg_temp.act_as_anon();
  select count(*) into n from public.client_memberships;
  perform pg_temp.record('2 rls', 'anon role sees no memberships', '0', n::text);

  perform pg_temp.act_as('00000000-0000-4000-8000-0000000000f1');
  select count(*) into n from public.client_memberships;
  perform pg_temp.record('2 rls', 'anonymous visitor sees no memberships', '0', n::text);
end $$;

-- ===========================================================================
-- SECTION 3 — privilege escalation attempts
-- ===========================================================================
do $$
declare
  k uuid := '00000000-0000-4000-8000-00000000ca01';
  ok text;
begin
  -- A viewer promoting themselves would defeat the entire role check.
  perform pg_temp.act_as('00000000-0000-4000-8000-0000000000f5');
  begin
    update public.client_memberships set role = 'owner'
    where client_id = k and user_id = '00000000-0000-4000-8000-0000000000f5';
    ok := case when found then 'promoted' else 'blocked' end;
  exception when insufficient_privilege or others then
    ok := 'blocked';
  end;
  perform pg_temp.record('3 escalation', 'viewer cannot promote themselves to owner', 'blocked', ok);

  -- Inserting a fresh membership for oneself is the same attack by another
  -- route, and is what a non-member would try.
  --
  -- Expected 42501. Determined from the live schema rather than assumed:
  -- `authenticated` DOES hold INSERT on client_memberships, so the grant is
  -- not the barrier — the barrier is client_memberships_insert_admins, whose
  -- WITH CHECK is `can_manage_members(client_id) or is_platform_admin()`.
  -- PostgreSQL raises a row-level-security violation as
  -- ERRCODE_INSUFFICIENT_PRIVILEGE = 42501. Had the grant been absent instead,
  -- "permission denied for table" is also 42501, so this expectation is
  -- correct under either barrier and wrong under any other error.
  perform pg_temp.act_as('00000000-0000-4000-8000-0000000000f6');
  perform pg_temp.try_sql('3 escalation',
    'non-member cannot grant themselves a membership',
    'blocked-42501',
    $q$insert into public.client_memberships (client_id, user_id, role)
       values ('00000000-0000-4000-8000-00000000ca01',
               '00000000-0000-4000-8000-0000000000f6', 'owner')$q$);

  -- An anonymous visitor doing the same.
  perform pg_temp.act_as('00000000-0000-4000-8000-0000000000f1');
  perform pg_temp.try_sql('3 escalation',
    'anonymous visitor cannot grant themselves a membership',
    'blocked-42501',
    $q$insert into public.client_memberships (client_id, user_id, role)
       values ('00000000-0000-4000-8000-00000000ca01',
               '00000000-0000-4000-8000-0000000000f1', 'admin')$q$);

  -- Setting the platform-admin flag on one's own profile would bypass
  -- membership entirely.
  --
  -- Expected 42501 both before and after 20260818094500: today the BEFORE
  -- UPDATE trigger protect_platform_admin_flag() raises 42501 explicitly;
  -- after that migration the column privilege is also absent, and a missing
  -- column privilege is 42501 too. The exact code is asserted either way.
  perform pg_temp.act_as('00000000-0000-4000-8000-0000000000f6');
  perform pg_temp.try_sql('3 escalation',
    'a user cannot make themselves a platform admin',
    'blocked-42501',
    $q$update public.profiles set is_platform_admin = true
       where id = '00000000-0000-4000-8000-0000000000f6'$q$);

  -- ...and the flag really is still false afterwards, not merely un-erroring.
  perform pg_temp.act_as_ambient();
  perform pg_temp.record('3 escalation', 'the platform-admin flag is still false after the attempt', 'false',
    (select coalesce(p.is_platform_admin,false)::text from public.profiles p
     where p.id = '00000000-0000-4000-8000-0000000000f6'));
end $$;

-- ===========================================================================
-- SECTION 4 — is_platform_admin() behaves as the helper assumes
-- ===========================================================================
do $$
declare b boolean;
begin
  perform pg_temp.act_as('00000000-0000-4000-8000-0000000000f8');
  select public.is_platform_admin() into b;
  perform pg_temp.record('4 platform', 'is_platform_admin() true for the flagged profile', 'true', coalesce(b::text,'null'));

  perform pg_temp.act_as('00000000-0000-4000-8000-0000000000f2');
  select public.is_platform_admin() into b;
  perform pg_temp.record('4 platform', 'is_platform_admin() false for a mere client owner', 'false', coalesce(b::text,'null'));

  perform pg_temp.act_as('00000000-0000-4000-8000-0000000000f1');
  select public.is_platform_admin() into b;
  perform pg_temp.record('4 platform', 'is_platform_admin() false for an anonymous visitor', 'false', coalesce(b::text,'null'));

  perform pg_temp.act_as_anon();
  select public.is_platform_admin() into b;
  perform pg_temp.record('4 platform', 'is_platform_admin() false with no identity', 'false', coalesce(b::text,'null'));
end $$;

-- ===========================================================================
-- SECTION 5 — real-world state at the time of running
-- ===========================================================================
do $$
declare n int; t text;
begin
  perform pg_temp.act_as_ambient();

  select count(*) into n from public.client_memberships
  where client_id::text not like '00000000-0000-4000-8000-%';
  perform pg_temp.note('5 live', 'real (non-fixture) membership rows', n::text);

  select count(*) into n from auth.users
  where coalesce(is_anonymous,false) = false
    and id::text not like '00000000-0000-4000-8000-%';
  perform pg_temp.note('5 live', 'real non-anonymous identities', n::text);

  -- The Kameleon client the application actually resolves by slug.
  select c.id::text into t from public.clients c where c.slug = 'kameleon';
  perform pg_temp.record('5 live', 'the kameleon client slug resolves', 'true', (t is not null)::text);

  select count(*) into n from public.client_memberships m
  join public.clients c on c.id = m.client_id
  where c.slug = 'kameleon' and m.role in ('owner','admin');
  perform pg_temp.note('5 live', 'real Kameleon owner/admin memberships (0 until the grant is authorized)', n::text);
end $$;

-- ===========================================================================
-- SECTION 6 — profiles privilege model and TRUNCATE hardening
--
-- REQUIRES migration 20260818094500_protect_profile_privileges.sql.
--
-- Until that migration is applied these checks FAIL BY DESIGN — they describe
-- the corrected state, not the current one. Before it is applied:
-- `authenticated` still holds UPDATE on is_platform_admin, still holds
-- INSERT/DELETE/TRUNCATE on profiles, profiles_update_own still has no WITH
-- CHECK, and all 14 tables still grant TRUNCATE to both browser roles. A
-- failure here before application is the expected reading, not a defect.
-- ===========================================================================
do $$
declare
  tbl  text;
  rl   text;
  v    text;
  n    int;
  tables text[] := array[
    'brand_settings','choices','client_memberships','clients','content_nodes',
    'engagement_events','experience_user_rewards','experience_users','experiences',
    'journey_progress','media_assets','pathways','profiles','publication_versions'
  ];
begin
  perform pg_temp.act_as_ambient();

  -- --- column privileges: the escalation column must be unreachable ---------
  perform pg_temp.record('6 profiles', 'authenticated has NO UPDATE on profiles.is_platform_admin', 'false',
    has_column_privilege('authenticated','public.profiles','is_platform_admin','UPDATE')::text);
  perform pg_temp.record('6 profiles', 'anon has NO UPDATE on profiles.is_platform_admin', 'false',
    has_column_privilege('anon','public.profiles','is_platform_admin','UPDATE')::text);
  perform pg_temp.record('6 profiles', 'authenticated CAN update display_name', 'true',
    has_column_privilege('authenticated','public.profiles','display_name','UPDATE')::text);
  perform pg_temp.record('6 profiles', 'authenticated CAN update avatar_url', 'true',
    has_column_privilege('authenticated','public.profiles','avatar_url','UPDATE')::text);
  perform pg_temp.record('6 profiles', 'authenticated has NO UPDATE on profiles.id', 'false',
    has_column_privilege('authenticated','public.profiles','id','UPDATE')::text);

  -- --- table privileges ----------------------------------------------------
  foreach rl in array array['anon','authenticated'] loop
    perform pg_temp.record('6 profiles', rl || ' retains SELECT on profiles', 'true',
      has_table_privilege(rl,'public.profiles','SELECT')::text);
    perform pg_temp.record('6 profiles', rl || ' has NO INSERT on profiles', 'false',
      has_table_privilege(rl,'public.profiles','INSERT')::text);
    perform pg_temp.record('6 profiles', rl || ' has NO DELETE on profiles', 'false',
      has_table_privilege(rl,'public.profiles','DELETE')::text);
    perform pg_temp.record('6 profiles', rl || ' has NO TRUNCATE on profiles', 'false',
      has_table_privilege(rl,'public.profiles','TRUNCATE')::text);
    perform pg_temp.record('6 profiles', rl || ' has NO REFERENCES on profiles', 'false',
      has_table_privilege(rl,'public.profiles','REFERENCES')::text);
    perform pg_temp.record('6 profiles', rl || ' has NO TRIGGER on profiles', 'false',
      has_table_privilege(rl,'public.profiles','TRIGGER')::text);
  end loop;

  perform pg_temp.record('6 profiles', 'anon has NO table-level UPDATE on profiles', 'false',
    has_table_privilege('anon','public.profiles','UPDATE')::text);

  -- The trusted tier must keep working, or the administrator bootstrap breaks.
  perform pg_temp.record('6 profiles', 'service_role retains UPDATE on profiles', 'true',
    has_table_privilege('service_role','public.profiles','UPDATE')::text);
  perform pg_temp.record('6 profiles', 'service_role retains SELECT on profiles', 'true',
    has_table_privilege('service_role','public.profiles','SELECT')::text);

  -- --- PUBLIC holds nothing ------------------------------------------------
  select count(*) into n from information_schema.role_table_grants
  where table_schema='public' and table_name='profiles' and grantee='PUBLIC';
  perform pg_temp.record('6 profiles', 'PUBLIC holds no privilege on profiles', '0', n::text);

  -- --- the UPDATE policy now has both halves -------------------------------
  select count(*) into n from pg_policy
  where polrelid='public.profiles'::regclass and polcmd='w' and polwithcheck is not null;
  perform pg_temp.record('6 profiles', 'profiles UPDATE policy has a WITH CHECK', '1', n::text);

  -- Scoped to authenticated, so a future grant to some other role cannot
  -- inherit it. polroles = {0} would mean PUBLIC.
  select coalesce(
           (select string_agg(r.rolname, ',' order by r.rolname)
            from pg_policy p
            left join pg_roles r on r.oid = any(p.polroles)
            where p.polrelid='public.profiles'::regclass and p.polcmd='w'),
           'PUBLIC')
    into v;
  perform pg_temp.record('6 profiles', 'profiles UPDATE policy is scoped TO authenticated', 'authenticated', v);

  -- --- TRUNCATE revoked across every audited table -------------------------
  foreach tbl in array tables loop
    perform pg_temp.record('6 truncate', 'authenticated cannot TRUNCATE ' || tbl, 'false',
      has_table_privilege('authenticated','public.'||tbl,'TRUNCATE')::text);
    perform pg_temp.record('6 truncate', 'anon cannot TRUNCATE ' || tbl, 'false',
      has_table_privilege('anon','public.'||tbl,'TRUNCATE')::text);
  end loop;

  select count(*) into n from information_schema.role_table_grants
  where table_schema='public' and privilege_type='TRUNCATE'
    and grantee in ('PUBLIC','anon','authenticated') and table_name = any(tables);
  perform pg_temp.record('6 truncate', 'no TRUNCATE grant to PUBLIC/anon/authenticated on any audited table', '0', n::text);

  -- service_role keeps TRUNCATE; nothing in the migration named it.
  perform pg_temp.record('6 truncate', 'service_role retains TRUNCATE on profiles', 'true',
    has_table_privilege('service_role','public.profiles','TRUNCATE')::text);
end $$;

-- ===========================================================================
-- SECTION 7 — profile editing behaviour under the corrected model
-- ===========================================================================
do $$
declare n int;
begin
  -- f2 is a permanent account (same-client owner). Its own presentation
  -- fields must remain editable, or the correction has broken real usage.
  perform pg_temp.act_as('00000000-0000-4000-8000-0000000000f2');

  update public.profiles set display_name = 'AA renamed'
  where id = '00000000-0000-4000-8000-0000000000f2';
  get diagnostics n = row_count;
  perform pg_temp.record('7 profile edit', 'authenticated CAN update its own display_name', '1', n::text);

  update public.profiles set avatar_url = 'example-avatar.png'
  where id = '00000000-0000-4000-8000-0000000000f2';
  get diagnostics n = row_count;
  perform pg_temp.record('7 profile edit', 'authenticated CAN update its own avatar_url', '1', n::text);

  -- Escalation on its own row: blocked by the absent column privilege, and by
  -- protect_platform_admin_flag() behind it. Both are 42501.
  perform pg_temp.try_sql('7 profile edit',
    'authenticated CANNOT update its own is_platform_admin',
    'blocked-42501',
    $q$update public.profiles set is_platform_admin = true
       where id = '00000000-0000-4000-8000-0000000000f2'$q$);

  -- Rewriting the row identity: blocked by the new WITH CHECK.
  perform pg_temp.try_sql('7 profile edit',
    'authenticated CANNOT change its profile id',
    'blocked-42501',
    $q$update public.profiles set id = '00000000-0000-4000-8000-0000000000f3'
       where id = '00000000-0000-4000-8000-0000000000f2'$q$);

  -- Another person's row: excluded by USING, so zero rows and no error.
  update public.profiles set display_name = 'hijacked'
  where id = '00000000-0000-4000-8000-0000000000f3';
  get diagnostics n = row_count;
  perform pg_temp.record('7 profile edit', 'authenticated CANNOT update another profile (0 rows via USING)', '0', n::text);

  -- Reads still work exactly as before.
  select count(*) into n from public.profiles
  where id = '00000000-0000-4000-8000-0000000000f2';
  perform pg_temp.record('7 profile edit', 'authenticated can still SELECT its own profile', '1', n::text);

  -- anon holds no UPDATE privilege at all.
  perform pg_temp.act_as_anon();
  perform pg_temp.try_sql('7 profile edit',
    'anon CANNOT update profiles',
    'blocked-42501',
    $q$update public.profiles set display_name = 'anon-was-here'
       where id = '00000000-0000-4000-8000-0000000000f2'$q$);

  -- TRUNCATE really is refused when attempted, not merely ungranted.
  perform pg_temp.act_as('00000000-0000-4000-8000-0000000000f2');
  perform pg_temp.try_sql('7 profile edit',
    'authenticated CANNOT truncate profiles',
    'blocked-42501',
    $q$truncate public.profiles$q$);

  perform pg_temp.act_as_ambient();
end $$;

-- ===========================================================================
-- SECTION 8 — the trusted profile-creation trigger is unaffected
-- ===========================================================================
do $$
declare n int;
begin
  perform pg_temp.act_as_ambient();

  -- handle_new_user() is SECURITY DEFINER, so revoking browser INSERT on
  -- profiles must not stop a new Auth identity getting its profile row. This
  -- is the check that would catch the correction breaking signup and
  -- Anonymous Sign-In.
  insert into auth.users
    (id, instance_id, aud, role, email, encrypted_password,
     email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  values
    ('00000000-0000-4000-8000-0000000000f9','00000000-0000-0000-0000-000000000000',
     'authenticated','authenticated','aa-trigger@example.com','', now(), now(), now(), '{}', '{}');

  select count(*) into n from public.profiles
  where id = '00000000-0000-4000-8000-0000000000f9';
  perform pg_temp.record('8 trigger', 'handle_new_user() still creates a profile for a new Auth user', '1', n::text);
end $$;

-- ===========================================================================
-- SECTION 9 — moderation queue view + moderation decisions
--
-- REQUIRES migrations 20260818094500 AND 20260818161500.
-- The field-presence checks fail by design until 20260818161500 is applied.
-- ===========================================================================
do $$
declare
  col  text;
  n    int;
begin
  perform pg_temp.act_as_ambient();

  -- --- the safe review fields the dashboard needs ------------------------
  foreach col in array array[
    'upload_status','validation_status','provider_processing_status',
    'delivery_ready_at','poster_ready_at','media_purge_after',
    'consent_scope','consent_version','attested_no_minors','attested_subjects_consented'
  ] loop
    select count(*) into n from information_schema.columns
    where table_schema='public' and table_name='testimonial_moderation_queue' and column_name=col;
    perform pg_temp.record('9 queue view', 'queue exposes ' || col, '1', n::text);
  end loop;

  -- --- fields that must never appear on a moderation surface -------------
  foreach col in array array[
    'auth_user_id','experience_user_id','display_name','email','phone_e164',
    'provider_upload_id','provider_asset_id','last_provider_event_id',
    'payload_hash','signature_verified_at'
  ] loop
    select count(*) into n from information_schema.columns
    where table_schema='public' and table_name='testimonial_moderation_queue' and column_name=col;
    perform pg_temp.record('9 queue view', 'queue does NOT expose ' || col, '0', n::text);
  end loop;

  -- --- browser roles still hold nothing ----------------------------------
  select count(*) into n from information_schema.role_table_grants
  where table_schema='public' and table_name='testimonial_moderation_queue'
    and grantee in ('PUBLIC','anon','authenticated');
  perform pg_temp.record('9 queue view', 'no browser role holds any privilege on the queue view', '0', n::text);

  perform pg_temp.record('9 queue view', 'authenticated cannot SELECT the queue view', 'false',
    has_table_privilege('authenticated','public.testimonial_moderation_queue','SELECT')::text);
  perform pg_temp.record('9 queue view', 'anon cannot SELECT the queue view', 'false',
    has_table_privilege('anon','public.testimonial_moderation_queue','SELECT')::text);
end $$;

-- ---------------------------------------------------------------------------
-- Fixtures for moderation decisions.
--
-- Image submissions only: an image reaches validation_status='valid' with
-- provider_asset_id + provider_draft_cleared_at + provider_signed_urls_required,
-- while a video would additionally need trusted duration, size and dimensions.
-- delivery_ready_at and provider_delivery_id are set because the approval
-- trigger refuses without them.
-- ---------------------------------------------------------------------------
select pg_temp.act_as_ambient();

insert into public.experiences (id, client_id, slug, name, publication_status) values
  ('00000000-0000-4000-8000-00000000ea01','00000000-0000-4000-8000-00000000ca01','aa-exp-a','AA Experience A','published'),
  ('00000000-0000-4000-8000-00000000eb01','00000000-0000-4000-8000-00000000cb01','aa-exp-b','AA Experience B','published');

insert into public.experience_users (id, experience_id, client_id, auth_user_id, display_name, email) values
  ('00000000-0000-4000-8000-00000000da01','00000000-0000-4000-8000-00000000ea01',
   '00000000-0000-4000-8000-00000000ca01','00000000-0000-4000-8000-0000000000f1',
   'AA Visitor','aa-visitor-enrolled@example.com');

insert into public.testimonial_submissions
  (id, client_id, experience_id, experience_user_id, auth_user_id,
   media_type, client_submission_key, consent_version, consented_at,
   attested_no_minors, attested_subjects_consented,
   upload_status, uploaded_at, validation_status, validated_at,
   provider, provider_asset_id, provider_delivery_id, provider_draft_cleared_at,
   provider_signed_urls_required, delivery_ready_at, submitted_at, caption)
values
  ('00000000-0000-4000-8000-00000000fa01','00000000-0000-4000-8000-00000000ca01',
   '00000000-0000-4000-8000-00000000ea01','00000000-0000-4000-8000-00000000da01',
   '00000000-0000-4000-8000-0000000000f1',
   'image','aa-key-1','v1', now(), true, true,
   'uploaded', now(), 'valid', now(),
   'aa-provider','aa-asset-1','aa-delivery-1', now(), true, now(), now(), 'AA caption one'),
  ('00000000-0000-4000-8000-00000000fa02','00000000-0000-4000-8000-00000000ca01',
   '00000000-0000-4000-8000-00000000ea01','00000000-0000-4000-8000-00000000da01',
   '00000000-0000-4000-8000-0000000000f1',
   'image','aa-key-2','v1', now(), true, true,
   'uploaded', now(), 'valid', now(),
   'aa-provider','aa-asset-2','aa-delivery-2', now(), true, now(), now(), 'AA caption two'),
  ('00000000-0000-4000-8000-00000000fa03','00000000-0000-4000-8000-00000000ca01',
   '00000000-0000-4000-8000-00000000ea01','00000000-0000-4000-8000-00000000da01',
   '00000000-0000-4000-8000-0000000000f1',
   'image','aa-key-3','v1', now(), true, true,
   'uploaded', now(), 'valid', now(),
   'aa-provider','aa-asset-3','aa-delivery-3', now(), true, now(), now(), 'AA caption three');

-- A submission belonging to the OTHER tenant. Nothing in the dashboard should
-- ever surface it: the loader scopes every query by the client id that
-- AUTHORIZATION resolved, and this fixture is what proves that filter is what
-- does the scoping rather than an accident of the fixture set.
insert into public.experience_users (id, experience_id, client_id, auth_user_id, display_name, email) values
  ('00000000-0000-4000-8000-00000000db01','00000000-0000-4000-8000-00000000eb01',
   '00000000-0000-4000-8000-00000000cb01','00000000-0000-4000-8000-0000000000f7',
   'AA Other Visitor','aa-visitor-other@example.com');

insert into public.testimonial_submissions
  (id, client_id, experience_id, experience_user_id, auth_user_id,
   media_type, client_submission_key, consent_version, consented_at,
   attested_no_minors, attested_subjects_consented,
   upload_status, uploaded_at, validation_status, validated_at,
   provider, provider_asset_id, provider_delivery_id, provider_draft_cleared_at,
   provider_signed_urls_required, delivery_ready_at, submitted_at, caption)
values
  ('00000000-0000-4000-8000-00000000fb01','00000000-0000-4000-8000-00000000cb01',
   '00000000-0000-4000-8000-00000000eb01','00000000-0000-4000-8000-00000000db01',
   '00000000-0000-4000-8000-0000000000f7',
   'image','aa-key-b1','v1', now(), true, true,
   'uploaded', now(), 'valid', now(),
   'aa-provider','aa-asset-b1','aa-delivery-b1', now(), true, now(), now(), 'AA other tenant caption');

-- A fourth same-tenant row. Section 17 needs a submission whose environment
-- marker is still NULL, because every other fixture is promoted below and
-- therefore already carries one.
--
-- It is promoted only PART of the way (see the second UPDATE below): uploaded
-- and provider-complete, but still validation_status 'pending' and unmarked.
-- That precise state is what isolates the environment constraint. A row left
-- fully raw would instead trip protect_testimonial_update()'s "validation
-- requires a completed provider upload with an asset id" - a 42501 raised by
-- the TRIGGER before any CHECK is ever evaluated - and section 17 would then
-- be asserting the wrong failure for the right-looking reason.
insert into public.testimonial_submissions
  (id, client_id, experience_id, experience_user_id, auth_user_id,
   media_type, client_submission_key, consent_version, consented_at,
   attested_no_minors, attested_subjects_consented)
values
  ('00000000-0000-4000-8000-00000000fa04','00000000-0000-4000-8000-00000000ca01',
   '00000000-0000-4000-8000-00000000ea01','00000000-0000-4000-8000-00000000da01',
   '00000000-0000-4000-8000-0000000000f1',
   'image','aa-key-4','v1', now(), true, true);

-- ---------------------------------------------------------------------------
-- FIXTURE PROMOTION — required by 20260819103000 section 2d.
--
-- The INSERTs above are written as if they land ready-made: uploaded, valid,
-- provider identifiers attached. That was true while protect_testimonial_insert()
-- opened with a trusted-path early return, which let an ambient inserter write
-- those columns verbatim.
--
-- 20260819103000 removes that early return, so the guard now runs for EVERY
-- inserter. Each row above therefore lands as a fresh pending intent with its
-- provider, validation, moderation and upload columns reset - and sections 10,
-- 11, 14 and 17 would cascade into failure on state that no longer exists.
--
-- Promoting with an explicit UPDATE is also the more honest fixture: it is the
-- same two-step the real system performs, where creation and trusted
-- validation are genuinely separate events.
--
-- The environment marker is set HERE because the new
-- testimonial_valid_requires_environment CHECK forbids validation_status
-- 'valid' without one. fa03 is marked 'preview' precisely so section 17 can
-- prove a Preview submission never reaches the Production Gallery.
update public.testimonial_submissions s
-- upload_expires_at is deliberately NOT touched: the column is NOT NULL, so
-- clearing it here would abort the whole transaction at fixture time. It is
-- irrelevant once upload_status is 'uploaded'.
set upload_status                 = 'uploaded',
    uploaded_at                   = now(),
    validation_status             = 'valid',
    validated_at                  = now(),
    provider                      = 'aa-provider',
    -- Derived from the id so each stays unique, matching the per-row values
    -- the INSERTs above intended: aa-asset-fa01, aa-delivery-fb01, and so on.
    provider_asset_id             = 'aa-asset-' || right(s.id::text, 4),
    provider_delivery_id          = 'aa-delivery-' || right(s.id::text, 4),
    provider_draft_cleared_at     = now(),
    provider_signed_urls_required = true,
    delivery_ready_at             = now(),
    environment_marker            = case s.id
      when '00000000-0000-4000-8000-00000000fa03'::uuid then 'preview'
      else 'production'
    end
where s.id in (
  '00000000-0000-4000-8000-00000000fa01',
  '00000000-0000-4000-8000-00000000fa02',
  '00000000-0000-4000-8000-00000000fa03',
  '00000000-0000-4000-8000-00000000fb01'
);

-- fa04: uploaded and provider-complete, but NOT validated and NOT marked.
-- validation_status stays 'pending', which satisfies
-- testimonial_validation_requires_provider_asset on its own, so the row is
-- legal while leaving both of section 17's subjects untouched.
update public.testimonial_submissions s
set upload_status                 = 'uploaded',
    uploaded_at                   = now(),
    provider                      = 'aa-provider',
    provider_asset_id             = 'aa-asset-fa04',
    provider_delivery_id          = 'aa-delivery-fa04',
    provider_draft_cleared_at     = now(),
    provider_signed_urls_required = true,
    delivery_ready_at             = now()
where s.id = '00000000-0000-4000-8000-00000000fa04';

-- ===========================================================================
-- SECTION 9b — cross-client leakage through the trusted read path
-- ===========================================================================
do $$
declare n int;
begin
  perform pg_temp.act_as_ambient();

  -- The trusted client CAN see everything; the tenant filter is what confines
  -- it. Both halves are asserted, because a filter that happens to match
  -- because only one tenant has data proves nothing.
  select count(*) into n from public.testimonial_moderation_queue;
  perform pg_temp.record('9b tenancy', 'the trusted read sees BOTH tenants without a filter', '4', n::text);

  select count(*) into n from public.testimonial_moderation_queue
  where client_id = '00000000-0000-4000-8000-00000000ca01';
  perform pg_temp.record('9b tenancy', 'scoping by the authorized client id yields only that tenant', '3', n::text);

  select count(*) into n from public.testimonial_moderation_queue
  where client_id = '00000000-0000-4000-8000-00000000ca01'
    and submission_id = '00000000-0000-4000-8000-00000000fb01';
  perform pg_temp.record('9b tenancy', 'the other tenant''s submission is unreachable under that scope', '0', n::text);
end $$;

-- ===========================================================================
-- SECTION 10 — who may moderate
-- ===========================================================================
do $$
declare
  v_status text;
  v_reviewer uuid;
  n int;
begin
  -- The queue is populated and readable by the trusted tier only.
  perform pg_temp.act_as_ambient();
  select count(*) into n from public.testimonial_moderation_queue
  where client_id = '00000000-0000-4000-8000-00000000ca01';
  perform pg_temp.record('10 moderation', 'three fixtures are moderation-eligible', '3', n::text);

  -- Denied identities. The RPC returns the same error for absent and
  -- unauthorized, so every one of these is 42501.
  perform pg_temp.act_as('00000000-0000-4000-8000-0000000000f4');   -- editor
  perform pg_temp.try_sql('10 moderation', 'editor cannot moderate', 'blocked-42501',
    $q$select public.moderate_testimonial_submission(
         '00000000-0000-4000-8000-00000000fa01'::uuid, 'approved'::public.testimonial_moderation_status)$q$);

  perform pg_temp.act_as('00000000-0000-4000-8000-0000000000f5');   -- viewer
  perform pg_temp.try_sql('10 moderation', 'viewer cannot moderate', 'blocked-42501',
    $q$select public.moderate_testimonial_submission(
         '00000000-0000-4000-8000-00000000fa01'::uuid, 'approved'::public.testimonial_moderation_status)$q$);

  perform pg_temp.act_as('00000000-0000-4000-8000-0000000000f7');   -- cross-tenant owner
  perform pg_temp.try_sql('10 moderation', 'cross-client owner cannot moderate', 'blocked-42501',
    $q$select public.moderate_testimonial_submission(
         '00000000-0000-4000-8000-00000000fa01'::uuid, 'approved'::public.testimonial_moderation_status)$q$);

  perform pg_temp.act_as('00000000-0000-4000-8000-0000000000f1');   -- anonymous visitor
  perform pg_temp.try_sql('10 moderation', 'anonymous identity cannot moderate', 'blocked-42501',
    $q$select public.moderate_testimonial_submission(
         '00000000-0000-4000-8000-00000000fa01'::uuid, 'approved'::public.testimonial_moderation_status)$q$);

  perform pg_temp.act_as('00000000-0000-4000-8000-0000000000f6');   -- no membership
  perform pg_temp.try_sql('10 moderation', 'no-membership identity cannot moderate', 'blocked-42501',
    $q$select public.moderate_testimonial_submission(
         '00000000-0000-4000-8000-00000000fa01'::uuid, 'approved'::public.testimonial_moderation_status)$q$);

  perform pg_temp.act_as_anon();
  perform pg_temp.try_sql('10 moderation', 'signed-out caller cannot moderate', 'blocked-42501',
    $q$select public.moderate_testimonial_submission(
         '00000000-0000-4000-8000-00000000fa01'::uuid, 'approved'::public.testimonial_moderation_status)$q$);

  -- Nothing above changed anything.
  perform pg_temp.act_as_ambient();
  -- Scoped to the three moderation-eligible fixtures by id. A bare client-wide
  -- count would also sweep in fa04, the unpromoted pending intent, and would
  -- then be measuring the fixture set rather than the effect of the denials.
  select count(*) into n from public.testimonial_submissions
  where moderation_status = 'pending'
    and id in ('00000000-0000-4000-8000-00000000fa01',
               '00000000-0000-4000-8000-00000000fa02',
               '00000000-0000-4000-8000-00000000fa03');
  perform pg_temp.record('10 moderation', 'all three remain pending after the denied attempts', '3', n::text);

  -- --- OWNER approves ----------------------------------------------------
  perform pg_temp.act_as('00000000-0000-4000-8000-0000000000f2');
  select moderation_status::text into v_status
  from public.moderate_testimonial_submission(
    '00000000-0000-4000-8000-00000000fa01'::uuid,
    'approved'::public.testimonial_moderation_status);
  perform pg_temp.record('10 moderation', 'same-client OWNER can approve', 'approved', v_status);

  perform pg_temp.act_as_ambient();
  select reviewed_by into v_reviewer from public.testimonial_submissions
  where id = '00000000-0000-4000-8000-00000000fa01';
  perform pg_temp.record('10 moderation', 'reviewed_by is the real administrator UUID',
    '00000000-0000-4000-8000-0000000000f2', v_reviewer::text);

  -- --- ADMIN rejects -----------------------------------------------------
  perform pg_temp.act_as('00000000-0000-4000-8000-0000000000f3');
  select moderation_status::text into v_status
  from public.moderate_testimonial_submission(
    '00000000-0000-4000-8000-00000000fa02'::uuid,
    'rejected'::public.testimonial_moderation_status,
    'AA note', 'possible_minor');
  perform pg_temp.record('10 moderation', 'same-client ADMIN can reject', 'rejected', v_status);

  -- --- PLATFORM ADMIN approves, with no membership at all ----------------
  perform pg_temp.act_as('00000000-0000-4000-8000-0000000000f8');
  select moderation_status::text into v_status
  from public.moderate_testimonial_submission(
    '00000000-0000-4000-8000-00000000fa03'::uuid,
    'approved'::public.testimonial_moderation_status);
  perform pg_temp.record('10 moderation', 'PLATFORM ADMIN can approve without a membership', 'approved', v_status);
end $$;

-- ===========================================================================
-- SECTION 11 — transitions and Gallery eligibility
-- ===========================================================================
do $$
declare n int;
begin
  -- A rejected submission can never become approved.
  perform pg_temp.act_as('00000000-0000-4000-8000-0000000000f2');
  perform pg_temp.try_sql('11 transitions', 'rejected -> approved is refused', 'blocked-42501',
    $q$select public.moderate_testimonial_submission(
         '00000000-0000-4000-8000-00000000fa02'::uuid, 'approved'::public.testimonial_moderation_status)$q$);

  -- 'pending' is not a decision the RPC accepts.
  perform pg_temp.try_sql('11 transitions', 'pending is not an accepted decision', 'blocked-22023',
    $q$select public.moderate_testimonial_submission(
         '00000000-0000-4000-8000-00000000fa01'::uuid, 'pending'::public.testimonial_moderation_status)$q$);

  perform pg_temp.act_as_ambient();

  -- Approved items are Gallery-eligible; rejected ones are not.
  select count(*) into n from public.testimonial_gallery_items
  where submission_id = '00000000-0000-4000-8000-00000000fa01';
  perform pg_temp.record('11 transitions', 'approved submission IS gallery-eligible', '1', n::text);

  select count(*) into n from public.testimonial_gallery_items
  where submission_id = '00000000-0000-4000-8000-00000000fa02';
  perform pg_temp.record('11 transitions', 'rejected submission is NOT gallery-eligible', '0', n::text);

  select count(*) into n from public.testimonial_submissions
  where id = '00000000-0000-4000-8000-00000000fa02' and media_purge_after is not null;
  perform pg_temp.record('11 transitions', 'rejection schedules media purge', '1', n::text);

  -- The gallery view carries no contact or reviewer data.
  select count(*) into n from information_schema.columns
  where table_schema='public' and table_name='testimonial_gallery_items'
    and column_name in ('auth_user_id','experience_user_id','email','phone_e164',
                        'reviewed_by','moderation_note','rejection_reason','consent_version');
  perform pg_temp.record('11 transitions', 'gallery view exposes no reviewer or contact fields', '0', n::text);
end $$;

-- ===========================================================================
-- SECTION 12 — Phase 4B visitor capture surface
--
-- REQUIRES migration 20260819103000. Fails by design until it is applied.
-- ===========================================================================
do $$
declare n int; v text;
begin
  perform pg_temp.act_as_ambient();

  -- --- gate defaults ------------------------------------------------------
  select count(*) into n from information_schema.columns
  where table_schema='public' and table_name='experiences'
    and column_name='testimonial_capture_enabled' and column_default='false';
  perform pg_temp.record('12 capture', 'per-experience capture gate exists and defaults false', '1', n::text);

  select count(*) into n from public.experiences where testimonial_capture_enabled;
  perform pg_temp.record('12 capture', 'capture is enabled for NO experience yet', '0', n::text);

  -- --- new columns --------------------------------------------------------
  foreach v in array array['upload_attempt_count','environment_marker'] loop
    select count(*) into n from information_schema.columns
    where table_schema='public' and table_name='testimonial_submissions' and column_name=v;
    perform pg_temp.record('12 capture', 'testimonial_submissions has ' || v, '1', n::text);
  end loop;

  -- --- function privileges ------------------------------------------------
  -- Direct PostgREST execution must be impossible for BOTH browser roles.
  -- This is the check that proves the environment gate is independent: if
  -- `authenticated` could execute these, a Preview browser could skip the
  -- Server Action entirely once the shared database gate was enabled.
  -- Includes the trigger functions and the status-read RPC. PostgreSQL grants
  -- EXECUTE to PUBLIC by default on every new function, so each one needs an
  -- explicit revoke; "we never granted it" does not make it unreachable.
  foreach v in array array[
    'assert_testimonial_visitor','active_consent_version','create_testimonial_intent',
    'retry_testimonial_upload','abandon_testimonial_submission','update_testimonial_caption',
    'list_my_testimonial_submissions',
    'protect_testimonial_capture_columns','protect_testimonial_insert'
  ] loop
    perform pg_temp.record('12 capture', v || ': authenticated may NOT execute', 'false',
      has_function_privilege('authenticated', p.oid, 'EXECUTE')::text)
    from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace
    where ns.nspname='public' and p.proname=v;

    perform pg_temp.record('12 capture', v || ': anon may NOT execute', 'false',
      has_function_privilege('anon', p.oid, 'EXECUTE')::text)
    from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace
    where ns.nspname='public' and p.proname=v;

    perform pg_temp.record('12 capture', v || ': PUBLIC may NOT execute', 'false',
      has_function_privilege('public', p.oid, 'EXECUTE')::text)
    from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace
    where ns.nspname='public' and p.proname=v;

    perform pg_temp.record('12 capture', v || ' is SECURITY DEFINER', 'true',
      p.prosecdef::text)
    from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace
    where ns.nspname='public' and p.proname=v;
  end loop;

  -- The trusted tier retains exactly the five visitor-facing RPCs: four that
  -- mutate, plus the status read that replaced direct view access.
  foreach v in array array['create_testimonial_intent','retry_testimonial_upload',
                           'abandon_testimonial_submission','update_testimonial_caption',
                           'list_my_testimonial_submissions'] loop
    perform pg_temp.record('12 capture', v || ': service_role MAY execute', 'true',
      has_function_privilege('service_role', p.oid, 'EXECUTE')::text)
    from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace
    where ns.nspname='public' and p.proname=v;
  end loop;

  -- The internal helpers are callable by nobody at all, not even service_role:
  -- both are reached as OWNER from inside the RPCs above.
  foreach v in array array['assert_testimonial_visitor','active_consent_version'] loop
    perform pg_temp.record('12 capture', v || ' is callable by nobody, including service_role', 'false',
      has_function_privilege('service_role', p.oid, 'EXECUTE')::text)
    from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace
    where ns.nspname='public' and p.proname=v;
  end loop;

  -- --- the status view is no longer browser-reachable ---------------------
  foreach v in array array['anon','authenticated'] loop
    perform pg_temp.record('12 capture', v || ' has NO select on testimonial_my_submissions', 'false',
      has_table_privilege(v,'public.testimonial_my_submissions','SELECT')::text);
  end loop;

  -- It is kept rather than dropped, and keeps its ownership predicate as
  -- defence in depth against a future privilege drift.
  perform pg_temp.record('12 capture', 'the status view still exists', '1',
    (select count(*) from information_schema.views
     where table_schema='public' and table_name='testimonial_my_submissions')::text);
  perform pg_temp.record('12 capture', 'the status view still filters on auth.uid()', 'true',
    (pg_get_viewdef('public.testimonial_my_submissions'::regclass, true)
      like '%auth.uid()%')::text);

  -- --- the visitor status view stays sanitized ----------------------------
  foreach v in array array['auth_user_id','experience_user_id','provider_asset_id',
                           'provider_delivery_id','email','phone_e164','client_id'] loop
    select count(*) into n from information_schema.columns
    where table_schema='public' and table_name='testimonial_my_submissions' and column_name=v;
    perform pg_temp.record('12 capture', 'my_submissions does NOT expose ' || v, '0', n::text);
  end loop;

  foreach v in array array['upload_expires_at','upload_attempt_count'] loop
    select count(*) into n from information_schema.columns
    where table_schema='public' and table_name='testimonial_my_submissions' and column_name=v;
    perform pg_temp.record('12 capture', 'my_submissions exposes ' || v, '1', n::text);
  end loop;
end $$;

-- ===========================================================================
-- SECTION 13 — capture RPCs refuse the wrong callers
-- ===========================================================================
do $$
begin
  -- Every check in this section runs as a BROWSER role, which post-4B holds
  -- no EXECUTE on these RPCs at all. So the 42501 each one expects is now
  -- raised by PRIVILEGE, before the function body runs - not by the capture
  -- gate or the ownership guard inside it. That is the stronger result, but
  -- it means these checks no longer exercise the in-function gates; section
  -- 12 proves the grants, and the in-function gates are reachable only from
  -- the trusted tier. Do not read a PASS here as evidence the capture gate
  -- fired.
  perform pg_temp.act_as('00000000-0000-4000-8000-0000000000f1');
  perform pg_temp.try_sql('13 capture rpc', 'anonymous visitor refused while capture is disabled',
    'blocked-42501',
    $q$select public.create_testimonial_intent('00000000-0000-4000-8000-0000000000f1'::uuid, 'image'::public.testimonial_media_type)$q$);

  -- A permanent account is refused regardless of the gate.
  perform pg_temp.act_as('00000000-0000-4000-8000-0000000000f2');
  perform pg_temp.try_sql('13 capture rpc', 'permanent account refused',
    'blocked-42501',
    $q$select public.create_testimonial_intent('00000000-0000-4000-8000-0000000000f1'::uuid, 'image'::public.testimonial_media_type)$q$);

  -- Signed out.
  perform pg_temp.act_as_anon();
  perform pg_temp.try_sql('13 capture rpc', 'signed-out caller refused',
    'blocked-42501',
    $q$select public.create_testimonial_intent('00000000-0000-4000-8000-0000000000f1'::uuid, 'image'::public.testimonial_media_type)$q$);

  -- NOTE: this section previously carried two more checks - "unknown
  -- environment marker rejected" and "empty consent version rejected", both
  -- expecting 22023. They were written against the SUPERSEDED three-argument
  -- signature, in which the caller supplied the marker and the consent
  -- version. The corrected RPC takes neither: the marker is never set at
  -- creation, and the version is resolved from the registry. With no such
  -- parameters to malform, both calls were byte-identical to the checks above
  -- and could only ever return 42501, so they were removed rather than left
  -- asserting an unreachable SQLSTATE. What they were reaching for is covered
  -- properly by section 16 (a caller cannot supply either value at all) and
  -- section 17 (the marker cannot be self-asserted).

  -- Cross-visitor access: a submission id that is not yours is refused with
  -- the SAME error as one that does not exist, so ids cannot be probed.
  perform pg_temp.try_sql('13 capture rpc', 'abandoning an unknown submission is refused',
    'blocked-42501',
    $q$select public.abandon_testimonial_submission('00000000-0000-4000-8000-0000000000f1'::uuid, '00000000-0000-4000-8000-00000000dead'::uuid)$q$);
  perform pg_temp.try_sql('13 capture rpc', 'captioning an unknown submission is refused',
    'blocked-42501',
    $q$select public.update_testimonial_caption('00000000-0000-4000-8000-0000000000f1'::uuid, '00000000-0000-4000-8000-00000000dead'::uuid, 'hi')$q$);
  perform pg_temp.try_sql('13 capture rpc', 'retrying an unknown submission is refused',
    'blocked-42501',
    $q$select public.retry_testimonial_upload('00000000-0000-4000-8000-0000000000f1'::uuid, '00000000-0000-4000-8000-00000000dead'::uuid)$q$);

  perform pg_temp.act_as_ambient();
end $$;

-- ===========================================================================
-- SECTION 14 — the browser still cannot write privileged columns
-- ===========================================================================
do $$
declare c text;
begin
  perform pg_temp.act_as_ambient();

  -- UPDATE(caption) only. 20260817193000 also left `authenticated` with
  -- INSERT; section 0 of 20260819103000 revokes it, and section 15 asserts
  -- that revocation directly. The new columns are unreachable because no
  -- column privilege was granted on them.
  foreach c in array array['upload_status','validation_status','provider_asset_id',
                           'provider_delivery_id','upload_attempt_count',
                           'environment_marker','moderation_status','reviewed_by'] loop
    perform pg_temp.record('14 capture privs', 'authenticated cannot UPDATE ' || c, 'false',
      has_column_privilege('authenticated','public.testimonial_submissions',c,'UPDATE')::text);
  end loop;

  perform pg_temp.record('14 capture privs', 'authenticated CAN still update caption', 'true',
    has_column_privilege('authenticated','public.testimonial_submissions','caption','UPDATE')::text);
  -- Post-4B this is FALSE. The RPC is the only creation path; see section 15.
  perform pg_temp.record('14 capture privs', 'authenticated no longer has INSERT', 'false',
    has_table_privilege('authenticated','public.testimonial_submissions','INSERT')::text);
  perform pg_temp.record('14 capture privs', 'authenticated has NO raw SELECT', 'false',
    has_table_privilege('authenticated','public.testimonial_submissions','SELECT')::text);

  -- Exactly ONE row is Gallery-eligible at this point, and it is fa01:
  -- approved in section 10 and marked 'production' at fixture promotion.
  -- fa02 was rejected, fa04 is an unpromoted pending intent, fb01 was never
  -- moderated, and fa03 - though approved - is marked 'preview' and is
  -- therefore excluded by the environment predicate added in 2c. A count of 2
  -- here would mean that predicate is not doing its job.
  perform pg_temp.record('14 capture privs', 'only the production submission is gallery-eligible', '1',
    (select count(*) from public.testimonial_gallery_items)::text);
end $$;

-- ===========================================================================
-- SECTION 15 — the corrected capture surface
--
-- REQUIRES migration 20260819103000 (corrected). Fails by design until applied.
-- ===========================================================================
do $$
declare
  n           int;
  v_oid       oid;
  v_nargs     int;
  v_ndefaults int;
  v_argtypes  oid[];
  v_argnames  text[];
begin
  perform pg_temp.act_as_ambient();

  -- The direct-INSERT bypass is closed: the RPC is the only creation path.
  perform pg_temp.record('15 corrections', 'authenticated has NO INSERT on submissions', 'false',
    has_table_privilege('authenticated','public.testimonial_submissions','INSERT')::text);
  perform pg_temp.record('15 corrections', 'anon has NO INSERT on submissions', 'false',
    has_table_privilege('anon','public.testimonial_submissions','INSERT')::text);

  -- Consent registry: exists, empty, unreachable.
  select count(*) into n from information_schema.tables
  where table_schema='public' and table_name='consent_document_versions';
  perform pg_temp.record('15 corrections', 'the consent registry exists', '1', n::text);

  select count(*) into n from public.consent_document_versions where is_active;
  perform pg_temp.record('15 corrections', 'NO consent version is active yet', '0', n::text);

  perform pg_temp.record('15 corrections', 'authenticated cannot read the consent registry', 'false',
    has_table_privilege('authenticated','public.consent_document_versions','SELECT')::text);

  perform pg_temp.record('15 corrections', 'authenticated cannot execute active_consent_version()', 'false',
    has_function_privilege('authenticated', p.oid, 'EXECUTE')::text)
  from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace
  where ns.nspname='public' and p.proname='active_consent_version';

  perform pg_temp.record('15 corrections', 'authenticated cannot execute the internal visitor guard', 'false',
    has_function_privilege('authenticated', p.oid, 'EXECUTE')::text)
  from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace
  where ns.nspname='public' and p.proname='assert_testimonial_visitor';

  -- Environment isolation.
  select count(*) into n from pg_constraint
  where conrelid='public.testimonial_submissions'::regclass
    and conname='testimonial_valid_requires_environment';
  perform pg_temp.record('15 corrections', 'valid requires an environment marker', '1', n::text);

  select count(*) into n from pg_trigger
  where tgrelid='public.testimonial_submissions'::regclass
    and tgname='testimonial_submissions_01_protect_capture_columns';
  perform pg_temp.record('15 corrections', 'the capture-column guard trigger exists', '1', n::text);

  perform pg_temp.record('15 corrections', 'the gallery view filters on production', 'true',
    (pg_get_viewdef('public.testimonial_gallery_items'::regclass, true)
      like '%environment_marker = ''production''%')::text);

  -- -------------------------------------------------------------------------
  -- The intent RPC takes the verified visitor id and the media type, and
  -- NOTHING else: no consent version, no environment marker, no client,
  -- experience or submission key. The visitor id is present because the
  -- trusted caller has no session for auth.uid() to read; the RPC re-resolves
  -- it against auth.users rather than trusting it.
  --
  -- Asserted against the CATALOG, not against rendered SQL text.
  --
  -- This check previously compared pg_get_function_identity_arguments() to a
  -- literal string and failed for a purely cosmetic reason: the *identity*
  -- form deliberately omits parameter NAMES, returning "uuid,
  -- testimonial_media_type" where the expectation spelled out
  -- "p_visitor_id uuid, ...". Schema qualification in that text also depends
  -- on the session search_path, so the same correct function renders
  -- differently for different callers.
  --
  -- Swapping in a different hard-coded string would have re-armed the same
  -- trap. Every property below is read from pg_proc / pg_type instead, where
  -- arity, names, types and defaults are structured values rather than
  -- formatting. The type check compares OIDs, so it cannot be satisfied by a
  -- differently-schema'd enum that merely prints the same.
  -- -------------------------------------------------------------------------

  -- (1) The name resolves to exactly ONE function - no overload was left
  -- behind by an earlier draft that a caller could reach instead.
  select count(*) into n
  from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public' and p.proname = 'create_testimonial_intent';
  perform pg_temp.record('15 signature', 'create_testimonial_intent is not overloaded', '1', n::text);

  -- ...and this exact signature is the one that resolves.
  v_oid := to_regprocedure('public.create_testimonial_intent(uuid, public.testimonial_media_type)')::oid;
  perform pg_temp.record('15 signature', 'the (uuid, testimonial_media_type) signature resolves', 'true',
    (v_oid is not null)::text);

  if v_oid is not null then
    -- oidvector is converted through text EXPLICITLY. nullif() guards the
    -- zero-argument case: proargtypes::text would be '', string_to_array
    -- would yield {''}, and the cast to oid[] would RAISE - aborting the
    -- transaction instead of recording a failure.
    select p.pronargs,
           p.pronargdefaults,
           coalesce(
             string_to_array(nullif(p.proargtypes::text, ''), ' ')::oid[],
             '{}'::oid[]
           ),
           p.proargnames
    into v_nargs, v_ndefaults, v_argtypes, v_argnames
    from pg_proc p where p.oid = v_oid;

    -- (2) Exactly two INPUT arguments. pronargs counts inputs only, so the
    -- RETURNS TABLE columns cannot pad this number.
    perform pg_temp.record('15 signature', 'it declares exactly two input arguments', '2', v_nargs::text);
    perform pg_temp.record('15 signature', 'proargtypes holds exactly two entries', '2',
      coalesce(array_length(v_argtypes, 1), 0)::text);

    -- (3) Argument NAMES, in order. proargnames spans IN then OUT names when a
    -- function returns a table, so this is sliced to the two inputs.
    perform pg_temp.record('15 signature', 'the input argument names are exactly p_visitor_id, p_media_type',
      '{p_visitor_id,p_media_type}', coalesce(v_argnames[1:2]::text, '<null>'));

    -- (4) Argument TYPES, by OID. Not by printed name: an enum of the same
    -- name in another schema has a different OID and is rejected here.
    -- to_regtype() rather than ::regtype: the cast form RAISES on an unknown
    -- type name, which would abort this block; to_regtype returns NULL and
    -- lets the mismatch be reported like any other failure.
    perform pg_temp.record('15 signature', 'argument 1 is uuid',
      coalesce((to_regtype('uuid'))::oid::text, '<unresolved>'),
      coalesce(v_argtypes[1]::text, '<null>'));
    perform pg_temp.record('15 signature', 'argument 2 is the public.testimonial_media_type enum OID',
      coalesce((to_regtype('public.testimonial_media_type'))::oid::text, '<unresolved>'),
      coalesce(v_argtypes[2]::text, '<null>'));

    -- ...and that OID really is an enum in public, so the assertion above is
    -- anchored to a real enum rather than to whatever the name resolves to.
    perform pg_temp.record('15 signature', 'that type is an enum living in public', 'e,public',
      coalesce((select t.typtype::text || ',' || tns.nspname::text
                from pg_type t join pg_namespace tns on tns.oid = t.typnamespace
                where t.oid = v_argtypes[2]), '<unresolved>'));

    -- (5) No defaulted arguments - a default would let a caller omit the
    -- verified visitor id and have the server supply one.
    perform pg_temp.record('15 signature', 'no argument carries a default', '0', v_ndefaults::text);

    -- No VARIADIC tail, and no OUT/INOUT smuggled into the input list:
    -- proargmodes is NULL when every argument is plain IN plus table columns.
    perform pg_temp.record('15 signature', 'the function is not variadic', '0',
      coalesce((select p.provariadic from pg_proc p where p.oid = v_oid)::text, '<null>'));
  end if;
end $$;

-- ===========================================================================
-- SECTION 16 — each gate independently blocks a DIRECT RPC call
-- ===========================================================================
do $$
begin
  -- An anonymous visitor calling the RPC directly, bypassing every Server
  -- Action. The database gate and the legal gate must each stop this on their
  -- own; disabling the UI is not what protects anything.
  perform pg_temp.act_as('00000000-0000-4000-8000-0000000000f1');
  perform pg_temp.try_sql('16 gates', 'direct RPC refused by PRIVILEGE - authenticated cannot execute it at all',
    'blocked-42501',
    $q$select public.create_testimonial_intent('00000000-0000-4000-8000-0000000000f1'::uuid, 'image'::public.testimonial_media_type)$q$);

  -- A direct INSERT is now refused by PRIVILEGE, before any policy is consulted.
  perform pg_temp.try_sql('16 gates', 'direct INSERT refused by privilege',
    'blocked-42501',
    $q$insert into public.testimonial_submissions
         (client_id, experience_id, experience_user_id, media_type,
          client_submission_key, consent_version, consented_at,
          attested_no_minors, attested_subjects_consented, environment_marker)
       values ('00000000-0000-4000-8000-00000000ca01',
               '00000000-0000-4000-8000-00000000ea01',
               '00000000-0000-4000-8000-00000000da01',
               'image', 'forged-key', 'forged-version', now(), true, true, 'production')$q$);

  -- A permanent account, likewise refused.
  perform pg_temp.act_as('00000000-0000-4000-8000-0000000000f2');
  perform pg_temp.try_sql('16 gates', 'permanent account refused at the RPC',
    'blocked-42501',
    $q$select public.create_testimonial_intent('00000000-0000-4000-8000-0000000000f1'::uuid, 'image'::public.testimonial_media_type)$q$);
  perform pg_temp.try_sql('16 gates', 'permanent account refused at direct INSERT',
    'blocked-42501',
    $q$insert into public.testimonial_submissions
         (client_id, experience_id, experience_user_id, media_type,
          client_submission_key, consent_version, consented_at,
          attested_no_minors, attested_subjects_consented)
       values ('00000000-0000-4000-8000-00000000ca01',
               '00000000-0000-4000-8000-00000000ea01',
               '00000000-0000-4000-8000-00000000da01',
               'image', 'forged-key-2', 'forged-version', now(), true, true)$q$);

  -- The internal guard is not directly callable.
  perform pg_temp.act_as('00000000-0000-4000-8000-0000000000f1');
  perform pg_temp.try_sql('16 gates', 'the internal visitor guard is not callable',
    'blocked-42501',
    $q$select public.assert_testimonial_visitor('00000000-0000-4000-8000-0000000000f1'::uuid, '00000000-0000-4000-8000-00000000da01'::uuid)$q$);

  -- Nor is the consent resolver. This is the check that would have passed
  -- vacuously before: the function was never GRANTED to anyone, but PostgreSQL
  -- had already granted EXECUTE to PUBLIC by default, so it was callable by
  -- every browser role until the revoke named PUBLIC explicitly.
  perform pg_temp.try_sql('16 gates', 'the consent resolver is not callable',
    'blocked-42501',
    $q$select public.active_consent_version()$q$);

  -- The status read is now trusted-only too, on both routes: the RPC and the
  -- view it replaced.
  perform pg_temp.try_sql('16 gates', 'the status RPC is not callable by a browser role',
    'blocked-42501',
    $q$select * from public.list_my_testimonial_submissions('00000000-0000-4000-8000-0000000000f1'::uuid)$q$);
  perform pg_temp.try_sql('16 gates', 'the status view is not readable by a browser role',
    'blocked-42501',
    $q$select count(*) from public.testimonial_my_submissions$q$);

  -- Even a caller who somehow reached the status RPC could not point it at
  -- ANOTHER visitor: f7 belongs to the other tenant, and f2 is a permanent
  -- account. Both are refused - the first two by privilege here, and the
  -- anonymity re-check is proved from the trusted tier in section 18.
  perform pg_temp.try_sql('16 gates', 'the status RPC cannot be aimed at another visitor',
    'blocked-42501',
    $q$select * from public.list_my_testimonial_submissions('00000000-0000-4000-8000-0000000000f7'::uuid)$q$);

  -- The trigger functions carry no default PUBLIC grant either.
  perform pg_temp.try_sql('16 gates', 'the capture-column trigger function is not callable',
    'blocked-42501',
    $q$select public.protect_testimonial_capture_columns()$q$);
  perform pg_temp.try_sql('16 gates', 'the insert guard function is not callable',
    'blocked-42501',
    $q$select public.protect_testimonial_insert()$q$);

  -- Browser roles cannot touch the registry.
  perform pg_temp.try_sql('16 gates', 'the consent registry is unreadable',
    'blocked-42501',
    $q$select count(*) from public.consent_document_versions$q$);
  perform pg_temp.try_sql('16 gates', 'a consent version cannot be self-published',
    'blocked-42501',
    $q$insert into public.consent_document_versions (version, terms_url, privacy_url, published_at, is_active)
       values ('forged', 'x', 'y', now(), true)$q$);

  perform pg_temp.act_as_ambient();
end $$;

-- ===========================================================================
-- SECTION 17 — the environment marker cannot be self-asserted
-- ===========================================================================
do $$
declare n int; v text;
begin
  perform pg_temp.act_as_ambient();

  -- Only one active consent version may exist at a time.
  insert into public.consent_document_versions (version, terms_url, privacy_url, published_at, is_active)
  values ('aa-test-v1', 'https://example.com/terms', 'https://example.com/privacy', now(), true);

  perform pg_temp.try_sql('17 environment', 'a second active consent version is refused',
    'blocked-23505',
    $q$insert into public.consent_document_versions (version, terms_url, privacy_url, published_at, is_active)
       values ('aa-test-v2', 'https://example.com/terms', 'https://example.com/privacy', now(), true)$q$);

  -- An unpublished version cannot be active. URLs are real https so the
  -- refusal is attributable to the missing published_at and not to the URL
  -- half of the same CHECK.
  perform pg_temp.try_sql('17 environment', 'an unpublished version cannot be active',
    'blocked-23514',
    $q$insert into public.consent_document_versions (version, terms_url, privacy_url, is_active)
       values ('aa-test-v3', 'https://example.com/terms', 'https://example.com/privacy', true)$q$);

  -- --- the https check rejects MALFORMED values, not just non-https ones ---
  -- The constraint is a shape test, not a prefix test. Each of these begins
  -- with a plausible-looking value and is still refused, so a placeholder can
  -- never stand in for a document a visitor is told they agreed to. The last
  -- three matter most: they all start with "https" and are still rejected.
  foreach v in array array[
    'tbd',                  -- not a URL at all
    '#',                    -- an anchor, the classic placeholder
    'http://example.com',   -- right shape, wrong scheme
    'HTTPS://example.com',  -- scheme must be lowercase
    'https',                -- the scheme alone
    'https://',             -- scheme with no host
    'https://x',            -- host with no dot
    'https://.com',         -- dot with no label before it
    'https://example com'   -- whitespace inside the host
  ] loop
    perform pg_temp.try_sql('17 environment',
      'an active consent version refuses terms_url ' || quote_literal(v),
      'blocked-23514',
      format($q$insert into public.consent_document_versions
                  (version, terms_url, privacy_url, published_at, is_active)
                values (%L, %L, 'https://example.com/privacy', now(), true)$q$,
             'aa-bad-' || md5(v), v));
  end loop;

  -- The same shapes are refused in privacy_url, so the check is not applied to
  -- one column and forgotten on the other.
  perform pg_temp.try_sql('17 environment', 'the https check covers privacy_url too',
    'blocked-23514',
    $q$insert into public.consent_document_versions (version, terms_url, privacy_url, published_at, is_active)
       values ('aa-bad-privacy', 'https://example.com/terms', 'tbd', now(), true)$q$);

  -- An INACTIVE row is exempt by design: the constraint gates PUBLICATION, so
  -- a draft may be staged with whatever URLs it has and can never be resolved
  -- by active_consent_version() until it is both published and active.
  perform pg_temp.try_sql('17 environment', 'an inactive draft row is not URL-constrained',
    'ALLOWED',
    $q$insert into public.consent_document_versions (version, terms_url, privacy_url)
       values ('aa-draft', 'tbd', 'tbd')$q$);

  select count(*) into n from public.consent_document_versions where is_active;
  perform pg_temp.record('17 environment', 'exactly one active version survives all of that', '1', n::text);

  -- A submission with no environment marker cannot be marked valid. fa04 is
  -- the fixture deliberately left unpromoted, so its marker is still NULL and
  -- the CHECK is what refuses here - not the immutability trigger.
  perform pg_temp.try_sql('17 environment', 'valid requires an environment marker',
    'blocked-23514',
    $q$update public.testimonial_submissions
       set validation_status = 'valid', environment_marker = null
       where id = '00000000-0000-4000-8000-00000000fa04'$q$);

  -- NULL -> value is permitted for a trusted caller, exactly once.
  update public.testimonial_submissions set environment_marker = 'production'
  where id = '00000000-0000-4000-8000-00000000fa04';

  select count(*) into n from public.testimonial_submissions
  where id = '00000000-0000-4000-8000-00000000fa04' and environment_marker = 'production';
  perform pg_temp.record('17 environment', 'a trusted caller may stamp an unset marker once', '1', n::text);

  -- value -> different value is refused even for that same trusted caller.
  perform pg_temp.try_sql('17 environment', 'the environment marker cannot be changed once set',
    'blocked-42501',
    $q$update public.testimonial_submissions set environment_marker = 'preview'
       where id = '00000000-0000-4000-8000-00000000fa04'$q$);

  -- A preview submission is never gallery-eligible. fa03 was stamped
  -- 'preview' at fixture-promotion time and approved in section 10, so it
  -- satisfies every Gallery predicate EXCEPT the environment - which is
  -- precisely what this proves.
  select count(*) into n from public.testimonial_gallery_items
  where submission_id = '00000000-0000-4000-8000-00000000fa03';
  perform pg_temp.record('17 environment', 'a preview submission is NOT gallery-eligible', '0', n::text);

  select count(*) into n from public.testimonial_gallery_items
  where submission_id = '00000000-0000-4000-8000-00000000fa01';
  perform pg_temp.record('17 environment', 'a production submission IS gallery-eligible', '1', n::text);

  -- --- the transition is NULL -> preview|production, once, trusted-only ----

  -- (a) CREATION can never set it, by any caller. The immutability trigger
  -- governs UPDATE only, so without the insert guard nulling the column an
  -- inserter could sidestep "NULL -> value once" by being born 'production'.
  insert into public.testimonial_submissions
    (id, client_id, experience_id, experience_user_id, auth_user_id,
     media_type, client_submission_key, consent_version, consented_at,
     attested_no_minors, attested_subjects_consented, environment_marker)
  values
    ('00000000-0000-4000-8000-00000000fa05','00000000-0000-4000-8000-00000000ca01',
     '00000000-0000-4000-8000-00000000ea01','00000000-0000-4000-8000-00000000da01',
     '00000000-0000-4000-8000-0000000000f1',
     'image','aa-key-5','v1', now(), true, true, 'production');

  select count(*) into n from public.testimonial_submissions
  where id = '00000000-0000-4000-8000-00000000fa05' and environment_marker is null;
  perform pg_temp.record('17 environment', 'a trusted INSERT cannot pre-set the marker', '1', n::text);

  -- (b) Only the two known values are reachable. 'staging' is refused by the
  -- CHECK, so the stamp cannot invent an environment.
  perform pg_temp.try_sql('17 environment', 'an unknown environment value is refused',
    'blocked-23514',
    $q$update public.testimonial_submissions set environment_marker = 'staging'
       where id = '00000000-0000-4000-8000-00000000fa05'$q$);

  -- (c) Both legal targets are genuinely reachable from NULL.
  update public.testimonial_submissions set environment_marker = 'preview'
  where id = '00000000-0000-4000-8000-00000000fa05';
  select count(*) into n from public.testimonial_submissions
  where id = '00000000-0000-4000-8000-00000000fa05' and environment_marker = 'preview';
  perform pg_temp.record('17 environment', 'NULL -> preview is permitted for the trusted tier', '1', n::text);

  -- (d) And clearing it back to NULL is refused, so "once" means once in both
  -- directions - not merely "cannot be swapped for the other value".
  perform pg_temp.try_sql('17 environment', 'the marker cannot be cleared back to NULL',
    'blocked-42501',
    $q$update public.testimonial_submissions set environment_marker = null
       where id = '00000000-0000-4000-8000-00000000fa05'$q$);

  -- (e) An UNTRUSTED caller cannot move it at all, even NULL -> value, and is
  -- stopped before the CHECK is ever reached. fa04 still has a NULL marker.
  perform pg_temp.act_as('00000000-0000-4000-8000-0000000000f1');
  perform pg_temp.try_sql('17 environment', 'an untrusted caller cannot stamp an unset marker',
    'blocked-42501',
    $q$update public.testimonial_submissions set environment_marker = 'production'
       where id = '00000000-0000-4000-8000-00000000fa04'$q$);
  perform pg_temp.act_as_ambient();
end $$;

-- ===========================================================================
-- SECTION 18 — the status read, from the trusted tier
--
-- Section 16 proved no browser role can reach the RPC or the view it replaced.
-- These run as the TRUSTED caller, which is the only thing that can reach the
-- function body, and check what that body enforces on its own.
-- ===========================================================================
do $$
declare n int;
begin
  perform pg_temp.act_as_ambient();

  -- Ownership confines the rows: f1 sees only f1's submissions. f1 owns
  -- fa01-fa05; fb01 belongs to f7 in the other tenant.
  select count(*) into n
  from public.list_my_testimonial_submissions('00000000-0000-4000-8000-0000000000f1'::uuid);
  perform pg_temp.record('18 status read', 'a visitor sees exactly their own submissions', '5', n::text);

  select count(*) into n
  from public.list_my_testimonial_submissions('00000000-0000-4000-8000-0000000000f1'::uuid) r
  where r.submission_id = '00000000-0000-4000-8000-00000000fb01';
  perform pg_temp.record('18 status read', 'another tenant''s submission is never returned', '0', n::text);

  -- The filter is what scopes it, not an accident of the fixture set: the
  -- table holds strictly more than f1 can see.
  select count(*) into n from public.testimonial_submissions;
  perform pg_temp.record('18 status read', 'the table holds more rows than one visitor sees', '6', n::text);

  -- f7 OWNS fb01 and is still refused, because f7 is a permanent account.
  -- Ownership is not sufficient here - anonymity is required as well, which is
  -- precisely the rule the revoked view could not express.
  perform pg_temp.try_sql('18 status read', 'a genuine owner who is not anonymous is still refused',
    'blocked-42501',
    $q$select * from public.list_my_testimonial_submissions('00000000-0000-4000-8000-0000000000f7'::uuid)$q$);

  -- ANONYMITY is re-checked here - the rule the view could not express. f2 is
  -- a permanent account (an administrator), and is refused outright rather
  -- than simply returning no rows.
  perform pg_temp.try_sql('18 status read', 'a permanent account is refused, not merely empty',
    'blocked-42501',
    $q$select * from public.list_my_testimonial_submissions('00000000-0000-4000-8000-0000000000f2'::uuid)$q$);

  -- An unknown identity is refused by the same rule: is_anonymous resolves to
  -- NULL, and NULL is not an explicit true.
  perform pg_temp.try_sql('18 status read', 'an unknown identity is refused',
    'blocked-42501',
    $q$select * from public.list_my_testimonial_submissions('00000000-0000-4000-8000-0000000000ff'::uuid)$q$);

  perform pg_temp.try_sql('18 status read', 'a null identity is refused',
    'blocked-42501',
    $q$select * from public.list_my_testimonial_submissions(null::uuid)$q$);

  -- The sanitized column list is enforced by the function signature itself.
  select count(*) into n from information_schema.columns
  where table_schema='public' and table_name='testimonial_my_submissions'
    and column_name in ('auth_user_id','experience_user_id','provider_asset_id',
                        'provider_delivery_id','email','phone_e164','client_id',
                        'reviewed_by','moderation_note');
  perform pg_temp.record('18 status read', 'the status projection exposes no internals', '0', n::text);
end $$;

-- ===========================================================================
-- SECTION 19 — the status view grants NO privilege to any browser role
--
-- Defence in depth. Section 12 asserts the absence of SELECT, which is the
-- verb the boundary change was about. This proves the ENTIRE privilege set is
-- empty for PUBLIC, anon and authenticated - so nothing else was left behind
-- by 20260817160000's original grant, by a Supabase default privilege, or by
-- the view having become auto-updatable when its JOIN became a WHERE EXISTS.
--
-- That last point is why INSERT, UPDATE and DELETE are probed rather than
-- assumed: the view is now a simple single-table view, so PostgreSQL treats it
-- as auto-updatable. Writes through it would still hit the base table's
-- triggers and CHECKs, but "no privilege at all" is the stronger guarantee and
-- it should be measured, not reasoned about.
--
-- MAINTAIN exists only from PostgreSQL 17. It is probed CONDITIONALLY because
-- has_table_privilege() RAISES on an unrecognized privilege name rather than
-- returning false, so an unguarded probe would abort this transaction on 16.
-- ===========================================================================
do $$
declare
  v_role  text;
  v_priv  text;
  v_privs text[];
  v_ver   int := current_setting('server_version_num')::int;
begin
  perform pg_temp.act_as_ambient();

  v_privs := array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'];
  if v_ver >= 170000 then
    v_privs := v_privs || 'MAINTAIN'::text;
  end if;

  -- Recorded so the report says which server this ran against and whether the
  -- MAINTAIN row was actually probed or skipped.
  perform pg_temp.note('19 view privileges', 'server_version_num', v_ver::text);
  perform pg_temp.record('19 view privileges',
    'the probe set includes MAINTAIN on PostgreSQL 17+',
    (v_ver >= 170000)::text,
    (coalesce(array_length(v_privs, 1), 0) = 8)::text);

  foreach v_role in array array['public', 'anon', 'authenticated'] loop
    foreach v_priv in array v_privs loop
      perform pg_temp.record('19 view privileges',
        v_role || ' holds no ' || v_priv || ' on testimonial_my_submissions',
        'false',
        has_table_privilege(v_role, 'public.testimonial_my_submissions', v_priv)::text);
    end loop;
  end loop;
end $$;

-- ===========================================================================
-- RESULTS
-- ===========================================================================
select pg_temp.act_as_ambient();

-- Full listing, failures first.
--
-- Ordering by `passed` ascending puts false before true, so a failure is at
-- the top of this grid rather than buried at whatever sequence number it
-- happened to land on.
select
  seq, section, check_name, expected, actual,
  case when passed then 'PASS' else 'FAIL' end as result
from pg_temp._aa_check_results
order by passed, seq;

-- ---------------------------------------------------------------------------
-- FINAL RESULT — failures and summary in ONE result set.
--
-- The Supabase SQL Editor renders only the LAST statement's result set. The
-- listing above is therefore computed and discarded by that client, which is
-- exactly why a run reporting "1 failed" showed a summary grid and no way to
-- see WHICH assertion failed.
--
-- Combining both into a single final result set fixes that for any client:
-- every failing row is emitted first, with its section, description, expected
-- and actual value, followed by one SUMMARY row. When nothing fails, the
-- failure branch returns no rows and this degrades to the summary alone.
--
-- Read-only. Adds no BEGIN, no COMMIT and no SAVEPOINT; the single ROLLBACK
-- below still ends the one transaction opened at the top of this file.
-- ---------------------------------------------------------------------------
select r.section, r.check_name, r.expected, r.actual, r.result
from (
  select
    0            as ord,
    c.seq        as seq,
    c.section    as section,
    c.check_name as check_name,
    c.expected   as expected,
    c.actual     as actual,
    'FAIL'::text as result
  from pg_temp._aa_check_results c
  where not c.passed

  union all

  -- Every column is cast explicitly, so the UNION's type resolution does not
  -- depend on which branch the planner sees first or on whether the failure
  -- branch returned any rows at all.
  select
    1::int,
    2147483647::int,
    'SUMMARY'::text,
    format('%s total / %s passed / %s failed',
           count(*),
           count(*) filter (where passed),
           count(*) filter (where not passed))::text,
    '0 failed'::text,
    (count(*) filter (where not passed))::text,
    (case when count(*) filter (where not passed) = 0
          then 'ALL CHECKS PASSED' else 'FAILURES PRESENT' end)::text
  from pg_temp._aa_check_results
) r
order by r.ord, r.seq;

rollback;
