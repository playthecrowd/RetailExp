-- Phase 7 Checkpoint 2 — Row Level Security policies.
--
-- Pattern (see docs/PHASE7_PLATFORM_ARCHITECTURE_PREFLIGHT.md §6): every
-- tenant-owned table carries a denormalized client_id (validated by real
-- foreign keys and, on `choices`, an explicit consistency trigger — see
-- experience_content_tables.sql) so admin-side policies can be a single
-- flat membership check instead of a multi-table join evaluated per row.
-- Public/anonymous read policies are separate, narrower policies that
-- never depend on client_memberships at all.
--
-- Helper functions are SECURITY DEFINER so a policy on client_memberships
-- itself can call is_client_member()/is_platform_admin() without Postgres
-- recursively re-evaluating RLS on client_memberships mid-check.

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select is_platform_admin from public.profiles where id = auth.uid()), false);
$$;

create or replace function public.is_client_member(check_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.client_memberships
    where client_id = check_client_id and user_id = auth.uid()
  );
$$;

create or replace function public.can_edit_client(check_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.client_memberships
    where client_id = check_client_id
      and user_id = auth.uid()
      and role in ('owner', 'admin', 'editor')
  );
$$;

create or replace function public.is_client_owner(check_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.client_memberships
    where client_id = check_client_id
      and user_id = auth.uid()
      and role = 'owner'
  );
$$;

-- Role/PII matrix (see docs/PHASE7_ROLE_MATRIX_AND_MEDIA_DELIVERY.md):
-- membership management (inviting/removing members, changing roles) and
-- visibility into end-user PII are both restricted to owner/admin —
-- deliberately narrower than can_edit_client(), which also grants
-- 'editor'. An editor can manage content and media, but not memberships,
-- and cannot see experience_users' email/display_name.

create or replace function public.can_manage_members(check_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.client_memberships
    where client_id = check_client_id
      and user_id = auth.uid()
      and role in ('owner', 'admin')
  );
$$;

create or replace function public.can_view_experience_user_pii(check_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.client_memberships
    where client_id = check_client_id
      and user_id = auth.uid()
      and role in ('owner', 'admin')
  );
$$;

-- clients ---------------------------------------------------------------------

alter table public.clients enable row level security;

create policy clients_select_members on public.clients
  for select using (public.is_client_member(id) or public.is_platform_admin());

create policy clients_insert_platform_admin on public.clients
  for insert with check (public.is_platform_admin());

create policy clients_update_members on public.clients
  for update using (public.can_edit_client(id) or public.is_platform_admin());

create policy clients_delete_platform_admin on public.clients
  for delete using (public.is_platform_admin());

-- profiles ----------------------------------------------------------------------

alter table public.profiles enable row level security;

create policy profiles_select_own_or_teammate on public.profiles
  for select using (
    id = auth.uid()
    or public.is_platform_admin()
    or exists (
      select 1 from public.client_memberships mine
      join public.client_memberships theirs on theirs.client_id = mine.client_id
      where mine.user_id = auth.uid() and theirs.user_id = profiles.id
    )
  );

create policy profiles_update_own on public.profiles
  for update using (id = auth.uid());
-- No insert policy: rows are created only via the handle_new_user trigger
-- (security definer, bypasses RLS). No delete policy: cascades from
-- auth.users deletion.

-- client_memberships --------------------------------------------------------------

alter table public.client_memberships enable row level security;

create policy client_memberships_select_members on public.client_memberships
  for select using (public.is_client_member(client_id) or public.is_platform_admin());

create policy client_memberships_insert_admins on public.client_memberships
  for insert with check (public.can_manage_members(client_id) or public.is_platform_admin());

create policy client_memberships_update_admins on public.client_memberships
  for update using (public.can_manage_members(client_id) or public.is_platform_admin());
-- Note: an editor cannot reach this policy at all now (can_manage_members
-- excludes 'editor' — Correction 3). Among owner/admin, the
-- protect_membership_role_changes trigger then enforces the stricter rule
-- that only an owner (or platform admin) may actually change a role
-- value, and that nobody may change their own row.

