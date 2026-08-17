-- Corrective migration — make experience_users identity and tenant ownership
-- immutable through end-user requests, and remove the end-user DELETE path.
--
-- WHAT WAS WRONG
--   experience_users_write_own was declared FOR ALL with predicates that only
--   constrain auth_user_id and the destination experience's publication
--   status. PostgreSQL RLS is row-level, not column-level: WITH CHECK sees
--   only the NEW row and has no way to reference OLD, so it cannot express
--   "this column may not change". The single existing trigger,
--   enforce_experience_user_client_consistency, compares NEW against
--   public.experiences — an internal-consistency check, never an immutability
--   check. Together they allowed an ordinary authenticated end user to
--   rewrite client_id + experience_id on their own row to any *coherent* pair
--   pointing at another published experience, in another tenant; to move
--   between experiences within the same client by changing experience_id
--   alone; to rewrite the primary key of a childless row; and — because
--   FOR ALL covers DELETE — to delete their own enrollment, cascading
--   journey_progress and experience_user_rewards away.
--
--   Moving the row is not a read escalation (select_own still returns only
--   the caller's own row, and self-enrolment into any published experience
--   was already permitted by design). It is an integrity defect: child rows
--   keep the old client_id, their per-child consistency triggers do not fire
--   on a parent update, and the mismatch surfaces later as permanent P0001
--   write failures on progress and rewards.
--
--   This is a pre-existing defect. It was introduced with the original policy
--   in 20260804152549_rls_policies.sql and carried forward by
--   20260806101445_kameleon_rewards.sql. It was NOT introduced by
--   20260817101500_experience_user_contact.sql, which adds one column, one
--   CHECK and one COMMENT and contains no policy, grant or trigger statement.
--   That migration remains valid and is deliberately not edited here.
--
-- APPROACH — four independent layers, so no single regression re-opens it:
--   1. BEFORE UPDATE trigger rejecting identity/tenant column changes (42501)
--   2. BEFORE DELETE trigger rejecting end-user deletion (42501)
--   3. Explicit INSERT / UPDATE policies replacing the misleading FOR ALL,
--      with no end-user DELETE policy at all
--   4. Column-level UPDATE privileges plus a DELETE revoke
--
--   The pre-existing tenant-consistency trigger is left completely intact.

-- ---------------------------------------------------------------------------
-- 1. Identity and tenant immutability
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER matches the established protect_* family
-- (protect_platform_admin_flag, protect_membership_role_changes in
-- 20260804210404_fix_role_promotion_ambient_connection.sql), which are the
-- repository's authorization-protection triggers. Definer also means the
-- function cannot be subverted by a caller's search_path, and search_path is
-- pinned explicitly regardless per Supabase's function-search-path-mutable
-- advisory. No dynamic SQL and no user-controlled object name appears below.

create or replace function public.protect_experience_user_identity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Trusted tier, using the same strict condition established in
  -- 20260804210404: a genuine service_role request, OR a connection with no
  -- JWT/API role context at all (a migration, psql, or a direct pooler
  -- session). auth.role() is never null for a real anon/authenticated API
  -- request — unlike auth.uid(), which IS null for an unauthenticated
  -- anonymous request and would therefore hand every anonymous caller the
  -- bypass. auth.uid() is deliberately not consulted here.
  if auth.role() = 'service_role' or auth.role() is null then
    return new;
  end if;

  if new.id is distinct from old.id then
    raise exception 'experience_users.id is immutable'
      using errcode = '42501';
  end if;

  if new.auth_user_id is distinct from old.auth_user_id then
    raise exception 'experience_users.auth_user_id is immutable'
      using errcode = '42501';
  end if;

  if new.client_id is distinct from old.client_id then
    raise exception 'experience_users.client_id is immutable — tenant ownership cannot be changed by an end-user request'
      using errcode = '42501';
  end if;

  if new.experience_id is distinct from old.experience_id then
    raise exception 'experience_users.experience_id is immutable — an enrollment cannot be moved between experiences'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

-- Trigger-only function: Postgres grants EXECUTE to PUBLIC by default, and a
-- directly-callable SECURITY DEFINER function is an unnecessary surface.
-- Trigger execution does not require the firing role to hold EXECUTE, so this
-- revoke is safe (same rationale as handle_new_user in core_tenant_tables).
revoke execute on function public.protect_experience_user_identity()
  from public, anon, authenticated;

