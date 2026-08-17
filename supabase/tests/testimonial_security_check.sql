-- ============================================================================
-- Kameleon testimonials — direct-to-provider lifecycle, read boundaries and
-- moderation authorization.
--
-- Verification gate for
-- supabase/migrations/20260817160000_testimonial_submissions.sql.
--
-- HOW TO RUN
--   Paste the whole file into a NEW Supabase SQL Editor query and run it.
--   One transaction, ending in ROLLBACK — no fixture survives.
--   Results appear as RAISE NOTICE lines and as a grid from the SELECT just
--   before the ROLLBACK. If no grid appears, run up to and including that
--   SELECT, read it, then run ROLLBACK on its own.
--
-- SAFETY
--   Only fixture rows under fixed 0000...-prefixed UUIDs are touched. No
--   credential, key, token, upload URL or signed URL appears anywhere.
--
-- ENVIRONMENT NOTE
--   The auth.users fixture insert is the part most likely to need adjustment —
--   auth.users' NOT NULL columns vary by GoTrue version.
-- ============================================================================

begin;

create temporary table _ts_check_results (
  seq        serial primary key,
  section    text not null,
  check_name text not null,
  expected   text not null,
  actual     text not null,
  passed     boolean not null
) on commit drop;

-- Narrow SECURITY DEFINER: the sections below switch to authenticated/anon so
-- privileges and RLS are genuinely enforced, and those roles hold no INSERT on
-- this ambient-owned temp table. Only the bookkeeping is elevated, and only
-- after the tested statement has run. The collector is referenced as
-- pg_temp._ts_check_results explicitly — an unqualified name does not reliably
-- resolve inside a SECURITY DEFINER function's restricted context.
create or replace function pg_temp.record(
  p_section text, p_check text, p_expected text, p_actual text
) returns void
language plpgsql
security definer
set search_path = pg_temp, pg_catalog
as $$
begin
  insert into pg_temp._ts_check_results (section, check_name, expected, actual, passed)
  values (p_section, p_check, p_expected, p_actual, p_expected is not distinct from p_actual);
  raise notice '[%] % | expected=% actual=% | %',
    p_section, p_check, p_expected, p_actual,
    case when p_expected is not distinct from p_actual then 'PASS' else 'FAIL' end;
end $$;

create or replace function pg_temp.act_as(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user::text, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  execute 'set local role authenticated';
end $$;

create or replace function pg_temp.act_as_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('role','anon')::text, true);
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.role', 'anon', true);
  execute 'set local role anon';
end $$;

create or replace function pg_temp.act_as_ambient() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.role', '', true);
end $$;

-- DELIBERATELY SECURITY INVOKER: it EXECUTEs the statement under test, so
-- making it DEFINER would run every tested statement as the owner, bypassing
-- privileges, RLS and the protection triggers, and every check below would pass
-- for the wrong reason.
create or replace function pg_temp.try_sql(p_section text, p_label text, p_expected text, p_sql text)
returns void language plpgsql as $$
declare outcome text;
begin
  begin
    execute p_sql;
    outcome := 'ALLOWED';
  exception
    when sqlstate '42501' then outcome := 'blocked-42501';
    when sqlstate 'P0001' then outcome := 'blocked-P0001';
    when sqlstate '23514' then outcome := 'blocked-23514';
    when sqlstate '23505' then outcome := 'blocked-23505';
    when others then outcome := 'other-error:' || sqlstate;
  end;
  perform pg_temp.record(p_section, p_label, p_expected, outcome);
end $$;

-- ----------------------------------------------------------------------------
-- Section 1 — Fixtures
-- ----------------------------------------------------------------------------
--   ...0000a1 submitter · a2 second submitter · a3 tenant-A OWNER (moderator)
--   ...0000a4 editor · a5 viewer · b1 tenant-B owner
--   ...00c0a0/00c0b0 clients · 00e0a0/00e0b0 published experiences
--   ...00d0a1/00d0a2 enrollments · 00f0a1..f0a5 submissions

