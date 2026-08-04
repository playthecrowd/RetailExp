# Phase 7 Checkpoint 1 — Platform Architecture Preflight

**Status:** PLANNING ONLY. No code, schema, migration, or Supabase project has
been created as part of this document. Nothing here is implemented — this is
the report requested before Checkpoint 2 begins.

**Scope:** two requirement sets from the same conversation turn, unified into
one plan because they're the same underlying problem: (1) a video/media
content-management system for Kameleon's branching journeys, and (2) a
reusable multi-tenant SaaS data model where Kameleon is the first client, not
a hardcoded assumption. The branching-video tables ARE the multi-tenant
content tables — there's no separate schema for each.

**Companion doc:** `docs/RETAILEXP_PHASE_TRACKER.md`'s Phase 7 section holds
the short status/summary and links here for detail.

---

## 1. What already exists (verified against the actual code, not assumed)

### 1a. Kameleon-specific hardcoding — full inventory

| Category | Where | Notes |
|---|---|---|
| Route paths | `/experience/kameleon`, `/experience/kameleon/ar-snap-test`, `/admin/clients/kameleon` | All literal, not parameterized. No `[clientSlug]`/`[slug]` dynamic route exists anywhere yet. |
| Directories | `lib/kameleon/**` (20 files), `components/kameleon/**` (36 files), `lib/mock-data/kameleon-pathways.ts` | Everything about the experience lives under a `kameleon`-named tree. |
| Shared UI primitive | `type Brand = "admin" \| "kameleon"` in `components/ui/Button.tsx`, `ProgressSteps.tsx`, `states.tsx` | A **closed 2-value enum**, not an N-tenant theme system. Every shared button/progress-step/loading-state component branches on this literal union. |
| Theme tokens | `app/globals.css` — `--kameleon-*` CSS vars (11 tokens) and a separate, parallel `--admin-*` palette | Two hardcoded brand palettes, not a per-client config-driven theme. `--font-kameleon-display` (Cormorant Garamond) is loaded only in `app/experience/kameleon/layout.tsx`. |
| Data model | `Pathway.motif: "private-pour" \| "social-shift" \| "create" \| "arrive"` (closed union), `Pathway.accent: "red" \| "blue"` (closed union) | Both need to become open (string/config-driven) for a second client to ever exist. |
| Storage keys | `"retailexp:kameleon:session:v2"`, `"retailexp:kameleon:progress:v2"`, `"retailexp:kameleon:profile:v1"` | Hardcoded, not parameterized by client. |
| Content | `lib/mock-data/kameleon-pathways.ts` — `CLIENT_ID = "kameleon"`, `EXPERIENCE_ID = "kameleon-journey"` as local string constants | Never read from a client table — there is no client table yet. |
| Admin dashboard | `app/admin/clients/kameleon/page.tsx` | A single static page wired directly to Kameleon's mock data imports, **not branching on the client parameter it receives** even though `app/admin/clients/page.tsx` already renders its list generically off a `ClientRecord[]` array. |
| Media selection logic | `lib/kameleon/production-assets.ts`'s `TITLE_TO_MOTIF` | Media is chosen today by **pattern-matching the node's narrative title string** against a hardcoded lookup table — not a foreign key to a media record. This is the single most important thing the new schema must fix. |
| AR config | `lib/kameleon/ar/snap-camera-kit-config.ts` | Three global env vars, called with zero arguments at every call site. One Lens/LensGroup for the entire deployment, regardless of client. |
| Copy/business terms | "Private Pour", "Social Shift", "Create", "Arrive" (real pathway names — confirmed via full read of `kameleon-pathways.ts`), plus flavor node titles ("The Table", "Last Call", "Dance Floor", etc.) | These are correctly just **data**, not identifiers — they already live in a content array, not in code structure. This is good: it means the pathway *content* is already shaped right; only the *storage mechanism* (static TS module vs. database) needs to change. |

**Correction to the request:** "Perfect Pour" does not appear anywhere in the
codebase (verified via full-repo search) — only "Private Pour" is real. If
"The Perfect Pour" is the intended experience name going forward, that's new
naming to introduce, not something to preserve.

