# Kameleon Asset Manifest

Tracks every visual/audio asset referenced by the Kameleon experience: what's
approved-and-available, what's a code-generated fallback, and what's still
needed. Updated whenever a new asset is supplied or a new screen is built.

## Approved reference screenshots (visual source of truth — never shipped as app UI)

All 11 present at `docs/design-reference/`, confirmed non-corrupted (Phase 0)
and directly inspected (Phase 3, both review rounds).

| Filename | Dimensions (approx.) | Type | Screen |
|---|---|---|---|
| 01-tap-to-begin.png | 941×1024 | PNG | Tap to Begin |
| 02-commercial-video.png | 941×1024 | PNG | Commercial |
| 03-webar-camera-permission.png | 941×1024 | PNG | AR permission |
| 04-live-ar-introduction.png | 941×1024 | PNG | AR introduction |
| 05-quick-account-gate.png | 941×1024 | PNG | Quick account |
| 06-choose-first-path.png | 941×1024 | PNG | Choose pathway |
| 07-selected-path-preview.png | 941×1024 | PNG | Selected pathway preview |
| 08-360-video-player.png | 941×1024 | PNG | Video player |
| 09-end-video-decision.png | 941×1024 | PNG | Decision drawer (visual language) |
| 10-story-path-map.png | 941×1024 | PNG | Story path map |
| 11-journey-completion.png | 941×1024 | PNG | Journey completion |

## Dedicated thumbnail sets delivered — fourth review round (2026-08-03)

The ZIP/thumbnail gap flagged in the third round below is now resolved. The
full package arrived at `public/assets/kameleon/`, containing `fullscreen/`
(unchanged from the third round), `pathway-thumbnails/`, `decision-thumbnails/`,
and `ASSET-MANIFEST.md` (the delivered package's own manifest, distinct from
this file).

| Directory | Files | Dimensions | Used for |
|---|---|---|---|
| `pathway-thumbnails/` | `{private-pour,social-shift,create,arrive}-card-16x9.png` | 1200×675 (16:9) | The four "Where Will the Night Take You?" pathway cards |
| `decision-thumbnails/` | `{private-pour,social-shift,create,arrive}-choice-3x2.png` | 900×600 (3:2) | Destination previews inside the decision drawer |

