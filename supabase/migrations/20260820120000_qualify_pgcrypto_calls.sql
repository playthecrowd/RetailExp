-- Phase 4C corrective — schema-qualify every pgcrypto call.
--
-- THE DEFECT
--   Two applied SECURITY DEFINER functions call gen_random_bytes(16)
--   unqualified while pinning `set search_path = public, pg_catalog`.
--   pgcrypto is installed in the `extensions` schema on this project, which is
--   on neither path element, so neither call can resolve and both functions
--   raise "function gen_random_bytes(integer) does not exist" the first time
--   they are actually executed:
--
--     public.create_testimonial_intent          (20260819103000)
--     public.reserve_testimonial_provider_attempt (20260820090000)
--
--   Both migrations applied cleanly because a plpgsql body is parsed, not
--   resolved, at CREATE time. Only execution resolves the name — which is why
--   a migration applying successfully proves nothing about whether the
--   functions it defines can run.
--
--   create_testimonial_intent was the more dangerous of the two: every test
--   that called it expected a refusal at the privilege check, so its body had
--   never been executed by any passing run. The gate that made those tests
--   pass was the same gate hiding the defect. Section 25 of the SQL suite now
--   executes the SUCCESSFUL path of both.
--
-- WHY QUALIFY RATHER THAN WIDEN search_path
--   Adding `extensions` to the search_path would fix these calls and quietly
--   widen name resolution for every other identifier in both functions. The
--   pinned two-element path is a security property established in Phase 4B and
--   asserted by the structural suite; qualifying the call site keeps that
--   property intact and makes the dependency explicit where it is used.
--
-- SCOPE
--   Supersedes exactly two functions with CREATE OR REPLACE. NEITHER applied
--   migration is edited. Each definition below is reproduced byte-for-byte
--   from its applied source with a single substitution, and that was verified
--   mechanically: reversing the qualification reproduces the applied text
--   exactly. Signature, return type, SECURITY DEFINER, pinned search_path,
--   authorization, locking, lifecycle behaviour and error codes are unchanged.
--
--   Both revokes and both service_role grants are restated so this file states
--   the privilege outcome rather than relying on CREATE OR REPLACE preserving
--   the existing ACL.

-- ---------------------------------------------------------------------------
-- 1. create_testimonial_intent — applied 20260819103000
-- ---------------------------------------------------------------------------
create or replace function public.create_testimonial_intent(
  p_visitor_id uuid,
  p_media_type public.testimonial_media_type
)
returns table (
  submission_id uuid,
  media_type public.testimonial_media_type,
  upload_status public.testimonial_upload_status,
  upload_expires_at timestamptz,
  upload_attempt_count integer
)
language plpgsql
security definer
set search_path = public, pg_catalog
as $fn$
declare
  v_uid             uuid := p_visitor_id;
  v_eu              uuid;
  v_client          uuid;
  v_exp             uuid;
  v_existing        uuid;
  v_consent_version text;
begin
  -- THE LEGAL GATE. Resolved from the registry, never from the caller. Empty
  -- registry means no active version, which means no submission can be
  -- created - the fail-closed behaviour real Terms and Privacy documents are
  -- a prerequisite for.
  select public.active_consent_version() into v_consent_version;
  if v_consent_version is null then
    raise exception 'no published consent version is active' using errcode = '42501';
  end if;

  -- Tenancy is resolved HERE, from the caller's own enrollment. No client id,
  -- experience id or auth id is accepted as a parameter, so there is nothing
  -- for a browser to point somewhere else.
  --
  -- The experience is chosen by CAPABILITY, not by name: an enrollment in a
  -- published experience that has capture switched on. Hardcoding a client
  -- slug here would put a campaign-specific identifier into shared schema,
  -- which this project's structural checks rightly forbid - the schema stays
  -- universal, and the client-specific part lives in data.
  select eu.id, eu.client_id, eu.experience_id
  into v_eu, v_client, v_exp
  from public.experience_users eu
  join public.experiences e on e.id = eu.experience_id
  where eu.auth_user_id = v_uid
    and e.publication_status = 'published'
    and e.testimonial_capture_enabled
  order by eu.created_at desc
  limit 1;

  if v_eu is null then
    raise exception 'no visitor enrollment found' using errcode = '42501';
  end if;

  perform public.assert_testimonial_visitor(v_uid, v_eu);

  -- Reuse a live intent rather than creating a second one.
  select s.id into v_existing
  from public.testimonial_submissions s
  where s.experience_user_id = v_eu
    and s.upload_status = 'initiated'
    and s.upload_expires_at > now()
    and s.media_type = p_media_type
  order by s.created_at desc
  limit 1;

  if v_existing is not null then
    return query
      select s.id, s.media_type, s.upload_status, s.upload_expires_at, s.upload_attempt_count
      from public.testimonial_submissions s
      where s.id = v_existing;
    return;
  end if;

  return query
  insert into public.testimonial_submissions (
    client_id, experience_id, experience_user_id, auth_user_id, media_type,
    client_submission_key, consent_version, consented_at,
    attested_no_minors, attested_subjects_consented,
    environment_marker
  )
  values (
    v_client, v_exp, v_eu, v_uid, p_media_type,
    -- Server-generated, so it is unguessable and cannot be chosen to collide
    -- with another visitor's row.
    encode(extensions.gen_random_bytes(16), 'hex'),
    v_consent_version, now(),
    -- The base table's CHECK requires both true, so an intent cannot exist
    -- without the attestations the UI collected before calling this.
    true, true,
    -- No environment marker. The trusted validation path stamps it later from
    -- server-side provider configuration; until then the submission cannot
    -- become valid, be moderated, or reach the Gallery.
    null
  )
  returning
    testimonial_submissions.id,
    testimonial_submissions.media_type,
    testimonial_submissions.upload_status,
    testimonial_submissions.upload_expires_at,
    testimonial_submissions.upload_attempt_count;
