-- Phase 7 Checkpoint 2 — experiences, media_assets, pathways, content_nodes,
-- choices. This is the branching-video content model: one content_nodes
-- table (distinguished by content_node_type) rather than a separate table
-- per screen/chapter kind, and choices.destination_node_id is a plain FK
-- with no hard-coded limit on how many outgoing choices a node can have.
--
-- pathways.root_node_id and content_nodes.pathway_id reference each other,
-- so the circular relationship is resolved by creating pathways first
-- WITHOUT the root_node_id foreign key, creating content_nodes next (its
-- pathway_id FK is valid immediately), then adding the root_node_id FK to
-- pathways afterward. See "circular fk fixup" below.

-- experiences ---------------------------------------------------------------

create table public.experiences (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  slug text not null,
  name text not null,
  experience_type text not null default 'branching-video',
  commercial_content_node_id uuid, -- fk added after content_nodes exists
  ar_provider text,
  ar_lens_id text, -- not secret; see docs/PHASE7_PLATFORM_ARCHITECTURE_PREFLIGHT.md §7. Never the API token.
  ar_lens_group_id text,
  signup_required boolean not null default true,
  publication_status public.publication_status not null default 'draft',
  current_version_id uuid, -- fk added in runtime_and_analytics_tables migration (publication_versions is created there)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, slug)
);

comment on table public.experiences is 'ar_lens_id/ar_lens_group_id are Snap Lens/Group identifiers, not credentials. The Camera Kit API token is never stored here — it stays a deployment environment variable.';

create trigger experiences_set_updated_at
  before update on public.experiences
  for each row execute function public.set_updated_at();

create index experiences_client_id_idx on public.experiences (client_id);

-- media_assets ----------------------------------------------------------------

