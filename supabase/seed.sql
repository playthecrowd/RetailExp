-- Phase 7 Checkpoint 2 — minimal seed data.
--
-- Per Decision 3: only the minimum platform records needed for
-- verification. NOT the full Kameleon pathway tree or production media —
-- that's a later, separately-verified checkpoint (see
-- docs/PHASE7_PLATFORM_ARCHITECTURE_PREFLIGHT.md §14, Checkpoint 7.4).
--
-- Only the legitimate Kameleon client/experience are seeded here. The
-- throwaway second tenant used to verify isolation lives entirely inside
-- supabase/tests/tenant_isolation_check.sql, created and rolled back
-- within that test's own transaction — this file must never contain
-- fixture/test-only data, since it's meant to be safe to run against a
-- real project.
--
-- Idempotent by design: conflicts are resolved on the actual unique
-- business keys (slug / (client_id, slug)) rather than the seed's own
-- hardcoded ids, and always DO NOTHING — never DO UPDATE — so rerunning
-- this file can never clobber legitimate changes an admin has since made
-- to the Kameleon client or experience row.

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
