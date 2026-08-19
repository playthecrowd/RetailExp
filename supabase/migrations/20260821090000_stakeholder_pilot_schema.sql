-- ===========================================================================
-- Phase 4E1 / Stakeholder pilot - SCHEMA ONLY.
--
-- WHAT THIS FILE IS FOR
--   The closed Production stakeholder pilot needs seven schema facts that do
--   not exist yet. Nothing here enables capture, publishes a document,
--   registers a consent version, contacts a provider or deletes anything. It
--   changes what the database will ALLOW; every gate stays shut.
--
-- WHAT IT CHANGES
--   1. An 18+ submitter attestation, mandatory and immutable.
--   2. A consent scope value that honestly describes a stakeholder evaluation.
--   3. The caption CHECK, which contradicted the application limit.
--   4. Deletion-attempt accounting on the provider-asset ledger.
--   5. An environment argument on the deletable-asset listing.
--   6. The missing submission-level purge record.
--   7. An immediate-purge path for withdrawal and underage removals.
--
-- TWO FUNCTIONS ARE SUPERSEDED, AND THEIR TEXT WAS NOT RETYPED
--   public.protect_testimonial_update and public.create_testimonial_intent are
--   reproduced from their applied sources by mechanical extraction, with the
--   edits applied programmatically and verified by reversal: removing the
--   inserted line from protect_testimonial_update reproduces the applied text
--   byte for byte. Hand-copying a 212-line security trigger to add one
--   identifier is exactly how a guard silently loses a clause.
--
-- ORDER MATTERS
--   Section 1 fails loudly if any submission row already exists, because a
--   mandatory attestation cannot be backfilled: writing `true` into an
--   existing row would assert a statement the visitor never made. There is no
--   backfill in this file for that reason.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 0. Precondition
-- ---------------------------------------------------------------------------
-- Capture has never been open and the consent registry has never held an
-- active row, so this table is expected to be empty. If it is not, the
-- attestation below cannot be added honestly and the migration must stop with
-- a legible message rather than an opaque constraint violation.
do $precondition$
declare
  v_rows bigint;
begin
  select count(*) into v_rows from public.testimonial_submissions;
  if v_rows > 0 then
    raise exception
      'refusing to add a mandatory 18+ attestation: % existing submission row(s) would have to be backfilled with an attestation nobody made', v_rows
      using errcode = '55000';
  end if;
end $precondition$;

-- ---------------------------------------------------------------------------
-- 1. The 18+ submitter attestation
-- ---------------------------------------------------------------------------
-- attested_no_minors is about WHO APPEARS IN THE MEDIA. Nothing in the schema
-- has ever recorded the SUBMITTER's own age, so the 18+ restriction had no
-- representation at all. This is the column that gives it one.
--
-- Self-attestation, not verification. No age check exists and none is planned;
-- the Terms must say so in those words. This is the same class of control as
-- attested_no_minors, and it is enforced the same way: a CHECK, so a row
-- cannot exist without it, rather than UI copy that can be bypassed.
alter table public.testimonial_submissions
  add column if not exists attested_submitter_adult boolean not null default false;

comment on column public.testimonial_submissions.attested_submitter_adult is
  'The submitter attested to being 18 or older. SELF-ATTESTED - no age verification is performed anywhere in this system, and the Terms must not imply otherwise. Mandatory via testimonial_attestations_required and immutable after insert via protect_testimonial_update.';

alter table public.testimonial_submissions
  drop constraint testimonial_attestations_required;

alter table public.testimonial_submissions
  add constraint testimonial_attestations_required
    check (attested_no_minors and attested_subjects_consented and attested_submitter_adult);

-- ---------------------------------------------------------------------------
-- 2. protect_testimonial_update - the new attestation joins the immutable set
-- ---------------------------------------------------------------------------
-- Reproduced from 20260817193500 lines 38-249 by extraction, with exactly one
-- line inserted into the recorded-consent block. Verified by reversal.
--
-- Superseded rather than supplemented by a second trigger on purpose: "consent
-- is immutable" is one rule, and splitting it across two functions guarantees
-- that whoever next edits this one will not see the other.
create or replace function public.protect_testimonial_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  trusted   boolean;
  moderator boolean;
