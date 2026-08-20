-- ===========================================================================
-- The retail_gifting starter template.
--
-- PURELY ADDITIVE. Nothing here alters a table, column, policy, function or row
-- that the Kameleon experience depends on. Kameleon is a customised
-- retail_video_pathways tenant and must keep behaving exactly as it does now,
-- so this migration only CREATES: new enums, new tables, new policies on those
-- new tables, and one nullable column on experiences that defaults to the
-- template Kameleon already is.
--
-- TEMPLATES ARE A STARTING POINT, NOT A LIVE LINK
--   Provisioning copies a template's content into tenant-owned rows and records
--   which template and version it came from. It does not leave the client
--   pointing at the master. A later edit to a starter template must never
--   rewrite a client's customised experience, so nothing below has a foreign
--   key from tenant content back to template content - only the flat
--   `source_template` / `source_template_version` breadcrumbs.
--
-- TWO CODES, BOTH HASHED
--   A package code identifies one physical product. A gift message code
--   identifies one private message. Private content is released only when both
--   resolve to the SAME active assignment in the SAME tenant. Codes are stored
--   as SHA-256 hashes: the plaintext is shown once at generation and is not
--   recoverable from the database, so a dump of this table is not a set of
--   working keys. A short non-secret prefix is kept for support lookup.
--
-- ON RLS
--   Every table here carries the same two-policy shape the platform already
--   uses: members of the owning client, or a platform admin. Visitor-facing
--   reads never touch these tables directly from the browser - they go through
--   trusted server code, because code validation has to be rate limited and
--   fail closed, which a row policy cannot express.
-- ===========================================================================

-- --------------------------------------------------------------------------
-- Template family
-- --------------------------------------------------------------------------

create type public.experience_template as enum ('retail_gifting', 'retail_video_pathways');

-- Nullable with no default, then backfilled to the template Kameleon already
-- is. A NOT NULL default would have rewritten every existing row's meaning
-- silently; this way the backfill is explicit and visible below.
alter table public.experiences
  add column if not exists template public.experience_template;

alter table public.experiences
  add column if not exists source_template public.experience_template;

alter table public.experiences
  add column if not exists source_template_version integer;

-- Everything that exists today is a video-pathways experience. Kameleon keeps
-- its content, routes and settings untouched; it simply gains a label for what
-- it already was.
update public.experiences set template = 'retail_video_pathways' where template is null;

comment on column public.experiences.template is
  'Which starter template this experience was provisioned from. Kameleon is retail_video_pathways. The column is a LABEL, not a link: changing a starter template must never alter a provisioned experience.';

-- --------------------------------------------------------------------------
-- Per-experience gifting configuration
--
-- One row per gifting experience. Everything the dashboard can change about
-- the visitor flow lives here rather than in code, because the whole point of
-- a template is that two tenants can differ without a second codebase.
-- --------------------------------------------------------------------------

create type public.eligibility_gate_kind as enum ('disabled', 'age_18', 'age_21', 'custom_age', 'acknowledgement');

