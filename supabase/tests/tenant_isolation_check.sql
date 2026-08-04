-- Phase 7 — tenant isolation verification.
--
-- Run against the linked project via the Supabase Dashboard's SQL Editor
-- (paste this whole file and Run) — no CLI subcommand executes an
-- arbitrary .sql file against a remote project, and this avoids ever
-- needing a raw database password/connection string. Uses the same
-- session-variable technique PostgREST uses to simulate an authenticated
-- request (`request.jwt.claims`), so these checks exercise the exact RLS
-- policies a real API call would.
--
-- Run after the initial-client-records migration has been applied (the
-- legitimate Kameleon client/experience now come from a tracked
-- migration, not supabase/seed.sql, which is intentionally empty — see
-- 20260804200621_initial_client_records.sql).
--
-- This file owns ALL of its own test fixtures, including the second
-- ("other tenant") client/experience used to prove isolation —
-- supabase/seed.sql must never contain throwaway/fixture data. Everything
-- below runs inside one transaction that is always rolled back at the
-- end, so nothing here is ever left behind in a real project.

begin;

-- --- Fixtures: two throwaway tenants, admins, and a minimal content graph ---

insert into auth.users (id, email) values
  ('10000000-0000-0000-0000-000000000001', 'kameleon-admin@example.test'),
  ('10000000-0000-0000-0000-000000000002', 'other-tenant-admin@example.test'),
  ('10000000-0000-0000-0000-000000000003', 'kameleon-editor@example.test')
on conflict (id) do nothing;

-- The real Kameleon client (seeded by supabase/seed.sql) is used as-is;
-- looked up by slug, never assumed by id, matching the idempotency fix.
-- A second, fully throwaway tenant is created here, scoped to this
-- transaction only.

insert into public.clients (id, slug, name, status) values
  ('90000000-0000-0000-0000-000000000001', 'isolation-check-tenant', 'Isolation Check Tenant (test fixture)', 'active')
on conflict (id) do nothing;

insert into public.experiences (id, client_id, slug, name, experience_type, signup_required, publication_status)
values (
  '90000000-0000-0000-0000-000000000002',
  '90000000-0000-0000-0000-000000000001',
  'isolation-check',
  'Isolation Check Experience (test fixture)',
  'branching-video',
  false,
  'draft'
)
on conflict (id) do nothing;

insert into public.client_memberships (client_id, user_id, role) values
  ((select id from public.clients where slug = 'kameleon'), '10000000-0000-0000-0000-000000000001', 'owner'),
  ((select id from public.clients where slug = 'kameleon'), '10000000-0000-0000-0000-000000000003', 'editor'),
  ('90000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', 'owner')
on conflict (client_id, user_id) do nothing;

-- Fixture sanity check: this INSERT previously failed here (before any of
-- the 8 checks below ever ran) because protect_membership_role_changes()
-- didn't recognize an ambient/no-JWT-context connection as trusted — see
-- 20260804210404_fix_role_promotion_ambient_connection.sql. Asserting the
-- fixture actually landed makes any future regression here fail loudly
-- and unambiguously, instead of surfacing as a confusing mid-script error
-- with no indication it happened before Check 1 even started.
do $$
declare
  fixture_membership_count integer;
begin
  select count(*) into fixture_membership_count
  from public.client_memberships
  where user_id in (
    '10000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000003'
  );
  if fixture_membership_count <> 3 then
    raise exception 'FIXTURE SETUP FAILED: expected 3 client_memberships fixture rows, found %. None of the numbered checks below ran.', fixture_membership_count;
  end if;
  raise notice 'Fixture setup OK: % client_memberships rows created', fixture_membership_count;
end $$;

-- A minimal content graph on the Kameleon side, so the choices/media_assets
-- cross-tenant checks below have real rows to try (and fail) to connect
-- across.

insert into public.content_nodes (id, client_id, experience_id, node_type, internal_name, title)
select
  '90000000-0000-0000-0000-000000000010',
  c.id,
  (select id from public.experiences where slug = 'kameleon' and client_id = c.id),
  'pathway_chapter',
  'isolation-check-node-a',
  'Isolation Check Node A'
from public.clients c where c.slug = 'kameleon'
on conflict (id) do nothing;

insert into public.content_nodes (id, client_id, experience_id, node_type, internal_name, title)
values (
  '90000000-0000-0000-0000-000000000011',
  '90000000-0000-0000-0000-000000000001',
  '90000000-0000-0000-0000-000000000002',
  'pathway_chapter',
  'isolation-check-node-b',
  'Isolation Check Node B (other tenant)'
)
on conflict (id) do nothing;

-- --- Check 1: anonymous role can never read `clients` directly ---------------

set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

do $$
declare
  row_count integer;
begin
  select count(*) into row_count from public.clients;
  if row_count <> 0 then
    raise exception 'FAIL: anon role read % rows from clients (expected 0)', row_count;
  end if;
  raise notice 'PASS: anon cannot read clients';
