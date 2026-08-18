-- Phase 4B — visitor-facing capture surface.
--
-- Adds only what a visitor flow needs that did not already exist: a
-- per-experience capture gate, an attempt counter, an environment marker, and
-- four narrowly scoped SECURITY DEFINER RPCs.
--
-- WHY RPCs RATHER THAN THE SECRET CLIENT
--   The visitor path must run AS the visitor: auth.uid() is what proves
--   ownership of the experience_users row, and the insert trigger stamps
--   auth_user_id from it. Reaching for the secret client would make auth.uid()
--   null and destroy exactly the identity this surface is built on. SECURITY
--   DEFINER lets these functions write columns the browser holds no privilege
--   on, while still evaluating ownership against the caller's real identity.
--
-- WHY THE CAPTURE RPCs ARE service_role ONLY
--   An earlier draft granted them to `authenticated` and relied on
--   auth.uid() inside each function. Review found the flaw: the environment
--   feature flag is a Node variable that PostgreSQL cannot see, and the
--   database gate lives on a row SHARED by Preview and Production. Once that
--   row is enabled for Production, a Preview browser could skip the Server
--   Action and call the RPC directly through PostgREST - passing the only
--   gate the database could check. The environment gate was not independent
--   at all.
--
--   So the trust boundary moves. The Server Action verifies the session with
--   the caller's own client, establishes that the identity is explicitly
--   anonymous, and only then uses the server-only secret client to invoke a
--   service_role-only RPC, passing the ALREADY-VERIFIED user id. The RPC
--   re-resolves that id from auth.users and re-checks everything itself; it
--   trusts the caller's identity claim no further than it can verify it.
--
--   This also fixes a latent bug: protect_testimonial_capture_columns()
--   treats auth.role() = 'authenticated' as untrusted, so the old
--   authenticated-callable retry RPC would have been blocked by its own guard
--   when incrementing upload_attempt_count.
--
-- WHAT THE BROWSER CAN DO, NARROWED BY THIS MIGRATION
--   Pre-application review found that table-level INSERT plus an RLS policy
--   requiring only "owns the enrollment AND the experience is published" let a
--   visitor create a submission by posting straight to PostgREST - bypassing
--   create_testimonial_intent and therefore BOTH capture gates, while choosing
--   their own consent_version and environment_marker. Every gate lived in the
--   RPC, and nothing forced callers through it.
--
--   Section 0 revokes that INSERT. create_testimonial_intent is SECURITY
--   DEFINER and inserts as owner, so it is unaffected; the RLS insert policy
--   becomes defence in depth rather than the only control.
--
--   `authenticated` is left with UPDATE(caption) only, and that path is
--   further constrained in section 7.

-- ---------------------------------------------------------------------------
-- 0. Close the direct-INSERT bypass
-- ---------------------------------------------------------------------------
-- The single most important statement in this migration. Without it every
-- check below is optional, because a caller can simply not use the RPC.
revoke insert on public.testimonial_submissions from authenticated;

-- ---------------------------------------------------------------------------
-- 0b. Consent document registry
-- ---------------------------------------------------------------------------
-- An AUTHORITATIVE allow-list, not a negative check. Rejecting a known-bad
-- sentinel would still admit any invented version string; only versions that
-- exist here, are published, and are marked active can ever be recorded.
--
-- The table is EMPTY on application, so creation fails closed until real Terms
-- and Privacy documents exist and someone deliberately publishes a row.
create table if not exists public.consent_document_versions (
  version      text primary key,
  terms_url    text not null,
  privacy_url  text not null,
  published_at timestamptz,
  is_active    boolean not null default false,
  created_at   timestamptz not null default now(),
  -- An active version must point at REAL published documents. A non-empty
  -- string alone would accept "tbd" or "#", so both URLs must be https://
  -- with an actual host - the check is about whether a visitor could truly
  -- read what they are agreeing to.
  constraint consent_version_active_requires_publication
    check (not is_active or (published_at is not null
           and terms_url   ~ '^https://[^[:space:]/]+\.[^[:space:]/]+(/|$)'
           and privacy_url ~ '^https://[^[:space:]/]+\.[^[:space:]/]+(/|$)'))
);

