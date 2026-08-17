-- Kameleon Video & Photo Testimonials — submission model, lifecycle and
-- moderation authorization.
--
-- SCOPE: phone-camera capture only. No library upload, therefore no
-- `source_type` and no `original_filename`.
--
-- MEDIA CUSTODY: the media processing provider is the quarantine, processing
-- and delivery system. Supabase is the system of record for identity, consent,
-- lifecycle, moderation and provider references — and holds NO media.
--
--   phone capture
--     -> server creates a testimonial intent (this table)
--     -> server requests a private one-time provider upload URL
--     -> phone uploads DIRECTLY to the provider
--     -> trusted server verifies provider completion
--     -> Supabase records trusted processing state
--     -> valid media enters moderation
--     -> approved media receives signed delivery access
--
-- Deliberately NOT a Supabase-source hybrid: routing the capture through a
-- Supabase bucket first would duplicate custody, add a transfer worker, create
-- orphan states in two storage systems and discard the provider's direct-upload
-- guarantees (duration caps and signed-URL requirements enforced at ingest).
-- Consequently this migration creates NO storage bucket, NO storage policies
-- and NO media path columns. If duplicate source custody is ever justified, it
-- needs its own documented requirement and its own migration.
--
-- THREE INDEPENDENT LIFECYCLES, never overloaded onto one column:
--   upload_status      initiated -> uploaded | failed | abandoned
--   validation_status  pending   -> valid | invalid        (TRUSTED ONLY)
--   moderation_status  pending   -> approved | rejected -> removed
--
--   Moderation-eligible := upload_status='uploaded' AND validation_status='valid'
--                          AND provider_asset_id IS NOT NULL
--                          AND trusted metadata recorded
--   Gallery-eligible    := the above AND moderation_status='approved'
--                          AND published_at IS NOT NULL
--                          AND delivery_ready_at IS NOT NULL
--                          AND media_deleted_at IS NULL
--
-- PROVIDER COMPLETION IS NOT PUBLICATION. A provider asset finishing processing
-- makes it *eligible for review*, nothing more. Nothing is publicly playable
-- until the database confirms gallery eligibility and the application then mints
-- a short-lived signed delivery token.
--
-- NEVER STORED HERE: API tokens, webhook secrets, one-time upload URLs, signed
-- playback URLs, or any expiring token. Only opaque provider identifiers.
--
-- BROWSER ROLES CANNOT SET: upload completion, validation result, any provider
-- identifier or processing field, trusted metadata, delivery/poster readiness,
-- moderation state, review provenance, publication timestamps or recorded
-- consent. Enforced at three layers — column privileges (no grant), a BEFORE
-- INSERT trigger that overwrites, and a BEFORE UPDATE trigger raising 42501.
--
-- RESIDUAL RISK, ACCEPTED AND RECORDED: provider processing rejects malformed
-- and unsupported media but is NOT a general antivirus scanner. This is
-- mitigated by a narrow capture scope (application-generated JPEG, provider-
-- supported recorded video containers), size/duration limits at both the
-- browser and provider boundaries, and by never serving an original — only
-- provider-processed renditions. Requires future review.
--
-- ===========================================================================
-- UPLOAD METHOD CONTRACT — providers do NOT share one HTTP method
-- ===========================================================================
-- Images (Direct Creator Upload): the browser sends the captured JPEG with
--   POST multipart/form-data to the one-time upload URL. The form field carries
--   the captured file/blob. It is NOT a PUT. The one-time URL is never stored;
--   the Cloudflare-generated image ID is. No custom image ID is used, because a
--   custom ID cannot use signed-URL protection. The server then confirms the
--   image is no longer a draft before marking processing complete.
-- Stream (Direct Creator Upload):
--   basic upload  -> the provider's documented multipart POST
--   resumable     -> the TUS protocol and its own required methods (HEAD/PATCH)
-- Implementations MUST NOT build a generic upload helper that assumes PUT, or
-- that assumes one provider's method applies to the other.
--
-- ===========================================================================
-- TRUSTED METADATA IS PROVIDER-SPECIFIC
-- ===========================================================================
-- Stream documents trusted duration, size, input width/height, processing
-- state and playback readiness — so a video MUST carry those before it can be
-- considered valid.
-- Images' documented image-details response does NOT expose a trusted original
-- byte size, MIME type or pixel dimensions. Requiring them for an image would
-- force the value to be invented from browser-reported data, which is
-- explicitly untrusted. For an image, trusted validity therefore means: the
-- provider accepted and processed it, the draft state is gone, signed delivery
-- is required, and a delivery variant exists.
-- Browser-reported values remain untrusted and may never populate a trusted
-- column. Gallery eligibility is provider/media-type aware for the same reason.
--
-- ===========================================================================
-- COST BASELINE (official Cloudflare pricing; both storage products are
-- purchased in MINIMUM BILLING INCREMENTS — this is not a usage-only model)
-- ===========================================================================
--   Images storage   $5 per 100,000 stored images per month   (min. 1 block)
--   Images delivery  $1 per 100,000 delivered images
--   Stream storage   $5 per 1,000 stored minutes              (min. 1 block)
--   Stream delivery  $1 per 1,000 delivered minutes
-- Small-launch example — 350 stored images, 75 stored video minutes,
-- 1,500 delivered video minutes (150 x 30s x 20 views), ~10,000 image
-- deliveries:
--   Images storage  $5.00  (first block)
--   Stream storage  $5.00  (first block)
--   Stream delivery $1.50
--   Images delivery $0.10
--   TOTAL          ~$11.60/month  -> budget $10-15/month, before taxes,
--   optional Cloudflare plan charges, or unexpected traffic.