end $$;

reset role;

-- --- Check 2: Kameleon's admin cannot see the other tenant's membership ------

set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';

do $$
declare
  visible_clients integer;
  visible_other_tenant integer;
begin
  select count(*) into visible_clients from public.clients;
  if visible_clients <> 1 then
    raise exception 'FAIL: Kameleon admin sees % client rows (expected exactly 1 — their own)', visible_clients;
  end if;

  select count(*) into visible_other_tenant
  from public.client_memberships
  where client_id = '90000000-0000-0000-0000-000000000001';
  if visible_other_tenant <> 0 then
    raise exception 'FAIL: Kameleon admin can see % membership rows for the other tenant (expected 0)', visible_other_tenant;
  end if;

  raise notice 'PASS: Kameleon admin is isolated from the other tenant';
end $$;

reset role;

-- --- Check 3: Kameleon's admin cannot update the other tenant's experience ---

set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';

do $$
declare
  affected integer;
begin
  update public.experiences
  set name = 'HIJACKED'
  where id = '90000000-0000-0000-0000-000000000002';
  get diagnostics affected = row_count;
  if affected <> 0 then
    raise exception 'FAIL: Kameleon admin updated % rows in the other tenant''s experiences (expected 0)', affected;
  end if;
  raise notice 'PASS: Kameleon admin cannot write to the other tenant''s experience';
end $$;

reset role;

-- --- Check 4: a member cannot change their own client_memberships role ------

set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';

do $$
begin
  begin
    update public.client_memberships
    set role = 'viewer'
    where client_id = (select id from public.clients where slug = 'kameleon')
      and user_id = '10000000-0000-0000-0000-000000000001';
    raise exception 'FAIL: self-role-change was not blocked';
  exception
    -- Catches ONLY the deliberate authorization denial (SQLSTATE 42501,
    -- insufficient_privilege) — any other error, including the FAIL
    -- marker above (which raises with the default P0001), is NOT caught
    -- here and correctly propagates as a genuine test failure.
    when sqlstate '42501' then
      raise notice 'PASS: self-role-change correctly blocked (SQLSTATE 42501: %)', sqlerrm;
  end;
end $$;

reset role;

-- --- Check 5: is_platform_admin cannot be set by a normal authenticated write

set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';

do $$
begin
  begin
    update public.profiles set is_platform_admin = true where id = '10000000-0000-0000-0000-000000000001';
    raise exception 'FAIL: is_platform_admin was changed by a non-service-role update';
  exception
    when sqlstate '42501' then
      raise notice 'PASS: is_platform_admin change correctly blocked (SQLSTATE 42501: %)', sqlerrm;
  end;
end $$;

reset role;

-- --- Check 6: an editor cannot manage memberships (Correction 3) ------------

set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000003","role":"authenticated"}';

do $$
declare
  affected integer;
begin
  update public.client_memberships
  set role = 'viewer'
  where client_id = (select id from public.clients where slug = 'kameleon')
    and user_id = '10000000-0000-0000-0000-000000000001';
  get diagnostics affected = row_count;
  if affected <> 0 then
    raise exception 'FAIL: an editor was able to change another member''s role (expected 0 rows affected)';
  end if;
  raise notice 'PASS: editor cannot manage memberships';
end $$;

reset role;

-- --- Check 7: an editor cannot read another member's PII via experience_users

set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000003","role":"authenticated"}';

insert into public.experience_users (id, experience_id, client_id, email)
select
  '90000000-0000-0000-0000-000000000020',
  (select id from public.experiences where slug = 'kameleon'),
  c.id,
  'real-customer@example.test'
from public.clients c where c.slug = 'kameleon'
on conflict (id) do nothing;

do $$
declare
  visible integer;
begin
  select count(*) into visible from public.experience_users
  where id = '90000000-0000-0000-0000-000000000020';
  if visible <> 0 then
    raise exception 'FAIL: editor role can read experience_users PII (expected 0 visible rows)';
  end if;
  raise notice 'PASS: editor cannot read experience_users PII';
end $$;

reset role;

-- --- Check 8: choices cannot connect nodes across clients -------------------

set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';

do $$
begin
  begin
    insert into public.choices (client_id, source_node_id, destination_node_id, title)
    select c.id, '90000000-0000-0000-0000-000000000010', '90000000-0000-0000-0000-000000000011', 'Cross-tenant choice'
    from public.clients c where c.slug = 'kameleon';
    raise exception 'FAIL: a cross-tenant choice was inserted without error';
  exception
    when others then
      if sqlerrm like '%client_id must match%' then
        raise notice 'PASS: cross-tenant choice correctly rejected (%)', sqlerrm;
      else
        raise;
      end if;
  end;
end $$;

reset role;

rollback; -- never actually commit the throwaway test users/data/tenant
