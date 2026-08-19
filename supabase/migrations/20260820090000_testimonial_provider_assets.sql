-- Phase 4C — provider-asset ledger.
--
-- Corrective migration. Edits NO applied migration; every change here is
-- additive, and applying it enables nothing: capture stays gated by the
-- environment variable, the per-experience flag and the empty consent
-- registry, exactly as Phase 4B left them.
--
-- WHY A LEDGER EXISTS AT ALL
--   A one-time provider upload URL cannot be reused, so every retry mints a
--   NEW provider asset. testimonial_submissions holds ONE provider_asset_id,
--   so a retry overwrites it and the previous asset becomes invisible to us
--   while remaining billable at the provider. It also becomes a security
--   problem: a late callback for the superseded asset would otherwise look
--   like a callback for the current one.
--
--   This table records every attempt, exactly one of which is active, so a
--   callback can be correlated to a specific attempt and superseded assets
--   can be found and deleted.
--
-- WHY RESERVATION IS SEPARATE FROM ATTACHMENT
--   Calling Cloudflare first and then writing the only ledger row leaves an
--   ORPHAN WINDOW: if the provider call succeeds and the database write then
--   fails, a billable asset exists that nothing in our system knows about.
--
--   So the row is RESERVED first, with provider_asset_id NULL and a
--   cryptographically random opaque_reference. That reference goes into
--   provider-held metadata when the destination is requested, and the
--   provider's identifier is ATTACHED afterwards. If attachment fails, the
--   caller still holds the provider id and can delete it immediately, and the
--   reservation is marked failed rather than left looking live.
--
-- WHY THE ENVIRONMENT LIVES HERE
--   Preview and Production share ONE Supabase database and ONE Cloudflare
--   account, so nothing about a submission's own row distinguishes them. The
--   environment is written HERE, at reservation time, by trusted server code
--   reading its own deployment configuration. The browser never supplies it,
--   never sees it, and cannot influence which row is reserved.
--
--   Validation then stamps testimonial_submissions.environment_marker FROM
--   THIS ROW. The validation RPC deliberately takes NO environment argument,
--   so there is no parameter through which a wrong environment could be
--   introduced, even by a bug in trusted code.
--
-- WHAT THIS TABLE MUST NEVER HOLD
--   No upload URL, no API token, no webhook secret, no signing key, no signed
--   delivery URL, no playback token, and no raw webhook payload. Correlation
--   uses the opaque reference and the provider's own identifier; nothing that
--   grants access is persisted.

