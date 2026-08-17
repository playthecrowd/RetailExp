-- ============================================================================
-- Kameleon experience_users — contact capture, identity immutability and RLS.
--
-- Verification gate for:
--   20260817101500_experience_user_contact.sql        (applied)
--   20260817143000_protect_experience_user_identity.sql (NOT yet applied)
--
-- HOW TO RUN
--   Paste the whole file into the Supabase SQL Editor and run it. Everything
--   happens inside one transaction and the final statement is ROLLBACK, so no
--   fixture, user, membership or phone value survives.
--
--   Results are reported twice, because SQL editors differ in which result set
--   they surface:
--     1. RAISE NOTICE lines (Messages/Logs pane), and
--     2. a result grid from the SELECT immediately before the ROLLBACK.
--   If no grid appears, run everything up to and including that SELECT, read
--   the grid, then run ROLLBACK on its own. Do not leave the transaction open.
--
--   Running this BEFORE 20260817143000 is applied is expected to fail the
--   immutability, DELETE and privilege sections. That is the point: those
--   failures are the defect, and they should turn green once it is applied.
--
-- SAFETY
--   * Only fixture rows are read or written, all under fixed 0000...-prefixed
--     UUIDs that cannot collide with real data. Every statement is scoped by
--     those UUIDs.
--   * Contains no credential, key, token, password or connection string.
--   * Phone values come from the reserved fictional NANP range 555-0100..0199;
--     emails use the reserved example.com domain. No real contact data.
--
-- ENVIRONMENT NOTE
--   The auth.users fixture insert is the part most likely to need adjustment:
--   the exact NOT NULL columns of auth.users vary by GoTrue version. If it
--   errors, add the columns it names — do not switch to a different user
--   source, because the RLS policies key off auth.users.id.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- Result collector
-- ----------------------------------------------------------------------------
create temporary table _eu_check_results (
  seq        serial primary key,
  section    text not null,
  check_name text not null,
  expected   text not null,
  actual     text not null,
  passed     boolean not null
) on commit drop;

-- SECURITY DEFINER is required here and is deliberately as narrow as possible.
--
-- WHY: the sections below switch the database role to `authenticated` / `anon`
-- so RLS and column privileges are genuinely enforced against the tested
-- statements. _eu_check_results is a temporary table owned by the SQL Editor's
-- ambient role, and those simulated roles hold no INSERT privilege on it — so
-- recording a PASS/FAIL row would fail with 42501 even when the test itself
-- behaved correctly. The correct fix is to elevate only the bookkeeping, NOT
-- to grant a simulated role access to anything. Do not follow the Supabase
-- hint and add a permanent GRANT: that would weaken a real role to satisfy a
-- test harness.
--
-- SCOPE OF THE ELEVATION — this function:
--   * writes ONLY to the temporary _eu_check_results collector,
--   * touches no application table and no application data,
--   * takes only result-label text arguments,
--   * contains no dynamic SQL,
--   * pins a fixed search_path so no temp object can redirect it, and
--   * runs only AFTER the tested statement has already executed and its
--     outcome has been captured by the caller.
-- It therefore cannot make a prohibited application operation appear to
-- succeed: the pass/fail value is computed from the tested statement's real
-- result before this is ever called. The serial sequence behind `seq` is
-- exercised inside this same function, so no sequence privilege is needed by
-- anon or authenticated either.
--
-- The function exists only in pg_temp for this session and disappears with it;
-- the final ROLLBACK discards the collector and every fixture.
create or replace function pg_temp.record(
  p_section text, p_check text, p_expected text, p_actual text
) returns void
language plpgsql
security definer
set search_path = pg_temp, pg_catalog
as $$
begin
  insert into _eu_check_results (section, check_name, expected, actual, passed)
  values (p_section, p_check, p_expected, p_actual, p_expected is not distinct from p_actual);
  raise notice '[%] % | expected=% actual=% | %',
    p_section, p_check, p_expected, p_actual,
    case when p_expected is not distinct from p_actual then 'PASS' else 'FAIL' end;
end $$;

-- Informational only — never asserted. Used to record WHICH defence layer
-- rejected an operation, since the column-privilege layer and the trigger both
-- raise 42501 and the assertion cannot distinguish them. Same narrow
-- SECURITY DEFINER rationale as pg_temp.record() above.
create or replace function pg_temp.note(p_section text, p_check text, p_value text)
returns void
language plpgsql
security definer
set search_path = pg_temp, pg_catalog
as $$
begin
  insert into _eu_check_results (section, check_name, expected, actual, passed)
  values (p_section, p_check, p_value, p_value, true);
  raise notice '[%] % | %', p_section, p_check, p_value;
end $$;

-- Impersonate an end user the way PostgREST does: set the JWT claims that the
-- auth.uid()/auth.role() helpers read, then switch to the authenticated role so
-- RLS and column privileges are actually enforced (the SQL Editor's own role
-- bypasses both).
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
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.role', 'anon', true);
  execute 'set local role anon';
end $$;