-- At most one active version at a time, so "the active version" is never
-- ambiguous and the RPC never has to choose between two.
create unique index if not exists consent_document_versions_single_active
  on public.consent_document_versions ((true)) where is_active;

alter table public.consent_document_versions enable row level security;

-- No browser role reads or writes this. It is trusted configuration, resolved
-- server-side inside a SECURITY DEFINER function.
revoke all on public.consent_document_versions from public, anon, authenticated;

comment on table public.consent_document_versions is
  'Authoritative registry of consent versions. A submission may only record a version that exists here, is published and is active. Empty by default so capture fails closed until real Terms and Privacy documents are published.';

/**
 * Resolves the single active consent version, or NULL when none is published.
 * SECURITY DEFINER because no browser role may read the registry directly.
 */
create or replace function public.active_consent_version()
returns text
language sql
stable
security definer
set search_path = public, pg_catalog
as $fn$
  select v.version
  from public.consent_document_versions v
  where v.is_active and v.published_at is not null
  limit 1;
$fn$;

-- PostgreSQL grants EXECUTE on a new function to PUBLIC by default, so
-- "nobody was granted it" is NOT the same as "nobody can call it". The revoke
-- must name PUBLIC explicitly, and service_role with it: the intent RPC reaches
-- this function as its OWNER, not as the invoking role, so no caller needs
-- EXECUTE for the capture flow to work.
revoke all on function public.active_consent_version()
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 1. Per-experience capture gate
-- ---------------------------------------------------------------------------
-- Defaults FALSE, so applying this migration enables nothing anywhere. The
-- application's KAMELEON_TESTIMONIAL_CAPTURE_ENABLED variable is the second,
-- independent gate.
--
-- This gate is checked INSIDE the RPCs rather than only in the Server Action,
-- so it holds for any caller that ever reaches them - it does not depend on
-- the grants below staying as they are. (An earlier draft granted the RPCs to
-- `authenticated`, which is what originally made this gate necessary; they are
-- now service_role-only, and this check is the defence in depth that survives
-- that change.)
alter table public.experiences
  add column if not exists testimonial_capture_enabled boolean not null default false;

comment on column public.experiences.testimonial_capture_enabled is
  'Per-experience capture gate, default false. Checked inside the visitor RPCs so the gate holds even for a caller that bypasses the application. Paired with the server-only KAMELEON_TESTIMONIAL_CAPTURE_ENABLED variable.';

-- ---------------------------------------------------------------------------
-- 2. Attempt counter and environment marker
-- ---------------------------------------------------------------------------
alter table public.testimonial_submissions
  add column if not exists upload_attempt_count integer not null default 0,
  add column if not exists environment_marker text;

-- Three attempts, enforced by the database rather than by a client counter.
alter table public.testimonial_submissions
  drop constraint if exists testimonial_upload_attempts_capped;
alter table public.testimonial_submissions
  add constraint testimonial_upload_attempts_capped
  check (upload_attempt_count between 0 and 3);

-- Preview media must never be publishable from Production.
--
-- The marker starts NULL and is NEVER set by the visitor, the browser or the
-- intent RPC. Letting the creator declare its own environment would make the
-- isolation self-asserted: a Preview client could simply claim 'production'.
-- Only the trusted validation/webhook path may stamp it, from server-side
-- provider configuration, and section 2b makes it immutable once stamped.
--
-- Nothing can become valid, enter moderation, or reach the Gallery without it.
alter table public.testimonial_submissions
  drop constraint if exists testimonial_environment_marker_known;
alter table public.testimonial_submissions
  add constraint testimonial_environment_marker_known
  check (environment_marker is null or environment_marker in ('preview', 'production'));

