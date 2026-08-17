-- Moderation provenance — a narrowly scoped, authenticated SECURITY DEFINER RPC.
--
-- WHAT WAS WRONG
--   20260817160000 revoked browser UPDATE on testimonial_submissions, so
--   moderation could only run as service_role. But the lifecycle trigger sets
--   `reviewed_by := auth.uid()`, and auth.uid() is NULL for a service_role or
--   ambient connection. Every server-mediated moderation decision would
--   therefore have recorded a NULL reviewer — review provenance silently lost.
--
-- WHY NOT JUST LET THE SERVER SUPPLY A REVIEWER
--   Because a caller-supplied reviewer is an unverifiable claim. The fix keeps
--   `reviewed_by := auth.uid()` as the ONLY way that column is ever written,
--   and instead makes the real administrator's JWT the calling context. The
--   function is SECURITY DEFINER for PRIVILEGE (so it can write columns the
--   browser role cannot), but auth.uid()/auth.role() still read the caller's
--   own JWT — SECURITY DEFINER changes the executing role, not the request
--   context. So the administrator is recorded because they are genuinely
--   authenticated, not because anyone asserted it.
--
-- CONSEQUENCE FOR THE TRIGGER
--   Inside this RPC auth.role() is 'authenticated' — neither 'service_role'
--   nor NULL — so protect_testimonial_update()'s trusted branch does not
--   apply, and it would refuse the moderation write. The function is therefore
--   superseded below with CREATE OR REPLACE to add a MODERATOR tier. This is
--   the pattern already established by
--   20260804210404_fix_role_promotion_ambient_connection.sql: the earlier
--   migration is left exactly as applied and is superseded at runtime, never
--   edited in place.
--
--   The moderator tier does not re-open direct browser moderation: after
--   20260817193000, `authenticated` holds no UPDATE privilege on any moderation
--   column, so a direct statement fails on privileges before the trigger is
--   ever consulted. This RPC is the only path that reaches it.

-- ---------------------------------------------------------------------------
-- 1. Supersede the update guard: add a moderator tier
-- ---------------------------------------------------------------------------
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
-- 2. The moderation RPC
-- ---------------------------------------------------------------------------
create or replace function public.moderate_testimonial_submission(
  p_submission_id    uuid,
  p_decision         public.testimonial_moderation_status,
  p_moderation_note  text default null,
  p_rejection_reason text default null
)
returns table (
  submission_id     uuid,
  moderation_status public.testimonial_moderation_status,
  reviewed_at       timestamptz,
  published_at      timestamptz
)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_client_id    uuid;
  v_is_anonymous boolean;
begin
  -- A real signed-in identity is required. SECURITY DEFINER changes the
  -- executing role, not the request context, so auth.uid() here is still the
  -- caller's own.
  if auth.uid() is null then
    raise exception 'moderation requires an authenticated administrator'
      using errcode = '42501';
  end if;

  -- Anonymous Supabase identities (every Kameleon visitor) are never
  -- moderators, even though they also hold the `authenticated` role.
  select coalesce(u.is_anonymous, false) into v_is_anonymous
    from auth.users u where u.id = auth.uid();
  if coalesce(v_is_anonymous, true) then
    raise exception 'anonymous identities cannot moderate'
      using errcode = '42501';
  end if;

  -- Only decisions this RPC exists to make. `pending` is not a decision and is
  -- rejected here as well as by the lifecycle machine.
  if p_decision is null or p_decision not in ('approved', 'rejected', 'removed') then
    raise exception 'unsupported moderation decision'
      using errcode = '22023';
  end if;

  -- The tenant is resolved internally from the submission. The caller never
  -- supplies client_id, experience_id, submitter or provider values.
  select s.client_id into v_client_id
    from public.testimonial_submissions s
   where s.id = p_submission_id;

  -- Same error for "absent" and "not yours", so the RPC cannot be used to
  -- probe which submission ids exist.
  if v_client_id is null
     or not (public.can_view_experience_user_pii(v_client_id) or public.is_platform_admin())
  then
    raise exception 'not authorized to moderate this submission'
      using errcode = '42501';
  end if;

  -- Exactly one row, exactly three writable fields. Legal transitions,
  -- eligibility, reviewed_at, reviewed_by, published_at, removed_at and
  -- media_purge_after are all left to the existing lifecycle trigger.
  return query
  update public.testimonial_submissions s
     set moderation_status = p_decision,
         moderation_note   = coalesce(p_moderation_note,  s.moderation_note),
         rejection_reason  = coalesce(p_rejection_reason, s.rejection_reason)
   where s.id = p_submission_id
  returning s.id, s.moderation_status, s.reviewed_at, s.published_at;
end;
$$;

comment on function public.moderate_testimonial_submission(uuid, public.testimonial_moderation_status, text, text) is
  'The only path by which a moderation decision may be recorded. SECURITY DEFINER for privilege only — auth.uid() remains the calling administrator, so reviewed_by records the real reviewer and can never be supplied by a caller. Requires a non-anonymous identity with owner/admin authority over the submission tenant (can_view_experience_user_pii), so editors and viewers are excluded. Accepts approved/rejected/removed only, resolves the tenant internally, writes exactly three fields, and returns a minimal sanitized result with no provider identifiers or contact data.';

-- Execution privileges: browsers may call it, but only a real owner/admin gets
-- past the checks inside. anon is excluded outright.
revoke all on function public.moderate_testimonial_submission(uuid, public.testimonial_moderation_status, text, text)
  from public, anon;
grant execute on function public.moderate_testimonial_submission(uuid, public.testimonial_moderation_status, text, text)
  to authenticated;