-- ---------------------------------------------------------------------------
-- 1. The ledger
-- ---------------------------------------------------------------------------
create table if not exists public.testimonial_provider_assets (
  id                    uuid primary key default gen_random_uuid(),
  submission_id         uuid not null references public.testimonial_submissions(id) on delete restrict,
  attempt_no            integer not null,
  provider              text not null,
  media_type            public.testimonial_media_type not null,

  -- NULL until the provider has actually issued an identifier. This is the
  -- reservation half of the two-step; see the header.
  provider_asset_id     text,

  -- Trusted, server-written, NOT NULL. The submission's own marker stays null
  -- until validation; these are different facts - what the server intended,
  -- versus what has been proven.
  environment_marker    text not null,

  -- 32 hex characters from gen_random_bytes(16). Travels to the provider as
  -- metadata and comes back on the callback, binding a provider asset to
  -- exactly one attempt. Not the submission id: no internal identifier is
  -- handed to a third party.
  opaque_reference      text not null,

  reserved_at           timestamptz not null default now(),
  reservation_expires_at timestamptz not null,
  attached_at           timestamptz,
  validated_at          timestamptz,
  superseded_at         timestamptz,
  failed_at             timestamptz,
  failure_reason        text,
  deletion_requested_at timestamptz,
  deleted_at            timestamptz,
  deletion_status       text,

  -- Set when the provider issued an identifier that normal attachment could
  -- not record. The row is NOT active, NOT valid and NOT deliverable; it
  -- exists purely so a billable asset stays visible to the cleanup sweep.
  orphaned_at           timestamptz,

  constraint testimonial_provider_asset_attempt_range
    check (attempt_no between 1 and 3),
  constraint testimonial_provider_asset_provider_known
    check (provider in ('cloudflare_images', 'cloudflare_stream')),
  constraint testimonial_provider_asset_environment_known
    check (environment_marker in ('preview', 'production')),
  constraint testimonial_provider_asset_reference_shape
    check (opaque_reference ~ '^[0-9a-f]{32}$'),

  -- Attachment is all-or-nothing: an identifier without a timestamp, or a
  -- timestamp without an identifier, is a half-written row.
  constraint testimonial_provider_asset_attachment_coherent
    check ((attached_at is null) = (provider_asset_id is null)),

  -- Nothing can be validated before it is attached, and a superseded attempt
  -- can never be validated.
  constraint testimonial_provider_asset_validated_requires_attachment
    check (validated_at is null or attached_at is not null),
  constraint testimonial_provider_asset_validated_not_superseded
    check (validated_at is null or superseded_at is null),
  constraint testimonial_provider_asset_validated_not_failed
    check (validated_at is null or failed_at is null),

  -- Deletion is recorded on both sides, mirroring
  -- testimonial_deletion_recorded_on_both_sides on the submissions table.
  constraint testimonial_provider_asset_deletion_recorded
    check (deleted_at is null or deletion_requested_at is not null),
  constraint testimonial_provider_asset_deletion_status_known
    check (deletion_status is null
           or deletion_status in ('pending', 'deleted', 'not_found', 'failed')),

  -- An orphan is by definition never usable: recording one must also take it
  -- out of the active set, or a failed attachment could still be validated.
  constraint testimonial_provider_asset_orphan_is_inert
    check (orphaned_at is null
           or (failed_at is not null and validated_at is null and superseded_at is not null)),

  constraint testimonial_provider_asset_attempt_unique
    unique (submission_id, attempt_no)
);

comment on table public.testimonial_provider_assets is
  'One row per provider upload attempt. Reserved before the provider is called and attached afterwards, so a provider asset can never exist without a ledger row that knows about it. Holds no upload URL, secret, token, signed URL or raw webhook payload.';
comment on column public.testimonial_provider_assets.environment_marker is
  'Trusted environment, written by server code from its own deployment configuration at reservation time. The submission environment marker is stamped FROM this column; the validation RPC takes no environment argument.';
comment on column public.testimonial_provider_assets.orphaned_at is
  'Set when Cloudflare issued an identifier that normal attachment could not record. The row is inert - superseded, failed, never validated - and exists so the asset remains visible to cleanup instead of becoming an untrackable billable orphan.';
comment on column public.testimonial_provider_assets.opaque_reference is
  'Cryptographically random per-attempt token placed in provider-held metadata. Correlates a provider callback to exactly one attempt without exposing an internal identifier.';

-- Provider asset identity is unique ONLY once assigned. A conditional index,
-- because many rows legitimately sit reserved with a NULL identifier.
create unique index if not exists testimonial_provider_assets_identity
  on public.testimonial_provider_assets (provider, provider_asset_id)
  where provider_asset_id is not null;

-- EXACTLY ONE ACTIVE ATTEMPT PER SUBMISSION. This is what makes "the current
-- attempt" well defined, so a callback for any other attempt is provably
-- stale rather than merely unexpected.
create unique index if not exists testimonial_provider_assets_one_active
  on public.testimonial_provider_assets (submission_id)
  where superseded_at is null and failed_at is null and deleted_at is null;

-- Cleanup sweeps read by state, not by submission.
create index if not exists testimonial_provider_assets_cleanup
  on public.testimonial_provider_assets (deletion_requested_at)
  where provider_asset_id is not null and deleted_at is null;

alter table public.testimonial_provider_assets enable row level security;