-- ---------------------------------------------------------------------------
-- 1. Enums — one per lifecycle
-- ---------------------------------------------------------------------------
create type public.testimonial_media_type as enum ('image', 'video');

create type public.testimonial_upload_status as enum
  ('initiated', 'uploaded', 'failed', 'abandoned');

create type public.testimonial_validation_status as enum
  ('pending', 'valid', 'invalid');

create type public.testimonial_moderation_status as enum
  ('pending', 'approved', 'rejected', 'removed');

-- ---------------------------------------------------------------------------
-- 2. Table
-- ---------------------------------------------------------------------------
create table public.testimonial_submissions (
  id uuid primary key default gen_random_uuid(),

  client_id          uuid not null references public.clients (id)          on delete cascade,
  experience_id      uuid not null references public.experiences (id)      on delete cascade,
  experience_user_id uuid not null references public.experience_users (id) on delete cascade,
  auth_user_id       uuid references auth.users (id) on delete set null,

  media_type   public.testimonial_media_type not null,
  capture_mode text not null default 'stream'
    check (capture_mode in ('stream', 'native_input')),

  -- Idempotency + duplicate-submit protection, generated once per capture
  -- session. A retry reuses it, so a double-tap or retried finalize resolves to
  -- the same row rather than a second submission.
  client_submission_key text not null,

  -- Upload lifecycle -------------------------------------------------------
  upload_status         public.testimonial_upload_status not null default 'initiated',
  upload_expires_at     timestamptz not null default (now() + interval '30 minutes'),
  uploaded_at           timestamptz,
  upload_failure_reason text,

  -- Trusted validation lifecycle -------------------------------------------
  validation_status         public.testimonial_validation_status not null default 'pending',
  validated_at              timestamptz,
  validated_by              text,   -- which trusted component asserted this
  validation_failure_reason text,

  -- Provider references ----------------------------------------------------
  -- Opaque identifiers ONLY. Never a token, secret, one-time upload URL or
  -- signed playback URL — those are minted at request time from server-held
  -- configuration and are deliberately not persisted anywhere.
  provider                   text,
  provider_asset_id          text,   -- the provider's own generated asset id
  provider_upload_id         text,   -- correlates the one-time upload request
  provider_processing_status text,
  provider_delivery_id       text,
  provider_poster_id         text,
  provider_error_code        text,
  provider_deletion_status   text,
  last_provider_event_id     text,
  last_provider_event_at     timestamptz,

  delivery_ready_at timestamptz,
  poster_ready_at   timestamptz,

  -- Provider-verified evidence required of EVERY media type.
  provider_draft_cleared_at     timestamptz,   -- confirmed no longer a draft
  provider_signed_urls_required boolean not null default false,

  -- TRUSTED metadata — written only after provider verification, and only
  -- where the provider actually documents the value.
  --   Stream (video): duration, size, input width/height are documented and
  --                   are therefore REQUIRED for a video to become valid.
  --   Images (photo): the image-details response documents none of these, so
  --                   they stay null rather than being invented from
  --                   browser-reported data.
  detected_mime_type         text,
  validated_size_bytes       bigint,
  validated_width            integer,
  validated_height           integer,
  validated_duration_seconds numeric,
  validated_codec            text,

  -- CLIENT-REPORTED hints. Explicitly untrusted; retained only to compare
  -- against trusted values and spot tampering. Never used for any decision.
  reported_mime_type        text,
  reported_size_bytes       bigint,
  reported_duration_seconds numeric,

  caption text,

  -- Moderation lifecycle ---------------------------------------------------
  moderation_status public.testimonial_moderation_status not null default 'pending',
  moderation_note   text,   -- internal only, never shown to the submitter
  rejection_reason  text,   -- may be surfaced to the submitter
  reviewed_at  timestamptz,
  reviewed_by  uuid references auth.users (id) on delete set null,
  published_at timestamptz,
  removed_at   timestamptz,

  -- Consent ----------------------------------------------------------------
  -- Testimonial publication consent is its own record with its own version.
  -- Deliberately NOT inferred from the general Kameleon terms, which are
  -- currently non-interactive placeholder elements with no documents behind
  -- them and grant no publication rights whatsoever.
  consent_version text not null,
  consented_at    timestamptz not null,

  -- Approved scope for the initial release: display inside the experience's own
  -- gallery only. Marketing, advertising and social reuse are NOT covered and
  -- require separate, separately-recorded permission. The value stays
  -- client-neutral: this is shared platform schema.
  consent_scope text not null default 'experience_gallery_display'
    check (consent_scope in ('experience_gallery_display')),

  -- Explicit attestations stored as data rather than implied by a checkbox.
  -- Submissions depicting minors are prohibited for the initial release, so a
  -- row cannot exist without both — the CHECK below fails closed.
  attested_no_minors          boolean not null default false,
  attested_subjects_consented boolean not null default false,

  submitted_at      timestamptz,
  media_deleted_at  timestamptz,   -- provider asset confirmed purged
  media_purge_after timestamptz,   -- rejected/removed: reviewed_at + 30 days

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint testimonial_caption_length
    check (caption is null or char_length(caption) <= 280),
  constraint testimonial_moderation_note_length
    check (moderation_note is null or char_length(moderation_note) <= 2000),
  constraint testimonial_rejection_reason_length
    check (rejection_reason is null or char_length(rejection_reason) <= 2000),
  constraint testimonial_validated_size_sane
    check (validated_size_bytes is null
           or (validated_size_bytes > 0 and validated_size_bytes <= 62914560)),
  constraint testimonial_validated_duration_sane
    check (validated_duration_seconds is null
           or (validated_duration_seconds >= 0 and validated_duration_seconds <= 65)),

  -- Validation may only be conclusive once the provider actually holds an asset.
  constraint testimonial_validation_requires_provider_asset
    check (validation_status = 'pending'
           or (upload_status = 'uploaded' and provider_asset_id is not null)),

  -- PROVIDER/MEDIA-TYPE AWARE VALIDITY.
  -- Every valid asset must be out of draft with signed delivery required.
  -- A video must additionally carry the trusted metadata Stream documents;
  -- an image must not, because Images does not expose it and inventing it from
  -- browser-reported data would defeat the point of a trusted field.
  constraint testimonial_valid_requires_provider_evidence
    check (
      validation_status <> 'valid'
      or (
        provider_asset_id is not null
        and provider_draft_cleared_at is not null
        and provider_signed_urls_required
        and (
          media_type = 'image'
          or (media_type = 'video'
              and validated_duration_seconds is not null
              and validated_size_bytes is not null
              and validated_width is not null
              and validated_height is not null)
        )
      )
    ),

  -- An approved row must be trusted-valid, delivery-ready and published. The
  -- database itself cannot hold an approved-but-unservable row.
  constraint testimonial_approved_requires_ready_delivery
    check (moderation_status <> 'approved'
           or (validation_status = 'valid'
               and delivery_ready_at is not null
               and published_at is not null)),

  -- Both attestations are mandatory. Minors are prohibited for the initial
  -- release, so this fails closed rather than relying on UI copy.
  constraint testimonial_attestations_required
    check (attested_no_minors and attested_subjects_consented),

  -- Physical deletion must be recorded on both sides: a row claiming its media
  -- is gone must also say what the provider reported.
  constraint testimonial_deletion_recorded_on_both_sides
    check (media_deleted_at is null or provider_deletion_status is not null),

  constraint testimonial_submission_key_unique
    unique (experience_user_id, client_submission_key)
);