create policy client_memberships_delete_owners on public.client_memberships
  for delete using (public.is_client_owner(client_id) or public.is_platform_admin());

-- experiences ---------------------------------------------------------------------

alter table public.experiences enable row level security;

create policy experiences_select_members on public.experiences
  for select using (public.is_client_member(client_id) or public.is_platform_admin());

create policy experiences_select_published_public on public.experiences
  for select using (publication_status = 'published');

create policy experiences_write_editors on public.experiences
  for all using (public.can_edit_client(client_id) or public.is_platform_admin())
  with check (public.can_edit_client(client_id) or public.is_platform_admin());

-- pathways ----------------------------------------------------------------------

alter table public.pathways enable row level security;

create policy pathways_select_members on public.pathways
  for select using (
    public.is_platform_admin()
    or exists (
      select 1 from public.experiences e
      where e.id = pathways.experience_id and public.is_client_member(e.client_id)
    )
  );

create policy pathways_select_published_public on public.pathways
  for select using (publication_status = 'published');

create policy pathways_write_editors on public.pathways
  for all using (
    public.is_platform_admin()
    or exists (
      select 1 from public.experiences e
      where e.id = pathways.experience_id and public.can_edit_client(e.client_id)
    )
  )
  with check (
    public.is_platform_admin()
    or exists (
      select 1 from public.experiences e
      where e.id = pathways.experience_id and public.can_edit_client(e.client_id)
    )
  );

-- content_nodes -------------------------------------------------------------------

alter table public.content_nodes enable row level security;

create policy content_nodes_select_members on public.content_nodes
  for select using (public.is_client_member(client_id) or public.is_platform_admin());

create policy content_nodes_select_published_public on public.content_nodes
  for select using (publication_status = 'published');

create policy content_nodes_write_editors on public.content_nodes
  for all using (public.can_edit_client(client_id) or public.is_platform_admin())
  with check (public.can_edit_client(client_id) or public.is_platform_admin());

-- choices -----------------------------------------------------------------------

alter table public.choices enable row level security;

create policy choices_select_members on public.choices
  for select using (public.is_client_member(client_id) or public.is_platform_admin());

create policy choices_select_published_public on public.choices
  for select using (
    active = true
    and exists (
      select 1 from public.content_nodes n
      where n.id = choices.source_node_id and n.publication_status = 'published'
    )
  );

create policy choices_write_editors on public.choices
  for all using (public.can_edit_client(client_id) or public.is_platform_admin())
  with check (public.can_edit_client(client_id) or public.is_platform_admin());

-- media_assets --------------------------------------------------------------------

alter table public.media_assets enable row level security;

create policy media_assets_select_members on public.media_assets
  for select using (public.is_client_member(client_id) or public.is_platform_admin());

-- Public read only once the asset is actually referenced by a published
-- content_node or an active choice on a published node — never just
-- because processing finished. This is deliberately conservative:
-- unreferenced or draft-only assets are never publicly readable. A raw/
-- master upload (is_source_master = true) is excluded unconditionally,
-- even if it were somehow referenced by a published node — delivery-ready
-- vs. source-only is a property of the asset itself, not of what
-- currently points at it.
create policy media_assets_select_published_public on public.media_assets
  for select using (
    is_source_master = false
    and (
      exists (
        select 1 from public.content_nodes n
        where n.publication_status = 'published'
          and (
            n.primary_video_asset_id = media_assets.id
            or n.poster_asset_id = media_assets.id
            or n.thumbnail_asset_id = media_assets.id
            or n.captions_asset_id = media_assets.id
          )
      )
      or exists (
        select 1 from public.choices c
        join public.content_nodes n on n.id = c.source_node_id
        where c.active = true
          and n.publication_status = 'published'
          and (c.thumbnail_asset_id = media_assets.id or c.preview_video_asset_id = media_assets.id)
      )
    )
  );

create policy media_assets_write_editors on public.media_assets
  for all using (public.can_edit_client(client_id) or public.is_platform_admin())
  with check (public.can_edit_client(client_id) or public.is_platform_admin());

-- brand_settings ------------------------------------------------------------------

alter table public.brand_settings enable row level security;

