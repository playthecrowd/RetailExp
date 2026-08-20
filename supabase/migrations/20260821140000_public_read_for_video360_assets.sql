-- ===========================================================================
-- Let a visitor actually READ the 360° asset that 20260821120000 let a chapter
-- POINT AT.
--
-- THE DEFECT
--   20260821120000 added content_nodes.video360_asset_id and stopped there.
--   Both public-read policies — media_assets_select_published_public and
--   storage.objects' platform_media_select_published_public — decide "is this
--   asset publicly readable?" by enumerating the referencing columns BY NAME:
--
--       n.primary_video_asset_id = m.id
--       or n.poster_asset_id     = m.id
--       or n.thumbnail_asset_id  = m.id
--       or n.captions_asset_id   = m.id
--
--   video360_asset_id was never added to that list. The consequence is not
--   subtle and is not theoretical: measured against the live database with the
--   browser's publishable key, a chapter row returns its video360_asset_id
--   quite happily, the matching media_assets row returns ZERO rows, and asking
--   Storage to sign the object returns "Either the object does not exist or you
--   do not have access to it". lib/kameleon/live-content.ts therefore resolves
--   video360Source to the empty string, and the decision popup hides its
--   "Explore in 360°" control — correctly, by its own rule, and for a reason
--   no one could see. The feature was unreachable for every visitor.
--
--   This is the failure mode an allow-list has: adding a column is a schema
--   change, but adding a column that an allow-list does not know about is a
--   silent authorization change. Nothing errors. The button simply never
--   appears.
--
-- WHAT THIS GRANTS, AND WHAT IT DOES NOT
--   A 360 asset becomes publicly readable under EXACTLY the conditions its
--   chapter's own video already is, and no others:
--     - it must be referenced by a node whose publication_status = 'published';
--     - is_source_master = false still excludes a raw master unconditionally.
--   Nothing else is relaxed. An unreferenced asset, a draft chapter's asset and
--   a source master all remain unreadable, exactly as before.
--
-- WHY BOTH POLICIES
--   They are two independent gates on the same asset. The public.media_assets
--   policy governs reading the ROW (and so the storage_path); the
--   storage.objects policy governs signing the OBJECT. Fixing one and not the
--   other trades "no button" for "a button that opens a broken video", which is
--   worse — a missing feature degrades honestly, a broken one reads as a defect.
--
-- REPLACE, NOT ALTER: a policy's USING expression cannot be amended in place,
-- so each is dropped and recreated with the single extra disjunct. The bodies
-- below are otherwise character-for-character the originals from
-- 20260804152549 and 20260804152552.
-- ===========================================================================

drop policy if exists media_assets_select_published_public on public.media_assets;

create policy media_assets_select_published_public on public.media_assets
  for select using (
    is_source_master = false
    and (
      exists (
        select 1 from public.content_nodes n
        where n.publication_status = 'published'
          and (
            n.primary_video_asset_id = media_assets.id
            or n.video360_asset_id = media_assets.id
            or n.poster_asset_id = media_assets.id
            or n.thumbnail_asset_id = media_assets.id
            or n.captions_asset_id = media_assets.id
          )
      )
      or exists (
        select 1 from public.choices c
        join public.content_nodes n on n.id = c.source_node_id
        where c.active = true
          and n.publication_status = 'published'
          and (c.thumbnail_asset_id = media_assets.id or c.preview_video_asset_id = media_assets.id)
      )
    )
  );

comment on policy media_assets_select_published_public on public.media_assets is
  'Public read for an asset that a PUBLISHED node or an active choice on one actually references — including its optional 360 version. A source master is excluded unconditionally. Any future asset-reference column added to content_nodes must be added here and to storage.objects'' platform_media_select_published_public, or the asset is silently unreadable to visitors while the reference itself reads back fine.';

drop policy if exists platform_media_select_published_public on storage.objects;

create policy platform_media_select_published_public on storage.objects
  for select
  using (
    bucket_id = 'platform-media'
    and exists (
      select 1 from public.media_assets m
      where m.storage_path = storage.objects.name
        and m.is_source_master = false
        and (
          exists (
            select 1 from public.content_nodes n
            where n.publication_status = 'published'
              and (
                n.primary_video_asset_id = m.id
                or n.video360_asset_id = m.id
                or n.poster_asset_id = m.id
                or n.thumbnail_asset_id = m.id
                or n.captions_asset_id = m.id
              )
          )
          or exists (
            select 1 from public.choices c
            join public.content_nodes n on n.id = c.source_node_id
            where c.active = true
              and n.publication_status = 'published'
              and (c.thumbnail_asset_id = m.id or c.preview_video_asset_id = m.id)
          )
        )
    )
  );
