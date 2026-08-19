-- ===========================================================================
-- Video poster readiness.
--
-- THE GAP
--   poster_ready_at and provider_poster_id have existed since the first
--   testimonial migration and are written by NOTHING. The moderation card
--   renders posterReady from the first of them, so every video has reported
--   "no poster" since the queue was built - a display that has never once
--   been true.
--
-- WHY THE VALUE IS THE VIDEO'S OWN UID
--   Cloudflare Stream does not mint a separate poster asset. The thumbnail is
--   an endpoint ON the video, addressed by the same uid, and it was VERIFIED
--   on 19 August 2026 to honour the playback token: unsigned returned 401 and
--   signed returned 200. So the poster is exactly as private as playback, and
--   signStreamPoster() already derives it from the delivery id. Recording the
--   uid here makes the column agree with what the code already does rather
--   than introducing a second source of truth.
--
-- IMAGES GET NULL, DELIBERATELY
--   An image IS its own poster. Writing the image id into a poster column
--   would invent a rendition Cloudflare Images does not document, and the
--   Gallery would then hold two handles for one asset.
--
-- SCOPE
--   Supersedes exactly one function, adding two lines to one UPDATE.
--   Reproduced from the applied source by mechanical extraction and verified
--   by reversal: dropping the inserted lines reproduces the applied text byte
--   for byte. Signature, return type, SECURITY DEFINER, pinned search_path,
--   authorization, locking, every guard and every error code are unchanged.
--   No lifecycle decision depends on either column - approval requires
--   delivery_ready_at, not poster_ready_at - so this changes what a reviewer
--   is TOLD, not what the database permits.
-- ===========================================================================
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
      provider_poster_id            = case when v_row.provider = 'cloudflare_stream' then v_row.provider_asset_id else null end,
      poster_ready_at               = case when v_row.provider = 'cloudflare_stream' then now() else null end,
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