begin
  -- Trusted tier, unchanged: a genuine service_role request, OR no JWT/API
  -- role context at all. auth.uid() is deliberately not consulted — it is null
  -- for a real anonymous API request and would hand every anonymous caller the
  -- bypass.
  trusted := (auth.role() = 'service_role' or auth.role() is null);

  -- Moderator tier, new: a real signed-in owner/admin of the row's tenant,
  -- acting through public.moderate_testimonial_submission(). Reached only via
  -- that SECURITY DEFINER function, because browser roles hold no UPDATE
  -- privilege on any moderation column.
  moderator := (not trusted)
               and auth.uid() is not null
               and (public.can_view_experience_user_pii(new.client_id)
                    or public.is_platform_admin());

  if not trusted then
    if      new.id                   is distinct from old.id
         or new.client_id             is distinct from old.client_id
         or new.experience_id         is distinct from old.experience_id
         or new.experience_user_id    is distinct from old.experience_user_id
         or new.auth_user_id          is distinct from old.auth_user_id
         or new.client_submission_key is distinct from old.client_submission_key
    then
      raise exception 'testimonial identity columns are immutable' using errcode = '42501';
    end if;

    if      new.upload_status         is distinct from old.upload_status
         or new.uploaded_at           is distinct from old.uploaded_at
         or new.upload_expires_at     is distinct from old.upload_expires_at
         or new.upload_failure_reason is distinct from old.upload_failure_reason
    then
      raise exception 'upload completion is recorded by a trusted component, not by the client'
        using errcode = '42501';
    end if;

    if      new.validation_status         is distinct from old.validation_status
         or new.validated_at              is distinct from old.validated_at
         or new.validated_by              is distinct from old.validated_by
         or new.validation_failure_reason is distinct from old.validation_failure_reason
         or new.detected_mime_type        is distinct from old.detected_mime_type
         or new.validated_size_bytes      is distinct from old.validated_size_bytes
         or new.validated_width           is distinct from old.validated_width
         or new.validated_height          is distinct from old.validated_height
         or new.validated_duration_seconds is distinct from old.validated_duration_seconds
         or new.validated_codec           is distinct from old.validated_codec
    then
      raise exception 'validation results and trusted metadata cannot be self-reported'
        using errcode = '42501';
    end if;

    -- Provider references stay trusted-server-only even for a moderator: a
    -- moderator decides, it does not re-point an asset.
    if      new.provider                   is distinct from old.provider
         or new.provider_asset_id          is distinct from old.provider_asset_id
         or new.provider_upload_id         is distinct from old.provider_upload_id
         or new.provider_processing_status is distinct from old.provider_processing_status
         or new.provider_delivery_id       is distinct from old.provider_delivery_id
         or new.provider_poster_id         is distinct from old.provider_poster_id
         or new.provider_error_code        is distinct from old.provider_error_code
         or new.provider_deletion_status   is distinct from old.provider_deletion_status
         or new.last_provider_event_id     is distinct from old.last_provider_event_id
         or new.last_provider_event_at     is distinct from old.last_provider_event_at
         or new.delivery_ready_at          is distinct from old.delivery_ready_at
         or new.poster_ready_at            is distinct from old.poster_ready_at
         or new.provider_draft_cleared_at     is distinct from old.provider_draft_cleared_at
         or new.provider_signed_urls_required is distinct from old.provider_signed_urls_required
    then
      raise exception 'provider references and processing state are written only by the trusted server'
        using errcode = '42501';
    end if;

    -- Moderation fields: permitted for an authorized moderator, refused for
    -- everyone else. reviewed_by is NOT exempted here — it is overwritten
    -- unconditionally below, so no caller can supply it.
    if (     new.moderation_status is distinct from old.moderation_status
          or new.moderation_note   is distinct from old.moderation_note
          or new.rejection_reason  is distinct from old.rejection_reason
          or new.reviewed_at       is distinct from old.reviewed_at
          or new.reviewed_by       is distinct from old.reviewed_by
          or new.published_at      is distinct from old.published_at
          or new.removed_at        is distinct from old.removed_at
          or new.media_deleted_at  is distinct from old.media_deleted_at
          or new.media_purge_after is distinct from old.media_purge_after )
       and not moderator
    then
      raise exception 'moderation state and review provenance are server-controlled'
        using errcode = '42501';
    end if;

    -- Physical deletion bookkeeping stays trusted-server-only even for a
    -- moderator: a moderator decides, the sweeper deletes.
    if (     new.media_deleted_at  is distinct from old.media_deleted_at
          or new.provider_deletion_status is distinct from old.provider_deletion_status )
    then
      raise exception 'physical deletion is recorded only by the trusted deletion tier'
        using errcode = '42501';
    end if;

    if      new.consent_scope               is distinct from old.consent_scope
         or new.attested_no_minors          is distinct from old.attested_no_minors
         or new.attested_subjects_consented is distinct from old.attested_subjects_consented
         or new.attested_submitter_adult    is distinct from old.attested_submitter_adult
         or new.consent_version             is distinct from old.consent_version
         or new.consented_at                is distinct from old.consented_at
    then
      raise exception 'recorded consent cannot be altered after submission' using errcode = '42501';
    end if;

    if new.caption is distinct from old.caption
       and not moderator
       and old.moderation_status <> 'pending' then
      raise exception 'the caption can only be edited while a submission is pending'
        using errcode = '42501';
    end if;
  end if;

  -- ---- Lifecycle machines: enforced for EVERY caller, including service_role
  -- ---- and moderators, so no tier can corrupt the pipeline.
  if new.upload_status is distinct from old.upload_status then
    if not (
         (old.upload_status = 'initiated' and new.upload_status in ('uploaded','failed','abandoned'))
      or (old.upload_status = 'failed'    and new.upload_status in ('initiated','abandoned'))
    ) then
      raise exception 'illegal upload_status transition: % -> %', old.upload_status, new.upload_status
        using errcode = '42501';
    end if;
    if new.upload_status = 'uploaded' then
      new.uploaded_at := coalesce(new.uploaded_at, now());
    end if;
    if new.upload_status in ('abandoned', 'failed') then
      new.media_purge_after := coalesce(new.media_purge_after, now());
    end if;
  end if;

  if new.validation_status is distinct from old.validation_status then
    if old.validation_status <> 'pending' then
      raise exception 'validation_status is conclusive and cannot be re-decided: % -> %',
        old.validation_status, new.validation_status using errcode = '42501';
    end if;
    if new.upload_status <> 'uploaded' or new.provider_asset_id is null then
      raise exception 'validation requires a completed provider upload with an asset id'
        using errcode = '42501';
    end if;
    new.validated_at := coalesce(new.validated_at, now());
    if new.validation_status = 'invalid' then
      new.media_purge_after := now();
    end if;
  end if;

  if new.moderation_status is distinct from old.moderation_status then
    if new.upload_status <> 'uploaded'
       or new.validation_status <> 'valid'
       or new.provider_asset_id is null
       or new.provider_draft_cleared_at is null
       or not new.provider_signed_urls_required then
      raise exception 'submission is not moderation-eligible: it must be uploaded, trusted-valid, out of draft and signed-delivery-only'
        using errcode = '42501';
    end if;

    if new.media_type = 'video'
       and (new.validated_duration_seconds is null
            or new.validated_size_bytes is null
            or new.validated_width is null
            or new.validated_height is null) then
      raise exception 'a video is not moderation-eligible without the trusted duration, size and dimensions the provider supplies'
        using errcode = '42501';
    end if;

    if not (
         (old.moderation_status = 'pending'  and new.moderation_status in ('approved','rejected'))
      or (old.moderation_status = 'approved' and new.moderation_status = 'removed')
      or (old.moderation_status = 'rejected' and new.moderation_status = 'removed')
    ) then
      raise exception 'illegal moderation_status transition: % -> %',
        old.moderation_status, new.moderation_status using errcode = '42501';
    end if;

    if new.moderation_status = 'approved' and new.delivery_ready_at is null then
      raise exception 'a submission cannot be approved before a trusted delivery rendition is ready'
        using errcode = '42501';
    end if;

    -- Review provenance is written by the database from the CALLER'S OWN
    -- identity, unconditionally. No tier — not service_role, not a moderator,
    -- not the RPC — can supply a reviewer. Under the RPC this is the real
    -- signed-in administrator; under a service_role sweep it is null, which is
    -- the honest answer for an automated action.
    new.reviewed_at := now();
    new.reviewed_by := auth.uid();
    if new.moderation_status = 'approved' then new.published_at := now(); end if;
    if new.moderation_status = 'rejected' then
      new.media_purge_after := now() + interval '30 days';
    end if;
    if new.moderation_status = 'removed' then
      new.removed_at        := now();
      new.published_at      := null;
      new.media_purge_after := now() + interval '30 days';
    end if;
  end if;

  return new;