-- RETENTION POLICY (encoded above, swept by a scheduled trusted job):
--   pending moderation .... asset retained
--   approved + published .. asset retained
--   rejected .............. media_purge_after = reviewed_at + 30 days
--   removed/unpublished ... media_purge_after = removed_at  + 30 days
--   invalid ............... media_purge_after = now()  (deleted immediately)
--   abandoned / failed .... media_purge_after = now()  (reconciled, deleted)
-- Deleting the provider asset sets provider_deletion_status AND
-- media_deleted_at together. Gallery eligibility ceases IMMEDIATELY on removal
-- (published_at is cleared in the same statement) and never waits for the
-- physical delete. There is no duplicate Supabase source copy to reconcile.

comment on table public.testimonial_submissions is
  'Visitor-captured photo/video testimonials. Media lives entirely at the processing provider; this table holds identity, consent, lifecycle, moderation and opaque provider references only. No API token, webhook secret, one-time upload URL, signed playback URL or expiring token is ever stored. No browser role may SELECT this table — the gallery reads public.testimonial_gallery_items.';

comment on column public.testimonial_submissions.reported_mime_type is
  'Client-reported hint. UNTRUSTED — never used for any decision. Compare against detected_mime_type to spot tampering.';

-- One provider asset may back at most one submission.
create unique index testimonial_submissions_provider_asset_unique
  on public.testimonial_submissions (provider, provider_asset_id)
  where provider_asset_id is not null;