comment on column public.testimonial_submissions.upload_attempt_count is
  'Upload attempts consumed, capped at 3 by constraint. Incremented only by retry_testimonial_upload() under a row lock.';
comment on column public.testimonial_submissions.environment_marker is
  'Stamped ONLY by the trusted validation path from server-side provider configuration - never by the visitor, browser or intent RPC. Immutable once set. Required before a submission can be valid, moderated or published.';

-- Trusted validation cannot mark anything valid without an environment, so an
-- unmarked submission can never reach moderation or the Gallery.
alter table public.testimonial_submissions
  drop constraint if exists testimonial_valid_requires_environment;
alter table public.testimonial_submissions
  add constraint testimonial_valid_requires_environment
  check (validation_status <> 'valid' or environment_marker is not null);

-- ---------------------------------------------------------------------------
-- 2b. Make the new columns trusted-only and the marker immutable
-- ---------------------------------------------------------------------------
-- Both columns post-date protect_testimonial_update(), so they appear in none
-- of its trusted-only lists. Rather than re-writing that hundred-line function
-- and risking a transcription error in rules already reviewed and applied,
-- this adds a second, narrowly scoped guard for exactly the new columns. It
-- sorts after the 00_ guard so authorization failures still surface first.
create or replace function public.protect_testimonial_capture_columns()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $fn$
declare
  trusted boolean := (auth.role() = 'service_role' or auth.role() is null);
begin
  if not trusted then
    if new.environment_marker is distinct from old.environment_marker
       or new.upload_attempt_count is distinct from old.upload_attempt_count then
      raise exception 'the environment marker and attempt count are set by trusted components only'
        using errcode = '42501';
    end if;
    return new;
  end if;

  -- Even trusted code may only stamp the marker once. A submission that could
  -- be re-labelled after validation would defeat the isolation it provides.
  if old.environment_marker is not null
     and new.environment_marker is distinct from old.environment_marker then
    raise exception 'the environment marker is immutable once set' using errcode = '42501';
  end if;

  return new;
end $fn$;

-- Same PUBLIC-by-default rule as above. A trigger function invoked directly
-- raises "trigger functions can only be called as triggers" rather than doing
-- damage, but leaving a default grant in place would still make the claim
-- "no new function is PUBLIC-executable" false.
revoke all on function public.protect_testimonial_capture_columns()
  from public, anon, authenticated;

drop trigger if exists testimonial_submissions_01_protect_capture_columns
  on public.testimonial_submissions;
create trigger testimonial_submissions_01_protect_capture_columns
  before update on public.testimonial_submissions
  for each row execute function public.protect_testimonial_capture_columns();

-- ---------------------------------------------------------------------------
-- 2c. The public Gallery is Production-only
-- ---------------------------------------------------------------------------
-- Preview and Production share ONE database and the same experience row, so
-- this cannot be a per-experience toggle - the marker on the submission is the
-- only thing that distinguishes them. Column list, order and types are
-- unchanged; only the predicate gains a term.
create or replace view public.testimonial_gallery_items as
  select
    s.id as submission_id,
    s.experience_id,
    s.media_type,
    s.provider as delivery_provider,
    s.provider_delivery_id,
    s.provider_poster_id,
    s.caption,
    s.published_at,
    s.validated_width as width,
    s.validated_height as height,
    s.validated_duration_seconds as duration_seconds
  from public.testimonial_submissions s
  where s.moderation_status = 'approved'
    and s.validation_status = 'valid'
    and s.upload_status = 'uploaded'
    and s.published_at is not null
    and s.delivery_ready_at is not null
    and s.provider_delivery_id is not null
    and s.provider_draft_cleared_at is not null
    and s.provider_signed_urls_required
    and s.media_deleted_at is null
    -- Production only. A Preview submission is never publishable here.
    and s.environment_marker = 'production'
    and (s.media_type = 'image'
         or (s.validated_duration_seconds is not null
             and s.validated_width is not null
             and s.validated_height is not null));

