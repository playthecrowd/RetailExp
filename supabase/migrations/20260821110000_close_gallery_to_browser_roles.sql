-- ===========================================================================
-- The Gallery becomes readable only by the trusted server.
--
-- WHY
--   The stakeholder evaluation is a CLOSED pilot behind an access gate. That
--   gate is application-level — a cookie checked by a route-group layout — so
--   until now "closed" was true of the ROUTE and not of the DATA. Anyone
--   holding the project's publishable anon key could read
--   testimonial_gallery_items straight from PostgREST and enumerate every
--   approved caption, dimension and publication time without ever meeting the
--   gate.
--
--   The media itself was never exposed: provider_delivery_id is an opaque
--   handle, delivery requires a signed URL, and no URL or token is stored
--   anywhere. So this is not a media leak being closed. It is the difference
--   between an evaluation that is closed and one that merely looks closed —
--   and captions are visitor-written content about a product that has not
--   launched.
--
-- WHAT REPLACES IT
--   lib/testimonials/gallery.ts reads the view with the server-only secret
--   client, AFTER the access gate has already run. The trusted tier was
--   always going to be involved regardless: signed delivery URLs can only be
--   minted server-side, so the browser could never have rendered the Gallery
--   from a direct PostgREST read anyway.
--
-- WHAT THIS IS NOT
--   Not a change to the view's definition, its predicate, or what it exposes.
--   Column list, order, types and the Production-only filter are all
--   untouched. This migration changes exactly one thing: who may SELECT.
--
-- REVERSIBILITY
--   If the Gallery is ever genuinely public, restore the grant with
--     grant select on public.testimonial_gallery_items to anon, authenticated;
--   and delete this file's revoke. Nothing else depends on the distinction.
-- ===========================================================================

revoke all on public.testimonial_gallery_items from public, anon, authenticated;

comment on view public.testimonial_gallery_items is
  'Approved, trusted-valid, published, Production-only submissions. NO browser role holds any privilege on this view during the closed stakeholder evaluation: it is read server-side under service_role after the access gate, and every delivery handle is exchanged for a short-lived signed URL before anything reaches a browser. Deliberately excludes auth_user_id, experience_user_id, consent_version/consented_at, reviewed_by, moderation_note, rejection_reason and all internal validation fields. provider_delivery_id/provider_poster_id are OPAQUE HANDLES, never URLs or tokens.';