create policy brand_settings_select_members on public.brand_settings
  for select using (public.is_client_member(client_id) or public.is_platform_admin());

create policy brand_settings_select_published_public on public.brand_settings
  for select using (
    exists (
      select 1 from public.experiences e
      where e.client_id = brand_settings.client_id and e.publication_status = 'published'
    )
  );

create policy brand_settings_write_editors on public.brand_settings
  for all using (public.can_edit_client(client_id) or public.is_platform_admin())
  with check (public.can_edit_client(client_id) or public.is_platform_admin());

-- publication_versions --------------------------------------------------------------
-- No client_id column (reached via experience_id -> experiences.client_id).
-- No delete policy anywhere: version history is never deletable via RLS,
-- by design, regardless of role.

alter table public.publication_versions enable row level security;

create policy publication_versions_select_members on public.publication_versions
  for select using (
    public.is_platform_admin()
    or exists (
      select 1 from public.experiences e
      where e.id = publication_versions.experience_id and public.is_client_member(e.client_id)
    )
  );

create policy publication_versions_insert_editors on public.publication_versions
  for insert with check (
    public.is_platform_admin()
    or exists (
      select 1 from public.experiences e
      where e.id = publication_versions.experience_id and public.can_edit_client(e.client_id)
    )
  );

create policy publication_versions_update_editors on public.publication_versions
  for update using (
    public.is_platform_admin()
    or exists (
      select 1 from public.experiences e
      where e.id = publication_versions.experience_id and public.can_edit_client(e.client_id)
    )
  );

-- experience_users, journey_progress, engagement_events -----------------------------
-- Runtime end-user data. Deliberately CONSERVATIVE for now: write access
-- is only granted to the row's own authenticated end user (auth_user_id =
-- auth.uid()). There is intentionally NO anonymous/public write policy
-- yet — Quick Account is still a local mock flow with no real end-user
-- identity to scope an anonymous policy to safely, and guessing at that
-- scoping risks a real security gap. This is explicitly flagged as open
-- work for Checkpoint 7.3 (Supabase Auth wiring), not solved here.
--
-- experience_users specifically carries PII (display_name, email) — read
-- access is owner/admin only (can_view_experience_user_pii), per the role
-- matrix: editor and viewer get no direct visibility into this table at
-- all in this checkpoint (not even a masked/non-PII view yet — that's
-- future work, "unless explicitly granted later" per the review). This
-- also answers "profiles cannot be enumerated across tenants": this
-- policy's client_id check is the row's OWN validated client_id (kept
-- consistent with experience_id by the enforce_experience_user_client_
-- consistency trigger), not merely "the requester is authenticated."

alter table public.experience_users enable row level security;

create policy experience_users_select_members on public.experience_users
  for select using (public.can_view_experience_user_pii(client_id) or public.is_platform_admin());

create policy experience_users_select_own on public.experience_users
  for select using (auth_user_id = auth.uid());

create policy experience_users_write_own on public.experience_users
  for all using (auth_user_id = auth.uid())
  with check (auth_user_id = auth.uid());

alter table public.journey_progress enable row level security;

create policy journey_progress_select_members on public.journey_progress
  for select using (public.is_client_member(client_id) or public.is_platform_admin());

create policy journey_progress_select_own on public.journey_progress
  for select using (
    exists (
      select 1 from public.experience_users u
      where u.id = journey_progress.experience_user_id and u.auth_user_id = auth.uid()
    )
  );

create policy journey_progress_write_own on public.journey_progress
  for all using (
    exists (
      select 1 from public.experience_users u
      where u.id = journey_progress.experience_user_id and u.auth_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.experience_users u
      where u.id = journey_progress.experience_user_id and u.auth_user_id = auth.uid()
    )
  );

alter table public.engagement_events enable row level security;

create policy engagement_events_select_members on public.engagement_events
  for select using (public.is_client_member(client_id) or public.is_platform_admin());

create policy engagement_events_insert_own on public.engagement_events
  for insert with check (
    experience_user_id is null
    or exists (
      select 1 from public.experience_users u
      where u.id = engagement_events.experience_user_id and u.auth_user_id = auth.uid()
    )
  );