end;
$$;

revoke execute on function public.protect_testimonial_update()
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. create_testimonial_intent - the attestation becomes a parameter
-- ---------------------------------------------------------------------------
-- THE OLD TWO-ARGUMENT FUNCTION IS DROPPED, NOT LEFT ALONGSIDE.
--   Adding a defaulted third parameter without dropping the old signature
--   would leave two candidates for a two-argument call. PostgreSQL would
--   resolve that to the OLD function - the one with no attestation check -
--   so the gate would be added and bypassed in the same migration.
--
-- THE DEFAULT IS `false`, WHICH IS WHY THE TREE STILL BUILDS.
--   A two-argument call now resolves to this function with the parameter
--   false and is refused at the check. The application is updated in a later
--   phase; until then the failure is a loud refusal rather than a silent
--   assertion of adulthood. Capture is closed regardless, so nothing user
--   facing depends on it in the meantime.
drop function if exists public.create_testimonial_intent(uuid, public.testimonial_media_type);

create function public.create_testimonial_intent(
  p_visitor_id uuid,
  p_media_type public.testimonial_media_type,
  -- Defaulted to FALSE, not to TRUE and not required positionally. A caller
  -- that has not been updated to collect the attestation therefore fails
  -- closed at the check below instead of silently asserting adulthood on the
  -- visitor's behalf.
  p_attested_submitter_adult boolean default false
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

  -- THE 18+ GATE. Placed after every authorization check on purpose: an
  -- unauthorized caller must still be refused with 42501 and learn nothing
  -- about which later condition it would have failed. Placed BEFORE the
  -- live-intent reuse branch, also on purpose - the attestation is a property
  -- of this request, so a reload that omits it must not inherit one made
  -- earlier.
  if p_attested_submitter_adult is distinct from true then
    raise exception 'the submitter must attest to being 18 or older'
      using errcode = '22023';
  end if;

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
    attested_no_minors, attested_subjects_consented, attested_submitter_adult,
    environment_marker
  )
  values (
    v_client, v_exp, v_eu, v_uid, p_media_type,
    -- Server-generated, so it is unguessable and cannot be chosen to collide
    -- with another visitor's row.
    encode(extensions.gen_random_bytes(16), 'hex'),
    v_consent_version, now(),
    -- ASYMMETRY, DELIBERATE AND WORTH KNOWING ABOUT. The first two are still
    -- asserted by this function rather than passed in, exactly as before:
    -- the UI collects them and the base table's CHECK requires both true.
    -- The third is the parameter checked above, so it is the only one of the
    -- three this function can actually prove was given. Retrofitting the
    -- other two to parameters is a strictly larger change - it breaks every
    -- existing call site - and is recorded as a follow-up rather than
    -- smuggled in here.
    true, true, p_attested_submitter_adult,
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

revoke all on function public.create_testimonial_intent(uuid, public.testimonial_media_type, boolean)
  from public, anon, authenticated;
grant execute on function public.create_testimonial_intent(uuid, public.testimonial_media_type, boolean)
  to service_role;

-- ---------------------------------------------------------------------------
-- 4. Consent scope for a stakeholder evaluation
-- ---------------------------------------------------------------------------
-- consent_scope is the MACHINE-READABLE record of what was agreed to. The
-- existing single value says "experience gallery display", which is not what a
-- closed stakeholder evaluation is. Reusing it would leave every pilot
-- submission carrying an audit record that describes something else.
--
-- The new value does not widen anything: marketing, advertising and
-- social-media reuse remain outside every permitted scope, and there is no
-- value in this list that authorizes them.
do $scope$
declare
  v_name text;
begin
  select con.conname into v_name
  from pg_constraint con
  join pg_class c on c.oid = con.conrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'testimonial_submissions'
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) like '%consent_scope%';

  if v_name is null then
    raise exception 'the consent_scope CHECK constraint was not found; refusing to guess'
      using errcode = '55000';
  end if;

  execute format('alter table public.testimonial_submissions drop constraint %I', v_name);