-- The "00_" prefix is load-bearing, not cosmetic. Postgres fires BEFORE row
-- triggers in NAME order, and experience_users_enforce_client_consistency
-- would otherwise run first and raise its generic P0001 for a client_id
-- change before this trigger could raise the correct authorization SQLSTATE.
-- Sorting first makes every identity/tenant violation deterministically 42501.
create trigger experience_users_00_protect_identity
  before update on public.experience_users
  for each row execute function public.protect_experience_user_identity();

-- ---------------------------------------------------------------------------
-- 2. Deletion protection
-- ---------------------------------------------------------------------------
-- Direct browser deletion of an enrollment is not an approved account-deletion
-- mechanism: it silently cascades journey_progress and experience_user_rewards
-- (ON DELETE CASCADE) and nulls engagement_events.experience_user_id. Removal
-- must later go through an explicit server-mediated operation with deliberate
-- cleanup rules.
--
-- IMPORTANT — why an administrative tier exists here and not in the UPDATE
-- trigger above. Deleting a client (clients_delete_platform_admin) or an
-- experience (experiences_write_editors, FOR ALL) CASCADES into this table.
-- Referential cascades bypass table privileges and RLS — they run with the
-- referencing table's owner rights — but ordinary row triggers still fire, and
-- fire with the deleting session's JWT context intact. A bypass limited to
-- service_role/ambient would therefore make it impossible for a platform admin
-- or client editor to delete a client or an experience at all. The two tiers
-- permitted below are exactly the tiers already authorized to delete those
-- parent rows, so this blocks end users without removing any capability that
-- exists today.
create or replace function public.protect_experience_user_deletion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() = 'service_role' or auth.role() is null then
    return old;
  end if;

  -- Administrative tier: the same authorization that already permits deleting
  -- the parent client/experience whose removal cascades to this row.
  if public.is_platform_admin() or public.can_edit_client(old.client_id) then
    return old;
  end if;

  raise exception 'experience_users rows cannot be deleted through an end-user request'
    using errcode = '42501';
end;
$$;

revoke execute on function public.protect_experience_user_deletion()
  from public, anon, authenticated;

create trigger experience_users_00_protect_deletion
  before delete on public.experience_users
  for each row execute function public.protect_experience_user_deletion();

-- ---------------------------------------------------------------------------
-- 3. Explicit policies replacing the FOR ALL policy
-- ---------------------------------------------------------------------------
-- FOR ALL conceptually covered DELETE, which was never intended. Splitting it
-- makes the permitted verbs explicit and leaves DELETE with no end-user policy
-- at all, so RLS denies it by default rather than by omission.
drop policy if exists experience_users_write_own on public.experience_users;

-- Self-enrolment: unchanged behaviour. The caller may create only their own
-- row, and only into a published experience. The pre-existing
-- experience_users_enforce_client_consistency trigger still validates that
-- client_id matches the experience's client_id.
create policy experience_users_insert_own on public.experience_users
  for insert with check (
    auth_user_id = auth.uid()
    and exists (
      select 1 from public.experiences e
      where e.id = experience_users.experience_id and e.publication_status = 'published'
    )
  );

-- Contact updates on the caller's own existing row. The published-experience
-- guard is retained, and which COLUMNS may change is enforced by the trigger
-- in section 1 and the column privileges in section 4 — RLS cannot express
-- that on its own.
create policy experience_users_update_own on public.experience_users
  for update using (auth_user_id = auth.uid())
  with check (
    auth_user_id = auth.uid()
    and exists (
      select 1 from public.experiences e
      where e.id = experience_users.experience_id and e.publication_status = 'published'
    )
  );

-- Deliberately no end-user DELETE policy is created.

-- ---------------------------------------------------------------------------
-- 4. Column-level privileges
-- ---------------------------------------------------------------------------
-- Enforced by the privilege system BEFORE RLS is evaluated, so a disallowed
-- column fails without relying on trigger logic at all. Supabase Anonymous
-- Sign-In issues an `authenticated` JWT (not `anon`), so every Kameleon
-- visitor holds the authenticated role and keeps the approved contact-update
-- path below. The anon role is granted no UPDATE whatsoever.
--
-- SELECT privileges are deliberately untouched: existing owner/admin PII
-- visibility (can_view_experience_user_pii) and the editor/viewer denial are
-- unchanged by this migration.
revoke update on public.experience_users from anon, authenticated;
revoke delete on public.experience_users from anon, authenticated;

grant update (display_name, email, phone_e164)
  on public.experience_users to authenticated;
