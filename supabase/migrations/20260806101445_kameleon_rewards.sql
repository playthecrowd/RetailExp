-- Phase 7 Journey/Rewards — reward-unlock ledger for Kameleon end users,
-- plus the Checkpoint 7.3 RLS tightening on experience_users that this
-- work now depends on (see docs/PHASE7_CHECKPOINT_7_3_AUTHENTICATION_PLAN.md
-- §1B). Mirrors the exact experience_users/journey_progress consistency-
-- trigger + RLS pattern from 20260804152544_runtime_and_analytics_tables.sql
-- and 20260804152549_rls_policies.sql.

-- experience_user_rewards ----------------------------------------------------
-- Insert-once, immutable ledger: idempotency is enforced by the unique
-- constraint below (application code upserts with ON CONFLICT DO NOTHING),
-- not by any client-side "have I already unlocked this" bookkeeping.

create table public.experience_user_rewards (
  id uuid primary key default gen_random_uuid(),
  experience_user_id uuid not null references public.experience_users (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  reward_key text not null,
  points_awarded integer not null default 0,
  unlocked_at timestamptz not null default now(),
  unique (experience_user_id, reward_key)
);

create index experience_user_rewards_experience_user_id_idx on public.experience_user_rewards (experience_user_id);
create index experience_user_rewards_client_id_idx on public.experience_user_rewards (client_id);

create or replace function public.enforce_experience_user_rewards_client_consistency()
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
    raise exception 'experience_user_rewards.client_id must match experience_user_id''s client_id';
  end if;
  return new;
end;
$$;

create trigger experience_user_rewards_enforce_client_consistency
  before insert or update on public.experience_user_rewards
  for each row execute function public.enforce_experience_user_rewards_client_consistency();

alter table public.experience_user_rewards enable row level security;

create policy experience_user_rewards_select_members on public.experience_user_rewards
  for select using (public.is_client_member(client_id) or public.is_platform_admin());

create policy experience_user_rewards_select_own on public.experience_user_rewards
  for select using (
    exists (
      select 1 from public.experience_users u
      where u.id = experience_user_rewards.experience_user_id and u.auth_user_id = auth.uid()
    )
  );

create policy experience_user_rewards_write_own on public.experience_user_rewards
  for insert with check (
    exists (
      select 1 from public.experience_users u
      where u.id = experience_user_rewards.experience_user_id and u.auth_user_id = auth.uid()
    )
  );

-- experience_users tightening (Checkpoint 7.3) --------------------------------
-- A user can now create a real (anonymous) auth session, so the previously-
-- deferred gaps in the Checkpoint 2 diagnosis get closed here: prevent a
-- fragmented duplicate self-enrollment, and prevent self-enrolling into a
-- draft/unpublished (or otherwise not-yet-eligible) experience.

alter table public.experience_users
  add constraint experience_users_experience_auth_user_unique unique (experience_id, auth_user_id);

drop policy if exists experience_users_write_own on public.experience_users;

create policy experience_users_write_own on public.experience_users
  for all using (auth_user_id = auth.uid())
  with check (
    auth_user_id = auth.uid()
    and exists (
      select 1 from public.experiences e
      where e.id = experience_users.experience_id and e.publication_status = 'published'
    )
  );