end $scope$;

alter table public.testimonial_submissions
  add constraint testimonial_consent_scope_known
    check (consent_scope in ('experience_gallery_display', 'stakeholder_evaluation_gallery'));

comment on column public.testimonial_submissions.consent_scope is
  'What the submitter agreed to, recorded as data rather than inferred from UI copy. experience_gallery_display = display in the experience Gallery. stakeholder_evaluation_gallery = display in the closed stakeholder evaluation Gallery. NEITHER value authorizes marketing, advertising or social-media reuse; those require separate, separately-recorded permission and a scope value that does not exist here.';

-- ---------------------------------------------------------------------------
-- 5. Caption length - the CHECK contradicted the application
-- ---------------------------------------------------------------------------
-- lib/testimonials/limits.ts allows 300 and update_testimonial_caption()
-- rejects only above 300, but this CHECK stopped at 280. A caption of 281-300
-- characters passed both validators and then failed with 23514 at the table.
-- Unreachable while capture is closed; a live failure the moment it opens.
--
-- Widened rather than narrowing the other two: 300 is the number the product
-- and the RPC already agree on, so it is the one that was actually intended.
alter table public.testimonial_submissions
  drop constraint testimonial_caption_length;

alter table public.testimonial_submissions
  add constraint testimonial_caption_length
    check (caption is null or char_length(caption) <= 300);

