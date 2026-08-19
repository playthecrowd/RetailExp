-- ===========================================================================
-- Expire abandoned upload intents.
--
-- THE HOLE THIS CLOSES
--   upload_expires_at is stamped on every intent and is read by the capture
--   RPCs to decide whether a live intent may be reused. NOTHING has ever acted
--   on it once it passes. An intent whose visitor closed the tab therefore
--   stays 'initiated' for ever.
--
--   That is not merely untidy. media_purge_after is set by the lifecycle
--   trigger when upload_status becomes 'abandoned' or 'failed', and the
--   deletable-asset listing reaches a submission's provider media through
--   exactly that column. An intent that never leaves 'initiated' therefore
--   never gets a purge date, so its ledger row is never listed, so its
--   Cloudflare asset is never deleted.
--
--   For a photo this is the common case, not the rare one: Cloudflare Images
--   direct upload creates the image as soon as the browser POSTs it. A visitor
--   who uploads and then closes the tab before finalizing leaves a real,
--   billable, undeletable image behind.
--
-- WHY A GRACE PERIOD
--   upload_expires_at is when the one-time destination stops being usable, not
--   when the visitor gave up. A slow upload can complete slightly after it and
--   still be finalized. Expiring exactly on the boundary would abandon
--   submissions that are about to succeed, and abandoning is not reversible:
--   'abandoned' is terminal for the upload machine. The grace period is
--   therefore deliberately generous relative to the 30-minute window.
--
-- WHAT IT CANNOT DO
--   Only 'initiated' rows are touched, and only into 'abandoned'. It cannot
--   reach an uploaded, valid, moderated or published submission, and it moves
--   no moderation state. The lifecycle trigger enforces that independently:
--   'uploaded' -> 'abandoned' is not a legal transition for any caller,
--   including this one.
-- ===========================================================================

/**
 * The grace period after upload_expires_at before an intent is considered
 * abandoned. Fifteen minutes, matching the reservation grace already used by
 * the provider-asset ledger.
 */
create or replace function public.expire_testimonial_upload_intents(
  p_limit integer default 50
)
returns table (submission_id uuid, upload_status public.testimonial_upload_status)
language plpgsql
security definer
set search_path = public, pg_catalog
as $fn$
begin
  return query
  update public.testimonial_submissions s
  set upload_status = 'abandoned'
  where s.id in (
    select t.id
    from public.testimonial_submissions t
    where t.upload_status = 'initiated'
      and t.upload_expires_at < now() - interval '15 minutes'
    order by t.upload_expires_at
    limit greatest(1, least(coalesce(p_limit, 50), 200))
  )
  returning s.id, s.upload_status;
end $fn$;

comment on function public.expire_testimonial_upload_intents(integer) is
  'Transitions intents whose upload window closed more than 15 minutes ago from initiated to abandoned. The lifecycle trigger then stamps media_purge_after, which is what makes their provider media reachable by the deletion sweep. Touches no other status and no moderation state. service_role only.';

revoke all on function public.expire_testimonial_upload_intents(integer)
  from public, anon, authenticated;
grant execute on function public.expire_testimonial_upload_intents(integer)
  to service_role;