create index testimonial_submissions_moderation_queue_idx
  on public.testimonial_submissions (client_id, moderation_status)
  where upload_status = 'uploaded' and validation_status = 'valid';
create index testimonial_submissions_experience_user_idx
  on public.testimonial_submissions (experience_user_id);
create index testimonial_submissions_gallery_idx
  on public.testimonial_submissions (experience_id, published_at desc)
  where moderation_status = 'approved' and validation_status = 'valid';
create index testimonial_submissions_orphan_sweep_idx
  on public.testimonial_submissions (upload_status, upload_expires_at);
create index testimonial_submissions_purge_idx
  on public.testimonial_submissions (media_purge_after)
  where media_purge_after is not null and media_deleted_at is null;

create trigger testimonial_submissions_set_updated_at
  before update on public.testimonial_submissions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 3. Cross-tenant consistency
-- ---------------------------------------------------------------------------
create or replace function public.enforce_testimonial_client_consistency()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  experience_client_id uuid;
  owner_client_id uuid;
  owner_experience_id uuid;
begin
  select client_id into experience_client_id
    from public.experiences where id = new.experience_id;
  if experience_client_id is distinct from new.client_id then
    raise exception 'testimonial_submissions.client_id must match experience_id''s client_id';
  end if;

  select client_id, experience_id into owner_client_id, owner_experience_id
    from public.experience_users where id = new.experience_user_id;
  if owner_client_id is distinct from new.client_id then
    raise exception 'testimonial_submissions.client_id must match experience_user_id''s client_id';
  end if;
  if owner_experience_id is distinct from new.experience_id then
    raise exception 'testimonial_submissions.experience_id must match experience_user_id''s experience_id';
  end if;

  return new;
end;
$$;