-- ---------------------------------------------------------------------------
-- 6. Deletion-attempt accounting on the ledger
-- ---------------------------------------------------------------------------
-- WHY: list_deletable_testimonial_provider_assets orders by reserved_at and
-- excludes nothing on the basis of past failure. One permanently undeletable
-- asset therefore sits at the head of every batch forever, and rows behind it
-- are never reached - a sweep that appears to run while making no progress.
--
-- last_deletion_attempt_at is what guarantees forward motion. The counter
-- exists only to raise an alert; nothing branches on it.
alter table public.testimonial_provider_assets
  add column if not exists last_deletion_attempt_at timestamptz,
  add column if not exists deletion_attempt_count integer not null default 0;

alter table public.testimonial_provider_assets
  add constraint testimonial_provider_asset_attempt_count_sane
    check (deletion_attempt_count >= 0);

comment on column public.testimonial_provider_assets.last_deletion_attempt_at is
  'When a deletion attempt last STARTED (the pending mark), not when one succeeded. Drives both the backoff window and the sweep ordering, so a repeatedly failing row yields its place instead of starving the batch.';

comment on column public.testimonial_provider_assets.deletion_attempt_count is
  'How many deletion attempts have started for this row. Incremented on the pending mark only, so the two marks per attempt count as one. Operational signal for alerting; no code branches on it.';

create index if not exists testimonial_provider_assets_deletable_idx
  on public.testimonial_provider_assets
     (environment_marker, last_deletion_attempt_at nulls first, reserved_at)
  where deleted_at is null and provider_asset_id is not null;

-- ---------------------------------------------------------------------------
-- 7. list_deletable_testimonial_provider_assets - environment is now required
-- ---------------------------------------------------------------------------
-- Preview and Production share ONE database and ONE Cloudflare account. The
-- previous signature returned environment_marker but did not filter on it, so
-- a sweep invoked from Preview would delete Production media. Scheduled runs
-- are Production-only, but the Preview validation step is a manual invocation
-- - which is precisely the run that would have done the damage.
--
-- The parameter has NO DEFAULT and is validated. An environment argument that
-- defaults to "all" is the same hazard with a friendlier face.
--
-- Dropped and recreated rather than replaced: adding a leading parameter
-- changes the signature, and leaving the old one in place would leave an
-- unfiltered function callable.
drop function if exists public.list_deletable_testimonial_provider_assets(integer);

create function public.list_deletable_testimonial_provider_assets(
  p_environment text,
  p_limit integer default 50
)
returns table (
  ledger_id uuid,
  provider text,
  provider_asset_id text,
  environment_marker text,
  reason text,
  deletion_attempt_count integer
)
language plpgsql
stable
security definer
set search_path = public, pg_catalog
as $fn$
begin
  if p_environment is null or p_environment not in ('preview', 'production') then
    raise exception 'unknown media environment' using errcode = '22023';
  end if;

  return query
  select a.id, a.provider, a.provider_asset_id, a.environment_marker,
         case
           when a.orphaned_at is not null    then 'orphaned'
           when a.superseded_at is not null  then 'superseded'
           when a.failed_at is not null      then 'failed'
           else 'submission_purged'
         end,
         a.deletion_attempt_count
  from public.testimonial_provider_assets a
  join public.testimonial_submissions s on s.id = a.submission_id
  where a.provider_asset_id is not null
    and a.deleted_at is null
    and a.environment_marker = p_environment
    -- Backoff. A row whose attempt started inside the window is skipped, so a
    -- permanently failing asset cannot occupy the head of every batch.
    and (a.last_deletion_attempt_at is null
         or a.last_deletion_attempt_at <= now() - interval '6 hours')
    and (
      a.orphaned_at is not null
      or a.superseded_at is not null
      or a.failed_at is not null
      or (s.media_purge_after is not null and s.media_purge_after <= now())
    )
  -- Never-attempted rows first, then oldest attempt. This is what makes
  -- progress monotonic rather than merely likely.
  order by a.last_deletion_attempt_at nulls first, a.reserved_at
  limit greatest(1, least(coalesce(p_limit, 50), 200));