insert into auth.users
  (id, instance_id, aud, role, email, encrypted_password,
   email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
values
  ('00000000-0000-4000-8000-0000000000a1','00000000-0000-0000-0000-000000000000','authenticated','authenticated','ts-a1@example.com','', now(), now(), now(), '{}', '{}'),
  ('00000000-0000-4000-8000-0000000000a2','00000000-0000-0000-0000-000000000000','authenticated','authenticated','ts-a2@example.com','', now(), now(), now(), '{}', '{}'),
  ('00000000-0000-4000-8000-0000000000a3','00000000-0000-0000-0000-000000000000','authenticated','authenticated','ts-a3@example.com','', now(), now(), now(), '{}', '{}'),
  ('00000000-0000-4000-8000-0000000000a4','00000000-0000-0000-0000-000000000000','authenticated','authenticated','ts-a4@example.com','', now(), now(), now(), '{}', '{}'),
  ('00000000-0000-4000-8000-0000000000a5','00000000-0000-0000-0000-000000000000','authenticated','authenticated','ts-a5@example.com','', now(), now(), now(), '{}', '{}'),
  ('00000000-0000-4000-8000-0000000000b1','00000000-0000-0000-0000-000000000000','authenticated','authenticated','ts-b1@example.com','', now(), now(), now(), '{}', '{}');

insert into public.clients (id, slug, name, status) values
  ('00000000-0000-4000-8000-00000000c0a0','ts-fixture-tenant-a','TS Fixture Tenant A','active'),
  ('00000000-0000-4000-8000-00000000c0b0','ts-fixture-tenant-b','TS Fixture Tenant B','active');

insert into public.experiences (id, client_id, slug, name, publication_status) values
  ('00000000-0000-4000-8000-00000000e0a0','00000000-0000-4000-8000-00000000c0a0','ts-exp-a','TS Experience A','published'),
  ('00000000-0000-4000-8000-00000000e0b0','00000000-0000-4000-8000-00000000c0b0','ts-exp-b','TS Experience B','published');

insert into public.client_memberships (client_id, user_id, role) values
  ('00000000-0000-4000-8000-00000000c0a0','00000000-0000-4000-8000-0000000000a3','owner'),
  ('00000000-0000-4000-8000-00000000c0a0','00000000-0000-4000-8000-0000000000a4','editor'),
  ('00000000-0000-4000-8000-00000000c0a0','00000000-0000-4000-8000-0000000000a5','viewer'),
  ('00000000-0000-4000-8000-00000000c0b0','00000000-0000-4000-8000-0000000000b1','owner');

insert into public.experience_users (id, experience_id, client_id, auth_user_id, display_name) values
  ('00000000-0000-4000-8000-00000000d0a1','00000000-0000-4000-8000-00000000e0a0','00000000-0000-4000-8000-00000000c0a0','00000000-0000-4000-8000-0000000000a1','TS Submitter'),
  ('00000000-0000-4000-8000-00000000d0a2','00000000-0000-4000-8000-00000000e0a0','00000000-0000-4000-8000-00000000c0a0','00000000-0000-4000-8000-0000000000a2','TS Other');

-- Fixture states, built ambiently (auth.role() is null -> trusted tier):
--   f0a1 initiated/pending            — a bare upload intent, no provider asset
--   f0a2 uploaded/pending             — provider holds an asset, NOT yet validated
--   f0a3 uploaded/valid, no delivery  — validated but not delivery-ready
--   f0a4 uploaded/valid + delivery    — will be approved below
--   f0a5 uploaded/invalid             — a provider failure; must never be public
-- NOTE the image rows carry NO detected_mime_type, validated_size_bytes,
-- width or height. That is the point: Cloudflare Images does not document
-- those, and requiring them would force inventing values from browser-reported
-- data. Only the video rows carry trusted metadata.
insert into public.testimonial_submissions
  (id, client_id, experience_id, experience_user_id, auth_user_id, media_type,
   client_submission_key, upload_status, validation_status,
   provider, provider_asset_id, provider_delivery_id, provider_poster_id,
   provider_draft_cleared_at, provider_signed_urls_required,
   detected_mime_type, validated_size_bytes, validated_width, validated_height,
   validated_duration_seconds, delivery_ready_at,
   caption, consent_version, consented_at, submitted_at,
   attested_no_minors, attested_subjects_consented)
values
  -- f0a1 intent: no provider asset at all
  ('00000000-0000-4000-8000-00000000f0a1','00000000-0000-4000-8000-00000000c0a0','00000000-0000-4000-8000-00000000e0a0','00000000-0000-4000-8000-00000000d0a1','00000000-0000-4000-8000-0000000000a1','video','key-intent','initiated','pending', null, null, null, null, null, false, null, null, null, null, null, null, 'intent caption','ts-consent-fixture', now(), now(), true, true),
  -- f0a2 provider holds the asset but it is NOT yet validated
  ('00000000-0000-4000-8000-00000000f0a2','00000000-0000-4000-8000-00000000c0a0','00000000-0000-4000-8000-00000000e0a0','00000000-0000-4000-8000-00000000d0a1','00000000-0000-4000-8000-0000000000a1','video','key-unvalidated','uploaded','pending','fixture-provider','asset-unvalidated', null, null, null, false, null, null, null, null, null, null, 'unvalidated caption','ts-consent-fixture', now(), now(), true, true),
  -- f0a3 IMAGE, valid on image evidence alone, no delivery yet
  ('00000000-0000-4000-8000-00000000f0a3','00000000-0000-4000-8000-00000000c0a0','00000000-0000-4000-8000-00000000e0a0','00000000-0000-4000-8000-00000000d0a1','00000000-0000-4000-8000-0000000000a1','image','key-valid','uploaded','valid','fixture-provider','asset-valid', null, null, now(), true, null, null, null, null, null, null, 'valid caption','ts-consent-fixture', now(), now(), true, true),
  -- f0a4 IMAGE, valid + delivery ready -> approved below
  ('00000000-0000-4000-8000-00000000f0a4','00000000-0000-4000-8000-00000000c0a0','00000000-0000-4000-8000-00000000e0a0','00000000-0000-4000-8000-00000000d0a2','00000000-0000-4000-8000-0000000000a2','image','key-approved','uploaded','valid','fixture-provider','asset-approved','delivery-approved','poster-approved', now(), true, null, null, null, null, null, now(), 'approved caption','ts-consent-fixture', now(), now(), true, true),
  -- f0a5 provider FAILURE
  ('00000000-0000-4000-8000-00000000f0a5','00000000-0000-4000-8000-00000000c0a0','00000000-0000-4000-8000-00000000e0a0','00000000-0000-4000-8000-00000000d0a1','00000000-0000-4000-8000-0000000000a1','video','key-invalid','uploaded','invalid','fixture-provider','asset-invalid', null, null, null, false, null, null, null, null, null, null, 'invalid caption','ts-consent-fixture', now(), now(), true, true),
  -- f0a6 VIDEO awaiting validation, used to prove video needs trusted metadata
  ('00000000-0000-4000-8000-00000000f0a6','00000000-0000-4000-8000-00000000c0a0','00000000-0000-4000-8000-00000000e0a0','00000000-0000-4000-8000-00000000d0a2','00000000-0000-4000-8000-0000000000a2','video','key-video','uploaded','pending','fixture-provider','asset-video', null, null, null, false, null, null, null, null, null, null, 'video caption','ts-consent-fixture', now(), now(), true, true);

-- Promote f0a4 through the real trigger path so published_at is set by the
-- database rather than by the fixture.
update public.testimonial_submissions
   set moderation_status = 'approved'
 where id = '00000000-0000-4000-8000-00000000f0a4';

-- ----------------------------------------------------------------------------
-- Section 2 — Fixture UUID validity
-- ----------------------------------------------------------------------------
do $$
declare ids text[] := array[
  '00000000-0000-4000-8000-0000000000a1','00000000-0000-4000-8000-0000000000a2',
  '00000000-0000-4000-8000-0000000000a3','00000000-0000-4000-8000-0000000000a4',
  '00000000-0000-4000-8000-0000000000a5','00000000-0000-4000-8000-0000000000b1',
  '00000000-0000-4000-8000-00000000c0a0','00000000-0000-4000-8000-00000000c0b0',
  '00000000-0000-4000-8000-00000000e0a0','00000000-0000-4000-8000-00000000e0b0',
  '00000000-0000-4000-8000-00000000d0a1','00000000-0000-4000-8000-00000000d0a2',
  '00000000-0000-4000-8000-00000000f0a1','00000000-0000-4000-8000-00000000f0a2',
  '00000000-0000-4000-8000-00000000f0a3','00000000-0000-4000-8000-00000000f0a4',
  '00000000-0000-4000-8000-00000000f0a5','00000000-0000-4000-8000-00000000f0a6'];
  bad int := 0; i text;
begin
  foreach i in array ids loop
    begin perform i::uuid; exception when others then bad := bad + 1; end;
  end loop;
  perform pg_temp.record('fixtures','every fixture UUID parses as uuid','0', bad::text);
  perform pg_temp.record('fixtures','fixture UUID count','18', array_length(ids,1)::text);
end $$;

-- ----------------------------------------------------------------------------
-- Section 3 — No Supabase media custody
-- ----------------------------------------------------------------------------
do $$
begin
  perform pg_temp.record('no-supabase-media','no testimonial storage bucket exists','0',
    (select count(*)::text from storage.buckets where id like 'testimonial%'));
  perform pg_temp.record('no-supabase-media','no testimonial storage policies exist','0',
    (select count(*)::text from pg_policies
      where schemaname='storage' and tablename='objects' and policyname like 'testimonial%'));
  perform pg_temp.record('no-supabase-media','no Supabase media path columns remain','0',
    (select count(*)::text from information_schema.columns
      where table_schema='public' and table_name='testimonial_submissions'
        and column_name in ('source_storage_path','delivery_storage_path','poster_storage_path')));
  perform pg_temp.record('no-supabase-media','the existing platform-media bucket is untouched','1',
    (select count(*)::text from storage.buckets where id='platform-media'));

  -- No credential-shaped column may exist anywhere on the table.
  perform pg_temp.record('no-secrets','no token/secret/url column exists','0',
    (select count(*)::text from information_schema.columns
      where table_schema='public' and table_name='testimonial_submissions'
        and (column_name like '%token%' or column_name like '%secret%'
             or column_name like '%_url%' or column_name like '%api_key%')));
end $$;

-- ----------------------------------------------------------------------------
-- Section 4 — Three separate lifecycles
-- ----------------------------------------------------------------------------
do $$
begin
  perform pg_temp.record('lifecycle','upload_status exists','1',
    (select count(*)::text from information_schema.columns where table_schema='public'
      and table_name='testimonial_submissions' and column_name='upload_status'));
  perform pg_temp.record('lifecycle','validation_status exists','1',
    (select count(*)::text from information_schema.columns where table_schema='public'
      and table_name='testimonial_submissions' and column_name='validation_status'));
  perform pg_temp.record('lifecycle','moderation_status exists','1',
    (select count(*)::text from information_schema.columns where table_schema='public'
      and table_name='testimonial_submissions' and column_name='moderation_status'));
  perform pg_temp.record('lifecycle','no overloaded generic status column','0',
    (select count(*)::text from information_schema.columns where table_schema='public'
      and table_name='testimonial_submissions' and column_name='status'));
  perform pg_temp.record('lifecycle','capture-only: no source_type','0',
    (select count(*)::text from information_schema.columns where table_schema='public'
      and table_name='testimonial_submissions' and column_name='source_type'));
  perform pg_temp.record('lifecycle','capture-only: no original_filename','0',
    (select count(*)::text from information_schema.columns where table_schema='public'
      and table_name='testimonial_submissions' and column_name='original_filename'));
  perform pg_temp.record('lifecycle','duplicate-submit constraint exists','1',
    (select count(*)::text from pg_constraint
      where conrelid='public.testimonial_submissions'::regclass
        and conname='testimonial_submission_key_unique'));
  perform pg_temp.record('lifecycle','approved-requires-ready-delivery constraint exists','1',
    (select count(*)::text from pg_constraint
      where conrelid='public.testimonial_submissions'::regclass
        and conname='testimonial_approved_requires_ready_delivery'));
  perform pg_temp.record('lifecycle','attestation constraint exists','1',
    (select count(*)::text from pg_constraint
      where conrelid='public.testimonial_submissions'::regclass
        and conname='testimonial_attestations_required'));
end $$;

-- Duplicate provider asset cannot back two submissions.
select pg_temp.try_sql('lifecycle','one provider asset backs at most one submission','blocked-23505',
  $q$insert into public.testimonial_submissions
       (client_id, experience_id, experience_user_id, media_type, client_submission_key,
        upload_status, validation_status, provider, provider_asset_id,
        consent_version, consented_at, attested_no_minors, attested_subjects_consented)
     values ('00000000-0000-4000-8000-00000000c0a0','00000000-0000-4000-8000-00000000e0a0',
             '00000000-0000-4000-8000-00000000d0a2','image','key-dupe-asset','uploaded','pending',
             'fixture-provider','asset-valid','v', now(), true, true)$q$);

-- ----------------------------------------------------------------------------
-- Section 5 — Public roles cannot reach the raw table
-- ----------------------------------------------------------------------------
do $$
declare c text;
begin
  perform pg_temp.record('read-boundary','anon has NO select on the raw table','false',
    has_table_privilege('anon','public.testimonial_submissions','SELECT')::text);
  perform pg_temp.record('read-boundary','authenticated has NO select on the raw table','false',
    has_table_privilege('authenticated','public.testimonial_submissions','SELECT')::text);
  perform pg_temp.record('read-boundary','anon has NO insert','false',
    has_table_privilege('anon','public.testimonial_submissions','INSERT')::text);
  perform pg_temp.record('read-boundary','authenticated retains insert (upload intent)','true',
    has_table_privilege('authenticated','public.testimonial_submissions','INSERT')::text);
  perform pg_temp.record('read-boundary','authenticated has no DELETE','false',
    has_table_privilege('authenticated','public.testimonial_submissions','DELETE')::text);
  perform pg_temp.record('read-boundary','no public approved-row policy exists','0',
    (select count(*)::text from pg_policies where schemaname='public'
      and tablename='testimonial_submissions' and policyname='testimonial_submissions_select_approved'));
  perform pg_temp.record('read-boundary','authenticated may update caption','true',
    has_column_privilege('authenticated','public.testimonial_submissions','caption','UPDATE')::text);

  foreach c in array array['moderation_status','validation_status','upload_status',
                           'provider','provider_asset_id','provider_delivery_id','provider_poster_id',
                           'provider_processing_status','delivery_ready_at','poster_ready_at',
                           'detected_mime_type','validated_size_bytes','validated_duration_seconds',
                           'reviewed_by','published_at','removed_at','media_purge_after',
                           'client_id','experience_id','experience_user_id','auth_user_id',
                           'consent_version','attested_no_minors']
  loop
    perform pg_temp.record('read-boundary','authenticated may NOT update ' || c, 'false',
      has_column_privilege('authenticated','public.testimonial_submissions', c, 'UPDATE')::text);
  end loop;
end $$;

do $$
begin
  perform pg_temp.act_as_anon();
  perform pg_temp.try_sql('read-boundary','anon cannot select the raw table','blocked-42501',
    $q$select count(*) from public.testimonial_submissions$q$);
  perform pg_temp.act_as_ambient();
  perform pg_temp.act_as('00000000-0000-4000-8000-0000000000a1');
  perform pg_temp.try_sql('read-boundary','submitter cannot select the raw table','blocked-42501',
    $q$select count(*) from public.testimonial_submissions$q$);
  perform pg_temp.act_as_ambient();
end $$;
select pg_temp.act_as_ambient();

-- ----------------------------------------------------------------------------
-- Section 6 — Gallery view exposes only sanitized fields
-- ----------------------------------------------------------------------------
do $$
declare leaked text;
begin
  perform pg_temp.record('gallery-shape','gallery view exists','1',
    (select count(*)::text from information_schema.views
      where table_schema='public' and table_name='testimonial_gallery_items'));

  select string_agg(column_name, ',') into leaked
    from information_schema.columns
   where table_schema='public' and table_name='testimonial_gallery_items'
     and column_name in ('auth_user_id','experience_user_id','consent_version','consented_at',
                         'reviewed_by','reviewed_at','moderation_note','rejection_reason',
                         'moderation_status','validation_status','upload_status',
                         'detected_mime_type','validated_size_bytes','validated_codec',
                         'client_id','client_submission_key','provider_asset_id',
                         'provider_upload_id','validation_failure_reason','provider_error_code');
  perform pg_temp.record('gallery-shape','no internal/PII column appears in the gallery view','NONE',
    coalesce(leaked,'NONE'));

  perform pg_temp.record('gallery-shape','gallery view column count','11',
    (select count(*)::text from information_schema.columns
      where table_schema='public' and table_name='testimonial_gallery_items'));
  perform pg_temp.record('gallery-shape','anon may read the gallery view','true',
    has_table_privilege('anon','public.testimonial_gallery_items','SELECT')::text);
end $$;

do $$
declare n int;
begin
  perform pg_temp.act_as_anon();
  select count(*) into n from public.testimonial_gallery_items;
  perform pg_temp.record('gallery','only the gallery-eligible item is listed','1', n::text);
  select count(*) into n from public.testimonial_gallery_items
   where submission_id in ('00000000-0000-4000-8000-00000000f0a1','00000000-0000-4000-8000-00000000f0a2',
                           '00000000-0000-4000-8000-00000000f0a3','00000000-0000-4000-8000-00000000f0a5');
  perform pg_temp.record('gallery','intent, unvalidated, unapproved and INVALID items are all absent','0', n::text);
  perform pg_temp.act_as_ambient();
end $$;
select pg_temp.act_as_ambient();

-- ----------------------------------------------------------------------------
-- Section 7 — A browser cannot forge upload, validation or provider state
-- ----------------------------------------------------------------------------
do $$
begin
  perform pg_temp.act_as('00000000-0000-4000-8000-0000000000a1');
  perform pg_temp.try_sql('self-report','cannot mark own upload complete','blocked-42501',
    $q$update public.testimonial_submissions set upload_status='uploaded' where id='00000000-0000-4000-8000-00000000f0a1'$q$);
  perform pg_temp.try_sql('self-report','cannot self-report validation valid','blocked-42501',
    $q$update public.testimonial_submissions set validation_status='valid' where id='00000000-0000-4000-8000-00000000f0a2'$q$);
  perform pg_temp.try_sql('self-report','cannot set a provider asset id','blocked-42501',
    $q$update public.testimonial_submissions set provider_asset_id='forged' where id='00000000-0000-4000-8000-00000000f0a1'$q$);
  perform pg_temp.try_sql('self-report','cannot set a provider delivery id','blocked-42501',
    $q$update public.testimonial_submissions set provider_delivery_id='forged' where id='00000000-0000-4000-8000-00000000f0a3'$q$);
  perform pg_temp.try_sql('self-report','cannot forge provider processing status','blocked-42501',
    $q$update public.testimonial_submissions set provider_processing_status='ready' where id='00000000-0000-4000-8000-00000000f0a2'$q$);
  perform pg_temp.try_sql('self-report','cannot clear the provider draft flag','blocked-42501',
    $q$update public.testimonial_submissions set provider_draft_cleared_at=now() where id='00000000-0000-4000-8000-00000000f0a2'$q$);
  perform pg_temp.try_sql('self-report','cannot assert signed delivery is required','blocked-42501',
    $q$update public.testimonial_submissions set provider_signed_urls_required=true where id='00000000-0000-4000-8000-00000000f0a2'$q$);
  perform pg_temp.try_sql('self-report','cannot mark delivery ready','blocked-42501',
    $q$update public.testimonial_submissions set delivery_ready_at=now() where id='00000000-0000-4000-8000-00000000f0a3'$q$);
  perform pg_temp.try_sql('self-report','cannot set trusted metadata','blocked-42501',
    $q$update public.testimonial_submissions set detected_mime_type='image/jpeg', validated_size_bytes=1 where id='00000000-0000-4000-8000-00000000f0a2'$q$);
  perform pg_temp.try_sql('self-moderation','cannot approve own submission','blocked-42501',
    $q$update public.testimonial_submissions set moderation_status='approved' where id='00000000-0000-4000-8000-00000000f0a3'$q$);
  perform pg_temp.try_sql('self-moderation','cannot set published_at','blocked-42501',
    $q$update public.testimonial_submissions set published_at=now() where id='00000000-0000-4000-8000-00000000f0a3'$q$);
  perform pg_temp.try_sql('consent','cannot retract the minors attestation','blocked-42501',
    $q$update public.testimonial_submissions set attested_no_minors=false where id='00000000-0000-4000-8000-00000000f0a1'$q$);
  perform pg_temp.try_sql('immutability','cannot change client_id','blocked-42501',
    $q$update public.testimonial_submissions set client_id='00000000-0000-4000-8000-00000000c0b0' where id='00000000-0000-4000-8000-00000000f0a1'$q$);
  perform pg_temp.try_sql('delete','cannot delete own submission','blocked-42501',
    $q$delete from public.testimonial_submissions where id='00000000-0000-4000-8000-00000000f0a1'$q$);
  perform pg_temp.act_as_ambient();
end $$;
select pg_temp.act_as_ambient();

-- Even the trusted tier cannot store a row without both attestations.
select pg_temp.try_sql('consent','a submission without attestations cannot be stored','blocked-23514',
  $q$insert into public.testimonial_submissions
       (client_id, experience_id, experience_user_id, media_type, client_submission_key,
        consent_version, consented_at, attested_no_minors, attested_subjects_consented)
     values ('00000000-0000-4000-8000-00000000c0a0','00000000-0000-4000-8000-00000000e0a0',
             '00000000-0000-4000-8000-00000000d0a1','image','key-no-attest','v', now(), false, true)$q$);

-- ----------------------------------------------------------------------------
-- Section 8 — Eligibility gates hold even for the trusted tier
-- ----------------------------------------------------------------------------
select pg_temp.try_sql('eligibility','an upload INTENT cannot be moderated','blocked-42501',
  $q$update public.testimonial_submissions set moderation_status='approved' where id='00000000-0000-4000-8000-00000000f0a1'$q$);

select pg_temp.try_sql('eligibility','a provider-complete but UNVALIDATED asset is not auto-approved','blocked-42501',
  $q$update public.testimonial_submissions set moderation_status='approved' where id='00000000-0000-4000-8000-00000000f0a2'$q$);

select pg_temp.try_sql('eligibility','a provider FAILURE (invalid) cannot enter moderation','blocked-42501',
  $q$update public.testimonial_submissions set moderation_status='approved' where id='00000000-0000-4000-8000-00000000f0a5'$q$);

select pg_temp.try_sql('eligibility','a valid submission with NO ready delivery cannot publish','blocked-42501',
  $q$update public.testimonial_submissions set moderation_status='approved' where id='00000000-0000-4000-8000-00000000f0a3'$q$);

select pg_temp.try_sql('eligibility','validation cannot be decided before a provider asset exists','blocked-42501',
  $q$update public.testimonial_submissions set validation_status='valid' where id='00000000-0000-4000-8000-00000000f0a1'$q$);

select pg_temp.try_sql('eligibility','a conclusive validation cannot be re-decided','blocked-42501',
  $q$update public.testimonial_submissions set validation_status='valid' where id='00000000-0000-4000-8000-00000000f0a5'$q$);

-- PROVIDER/MEDIA-TYPE AWARE VALIDITY -----------------------------------------
-- An IMAGE becomes valid on image evidence alone (out of draft + signed
-- delivery required). f0a3/f0a4 already proved that by existing at all: the
-- CHECK would have rejected them otherwise.
do $$
begin
  perform pg_temp.record('provider-aware','an IMAGE is valid without size/MIME/dimension fields','valid',
    (select validation_status::text from public.testimonial_submissions
      where id='00000000-0000-4000-8000-00000000f0a3'));
  perform pg_temp.record('provider-aware','...and carries none of them','true',
    (select (detected_mime_type is null and validated_size_bytes is null
             and validated_width is null and validated_height is null)::text
       from public.testimonial_submissions where id='00000000-0000-4000-8000-00000000f0a3'));
end $$;

-- A VIDEO may not become valid without the trusted metadata Stream documents.
select pg_temp.try_sql('provider-aware','a VIDEO cannot become valid without trusted metadata','blocked-23514',
  $q$update public.testimonial_submissions
       set provider_draft_cleared_at = now(), provider_signed_urls_required = true,
           validation_status = 'valid'
     where id='00000000-0000-4000-8000-00000000f0a6'$q$);

select pg_temp.try_sql('provider-aware','a VIDEO with trusted duration/size/dimensions becomes valid','ALLOWED',
  $q$update public.testimonial_submissions
       set provider_draft_cleared_at = now(), provider_signed_urls_required = true,
           validated_duration_seconds = 30, validated_size_bytes = 4000000,
           validated_width = 1080, validated_height = 1920,
           validation_status = 'valid'
     where id='00000000-0000-4000-8000-00000000f0a6'$q$);

select pg_temp.try_sql('eligibility','marking a delivery rendition ready is allowed for the trusted tier','ALLOWED',
  $q$update public.testimonial_submissions
       set provider_delivery_id='delivery-valid', delivery_ready_at = now()
     where id='00000000-0000-4000-8000-00000000f0a3'$q$);
select pg_temp.try_sql('eligibility','...and only then does approval succeed','ALLOWED',
  $q$update public.testimonial_submissions set moderation_status='approved' where id='00000000-0000-4000-8000-00000000f0a3'$q$);

do $$
begin
  perform pg_temp.record('eligibility','published_at set by the database on approval','true',
    (select (published_at is not null)::text from public.testimonial_submissions
      where id='00000000-0000-4000-8000-00000000f0a3'));
end $$;

-- ----------------------------------------------------------------------------
-- Section 9 — Rejection retention and removal
-- ----------------------------------------------------------------------------
select pg_temp.try_sql('retention','pending -> rejected is allowed','ALLOWED',
  $q$update public.testimonial_submissions set moderation_status='rejected' where id='00000000-0000-4000-8000-00000000f0a4'$q$);

do $$
begin
  -- f0a4 was approved in Section 1, so it cannot be rejected: rejected is not
  -- reachable from approved, only removed is.
  perform pg_temp.record('retention','approved cannot be rejected (only removed)','approved',
    (select moderation_status::text from public.testimonial_submissions
      where id='00000000-0000-4000-8000-00000000f0a4'));
end $$;

select pg_temp.try_sql('removal','approved -> removed is allowed','ALLOWED',
  $q$update public.testimonial_submissions set moderation_status='removed' where id='00000000-0000-4000-8000-00000000f0a4'$q$);
select pg_temp.try_sql('removal','removed is terminal','blocked-42501',
  $q$update public.testimonial_submissions set moderation_status='approved' where id='00000000-0000-4000-8000-00000000f0a4'$q$);

do $$
declare n int;
begin
  perform pg_temp.record('removal','published_at cleared on removal','true',
    (select (published_at is null)::text from public.testimonial_submissions
      where id='00000000-0000-4000-8000-00000000f0a4'));
  perform pg_temp.record('retention','removal sets a 30-day purge deadline','true',
    (select (media_purge_after is not null)::text from public.testimonial_submissions
      where id='00000000-0000-4000-8000-00000000f0a4'));

  perform pg_temp.act_as_anon();
  select count(*) into n from public.testimonial_gallery_items
   where submission_id='00000000-0000-4000-8000-00000000f0a4';
  perform pg_temp.record('removal','removed item disappears from the gallery immediately','0', n::text);
  perform pg_temp.act_as_ambient();
end $$;
select pg_temp.act_as_ambient();

-- PHYSICAL DELETION MUST BE RECORDED ON BOTH SIDES ---------------------------
-- Live constraint (verified against the applied schema):
--   CHECK ((media_deleted_at IS NULL) OR (provider_deletion_status IS NOT NULL))
-- i.e. a one-way implication: claiming the media is gone REQUIRES saying what
-- the provider reported. It imposes no value requirement — any non-null status
-- satisfies it, so 'deleted' below is our convention, not something the
-- constraint mandates.
--
-- Half-state: a timestamp with no provider status is rejected.
select pg_temp.try_sql('deletion','a deletion timestamp without a provider status is rejected','blocked-23514',
  $q$update public.testimonial_submissions
       set media_deleted_at = now()
     where id='00000000-0000-4000-8000-00000000f0a3'$q$);

-- The constraint is deliberately ONE-WAY: a provider status without a
-- timestamp is permitted, because a deletion that has been requested but not
-- yet confirmed must be representable. Recorded as an observation, not as an
-- assertion that the schema forbids it.
select pg_temp.try_sql('deletion','a provider status without a timestamp is permitted (in-flight deletion)','ALLOWED',
  $q$update public.testimonial_submissions
       set provider_deletion_status = 'deletion_requested'
     where id='00000000-0000-4000-8000-00000000f0a3'$q$);

-- Reset, then set both atomically — the only way a row may claim its media is
-- physically gone.
update public.testimonial_submissions
   set provider_deletion_status = null
 where id='00000000-0000-4000-8000-00000000f0a3';

select pg_temp.try_sql('deletion','both fields set atomically is accepted','ALLOWED',
  $q$update public.testimonial_submissions
       set provider_deletion_status = 'deleted',
           media_deleted_at = now()
     where id='00000000-0000-4000-8000-00000000f0a3'$q$);

do $$
declare n int;
begin
  perform pg_temp.record('deletion','both deletion fields are recorded','true',
    (select (media_deleted_at is not null and provider_deletion_status is not null)::text
       from public.testimonial_submissions where id='00000000-0000-4000-8000-00000000f0a3'));

  perform pg_temp.act_as_anon();
  select count(*) into n from public.testimonial_gallery_items
   where submission_id='00000000-0000-4000-8000-00000000f0a3';
  perform pg_temp.record('deletion','a purged provider asset cannot appear in the gallery','0', n::text);
  perform pg_temp.act_as_ambient();
end $$;
select pg_temp.act_as_ambient();

-- Only the trusted processing/deletion tier may record physical deletion.
do $$
begin
  perform pg_temp.act_as('00000000-0000-4000-8000-0000000000a1');
  perform pg_temp.try_sql('deletion','a browser role cannot set media_deleted_at','blocked-42501',
    $q$update public.testimonial_submissions set media_deleted_at = now() where id='00000000-0000-4000-8000-00000000f0a2'$q$);
  perform pg_temp.try_sql('deletion','a browser role cannot set provider_deletion_status','blocked-42501',
    $q$update public.testimonial_submissions set provider_deletion_status = 'deleted' where id='00000000-0000-4000-8000-00000000f0a2'$q$);
  perform pg_temp.act_as_ambient();
end $$;
select pg_temp.act_as_ambient();

do $$
begin
  perform pg_temp.record('deletion','authenticated has no UPDATE privilege on media_deleted_at','false',
    has_column_privilege('authenticated','public.testimonial_submissions','media_deleted_at','UPDATE')::text);
  perform pg_temp.record('deletion','authenticated has no UPDATE privilege on provider_deletion_status','false',
    has_column_privilege('authenticated','public.testimonial_submissions','provider_deletion_status','UPDATE')::text);
end $$;

-- ----------------------------------------------------------------------------
-- Section 10 — Moderation queue and administrative access
-- ----------------------------------------------------------------------------
do $$
declare n int;
begin
  perform pg_temp.record('queue','moderation queue view exists','1',
    (select count(*)::text from information_schema.views
      where table_schema='public' and table_name='testimonial_moderation_queue'));
  select count(*) into n from public.testimonial_moderation_queue
   where submission_id in ('00000000-0000-4000-8000-00000000f0a1','00000000-0000-4000-8000-00000000f0a2',
                           '00000000-0000-4000-8000-00000000f0a5');
  perform pg_temp.record('queue','intent, unvalidated and invalid items never enter the queue','0', n::text);
  perform pg_temp.record('queue','queue view is not granted to anon','false',
    has_table_privilege('anon','public.testimonial_moderation_queue','SELECT')::text);
  perform pg_temp.record('queue','queue view is not granted to authenticated','false',
    has_table_privilege('authenticated','public.testimonial_moderation_queue','SELECT')::text);
  perform pg_temp.record('queue','queue exposes no provider upload correlation id','0',
    (select count(*)::text from information_schema.columns
      where table_schema='public' and table_name='testimonial_moderation_queue'
        and column_name='provider_upload_id'));
end $$;

-- ----------------------------------------------------------------------------
-- Section 11 — Webhook replay protection
-- ----------------------------------------------------------------------------
do $$
begin
  perform pg_temp.record('webhook','event ledger table exists','1',
    (select count(*)::text from information_schema.tables
      where table_schema='public' and table_name='testimonial_processing_events'));
  perform pg_temp.record('webhook','replay-protection unique constraint exists','1',
    (select count(*)::text from pg_constraint
      where conrelid='public.testimonial_processing_events'::regclass
        and conname='testimonial_processing_event_unique'));
  perform pg_temp.record('webhook','event ledger has RLS enabled','true',
    (select relrowsecurity::text from pg_class where oid='public.testimonial_processing_events'::regclass));
  perform pg_temp.record('webhook','event ledger has NO policies (deny-all below service_role)','0',
    (select count(*)::text from pg_policies
      where schemaname='public' and tablename='testimonial_processing_events'));
  perform pg_temp.record('webhook','anon cannot read the event ledger','false',
    has_table_privilege('anon','public.testimonial_processing_events','SELECT')::text);
  perform pg_temp.record('webhook','authenticated cannot write the event ledger','false',
    has_table_privilege('authenticated','public.testimonial_processing_events','INSERT')::text);
  perform pg_temp.record('webhook','signature_verified_at is NOT NULL (unverified events unrepresentable)','NO',
    (select is_nullable from information_schema.columns
      where table_schema='public' and table_name='testimonial_processing_events'
        and column_name='signature_verified_at'));
  perform pg_temp.record('webhook','ledger stores a payload HASH, not the raw payload','1',
    (select count(*)::text from information_schema.columns
      where table_schema='public' and table_name='testimonial_processing_events'
        and column_name='payload_hash'));
  perform pg_temp.record('webhook','no raw payload column exists','0',
    (select count(*)::text from information_schema.columns
      where table_schema='public' and table_name='testimonial_processing_events'
        and column_name='payload'));
end $$;

-- A replayed event cannot be applied twice.
insert into public.testimonial_processing_events
  (submission_id, provider, provider_event_id, event_type, provider_asset_id,
   payload_hash, signature_verified_at, applied)
values ('00000000-0000-4000-8000-00000000f0a2','fixture-provider','evt-1','video.ready','asset-unvalidated',
        repeat('a',64), now(), true);

select pg_temp.try_sql('webhook','a replayed provider event is rejected','blocked-23505',
  $q$insert into public.testimonial_processing_events
       (submission_id, provider, provider_event_id, event_type, payload_hash, signature_verified_at, applied)
     values ('00000000-0000-4000-8000-00000000f0a2','fixture-provider','evt-1','video.ready', repeat('a',64), now(), true)$q$);

-- An unverified event cannot even be represented: signature_verified_at is NOT
-- NULL, so a forged or stale-signed callback cannot fill the ledger.
select pg_temp.try_sql('webhook','an UNVERIFIED event cannot be stored at all','other-error:23502',
  $q$insert into public.testimonial_processing_events
       (submission_id, provider, provider_event_id, event_type, payload_hash, applied)
     values ('00000000-0000-4000-8000-00000000f0a2','fixture-provider','evt-unverified','video.ready', repeat('b',64), false)$q$);

select pg_temp.try_sql('webhook','a malformed payload hash is rejected','blocked-23514',
  $q$insert into public.testimonial_processing_events
       (submission_id, provider, provider_event_id, event_type, payload_hash, signature_verified_at)
     values ('00000000-0000-4000-8000-00000000f0a2','fixture-provider','evt-badhash','video.ready','not-a-sha256', now())$q$);

-- ----------------------------------------------------------------------------
-- Section 12 — Administrative visibility is unchanged
-- ----------------------------------------------------------------------------
do $$
declare n int;
begin
  perform pg_temp.act_as('00000000-0000-4000-8000-0000000000a4');   -- editor
  perform pg_temp.try_sql('moderation','editor cannot read the raw table','blocked-42501',
    $q$select count(*) from public.testimonial_submissions$q$);
  perform pg_temp.act_as_ambient();

  perform pg_temp.act_as('00000000-0000-4000-8000-0000000000b1');   -- cross-tenant owner
  perform pg_temp.try_sql('moderation','cross-tenant owner cannot read the raw table','blocked-42501',
    $q$select count(*) from public.testimonial_submissions$q$);
  perform pg_temp.act_as_ambient();

  -- Moderation is server-mediated: even the tenant owner has no browser-role
  -- privilege on the raw table. The admin surface reads the queue view
  -- server-side after checking membership.
  perform pg_temp.act_as('00000000-0000-4000-8000-0000000000a3');   -- tenant owner
  perform pg_temp.try_sql('moderation','even the tenant owner has no direct browser read','blocked-42501',
    $q$select count(*) from public.testimonial_submissions$q$);
  perform pg_temp.act_as_ambient();
end $$;
select pg_temp.act_as_ambient();

-- ----------------------------------------------------------------------------
-- Section 13 — Summary
-- ----------------------------------------------------------------------------
do $$
declare failed int;
begin
  select count(*) into failed from pg_temp._ts_check_results where not passed;
  if failed = 0 then
    raise notice '=== ALL CHECKS PASSED (% total) ===', (select count(*) from pg_temp._ts_check_results);
  else
    raise warning '=== % CHECK(S) FAILED — see rows where result = FAIL ===', failed;
  end if;
end $$;

select seq, section, check_name, expected, actual,
       case when passed then 'PASS' else 'FAIL' end as result
  from pg_temp._ts_check_results
 order by seq;

rollback;
