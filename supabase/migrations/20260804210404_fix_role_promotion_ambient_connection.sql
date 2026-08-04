-- Phase 7 — corrective migration (additive, CREATE OR REPLACE only).
-- Does NOT edit the already-applied 20260804152547_role_promotion_
-- protections.sql migration — per the remote-migration rule, that file
-- stays exactly as it was when applied. (This migration itself has not
-- yet been pushed remotely as of this revision, so it was safe to edit
-- in place rather than layering a third migration on top.)
--
-- BUG FOUND: protect_membership_role_changes() fires on every INSERT to
-- client_memberships (not just UPDATE). A privileged/ambient database
-- connection with no JWT context at all — e.g. the Supabase SQL Editor, a
-- migration-applying connection, or any other direct Postgres session —
-- was falling through to the "acting_role IS DISTINCT FROM 'owner'"
-- branch (NULL IS DISTINCT FROM 'owner' = true) and being incorrectly
-- rejected, even though it isn't a restrictable end-user request at all.
--
-- BYPASS CONDITION — auth.role() IS NULL, not auth.uid() IS NULL:
-- auth.uid() IS NULL was reviewed and rejected as the bypass condition —
-- a genuine anonymous API request (publishable-key, no `sub` claim) ALSO
-- has auth.uid() IS NULL, so that condition would have been correct only
-- as long as RLS happens to independently block every such request first
-- — an implicit, secondary guarantee this trigger should not depend on.
--
-- auth.role() IS NULL is structurally different and does not have that
-- weakness: PostgREST sets a `role` claim (`anon`, `authenticated`, or
-- `service_role`) on every single request it proxies, with no exception —
-- that's the literal mechanism it uses to SET ROLE for that request's
-- database session. auth.role() can therefore only be NULL for a
-- connection that never went through PostgREST at all — i.e. a direct
-- database session (SQL Editor, migration application, a superuser
-- connection). It is never NULL for a real anon, authenticated, or
-- service_role request, regardless of what RLS policies exist or whether
-- they're evaluated correctly. This makes the bypass self-contained and
-- independently correct, not reliant on RLS as an implicit second layer.
--
-- Confirmed denials, re-traced against this exact condition:
--   - anon API request: auth.role() = 'anon' (not null) — bypass does
--     NOT apply. Even hypothetically reaching this trigger (RLS already
--     prevents that), auth.uid() would still be null, so the self-check
--     is skipped but the owner-check still fails (NULL is never 'owner')
--     — denied either way, in depth.
--   - authenticated user (any role, acting on someone else): auth.role()
--     = 'authenticated' (not null) — bypass does NOT apply; falls through
--     to the normal self-check/owner-check logic exactly as before.
--   - authenticated client editor: same as above — role() = 'authenticated',
--     no bypass, owner-check fails ('editor' != 'owner') — denied.
--   - authenticated client admin: same — role() = 'authenticated', no
--     bypass, owner-check fails ('admin' != 'owner') — denied. (Whether
--     admin should be able to invite/manage non-owner memberships at all
--     is a separate, pre-existing product question this migration does
--     not change — out of scope for this fix, which only touches the
--     bypass condition and the SQLSTATE.)
--   - authenticated client owner acting outside their authority (a
--     different client's memberships): never reaches this trigger at all
--     — RLS's can_manage_members(client_id) already excludes them for a
--     client_id they hold no membership in, independent of this fix.
--   - a member promoting their own role / an admin promoting themselves
--     to owner: still blocked by the self-check (new.user_id =
--     acting_user_id), which runs before the owner-check regardless of
--     role, and is entirely unaffected by this change.
--   - authenticated user changing is_platform_admin: unaffected — a
--     separate trigger (protect_platform_admin_flag) with its own
--     unchanged service_role-only bypass.
--
-- Trusted (bypass applies): the Supabase SQL Editor / a postgres
-- administrative session with no JWT role, approved migration execution,
-- and genuine server-side secret-key (service_role) operations — exactly
-- the set this migration is meant to trust, no more.
--
-- Also, per review: both trigger functions now raise with an explicit,
-- authorization-specific SQLSTATE (42501 / insufficient_privilege)
-- instead of the generic P0001 default, so callers (including this
-- project's own tests) can reliably distinguish "this was a deliberate
-- authorization denial" from an unrelated database error by SQLSTATE
-- rather than fragile message-text matching.

create or replace function public.protect_platform_admin_flag()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() = 'service_role' then
    return new;
  end if;

  if new.is_platform_admin is distinct from old.is_platform_admin then
    raise exception 'is_platform_admin cannot be changed except by a service-role operation'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create or replace function public.protect_membership_role_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  acting_user_id uuid := auth.uid();
  acting_is_platform_admin boolean;
  acting_role public.membership_role;
begin
  -- Trusted, RLS-bypassing tier: a genuine service-role request, OR a
  -- connection with no JWT/API role context at all (see rationale above
  -- for why auth.role() IS NULL — not auth.uid() IS NULL — is the correct,
  -- independently-safe condition here).
  if auth.role() = 'service_role' or auth.role() is null then
    return new;
  end if;

  select is_platform_admin into acting_is_platform_admin
  from public.profiles where id = acting_user_id;

  if coalesce(acting_is_platform_admin, false) then
    return new;
  end if;

  if new.user_id = acting_user_id then
    raise exception 'a member cannot change their own client_memberships row'
      using errcode = '42501';
  end if;

  select role into acting_role
  from public.client_memberships
  where client_id = new.client_id and user_id = acting_user_id;

  if acting_role is distinct from 'owner' then
    raise exception 'only an owner of this client (or a platform admin) may change membership roles'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

-- Functions were created with CREATE OR REPLACE against the same
-- public.* names already covered by the original migration's REVOKE
-- statements — REVOKE is not reset by CREATE OR REPLACE FUNCTION in
-- Postgres, but restated here for explicitness/auditability rather than
-- relying on that carrying forward silently.
revoke execute on function public.protect_platform_admin_flag() from public, anon, authenticated;
revoke execute on function public.protect_membership_role_changes() from public, anon, authenticated;