create trigger testimonial_submissions_enforce_client_consistency
  before insert or update on public.testimonial_submissions
  for each row execute function public.enforce_testimonial_client_consistency();

-- ---------------------------------------------------------------------------
-- 4. Insert hardening — a browser creates an upload INTENT and nothing else
-- ---------------------------------------------------------------------------
create or replace function public.protect_testimonial_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() = 'service_role' or auth.role() is null then
    return new;
  end if;

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

  new.auth_user_id := auth.uid();
  new.submitted_at := coalesce(new.submitted_at, now());

  return new;
end;
$$;

revoke execute on function public.protect_testimonial_insert()
  from public, anon, authenticated;

create trigger testimonial_submissions_00_protect_insert
  before insert on public.testimonial_submissions
  for each row execute function public.protect_testimonial_insert();

-- ---------------------------------------------------------------------------
-- 5. Update protection — lifecycle machines + column authorization
-- ---------------------------------------------------------------------------
-- The "00_" prefix is load-bearing: Postgres fires BEFORE row triggers in NAME
-- order, so this must sort ahead of the consistency trigger or an authorization
-- failure would surface as that trigger's generic P0001.
create or replace function public.protect_testimonial_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  trusted boolean;
begin
  -- Trusted tier, matching 20260804210404 and 20260817143000: a genuine
  -- service_role request, OR no JWT/API role context at all. auth.uid() is
  -- deliberately not consulted — it is null for a real anonymous API request
  -- and would hand every anonymous caller the bypass.
  trusted := (auth.role() = 'service_role' or auth.role() is null);

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

    if      new.moderation_status is distinct from old.moderation_status
         or new.moderation_note   is distinct from old.moderation_note
         or new.rejection_reason  is distinct from old.rejection_reason
         or new.reviewed_at       is distinct from old.reviewed_at
         or new.reviewed_by       is distinct from old.reviewed_by
         or new.published_at      is distinct from old.published_at
         or new.removed_at        is distinct from old.removed_at
         or new.media_deleted_at  is distinct from old.media_deleted_at
         or new.media_purge_after is distinct from old.media_purge_after
    then
      raise exception 'moderation state and review provenance are server-controlled'
        using errcode = '42501';
    end if;

    if      new.consent_scope               is distinct from old.consent_scope
         or new.attested_no_minors          is distinct from old.attested_no_minors
         or new.attested_subjects_consented is distinct from old.attested_subjects_consented
         or new.consent_version             is distinct from old.consent_version
         or new.consented_at                is distinct from old.consented_at
    then
      raise exception 'recorded consent cannot be altered after submission' using errcode = '42501';
    end if;

    if new.caption is distinct from old.caption and old.moderation_status <> 'pending' then
      raise exception 'the caption can only be edited while a submission is pending'
        using errcode = '42501';
    end if;
  end if;

  -- ---- Lifecycle machines: enforced for EVERY caller, including service_role,
  -- ---- so a buggy trusted component cannot corrupt the pipeline either.
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
    -- Retention: an abandoned or failed intent is reconciled and its provider
    -- asset (if any) deleted once expired — purge immediately on transition.
    if new.upload_status in ('abandoned', 'failed') then
      new.media_purge_after := coalesce(new.media_purge_after, now());
    end if;
  end if;

  if new.validation_status is distinct from old.validation_status then
    if old.validation_status <> 'pending' then
      raise exception 'validation_status is conclusive and cannot be re-decided: % -> %',
        old.validation_status, new.validation_status using errcode = '42501';
    end if;
    -- Provider completion is required before validation can be decided at all.
    if new.upload_status <> 'uploaded' or new.provider_asset_id is null then
      raise exception 'validation requires a completed provider upload with an asset id'
        using errcode = '42501';
    end if;
    new.validated_at := coalesce(new.validated_at, now());
    -- Retention: invalid media is deleted IMMEDIATELY (no grace period). The
    -- row survives as an audit record with validation_failure_reason.
    if new.validation_status = 'invalid' then
      new.media_purge_after := now();
    end if;
  end if;

  if new.moderation_status is distinct from old.moderation_status then
    -- A submission enters moderation only once it is genuinely eligible.
    -- A provider failure therefore can never reach the queue: it ends as
    -- validation_status='invalid', which fails this gate.
    -- Provider/media-type aware. Common evidence for every media type, plus
    -- the trusted metadata Stream documents for video. Images is deliberately
    -- NOT required to carry size/MIME/dimensions, which its documented
    -- image-details response does not expose.
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

    -- Provider completion is NOT publication: a delivery rendition must be
    -- ready before anything can be approved.
    if new.moderation_status = 'approved' and new.delivery_ready_at is null then
      raise exception 'a submission cannot be approved before a trusted delivery rendition is ready'
        using errcode = '42501';
    end if;

    -- Review provenance is recorded by the database, never supplied by a
    -- caller, so it cannot be backdated or attributed to someone else.
    new.reviewed_at := now();
    new.reviewed_by := auth.uid();
    if new.moderation_status = 'approved' then new.published_at := now(); end if;
    if new.moderation_status = 'rejected' then
      -- Approved retention policy: rejected media is retained privately for 30
      -- days, then deleted at the provider by the sweeper. The row is retained
      -- as an audit record with its media purged.
      new.media_purge_after := now() + interval '30 days';
    end if;
    if new.moderation_status = 'removed' then
      new.removed_at        := now();
      new.published_at      := null;   -- unpublish immediately
      new.media_purge_after := now() + interval '30 days';
    end if;
  end if;

  return new;