**No dedicated thumbnail exists for `the-table`** (it's a terminal/flavor
destination, never a selectable pathway, and the delivered decision set only
covers the 4 environments listed above) — decision cards whose destination
resolves to `the-table` via `getNodeMotif()` (e.g. "Follow the Toast" →
The Table, or any of the deeper flavor nodes like "Golden Hour"/"Last Call"
that structurally fall back to their pathway's motif) continue to crop the
full-screen photo, exactly as the interim approach below did for every motif
before this round. This is the documented, intentional fallback — not a gap.

Wired in via two new maps in `lib/kameleon/production-assets.ts`
(`kameleonPathwayThumbnails`, `kameleonDecisionThumbnails`) and a new
`thumbnailKind?: "pathway-card" | "decision"` prop on `EnvironmentArt`: when
set, the component looks up the dedicated crop for the motif first (plain
`object-cover`, no custom focal point needed since these are already
composed at their target ratio) and only falls back to the full-screen-photo
crop path if no dedicated file exists for that motif. `ChooseFirstPath.tsx`
now passes `thumbnailKind="pathway-card"`; `DecisionDrawer.tsx` now passes
`thumbnailKind="decision"`. No other screen changed — `SelectedPathPreview`,
`JourneyPlayer`, `StoryPathMap`'s node thumbnails, `JourneyCompletion`, and
`QuickAccount` all continue to use the full-screen photos exactly as before,
per the explicit instruction to preserve them for previews/players/completion.

Verified in-browser: all 4 pathway cards resolve to their dedicated
`*-card-16x9.png`; the Private Pour decision drawer resolves "Follow the
Energy" → `social-shift-choice-3x2.png` and "Follow the View" →
`arrive-choice-3x2.png`, matching the delivered manifest's recommended
mapping exactly; a deeper decision leading to Create resolved to
`create-choice-3x2.png`; a deeper decision leading to The Table correctly
fell back to `journey-completion-fullscreen.png` (no dedicated file for that
motif, working as designed).

**Housekeeping note:** the delivered package also left a nested
`public/assets/kameleon/kameleon-production-visual-assets/fullscreen/`
subfolder containing a duplicate copy of the 5 full-screen photos (an
extraction artifact, not referenced by any code). Left in place rather than
deleted without being asked to, since it's harmless dead weight rather than
something blocking this round's work — flagging it in case the user wants it
removed.

## Integrated production photography — third review round (2026-08-03)

*(Superseded in part by the fourth round above — the "not delivered" gap
noted below has since been filled.)*

**Delivered:** 5 full-screen (9:16, 941×1672 PNG) production photos, posted
inline in the correction-request chat message. Verified non-corrupted,
non-empty, and copied to `public/assets/kameleon/fullscreen/` with
descriptive filenames preserved:

| Filename | Motif | Used for |
|---|---|---|
| `private-pour-fullscreen.png` | `private-pour` | Cozy private library/lounge |
| `social-shift-fullscreen.png` | `social-shift` | Rooftop party |
| `create-fullscreen.png` | `create` | Creative studio |
| `arrive-fullscreen.png` | `arrive` | Rooftop sunset |
| `journey-completion-fullscreen.png` | `the-table` | Four-person toast/skyline |

Wired into the app via `lib/kameleon/production-assets.ts`
(`kameleonFullscreenPhotos`) and consumed everywhere by
`components/kameleon/art/EnvironmentArt.tsx`, which renders the real photo
(with a per-motif `object-position` focal point) whenever one exists for a
motif, falling back to the CSS/SVG composition below only when it doesn't.
`getNodeMotif()` resolves each *tree node* (which may be narratively
relabeled, e.g. "Last Call") back to one of these 5 photographed
environments by title match, falling back to its structural pathway's motif.

**Not delivered — flagged, not fabricated:** the request named a ZIP
(`kameleon-production-visual-assets.zip`) plus dedicated crop sets —
`pathway-thumbnails/{motif}-card-16x9.png` and
`decision-thumbnails/{motif}-choice-3x2.png`. Neither the ZIP nor either
folder's contents were found anywhere searched (`docs/design-reference/`,
`C:\Users\cotye\Downloads\`, `C:\Users\cotye\Videos\`, project root). The two
target directories exist (`public/assets/kameleon/pathway-thumbnails/`,
`public/assets/kameleon/decision-thumbnails/`) but are empty.

**Interim approach (not a substitute — the same approved photo, cropped in
code):** every place that would have used a dedicated 16:9 card crop or 3:2
decision-thumbnail crop instead crops the one delivered full-screen photo for
that motif via CSS (`aspect-[16/9]` / `aspect-[3/2]` containers +
`object-cover` + the per-motif focal point in `kameleonPhotoFocalPoint`).
This is visually close to what a dedicated crop would show since the focal
point was hand-picked per photo, but a real 16:9/3:2 crop composed by a
person will frame the subject more deliberately than an automatic center-ish
crop can.

**Action needed from the user:** if the ZIP or the two thumbnail sets exist,
please repost them (or place them directly in the two target folders above
with the exact filenames the app expects) and they'll be swapped in directly,
replacing the code-cropped interim approach — no other code changes needed
since `EnvironmentArt` already has a single, isolated place
(`kameleonFullscreenPhotos`) where a per-usage-site image source could be
added.

## Newly uploaded assets — second review round

**Search performed:** `docs/design-reference/`, `C:\Users\cotye\Downloads\`
(recursive, all image/audio/3D extensions), `C:\Users\cotye\Videos\`.

**Result:** No files distinctly identifiable as new Kameleon pathway,
environment, poster, or decision-choice imagery were found. Two images were
reposted inline in the chat message; both matched the pixel content of
already-catalogued `09-end-video-decision.png` and `11-journey-completion.png`
— not new assets. `Downloads/` contains several hundred images, but all
identifiable ones belong to unrelated projects (a church sermon campaign, a
different client's dashboard mockups, miscellaneous AI-generated images from
other work) — none carry a Kameleon-related filename or were placed in a
Kameleon-labeled folder, so none were used, to avoid misattributing another
project's imagery into this one.

**Status:** No sound files found either.

**Action needed from the user:** if pathway/environment photography exists
beyond the 11 reference screens, please place it in a clearly labeled folder
(e.g. `docs/design-reference/pathway-assets/`) or repost it with filenames
indicating which pathway/screen/choice it belongs to, and I'll integrate it
directly, replacing the code-generated fallback described below.

## Current code-generated fallback (used where no photography exists)

| Component | File | Used for | Technique |
|---|---|---|---|
| `KameleonEmblem` | `components/kameleon/art/Emblem.tsx` | Brand mark (screens 01, 05, 11) | Hand-authored SVG line art |
| `KameleonBottle` | `components/kameleon/art/Bottle.tsx` | Product silhouette (screens 01, 03, 04) | SVG path + linear gradient (blue→red) |
| `Skyline` | `components/kameleon/art/Skyline.tsx` | City-silhouette texture layer | Deterministic SVG bar pattern (no `Math.random()`, so SSR/CSR match) |
| `EnvironmentArt` | `components/kameleon/art/EnvironmentArt.tsx` | Pathway card/hero/player/map/decision/completion imagery (screens 06–11) | Renders the real production photo (`next/image`, see above) for all 5 motifs now that photography exists; the per-motif CSS gradient + `Skyline` + icon watermark composition only remains reachable as a fallback for a motif with no photo |
| `PortraitGrid` | `components/kameleon/art/PortraitGrid.tsx` | Commercial 2×2 "four cities" (screen 02) | 4× `Skyline` + abstract silhouette figure |
| `Viewfinder` | `components/kameleon/art/Viewfinder.tsx` | Camera-permission circular preview (screen 03) | `KameleonBottle` inside an SVG corner-bracket ring |
| `ParticlePortal` | `components/kameleon/art/ParticlePortal.tsx` | AR intro wine-particle swirl (screen 04) | Canvas 2D, animated, cleans up on unmount/visibility change |

**Loading/missing-image fallback:** `EnvironmentArt` now loads real photos
via `next/image` (`fill`, `object-cover`), so a genuine network/404 failure
case exists for the first time. Next's default broken-image behavior applies
(alt text — currently empty since the image is decorative — plus the
`bg-kameleon-bg` wrapper background shows through) rather than a custom
skeleton/retry; every one of the 5 motifs currently resolves to a file
physically present in `public/`, so this path isn't exercised in practice
today. Everything else in this table remains inline SVG/CSS/Canvas with no
network dependency.

## Audio

No audio files used. All sound is synthesized at runtime via the Web Audio
API (`lib/kameleon/sound.ts`) — see that file for the full list of cues. No
external sound library, no AI-generated audio, no paid service.

## 3D assets

None exist yet. See `docs/KAMELEON_3D_ASSET_REQUIREMENTS.md` for the Phase
5/6 specification of what will eventually be needed.
