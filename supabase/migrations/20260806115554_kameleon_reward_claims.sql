-- Phase 7 Journey/Rewards — split reward eligibility from claiming.
-- Previously experience_user_rewards rows went straight to "unlocked with
-- points" the instant their trigger fired. Now a trigger only creates a
-- pending entitlement (0 points); the reward becomes claimed — and points
-- are awarded — only when the user explicitly selects Claim (via the
-- PP-FINAL congratulations popup, or the Rewards page's Claim button for
-- the other three). See app/experience/kameleon/actions.ts.

alter table public.experience_user_rewards
  add column status text not null default 'pending' check (status in ('pending', 'claimed')),
  add column claimed_at timestamptz;

-- Existing rows from the prior release were inserted as instantly-unlocked
-- with points already counted — backfill them as already-claimed so
-- nothing regresses for that data.
update public.experience_user_rewards
  set status = 'claimed', claimed_at = unlocked_at
  where status = 'pending';

-- The old policy allowed only INSERT ("for all" was misleading — the WITH
-- CHECK made UPDATE/DELETE impossible in practice since there was nothing
-- to update). Split into an explicit INSERT policy (create the pending
-- entitlement) and an explicit UPDATE policy (claim it) — both still
-- scoped to the caller's own row via experience_users.auth_user_id.
drop policy if exists experience_user_rewards_write_own on public.experience_user_rewards;

create policy experience_user_rewards_insert_own on public.experience_user_rewards
  for insert with check (
    exists (
      select 1 from public.experience_users u
      where u.id = experience_user_rewards.experience_user_id and u.auth_user_id = auth.uid()
    )
  );

create policy experience_user_rewards_claim_own on public.experience_user_rewards
  for update using (
    exists (
      select 1 from public.experience_users u
      where u.id = experience_user_rewards.experience_user_id and u.auth_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.experience_users u
      where u.id = experience_user_rewards.experience_user_id and u.auth_user_id = auth.uid()
    )
  );