end;
$$;

revoke execute on function public.protect_testimonial_update()
  from public, anon, authenticated;

create trigger testimonial_submissions_00_protect_update
  before update on public.testimonial_submissions
  for each row execute function public.protect_testimonial_update();

-- ---------------------------------------------------------------------------
-- 6. Deletion protection
-- ---------------------------------------------------------------------------
-- Deleting a client, experience or enrollment cascades here. Referential
-- cascades bypass table privileges and RLS but ordinary row triggers still
-- fire, so the administrative tiers below keep authorized parent deletions
-- working. They do not re-open browser deletion: DELETE is revoked from anon
-- and authenticated, so PostgreSQL rejects a direct statement on privileges
-- before this trigger is consulted.
create or replace function public.protect_testimonial_deletion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() = 'service_role' or auth.role() is null then
    return old;
  end if;
  if public.is_platform_admin() or public.can_edit_client(old.client_id) then
    return old;
  end if;
  raise exception 'testimonial submissions cannot be deleted through an end-user request'
    using errcode = '42501';
end;
$$;

revoke execute on function public.protect_testimonial_deletion()
  from public, anon, authenticated;

create trigger testimonial_submissions_00_protect_deletion
  before delete on public.testimonial_submissions
  for each row execute function public.protect_testimonial_deletion();

-- ---------------------------------------------------------------------------
-- 7. Row level security
-- ---------------------------------------------------------------------------
-- NOTE: browser roles hold no SELECT/UPDATE/DELETE privilege on this table
-- (section 8), so these policies do not currently evaluate for them. They are
-- retained deliberately as defence in depth: if a privilege is ever granted by
-- drift or by a future migration, RLS still constrains the rows.
--
-- There is deliberately NO public "approved" SELECT policy. A row-level policy
-- cannot hide columns, so it would have exposed submitter identifiers, consent
-- records, reviewer identity, provider references and internal notes. The
-- gallery reads the sanitized view in section 9 instead.
alter table public.testimonial_submissions enable row level security;

create policy testimonial_submissions_insert_own on public.testimonial_submissions
  for insert with check (
    exists (
      select 1 from public.experience_users u
      where u.id = testimonial_submissions.experience_user_id
        and u.auth_user_id = auth.uid()
    )
    and exists (
      select 1 from public.experiences e
      where e.id = testimonial_submissions.experience_id
        and e.publication_status = 'published'
    )
  );

create policy testimonial_submissions_select_own on public.testimonial_submissions
  for select using (
    exists (
      select 1 from public.experience_users u
      where u.id = testimonial_submissions.experience_user_id
        and u.auth_user_id = auth.uid()
    )
  );