create table public.gifting_experience_settings (
  experience_id uuid primary key references public.experiences (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,

  -- Gift reveal ---------------------------------------------------------
  reveal_heading_template text not null default 'You Received a Gift From {sender}',
  reveal_poster_asset_id uuid references public.media_assets (id) on delete set null,
  reveal_allow_replay boolean not null default true,

  -- Eligibility gate ----------------------------------------------------
  -- Placement is deliberately data: the brief requires the gate AFTER the
  -- personalised reveal, and a later tenant may want it first.
  gate_kind public.eligibility_gate_kind not null default 'age_21',
  gate_minimum_age integer,
  gate_heading text not null default 'Are you 21 or older?',
  gate_body text not null default 'You must be 21 or older to continue this demonstration experience. Please enjoy and share responsibly.',
  gate_responsible_use text,
  gate_confirm_label text not null default 'Yes, I''m 21+',
  gate_decline_label text not null default 'No, Exit',
  gate_background_asset_id uuid references public.media_assets (id) on delete set null,
  gate_declined_url text,
  gate_position integer not null default 2,

  -- Brand intro ---------------------------------------------------------
  intro_enabled boolean not null default true,
  intro_video_asset_id uuid references public.media_assets (id) on delete set null,
  intro_poster_asset_id uuid references public.media_assets (id) on delete set null,
  intro_captions_asset_id uuid references public.media_assets (id) on delete set null,
  intro_heading text not null default 'A thoughtful gift deserves a personal story.',
  intro_body text not null default 'Record a message, personalize the experience and create something made especially for them.',
  intro_skip_allowed boolean not null default true,
  intro_continue_label text not null default 'Continue',

  -- Visitor capture -----------------------------------------------------
  visitor_phone_enabled boolean not null default true,
  visitor_phone_required boolean not null default false,
  visitor_marketing_consent_enabled boolean not null default true,
  terms_url text,
  privacy_url text,

  -- Gift creation -------------------------------------------------------
  standard_gifting_enabled boolean not null default true,
  ai_gifting_enabled boolean not null default true,
  regifting_enabled boolean not null default true,
  max_recording_seconds integer not null default 60,
  recipient_contact_required boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.gifting_experience_settings is
  'Everything the client dashboard can change about a retail_gifting visitor flow. Configuration, not code: the gate can be disabled or moved, the intro replaced, AI turned off, without touching the application.';

-- --------------------------------------------------------------------------
-- Physical packages and their codes
-- --------------------------------------------------------------------------

create type public.package_code_status as enum ('available', 'assigned', 'opened', 'regifted', 'revoked', 'expired');

create table public.gift_packages (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  experience_id uuid not null references public.experiences (id) on delete cascade,
  batch_label text,
  product_name text not null default 'Signature Gift Package',
  product_image_asset_id uuid references public.media_assets (id) on delete set null,
  -- Non-secret, and deliberately so: support needs to identify a package from
  -- a customer reading four characters off a card without that being enough to
  -- open anything.
  code_prefix text not null,
  code_hash text not null,
  status public.package_code_status not null default 'available',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, code_hash)
);

create index gift_packages_client_idx on public.gift_packages (client_id, status);

comment on column public.gift_packages.code_hash is
  'SHA-256 of the package code. The plaintext is displayed once at generation and never stored, so a copy of this table is not a set of working codes.';

-- --------------------------------------------------------------------------
-- Gift assignments: the binding this whole feature exists to protect
-- --------------------------------------------------------------------------

create type public.gift_assignment_status as enum ('active', 'opened', 'superseded', 'revoked', 'expired');
create type public.gift_video_kind as enum ('standard', 'ai');

create table public.gift_assignments (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  experience_id uuid not null references public.experiences (id) on delete cascade,
  package_id uuid not null references public.gift_packages (id) on delete cascade,

  sender_visitor_id uuid references public.experience_users (id) on delete set null,
  sender_name text not null,
  recipient_name text not null,
  recipient_email text,
  recipient_phone text,
  recipient_note text,

  source_video_asset_id uuid references public.media_assets (id) on delete set null,
  completed_video_asset_id uuid references public.media_assets (id) on delete set null,
  video_kind public.gift_video_kind not null default 'standard',

  message_code_prefix text not null,
  message_code_hash text not null,

  status public.gift_assignment_status not null default 'active',
  -- Regifting supersedes rather than rewrites: the previous assignment stays
  -- in the table with status 'superseded' and its own history row.
  supersedes_assignment_id uuid references public.gift_assignments (id) on delete set null,
  opened_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, message_code_hash)
);

-- ONE ACTIVE ASSIGNMENT PER PACKAGE. A partial unique index rather than a
-- trigger, so the database refuses a second one rather than the application
-- remembering to check. Superseded and revoked rows are exempt, which is what
-- makes regifting history possible at all.
create unique index gift_assignments_one_active_per_package
  on public.gift_assignments (package_id)
  where status in ('active', 'opened');

create index gift_assignments_client_idx on public.gift_assignments (client_id, status);
create index gift_assignments_sender_idx on public.gift_assignments (sender_visitor_id);

comment on index public.gift_assignments_one_active_per_package is
  'A package may hold only one live assignment. Regifting creates a NEW row and marks the old one superseded, so the chain is preserved rather than overwritten.';

create table public.gift_assignment_events (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  assignment_id uuid not null references public.gift_assignments (id) on delete cascade,
  event text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index gift_assignment_events_assignment_idx on public.gift_assignment_events (assignment_id, created_at);

-- Rate limiting for code validation. Append-only; the trusted server counts
-- recent failures per identifier before it will look a code up at all.
create table public.gift_code_attempts (
  id bigserial primary key,
  client_id uuid references public.clients (id) on delete cascade,
  identifier text not null,
  succeeded boolean not null,
  created_at timestamptz not null default now()
);

create index gift_code_attempts_lookup on public.gift_code_attempts (identifier, created_at desc);

-- --------------------------------------------------------------------------
-- AI scene templates
-- --------------------------------------------------------------------------

create table public.ai_scene_templates (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  experience_id uuid references public.experiences (id) on delete cascade,
  slug text not null,
  title text not null,
  description text,
  thumbnail_asset_id uuid references public.media_assets (id) on delete set null,
  -- A scaffold, not a free-text field. Version one gives visitors a choice of
  -- three controlled scenes; it does not give them a prompt box.
  prompt_scaffold text not null,
  negative_prompt text,
  provider text not null default 'mock',
  model text,
  duration_seconds integer not null default 8,
  aspect_ratio text not null default '9:16',
  brand_reference_asset_ids uuid[] not null default '{}',
  retail_credit_price integer not null default 10,
  version integer not null default 1,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, slug, version)
);

create index ai_scene_templates_client_idx on public.ai_scene_templates (client_id, active, sort_order);

-- --------------------------------------------------------------------------
-- AI generation jobs
-- --------------------------------------------------------------------------

create type public.ai_job_status as enum (
  'uploaded', 'preparing', 'submitted', 'generating',
  'synchronizing_audio', 'finalizing', 'ready',
  'failed', 'cancelled', 'expired', 'deleted'
);

