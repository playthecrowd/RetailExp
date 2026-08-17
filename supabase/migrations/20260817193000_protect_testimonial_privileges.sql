-- Corrective migration — remove inherited default privileges from the
-- testimonial views and base table.
--
-- Named for privileges rather than for the moderation queue alone, because the
-- investigation found the same root cause affecting all four objects, not just
-- the queue the failing checks reported.
--
-- WHAT WAS WRONG
--   Supabase grants a broad default privilege set on new objects in the public
--   schema to `anon` and `authenticated`. 20260817160000 revoked on the BASE
--   TABLE and then granted SELECT on the views — but it never revoked the
--   inherited defaults, so every object came out over-granted. Verified against
--   the live schema:
--
--     testimonial_gallery_items     anon, authenticated:
--       DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
--     testimonial_moderation_queue  anon, authenticated:  (same full set)
--     testimonial_my_submissions    anon, authenticated:  (same full set)
--     testimonial_submissions       authenticated:
--       INSERT, MAINTAIN, REFERENCES, TRIGGER, TRUNCATE
--
--   Three consequences, in descending severity:
--
--   1. TRUNCATE ON THE BASE TABLE. `authenticated` — which every Kameleon
--      visitor holds via Anonymous Sign-In — could TRUNCATE
--      testimonial_submissions. TRUNCATE is not subject to RLS and does not
--      fire row-level triggers, so none of the protections built in
--      20260817160000 would have stopped it. The prior migration's
--      `revoke select, update, delete` deliberately left INSERT, but silently
--      left TRUNCATE, REFERENCES, TRIGGER and MAINTAIN behind with it.
--
--   2. THE MODERATION QUEUE WAS BROWSER-READABLE. testimonial_moderation_queue
--      is owned by postgres with security_invoker=false, so a browser role
--      selecting from it executed as the owner and bypassed RLS on the base
--      table — exposing moderation notes, rejection reasons, reviewer identity
--      and provider references to anon.
--
--   3. THE AUTO-UPDATABLE VIEWS WERE WRITABLE. testimonial_gallery_items and
--      testimonial_moderation_queue are simple single-table views and are
--      therefore auto-updatable (information_schema.views.is_updatable = YES).
--      Combined with security_invoker=false, an INSERT/UPDATE/DELETE through
--      either view ran as the owner and bypassed base-table RLS. The base
--      table's BEFORE triggers still fired and would have raised 42501 for a
--      non-trusted auth.role(), so the triggers were the only thing left
--      standing — a single layer where the design called for four.
--
--   This also corrects a claim made when 20260817160000 was written: that no
--   browser role could reach the raw table. The table itself was revoked, but
--   the views re-exposed it.
--
-- APPROACH
--   Revoke ALL from public/anon/authenticated on every testimonial object,
--   then re-grant the minimum each surface actually needs. Revoking from
--   `public` as well is defensive: no PUBLIC grant exists today, but a future
--   `grant ... to public` would otherwise be inherited silently.
--
--   Nothing about the applied 20260817160000 is edited or weakened; this only
--   removes privileges that migration failed to take away.

-- ---------------------------------------------------------------------------
-- 1. Base table — INSERT an intent and UPDATE only `caption`, nothing else
-- ---------------------------------------------------------------------------
revoke all on public.testimonial_submissions from public, anon, authenticated;

grant insert on public.testimonial_submissions to authenticated;
grant update (caption) on public.testimonial_submissions to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Provider event ledger — service_role only, no browser access at all
-- ---------------------------------------------------------------------------
revoke all on public.testimonial_processing_events from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Views — revoke everything, then grant SELECT only where required
-- ---------------------------------------------------------------------------
revoke all on public.testimonial_gallery_items    from public, anon, authenticated;
revoke all on public.testimonial_my_submissions   from public, anon, authenticated;
revoke all on public.testimonial_moderation_queue from public, anon, authenticated;

-- Public gallery: read-only for both browser roles.
grant select on public.testimonial_gallery_items to anon, authenticated;

-- Submitter self-status: read-only, signed-in visitors only. anon gets nothing.
grant select on public.testimonial_my_submissions to authenticated;

-- Moderation queue: NO browser role. The admin surface reads it server-side
-- under service_role after verifying the caller's owner/admin membership.
-- Deliberately no grant statement here.

-- ---------------------------------------------------------------------------
-- 4. Harden the browser-readable views against predicate leakage
-- ---------------------------------------------------------------------------
-- Both remaining browser-readable views filter rows the caller must not see
-- (unapproved submissions; other people's submissions). security_barrier stops
-- a cheap caller-supplied predicate being evaluated ahead of the view's own
-- WHERE clause and leaking those rows through error messages or timing.
alter view public.testimonial_gallery_items  set (security_barrier = true);
alter view public.testimonial_my_submissions set (security_barrier = true);

-- security_invoker stays false on all three views: the view IS the boundary,
-- and its column list and WHERE clause are what may leave the database. That
-- is safe only because no browser role can write through them any more.

comment on view public.testimonial_moderation_queue is
  'Moderation queue — trusted-valid submissions only. NO browser role holds any privilege on this view: it is read server-side under service_role after verifying owner/admin membership. Invalid, incomplete, failed and abandoned submissions are excluded so unverified media is never rendered inline in a moderator browser.';