end $fn$;

revoke all on function public.create_testimonial_intent(uuid, public.testimonial_media_type)
  from public, anon, authenticated;
grant execute on function public.create_testimonial_intent(uuid, public.testimonial_media_type)
  to service_role;

-- ---------------------------------------------------------------------------
-- 2. reserve_testimonial_provider_attempt — applied 20260820090000
-- ---------------------------------------------------------------------------
create or replace function public.reserve_testimonial_provider_attempt(
  p_visitor_id uuid,
  p_submission_id uuid,
  p_provider text,
  p_environment text,
  p_expires_at timestamptz
)
returns table (
  ledger_id uuid,
  opaque_reference text,
  attempt_no integer,
  media_type public.testimonial_media_type
)
language plpgsql
security definer
set search_path = public, pg_catalog
as $fn$
declare
  v_eu         uuid;
  v_media      public.testimonial_media_type;
  v_upload     public.testimonial_upload_status;
  v_validation public.testimonial_validation_status;
  v_moderation public.testimonial_moderation_status;
  v_deleted    timestamptz;
  v_expires    timestamptz;
  v_attempts   integer;
  v_next       integer;
  v_ref        text;
  v_id         uuid;
begin
  if p_provider not in ('cloudflare_images', 'cloudflare_stream') then
    raise exception 'unknown media provider' using errcode = '22023';
  end if;
  if p_environment not in ('preview', 'production') then
    raise exception 'unknown provider environment' using errcode = '22023';
  end if;
  if p_expires_at is null or p_expires_at <= now() then
    raise exception 'a reservation must expire in the future' using errcode = '22023';
  end if;

  -- The row is locked for the whole decision, so two concurrent reservations
  -- cannot both supersede the same attempt and both insert a new active one.
  select s.experience_user_id, s.media_type, s.upload_status, s.validation_status,
         s.moderation_status, s.media_deleted_at, s.upload_expires_at, s.upload_attempt_count
  into v_eu, v_media, v_upload, v_validation, v_moderation, v_deleted, v_expires, v_attempts
  from public.testimonial_submissions s
  where s.id = p_submission_id
  for update;

  -- Absent and not-yours produce the SAME error, so submission ids cannot be
  -- probed through this function.
  if v_eu is null then
    raise exception 'submission not found or not available' using errcode = '42501';
  end if;
  perform public.assert_testimonial_visitor(p_visitor_id, v_eu);

  -- The legal gate, re-checked here and not only at intent creation: capture
  -- must not proceed to an upload if consent was withdrawn in between.
  if public.active_consent_version() is null then
    raise exception 'no published consent version is active' using errcode = '42501';
  end if;

  if v_upload <> 'initiated' then
    raise exception 'only an in-flight intent can request an upload destination'
      using errcode = '42501';
  end if;
  if v_validation = 'valid' then
    raise exception 'a validated submission cannot be re-uploaded' using errcode = '42501';
  end if;
  if v_moderation <> 'pending' then
    raise exception 'a moderated submission cannot be re-uploaded' using errcode = '42501';
  end if;
  if v_deleted is not null then
    raise exception 'a submission whose media was deleted cannot be re-uploaded'
      using errcode = '42501';
  end if;
  if v_expires + interval '15 minutes' < now() then
    raise exception 'this upload intent has expired' using errcode = '42501';
  end if;

  -- ATTEMPT NUMBERING IS DETERMINISTIC.
  --   upload_attempt_count 0 -> attempt 1  (the initial destination)
  --   upload_attempt_count 1 -> attempt 2  (after the first retry)
  --   upload_attempt_count 2 -> attempt 3  (after the second retry)
  -- retry_testimonial_upload, superseded in section 8 below, refuses to
  -- increment past 2, so three destinations is the hard ceiling and this
  -- check is the second of the two that enforce it.
  v_next := v_attempts + 1;

  if v_next > 3 then
    raise exception 'no upload attempts remain for this submission' using errcode = '42501';
  end if;

  -- ONE DESTINATION PER ATTEMPT. Two concurrent reservations would otherwise
  -- both mint a provider destination for the same attempt, and the second
  -- would silently supersede an asset the visitor may already be uploading
  -- to. The submission row is locked above, so this read is serialised; the
  -- caller must retry (which advances the attempt) to get another.
  --
  -- Superseding happens in retry_testimonial_upload, not here, so the ledger
  -- attempt and upload_attempt_count always advance together.
  if exists (
    select 1 from public.testimonial_provider_assets a
    where a.submission_id = p_submission_id
      and a.superseded_at is null
      and a.failed_at is null
      and a.deleted_at is null
  ) then
    raise exception 'an upload destination has already been issued for this attempt'
      using errcode = '42501';
  end if;

  v_ref := encode(extensions.gen_random_bytes(16), 'hex');

  insert into public.testimonial_provider_assets
    (submission_id, attempt_no, provider, media_type, provider_asset_id,
     environment_marker, opaque_reference, reservation_expires_at)
  values
    (p_submission_id, v_next, p_provider, v_media, null,
     p_environment, v_ref, p_expires_at)
  returning id into v_id;

  -- Returns the reference and nothing that could be replayed: no submission
  -- state, no provider identifier (there is none yet), no URL.
  return query select v_id, v_ref, v_next, v_media;
end $fn$;

revoke all on function public.reserve_testimonial_provider_attempt(uuid, uuid, text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.reserve_testimonial_provider_attempt(uuid, uuid, text, text, timestamptz)
  to service_role;