create table public.ai_generation_jobs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  experience_id uuid not null references public.experiences (id) on delete cascade,
  visitor_id uuid references public.experience_users (id) on delete set null,
  assignment_id uuid references public.gift_assignments (id) on delete set null,
  template_id uuid references public.ai_scene_templates (id) on delete set null,

  source_video_asset_id uuid references public.media_assets (id) on delete set null,
  result_video_asset_id uuid references public.media_assets (id) on delete set null,

  status public.ai_job_status not null default 'uploaded',
  -- Genuine stages only. There is no percentage column on purpose: a progress
  -- bar the provider cannot substantiate is a lie with a nice animation.
  status_detail text,
  provider text not null default 'mock',
  provider_job_id text,
  attempt_count integer not null default 0,
  failure_reason text,

  -- The visitor's own recording is the authoritative voice unless someone
  -- deliberately turns that off. Default true, never silently flipped.
  preserve_original_audio boolean not null default true,
  likeness_consent_at timestamptz,
  audio_consent_at timestamptz,

  -- Margin: what Plotabl paid, and what the client was charged, kept apart.
  provider_expense_cents integer,
  retail_credit_charge integer,
  -- One charge per job, enforced by the ledger's unique index below.
  idempotency_key text not null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, idempotency_key)
);

create index ai_generation_jobs_client_idx on public.ai_generation_jobs (client_id, status, created_at desc);
create index ai_generation_jobs_visitor_idx on public.ai_generation_jobs (visitor_id, created_at desc);

-- --------------------------------------------------------------------------
-- Credit ledger
--
-- APPEND ONLY. Balance is a SUM, never a stored number that can drift out of
-- agreement with its own history. There is no UPDATE policy on this table for
-- anyone, including platform admins.
-- --------------------------------------------------------------------------

create type public.credit_entry_type as enum (
  'purchase', 'promotional_grant', 'reservation', 'generation_charge',
  'reservation_release', 'technical_refund', 'manual_adjustment', 'expiration'
);

create table public.credit_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  entry_type public.credit_entry_type not null,
  -- Signed. Grants and refunds are positive, reservations and charges
  -- negative, and the balance is their sum - so no code path can "adjust" a
  -- balance without leaving a row that says who and why.
  amount integer not null,
  job_id uuid references public.ai_generation_jobs (id) on delete set null,
  note text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index credit_ledger_client_idx on public.credit_ledger_entries (client_id, created_at desc);

-- A job may reserve once and be charged once. This is the duplicate-charge
-- guard, in the database rather than in a hopeful if-statement.
create unique index credit_ledger_one_entry_per_job_type
  on public.credit_ledger_entries (job_id, entry_type)
  where job_id is not null
    and entry_type in ('reservation', 'generation_charge', 'reservation_release', 'technical_refund');

comment on table public.credit_ledger_entries is
  'Immutable. Available balance is the SUM of amount for a client; there is no stored balance to drift. No update policy exists for any role.';

create or replace function public.client_credit_balance(check_client_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(amount), 0)::integer
  from public.credit_ledger_entries
  where client_id = check_client_id;
$$;

-- --------------------------------------------------------------------------
-- Row level security
--
-- Same shape as the rest of the platform: the owning client's members, or a
-- platform admin. Visitor-facing reads go through trusted server code, which
-- is why there is no anonymous policy anywhere below.
-- --------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'gifting_experience_settings', 'gift_packages', 'gift_assignments',
    'gift_assignment_events', 'ai_scene_templates', 'ai_generation_jobs',
    'credit_ledger_entries'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy %I on public.%I for select using (public.is_client_member(client_id) or public.is_platform_admin())',
      t || '_select_members', t);
  end loop;

  -- Write access for the tenant's editors, on everything EXCEPT the ledger.
  foreach t in array array[
    'gifting_experience_settings', 'gift_packages', 'gift_assignments',
    'gift_assignment_events', 'ai_scene_templates', 'ai_generation_jobs'
  ]
  loop
    execute format(
      'create policy %I on public.%I for all using (public.can_edit_client(client_id) or public.is_platform_admin()) with check (public.can_edit_client(client_id) or public.is_platform_admin())',
      t || '_write_editors', t);
  end loop;
end
$$;

-- The ledger gets SELECT only. Entries are written by trusted server code
-- under the service role, which bypasses RLS - so there is deliberately no
-- insert or update policy for any browser-reachable role, and no update
-- policy at all.
alter table public.gift_code_attempts enable row level security;
create policy gift_code_attempts_select_members on public.gift_code_attempts
  for select using (public.is_client_member(client_id) or public.is_platform_admin());

-- --------------------------------------------------------------------------
-- updated_at triggers, matching the platform's existing convention
-- --------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'gifting_experience_settings', 'gift_packages', 'gift_assignments',
    'ai_scene_templates', 'ai_generation_jobs'
  ]
  loop
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
      t || '_set_updated_at', t);
  end loop;
end
$$;