create policy testimonial_submissions_select_moderators on public.testimonial_submissions
  for select using (
    public.can_view_experience_user_pii(client_id) or public.is_platform_admin()
  );

create policy testimonial_submissions_update_own_caption on public.testimonial_submissions
  for update using (
    exists (
      select 1 from public.experience_users u
      where u.id = testimonial_submissions.experience_user_id
        and u.auth_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.experience_users u
      where u.id = testimonial_submissions.experience_user_id
        and u.auth_user_id = auth.uid()
    )
  );

-- Deliberately no DELETE policy.

-- ---------------------------------------------------------------------------
-- 8. Privileges
-- ---------------------------------------------------------------------------
-- anon gets nothing at all on the raw table. authenticated may INSERT an upload
-- intent and UPDATE only `caption`; it may not SELECT the raw table, so no
-- browser can read provider references, consent records, reviewer identity,
-- internal notes or trusted metadata even for its own row. Own-status and
-- moderation reads go through the views in section 9 and through server code.
revoke all on public.testimonial_submissions from anon;
revoke select, update, delete on public.testimonial_submissions from authenticated;

grant insert on public.testimonial_submissions to authenticated;
grant update (caption) on public.testimonial_submissions to authenticated;

-- ---------------------------------------------------------------------------
-- 9. Sanitized read boundaries
-- ---------------------------------------------------------------------------
-- Views run with the view owner's rights (security_invoker = false), so the
-- WHERE clause and the column list — not RLS — are the boundary. Each view's
-- SELECT list is the explicit contract for what may leave the database.

-- PUBLIC GALLERY. No submitter identifier, no consent record, no reviewer
-- identity, no moderation note, no rejection reason, no internal validation
-- metadata. The provider ids it does expose are opaque handles that are NOT
-- playable on their own: the provider requires signed access, and the
-- application mints a short-lived token only after this view has already
-- confirmed gallery eligibility.
create view public.testimonial_gallery_items
with (security_invoker = false) as
  select
    s.id                   as submission_id,
    s.experience_id,
    s.media_type,
    s.provider             as delivery_provider,
    s.provider_delivery_id,
    s.provider_poster_id,
    s.caption,
    s.published_at,
    s.validated_width       as width,
    s.validated_height      as height,
    s.validated_duration_seconds as duration_seconds
  from public.testimonial_submissions s
  where s.moderation_status = 'approved'
    and s.validation_status = 'valid'
    and s.upload_status     = 'uploaded'
    and s.published_at is not null
    and s.delivery_ready_at is not null
    and s.provider_delivery_id is not null
    and s.provider_draft_cleared_at is not null
    and s.provider_signed_urls_required
    and s.media_deleted_at is null
    -- Provider/media-type aware: a video must carry the trusted metadata the
    -- provider documents; an image is not held to fields Images never exposes.
    and (s.media_type = 'image'
         or (s.validated_duration_seconds is not null
             and s.validated_width is not null
             and s.validated_height is not null));

comment on view public.testimonial_gallery_items is
  'The ONLY testimonial surface a browser may read. Approved, trusted-valid, published items with a ready delivery rendition. Deliberately excludes auth_user_id, experience_user_id, consent_version/consented_at, reviewed_by, moderation_note, rejection_reason and all internal validation fields. provider_delivery_id/provider_poster_id are OPAQUE HANDLES, never URLs or tokens — the application exchanges them for a short-lived signed delivery token server-side, and only after eligibility is confirmed here.';

grant select on public.testimonial_gallery_items to anon, authenticated;

-- SUBMITTER SELF-STATUS. Lets the capture flow honestly say "in review" without
-- exposing internal fields. rejection_reason is included (it is written for the
-- submitter); moderation_note is not (it is internal).
create view public.testimonial_my_submissions
with (security_invoker = false) as
  select
    s.id as submission_id,
    s.media_type,
    s.upload_status,
    s.validation_status,
    s.moderation_status,
    s.caption,
    s.rejection_reason,
    s.submitted_at,
    s.published_at
  from public.testimonial_submissions s
  join public.experience_users u on u.id = s.experience_user_id
  where u.auth_user_id = auth.uid();