create table public.media_assets (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  experience_id uuid references public.experiences (id) on delete cascade,
  media_type public.media_type not null,
  role text,
  storage_path text not null,
  public_url text,
  mime_type text,
  file_size_bytes bigint,
  duration_seconds numeric,
  width integer,
  height integer,
  processing_status public.processing_status not null default 'pending',
  is_placeholder boolean not null default false,
  is_source_master boolean not null default false,
  version integer not null default 1,
  checksum text,
  uploaded_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.media_assets is 'Metadata + protected storage path only. The actual file lives in Supabase Storage, never in this table. is_placeholder drives dashboard "missing media" warnings. is_source_master marks a raw/master upload that is never delivery-ready — see the public storage/media policies, which exclude these regardless of any other flag.';

create trigger media_assets_set_updated_at
  before update on public.media_assets
  for each row execute function public.set_updated_at();

create index media_assets_client_id_idx on public.media_assets (client_id);
create index media_assets_experience_id_idx on public.media_assets (experience_id);

-- Cross-tenant integrity guard, same pattern/rationale as
-- enforce_choice_client_consistency below: experience_id is nullable (some
-- assets, e.g. a client logo, aren't experience-scoped), so the check only
-- applies when it's set.
create or replace function public.enforce_media_asset_client_consistency()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  experience_client_id uuid;
begin
  if new.experience_id is not null then
    select client_id into experience_client_id from public.experiences where id = new.experience_id;
    if experience_client_id is distinct from new.client_id then
      raise exception 'media_assets.client_id must match experience_id''s client_id';
    end if;
  end if;
  return new;
end;
$$;

create trigger media_assets_enforce_client_consistency
  before insert or update on public.media_assets
  for each row execute function public.enforce_media_asset_client_consistency();

alter table public.clients
  add constraint clients_logo_asset_id_fkey
  foreign key (logo_asset_id) references public.media_assets (id) on delete set null;

-- pathways --------------------------------------------------------------------
-- root_node_id's foreign key is added after content_nodes exists (see below).

create table public.pathways (
  id uuid primary key default gen_random_uuid(),
  experience_id uuid not null references public.experiences (id) on delete cascade,
  slug text not null,
  title text not null,
  subtitle text,
  description text,
  accent_color text,
  root_node_id uuid,
  sort_order integer not null default 0,
  publication_status public.publication_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (experience_id, slug)
);

comment on table public.pathways is 'Client-owned pathway names (e.g. "Private Pour") live as data in the title column here, never as a platform enum or table name.';

create trigger pathways_set_updated_at
  before update on public.pathways
  for each row execute function public.set_updated_at();

create index pathways_experience_id_idx on public.pathways (experience_id);

-- content_nodes -----------------------------------------------------------------

create table public.content_nodes (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  experience_id uuid not null references public.experiences (id) on delete cascade,
  pathway_id uuid references public.pathways (id) on delete cascade,
  parent_node_id uuid references public.content_nodes (id) on delete set null,
  node_type public.content_node_type not null default 'pathway_chapter',
  internal_name text not null,
  title text not null,
  chapter_label text,
  description text,
  chapter_number integer,
  branch_code text,
  is_root boolean not null default false,
  is_terminal boolean not null default false,
  primary_video_asset_id uuid references public.media_assets (id) on delete set null,
  poster_asset_id uuid references public.media_assets (id) on delete set null,
  thumbnail_asset_id uuid references public.media_assets (id) on delete set null,
  captions_asset_id uuid references public.media_assets (id) on delete set null,
  duration_seconds numeric,
  sort_order integer not null default 0,
  publication_status public.publication_status not null default 'draft',
  processing_status public.processing_status not null default 'pending',
  version integer not null default 1,
  decision_timing jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.content_nodes is 'Every video-bearing moment in an experience — commercial, AR intro, branching chapters, journey completion — distinguished by node_type, not by separate tables.';

create trigger content_nodes_set_updated_at
  before update on public.content_nodes
  for each row execute function public.set_updated_at();

create index content_nodes_client_id_idx on public.content_nodes (client_id);
create index content_nodes_experience_id_idx on public.content_nodes (experience_id);
create index content_nodes_pathway_id_idx on public.content_nodes (pathway_id);
create index content_nodes_parent_node_id_idx on public.content_nodes (parent_node_id);

-- Cross-tenant integrity guard, same pattern as media_assets/choices.
create or replace function public.enforce_content_node_client_consistency()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  experience_client_id uuid;
begin
  select client_id into experience_client_id from public.experiences where id = new.experience_id;
  if experience_client_id is distinct from new.client_id then
    raise exception 'content_nodes.client_id must match experience_id''s client_id';
  end if;
  return new;
end;
$$;

create trigger content_nodes_enforce_client_consistency
  before insert or update on public.content_nodes
  for each row execute function public.enforce_content_node_client_consistency();

-- circular fk fixup: pathways.root_node_id -> content_nodes.id
alter table public.pathways
  add constraint pathways_root_node_id_fkey
  foreign key (root_node_id) references public.content_nodes (id) on delete set null;

-- circular fk fixup: experiences.commercial_content_node_id -> content_nodes.id
alter table public.experiences
  add constraint experiences_commercial_content_node_id_fkey
  foreign key (commercial_content_node_id) references public.content_nodes (id) on delete set null;

-- choices -----------------------------------------------------------------------
-- No permanent two-choice limit: destination_node_id is a plain foreign key
-- on each row, so a node may have zero, one, two, or any number of active
-- outgoing choices.

create table public.choices (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  source_node_id uuid not null references public.content_nodes (id) on delete cascade,
  destination_node_id uuid references public.content_nodes (id) on delete set null,
  title text not null,
  description text,
  display_order integer not null default 0,
  thumbnail_asset_id uuid references public.media_assets (id) on delete set null,
  preview_video_asset_id uuid references public.media_assets (id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.choices is 'Connects one content_node to the next. destination_node_id is nullable so a choice can be drafted before its destination node exists.';

create trigger choices_set_updated_at
  before update on public.choices
  for each row execute function public.set_updated_at();

create index choices_client_id_idx on public.choices (client_id);
create index choices_source_node_id_idx on public.choices (source_node_id);
create index choices_destination_node_id_idx on public.choices (destination_node_id);

-- Cross-tenant AND cross-experience integrity guard (belt-and-suspenders
-- on top of RLS): a choice's client_id must always match its source
-- node's client_id, and (when set) its destination node's client_id too —
-- per Decision 2's "foreign keys and validation must prevent mismatched
-- client relationships." Separately, a choice's source and destination
-- must belong to the SAME experience — a choice must never leave its own
-- experience's graph, regardless of tenant. This does NOT restrict
-- linking across different pathways within the same experience — that's
-- a deliberate, open product decision (per the review: "unless
-- cross-pathway transitions are explicitly allowed by the experience
-- model"), not enforced or blocked at the schema level either way.
create or replace function public.enforce_choice_client_consistency()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  source_client_id uuid;
  source_experience_id uuid;
  destination_client_id uuid;
  destination_experience_id uuid;
begin
  select client_id, experience_id into source_client_id, source_experience_id
  from public.content_nodes where id = new.source_node_id;

  if source_client_id is distinct from new.client_id then
    raise exception 'choices.client_id must match source_node_id''s client_id';
  end if;

  if new.destination_node_id is not null then
    select client_id, experience_id into destination_client_id, destination_experience_id
    from public.content_nodes where id = new.destination_node_id;

    if destination_client_id is distinct from new.client_id then
      raise exception 'choices.client_id must match destination_node_id''s client_id';
    end if;

    if destination_experience_id is distinct from source_experience_id then
      raise exception 'choices cannot connect content_nodes across different experiences';
    end if;
  end if;

  return new;
end;
$$;

create trigger choices_enforce_client_consistency
  before insert or update on public.choices
  for each row execute function public.enforce_choice_client_consistency();