-- Return to the trusted ambient context: no JWT claims at all, so auth.role()
-- is null and the protection triggers take their documented ambient bypass.
-- This is what makes fixture setup and teardown possible.
create or replace function pg_temp.act_as_ambient() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.role', '', true);
end $$;

-- Simulate a service_role request WITHOUT any credential: auth.role() simply
-- reads the JWT claim, so setting the claim is sufficient to exercise the
-- trusted branch of the protection triggers. The database role is left as the
-- editor's own (privileged) role, which is what a real service-role connection
-- also has. No key or token is involved anywhere.
create or replace function pg_temp.act_as_service_role() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('role','service_role')::text, true);
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.role', 'service_role', true);
end $$;

-- ----------------------------------------------------------------------------
-- Section 1 — Fixtures
-- ----------------------------------------------------------------------------
-- Every UUID below uses hexadecimal characters only (0-9, a-f). Section 2
-- re-parses each one through ::uuid as an explicit guard against a
-- non-hexadecimal typo silently reaching a later statement.
--
--   ...0000a1 .. 0000a5  tenant A auth users (end user, 2nd end user, owner,
--                        editor, viewer)
--   ...0000b1            tenant B owner
--   ...00c0a0 / 00c0b0   tenant A / tenant B clients
--   ...00e0a0 / 00e0b0   tenant A / tenant B PUBLISHED experiences
--   ...00e0a1            tenant A DRAFT experience
--   ...00d0a1 / 00d0a2   tenant A experience_users rows
--   ...00d0ff            scratch row used by the constraint probes

