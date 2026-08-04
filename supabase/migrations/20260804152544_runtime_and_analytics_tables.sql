-- Phase 7 Checkpoint 2 — experience_users, journey_progress,
-- engagement_events, brand_settings, publication_versions.

-- experience_users ----------------------------------------------------------
-- End users/customers of a published experience — distinct from
-- client_memberships, which are admin users. auth_user_id is nullable
-- because Quick Account remains a local/mock flow until real end-user auth
-- is wired up in a later checkpoint.

create table public.experience_users (
  id uuid primary key default gen_random_uuid(),
  experience_id uuid not null references public.experiences (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  auth_user_id uuid references auth.users (id) on delete set null,
  display_name text,
  email text,
  created_at timestamptz not null default now()
);

create index experience_users_experience_id_idx on public.experience_users (experience_id);
create index experience_users_client_id_idx on public.experience_users (client_id);
create index experience_users_auth_user_id_idx on public.experience_users (auth_user_id);

create or replace function public.enforce_experience_user_client_consistency()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  experience_client_id uuid;
begin
  select client_id into experience_client_id from public.experiences where id = new.experience_id;
  if experience_client_id is distinct from new.client_id then
    raise exception 'experience_users.client_id must match experience_id''s client_id';
  end if;
  return new;
end;
$$;

create trigger experience_users_enforce_client_consistency
  before insert or update on public.experience_users
  for each row execute function public.enforce_experience_user_client_consistency();

-- journey_progress ------------------------------------------------------------
-- Maps directly onto the existing runtime ViewerProgress shape
-- (lib/kameleon/pathway-model.ts) so a future data-layer swap can hydrate
-- the same TypeScript type this table represents.

create table public.journey_progress (
  id uuid primary key default gen_random_uuid(),
  experience_user_id uuid not null references public.experience_users (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  pathway_id uuid references public.pathways (id) on delete set null,
  current_node_id uuid references public.content_nodes (id) on delete set null,
  player_status public.player_status not null default 'not_started',
  current_node_elapsed_seconds numeric not null default 0,
  history jsonb not null default '[]'::jsonb,
  completed_node_ids jsonb not null default '[]'::jsonb,
  last_updated_at timestamptz not null default now()
);

create index journey_progress_experience_user_id_idx on public.journey_progress (experience_user_id);
create index journey_progress_client_id_idx on public.journey_progress (client_id);

create or replace function public.enforce_journey_progress_client_consistency()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  owner_client_id uuid;
begin
  select client_id into owner_client_id
  from public.experience_users where id = new.experience_user_id;
  if owner_client_id is distinct from new.client_id then
    raise exception 'journey_progress.client_id must match experience_user_id''s client_id';
  end if;
  return new;
end;
$$;

create trigger journey_progress_enforce_client_consistency
  before insert or update on public.journey_progress
  for each row execute function public.enforce_journey_progress_client_consistency();

-- engagement_events ------------------------------------------------------------

create table public.engagement_events (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  experience_id uuid not null references public.experiences (id) on delete cascade,
  experience_user_id uuid references public.experience_users (id) on delete set null,
  event_type text not null,
  event_payload jsonb,
  occurred_at timestamptz not null default now()
);

create index engagement_events_client_id_idx on public.engagement_events (client_id);
create index engagement_events_experience_id_idx on public.engagement_events (experience_id);
create index engagement_events_occurred_at_idx on public.engagement_events (occurred_at);

create or replace function public.enforce_engagement_event_client_consistency()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  experience_client_id uuid;
begin
  select client_id into experience_client_id from public.experiences where id = new.experience_id;
  if experience_client_id is distinct from new.client_id then
    raise exception 'engagement_events.client_id must match experience_id''s client_id';
  end if;
  return new;
end;
$$;

create trigger engagement_events_enforce_client_consistency
  before insert or update on public.engagement_events
  for each row execute function public.enforce_engagement_event_client_consistency();

-- brand_settings ----------------------------------------------------------------
-- 1:1 with clients, kept as its own table (rather than folded into
-- clients) so it can later support per-experience overrides without a
-- schema change.

create table public.brand_settings (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null unique references public.clients (id) on delete cascade,
  logo_asset_id uuid references public.media_assets (id) on delete set null,
  primary_color text,
  secondary_color text,
  typography jsonb,
  terminology_overrides jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger brand_settings_set_updated_at
  before update on public.brand_settings
  for each row execute function public.set_updated_at();

-- publication_versions ------------------------------------------------------------

create table public.publication_versions (
  id uuid primary key default gen_random_uuid(),
  experience_id uuid not null references public.experiences (id) on delete cascade,
  version_number integer not null,
  status public.publication_status not null default 'draft',
  snapshot jsonb,
  published_by uuid references auth.users (id) on delete set null,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  unique (experience_id, version_number)
);

create index publication_versions_experience_id_idx on public.publication_versions (experience_id);

alter table public.experiences
  add constraint experiences_current_version_id_fkey
  foreign key (current_version_id) references public.publication_versions (id) on delete set null;
