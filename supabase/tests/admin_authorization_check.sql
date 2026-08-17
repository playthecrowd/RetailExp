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
-- RESULTS
-- ===========================================================================
select pg_temp.act_as_ambient();

select
  seq, section, check_name, expected, actual,
  case when passed then 'PASS' else 'FAIL' end as result
from pg_temp._aa_check_results
order by seq;

select
  count(*)                                  as total_checks,
  count(*) filter (where passed)            as passed,
  count(*) filter (where not passed)        as failed,
  case when count(*) filter (where not passed) = 0
       then 'ALL CHECKS PASSED' else 'FAILURES PRESENT' end as verdict
from pg_temp._aa_check_results;

rollback;
