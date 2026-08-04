-- Phase 7 Checkpoint 2 — Storage bucket and policies.
--
-- Single shared bucket, path-prefix scoped, per
-- docs/PHASE7_PLATFORM_ARCHITECTURE_PREFLIGHT.md §3:
--   platform-media/{client_id}/{experience_id}/{media_asset_id}/v{version}/{filename}
--   platform-media/{client_id}/branding/{media_asset_id}/v{version}/{filename}
-- Paths use stable UUIDs, never slugs or filenames, so a client/experience
-- rename never requires moving files. The bucket is NOT marked public —
-- every read goes through the policies below, including the "published"
-- policy for anonymous customer-facing access.

insert into storage.buckets (id, name, public)
values ('platform-media', 'platform-media', false)
on conflict (id) do nothing;

-- storage.foldername(name) splits the object path into an array of path
-- segments; segment [1] is always the client_id per the path convention
-- above.

create policy platform_media_select_members on storage.objects
  for select
  using (
    bucket_id = 'platform-media'
    and (
      public.is_platform_admin()
      or public.is_client_member(((storage.foldername(name))[1])::uuid)
    )
  );

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

create policy platform_media_write_editors on storage.objects
  for all
  using (
    bucket_id = 'platform-media'
    and (
      public.is_platform_admin()
      or public.can_edit_client(((storage.foldername(name))[1])::uuid)
    )
  )
  with check (
    bucket_id = 'platform-media'
    and (
      public.is_platform_admin()
      or public.can_edit_client(((storage.foldername(name))[1])::uuid)
    )
  );
