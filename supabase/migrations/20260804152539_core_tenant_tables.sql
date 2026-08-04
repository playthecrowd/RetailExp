-- Phase 7 Checkpoint 2 — core tenant tables: clients, profiles, client_memberships.

-- security invoker (default) is correct here — this function never needs
-- to see or touch anything the calling role couldn't already access, so
-- there's no reason to grant it elevated privilege. search_path is still
-- pinned explicitly, per Supabase's function-search-path-mutable
-- advisory, which applies to every function regardless of invoker/definer.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- clients ---------------------------------------------------------------

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  status public.client_status not null default 'active',
  primary_color text,
  secondary_color text,
  logo_asset_id uuid, -- fk added in experience_content_tables migration (media_assets is created there)
  custom_domain text,
  contact_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.clients is 'A tenant of the platform. Kameleon is the first row, not a hardcoded concept.';

create trigger clients_set_updated_at
  before update on public.clients
  for each row execute function public.set_updated_at();

-- profiles ----------------------------------------------------------------
-- 1:1 companion to auth.users, per standard Supabase convention.
-- is_platform_admin grants cross-client access (see rls_policies migration)
-- and is deliberately NOT settable through any client-permitted RLS write —
-- see role_promotion_protections migration.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  avatar_url text,
  is_platform_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is 'Public-schema companion to auth.users. is_platform_admin is protected — see role_promotion_protections.sql.';

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Auto-create a profile row whenever a new Supabase Auth user is created.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, new.raw_user_meta_data ->> 'full_name');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Postgres grants EXECUTE on new functions to PUBLIC by default. This
-- function is SECURITY DEFINER (runs with elevated privilege) and is only
-- meant to be invoked by the trigger above — a directly-callable
-- `select public.handle_new_user()` by an authenticated/anon role would
-- let them insert an arbitrary profiles row under elevated privilege
-- outside the normal signup flow. Trigger execution does not require the
-- firing role to hold EXECUTE on the trigger function, so this revoke is
-- safe and does not break the trigger above.
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- client_memberships --------------------------------------------------------

create table public.client_memberships (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.membership_role not null default 'viewer',
  created_at timestamptz not null default now(),
  unique (client_id, user_id)
);

comment on table public.client_memberships is 'Which admin users can manage which client, and at what role. Role changes are protected — see role_promotion_protections.sql.';

create index client_memberships_user_id_idx on public.client_memberships (user_id);
create index client_memberships_client_id_idx on public.client_memberships (client_id);