end $fn$;

revoke all on function public.list_deletable_testimonial_provider_assets(text, integer)
  from public, anon, authenticated;
grant execute on function public.list_deletable_testimonial_provider_assets(text, integer)
  to service_role;

-- ---------------------------------------------------------------------------
-- 8. mark_testimonial_provider_asset_deleted - records the attempt
-- ---------------------------------------------------------------------------
-- Dropped and recreated because the return type gains a column, which
-- CREATE OR REPLACE cannot do.
--
-- The counter increments on 'pending' ONLY. The sweeper marks pending before
-- calling the provider and marks the outcome after, so counting both would
-- double every attempt. 'pending' is also the mark that survives a crash
-- mid-deletion, which is exactly the case the backoff needs to see.
--
-- Unchanged: not_found still counts as deleted. The goal is that the provider
-- is no longer storing the asset, and a 404 proves that as well as a 200.
drop function if exists public.mark_testimonial_provider_asset_deleted(uuid, text);

create function public.mark_testimonial_provider_asset_deleted(
  p_ledger_id uuid,
  p_status text
)
returns table (ledger_id uuid, deletion_status text, deletion_attempt_count integer)
language plpgsql
security definer
set search_path = public, pg_catalog
as $fn$
begin
  if p_status not in ('pending', 'deleted', 'not_found', 'failed') then
    raise exception 'unknown deletion status' using errcode = '22023';
  end if;

  return query
  update public.testimonial_provider_assets a
  set deletion_requested_at    = coalesce(a.deletion_requested_at, now()),
      deletion_status          = p_status,
      last_deletion_attempt_at = case when p_status = 'pending'
                                      then now() else a.last_deletion_attempt_at end,
      deletion_attempt_count   = a.deletion_attempt_count
                                 + case when p_status = 'pending' then 1 else 0 end,
      deleted_at               = case when p_status in ('deleted', 'not_found')
                                      then coalesce(a.deleted_at, now())
                                      else a.deleted_at end
  where a.id = p_ledger_id
  returning a.id, a.deletion_status, a.deletion_attempt_count;
end $fn$;

revoke all on function public.mark_testimonial_provider_asset_deleted(uuid, text)
  from public, anon, authenticated;
