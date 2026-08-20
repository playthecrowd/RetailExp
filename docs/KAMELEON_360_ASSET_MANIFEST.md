# Kameleon 360° chapter assets — inventory and replacement manifest

## Current inventory: one, reused at every decision

`20260821120000_optional_360_chapter_video.sql` **is applied**, and
`content_nodes.video360_asset_id` now resolves for real. The accelerated pilot
installs a single asset — the Kameleon Decision Lounge — and points every
decision node at it:

| | |
|---|---|
| Asset | `3c0f7a52-6b1e-4d9a-9f21-8ad4c7e05b60` (`role = node-video-360`) |
| File | `kameleon-decision-lounge-360-v1.mp4`, 3840×1920, 30 fps, 15 s, H.264 High / yuv420p, faststart |
| Attached to | every node with at least one active choice — i.e. every decision popup |
| Installed by | `scripts/install-360-lounge-asset.mjs` |
| Produced by | `scripts/media/kameleon-360-lounge/` (Blender + ffmpeg, see its README) |

**One video everywhere is deliberate, not an oversight.** The 360 view exists
to help a visitor make a pathway choice by showing them the world the choice
sits in. That world is the same world at every decision, and producing 28
near-identical lounges would cost 28× the render for a difference no visitor
could name. Per-chapter environments are a later step, and the schema already
supports them: point a node at a different asset and only that node changes.

The asset is flagged `is_placeholder = true`, so the dashboard keeps saying so.

## The exact live inventory query

It returns one row per chapter, so the result *is* the manifest.

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

Every row reading `MISSING` is a chapter with no decision to support — a
terminal or convergence node. Every row reading `present` shares the one pilot
asset. When per-chapter lounges are produced, each needs one asset to the
specification below.

The branching convention the chapters follow is the one fixed by the brief:

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

- Opens fullscreen over the decision, as an overlay in the same component —
  chapter and pathway state are untouched, so exiting cannot lose progress.
- Desktop drag and mobile touch always work.
- Device orientation is opt-in behind a button, because iOS requires the
  permission call to happen inside a user gesture. Declining it costs nothing:
  drag remains, and that is also the no-motion fallback for anyone who is
  motion-sensitive.
- **Recenter** returns to the origin. **Return to Choices**, the Escape key,
  browser Back, and the clip reaching its own end all do the same thing: close
  the overlay onto the same decision popup, with the same choices, having
  selected nothing and advanced nothing.
- Play/Pause and Mute/Unmute are present; the clip opens muted, because no
  current mobile browser will autoplay audible video.
- Under `prefers-reduced-motion` it opens on the poster frame rather than
  starting itself.
- A device without WebGL sees a plain message saying the standard version is
  still available, not a black rectangle.