-- No browser role holds anything here. Reached only from SECURITY DEFINER
-- functions that execute as owner.
revoke all on public.testimonial_provider_assets from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Reservation
-- ---------------------------------------------------------------------------
/**
 * Step A of the two-step. Called BEFORE Cloudflare, so a provider asset can
 * never be created without a row already waiting for it.
 *
 * Re-verifies everything rather than trusting the caller: the visitor is
 * re-resolved through assert_testimonial_visitor (anonymity, ownership,
 * published experience, capture gate), the consent registry must have an
 * active version, the submission must belong to that visitor and still be in
 * an eligible lifecycle state, and the attempt budget must not be spent.
 */
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

  v_ref := encode(gen_random_bytes(16), 'hex');

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

-- ---------------------------------------------------------------------------
-- 3. Attachment
-- ---------------------------------------------------------------------------
/**
 * Step C. Binds the provider's identifier to the reservation.
 *
 * Requires the reservation to be active, unexpired and still unattached, so
 * an identifier can never be swapped after the fact. The conditional unique
 * index additionally guarantees one provider asset maps to one attempt.
 */
create or replace function public.attach_testimonial_provider_asset(
  p_ledger_id uuid,
  p_provider text,
  p_provider_asset_id text
)
returns table (ledger_id uuid, attached_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_catalog
as $fn$
declare
  v_row public.testimonial_provider_assets%rowtype;
begin
  if p_provider_asset_id is null or btrim(p_provider_asset_id) = '' then
    raise exception 'a provider asset identifier is required' using errcode = '22023';
  end if;

  select * into v_row
  from public.testimonial_provider_assets a
  where a.id = p_ledger_id
  for update;

  if v_row.id is null then
    raise exception 'reservation not found' using errcode = '42501';
  end if;
  if v_row.provider <> p_provider then
    raise exception 'provider mismatch for this reservation' using errcode = '42501';
  end if;
  if v_row.provider_asset_id is not null then
    raise exception 'this reservation already has a provider asset' using errcode = '42501';
  end if;
  if v_row.superseded_at is not null or v_row.failed_at is not null
     or v_row.deleted_at is not null then
    raise exception 'this reservation is no longer active' using errcode = '42501';
  end if;
  if v_row.reservation_expires_at < now() then
    raise exception 'this reservation has expired' using errcode = '42501';
  end if;

  return query
  update public.testimonial_provider_assets a
  set provider_asset_id = p_provider_asset_id,
      attached_at = now()
  where a.id = p_ledger_id
  returning a.id, a.attached_at;
end $fn$;

revoke all on function public.attach_testimonial_provider_asset(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.attach_testimonial_provider_asset(uuid, text, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- 4. Failing a reservation
-- ---------------------------------------------------------------------------
/**
 * Used when the provider call fails, or when the provider succeeded but
 * attachment did not. Never invents an identifier: a reservation that failed
 * before attachment keeps provider_asset_id NULL, and the caller is
 * responsible for deleting the orphan it still holds in memory.
 *
 * failure_reason is a SANITIZED code from trusted server code - never a
 * provider response body, never a URL.
 */
create or replace function public.fail_testimonial_provider_attempt(
  p_ledger_id uuid,
  p_reason text
)
returns table (ledger_id uuid, failed_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_catalog
as $fn$
begin
  if p_reason is null or char_length(p_reason) > 100 then
    raise exception 'a short sanitized failure reason is required' using errcode = '22023';
  end if;

  return query
  update public.testimonial_provider_assets a
  set failed_at = coalesce(a.failed_at, now()),
      failure_reason = coalesce(a.failure_reason, p_reason)
  where a.id = p_ledger_id
    and a.validated_at is null
  returning a.id, a.failed_at;
end $fn$;

revoke all on function public.fail_testimonial_provider_attempt(uuid, text)
  from public, anon, authenticated;
grant execute on function public.fail_testimonial_provider_attempt(uuid, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- 5. Progress, without validating
-- ---------------------------------------------------------------------------
/**
 * A signed Stream webhook may record processing state, but readyToStream
 * alone must NOT make a submission valid - Stream documents that a video in
 * `ready` may still be encoding quality levels until pctComplete reaches 100.
 * This records the state and nothing else; validation is a separate,
 * authenticated reconciliation.
 *
 * Resolves the row by (provider, provider_asset_id) AND the opaque reference,
 * so a callback that does not carry the reference we issued cannot move
 * anything, and a superseded attempt is refused outright.
 */
create or replace function public.record_testimonial_provider_progress(
  p_provider text,
  p_provider_asset_id text,
  p_opaque_reference text,
  p_processing_status text,
  p_error_code text,
  p_event_id text
)
returns table (submission_id uuid, recorded boolean)
language plpgsql
security definer
set search_path = public, pg_catalog
as $fn$
declare
  v_row public.testimonial_provider_assets%rowtype;
begin
  select * into v_row
  from public.testimonial_provider_assets a
  where a.provider = p_provider
    and a.provider_asset_id = p_provider_asset_id
    and a.opaque_reference = p_opaque_reference
    and a.superseded_at is null
    and a.failed_at is null
    and a.deleted_at is null
  for update;

  -- Unknown, superseded or mismatched: report cleanly rather than raising, so
  -- the caller can answer the provider 200 without a database transition.
  if v_row.id is null then
    return query select null::uuid, false;
    return;
  end if;

  update public.testimonial_submissions s
  set provider_processing_status = p_processing_status,
      provider_error_code        = coalesce(p_error_code, s.provider_error_code),
      last_provider_event_id     = coalesce(p_event_id, s.last_provider_event_id),
      last_provider_event_at     = now()
  where s.id = v_row.submission_id;

  return query select v_row.submission_id, true;
end $fn$;

revoke all on function public.record_testimonial_provider_progress(text, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.record_testimonial_provider_progress(text, text, text, text, text, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- 6. Validation — the only path that stamps the environment
-- ---------------------------------------------------------------------------
/**
 * TAKES NO ENVIRONMENT ARGUMENT, deliberately.
 *
 * The environment is read from the ledger row this call resolves to, and that
 * row was written by trusted server code from its own deployment
 * configuration. There is therefore no parameter through which a wrong
 * environment could arrive - not from a browser, not from a provider payload,
 * and not from a bug in the calling server code.
 *
 * The caller must prove it is talking about a specific attempt: the provider,
 * the provider's own identifier and the opaque reference we issued must all
 * match the SAME active row. A superseded attempt, a deleted asset or an
 * unknown identifier resolves to nothing and stamps nothing.
 *
 * Evidence is provider-observed only. Nothing here originates in a browser.
 */
create or replace function public.validate_testimonial_provider_asset(
  p_provider text,
  p_provider_asset_id text,
  p_opaque_reference text,
  p_signed_urls_required boolean,
  p_size_bytes bigint,
  p_duration_seconds numeric,
  p_width integer,
  p_height integer,
  p_processing_status text,
  p_event_id text
)
returns table (submission_id uuid, environment_marker text, validated boolean)
language plpgsql
security definer
set search_path = public, pg_catalog
as $fn$
declare
  v_row  public.testimonial_provider_assets%rowtype;
  v_sub  public.testimonial_submissions%rowtype;
begin
  -- Signed delivery is not optional. A provider asset that is publicly
  -- readable must never become gallery-eligible.
  if p_signed_urls_required is distinct from true then
    raise exception 'signed delivery is required before a submission can be valid'
      using errcode = '42501';
  end if;

  select * into v_row
  from public.testimonial_provider_assets a
  where a.provider = p_provider
    and a.provider_asset_id = p_provider_asset_id
    and a.opaque_reference = p_opaque_reference
    and a.attached_at is not null
    and a.superseded_at is null
    and a.failed_at is null
    and a.deleted_at is null
  for update;

  if v_row.id is null then
    -- Not an error the provider should retry: the asset is unknown to us, or
    -- belongs to an attempt that has been superseded.
    return query select null::uuid, null::text, false;
    return;
  end if;

  select * into v_sub
  from public.testimonial_submissions s
  where s.id = v_row.submission_id
  for update;

  -- Already validated by an earlier delivery of the same event. Idempotent.
  if v_sub.validation_status = 'valid' then
    return query select v_sub.id, v_sub.environment_marker, true;
    return;
  end if;

  if v_sub.upload_status not in ('initiated', 'uploaded') then
    return query select v_sub.id, null::text, false;
    return;
  end if;
  if v_sub.moderation_status <> 'pending' or v_sub.media_deleted_at is not null then
    return query select v_sub.id, null::text, false;
    return;
  end if;

  -- Video needs the trusted metadata the base table's CHECK requires; an
  -- image legitimately has none of it, because Cloudflare Images does not
  -- document returning size or dimensions.
  if v_sub.media_type = 'video' then
    if p_duration_seconds is null or p_size_bytes is null
       or p_width is null or p_height is null then
      raise exception 'a video requires trusted duration, size and dimensions'
        using errcode = '42501';
    end if;
  end if;

  update public.testimonial_submissions s
  set upload_status                 = 'uploaded',
      uploaded_at                   = coalesce(s.uploaded_at, now()),
      provider                      = v_row.provider,
      provider_asset_id             = v_row.provider_asset_id,
      provider_delivery_id          = v_row.provider_asset_id,
      provider_draft_cleared_at     = now(),
      provider_signed_urls_required = true,
      delivery_ready_at             = now(),
      provider_processing_status    = coalesce(p_processing_status, s.provider_processing_status),
      last_provider_event_id        = coalesce(p_event_id, s.last_provider_event_id),
      last_provider_event_at        = now(),
      validated_size_bytes          = p_size_bytes,
      validated_duration_seconds    = p_duration_seconds,
      validated_width               = p_width,
      validated_height              = p_height,
      validation_status             = 'valid',
      validated_at                  = now(),
      -- THE STAMP. From the ledger row, never from an argument.
      environment_marker            = coalesce(s.environment_marker, v_row.environment_marker)
  where s.id = v_row.submission_id;

  update public.testimonial_provider_assets a
  set validated_at = now()
  where a.id = v_row.id;

  return query select v_row.submission_id, v_row.environment_marker, true;
end $fn$;

revoke all on function public.validate_testimonial_provider_asset(text, text, text, boolean, bigint, numeric, integer, integer, text, text)
  from public, anon, authenticated;
grant execute on function public.validate_testimonial_provider_asset(text, text, text, boolean, bigint, numeric, integer, integer, text, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- 7. Orphan recovery — never lose a provider identifier
-- ---------------------------------------------------------------------------
/**
 * The last line of defence against an untrackable, billable asset.
 *
 * THE FAILURE THIS EXISTS FOR
 *   Reservation succeeds, Cloudflare creates an asset and returns its id,
 *   normal attachment fails, AND the immediate delete also fails. Without
 *   this function the only copy of that identifier is a local variable in a
 *   dying request, and the asset becomes invisible to us while Cloudflare
 *   keeps billing for it.
 *
 * WHAT IT DELIBERATELY CANNOT DO
 *   It cannot make the row active, valid or deliverable: the row is written
 *   superseded AND failed AND orphaned in one statement, which the
 *   orphan_is_inert constraint enforces independently of this function's
 *   logic. It does not touch testimonial_submissions at all, so it can move
 *   no lifecycle and stamp no environment marker.
 *
 * IDEMPOTENT, AND STRICT ABOUT CONFLICTS
 *   Recording the same identifier twice is a no-op. Recording a DIFFERENT
 *   identifier against a reservation that already has one is refused, because
 *   that would mean we had lost track of which asset the row describes.
 */
create or replace function public.record_orphaned_testimonial_provider_asset(
  p_ledger_id uuid,
  p_provider text,
  p_provider_asset_id text,
  p_deletion_status text
)
returns table (ledger_id uuid, provider_asset_id text, deletion_status text)
language plpgsql
security definer
set search_path = public, pg_catalog
as $fn$
declare
  v_row public.testimonial_provider_assets%rowtype;
begin
  if p_provider_asset_id is null or btrim(p_provider_asset_id) = '' then
    raise exception 'a provider asset identifier is required' using errcode = '22023';
  end if;
  if p_deletion_status not in ('pending', 'failed') then
    raise exception 'an orphan is recorded as pending or failed deletion only'
      using errcode = '22023';
  end if;

  select * into v_row
  from public.testimonial_provider_assets a
  where a.id = p_ledger_id
  for update;

  if v_row.id is null then
    raise exception 'reservation not found' using errcode = '42501';
  end if;
  if v_row.provider <> p_provider then
    raise exception 'provider mismatch for this reservation' using errcode = '42501';
  end if;
  if v_row.validated_at is not null then
    raise exception 'a validated attempt cannot be recorded as an orphan' using errcode = '42501';
  end if;
  if v_row.provider_asset_id is not null
     and v_row.provider_asset_id <> p_provider_asset_id then
    raise exception 'this reservation already refers to a different provider asset'
      using errcode = '42501';
  end if;

  return query
  update public.testimonial_provider_assets a
  set provider_asset_id     = p_provider_asset_id,
      attached_at           = coalesce(a.attached_at, now()),
      superseded_at         = coalesce(a.superseded_at, now()),
      failed_at             = coalesce(a.failed_at, now()),
      failure_reason        = coalesce(a.failure_reason, 'orphaned_attachment_failed'),
      orphaned_at           = coalesce(a.orphaned_at, now()),
      deletion_requested_at = coalesce(a.deletion_requested_at, now()),
      deletion_status       = p_deletion_status
  where a.id = p_ledger_id
  returning a.id, a.provider_asset_id, a.deletion_status;
end $fn$;

revoke all on function public.record_orphaned_testimonial_provider_asset(uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.record_orphaned_testimonial_provider_asset(uuid, text, text, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- 8. Supersede retry_testimonial_upload — THREE destinations, not four
-- ---------------------------------------------------------------------------
/**
 * 20260819103000 caps upload_attempt_count at 3 and allows a retry whenever
 * the count is BELOW 3, so the sequence 0 -> 1 -> 2 -> 3 authorises FOUR
 * uploads. The product limit is three in total, including the first.
 *
 * Superseded with CREATE OR REPLACE. Every security check is preserved
 * verbatim - ownership, anonymity, failed-only, no resurrection of validated
 * or moderated or deleted rows, expiry plus grace, and the FOR UPDATE lock
 * that serialises the read-decide-write. Two things change:
 *
 *   1. the cap becomes `>= 2`, so the count can only reach 2 and the attempt
 *      numbering stops at 3;
 *   2. the active ledger attempt is superseded here, in the same transaction
 *      as the increment, so upload_attempt_count and attempt_no can never
 *      describe different attempts.
 */
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
  select s.experience_user_id, s.upload_status, s.upload_attempt_count,
         s.validation_status, s.moderation_status, s.media_deleted_at, s.upload_expires_at
  into v_eu, v_status, v_attempts, v_validation, v_moderation, v_deleted, v_expires
  from public.testimonial_submissions s
  where s.id = p_submission_id
  for update;

  if v_eu is null then
    raise exception 'submission not found or not available' using errcode = '42501';
  end if;
  perform public.assert_testimonial_visitor(v_uid, v_eu);

  if v_status <> 'failed' then
    raise exception 'only a failed upload can be retried' using errcode = '42501';
  end if;
  if v_validation = 'valid' then
    raise exception 'a validated submission cannot be retried' using errcode = '42501';
  end if;
  if v_moderation <> 'pending' then
    raise exception 'a moderated submission cannot be retried' using errcode = '42501';
  end if;
  if v_deleted is not null then
    raise exception 'a submission whose media was deleted cannot be retried' using errcode = '42501';
  end if;
  if v_expires + interval '15 minutes' < now() then
    raise exception 'this upload intent has expired' using errcode = '42501';
  end if;

  -- THE CORRECTED CAP. Counts 0, 1 and 2 map to attempts 1, 2 and 3; a third
  -- retry would produce a fourth destination and is refused.
  if v_attempts >= 2 then
    raise exception 'no upload attempts remain for this submission' using errcode = '42501';
  end if;

  -- Retire the current ledger attempt in the same transaction as the
  -- increment, so the next reservation is free to claim the active slot and
  -- the two counters always agree.
  update public.testimonial_provider_assets a
  set superseded_at = now()
  where a.submission_id = p_submission_id
    and a.superseded_at is null
    and a.failed_at is null
    and a.deleted_at is null;

  return query
  update public.testimonial_submissions s
  set upload_status         = 'initiated',
      upload_attempt_count  = s.upload_attempt_count + 1,
      upload_expires_at     = now() + interval '30 minutes',
      upload_failure_reason = null
  where s.id = p_submission_id
  returning s.id, s.upload_status, s.upload_attempt_count, s.upload_expires_at;
end $fn$;

revoke all on function public.retry_testimonial_upload(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.retry_testimonial_upload(uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 9. Cleanup
-- ---------------------------------------------------------------------------
/**
 * Everything the provider is still storing that we no longer want: superseded
 * retries, failed attempts, and assets whose submission has been rejected or
 * purged. Read-only; the caller performs the provider deletion and then
 * records the outcome.
 */
create or replace function public.list_deletable_testimonial_provider_assets(
  p_limit integer default 50
)
returns table (
  ledger_id uuid,
  provider text,
  provider_asset_id text,
  environment_marker text,
  reason text
)
language sql
stable
security definer
set search_path = public, pg_catalog
as $fn$
  select a.id, a.provider, a.provider_asset_id, a.environment_marker,
         case
           when a.orphaned_at is not null    then 'orphaned'
           when a.superseded_at is not null  then 'superseded'
           when a.failed_at is not null      then 'failed'
           else 'submission_purged'
         end
  from public.testimonial_provider_assets a
  join public.testimonial_submissions s on s.id = a.submission_id
  where a.provider_asset_id is not null
    and a.deleted_at is null
    and (
      a.orphaned_at is not null
      or a.superseded_at is not null
      or a.failed_at is not null
      or (s.media_purge_after is not null and s.media_purge_after <= now())
    )
  order by a.reserved_at
  limit greatest(1, least(coalesce(p_limit, 50), 200));
$fn$;

revoke all on function public.list_deletable_testimonial_provider_assets(integer)
  from public, anon, authenticated;
grant execute on function public.list_deletable_testimonial_provider_assets(integer)
  to service_role;

/**
 * Records the outcome of a provider deletion. `not_found` counts as deleted:
 * the goal is that the provider is no longer storing it, and a 404 proves
 * that as well as a 200 does.
 */
create or replace function public.mark_testimonial_provider_asset_deleted(
  p_ledger_id uuid,
  p_status text
)
returns table (ledger_id uuid, deletion_status text)
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
  set deletion_requested_at = coalesce(a.deletion_requested_at, now()),
      deletion_status       = p_status,
      deleted_at            = case when p_status in ('deleted', 'not_found')
                                   then coalesce(a.deleted_at, now())
                                   else a.deleted_at end
  where a.id = p_ledger_id
  returning a.id, a.deletion_status;
end $fn$;

revoke all on function public.mark_testimonial_provider_asset_deleted(uuid, text)
  from public, anon, authenticated;
grant execute on function public.mark_testimonial_provider_asset_deleted(uuid, text)
  to service_role;