grant execute on function public.mark_testimonial_provider_asset_deleted(uuid, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- 9. list_purgeable_testimonial_submissions
-- ---------------------------------------------------------------------------
-- THE GAP THIS CLOSES
--   media_purge_after is set correctly by the lifecycle triggers at ten sites,
--   and testimonial_submissions.media_deleted_at is written by NOTHING. The
--   ledger sweep deletes the provider asset; the submission row goes on
--   asserting the media exists. That means the moderation queue never drains,
--   the gallery predicate's media_deleted_at term is decorative, and there is
--   no record that a deletion the Privacy page promises actually happened.
--
-- ORDERING IS THE WHOLE POINT
--   A submission appears here only when NO ledger row for it still holds an
--   undeleted provider asset. Recording a purge before the provider deletions
--   succeed would write a false record - the one failure mode a retention
--   statement cannot survive.
--
-- THE NULL ENVIRONMENT CASE
--   environment_marker is stamped at validation, so a submission abandoned or
--   invalidated before validation has none. Excluding those would leave them
--   permanently stuck in the purge index. They are included because the mark
--   is pure bookkeeping for them: they have no undeleted provider asset (the
--   NOT EXISTS above guarantees it), so neither environment can delete
--   anything on the other's behalf, and a double mark is a no-op.
create function public.list_purgeable_testimonial_submissions(
  p_environment text,
  p_limit integer default 50
)
returns table (
  submission_id uuid,
  environment_marker text,
  provider_assets_seen bigint
)
language plpgsql
stable
security definer
set search_path = public, pg_catalog
as $fn$
begin
  if p_environment is null or p_environment not in ('preview', 'production') then
    raise exception 'unknown media environment' using errcode = '22023';
  end if;

  return query
  select s.id,
         s.environment_marker,
         (select count(*)
            from public.testimonial_provider_assets a
           where a.submission_id = s.id
             and a.provider_asset_id is not null)
  from public.testimonial_submissions s
  where s.media_purge_after is not null
    and s.media_purge_after <= now()
    and s.media_deleted_at is null
    and (s.environment_marker = p_environment or s.environment_marker is null)
    and not exists (
      select 1
        from public.testimonial_provider_assets a
       where a.submission_id = s.id
         and a.provider_asset_id is not null
         and a.deleted_at is null
    )
  order by s.media_purge_after
  limit greatest(1, least(coalesce(p_limit, 50), 200));
end $fn$;

revoke all on function public.list_purgeable_testimonial_submissions(text, integer)
  from public, anon, authenticated;
grant execute on function public.list_purgeable_testimonial_submissions(text, integer)
  to service_role;

-- ---------------------------------------------------------------------------
-- 10. record_testimonial_media_purged
-- ---------------------------------------------------------------------------
-- The trusted deletion tier's only write. protect_testimonial_update already
-- reserves media_deleted_at and provider_deletion_status for this tier - the
-- guard refusing them names it explicitly, and it refuses moderators too - so
-- no trigger change is needed here. What was missing was a function.
--
-- FAILS CLOSED, TWICE OVER
--   It re-checks the outstanding-asset condition itself rather than trusting
--   the listing that selected the row. A concurrent reservation between the
--   two calls is exactly the race that would otherwise produce a false purge
--   record, and the check is cheap.
--
-- IDEMPOTENT
--   An already-purged submission returns its existing record unchanged rather
--   than raising, so a re-run of the sweep is safe and a redelivery is a
--   no-op. media_deleted_at is never moved once set.
--
-- p_status = 'none' is for a submission that never had a provider asset at
-- all - an intent that expired before any reservation. The CHECK on the table
-- requires provider_deletion_status to be non-null whenever media_deleted_at
-- is, so "nothing to delete" still needs an honest value rather than a null.
create function public.record_testimonial_media_purged(
  p_submission_id uuid,
  p_status text
)
returns table (
  submission_id uuid,
  media_deleted_at timestamptz,
  provider_deletion_status text
)
language plpgsql
security definer
set search_path = public, pg_catalog
as $fn$
declare
  v_existing    timestamptz;
  v_outstanding bigint;
begin
  if p_status is null or p_status not in ('deleted', 'not_found', 'none') then
    raise exception 'unknown purge status' using errcode = '22023';
  end if;

  select s.media_deleted_at into v_existing
  from public.testimonial_submissions s
  where s.id = p_submission_id
  for update;

  -- Unknown submission: no row, no error. Same posture as the validation RPC -
  -- a sweeper must not be able to probe which ids exist.
  if not found then
    return;
  end if;

  if v_existing is not null then
    return query
      select s.id, s.media_deleted_at, s.provider_deletion_status
      from public.testimonial_submissions s
      where s.id = p_submission_id;
    return;
  end if;

  select count(*) into v_outstanding
  from public.testimonial_provider_assets a
  where a.submission_id = p_submission_id
    and a.provider_asset_id is not null
    and a.deleted_at is null;

  if v_outstanding > 0 then
    raise exception
      'refusing to record a media purge while % provider asset(s) remain undeleted', v_outstanding
      using errcode = '55000';
  end if;

  return query
  update public.testimonial_submissions s
  set media_deleted_at         = now(),
      provider_deletion_status = p_status
  where s.id = p_submission_id
  returning s.id, s.media_deleted_at, s.provider_deletion_status;
end $fn$;

revoke all on function public.record_testimonial_media_purged(uuid, text)
  from public, anon, authenticated;
grant execute on function public.record_testimonial_media_purged(uuid, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- 11. purge_testimonial_media_now
-- ---------------------------------------------------------------------------
-- The lifecycle trigger hard-codes media_purge_after = now() + 30 days for
-- every removal and rejection. That window exists for moderation
-- reversibility and abuse-report retention - reasons that do not apply when a
-- person withdraws their own consent, or when a submission is pulled because
-- the submitter was not an adult. Honoring either of those "within 30 days"
-- reads as reluctance, and in the underage case it is worse than that.
--
-- WHAT IT DELIBERATELY DOES NOT DO
--   It does not move moderation_status, so it cannot be used to remove
--   anything. The decision goes through moderate_testimonial_submission()
--   under the administrator's own session, where the trigger records the real
--   reviewer; this only reschedules the physical deletion afterwards. Keeping
--   the two apart is what preserves review provenance.
--
-- THE GUARD IS STATE-BASED, NOT IDENTITY-BASED
--   A service_role function cannot see auth.uid(), so it cannot re-check who
--   is calling. What it CAN require is that the submission already reached
--   rejected or removed - which only the moderation RPC, under a real
--   administrator, can bring about. An approved or pending submission is
--   refused outright, so this cannot short-circuit a live item's retention.
create function public.purge_testimonial_media_now(
  p_submission_id uuid,
  p_reason text
)
returns table (
  submission_id uuid,
  media_purge_after timestamptz
)
language plpgsql
security definer
set search_path = public, pg_catalog
as $fn$
declare
  v_status public.testimonial_moderation_status;
begin
  if p_reason is null or p_reason not in ('visitor_withdrawal', 'underage_submitter') then
    raise exception 'unknown immediate-purge reason' using errcode = '22023';
  end if;

  select s.moderation_status into v_status
  from public.testimonial_submissions s
  where s.id = p_submission_id
  for update;

  if not found then
    return;
  end if;

  if v_status not in ('rejected', 'removed') then
    raise exception 'immediate purge requires a rejected or removed submission, not %', v_status
      using errcode = '42501';
  end if;

  return query
  update public.testimonial_submissions s
  set media_purge_after = now()
  where s.id = p_submission_id
  returning s.id, s.media_purge_after;
end $fn$;

revoke all on function public.purge_testimonial_media_now(uuid, text)
  from public, anon, authenticated;
grant execute on function public.purge_testimonial_media_now(uuid, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- 12. The moderation queue shows the new attestation
-- ---------------------------------------------------------------------------
-- A reviewer who cannot see whether the 18+ attestation was made cannot act on
-- it, and lib/testimonials/moderation.ts maps this view column-by-column into
-- the DTO the dashboard renders. Adding the column here is what lets the card
-- show it beside the other two attestations.
--
-- Reproduced from 20260818161500 by extraction with one column appended, and
-- verified by reversal. CREATE OR REPLACE VIEW can only ADD columns at the
-- end, which is exactly what this does - the existing column list, order and
-- types are untouched, so nothing that reads this view by position breaks.
--
-- The view stays trusted-tier only: the revoke below restates that rather
-- than trusting CREATE OR REPLACE to preserve the ACL.
create or replace view public.testimonial_moderation_queue as
  select
    -- ---- existing columns, order and types preserved exactly -------------
    s.id as submission_id,
    s.client_id,
    s.experience_id,
    s.media_type,
    s.provider,
    s.provider_delivery_id,
    s.provider_poster_id,
    s.caption,
    s.detected_mime_type,
    s.validated_size_bytes,
    s.validated_width,
    s.validated_height,
    s.validated_duration_seconds,
    s.validated_codec,
    s.moderation_status,
    s.moderation_note,
    s.rejection_reason,
    s.submitted_at,
    s.reviewed_at,
    s.reviewed_by,
    s.published_at,

    -- ---- appended: lifecycle, so readiness is explainable ----------------
    s.upload_status,
    s.validation_status,
    -- Provider-neutral processing state. A status string the application
    -- writes from verified webhook events, never a provider payload.
    s.provider_processing_status,
    -- Timestamps that explain WHY a submission can or cannot be approved:
    -- the approval trigger refuses while delivery_ready_at is null.
    s.delivery_ready_at,
    s.poster_ready_at,
    -- Retention. Lets the dashboard say plainly when media is scheduled for
    -- provider deletion, instead of a rejected row silently vanishing from
    -- the queue once media_deleted_at is set.
    s.media_purge_after,

    -- ---- appended: consent and attestation -------------------------------
    s.consent_scope,
    s.consent_version,
    s.attested_no_minors,
    s.attested_subjects_consented,
    s.attested_submitter_adult
  from public.testimonial_submissions s
  where s.upload_status = 'uploaded'::public.testimonial_upload_status
    and s.validation_status = 'valid'::public.testimonial_validation_status
    and s.media_deleted_at is null;

revoke all on public.testimonial_moderation_queue from public, anon, authenticated;