revoke all on public.testimonial_gallery_items from public, anon, authenticated;
grant select on public.testimonial_gallery_items to anon, authenticated;
alter view public.testimonial_gallery_items set (security_barrier = true);

-- ---------------------------------------------------------------------------
-- 2d. Make the insert guard run for the trusted inserter too
-- ---------------------------------------------------------------------------
-- TWO changes, both load-bearing. Neither is cosmetic, and this section is
-- NOT a one-line edit - an earlier draft of this comment claimed it was.
--
-- (1) THE TRUSTED-PATH EARLY RETURN IS REMOVED.
--     20260817160000 opened with:
--         if auth.role() = 'service_role' or auth.role() is null then
--           return new;
--         end if;
--     so a trusted inserter skipped the whole guard. That is precisely why
--     create_testimonial_intent() could not work under it: the RPC is invoked
--     by the secret client, auth.role() is 'service_role', the guard returned
--     immediately, and upload_expires_at was never stamped. The "reuse a live
--     intent" query filters on `upload_expires_at > now()`, which is never
--     true for NULL - so idempotency would have silently failed open and every
--     reload would have minted a new submission. Running the guard for the
--     trusted path is what makes the intent well-formed.
--
--     It also means trusted code can no longer create a submission that is
--     already uploaded, valid, or carrying provider identifiers. That is a
--     deliberate tightening, and it has a CONSEQUENCE FOR TEST FIXTURES: any
--     fixture that inserted a ready-made "valid/uploaded" row now lands as a
--     fresh pending intent and must be promoted with an explicit UPDATE after
--     insert. See supabase/tests/admin_authorization_check.sql.
--
-- (2) auth_user_id becomes coalesce(auth.uid(), new.auth_user_id).
--     With the early return gone, the trusted path now REACHES this line, and
--     under service_role auth.uid() is NULL - so without the coalesce the
--     owner would be dropped and the submission left unattributable. Prefer
--     the session identity when there is one; otherwise accept the value the
--     trusted caller supplied. That is safe only because section 0 revoked
--     INSERT from `authenticated` - no browser can reach this path to supply
--     its own value.
--
-- The search_path is also widened to `public, pg_catalog`, matching every
-- other SECURITY DEFINER function added here.
create or replace function public.protect_testimonial_insert()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $fn$
begin
  new.upload_status         := 'initiated';
  new.uploaded_at           := null;
  new.upload_failure_reason := null;
  new.upload_expires_at     := now() + interval '30 minutes';

  new.validation_status         := 'pending';
  new.validated_at              := null;
  new.validated_by              := null;
  new.validation_failure_reason := null;

  new.provider                   := null;
  new.provider_asset_id          := null;
  new.provider_upload_id         := null;
  new.provider_processing_status := null;
  new.provider_delivery_id       := null;
  new.provider_poster_id         := null;
  new.provider_error_code        := null;
  new.provider_deletion_status   := null;
  new.last_provider_event_id     := null;
  new.last_provider_event_at     := null;
  new.delivery_ready_at          := null;
  new.poster_ready_at            := null;
  new.provider_draft_cleared_at     := null;
  new.provider_signed_urls_required := false;

  new.detected_mime_type         := null;
  new.validated_size_bytes       := null;
  new.validated_width            := null;
  new.validated_height           := null;
  new.validated_duration_seconds := null;
  new.validated_codec            := null;

  new.moderation_status := 'pending';
  new.moderation_note   := null;
  new.rejection_reason  := null;
  new.reviewed_at       := null;
  new.reviewed_by       := null;
  new.published_at      := null;
  new.removed_at        := null;
  new.media_deleted_at  := null;
  new.media_purge_after := null;

  -- The environment marker is never set at creation, by ANY caller. The
  -- immutability trigger in 2b only governs UPDATE, so without this an
  -- inserter could sidestep "NULL -> value, once" by simply being born
  -- 'production'. Creation and environment attribution stay separate events:
  -- the trusted validator stamps it afterwards, from provider configuration.
  new.environment_marker := null;

  -- Everything above is unchanged from 20260817160000; what changed is that
  -- the trusted path no longer returns before reaching it. See section 2d.
  new.auth_user_id := coalesce(auth.uid(), new.auth_user_id);
  new.submitted_at := coalesce(new.submitted_at, now());

  -- A submission with no owner is unattributable and must not exist.
  if new.auth_user_id is null then
    raise exception 'a testimonial submission requires an owning identity'
      using errcode = '42501';
  end if;

  return new;
