-- Additive migration — add moderation-safe review fields to
-- public.testimonial_moderation_queue.
--
-- WHY
--   The Phase 3 moderation dashboard needs to show a reviewer WHY a
--   submission is in front of them and whether it is ready to act on:
--   the consent the visitor gave, the attestations they made, and the
--   lifecycle state that explains delivery readiness. None of those were
--   selectable from the view as first written in 20260817160000, so the
--   dashboard could not display them without reaching past the view to the
--   base table — which is exactly the boundary the view exists to hold.
--
-- APPROACH
--   CREATE OR REPLACE VIEW, appending columns at the end. Replace rather
--   than drop-and-create for two reasons: the existing column list, order
--   and types are preserved unchanged (a REPLACE that altered them would be
--   rejected outright, which is a useful guard), and REPLACE keeps the
--   object's ownership and ACL, so Supabase's default privileges for new
--   public-schema objects are never re-applied. The applied migration
--   20260817160000 is not edited.
--
-- WHAT IS DELIBERATELY NOT ADDED
--   No visitor name, email, phone, auth_user_id or experience_user_id. No
--   provider upload URL, signed delivery URL, webhook payload, signature or
--   secret. No raw provider metadata. A moderator decides on the media and
--   the consent that accompanies it, and needs none of that to do it.
--
--   The provider handles already present (provider, provider_delivery_id,
--   provider_poster_id) are retained unchanged: the server loader exchanges
--   them for short-lived signed URLs. They are stripped before anything
--   reaches a browser.
--
-- UNCHANGED
--   The moderation-eligibility WHERE clause, security_invoker = false, and
--   the fact that NO browser role holds any privilege on this view.

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
    s.attested_subjects_consented
  from public.testimonial_submissions s
  where s.upload_status = 'uploaded'::public.testimonial_upload_status
    and s.validation_status = 'valid'::public.testimonial_validation_status
    and s.media_deleted_at is null;

-- Defensive. CREATE OR REPLACE preserves the existing ACL, so no browser
-- grant should have appeared — this makes that a guarantee rather than an
-- assumption, and mirrors 20260817193000.
revoke all on public.testimonial_moderation_queue from public, anon, authenticated;

comment on view public.testimonial_moderation_queue is
  'Moderation queue - trusted-valid, uploaded, not-yet-purged submissions. NO browser role holds any privilege on this view: it is read server-side under service_role after verifying owner/admin membership, and mapped into a sanitized DTO before anything reaches a Client Component. Carries consent, attestation and lifecycle state so a reviewer can see why an item is actionable. Deliberately excludes auth_user_id, experience_user_id, visitor name/email/phone, provider upload identifiers, signed URLs, webhook payloads and signatures.';
