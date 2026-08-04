-- Phase 7 Checkpoint 2 — initial legitimate platform records.
--
-- Moved out of supabase/seed.sql per review: Supabase's current guidance
-- advises against using `db push --include-seed` against a real project
-- (seed data is meant for local/preview development, not production).
-- These two rows are real, legitimate platform data — not test fixtures —
-- so they belong in a tracked migration, applied the same way as the
-- schema itself, not in the dev-only seed path.
--
-- Idempotent by design, same as the original seed.sql: conflicts resolve
-- on the real unique business keys (slug / (client_id, slug)), always DO
-- NOTHING — never DO UPDATE — so this can never overwrite a legitimate
-- edit an admin has since made.
--
-- Contains ONLY the Kameleon client and its draft experience. No test
-- tenants, no test users, no memberships, no pathway/content/media
-- fixtures — those never belonged here and still don't.

insert into public.clients (id, slug, name, status, primary_color, secondary_color)
values (
  '00000000-0000-0000-0000-000000000001',
  'kameleon',
  'Kameleon',
  'active',
  '#c98a4b', -- kameleon-copper, approximate
  '#7a1f2b'  -- kameleon-red, approximate
)
on conflict (slug) do nothing;

insert into public.experiences (
  id, client_id, slug, name, experience_type, signup_required, publication_status
)
select
  '00000000-0000-0000-0000-000000000002',
  c.id,
  'kameleon',
  'Kameleon Interactive Journey',
  'branching-video',
  true,
  'draft'
from public.clients c
where c.slug = 'kameleon'
on conflict (client_id, slug) do nothing;