insert into auth.users
  (id, instance_id, aud, role, email, encrypted_password,
   email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
values
  ('00000000-0000-4000-8000-0000000000a1','00000000-0000-0000-0000-000000000000','authenticated','authenticated','fixture-a1@example.com','', now(), now(), now(), '{}', '{}'),
  ('00000000-0000-4000-8000-0000000000a2','00000000-0000-0000-0000-000000000000','authenticated','authenticated','fixture-a2@example.com','', now(), now(), now(), '{}', '{}'),
  ('00000000-0000-4000-8000-0000000000a3','00000000-0000-0000-0000-000000000000','authenticated','authenticated','fixture-a3@example.com','', now(), now(), now(), '{}', '{}'),
  ('00000000-0000-4000-8000-0000000000a4','00000000-0000-0000-0000-000000000000','authenticated','authenticated','fixture-a4@example.com','', now(), now(), now(), '{}', '{}'),
  ('00000000-0000-4000-8000-0000000000a5','00000000-0000-0000-0000-000000000000','authenticated','authenticated','fixture-a5@example.com','', now(), now(), now(), '{}', '{}'),
  ('00000000-0000-4000-8000-0000000000b1','00000000-0000-0000-0000-000000000000','authenticated','authenticated','fixture-b1@example.com','', now(), now(), now(), '{}', '{}');

insert into public.clients (id, slug, name, status) values
  ('00000000-0000-4000-8000-00000000c0a0','fixture-tenant-a','Fixture Tenant A','active'),
  ('00000000-0000-4000-8000-00000000c0b0','fixture-tenant-b','Fixture Tenant B','active');

insert into public.experiences (id, client_id, slug, name, publication_status) values
  ('00000000-0000-4000-8000-00000000e0a0','00000000-0000-4000-8000-00000000c0a0','fixture-exp-a','Fixture Experience A','published'),
  ('00000000-0000-4000-8000-00000000e0a1','00000000-0000-4000-8000-00000000c0a0','fixture-exp-a-draft','Fixture Experience A Draft','draft'),
  -- Disposable, used only by the parent-deletion cascade check so the main
  -- fixtures survive it.
  ('00000000-0000-4000-8000-00000000e0a2','00000000-0000-4000-8000-00000000c0a0','fixture-exp-a-cascade','Fixture Experience A Cascade','published'),
  ('00000000-0000-4000-8000-00000000e0b0','00000000-0000-4000-8000-00000000c0b0','fixture-exp-b','Fixture Experience B','published');

insert into public.client_memberships (client_id, user_id, role) values
  ('00000000-0000-4000-8000-00000000c0a0','00000000-0000-4000-8000-0000000000a3','owner'),
  ('00000000-0000-4000-8000-00000000c0a0','00000000-0000-4000-8000-0000000000a4','editor'),
  ('00000000-0000-4000-8000-00000000c0a0','00000000-0000-4000-8000-0000000000a5','viewer'),
  ('00000000-0000-4000-8000-00000000c0b0','00000000-0000-4000-8000-0000000000b1','owner');

insert into public.experience_users
  (id, experience_id, client_id, auth_user_id, display_name, email, phone_e164)
values
  ('00000000-0000-4000-8000-00000000d0a1','00000000-0000-4000-8000-00000000e0a0','00000000-0000-4000-8000-00000000c0a0','00000000-0000-4000-8000-0000000000a1','Fixture Alpha','fixture-a1@example.com','+12125550123'),
  ('00000000-0000-4000-8000-00000000d0a2','00000000-0000-4000-8000-00000000e0a0','00000000-0000-4000-8000-00000000c0a0','00000000-0000-4000-8000-0000000000a2','Fixture Beta','fixture-a2@example.com','+12125550124'),
  -- Disposable: consumed by the parent-deletion cascade check.
  ('00000000-0000-4000-8000-00000000d0a3','00000000-0000-4000-8000-00000000e0a2','00000000-0000-4000-8000-00000000c0a0','00000000-0000-4000-8000-0000000000a2','Fixture Cascade','fixture-a2@example.com','+12125550131'),
  -- Disposable: consumed by the service-role administrative cleanup check.
  ('00000000-0000-4000-8000-00000000d0a4','00000000-0000-4000-8000-00000000e0a0','00000000-0000-4000-8000-00000000c0a0','00000000-0000-4000-8000-0000000000a5','Fixture Cleanup','fixture-a5@example.com','+12125550132');

-- Dependent rows, so the DELETE section can prove they survive.
insert into public.journey_progress (experience_user_id, client_id)
values ('00000000-0000-4000-8000-00000000d0a1','00000000-0000-4000-8000-00000000c0a0');

insert into public.experience_user_rewards
  (experience_user_id, client_id, reward_key, points_awarded, status)
values ('00000000-0000-4000-8000-00000000d0a1','00000000-0000-4000-8000-00000000c0a0','kameleon_bottle_pedestal', 0, 'pending');

-- ----------------------------------------------------------------------------
-- Section 2 — Fixture UUID validity guard
-- ----------------------------------------------------------------------------
do $$
declare ids text[] := array[
  '00000000-0000-4000-8000-0000000000a1','00000000-0000-4000-8000-0000000000a2',
  '00000000-0000-4000-8000-0000000000a3','00000000-0000-4000-8000-0000000000a4',
  '00000000-0000-4000-8000-0000000000a5','00000000-0000-4000-8000-0000000000b1',
  '00000000-0000-4000-8000-00000000c0a0','00000000-0000-4000-8000-00000000c0b0',
  '00000000-0000-4000-8000-00000000e0a0','00000000-0000-4000-8000-00000000e0a1',
  '00000000-0000-4000-8000-00000000e0a2','00000000-0000-4000-8000-00000000e0b0',
  '00000000-0000-4000-8000-00000000d0a1','00000000-0000-4000-8000-00000000d0a2',
  '00000000-0000-4000-8000-00000000d0a3','00000000-0000-4000-8000-00000000d0a4',
  '00000000-0000-4000-8000-00000000d0ff'];
  bad int := 0;
  i text;
begin
  foreach i in array ids loop
    begin
      perform i::uuid;
    exception when others then bad := bad + 1;
    end;
  end loop;
  perform pg_temp.record('fixtures','every fixture UUID parses as a PostgreSQL uuid','0', bad::text);
  perform pg_temp.record('fixtures','fixture UUID count','17', array_length(ids,1)::text);
end $$;

-- ----------------------------------------------------------------------------
-- Section 3 — Schema shape
-- ----------------------------------------------------------------------------
do $$
declare v text;
begin
  select data_type into v from information_schema.columns
   where table_schema='public' and table_name='experience_users' and column_name='phone_e164';
  perform pg_temp.record('schema','phone_e164 exists','text', coalesce(v,'MISSING'));

  select is_nullable into v from information_schema.columns
   where table_schema='public' and table_name='experience_users' and column_name='phone_e164';
  perform pg_temp.record('schema','phone_e164 is nullable','YES', coalesce(v,'MISSING'));

  perform pg_temp.record('schema','first_name NOT added','absent',
    coalesce((select 'present' from information_schema.columns
      where table_schema='public' and table_name='experience_users' and column_name='first_name'),'absent'));
  perform pg_temp.record('schema','last_name NOT added','absent',
    coalesce((select 'present' from information_schema.columns
      where table_schema='public' and table_name='experience_users' and column_name='last_name'),'absent'));
  perform pg_temp.record('schema','phone_verified_at NOT added','absent',
    coalesce((select 'present' from information_schema.columns
      where table_schema='public' and table_name='experience_users' and column_name='phone_verified_at'),'absent'));
  perform pg_temp.record('schema','phone_format_valid NOT added','absent',
    coalesce((select 'present' from information_schema.columns
      where table_schema='public' and table_name='experience_users' and column_name='phone_format_valid'),'absent'));
  perform pg_temp.record('schema','no consent column added','absent',
    coalesce((select 'present' from information_schema.columns
      where table_schema='public' and table_name='experience_users'
        and (column_name like '%consent%' or column_name like '%marketing%' or column_name like '%sms%')
      limit 1),'absent'));

  perform pg_temp.record('schema','pre-existing columns intact','7',
    (select count(*)::text from information_schema.columns
      where table_schema='public' and table_name='experience_users'
        and column_name in ('id','experience_id','client_id','auth_user_id','display_name','email','created_at')));

  perform pg_temp.record('schema','RLS still enabled','true',
    (select relrowsecurity::text from pg_class where oid='public.experience_users'::regclass));

  perform pg_temp.record('schema','phone CHECK constraint present','1',
    (select count(*)::text from pg_constraint
      where conrelid='public.experience_users'::regclass
        and conname='experience_users_phone_e164_format'));

  -- The pre-existing tenant-consistency trigger must survive untouched.
  perform pg_temp.record('schema','tenant-consistency trigger preserved','1',
    (select count(*)::text from pg_trigger
      where tgrelid='public.experience_users'::regclass
        and tgname='experience_users_enforce_client_consistency' and not tgisinternal));

  perform pg_temp.record('schema','identity-protection trigger present','1',
    (select count(*)::text from pg_trigger
      where tgrelid='public.experience_users'::regclass
        and tgname='experience_users_00_protect_identity' and not tgisinternal));

  perform pg_temp.record('schema','deletion-protection trigger present','1',
    (select count(*)::text from pg_trigger
      where tgrelid='public.experience_users'::regclass
        and tgname='experience_users_00_protect_deletion' and not tgisinternal));

  -- Deterministic SQLSTATE depends on the identity trigger sorting first.
  perform pg_temp.record('schema','identity trigger sorts before consistency trigger','true',
    (select ('experience_users_00_protect_identity' < 'experience_users_enforce_client_consistency')::text));
end $$;

-- ----------------------------------------------------------------------------
-- Section 4 — Policy set, verified by exact name (not by count alone)
-- ----------------------------------------------------------------------------
do $$
begin
  perform pg_temp.record('policies','experience_users_select_members present','1',
    (select count(*)::text from pg_policies where schemaname='public'
       and tablename='experience_users' and policyname='experience_users_select_members'));
  perform pg_temp.record('policies','experience_users_select_own present','1',
    (select count(*)::text from pg_policies where schemaname='public'
       and tablename='experience_users' and policyname='experience_users_select_own'));
  perform pg_temp.record('policies','experience_users_insert_own present','1',
    (select count(*)::text from pg_policies where schemaname='public'
       and tablename='experience_users' and policyname='experience_users_insert_own'));
  perform pg_temp.record('policies','experience_users_update_own present','1',
    (select count(*)::text from pg_policies where schemaname='public'
       and tablename='experience_users' and policyname='experience_users_update_own'));

  perform pg_temp.record('policies','experience_users_write_own REMOVED','0',
    (select count(*)::text from pg_policies where schemaname='public'
       and tablename='experience_users' and policyname='experience_users_write_own'));

  perform pg_temp.record('policies','no DELETE policy exists','0',
    (select count(*)::text from pg_policies where schemaname='public'
       and tablename='experience_users' and cmd in ('DELETE','ALL')));

  perform pg_temp.record('policies','no unexpected policy present','0',
    (select count(*)::text from pg_policies where schemaname='public'
       and tablename='experience_users'
       and policyname not in ('experience_users_select_members','experience_users_select_own',
                              'experience_users_insert_own','experience_users_update_own')));

  perform pg_temp.record('policies','insert policy keeps published guard','true',
    (select (with_check like '%published%')::text from pg_policies where schemaname='public'
       and tablename='experience_users' and policyname='experience_users_insert_own'));
  perform pg_temp.record('policies','update policy keeps published guard','true',
    (select (with_check like '%published%')::text from pg_policies where schemaname='public'
       and tablename='experience_users' and policyname='experience_users_update_own'));
end $$;

-- ----------------------------------------------------------------------------
-- Section 5 — Column and table privileges
-- ----------------------------------------------------------------------------
do $$
begin
  perform pg_temp.record('privileges','authenticated may UPDATE display_name','true',
    has_column_privilege('authenticated','public.experience_users','display_name','UPDATE')::text);
  perform pg_temp.record('privileges','authenticated may UPDATE email','true',
    has_column_privilege('authenticated','public.experience_users','email','UPDATE')::text);
  perform pg_temp.record('privileges','authenticated may UPDATE phone_e164','true',
    has_column_privilege('authenticated','public.experience_users','phone_e164','UPDATE')::text);

  perform pg_temp.record('privileges','authenticated may NOT UPDATE id','false',
    has_column_privilege('authenticated','public.experience_users','id','UPDATE')::text);
  perform pg_temp.record('privileges','authenticated may NOT UPDATE auth_user_id','false',
    has_column_privilege('authenticated','public.experience_users','auth_user_id','UPDATE')::text);
  perform pg_temp.record('privileges','authenticated may NOT UPDATE client_id','false',
    has_column_privilege('authenticated','public.experience_users','client_id','UPDATE')::text);
  perform pg_temp.record('privileges','authenticated may NOT UPDATE experience_id','false',
    has_column_privilege('authenticated','public.experience_users','experience_id','UPDATE')::text);

  perform pg_temp.record('privileges','anon has no UPDATE on any column','false',
    has_any_column_privilege('anon','public.experience_users','UPDATE')::text);

  perform pg_temp.record('privileges','authenticated has no DELETE','false',
    has_table_privilege('authenticated','public.experience_users','DELETE')::text);
  perform pg_temp.record('privileges','anon has no DELETE','false',
    has_table_privilege('anon','public.experience_users','DELETE')::text);

  -- SELECT visibility must be untouched by the corrective migration.
  perform pg_temp.record('privileges','authenticated retains SELECT','true',
    has_table_privilege('authenticated','public.experience_users','SELECT')::text);
end $$;

-- ----------------------------------------------------------------------------
-- Section 6 — phone_e164 CHECK constraint
-- Each rejection asserts SQLSTATE 23514 precisely, so a failure for any other
-- reason records as other-error:<sqlstate> and can never pass as the
-- constraint doing its job. Runs in the ambient context (no JWT claims).
-- ----------------------------------------------------------------------------
select pg_temp.act_as_ambient();

create or replace function pg_temp.try_phone(p_label text, p_value text, p_should_pass boolean)
returns void language plpgsql as $$
declare outcome text;
begin
  begin
    insert into public.experience_users (id, experience_id, client_id, auth_user_id, phone_e164)
    values ('00000000-0000-4000-8000-00000000d0ff','00000000-0000-4000-8000-00000000e0a0',
            '00000000-0000-4000-8000-00000000c0a0', null, p_value);
    outcome := 'accepted';
    delete from public.experience_users where id='00000000-0000-4000-8000-00000000d0ff';
  exception
    when sqlstate '23514' then outcome := 'rejected';        -- check_violation
    when others then outcome := 'other-error:' || sqlstate;
  end;
  perform pg_temp.record('constraint', p_label,
    case when p_should_pass then 'accepted' else 'rejected' end, outcome);
end $$;

select pg_temp.try_phone('NULL accepted',                        null,                true);
select pg_temp.try_phone('normalized +1 accepted',               '+12125550123',      true);
select pg_temp.try_phone('non-+1 E.164 accepted',                '+447700900123',     true);
select pg_temp.try_phone('minimum-length E.164 accepted',        '+2412345678',       true);
select pg_temp.try_phone('maximum-length E.164 accepted',        '+493012345678901',  true);
select pg_temp.try_phone('missing + rejected',                   '2125550123',        false);
select pg_temp.try_phone('+0 country code rejected',             '+0125550123',       false);
select pg_temp.try_phone('too few digits rejected',              '+1212555',          false);
select pg_temp.try_phone('too many digits rejected',             '+1212555012345678', false);
select pg_temp.try_phone('letters rejected',                     '+1212ABC0123',      false);
select pg_temp.try_phone('punctuation rejected',                 '+1 (212) 555-0123', false);
select pg_temp.try_phone('surrounding whitespace rejected',      '  +12125550123 ',   false);
select pg_temp.try_phone('empty string rejected',                '',                  false);
select pg_temp.try_phone('injection-shaped value rejected as data',
                         ''';drop table public.experience_users;--',                  false);

-- ----------------------------------------------------------------------------
-- Section 7 — Approved contact updates still work
-- ----------------------------------------------------------------------------
do $$
declare n int; v text;
begin
  perform pg_temp.act_as('00000000-0000-4000-8000-0000000000a1');

  select count(*) into n from public.experience_users
   where id='00000000-0000-4000-8000-00000000d0a1';
  perform pg_temp.record('contact','end user reads own row','1', n::text);

  update public.experience_users set display_name='Fixture Alpha Renamed'
   where id='00000000-0000-4000-8000-00000000d0a1';
  get diagnostics n = row_count;
  perform pg_temp.record('contact','own display_name update succeeds','1', n::text);

  update public.experience_users set email='fixture-a1-new@example.com'
   where id='00000000-0000-4000-8000-00000000d0a1';
  get diagnostics n = row_count;
  perform pg_temp.record('contact','own email update succeeds','1', n::text);

  update public.experience_users set phone_e164='+12125550190'
   where id='00000000-0000-4000-8000-00000000d0a1';
  get diagnostics n = row_count;
  perform pg_temp.record('contact','own phone update succeeds','1', n::text);

  -- Another user's row stays completely inaccessible.
  update public.experience_users set phone_e164='+12125550199'
   where id='00000000-0000-4000-8000-00000000d0a2';
  get diagnostics n = row_count;
  perform pg_temp.record('contact','cannot update another user row','0', n::text);

  select count(*) into n from public.experience_users
   where id='00000000-0000-4000-8000-00000000d0a2';
  perform pg_temp.record('contact','cannot read another user row','0', n::text);

  perform pg_temp.act_as_ambient();

  select phone_e164 into v from public.experience_users
   where id='00000000-0000-4000-8000-00000000d0a1';
  perform pg_temp.record('contact','own phone actually changed','+12125550190', coalesce(v,'NULL'));

  select phone_e164 into v from public.experience_users
   where id='00000000-0000-4000-8000-00000000d0a2';
  perform pg_temp.record('contact','other user phone unchanged','+12125550124', coalesce(v,'NULL'));
end $$;
select pg_temp.act_as_ambient();

-- ----------------------------------------------------------------------------
-- Section 8 — Identity and tenant immutability. Every case expects 42501.
-- ----------------------------------------------------------------------------
-- NOTE ON WHICH LAYER FIRES: for id / auth_user_id / client_id / experience_id
-- the column-privilege layer rejects the statement before the trigger runs.
-- Both layers raise 42501, so the assertion is identical either way; the
-- informational rows below record which message was produced, so a reader is
-- never misled about which defence was exercised.
-- DELIBERATELY SECURITY INVOKER (the default). This function EXECUTEs the
-- statement under test, so it must run with the caller's simulated role —
-- making it SECURITY DEFINER would run every tested UPDATE as the owner,
-- bypassing RLS, the column privileges and the protection triggers, and every
-- immutability check below would silently pass for the wrong reason. Only the
-- pg_temp.record()/note() calls at the end are elevated, and only after the
-- outcome has already been captured.
create or replace function pg_temp.try_identity(p_label text, p_sql text)
returns void language plpgsql as $$
declare outcome text; layer text; msg text;
begin
  begin
    execute p_sql;
    outcome := 'ALLOWED';
    layer   := 'none — statement succeeded';
  exception
    when sqlstate '42501' then
      outcome := 'blocked-42501';
      get stacked diagnostics msg = message_text;
      layer := case when msg like '%permission denied%' then 'column privilege' else 'trigger' end;
    when sqlstate 'P0001' then
      outcome := 'blocked-P0001';
      layer   := 'consistency trigger (wrong SQLSTATE — ordering issue)';
    when others then
      outcome := 'other-error:' || sqlstate;
      layer   := 'unexpected';
  end;
  perform pg_temp.record('immutability', p_label, 'blocked-42501', outcome);
  perform pg_temp.note('immutability', p_label || ' — rejecting layer', layer);
end $$;

do $$
begin
  perform pg_temp.act_as('00000000-0000-4000-8000-0000000000a1');

  perform pg_temp.try_identity('id change blocked',
    $q$update public.experience_users set id='00000000-0000-4000-8000-00000000d0fe'
        where id='00000000-0000-4000-8000-00000000d0a1'$q$);

  perform pg_temp.try_identity('auth_user_id change blocked',
    $q$update public.experience_users set auth_user_id='00000000-0000-4000-8000-0000000000a2'
        where id='00000000-0000-4000-8000-00000000d0a1'$q$);

  perform pg_temp.try_identity('client_id change blocked',
    $q$update public.experience_users set client_id='00000000-0000-4000-8000-00000000c0b0'
        where id='00000000-0000-4000-8000-00000000d0a1'$q$);

  perform pg_temp.try_identity('experience_id change blocked',
    $q$update public.experience_users set experience_id='00000000-0000-4000-8000-00000000e0b0'
        where id='00000000-0000-4000-8000-00000000d0a1'$q$);

  -- Same-client experience hop: coherent, so the consistency trigger alone
  -- never objected to it.
  perform pg_temp.try_identity('same-client experience hop blocked',
    $q$update public.experience_users set experience_id='00000000-0000-4000-8000-00000000e0a1'
        where id='00000000-0000-4000-8000-00000000d0a1'$q$);

  -- The original finding: a consistent cross-tenant pair.
  perform pg_temp.try_identity('consistent cross-tenant move blocked',
    $q$update public.experience_users
          set client_id='00000000-0000-4000-8000-00000000c0b0',
              experience_id='00000000-0000-4000-8000-00000000e0b0'
        where id='00000000-0000-4000-8000-00000000d0a1'$q$);

  perform pg_temp.act_as_ambient();
end $$;
select pg_temp.act_as_ambient();

-- The row must still be exactly where it started.
do $$
declare c uuid; e uuid;
begin
  select client_id, experience_id into c, e from public.experience_users
   where id='00000000-0000-4000-8000-00000000d0a1';
  perform pg_temp.record('immutability','row still in tenant A',
    '00000000-0000-4000-8000-00000000c0a0', coalesce(c::text,'NULL'));
  perform pg_temp.record('immutability','row still on experience A',
    '00000000-0000-4000-8000-00000000e0a0', coalesce(e::text,'NULL'));
end $$;

-- ----------------------------------------------------------------------------
-- Section 9 — DELETE is closed to end users
-- ----------------------------------------------------------------------------
do $$
declare outcome text; n int;
begin
  perform pg_temp.act_as('00000000-0000-4000-8000-0000000000a1');
  begin
    delete from public.experience_users where id='00000000-0000-4000-8000-00000000d0a1';
    outcome := 'ALLOWED';
  exception
    when sqlstate '42501' then outcome := 'blocked-42501';
    when others then outcome := 'other-error:' || sqlstate;
  end;
  perform pg_temp.record('delete','authenticated cannot delete own enrollment','blocked-42501', outcome);
  perform pg_temp.act_as_ambient();

  perform pg_temp.act_as_anon();
  begin
    delete from public.experience_users where id='00000000-0000-4000-8000-00000000d0a1';
    outcome := 'ALLOWED';
  exception
    when sqlstate '42501' then outcome := 'blocked-42501';
    when others then outcome := 'other-error:' || sqlstate;
  end;
  perform pg_temp.record('delete','anon cannot delete','blocked-42501', outcome);
  perform pg_temp.act_as_ambient();

  select count(*) into n from public.experience_users
   where id='00000000-0000-4000-8000-00000000d0a1';
  perform pg_temp.record('delete','enrollment row survives','1', n::text);

  select count(*) into n from public.journey_progress
   where experience_user_id='00000000-0000-4000-8000-00000000d0a1';
  perform pg_temp.record('delete','journey_progress survives','1', n::text);

  select count(*) into n from public.experience_user_rewards
   where experience_user_id='00000000-0000-4000-8000-00000000d0a1';
  perform pg_temp.record('delete','experience_user_rewards survives','1', n::text);
end $$;
select pg_temp.act_as_ambient();

-- 9b. Client authority in the deletion trigger must NOT translate into a
--     direct delete. The trigger would recognise an editor's/owner's client
--     authority, but the REVOKE means PostgreSQL rejects the statement on
--     table privileges before the trigger is ever consulted — which is exactly
--     why the administrative bypass does not re-open browser deletion.
do $$
declare outcome text; n int;
begin
  perform pg_temp.act_as('00000000-0000-4000-8000-0000000000a4');   -- editor
  begin
    delete from public.experience_users where id='00000000-0000-4000-8000-00000000d0a1';
    outcome := 'ALLOWED';
  exception
    when sqlstate '42501' then outcome := 'blocked-42501';
    when others then outcome := 'other-error:' || sqlstate;
  end;
  perform pg_temp.record('delete','editor cannot directly delete an experience-user row','blocked-42501', outcome);
  perform pg_temp.act_as_ambient();

  perform pg_temp.act_as('00000000-0000-4000-8000-0000000000a3');   -- owner
  begin
    delete from public.experience_users where id='00000000-0000-4000-8000-00000000d0a1';
    outcome := 'ALLOWED';
  exception
    when sqlstate '42501' then outcome := 'blocked-42501';
    when others then outcome := 'other-error:' || sqlstate;
  end;
  perform pg_temp.record('delete','owner cannot directly delete through the browser role','blocked-42501', outcome);
  perform pg_temp.act_as_ambient();

  select count(*) into n from public.experience_users
   where id='00000000-0000-4000-8000-00000000d0a1';
  perform pg_temp.record('delete','row still present after editor/owner attempts','1', n::text);
end $$;
select pg_temp.act_as_ambient();

-- 9c. The authorized parent-delete path must still cascade. An editor deleting
--     an experience they can edit (experiences_write_editors, FOR ALL) removes
--     the disposable enrollment beneath it. Referential cascades bypass table
--     privileges and RLS, but ordinary row triggers still fire — so this only
--     succeeds because the deletion trigger recognises can_edit_client().
do $$
declare outcome text; n int;
begin
  perform pg_temp.act_as('00000000-0000-4000-8000-0000000000a4');   -- editor
  begin
    delete from public.experiences where id='00000000-0000-4000-8000-00000000e0a2';
    outcome := 'accepted';
  exception
    when sqlstate '42501' then outcome := 'blocked-42501';
    when others then outcome := 'other-error:' || sqlstate;
  end;
  perform pg_temp.record('delete','authorized parent deletion still permitted','accepted', outcome);
  perform pg_temp.act_as_ambient();

  select count(*) into n from public.experience_users
   where id='00000000-0000-4000-8000-00000000d0a3';
  perform pg_temp.record('delete','cascade removed the child enrollment','0', n::text);
end $$;
select pg_temp.act_as_ambient();

-- 9d. Trusted administrative cleanup remains possible. auth.role() reads the
--     JWT claim, so this exercises the service_role branch with no credential.
do $$
declare outcome text; n int;
begin
  perform pg_temp.act_as_service_role();
  begin
    delete from public.experience_users where id='00000000-0000-4000-8000-00000000d0a4';
    outcome := 'accepted';
  exception
    when sqlstate '42501' then outcome := 'blocked-42501';
    when others then outcome := 'other-error:' || sqlstate;
  end;
  perform pg_temp.record('delete','service_role administrative cleanup permitted','accepted', outcome);
  perform pg_temp.act_as_ambient();

  select count(*) into n from public.experience_users
   where id='00000000-0000-4000-8000-00000000d0a4';
  perform pg_temp.record('delete','service_role cleanup actually removed the row','0', n::text);
end $$;
select pg_temp.act_as_ambient();

-- ----------------------------------------------------------------------------
-- Section 10 — Self-enrolment INSERT is unchanged
-- ----------------------------------------------------------------------------
do $$
declare outcome text;
begin
  -- a3 has no enrollment yet, so it can create one in the published experience.
  perform pg_temp.act_as('00000000-0000-4000-8000-0000000000a3');
  begin
    insert into public.experience_users (experience_id, client_id, auth_user_id)
    values ('00000000-0000-4000-8000-00000000e0a0','00000000-0000-4000-8000-00000000c0a0',
            '00000000-0000-4000-8000-0000000000a3');
    outcome := 'accepted';
  exception when others then outcome := 'rejected:' || sqlstate;
  end;
  perform pg_temp.record('enrolment','self-enrolment into published experience succeeds','accepted', outcome);

  begin
    insert into public.experience_users (experience_id, client_id, auth_user_id)
    values ('00000000-0000-4000-8000-00000000e0a1','00000000-0000-4000-8000-00000000c0a0',
            '00000000-0000-4000-8000-0000000000a3');
    outcome := 'accepted';
  exception
    when sqlstate '42501' then outcome := 'blocked-42501';
    when others then outcome := 'other-error:' || sqlstate;
  end;
  perform pg_temp.record('enrolment','self-enrolment into DRAFT experience denied','blocked-42501', outcome);

  -- The pre-existing tenant-consistency trigger must still reject a mismatched
  -- client/experience pair at INSERT time (P0001 from its RAISE EXCEPTION).
  begin
    insert into public.experience_users (experience_id, client_id, auth_user_id)
    values ('00000000-0000-4000-8000-00000000e0b0','00000000-0000-4000-8000-00000000c0a0',
            '00000000-0000-4000-8000-0000000000a3');
    outcome := 'accepted';
  exception
    when sqlstate 'P0001' then outcome := 'blocked-P0001';
    when sqlstate '42501' then outcome := 'blocked-42501';
    when others then outcome := 'other-error:' || sqlstate;
  end;
  perform pg_temp.record('enrolment','mismatched client/experience still rejected','blocked-P0001', outcome);

  perform pg_temp.act_as_ambient();
end $$;
select pg_temp.act_as_ambient();

-- ----------------------------------------------------------------------------
-- Section 11 — Administrative PII visibility is unchanged
-- ----------------------------------------------------------------------------
do $$
declare n int;
begin
  perform pg_temp.act_as('00000000-0000-4000-8000-0000000000a4');   -- editor
  select count(*) into n from public.experience_users
   where id='00000000-0000-4000-8000-00000000d0a1' and phone_e164 is not null;
  perform pg_temp.record('pii','editor cannot read customer phone','0', n::text);
  perform pg_temp.act_as_ambient();

  perform pg_temp.act_as('00000000-0000-4000-8000-0000000000a5');   -- viewer
  select count(*) into n from public.experience_users
   where id='00000000-0000-4000-8000-00000000d0a1' and phone_e164 is not null;
  perform pg_temp.record('pii','viewer cannot read customer phone','0', n::text);
  perform pg_temp.act_as_ambient();

  perform pg_temp.act_as('00000000-0000-4000-8000-0000000000a3');   -- same-client owner
  select count(*) into n from public.experience_users
   where id='00000000-0000-4000-8000-00000000d0a1' and phone_e164 is not null;
  perform pg_temp.record('pii','same-client owner can read phone','1', n::text);
  perform pg_temp.act_as_ambient();

  perform pg_temp.act_as('00000000-0000-4000-8000-0000000000b1');   -- cross-client owner
  select count(*) into n from public.experience_users
   where id='00000000-0000-4000-8000-00000000d0a1';
  perform pg_temp.record('pii','cross-client owner cannot read row','0', n::text);
  perform pg_temp.act_as_ambient();
end $$;
select pg_temp.act_as_ambient();

-- ----------------------------------------------------------------------------
-- Section 12 — Anonymous, unauthenticated request
-- ----------------------------------------------------------------------------
do $$
declare n int; outcome text;
begin
  perform pg_temp.act_as_anon();

  select count(*) into n from public.experience_users
   where id='00000000-0000-4000-8000-00000000d0a1';
  perform pg_temp.record('anon','anonymous cannot read contact data','0', n::text);

  begin
    update public.experience_users set phone_e164='+12125550111'
     where id='00000000-0000-4000-8000-00000000d0a1';
    get diagnostics n = row_count;
    outcome := case when n = 0 then 'no-rows' else 'ALLOWED' end;
  exception
    when sqlstate '42501' then outcome := 'blocked-42501';
    when others then outcome := 'other-error:' || sqlstate;
  end;
  perform pg_temp.record('anon','anonymous cannot alter contact data','blocked-42501', outcome);

  perform pg_temp.act_as_ambient();
end $$;
select pg_temp.act_as_ambient();

-- ----------------------------------------------------------------------------
-- Section 13 — Summary
-- ----------------------------------------------------------------------------
do $$
declare failed int;
begin
  select count(*) into failed from _eu_check_results where not passed;
  if failed = 0 then
    raise notice '=== ALL CHECKS PASSED (% total) ===', (select count(*) from _eu_check_results);
  else
    raise warning '=== % CHECK(S) FAILED — see rows where result = FAIL ===', failed;
  end if;
end $$;

select seq, section, check_name, expected, actual,
       case when passed then 'PASS' else 'FAIL' end as result
  from _eu_check_results
 order by seq;

-- ----------------------------------------------------------------------------
-- Nothing above is kept: every fixture user, client, experience, membership,
-- enrollment, progress row, reward row and phone value is discarded here.
-- ----------------------------------------------------------------------------
rollback;