end $fn$;

-- CREATE OR REPLACE preserves the existing ACL, so 20260817160000's revoke
-- still stands. Re-issued anyway: the guarantee that no new or superseded
-- function is PUBLIC-executable should be readable in THIS file rather than
-- inferred from a previous migration plus a rule about REPLACE semantics.
revoke all on function public.protect_testimonial_insert()
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Shared guard — the caller must be a real anonymous experience visitor
-- ---------------------------------------------------------------------------
-- Mirrors lib/auth/identity.ts: a permanent account is refused with the same
-- strictness an anonymous one is refused from the admin area, and an identity
-- whose anonymity cannot be established qualifies as neither.
-- Takes the visitor id EXPLICITLY, because the trusted caller has no session
-- and auth.uid() is null inside it. The id is not trusted on sight: it is
-- re-resolved against auth.users here, and every check below is applied to
-- the row that lookup returns.
create or replace function public.assert_testimonial_visitor(
  p_visitor_id uuid,
  p_experience_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $fn$
declare
  v_uid          uuid := p_visitor_id;
  v_is_anonymous boolean;
  v_owns         boolean;
  v_enabled      boolean;
begin
  if v_uid is null then
    raise exception 'a visitor identity is required' using errcode = '42501';
  end if;

  select u.is_anonymous into v_is_anonymous from auth.users u where u.id = v_uid;

  -- Requires an explicit true. NULL is refused rather than assumed benign.
  if v_is_anonymous is distinct from true then
    raise exception 'only an anonymous visitor identity may submit a testimonial'
      using errcode = '42501';
  end if;

  select exists (
    select 1
    from public.experience_users eu
    join public.experiences e on e.id = eu.experience_id
    where eu.id = p_experience_user_id
      and eu.auth_user_id = v_uid
      and e.publication_status = 'published'
  ) into v_owns;

  if not v_owns then
    raise exception 'no published experience enrollment for this visitor' using errcode = '42501';
  end if;

  select e.testimonial_capture_enabled
  into v_enabled
  from public.experience_users eu
  join public.experiences e on e.id = eu.experience_id
  where eu.id = p_experience_user_id;

  if v_enabled is distinct from true then
    raise exception 'testimonial capture is not enabled for this experience' using errcode = '42501';
  end if;
end $fn$;

-- Internal only. Called from the capture RPCs, which execute as owner, so no
-- caller needs EXECUTE - not even service_role.
revoke all on function public.assert_testimonial_visitor(uuid, uuid)
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Idempotent intent creation
-- ---------------------------------------------------------------------------
-- Idempotent by STATE, not by a client-supplied key: a visitor who reloads
-- mid-flow gets their existing live intent back rather than accumulating
-- orphans. The submission key is generated here, server-side, so the browser
-- never chooses an identifier that participates in a uniqueness constraint.
-- Takes ONE argument. The consent version is resolved from the registry, and
-- the environment marker is not set at all - both were previously caller-
-- supplied, which let a browser invent a version string and declare itself
-- Production.
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
    encode(gen_random_bytes(16), 'hex'),
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
-- 5. Retry — capped at three attempts
-- ---------------------------------------------------------------------------
create or replace function public.retry_testimonial_upload(
  p_visitor_id uuid,
  p_submission_id uuid
)
returns table (
  submission_id uuid,
  upload_status public.testimonial_upload_status,
  upload_attempt_count integer,
  upload_expires_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_catalog
as $fn$
declare
  v_uid        uuid := p_visitor_id;
  v_eu         uuid;
  v_status     public.testimonial_upload_status;
  v_attempts   integer;
  v_validation public.testimonial_validation_status;
  v_moderation public.testimonial_moderation_status;
  v_deleted    timestamptz;
  v_expires    timestamptz;
begin
  -- FOR UPDATE. Without the lock two concurrent retries both read the same
  -- attempt count and both write count+1: the CHECK still caps the stored
  -- value, so it never reaches 4, but TWO uploads get authorised for ONE
  -- consumed attempt. The lock serialises the read-decide-write.
  select s.experience_user_id, s.upload_status, s.upload_attempt_count,
         s.validation_status, s.moderation_status, s.media_deleted_at, s.upload_expires_at
  into v_eu, v_status, v_attempts, v_validation, v_moderation, v_deleted, v_expires
  from public.testimonial_submissions s
  where s.id = p_submission_id
  for update;

  -- Absent and not-yours produce the SAME error, so this cannot be used to
  -- discover which submission ids exist.
  if v_eu is null then
    raise exception 'submission not found or not available' using errcode = '42501';
  end if;
  perform public.assert_testimonial_visitor(v_uid, v_eu);

  -- Only a failed upload may be retried. Named explicitly so the refusal set
  -- is readable: abandoned, uploaded and initiated are all excluded here.
  if v_status <> 'failed' then
    raise exception 'only a failed upload can be retried' using errcode = '42501';
  end if;

  -- No resurrection of anything that has moved on. A submission that has been
  -- validated, moderated, or had its media deleted is finished, whatever its
  -- upload_status says.
  if v_validation = 'valid' then
    raise exception 'a validated submission cannot be retried' using errcode = '42501';
  end if;
  if v_moderation <> 'pending' then
    raise exception 'a moderated submission cannot be retried' using errcode = '42501';
  end if;
  if v_deleted is not null then
    raise exception 'a submission whose media was deleted cannot be retried' using errcode = '42501';
  end if;

  -- Expiry plus the 15-minute grace. Past that the intent belongs to the
  -- abandonment sweeper, not to a retry.
  if v_expires + interval '15 minutes' < now() then
    raise exception 'this upload intent has expired' using errcode = '42501';
  end if;

  if v_attempts >= 3 then
    raise exception 'no upload attempts remain for this submission' using errcode = '42501';
  end if;

  -- The increment is expressed against the CURRENT row value under the lock
  -- held above, so it is atomic with the checks.
  return query
  update public.testimonial_submissions s
  set upload_status         = 'initiated',
      upload_attempt_count  = s.upload_attempt_count + 1,
      upload_expires_at     = now() + interval '30 minutes',
      upload_failure_reason = null
  where s.id = p_submission_id
  returning s.id, s.upload_status, s.upload_attempt_count, s.upload_expires_at;
end $fn$;

revoke all on function public.retry_testimonial_upload(uuid, uuid) from public, anon, authenticated;
grant execute on function public.retry_testimonial_upload(uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 6. Explicit abandonment
-- ---------------------------------------------------------------------------
create or replace function public.abandon_testimonial_submission(
  p_visitor_id uuid,
  p_submission_id uuid
)
returns table (submission_id uuid, upload_status public.testimonial_upload_status)
language plpgsql
security definer
set search_path = public, pg_catalog
as $fn$
declare
  v_uid    uuid := p_visitor_id;
  v_eu     uuid;
  v_status public.testimonial_upload_status;
begin
  -- Locked for the same reason as retry: two concurrent calls must not race
  -- over the same row's state.
  select s.experience_user_id, s.upload_status
  into v_eu, v_status
  from public.testimonial_submissions s
  where s.id = p_submission_id
  for update;

  if v_eu is null then
    raise exception 'submission not found or not available' using errcode = '42501';
  end if;
  perform public.assert_testimonial_visitor(v_uid, v_eu);

  if v_status not in ('initiated', 'failed') then
    raise exception 'only an in-flight upload can be abandoned' using errcode = '42501';
  end if;

  return query
  update public.testimonial_submissions s
  set upload_status = 'abandoned'
  where s.id = p_submission_id
  returning s.id, s.upload_status;
end $fn$;

revoke all on function public.abandon_testimonial_submission(uuid, uuid) from public, anon, authenticated;
grant execute on function public.abandon_testimonial_submission(uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 7. Caption editing before moderation
-- ---------------------------------------------------------------------------
-- The visitor already holds UPDATE(caption) plus a policy, but that path
-- cannot enforce the 300-character product limit or the pre-moderation window.
-- This does both, in one place, server-side.
create or replace function public.update_testimonial_caption(
  p_visitor_id uuid,
  p_submission_id uuid,
  p_caption text
)
returns table (submission_id uuid, caption text)
language plpgsql
security definer
set search_path = public, pg_catalog
as $fn$
declare
  v_uid     uuid := p_visitor_id;
  v_eu      uuid;
  v_status  public.testimonial_moderation_status;
  v_upload  public.testimonial_upload_status;
  v_deleted timestamptz;
  v_expires timestamptz;
  v_caption text;
begin
  select s.experience_user_id, s.moderation_status, s.upload_status,
         s.media_deleted_at, s.upload_expires_at
  into v_eu, v_status, v_upload, v_deleted, v_expires
  from public.testimonial_submissions s
  where s.id = p_submission_id
  for update;

  if v_eu is null then
    raise exception 'submission not found or not available' using errcode = '42501';
  end if;
  perform public.assert_testimonial_visitor(v_uid, v_eu);

  if v_status <> 'pending' then
    raise exception 'a caption cannot be changed after moderation' using errcode = '42501';
  end if;

  -- Previously this checked moderation status ALONE, so a caption could be
  -- edited on an abandoned, failed or provider-deleted submission. The
  -- editable set is now named explicitly.
  if v_upload not in ('initiated', 'uploaded') then
    raise exception 'this submission is no longer editable' using errcode = '42501';
  end if;
  if v_deleted is not null then
    raise exception 'this submission is no longer editable' using errcode = '42501';
  end if;
  -- An intent still waiting for its upload expires; one already uploaded does
  -- not, because expiry describes the upload window, not the submission.
  if v_upload = 'initiated' and v_expires + interval '15 minutes' < now() then
    raise exception 'this submission is no longer editable' using errcode = '42501';
  end if;

  -- Normalized exactly as lib/testimonials/limits.ts normalizes it, so the
  -- browser's character counter and this limit cannot disagree.
  v_caption := btrim(regexp_replace(normalize(coalesce(p_caption, ''), NFC), '\s+', ' ', 'g'));
  if char_length(v_caption) > 300 then
    raise exception 'caption exceeds the maximum length' using errcode = '22001';
  end if;

  return query
  update public.testimonial_submissions s
  set caption = nullif(v_caption, '')
  where s.id = p_submission_id
  returning s.id, s.caption;
end $fn$;

revoke all on function public.update_testimonial_caption(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.update_testimonial_caption(uuid, uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- 8. Extend the visitor's own sanitized status view
-- ---------------------------------------------------------------------------
-- CREATE OR REPLACE, appending only — existing columns keep their order and
-- types, and the object's ACL is preserved so Supabase default privileges are
-- not re-applied. Still no provider identifier, no reviewer and no moderation
-- note: a visitor sees their own status, not the internals of the decision.
create or replace view public.testimonial_my_submissions as
  select
    s.id as submission_id,
    s.media_type,
    s.upload_status,
    s.validation_status,
    s.moderation_status,
    s.caption,
    s.rejection_reason,
    s.submitted_at,
    s.published_at,
    s.upload_expires_at,
    s.upload_attempt_count
  from public.testimonial_submissions s
  where exists (
    select 1 from public.experience_users u
    where u.id = s.experience_user_id
      and u.auth_user_id = auth.uid()
  );

-- BROWSER ACCESS IS CLOSED.
--
-- An earlier draft kept `grant select ... to authenticated`, arguing the view
-- was safe on its own: SELECT-only, scoped by auth.uid(), no provider or
-- reviewer columns. All of that is true, and it was still the wrong call.
--
-- The view runs SECURITY DEFINER (security_invoker is NOT set, and this
-- migration does not set it), so it reads the base table as its OWNER and RLS
-- on testimonial_submissions never applies. Its entire access control is the
-- auth.uid() predicate below. That predicate is sound, but it enforces
-- OWNERSHIP only - it does not enforce ANONYMITY. A permanent account holding
-- an experience_users enrollment could therefore read submission status
-- straight from PostgREST, skipping the isAnonymousVisitor() check that every
-- other visitor operation must pass. Same class of gap as the one that moved
-- the capture RPCs off `authenticated`: a rule enforced only in the Server
-- Action is not enforced.
--
-- So the last browser-reachable surface in this feature is closed too, and
-- status reads go through the trusted tier like everything else.
revoke all on public.testimonial_my_submissions from public, anon, authenticated;
alter view public.testimonial_my_submissions set (security_barrier = true);

-- The view is deliberately KEPT (not dropped) and keeps its auth.uid()
-- predicate. It is now unreachable from any browser role, so the predicate is
-- defence in depth rather than the control: if a future migration or a
-- Supabase default-privilege change ever re-granted SELECT, the view would
-- still hand back only the caller's own rows instead of the whole table.

/**
 * The visitor's own submission status, for the trusted tier.
 *
 * Takes the visitor id explicitly for the same reason every other capture RPC
 * does: the trusted caller holds no session, so auth.uid() is null here and
 * the view's own predicate would match nothing.
 *
 * Deliberately does NOT call assert_testimonial_visitor(). That guard also
 * requires a published experience with capture switched ON, which is right for
 * creating and mutating but wrong for reading: a visitor must still be able to
 * see the status of what they already submitted after capture is switched off.
 * What IS re-checked is anonymity - the rule the view could not express - and
 * ownership, which is what confines the rows.
 */
create or replace function public.list_my_testimonial_submissions(p_visitor_id uuid)
returns table (
  submission_id uuid,
  media_type public.testimonial_media_type,
  upload_status public.testimonial_upload_status,
  validation_status public.testimonial_validation_status,
  moderation_status public.testimonial_moderation_status,
  caption text,
  rejection_reason text,
  submitted_at timestamptz,
  published_at timestamptz,
  upload_expires_at timestamptz,
  upload_attempt_count integer
)
language plpgsql
stable
security definer
set search_path = public, pg_catalog
as $fn$
declare
  v_is_anonymous boolean;
begin
  if p_visitor_id is null then
    raise exception 'a visitor identity is required' using errcode = '42501';
  end if;

  -- Re-resolved against auth.users, never taken on the caller's word, and
  -- requiring an explicit true exactly as assert_testimonial_visitor() does.
  select u.is_anonymous into v_is_anonymous from auth.users u where u.id = p_visitor_id;
  if v_is_anonymous is distinct from true then
    raise exception 'only an anonymous visitor identity may read submission status'
      using errcode = '42501';
  end if;

  -- The SAME sanitized column list the view exposes: no auth_user_id, no
  -- experience_user_id, no provider identifier, no reviewer, no moderation
  -- note, no contact field.
  return query
  select s.id, s.media_type, s.upload_status, s.validation_status,
         s.moderation_status, s.caption, s.rejection_reason, s.submitted_at,
         s.published_at, s.upload_expires_at, s.upload_attempt_count
  from public.testimonial_submissions s
  join public.experience_users eu on eu.id = s.experience_user_id
  where eu.auth_user_id = p_visitor_id
  order by s.submitted_at desc nulls last
  limit 20;
end $fn$;

revoke all on function public.list_my_testimonial_submissions(uuid)
  from public, anon, authenticated;
grant execute on function public.list_my_testimonial_submissions(uuid) to service_role;
