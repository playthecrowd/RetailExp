-- ===========================================================================
-- An optional 360° version of a chapter video.
--
-- WHAT THIS IS, AND WHAT IT IS NOT
--   The Journey plays STANDARD video. A chapter may additionally have a 2:1
--   equirectangular version, and when it does the player offers a "View in
--   360°" button. That is the whole feature: an optional alternate asset for a
--   chapter, not a second kind of journey and not a replacement for the
--   standard playback path.
--
--   Nothing here converts anything. A normal 16:9 video is not equirectangular
--   and rendering one on a sphere produces a smeared mess, so the button must
--   be hidden unless a genuine 360 asset is configured — which is exactly what
--   a nullable column expresses: absent means absent.
--
-- WHY A SEPARATE COLUMN RATHER THAN A MEDIA-ASSET FLAG
--   The relationship is "this chapter has a 360 version of ITSELF". Marking a
--   media_asset as 360 would say what the file is, but not which chapter it
--   belongs to, and would leave the player searching for a match. A nullable
--   FK on the node says precisely the thing the player needs to ask.
--
-- ON DELETE SET NULL, matching every other asset reference on this table: if
-- the 360 file is removed, the chapter loses its button and keeps playing.
-- Losing an optional enhancement must never take a chapter offline.
-- ===========================================================================

alter table public.content_nodes
  add column if not exists video360_asset_id uuid
    references public.media_assets (id) on delete set null;

comment on column public.content_nodes.video360_asset_id is
  'OPTIONAL 2:1 equirectangular version of this chapter''s primary video. NULL means this chapter has no 360 version and the player must hide its "View in 360°" control — a standard 16:9 video is not equirectangular and must never be substituted. The standard video in primary_video_asset_id remains the journey''s playback path either way.';

-- Partial: only rows that actually have one, which is the set every 360-aware
-- query cares about and a small fraction of the table.
create index if not exists content_nodes_video360_idx
  on public.content_nodes (experience_id)
  where video360_asset_id is not null;