### 1b. What must remain client-specific vs. what moves to universal config

| Stays client-owned data (in DB rows, not code) | Moves to universal platform code/schema |
|---|---|
| "Kameleon", "Private Pour", "Social Shift", "Create", "Arrive", all node titles/descriptions, the copper/red/blue color values, the Cormorant Garamond font choice, the bottle/viewfinder art motifs | The `content_nodes`/`choices`/`pathways`/`experiences` table shapes, the admin dashboard shell and screen components, the `Brand` theming mechanism (replaced by data-driven `brand_settings`), the public route structure, the reducer/session-state machine shape (already generic — see §1c) |
| The specific Snap Lens ID/Lens Group ID Kameleon uses | The *mechanism* for associating an experience with an AR provider + lens config (a column/table, not a hardcoded env-var read with no parameters) |
| The "one commercial video, four pathways, branching chapters, decision choices" narrative structure | The *tables* that represent "an experience has N pathways, each pathway has N nodes, each node has 0-N choices" — already exactly what `pathway-model.ts` encodes generically today |

### 1c. The good news: the existing runtime shapes are already mostly tenant-agnostic

`VideoNode`, `Pathway`, `VideoChoice`, and `ViewerProgress` (`lib/kameleon/pathway-model.ts`)
are **not** Kameleon-specific in shape — they already carry `clientId`/
`experienceId` fields, use ID-based navigation (never label-text matching,
per that file's own documented design rule), and the reducer
(`lib/kameleon/reducer.ts`) never imports anything Kameleon-branded except
the one static data source. This means the new database schema can be a
close, provable mapping of what already runs in production today, not a
redesign from scratch — see §2.

---

## 2. Universal database schema

Every table below uses only universal names, per the explicit instruction —
no table is named after Kameleon, wine, bottles, or a campaign.

### clients
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| slug | text, unique | used in public URLs — `kameleon` |
| name | text | `"Kameleon"` |
| status | enum: active / inactive / archived | |
| primary_color | text | hex |
| secondary_color | text | hex |
| logo_asset_id | fk → media_assets, nullable | |
| custom_domain | text, nullable | future |
| contact_email | text, nullable | |
| created_at / updated_at | timestamptz | |

### client_memberships
Admin users who can manage a client. `id`, `client_id` (fk), `user_id` (fk →
Supabase `auth.users`), `role` (enum: owner / admin / editor / viewer),
`created_at`.

### experiences
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| client_id | fk → clients | |
| slug | text | unique **within** client_id — `perfect-pour` |
| name | text | `"The Perfect Pour"` |
| experience_type | text | open string (e.g. `"ar-journey"`), not a closed enum |
| commercial_content_node_id | fk → content_nodes, nullable | see §2 note below |
| ar_provider | text, nullable | e.g. `"snap-camera-kit"` |
| ar_lens_id | text, nullable | **not secret** — see §7 |
| ar_lens_group_id | text, nullable | **not secret** — see §7 |
| signup_required | boolean | |
| publication_status | enum: draft / published / archived | |
| current_version_id | fk → publication_versions, nullable | |
| created_at / updated_at | timestamptz | |

### pathways
`id`, `experience_id` (fk), `key` (text, e.g. `"private-pour"` — stable,
used by the import manifest), `title`, `subtitle` (nullable), `description`
(nullable), `accent_color` (text, open — not the current 2-value union),
`root_node_id` (fk → content_nodes, nullable — nullable because a pathway
row can exist before its first node does), `sort_order`, `publication_status`,
`created_at`/`updated_at`.

### content_nodes
This is the single table for **every** video-bearing moment — commercial,
AR intro, pathway chapters, journey completion — distinguished by
`node_type`, not by separate tables. This directly answers "media types
1/2/4/6" from the request: they're all rows here.

| column | type | notes |
|---|---|---|
| id | uuid pk | |
| client_id | fk → clients | **denormalized** — see §6 (RLS rationale) |
| experience_id | fk → experiences | |
| pathway_id | fk → pathways, nullable | null for commercial/AR-intro/generic-completion nodes |
| parent_node_id | fk → content_nodes, nullable | |
| node_type | enum: commercial / ar_intro / pathway_chapter / journey_completion / other | |
| internal_name | text | exact field the request asked for |
| title | text | customer-facing |
| chapter_label | text, nullable | |
| description | text, nullable | |
| chapter_number | int, nullable | |
| branch_code | text, nullable | preserves the existing `""` / `"A"` / `"A.A"` convention |
| is_root | boolean | |
| is_terminal | boolean | |
| primary_video_asset_id | fk → media_assets, nullable | |
| poster_asset_id | fk → media_assets, nullable | |
| thumbnail_asset_id | fk → media_assets, nullable | |
| captions_asset_id | fk → media_assets, nullable | |
| duration_seconds | numeric, nullable | |
| sort_order | int | |
| publication_status | enum: draft / published / archived | |
| processing_status | enum: pending / processing / ready / failed | |
| version | int, default 1 | |
| decision_timing | jsonb, nullable | preserves the existing `DecisionTiming` shape without a schema-level commitment to its fields |
| created_at / updated_at | timestamptz | |

### choices
(The request's "decisions" and "Choice" naming refer to the same concept —
resolved in favor of `choices`, per the explicit universal-terminology
section.)

| column | type | notes |
|---|---|---|
| id | uuid pk | |
| client_id | fk → clients | denormalized |
| source_node_id | fk → content_nodes | |
| destination_node_id | fk → content_nodes, nullable | nullable so a choice can be drafted before its destination exists |
| title | text | |
| description | text, nullable | |
| display_order | int | |
| thumbnail_asset_id | fk → media_assets, nullable | |
| preview_video_asset_id | fk → media_assets, nullable | "optional decision-preview video" |
| active | boolean, default true | |
| created_at / updated_at | timestamptz | |

Not restricted to exactly two children — `destination_node_id` is a plain
FK on each choice row, and a node can have any number of outgoing choice
rows (zero, one, two, or more), satisfying "should not permanently restrict
future experiences to exactly two choices."

### media_assets
The single home for every uploaded file's **metadata** — never the file
itself.

| column | type | notes |
|---|---|---|
| id | uuid pk | |
| client_id | fk → clients | |
| experience_id | fk → experiences, nullable | null for client-level assets like a logo |
| media_type | enum: video / image / captions / audio | |
| role | text, nullable | free-form tag: `"poster"`, `"thumbnail"`, `"primary_video"`, `"decision_preview"`, `"logo"`, `"sfx"` — descriptive, filterable, not schema-enforced |
| storage_path | text | the **protected** Supabase Storage object path — see §3 |
| public_url | text, nullable | populated only once published — see §5 |
| mime_type | text, nullable | |
| file_size_bytes | bigint, nullable | |
| duration_seconds | numeric, nullable | video/audio |
| width / height | int, nullable | video/image |
| processing_status | enum: pending / processing / ready / failed | |
| is_placeholder | boolean, default false | drives "missing-media warnings" — see §5 |
| version | int, default 1 | |
| checksum | text, nullable | dedup/integrity |
| uploaded_by | fk → auth.users, nullable | |
| created_at / updated_at | timestamptz | |

### experience_users
End users/customers of a *published* experience — distinct from
`client_memberships` (admins). `id`, `experience_id` (fk), `client_id` (fk,
denormalized), `auth_user_id` (fk → `auth.users`, nullable — nullable
because Quick Account is still the mock flow today, per requirement #8 of
the prior checkpoint, unchanged here), `display_name` (nullable), `email`
(nullable), `created_at`.

### journey_progress
Maps directly onto the existing `ViewerProgress` shape. `id`,
`experience_user_id` (fk), `client_id` (fk, denormalized), `pathway_id` (fk,
nullable), `current_node_id` (fk, nullable), `player_status` (enum matching
`PlayerStatus`), `current_node_elapsed_seconds`, `history` (jsonb array,
preserving `PathHistoryEntry`'s exact shape), `completed_node_ids` (jsonb
array), `last_updated_at`.

### engagement_events
`id`, `client_id` (fk), `experience_id` (fk), `experience_user_id` (fk,
nullable), `event_type` (text — e.g. `"commercial_complete"`,
`"ar_started"`, `"choice_selected"`, `"journey_complete"`), `event_payload`
(jsonb, nullable), `occurred_at`.

### brand_settings
1:1 with `clients` (kept as its own table per the explicit request, rather
than folded into `clients`, so it can later support per-experience
overrides without a schema change). `id`, `client_id` (fk, unique),
`logo_asset_id` (fk, nullable), `primary_color`, `secondary_color`,
`typography` (jsonb), `terminology_overrides` (jsonb, nullable — "Default
terminology overrides later"), `created_at`/`updated_at`.

### publication_versions
`id`, `experience_id` (fk), `version_number` (int), `status` (enum: draft /
published / archived), `snapshot` (jsonb, nullable — an optional full
point-in-time copy of the graph for rollback/preview), `published_by` (fk,
nullable), `published_at` (nullable), `created_at`.

---

## 3. Supabase Storage structure

Paths use **stable IDs, never slugs or filenames** — per the explicit
automation-readiness instruction, so a client/experience rename never
requires moving files:

```
{bucket}/{client_id}/{experience_id}/{media_asset_id}/v{version}/{filename}
```

Fixed, predictable filenames within each asset's own versioned folder
(the path already encodes identity + version, so the filename itself
doesn't need to be descriptive):

```
video.mp4        (primary video / decision-preview video)
poster.jpg
thumbnail.jpg
captions.vtt
audio.mp3         (sfx/background audio)
```

Client-level assets (logo) that aren't experience-scoped:
`{bucket}/{client_id}/branding/{media_asset_id}/v{version}/{filename}`

A single bucket (e.g. `platform-media`) with path-prefix-based Storage
policies is recommended over one bucket per client — simpler to
administer, and Supabase Storage RLS policies work identically either way
(see §6).

---

## 4. Upload and publishing workflow

1. Admin opens a node/choice editor, picks a media role (video / poster /
   thumbnail / captions / preview), selects a file.
2. Client-side validation (type, size ceiling) before any network call.
3. The browser requests a signed upload URL from a server action/API route
   that verifies the admin's `client_memberships` row grants write access to
   that `client_id` — the URL is scoped to exactly one destination path.
4. Upload goes directly from the browser to Storage (resumable upload for
   larger video files) — never proxied through a server function that
   would hold the whole file in memory.
5. On success, a new `media_assets` row is created: `version` incremented
   from any prior asset in the same role slot, `is_placeholder: false`,
   `processing_status` set after a lightweight metadata read (duration,
   dimensions, mime type — not a paid transcoding step; see §8).
6. The admin attaches the new asset's id to the target node/choice's FK
   column. This is a **draft-only** change — `publication_status` on the
   experience/node is untouched.
7. **Preview** renders the current draft graph (including unpublished
   media) via short-lived signed URLs, exactly as a customer would see it,
   without making anything public.
8. **Publish** validates the graph (§5), creates a new
   `publication_versions` row, flips `publication_status` to `published` on
   the experience/nodes/choices included in that version, and makes the
   referenced storage objects reachable via `public_url` (§6).
9. **Unpublish** reverts `publication_status` without deleting anything.

## 5. Placeholder-to-production replacement strategy

Today's placeholder paths (`lib/kameleon/build-pathway-tree.ts`'s
`/media/kameleon/placeholder/{key}.mp4` convention) become the **seed data**
for `media_assets` rows with `is_placeholder: true`, `processing_status:
'ready'` (they're real files today, just not final production ones), and
`storage_path` pointing at the existing static asset. The live route never
breaks during the transition because every node always has *some* asset
attached from the moment the DB is seeded.

As Adobe Premiere/Higgsfield exports become available: an admin uploads the
real file (§4), which creates a **new** `media_assets` row (`version`
incremented, `is_placeholder: false`), and the node/choice FK is repointed
to it. The old placeholder row/file is left alone (not deleted) until an
explicit, admin-triggered cleanup — supporting rollback and the "version
history" requirement for free.

**Missing-media warnings** in the dashboard are simply: any node/choice
whose current asset has `is_placeholder: true` or `processing_status !=
'ready'` gets a visible badge. No separate tracking mechanism is needed.

## 6. Tenant isolation / RLS strategy

`client_id` is **denormalized onto every content-bearing table**
(`content_nodes`, `choices`, `media_assets`, `experience_users`,
`journey_progress`, `engagement_events`) even though it's reachable via a
join through `experience_id` → `experiences.client_id`. This is a standard
Supabase RLS pattern: policies can then be a single flat check —

```
client_id IN (
  SELECT client_id FROM client_memberships WHERE user_id = auth.uid()
)
```

— instead of a multi-table join evaluated on every row read, which is both
faster and harder to get subtly wrong.

- **Admin dashboard reads/writes:** gated by the policy above.
- **Public experience reads (anonymous end users):** a separate policy
  allowing `SELECT` where `publication_status = 'published'`, with no
  `client_memberships` check at all — published content is meant to be
  publicly viewable.
- **Platform administrators:** a `platform_admins` table (or a claim on the
  Supabase JWT) checked with an `OR` in every policy, granting read (and
  selectively write, e.g. "disable inappropriate media") access across all
  clients regardless of membership.
- **Storage policies** mirror the same logic against `storage.objects`,
  matching the `client_id` path-prefix segment described in §3.
- **experience_users / journey_progress:** end users can only read their
  own rows (`auth_user_id = auth.uid()` or a session-scoped equivalent
  while Quick Account is still the mock flow).

Same-named nodes/pathways across two different clients can never collide,
because every query is scoped by `client_id` (or a chain that resolves to
it) before any name/slug comparison happens.

## 7. AR/Lens configuration — secure future strategy (not implemented now)

Per the explicit instruction, the current Snap API token stays exactly
where it is (a Vercel environment variable) — it is **not** moved into any
client database row in this checkpoint or planned for one automatically.

Recommended future shape, once actually needed:
- `experiences.ar_lens_id` / `experiences.ar_lens_group_id` — these are
  **not secrets** (Snap's own docs describe Lens/Group IDs as identifiers
  found in the portal, not credentials), so storing them per-experience in
  the database is safe and lets each client eventually use a different
  Lens under the same Camera Kit app.
- The **API token** is a different problem: Snap issues one API token per
  Camera Kit "app" registered in their developer portal, not per lens. If
  every client eventually needs their own fully separate Snap developer
  account (not just a different lens under one shared account), that
  requires a real secrets-management story — e.g. a `client_secrets` table
  encrypted at rest via Supabase Vault, or per-client Vercel environment
  variables behind a proxy — and should be its own explicitly-approved
  checkpoint when it's actually needed, not designed speculatively now.

## 8. Recommended delivery format (confirmed, with browser-compatibility notes)

MP4 container, H.264 (baseline or main profile), AAC-LC audio, `moov` atom
placed at the **start** of the file ("fast start") so playback can begin
before the full file downloads — a standard Premiere export toggle. This
combination plays natively without transcoding on iPhone Safari/Chrome/
Firefox (all WebKit) and Android Chrome/Samsung Internet (all
Chromium-based via the OS media stack), matching the browsers this project
already targets for Camera Kit. Portrait for pathway/chapter content,
360°/other formats only where a pathway specifically calls for it. Poster
images required for every video node (the existing `MockVideoPlayer`
already expects a poster). Captions in WebVTT (`.vtt`) where available —
optional per node, not required, matching `captions_asset_id`'s nullability.

No paid transcoding/processing service is proposed anywhere in this plan —
"processing" in `media_assets.processing_status` means a lightweight
metadata read (duration/dimensions/mime type), not format conversion.

## 9. Validation rules for broken branches

Checked at publish time (blocking) and shown as warnings continuously in
the dashboard (non-blocking, so drafts can be saved incomplete):

- Every `choices.destination_node_id` must reference an existing
  `content_node` in the same `experience_id` (FK constraint enforces this
  at the database level already).
- A non-terminal node with zero active choices is flagged as a dead end.
- A node unreachable from any `pathway.root_node_id` via any chain of
  active choices is flagged as orphaned.
- A node/choice whose required media asset is missing, `is_placeholder`,
  or not `processing_status: ready` is flagged.
- Cycles are detected and flagged as warnings (not hard-blocked) — some
  future experience might deliberately want a loop, so this stays a
  reviewable warning rather than a rule.
- **Publish is blocked** only on missing required media and broken (dead)
  FK references; dead-ends/orphans/cycles are warnings an admin can
  consciously publish through.

## 10. Dashboard screens required

| Screen | Purpose | Builds on |
|---|---|---|
| ExperienceList | List experiences for the current client | `app/admin/clients/page.tsx`'s existing generic list-row pattern |
| ExperienceEditor | Name, slug, type, commercial node, AR config, signup requirement, publication status | New |
| PathwayList | Pathways within an experience | New, list pattern reused |
| PathwayEditor | Title/subtitle/accent/root node | New |
| ContentNodeEditor | Internal name, title, chapter label, description, media uploads (video/poster/thumbnail/captions), decision timing, status/version | New — the largest screen |
| ChoiceEditor | Title, description, destination-node picker, thumbnail/preview upload, display order, active toggle, reordering | New |
| MediaLibrary | Browse all client media, filter by type/status, orphaned-asset view, storage usage summary | New |
| Journey Preview | Visual graph of the current draft, warnings overlaid (missing media, dead ends, orphans) | Adapts the existing customer-facing `StoryPathMap` into an admin-editing view |
| PublishPanel | Version history, preview-before-publish, publish/unpublish, blocking-validation summary | New |
| UserList / UserDetail | `experience_users` — later checkpoint, depends on real auth | New |
| ExperienceAnalytics | `engagement_events` rollups | New |
| BrandSettingsEditor | Logo, colors, typography, terminology overrides | New |

Reusable shared components matching the requested list: `ExperienceList`,
`ExperienceEditor`, `PathwayList`, `PathwayEditor`, `ContentNodeEditor`,
`ChoiceEditor`, `MediaLibrary`, `UserList`, `UserDetail`,
`ExperienceAnalytics`, `BrandSettingsEditor`, `PublishPanel` — client
styling/terminology comes from `brand_settings` data passed as props, never
duplicated per-client components.

## 11. Universal dashboard navigation

Top-level admin nav becomes: **Clients** (platform-admin only) → within a
client: **Experiences · Pathways · Content Nodes · Choices · Media Library
· Users · Analytics · Brand Settings · Preview & Publish**. No
Kameleon-specific label appears in navigation chrome — "Kameleon" only
appears as the *value* of a client name once an admin is inside that
client's context.

## 12. Universal URL strategy — safe migration path

Target public route: `/e/[clientSlug]/[experienceSlug]`, rendering off the
Supabase-backed data layer described above.

`/experience/kameleon` **is not deleted or redirected away from during this
phase.** The safe path:

1. Build the universal route and data layer independently.
2. Seed the database with Kameleon's existing structure (via the import
   manifest, §13) as the `kameleon` / `perfect-pour` (or whatever slug is
   chosen) client/experience.
3. Once the universal renderer produces output that's been verified
   equivalent to the current experience, `/experience/kameleon/page.tsx`
   is changed to internally render the *same* universal renderer
   component, pre-supplied with the Kameleon client/experience IDs — i.e.
   `/experience/kameleon` becomes a thin, permanent alias, not a redirect
   that could break bookmarked/shared links.
4. `/experience/kameleon` continues to work, unchanged from a visitor's
   perspective, indefinitely — there's no forced migration off it.

## 13. Import manifest format (refined)

Builds on the example provided, with two changes justified by the schema
above: media is a separate registry referenced by key (so one asset can be
reused, and so versioning/roles are explicit), and fields are named to
match the table columns directly for a 1:1 import mapping.

```json
{
  "clientSlug": "kameleon",
  "experienceSlug": "perfect-pour",
  "experienceName": "The Perfect Pour",
  "mediaAssets": [
    { "key": "private-pour-ch01-video", "mediaType": "video", "role": "primary_video", "sourcePath": "..." },
    { "key": "private-pour-ch01-poster", "mediaType": "image", "role": "poster", "sourcePath": "..." }
  ],
  "pathways": [
    {
      "key": "private-pour",
      "title": "Private Pour",
      "nodes": [
        {
          "key": "chapter-1",
          "title": "Chapter 1",
          "chapterLabel": "Chapter 1",
          "primaryVideoKey": "private-pour-ch01-video",
          "posterKey": "private-pour-ch01-poster",
          "choices": [
            { "title": "Follow the Energy", "destinationNodeKey": "chapter-1-a", "displayOrder": 1 },
            { "title": "Follow the View", "destinationNodeKey": "chapter-1-b", "displayOrder": 2 }
          ]
        }
      ]
    }
  ]
}
```

All cross-references use `key` (a stable string chosen by whoever authors
the manifest), never a title or filename — satisfying "stable IDs and
relationships, not filenames or display titles." An import tool resolves
`key`s to real database UUIDs at import time.

This same shape is what steps 1-11 of the requested automation sequence
("create a client → create an experience → upload media → create pathways
→ create content nodes → connect choices → assign thumbnails/captions →
validate the graph → preview → publish → activate the public URL") would
consume — the manifest is the input, and each of those steps is a
straightforward operation against the tables in §2.

## 14. Checkpoint roadmap — which future checkpoint implements what

| Checkpoint | Scope | Gate |
|---|---|---|
| 7.1 (this doc) | Planning only | — |
| 7.2 | Supabase project provisioning, core schema + RLS migration, seed Kameleon as first client row (no dashboard UI, no data migration off the mock module yet) | **Requires explicit approval** — new external account/resource, per the standing restriction |
| 7.3 | Supabase Auth wiring for `client_memberships` — replaces `DevAuthNotice` mock login | |
| 7.4 | Data-layer swap: `lib/mock-data/kameleon-pathways.ts`'s static import replaced by a Supabase-backed fetch hydrating the *same* `VideoNode`/`Pathway` shapes, behind a flag so `/experience/kameleon` never breaks mid-migration; seed via the §13 manifest with placeholder media | |
| 7.5 | Storage bucket + signed-upload endpoint + `media_assets` creation flow | Foundation for Phase 8 |
| 8.1 | Dashboard: MediaLibrary, ContentNodeEditor, ChoiceEditor, PublishPanel, missing-media/broken-branch warnings | |
| 8.2 | Universal terminology rollout: generic `Brand`/theme mechanism, dynamic `/admin/clients/[slug]`, generic ExperienceEditor/PathwayEditor | |
| 8.3 | Universal public route `/e/[clientSlug]/[experienceSlug]`, `/experience/kameleon` becomes the thin alias described in §12 | |
| 8.4 | Per-experience AR Lens config (§7) — Lens/Group ID only, token stays an env var | |
| 9.x | `ExperienceAnalytics` off `engagement_events` | Existing Phase 9 scope, unchanged |

---

## Open questions for you before Checkpoint 7.2

1. Confirm the target experience slug — "perfect-pour" was used as the
   working example throughout this doc since "Perfect Pour" was mentioned
   in the request, but it doesn't exist in the codebase today. What should
   it actually be?
2. Supabase project creation itself is gated behind explicit approval per
   the standing restrictions (external account/resource) — this doc
   doesn't request that approval, just flags where it'll be needed (7.2).
3. Should Checkpoint 7.2 seed *only* the schema, or also import Kameleon's
   real current pathway content via the manifest in the same checkpoint?
   Recommend schema-only first, content-import as a distinct, separately
   verifiable step.
