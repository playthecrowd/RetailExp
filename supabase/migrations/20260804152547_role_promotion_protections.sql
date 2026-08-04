-- Phase 7 Checkpoint 2 — role-promotion protections.
--
-- These triggers are a second, independent layer on top of RLS (RLS is
-- row-level, not column-level, and Postgres has no native "this column is
-- only writable by X" primitive) — even if an RLS policy would otherwise
-- permit a write, these triggers can still reject it. Both bypass for
-- auth.role() = 'service_role' only, i.e. server-side/administrative
-- scripts using the service-role key — never the anon/browser key.
--
-- Both are marked SECURITY DEFINER with an explicit search_path: their
-- internal reads (of profiles.is_platform_admin / client_memberships.role
-- for the ACTING user, i.e. auth.uid() — never a caller-supplied value)
-- must not depend on whatever RLS happens to allow the invoking role to
-- see, since that would make an authorization check only as reliable as
-- an unrelated read policy. This is the same reasoning as the RLS helper
-- functions in rls_policies.sql, and is exactly why both are safe to run
-- with elevated privilege: neither one ever uses anything except
-- auth.role()/auth.uid() (the real caller's own identity) and NEW/OLD row
-- values already provided by the trigger itself — there is no
-- caller-controlled input that could be redirected to inspect someone
-- else's data.

-- profiles.is_platform_admin --------------------------------------------------
-- No client-permitted write path (RLS or otherwise) may ever set this to
-- true. It is only settable directly via the service-role key, run
-- manually by the project owner.

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
    raise exception 'is_platform_admin cannot be changed except by a service-role operation';
  end if;

  return new;
end;
$$;

create trigger profiles_protect_platform_admin_flag
  before update on public.profiles
  for each row execute function public.protect_platform_admin_flag();

-- client_memberships.role ----------------------------------------------------
-- A member can never change their OWN role (even an owner) — role changes
-- must come from a different owner of the same client, or a platform
-- admin, or a service-role script. This prevents both self-escalation and
-- accidental self-lockout from looking like a legitimate admin action.

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
  if auth.role() = 'service_role' then
    return new;
  end if;

  select is_platform_admin into acting_is_platform_admin
  from public.profiles where id = acting_user_id;

  if coalesce(acting_is_platform_admin, false) then
    return new;
  end if;

  if new.user_id = acting_user_id then
    raise exception 'a member cannot change their own client_memberships row';
  end if;

  select role into acting_role
  from public.client_memberships
  where client_id = new.client_id and user_id = acting_user_id;

  if acting_role is distinct from 'owner' then
    raise exception 'only an owner of this client (or a platform admin) may change membership roles';
  end if;

  return new;
end;
$$;

create trigger client_memberships_protect_role_changes
  before insert or update on public.client_memberships
  for each row execute function public.protect_membership_role_changes();

-- Neither trigger function is meant to be called directly (only via their
-- triggers), so — same reasoning as handle_new_user in
-- core_tenant_tables.sql — EXECUTE is revoked from the default grantees.
revoke execute on function public.protect_platform_admin_flag() from public, anon, authenticated;
revoke execute on function public.protect_membership_role_changes() from public, anon, authenticated;
