# Kameleon 360° chapter assets — inventory and replacement manifest

## Current inventory: zero

**No chapter has a 360° version today, and none can have had one.** The column
that records it — `content_nodes.video360_asset_id` — is added by
`20260821120000_optional_360_chapter_video.sql`, which has not been applied.
Every chapter's value is therefore NULL by construction, and the player hides
its **View in 360°** control everywhere until real assets are supplied.

This is stated as a certainty rather than a query result on purpose: the
inventory is not "we looked and found none", it is "the field did not exist".

## The exact live inventory query

Run after the migration is applied. It returns one row per chapter, so the
result *is* the manifest.

```sql
select
  p.slug                                   as pathway,
  n.branch_code                            as branch,
  coalesce(n.chapter_label, n.internal_name) as chapter,
  n.title,
  n.duration_seconds,
  standard.storage_path                    as standard_asset,
  standard.width,
  standard.height,
  case when n.video360_asset_id is null then 'MISSING' else 'present' end as video360
from public.content_nodes n
join public.experiences e   on e.id = n.experience_id
left join public.pathways p on p.id = n.pathway_id
left join public.media_assets standard on standard.id = n.primary_video_asset_id
where e.slug = 'kameleon'
  and n.node_type = 'pathway_chapter'
order by p.sort_order, n.chapter_number, n.branch_code;
```

Every row reading `MISSING` needs one asset produced to the specification
below. The branching convention the chapters follow is the one fixed by the
brief:

```
Chapter 1
 ├─ Chapter 1.A
 │   ├─ Chapter 1.A.A
 │   └─ Chapter 1.A.B
 └─ Chapter 1.B
     ├─ Chapter 1.B.A
     └─ Chapter 1.B.B
```

Some pathways converge on a shared final chapter, so the count is not simply
pathways × 7 — take it from the query rather than from arithmetic.

## Specification for each replacement asset

| Property | Requirement |
|---|---|
| Projection | **2:1 equirectangular, monoscopic.** Not fisheye, not cubemap, not stereoscopic |
| Aspect ratio | Exactly 2:1 (e.g. 3840×1920, 4096×2048) |
| Codec | H.264 High profile, yuv420p, `+faststart` |
| Audio | AAC, matching the standard chapter |
| Duration | Must match the standard chapter's `duration_seconds` |
| Content | The **same scene** as the standard chapter |

### What must not be supplied

A 16:9 video renamed or re-encoded to 2:1 is not a 360° asset. Mapped onto a
sphere it produces a smeared band with a hole at each pole. The code refuses to
guess — `video360_asset_id` NULL hides the button — so a wrong asset is worse
than a missing one: missing degrades honestly, wrong looks like a defect.

Verify before uploading:

```bash
ffprobe -v error -select_streams v:0 \
  -show_entries stream=width,height,duration \
  -of default=noprint_wrappers=1 chapter-360.mp4
# width / height must equal exactly 2
```

## Installing an asset

Two statements per chapter, in this order. Both are trusted-tier writes.

```sql
-- 1. Register the file (storage_path follows the existing convention:
--    <client_id>/<experience_id>/<asset_uuid>/v1/<key>-360.mp4)
insert into public.media_assets
  (id, client_id, experience_id, media_type, role, storage_path,
   mime_type, width, height, duration_seconds, processing_status)
values
  (:asset_id, :client_id, :experience_id, 'video', 'node-video-360',
   :storage_path, 'video/mp4', :width, :height, :duration, 'ready');

-- 2. Attach it to the chapter
update public.content_nodes
   set video360_asset_id = :asset_id
 where id = :node_id;
```

The button appears on the next page load. Nothing else changes: the standard
video remains the journey's playback path, and removing the asset row sets the
reference back to NULL (`on delete set null`) and hides the button again
without taking the chapter offline.

## Player behaviour, for reference

- Opens fullscreen over the chapter, as an overlay in the same component —
  chapter and pathway state are untouched, so exiting cannot lose progress.
- Desktop drag and mobile touch always work.
- Device orientation is opt-in behind a button, because iOS requires the
  permission call to happen inside a user gesture. Declining it costs nothing:
  drag remains, and that is also the no-motion fallback for anyone who is
  motion-sensitive.
- **Recenter** returns to the origin; **Exit 360°** and the Escape key return
  to the standard chapter at the position the 360 view reached.
- A device without WebGL sees a plain message saying the standard version is
  still available, not a black rectangle.