grant select on public.testimonial_my_submissions to authenticated;

-- MODERATION QUEUE. Only trusted-valid, fully-uploaded submissions appear, so
-- an unverified provider asset is never surfaced for inline rendering in a
-- moderator's browser. Not granted to any browser role: the admin surface reads
-- it server-side after checking the caller's membership.
create view public.testimonial_moderation_queue
with (security_invoker = false) as
  select
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
    s.published_at
  from public.testimonial_submissions s
  where s.upload_status = 'uploaded'
    and s.validation_status = 'valid'
    and s.media_deleted_at is null;

comment on view public.testimonial_moderation_queue is
  'Moderation queue — trusted-valid submissions only. Invalid, incomplete, failed and abandoned submissions are deliberately excluded so unverified media is never rendered inline in a moderator browser; those belong in an administrative diagnostics surface that displays metadata only.';

-- ---------------------------------------------------------------------------
-- 10. Provider event ledger — replay protection and idempotency
-- ---------------------------------------------------------------------------
-- ONLY VERIFIED EVENTS EVER REACH THIS TABLE. The handler's required order is:
--   1. read the raw body under a strict size limit
--   2. parse the timestamped signature header
--   3. reject stale timestamps
--   4. verify the signature with a constant-time comparison
--   5. on failure -> return an error, writing NOTHING to the database
--   6. only then parse the JSON
--   7. validate its schema
--   8. insert the verified event here
--   9. apply the permitted lifecycle transition transactionally
-- `signature_verified_at` is NOT NULL precisely so an unverified event cannot be
-- represented at all — this is what stops an unauthenticated attacker filling
-- the ledger.
--
-- The full raw payload is deliberately NOT stored: no documented requirement
-- needs it, and retaining provider data we do not need is avoidable exposure.
-- A SHA-256 hash of the verified raw body is kept instead, which is enough to
-- correlate an incident with provider-side logs.
--
-- unique (provider, provider_event_id) is the replay-protection mechanism: a
-- redelivered event conflicts, and the handler treats that conflict as an
-- idempotent no-op rather than re-driving a transition.
--
-- No browser role has ANY privilege here. Only the verified webhook handler and
-- the trusted finalize/reconcile jobs, running as service_role, write to it.
create table public.testimonial_processing_events (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid references public.testimonial_submissions (id) on delete cascade,
  provider          text not null,
  provider_event_id text not null,
  event_type        text not null,
  provider_asset_id text,
  payload_hash      text not null,   -- sha256 hex of the VERIFIED raw body
  signature_verified_at timestamptz not null,
  applied    boolean not null default false,
  applied_at timestamptz,
  error_code text,
  received_at timestamptz not null default now(),
  constraint testimonial_processing_event_unique unique (provider, provider_event_id),
  constraint testimonial_processing_payload_hash_shape
    check (payload_hash ~ '^[0-9a-f]{64}$')
);

comment on table public.testimonial_processing_events is
  'Append-only ledger of VERIFIED media-processing callbacks and finalize checks. signature_verified_at is NOT NULL, so an unverified or stale-signed event cannot be recorded at all and cannot be used to fill the ledger. Stores a SHA-256 payload hash, never the raw payload, and never a secret, URL or token. unique(provider, provider_event_id) makes a replay an idempotent no-op. Written only under service_role.';

create index testimonial_processing_events_submission_idx
  on public.testimonial_processing_events (submission_id, received_at desc);

alter table public.testimonial_processing_events enable row level security;
-- Deliberately NO policies: with RLS enabled and no policy, every non-bypassing
-- role is denied. service_role bypasses RLS; browser roles get nothing.
revoke all on public.testimonial_processing_events from anon, authenticated;

-- ---------------------------------------------------------------------------
-- NO STORAGE BUCKET AND NO STORAGE POLICIES ARE CREATED BY THIS MIGRATION.
-- Media never enters Supabase Storage: the phone uploads directly to the
-- processing provider using a one-time, signed-access-required upload URL, and
-- the provider is the quarantine, processing and delivery system throughout.
-- The existing platform-media bucket is untouched.
-- ---------------------------------------------------------------------------
