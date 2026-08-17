-- Kameleon passport contact capture — adds an optional phone number to the
-- existing end-user record.
--
-- Scope is deliberately one column. The existing database representation of
-- the visitor's name is NOT changed: app/experience/kameleon/actions.ts
-- continues to write a single derived `display_name`, exactly as it does
-- today. No first_name/last_name columns are introduced here.
--
-- Additive only. The column is nullable with no default, so this migration
-- cannot fail on existing rows and cannot change the behaviour of any row
-- that already exists.
--
-- Idempotency: this follows the convention already used for ALTER TABLE ...
-- ADD COLUMN in this repository (see
-- 20260806115554_kameleon_reward_claims.sql, which adds `status` and
-- `claimed_at` with no IF NOT EXISTS guard). Migrations here are applied
-- exactly once via `supabase db push`; the `on conflict do nothing` /
-- `drop policy if exists` guards used elsewhere protect INSERTs of seed rows
-- and policy re-creation, not column addition. Matching that convention
-- keeps a re-run loudly failing rather than silently diverging.
--
-- RLS: intentionally unchanged. experience_users already has
--   * experience_users_select_members  -> can_view_experience_user_pii()
--     (owner/admin only; editors and viewers get nothing), and
--   * experience_users_write_own       -> auth_user_id = auth.uid()
-- The new column inherits both. Read access to phone_e164 is therefore
-- already restricted to owner/admin exactly as email and display_name are,
-- and a visitor can only ever write their own row. That self-write is
-- correct here precisely BECAUSE this migration adds no verification,
-- consent, or moderation column — there is nothing a user could
-- self-assert. The column-privilege + auth.role() trigger hardening
-- described in the Phase 7 plan becomes mandatory the moment any
-- *_verified_at or moderation field is introduced, and not before.
--
-- No SMS provider, verification flow, or messaging consent exists, so no
-- phone_verified_at and no consent columns are created here. Nothing in the
-- product may describe a stored number as verified.

alter table public.experience_users
  add column phone_e164 text,
  add constraint experience_users_phone_e164_format
    check (
      phone_e164 is null
      or phone_e164 ~ '^\+[1-9][0-9]{9,14}$'
    );

comment on column public.experience_users.phone_e164 is
  'Optional customer phone in canonical E.164. Format-accepted only — never treated as a verified or reachable number. No SMS consent is implied or recorded by its presence.';
