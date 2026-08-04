# RetailExp — Phase Tracker

Authoritative development tracker for the RetailExp / Kameleon build. This file
is the single source of truth for phase status. Update it before starting a
phase, after every checkpoint, when a blocker appears, after tests, when ready
for review, after approval, and after any commit or deployment.

Status values: `NOT STARTED`, `IN PROGRESS`, `BLOCKED`, `READY FOR REVIEW`,
`APPROVED`, `COMPLETE`.

A phase is only `COMPLETE` when: its checkpoints are implemented, automated
verification passes, required manual verification passes, known failures are
documented, and the user has approved the result where approval is required.
Writing code alone never earns `COMPLETE`.

---

## Phase 0 — Repository Audit and Baseline

**Goal:** Understand the current repository before changing it.
**Status:** READY FOR REVIEW
**Start date:** 2026-08-02
**Completion date:** —
**Branch:** main
**Commit hash:** (uncommitted — pending approval)
**Routes involved:** none
**Files created or changed:**
- `docs/RETAILEXP_PHASE_TRACKER.md` (new)
- `docs/design-reference/01-11-*.png` (new — copied from `C:\Users\cotye\Downloads\screens`, local design references, not served to the app)

**Checkpoints:**
| # | Checkpoint | Result |
|---|---|---|
| 0.1 | Confirm working directory | `C:\Users\cotye\Documents\RetailExp\retail-exp` |
| 0.2 | Confirm Git branch | `main` |
| 0.3 | Record git status | Clean, up to date with `origin/main` |
| 0.4 | Identify uncommitted user changes | None |
| 0.5 | Inventory existing routes | Only default `app/page.tsx` (create-next-app landing page) |
| 0.6 | Inventory existing components | None — no `components/` directory exists |
| 0.7 | Locate the 11 Kameleon reference images | Found at `C:\Users\cotye\Downloads\screens\01..11-*.png`; copied into `docs/design-reference/` for ongoing reference |
| 0.8 | Identify existing dashboard work | None |
| 0.9 | Identify existing Kameleon work | None |
| 0.10 | Run current lint | Clean, no output/errors |
| 0.11 | Run current TypeScript check | Clean, no errors (`tsc --noEmit`) |
| 0.12 | Run current tests | No test runner/tests configured in repo |
| 0.13 | Run current production build | Succeeds (`next build`, Turbopack), 2 static routes (`/`, `/_not-found`) |
| 0.14 | Record existing warnings/failures | None found |
| 0.15 | Create the phase tracker | This file |
| 0.16 | Present the audit before substantial implementation | Presented in-conversation |

**Automated verification:** `npm run lint`, `npx tsc --noEmit`, `npm run build` — all pass clean on baseline.
**Manual verification:** Repo structure visually inspected; confirmed single commit (`68c6f52 Initialize Retail Experience Next.js application`), untouched `create-next-app` scaffold.
**Known issues:** None.
**Deferred work:** None — this is a true blank-slate start.
**Approval required:** Yes — confirm audit findings and next-phase recommendation before Phase 1 implementation begins.
**Next action:** Await user confirmation, then begin Phase 1 (Design System and Application Foundation).

---

## Phase 1 — Design System and Application Foundation

**Goal:** Create shared RetailExp and Kameleon foundations (tokens, typography, shared UI primitives, layouts, mock data).
**Status:** APPROVED
**Start date:** 2026-08-02
**Completion date:** 2026-08-02 (approved by user; will read COMPLETE once committed)
**Branch:** main
**Commit hash:** (uncommitted — pending approval)
**Routes involved:** `/admin` (foundation preview, replaced in Phase 2), `/experience/kameleon` (foundation preview, replaced in Phase 3)

**Files created or changed:**
- `app/globals.css` — admin + Kameleon color tokens, `@theme inline` wiring, reduced-motion media query
- `lib/cn.ts` — class-name join helper (no new dependency)
- `components/ui/Button.tsx`, `Spinner.tsx`, `Card.tsx`, `Badge.tsx`, `form.tsx` (Label/Input/Textarea/Select/FieldError), `states.tsx` (LoadingState/ErrorState), `ProgressSteps.tsx`
- `components/admin/icons.tsx`, `AdminShell.tsx`
- `lib/admin-nav.ts`
- `app/admin/layout.tsx`, `app/admin/page.tsx` (foundation preview)
- `components/kameleon/FlowHeader.tsx`, `Wordmark.tsx`
- `app/experience/kameleon/layout.tsx`, `app/experience/kameleon/page.tsx` (foundation preview)
- `lib/types/journey.ts` — Experience/Chapter/VideoNode/Choice/ViewerProgress/ReplayState data model
- `lib/mock-data/kameleon-journey.ts` — typed mock journey (5 nodes, 4 entry paths, converges at The Table)
- `lib/mock-data/clients.ts` — Kameleon `ClientRecord` + mock analytics snapshot (clearly typed `isMock: true`)

**Checkpoints:**
| # | Checkpoint | Result |
|---|---|---|
| 1.1 | Shared colors/design tokens | Done — separate `admin-*` (neutral, professional) and `kameleon-*` (near-black/copper/red/blue) token sets in `globals.css` |
| 1.2 | Typography | Done — Geist (existing) for admin + body text; Cormorant Garamond (`next/font/google`, self-hosted) added as Kameleon display font |
| 1.3 | Buttons | Done — `Button` component, `brand`/`variant`/`size`/`loading` props |
| 1.4 | Cards | Done — `Card`/`CardHeader`/`CardTitle`/`CardDescription` |
| 1.5 | Badges | Done — `Badge` with neutral/success/warning/danger/copper tones |
| 1.6 | Form controls | Done — `Label`/`Input`/`Textarea`/`Select`/`FieldError` |
| 1.7 | Loading/error states | Done — `LoadingState`/`ErrorState`, brand-aware |
| 1.8 | Responsive admin layout | Done — `AdminShell`: desktop sidebar, mobile hamburger drawer; unbuilt nav items (Experiences/Media/Analytics/Settings) shown disabled with a "Soon" badge rather than dead links |
| 1.9 | Mobile Kameleon experience shell | Done — `app/experience/kameleon/layout.tsx`: near-black theme, `max-w-[520px]` mobile-first column, safe-area insets, `viewport-fit: cover` |
| 1.10 | Reusable progress indicator | Done — `ProgressSteps` (used by `KameleonFlowHeader`; reusable in admin too) |
| 1.11 | Mock client data | Done — `lib/mock-data/clients.ts` |
| 1.12 | Mock Kameleon journey data | Done — `lib/mock-data/kameleon-journey.ts` against the `lib/types/journey.ts` model. Full content authoring (all branches, real durations) deferred to Phase 3 |
| 1.13 | Accessibility basics | Verified: all text/background/button color pairs checked programmatically against WCAG contrast — worst case 4.81:1 (admin muted text), best 17.4:1; focus-visible rings on all interactive elements; `role="status"`/`role="alert"` on loading/error states; icon-only buttons have `aria-label` |
| 1.14 | Mobile overflow | Verified via headless iframe test at 360px width on both `/admin` and `/experience/kameleon` — zero horizontal overflow, no offending elements |
| 1.15 | Lint, TypeScript, build | All clean: `npm run lint`, `npx tsc --noEmit`, `npm run build` (routes `/`, `/admin`, `/experience/kameleon` all prerender as static) |

**Automated verification:** Lint/tsc/build clean. Programmatic WCAG contrast check (script run via browser console, not committed — see checkpoint 1.13). Headless iframe overflow check at 360px (see 1.14).
**Manual verification:** Visually reviewed both `/admin` (desktop 1280px) and `/experience/kameleon` (rendered at mobile-constrained width via the layout's own `max-w`) in Chrome; no console errors on either route.
**Known issues:**
- Browser-extension `resize_window` did not actually resize the automated test viewport in this environment (confirmed via `window.innerWidth`), so true device-width rendering was verified via a headless iframe technique instead of a literal resized window. Worth re-checking on a real phone in Phase 3/10.
- Discovered and fixed a real RSC constraint along the way: Server Components cannot pass inline event-handler props to Client Components — `Button` is now explicitly `"use client"`, and the two foundation-preview pages are client components since they wire up demo interactivity directly.
**Deferred work:** Root `/` marketing page still the default `create-next-app` template — not in scope for Phases 1–3, revisit later. Full Kameleon journey content (all chapters/branches, real video assets) is Phase 3/4 scope.
**Approval required:** Yes — review gate: show design foundation before advancing to Phase 2.
**Next action:** Await review of the design foundation, then begin Phase 2 (Basic Admin Dashboard).

---

## Phase 2 — Basic Admin Dashboard

**Goal:** Build the initial internal RetailExp admin interface (`/admin`, `/admin/clients`, `/admin/clients/kameleon`).
**Status:** APPROVED
**Start date:** 2026-08-02
**Completion date:** 2026-08-02 (approved by user)
**Branch:** main
**Commit hash:** (uncommitted — pending approval)
**Routes involved:** `/admin`, `/admin/clients`, `/admin/clients/kameleon`

**Files created or changed:**
- `app/admin/page.tsx` (rewritten — real Overview), `app/admin/clients/page.tsx` (new), `app/admin/clients/kameleon/page.tsx` (new)
- `components/admin/DevAuthNotice.tsx`, `MockDataNote.tsx`, `CopyUrlButton.tsx`, `ExperiencePreviewModal.tsx` (new)
- `components/admin/AdminShell.tsx` (added persistent dev-auth banner)
- `components/ui/Button.tsx` (added `LinkButton` for nav-styled-as-button, extracted shared `buttonClasses`)
- `components/ui/Card.tsx` (added `padded` prop to avoid unreliable class-override ordering)
- `lib/mock-data/admin-activity.ts`, `lib/format.ts`, `lib/kameleon-mobile-states.ts` (new)

**Checkpoints:**
| # | Checkpoint | Result |
|---|---|---|
| 2.1 | Build `/admin` | Done — real Overview page (stat cards, Kameleon summary, recent activity) |
| 2.2 | Build admin sidebar | Done in Phase 1 (`AdminShell`), reused as-is |
| 2.3 | Build overview cards | Done — total/active clients, journey completion rate (flagged mock) |
| 2.4 | Build recent activity | Done — `lib/mock-data/admin-activity.ts`, clearly flagged "Mock data" |
| 2.5 | Add Kameleon summary | Done — summary card on Overview linking to the client detail page |
| 2.6 | Build `/admin/clients` | Done — list view, links to per-client detail page |
| 2.7 | Add Kameleon client record | Done in Phase 1 (`lib/mock-data/clients.ts`), rendered here |
| 2.8 | Build `/admin/clients/kameleon` | Done — full detail page per spec |
| 2.9 | Add copy-URL behavior | Done — `CopyUrlButton` builds the URL from `window.location.origin` at click time (never a hardcoded host/port), verified in-browser ("Copied!" state confirmed) |
| 2.10 | Add Open Experience behavior | Done — `LinkButton` to the relative route `/experience/kameleon`, opens in a new tab |
| 2.11 | Add labeled media placeholders | Done — brand assets/commercial/AR sections all show explicit "Placeholder" badges |
| 2.12 | Add development-only authentication notice | Done — persistent banner in `AdminShell`, present on every `/admin/*` route, states plainly that there is no auth |
| 2.13 | Test desktop | Verified in Chrome at 1311×902: Overview, Clients, Kameleon detail all render correctly; Copy URL and Preview modal interactions confirmed working |
| 2.14 | Test mobile | Verified via headless iframe at 360–375px for all three routes: zero horizontal overflow; mobile drawer opens and renders both nav links correctly |
| 2.15 | Run lint, TypeScript, build | All clean; 6 static routes total (`/`, `/admin`, `/admin/clients`, `/admin/clients/kameleon`, `/experience/kameleon`, `/_not-found`) |

**Automated verification:** `npm run lint`, `npx tsc --noEmit`, `npm run build` all clean. Headless iframe overflow check at 360px (all 3 admin routes, zero overflow). Headless drawer-interaction check confirming the mobile nav opens and renders its links.
**Manual verification:** Visually reviewed all three admin routes in Chrome at desktop width; exercised Copy URL (confirmed "Copied!" feedback) and Preview (confirmed the modal correctly iframes `/experience/kameleon`); no console errors on any route.
**Known issues:** None new. Same `resize_window` limitation noted in Phase 1 — mobile checks continue to use the headless-iframe technique instead of a literally resized browser window.
**Deferred work:** Experiences/Media/Analytics/Settings nav items remain disabled placeholders (by design — those routes aren't in Phase 2's checkpoint list). Real auth/route-protection is Phase 7.
**Approval required:** Yes — manual review of admin dashboard and client navigation.
**Next action:** Await review, then begin Phase 3 (Kameleon Frontend Experience — the full clickable mobile journey on mock data).

## Phase 3 — Kameleon Frontend Experience

**Goal:** Build the complete clickable mobile journey using mock data (all 18 Kameleon mobile states).
**Status:** READY FOR REVIEW — fifth correction pass (full-bleed pathway intro + compact pathway-selection cards) complete, all automated verification passing; not APPROVED, not COMPLETE
**Start date:** 2026-08-02
**Completion date:** —

### Manual review failure record (2026-08-03)

The user reviewed the first Phase 3 implementation against the 11 approved
screenshots and the full functional spec, and rejected it. Every failure is
recorded verbatim below and tracked to a correction.

| # | Review failure | Root cause | Correction |
|---|---|---|---|
| 1 | Experience starts at the video-pathway screen instead of the commercial opening | `commercialCompleted`/`authed` were persisted permanently in `localStorage` from earlier dev testing, so `HYDRATE` resumed straight to `choose-path` for what should have been treated as a fresh session | Opening-gate state (commercial/AR completion) is now session-scoped (`sessionStorage`), separate from long-term story progress (`localStorage`). A brand-new browser session always starts at Tap to Begin regardless of old saved story progress. See "Commercial opening" section below. |
| 2 | Phase 3 AR prototype does not display the expected graphics | `ArIntroduction.tsx` shipped as plain outlined text circles, no bottle, no particles, no camera-scene backdrop | Rebuilt with a Canvas particle system, SVG bottle centerpiece, composed portal-ring art, and HUD-style header. See `KAMELEON_VISUAL_REFERENCE_MATRIX.md` §04. |
| 3 | Several pathway tabs/cards have no visual artwork | No imagery system existed — cards/backgrounds were flat color only | Added a shared, parameterized `EnvironmentArt` component (SVG/CSS composed scenes, no photography) reused across screens 02/06/07/08/09/10/11. |
| 4 | End-of-video choices leave the video player instead of appearing over the completed video | `EndOfVideoDecision` was a separate top-level screen/route in the state machine | Converted into `ChoiceOverlay`, rendered conditionally inside the now-persistent `JourneyPlayer` component. The player never unmounts between connected nodes. |
| 5 | The video journey does not demonstrate the expected continuing binary branching structure | Original mock data was one asymmetric 5-node graph, not a true binary tree, and choices weren't resolved through a generic destination-node model | Replaced with `lib/kameleon/pathway-model.ts` (typed binary-tree data model per the corrected spec) and real multi-level trees in `lib/mock-data/kameleon-pathways.ts`. |
| 6 | Continue Journey does not always restore the correct state | No player-status state existed to distinguish not-started / playing / awaiting-choice / terminal | `ViewerProgress` now tracks `playerStatus` and per-node elapsed time; `JourneyPlayer` hydrates its sub-state from this on mount/resume. |
| 7 | The Story Path Map is a simplified list instead of the approved visual branching map | `StoryPathMap` rendered a flat `.map()` over all nodes | Rebuilt around `lib/kameleon/tree-layout.ts`, a generic tree-layout function that renders parent→child rows with SVG connectors, matching screen 10. |
| 8 | Implemented screens do not match the approved screenshots closely enough | Screens were built from the written spec without close-enough visual reference to the screenshots | `docs/KAMELEON_VISUAL_REFERENCE_MATRIX.md` created; every screen rebuilt against its documented differences. |
| 9 | The approved screenshots were not used thoroughly enough as the visual source of truth | Same as above | Visual priority order now formally documented and followed: screenshot → functional correction → design tokens → responsive adaptation. |

**Correction status:** See the updated checkpoint table and verification records further down this section, added after the correction pass.

### Second manual review failure record (2026-08-03)

A second review (with an uploaded walkthrough video and a screenshot of a
horizontal-scrollbar regression) rejected the first correction pass. Full
detail in `docs/KAMELEON_WALKTHROUGH_REVIEW.md`. **Access limitation
disclosed to the user before any further work:** the referenced walkthrough
video (`C:\Users\cotye\Videos\Kameleon.mp4`, confirmed present, 44.7MB)
cannot be watched or processed — Claude Code's tools read images/PDFs/text
only, not video. All corrections below come from the accompanying written
review, which was independently exhaustive.

| # | Failure | Correction |
|---|---|---|
| 1 | "Ground Detected / Place Portal" screens were a fake, mostly-blank customer-facing placement sequence | Removed `ar-scanning`/`ar-placement` entirely; `ar-permission` → `ar-introduction` directly |
| 2 | Screen 04 needed explicit confirmation it represents one ground-anchored simulated visual, not pathway tabs or a placement page | Confirmed with the user; no separate placement screen exists to confuse with it |
| 3 | End-of-video choices needed to be a *timed* drawer over the still-playing video (cue → handle → drawer), not a post-completion full-screen overlay | Rebuilt `JourneyPlayer`/new `DecisionDrawer.tsx` around `lib/kameleon/decision-timing.ts`; video plays to natural completion while the drawer stages reveal at configurable per-node thresholds (default 10s/7s/5s) |
| 4 | No sound design | Added `lib/kameleon/sound.ts` — Web Audio API synthesized tones only (no files, no paid service), mute toggle, persisted preference, visibility-based suspend/resume, disposal on unmount |
| 5/6 | Story Path Map produced a page-level horizontal scrollbar (confirmed by screenshot) | Rewrote as a recursive vertically-indented tree (`TreeBranch` in `StoryPathMap.tsx` + `lib/kameleon/tree-layout.ts`) — never more than 2 cards wide at any point, no horizontal-scroll container; added `min-w-0` throughout and an `overflow-x: hidden` backstop on `html`/`body` |

**New documentation created:** `docs/KAMELEON_WALKTHROUGH_REVIEW.md`,
`docs/KAMELEON_ASSET_MANIFEST.md` (no new distinct Kameleon assets found
beyond the original 11 references — Downloads searched and found to contain
only unrelated-project imagery), `docs/KAMELEON_3D_ASSET_REQUIREMENTS.md`
(Phase 5/6 specification only, no assets implied to exist).

**Deferred from this pass (scope triage, disclosed to user):** anchor-based
`scrollIntoView` section navigation (map is now short/vertical, lower
urgency); per-node authored `decisionTiming` overrides beyond shared
defaults (data model supports it, not yet authored per-node); full GLB/3D
pipeline (explicitly Phase 5/6 scope).

**Bug found and fixed during verification, not in the original review:** the
Story Path Map's recursive tree nested a 2-column CSS grid at every depth
level, which halves available width at each level — fine for 2 levels, but
by the 4th level (Private Pour's deepest branch) cards collapsed to ~4px
wide (confirmed via `offsetWidth` measurement, not just visual inspection).
Fixed by capping the 2-column split to the first branch point only; deeper
levels stack single-column. Re-verified overflow-free at the deepest branch
at a genuine 375px width after the fix.

**Operational note:** running a production build (`npm run build`) while the
dev server was still active corrupted the dev server's `.next/dev` cache
(shared directory, `rm -rf .next` mid-session pulled it out from under the
running process), causing transient 500s. Fixed by stopping the dev server
before rebuilding and restarting fresh — confirmed stable across repeated
requests afterward. No application code was at fault.

**Final verification results (2026-08-03, after all D1–D6 corrections):**
- `npm run lint`, `npx tsc --noEmit`, `npm run build` — all clean.
- Automated headless-iframe overflow sweep: 54 checks across 6 required
  widths (320/360/375/390/412/430px) × 9 screen states (tap-to-begin through
  story-map) — zero overflow.
- Deepest branch (Private Pour → Social Shift → Create, 3 levels) checked
  separately at 375px after the map fix — zero overflow, no collapsed
  elements.
- Manual browser verification: fake AR portal screens confirmed removed
  (permission → AR intro directly); decision drawer's three reveal stages
  (cue at ~9s remaining, handle at ~6s, full drawer at ~4s) each visually
  confirmed at the correct thresholds; early choice selection confirmed to
  defer transition until natural video end, then transition automatically;
  story map confirmed to reflect real progress (completed/current/available/
  locked) after the fix.
- No console errors observed during any of the above.

### Third correction round — asset integration and navigation (2026-08-03)

A third correction request asked for: integration of real production
photography ("PHASE 3 ASSET-INTEGRATION AND NAVIGATION CORRECTION"), a
bottom-fixed "Access AR Experience" button that auto-reveals on commercial
completion, visible-text "Back to Pathways" navigation (not icon-only) on
the pathway preview/player/map, and a re-verification of zero horizontal
overflow at 6 named viewport widths across all key states. Full detail in
`docs/KAMELEON_ASSET_MANIFEST.md` and the third-round section of
`docs/KAMELEON_VISUAL_REFERENCE_MATRIX.md`.

**Assets:** 5 full-screen (941×1672 PNG) production photos — one per
environment (Private Pour, Social Shift, Create, Arrive, The Table) — were
supplied inline in the chat and copied into
`public/assets/kameleon/fullscreen/`. A claimed ZIP
(`kameleon-production-visual-assets.zip`) and two dedicated crop sets
(`pathway-thumbnails/`, `decision-thumbnails/`) were searched for
(`docs/design-reference/`, `Downloads/`, `Videos/`, project root) and not
found — flagged to the user rather than fabricated; the two target
directories exist but are empty pending those files. `lib/kameleon/
production-assets.ts` wires the 5 delivered photos into `EnvironmentArt`,
which now renders real photography (via `next/image`) everywhere it
previously rendered a CSS/SVG composition, falling back to that composition
only for a motif without a photo (none currently).

**Navigation:** `CommercialVideo.tsx` gained a `fixed inset-x-0 bottom-0`
"Access AR Experience" tray, hidden until the commercial completes, then
auto-revealing with a slide/fade transition, auto-focus, and an
`aria-live="polite"` availability announcement. `SelectedPathPreview.tsx`
and `StoryPathMap.tsx` gained visible "← Back to Pathways" text buttons
(44px-minimum touch target) in place of icon-only controls; `JourneyPlayer`
does the same specifically for the first chapter (icon-only "back to map"
remains once a choice has been made, since an intermediate map state exists
to return to at that point). `StoryPathMap` also gained anchor-based
"Your Path / Continue" section navigation respecting
`prefers-reduced-motion`.

**Bug found and fixed during this round's own verification (not part of the
original request):** `EnvironmentArt`'s wrapper `<div>` hardcoded a
`relative` position class that silently beat a caller-supplied `className="absolute inset-0"`
override (`lib/cn.ts` performs no Tailwind conflict resolution, so whichever
utility happens to compile later in the stylesheet wins regardless of
call-site order) — on `SelectedPathPreview` specifically, this made the
hero photo size itself to its own 923px-tall natural aspect ratio instead of
its intended 256px (`h-64`) container, pushing the pathway title,
description, and "Begin" button entirely off-screen below the fold. Fixed by
moving `relative` to an inner wrapper never touched by callers and switching
the photo `<Image>` from explicit `width`/`height` to `fill`, so every usage
site (`h-64` hero, `aspect-[16/9]` cards, `h-10` map thumbnails,
`aspect-[3/2]` decision cards, full-bleed backgrounds) now sizes purely to
its own container regardless of the image's native dimensions.

**Verification performed after the fix:**
- `npx tsc --noEmit`, `npm run lint` — both clean.
- Every `EnvironmentArt` usage site re-checked visually in-browser
  (`ChooseFirstPath` cards, `SelectedPathPreview` hero, `JourneyPlayer`
  background, `DecisionDrawer` thumbnails, `StoryPathMap` node thumbnails,
  `JourneyCompletion` background) — all render the real photo correctly
  cropped to their container, no oversized/undersized images, no content
  pushed off-screen.
- Automated headless-iframe overflow sweep across the 6 required widths
  (320/360/375/390/414/430px), each driven through tap-to-begin → commercial
  (completed) → AR intro → continue-without-AR → quick-account → choose-path
  → selected-path-preview → player → decision-drawer → story-map — zero
  horizontal overflow at every width/state combination (60 checks total).
- Manual playthrough to a terminal node (Private Pour → Social Shift →
  Create → The Table) confirmed the journey-completion background (same
  `absolute inset-0` code path as the fixed hero) also renders correctly,
  zero overflow.
- No console errors observed during any of the above.

### Fourth correction round — dedicated thumbnail sets (2026-08-03)

The third round's flagged gap (missing ZIP / `pathway-thumbnails/` /
`decision-thumbnails/`) was resolved: the full asset package, including its
own `ASSET-MANIFEST.md`, arrived at `public/assets/kameleon/`. Full detail
in the fourth-round section of `docs/KAMELEON_ASSET_MANIFEST.md`.

**Change:** `lib/kameleon/production-assets.ts` gained
`kameleonPathwayThumbnails`/`kameleonDecisionThumbnails` lookup maps;
`EnvironmentArt` gained a `thumbnailKind?: "pathway-card" | "decision"` prop
that prefers the dedicated pre-composed crop over the full-screen-photo crop
used since round three, falling back to the full-screen crop only for
`the-table` (no dedicated file exists for it — it's never a selectable
pathway or one of the 4 photographed decision destinations).
`ChooseFirstPath.tsx` and `DecisionDrawer.tsx` are the only two call sites
that changed; every screen using the full-screen photos directly (selected-
path preview, player, story-map thumbnails, journey completion, quick
account) is untouched, per the explicit instruction to preserve those.

**Verification performed:**
- `npx tsc --noEmit`, `npm run lint`, `npm run build` — all clean (dev
  server stopped before the build and restarted cleanly afterward, per the
  operational lesson from earlier rounds).
- In-browser: all 4 pathway cards confirmed loading their dedicated
  `*-card-16x9.png`; the Private Pour decision drawer confirmed mapping
  "Follow the Energy"/"Follow the View" to `social-shift-choice-3x2.png`/
  `arrive-choice-3x2.png` exactly as the delivered manifest recommends; a
  deeper "Follow the Craft" decision confirmed resolving to
  `create-choice-3x2.png`; a deeper "Follow the Toast" decision (destination
  motif `the-table`, no dedicated file) confirmed gracefully falling back to
  `journey-completion-fullscreen.png` rather than erroring or showing a
  broken image.
- Automated headless-iframe overflow sweep re-run across the 6 required
  widths (320/360/375/390/414/430px) × the same 10 states as the third
  round — zero horizontal overflow at every width/state combination (60
  checks total).
- No console errors observed during any of the above.

**Housekeeping flagged, not acted on:** the delivered package also contains
a nested `public/assets/kameleon/kameleon-production-visual-assets/fullscreen/`
subfolder with a duplicate copy of the 5 full-screen photos (an extraction
artifact, unreferenced by any code). Left in place since it's harmless and
wasn't something the user asked to have removed — flagged in case cleanup is
wanted.

### Fifth correction round — full-bleed pathway intro + compact selection cards (2026-08-03)

Two corrections applied together, as requested.

**1. Selected Pathway Preview — full-bleed background.** The photo previously
filled only a `h-64` (256px) banner at the top with a large empty black area
below. `SelectedPathPreview.tsx` was rewritten: the root is now
`relative flex flex-1 flex-col overflow-hidden` with the pathway photo at
`absolute inset-0` behind everything (not a separate rectangular hero), two
stacked gradient layers on top for readability (a black vertical vignette —
dark top/bottom, lighter center — plus a subtle warm red tint), and all
content (back button, chapter indicator, icon, title, description, meta,
Begin button, "Choose another path", saved-progress caption) in a
`relative z-10` layer above. `EnvironmentArt`'s existing `fill`-based
`next/image` handles the cover/object-position behavior; no new image
component was needed. The `h-64`/`-bottom-7` absolutely-positioned icon
badge and the separate opaque bottom panel are both gone.

**2. Choose First Path — compact horizontal cards.** Cards were tall
stacked image-on-top rectangles, only 1-2 fitting on screen without
scrolling. Rebuilt as compact horizontal rectangles (thumbnail left ~42%,
info right ~58%, left-edge color accent) in a CSS grid
(`grid-rows-4`, i.e. `minmax(0,1fr)` per row — deliberately **not**
`minmax(90px,…)`, which was tried first and produced a hard floor that
overflowed the viewport at 320×568 by 204px since `minmax()` floors don't
shrink; the found-and-fixed detail is recorded in
`docs/KAMELEON_VISUAL_REFERENCE_MATRIX.md`). Each card caps at `max-h-32`
(128px) with `self-center` so leftover vertical space on taller viewports
distributes evenly around each card rather than pinning all the slack to the
bottom of an oversized track. Cards use the dedicated `thumbnailKind="pathway-card"`
crop from the fourth round.

**Verification:**
- `npx tsc --noEmit`, `npm run lint`, `npm run build` — all clean (dev
  server stopped before build, restarted after).
- Automated headless-iframe checks (both horizontal **and** vertical
  overflow, `scrollWidth`/`scrollHeight` vs `clientWidth`/`clientHeight`) at
  all 6 requested exact viewport pairs — 320×568, 360×640, 375×667,
  390×844, 393×873, 430×932 — across both the choose-path and
  selected-path-preview screens: zero overflow in both directions at every
  size, all 4 cards always present, Begin/pathway-card buttons always fully
  within the viewport without scrolling.
- Measured card heights: 320×568 → 80.9px (below the 90px target — the
  explicit no-scroll requirement takes priority over the soft touch-target
  target at the shortest tested viewport, and 80.9px remains well above the
  44px WCAG minimum); 360×640 → 108.5px; 375×667 → 115.25px; 390×844,
  393×873, 430×932 → 128px (capped).
- Visually confirmed in-browser at 320×568, 390×844, and 430×932: all four
  pathway thumbnails load their correct dedicated crop, no separate
  hero-image boundary is visible on the pathway-intro screens, text remains
  readable over every one of the 4 photographed environments (Private Pour,
  Social Shift, Create, Arrive), and card text no longer wraps/overlaps at
  any tested width.
- No console errors observed during any of the above.

**Status: READY FOR REVIEW.** Not APPROVED, not COMPLETE — awaiting user
review. Phase 4 not started. Dev server running at the URL reported below.
**Branch:** main
**Commit hash:** (uncommitted — pending approval)
**Routes involved:** `/experience/kameleon` (now a full client-side session/state machine instead of a static page)

**Architecture decision (asked and confirmed with the user):** No placeholder video file exists locally with a clear license to use (only third-party Adobe/Microsoft sample media was found, and ffmpeg isn't installed to synthesize one). Per the user's choice, the commercial and 360 chapter players use **simulated playback**: a real, fully-functional control surface (play/pause, seek, mute, captions toggle, fullscreen via the real Fullscreen API, replay, loading/error states) driven by a timer instead of a decoded video file. Clearly labeled as placeholder in the UI. Real local placeholder media can be wired in later without changing the player's public API.

**State model:** The 18 "Kameleon Mobile States" map onto 15 screens in `lib/kameleon/types.ts`. Two states are intentionally not separate screens:
- **AR Tracking Lost** — deferred entirely; there's no live tracking to lose without real WebAR (Phase 5/6 will add this for real, per its own checkpoints 6.13).
- **Replay / Explore Another Path** — implemented as reducer actions (`REPLAY_JOURNEY`, `EXPLORE_DIFFERENT_PATH`) reachable from `journey-complete` and `story-map`, not dedicated screens.

**Files created or changed:**
- `lib/kameleon/types.ts`, `actions.ts`, `reducer.ts`, `useKameleonSession.ts`, `storage.ts`, `path-map.ts` — session state machine + localStorage persistence
- `components/kameleon/MockVideoPlayer.tsx` — shared simulated player used by both the commercial and 360 chapters
- `components/kameleon/icons.tsx` — player/AR control icons
- `components/kameleon/screens/*.tsx` (15 files) — one per screen: TapToBegin, CommercialVideo, ArPermission, ArScanning, ArPlacement, ArIntroduction, ArUnsupportedFallback, QuickAccount, ChooseFirstPath, SelectedPathPreview, VideoPlayer360, EndOfVideoDecision, LoadingNextChapter, StoryPathMap, JourneyCompletion
- `app/experience/kameleon/page.tsx` — rewritten as the orchestrator (client component, switches on session state)

**Checkpoints:**
| # | Checkpoint | Result |
|---|---|---|
| 3.1 | Tap-to-begin screen | Done |
| 3.2 | Commercial player | Done — full custom controls, simulated playback (see architecture note) |
| 3.3 | Commercial-completion gate | Done — "Continue to AR" is genuinely disabled (with lock icon) until the player reports 100% watched; verified in-browser |
| 3.4 | Camera-permission explanation | Done — `ArPermission`, matches reference layout |
| 3.5 | AR scanning mock state | Done — `ArScanning` (covers Ground Scanning + Ground Found sub-phase) |
| 3.6 | AR placement mock state | Done — `ArPlacement`, tap-to-place ring + opening animation |
| 3.7 | AR introduction mock state | Done — `ArIntroduction`: 4 environment rings, Sound/Captions/Recenter/Help/Exit AR controls, Enter the Journey |
| 3.8 | Quick-account interface | Done — real client-side validation, mock-auth disclosure text, Apple/Google buttons visibly disabled (not faked) pending Phase 7 |
| 3.9 | Route-selection page | Done — `ChooseFirstPath`, driven by `kameleonExperience.entryNodeIds` |
| 3.10 | Selected-path preview | Done — `SelectedPathPreview` |
| 3.11 | 360-player interface | Done — `VideoPlayer360` (360° badge, look-around hint, captions); real 360 touch/orientation engine is Phase 4 scope |
| 3.12 | End-of-video choice interface | Done — `EndOfVideoDecision`, handles both 1-choice and 2-choice nodes |
| 3.13 | Next-chapter loading state | Done — `LoadingNextChapter` |
| 3.14 | Story-path map | Done — `StoryPathMap` with a simplified reachability model (`lib/kameleon/path-map.ts`); renders all 5 environments flat rather than the viewer's exact branching tree (documented as a scope simplification, not a bug) |
| 3.15 | Journey-completion page | Done — `JourneyCompletion`, includes a real Share (Web Share API with clipboard fallback) |
| 3.16 | Replay flow | Done — `REPLAY_JOURNEY` action, verified in-browser (resets progress, returns to Choose First Path) |
| 3.17 | Explore-another-path flow | Done — `EXPLORE_DIFFERENT_PATH` action, verified in-browser |
| 3.18 | Persist mock progress locally | Done — `lib/kameleon/storage.ts` (localStorage), verified by reloading mid-journey and confirming correct resume screen |
| 3.19 | Confirm all states are reachable | Verified — every screen exercised via an interactive browser walkthrough (commercial → AR (both allow and skip branches) → quick account → choose path → 4-chapter branching playthrough → finale → replay/explore/share), plus an automated scripted pass through 11 of the 15 screens |
| 3.20 | Test common phone sizes | Verified at 375px via a headless-iframe automated walkthrough (11 screens, zero horizontal overflow) and via the interactive browser session (ar-scanning/placement/introduction/journey-complete confirmed visually, no overflow observed) |
| 3.21 | Run lint, TypeScript, and build | All clean; 6 static routes |

**Automated verification:** `npm run lint`, `npx tsc --noEmit`, `npm run build` all clean. Scripted headless-iframe walkthrough at 375px covering tap-to-begin → commercial → AR-skip fallback → quick-account → choose-path → selected-path-preview → video-player → end-of-video → story-map, zero overflow at every step.
**Manual verification:** Full interactive playthrough in Chrome — commercial completion gate (confirmed locked→unlocked), AR scanning→ground-found→placement→introduction (all controls exercised: sound, captions, recenter, help, exit AR), quick-account form validation, a 4-chapter branching playthrough (Private Pour → Social Shift, then reset and Create → The Table), story-path-map status computation (complete/current/available/locked), journey-completion stats and breadcrumb, replay and explore-another-path, playback-error simulation and retry, and localStorage persistence across a full page reload. No console errors observed.
**Known issues:**
- Resuming a video via "Continue {chapter}" from the story-path map restarts that chapter's video from 0:00 rather than returning to its end-of-video choice screen, even when the video was already fully watched. Minor UX polish item, not a functional bug (progress/completion state is unaffected).
- Share button's clipboard-fallback path couldn't be fully verified against real macOS/Windows clipboard content in this automated browser session (permission prompt not obtainable via automation); the "Copied!" pattern is identical to the already-verified admin Copy URL button, so this is low risk.
- Story-path map uses a simplified flat reachability model rather than rendering the viewer's exact branching tree (see checkpoint 3.14). *(Superseded by the second correction round — see below; the map now renders the real tree.)*
- **(Third round)** Dedicated `pathway-thumbnails/{motif}-card-16x9.png` and `decision-thumbnails/{motif}-choice-3x2.png` crop sets were requested but never delivered — pathway cards and decision-drawer thumbnails currently crop the one delivered full-screen photo per motif via CSS `object-position` instead of a purpose-composed crop. See `docs/KAMELEON_ASSET_MANIFEST.md`.
**Deferred work:** Real local placeholder video files (commercial + chapters) — simulated playback stands in until media is supplied. Real 360 touch/orientation navigation engine (Phase 4). Real WebAR ground tracking and AR Tracking Lost UI (Phase 5/6). Real Supabase auth (Phase 7).

**Files created or changed — third correction round:**
- `lib/kameleon/production-assets.ts` — motif → real-photo path map, intrinsic dimensions, per-motif focal point, and `getNodeMotif()` title-resolution helper
- `components/kameleon/art/EnvironmentArt.tsx` — renders real photography via `next/image` (`fill`) when available; wrapper-div position-class bug fixed (see above)
- `components/kameleon/screens/CommercialVideo.tsx` — bottom-fixed "Access AR Experience" tray
- `components/kameleon/screens/SelectedPathPreview.tsx`, `components/kameleon/JourneyPlayer.tsx`, `components/kameleon/screens/StoryPathMap.tsx` — visible "Back to Pathways" navigation, anchor-nav (map only)
- `components/kameleon/screens/ChooseFirstPath.tsx`, `components/kameleon/DecisionDrawer.tsx`, `components/kameleon/screens/JourneyCompletion.tsx`, `components/kameleon/screens/QuickAccount.tsx` — consume the real photography via `EnvironmentArt`
- `public/assets/kameleon/fullscreen/*.png` (5 files) — the delivered production photography
- `public/assets/kameleon/pathway-thumbnails/`, `public/assets/kameleon/decision-thumbnails/` — created, currently empty pending the missing crop sets
**Approval required:** Yes — the complete mock experience must be clickable and reviewed before real AR or backend work begins.
**Next action:** Await review, then begin Phase 4 (360 Video Prototype) — proving the interactive touch/orientation 360 player with real local placeholder media once available, or continuing with simulated playback if the user prefers to defer media sourcing further.

## Phase 4 — 360 Video Prototype

**Goal:** Prove the interactive 360° video player without a paid SDK.
**Status:** NOT STARTED
**Approval required:** Yes — player must work with local media before storage integration.

## Phase 5 — Real WebXR Ground-Plane AR Prototype

**Goal (as actually directed, 2026-08-03):** Replace the simulated AR screens
with a functioning mobile-browser AR prototype: real WebXR `immersive-ar`
session, real hit-test-based ground/surface detection, tap-to-place, a real
animated GLB anchored to the detected surface, and an honest fallback where
WebXR AR isn't available. **Started ahead of Phase 4** (360 Video Prototype,
still NOT STARTED) and **built on a different engine than the original
master-spec description above** — the actual request specified Three.js +
native WebXR (`navigator.xr`, Hit Test API) instead of the originally-planned
8th Wall engine, and explicitly excluded MindAR for ground-plane detection
(MindAR remains a future option for image-target/face-tracking only, not
ground-plane). This section describes what was actually built, superseding
the one-line description above it.
**Status:** READY FOR MOBILE AR REVIEW — desktop-verifiable pieces (capability
detection honesty, fallback viewer, error handling, cleanup, existing-flow
non-regression) are done; **ground-plane hit-test placement itself is
unverified** — it has never run on a physical AR-capable device. Not
APPROVED, not COMPLETE.
**Start date:** 2026-08-03
**Completion date:** —

### Architecture

- `lib/kameleon/ar/` — engine-agnostic-of-React logic, each concern in its
  own file: `ar-types.ts` (shared types + the single `SAMPLE_MODEL_URL`
  constant), `capability-detection.ts` (secure-context/`navigator.xr`/
  `isSessionSupported` check), `webxr-session.ts` (session request lifecycle
  + honest DOMException→ARError mapping), `hit-test.ts` (hit-test source +
  per-frame pose reading), `model-loader.ts` (GLTFLoader + `SkeletonUtils`
  clone-per-placement + disposal), `animation-controller.ts`
  (`AnimationMixer` wrapper, one clip at a time), `reticle.ts` and
  `energy-rings.ts` (procedural Three.js visuals, no external assets).
- `components/kameleon/ar/` — `KameleonARExperience.tsx` is the orchestrator:
  owns the Three.js/WebXR imperative lifecycle entirely through refs (never
  React state for the render loop), and layers React UI
  (`ARStartScreen`, `ARScanningOverlay`, `ARControls`, `ARHelpPanel`,
  `ARErrorState`, `ARUnsupportedFallback`) on top via a WebXR `dom-overlay`.
  It owns its own internal phase state machine (capability-check →
  start-screen → requesting-session → scanning → surface-found → placed →
  tracking-lost/error/unsupported) rather than each phase being a top-level
  Kameleon `screen` — the outer session reducer only sees "AR screen active"
  (`ar-permission`) and two exit callbacks (`onEnterJourney`,
  `onSkipAr` → `ENTER_JOURNEY` / `CONTINUE_WITHOUT_AR_FALLBACK`, both landing
  on `quick-account` today, kept as distinct actions for the future
  analytics plan below).
- Loaded via `next/dynamic(..., { ssr: false })` from
  `app/experience/kameleon/page.tsx` — confirmed the AR module tree never
  executes during SSR (`/experience/kameleon` still prerenders as a static
  route in `npm run build`'s output).
- The four old simulated-AR screens (`ArPermission`, `ArIntroduction`,
  `ArTrackingLost`, `ArUnsupportedFallback` under `components/kameleon/
  screens/`) and their now-orphaned `ParticlePortal.tsx` art asset are
  deleted, along with the `REQUEST_AR`/`SIMULATE_TRACKING_LOST`/
  `RECENTER_FROM_TRACKING_LOST`/`SCAN_AGAIN`/`SKIP_AR` actions and the
  `ar-introduction`/`ar-tracking-lost`/`ar-unsupported` top-level screens —
  all superseded by the one real component and its internal phases.
- Commercial/pathway/player/decision/journey-map/completion screens are
  untouched — confirmed by walking the full flow end-to-end (see
  Verification below) and by `git diff` only touching AR-related and
  session-plumbing files.

### Sample 3D asset

Khronos glTF Sample Assets' **Fox** model (CC0/CC-BY-4.0, see
`docs/KAMELEON_AR_ASSET_MANIFEST.md` for full attribution), downloaded once
to `public/assets/kameleon/ar/sample-animated-model.glb` (162,852 bytes,
verified valid glTF-binary header) — never fetched from a remote URL at
runtime. Three animation clips (Survey/Walk/Run); Survey plays by default,
looped. Explicitly temporary — the asset manifest documents the one-line
swap point (`SAMPLE_MODEL_URL`) for the eventual real Kameleon bottle GLB.

### Capability detection & session requirements

Implemented exactly as specified: secure-context check → `navigator.xr`
presence check → `isSessionSupported("immersive-ar")` → only then is the
"Allow camera & begin AR" button ever shown as actionable; the checking
state is shown honestly in between. Session request uses
`requiredFeatures: ["hit-test"]`, `optionalFeatures: ["dom-overlay",
"anchors", "light-estimation", "local-floor"]` — ground placement works from
the hit-test pose alone regardless of which optional features are actually
granted.

### Verification performed (2026-08-03)

**Automated:** `npx tsc --noEmit`, `npm run lint`, `npm run build` — all
clean. Two real bugs caught and fixed during lint: a `react-hooks/
set-state-in-effect` violation (a redundant `setPhase` call duplicating the
`useState` initializer, deleted) and a `react-hooks/refs` violation (a ref
write during render, moved into a dependency-less `useEffect`).

**Desktop (Chrome, this environment has no immersive-ar-capable browser):**
- Capability detection is honest — correctly reports `unsupported-
  immersive-ar` here (`navigator.xr` exists on this Chrome build, but
  `isSessionSupported("immersive-ar")` returns false) and shows the real
  reason text, never a fake "supported" state.
- `ARUnsupportedFallback`'s `<model-viewer>` loads the real local GLB
  (confirmed via `fetch()` — 200, correct `model/gltf-binary` content-type,
  correct byte length and glTF magic bytes — and via `model-viewer`'s own
  `loaded`/`modelIsVisible` JS API both reporting `true`). The 3D canvas
  itself did not visibly paint in this specific automated browser tab —
  traced to `document.hidden === true` / `document.hasFocus() === false`
  (the tab wasn't the OS-focused window during the automated session, which
  throttles the `requestAnimationFrame`-driven WebGL paint loop) — a
  testing-environment artifact reproduced identically with a hand-built
  vanilla `<model-viewer>` element with no React/app code involved at all,
  not a code defect. **Not independently confirmed as visually painting
  pixels** — flagged honestly rather than claimed as verified.
- "Continue without AR" (both from the start screen and from the
  unsupported-fallback screen) correctly reaches `quick-account`, and the
  rest of the existing journey (choose-path, etc.) continues unaffected.
- Capability detection was then temporarily monkey-patched
  (`navigator.xr.isSessionSupported` forced to resolve `true`) to exercise
  the paths this browser can't reach honestly on its own: `ARStartScreen`
  renders correctly; tapping "Allow camera & begin AR" calls the real
  `navigator.xr.requestSession(...)`, which genuinely rejects on this
  non-HTTPS `localhost` origin with a `SecurityError` — caught and mapped to
  the honest "AR requires a secure (HTTPS) connection" `ARErrorState`, with
  "Try again" correctly hidden since that error is marked non-recoverable;
  "Continue without AR" from that error state correctly recovers to
  `quick-account`.
- No console errors observed across any of the above.

**Not performed — explicitly out of scope for a desktop session:** actual
ground/surface hit-test detection, the reticle, tap-to-place, anchored
tracking while physically moving the phone, the placed-model animation
actually playing, and the energy-ring effect. **None of these can be proven
without a real WebXR-capable phone over HTTPS.** Per the explicit
instruction for this phase, this is disclosed as the reason Phase 5 is not
being marked complete, not glossed over.

### Files created
`docs/KAMELEON_AR_ASSET_MANIFEST.md`,
`public/assets/kameleon/ar/sample-animated-model.glb`,
`lib/kameleon/ar/{ar-types,capability-detection,webxr-session,hit-test,model-loader,animation-controller,reticle,energy-rings}.ts`,
`components/kameleon/ar/{KameleonARExperience,ARStartScreen,ARScanningOverlay,ARControls,ARHelpPanel,ARErrorState,ARUnsupportedFallback}.tsx`,
`types/model-viewer.d.ts` (JSX typing for the `<model-viewer>` custom element).

### Files changed
`lib/kameleon/types.ts`, `actions.ts`, `reducer.ts` (AR screen/action
simplification described above), `app/experience/kameleon/page.tsx`
(dynamic, `ssr:false` import + updated switch case), `package.json`
(added `three`, `@google/model-viewer`, `@types/three`, `@types/webxr`).

### Files deleted
`components/kameleon/screens/{ArPermission,ArIntroduction,ArTrackingLost,ArUnsupportedFallback}.tsx`,
`components/kameleon/art/ParticlePortal.tsx`.

### Known limitations
- Ground-plane hit-test placement is entirely unverified on real hardware —
  the single biggest open item before this phase can be considered done.
- `SAMPLE_MODEL_SCALE` (0.01) is an estimate, not device-verified — likely
  needs tuning once seen at real-world scale on a phone.
- "Tracking lost" detection uses `XRSession.visibilityState ===
  "visible-blurred"` as a best-effort heuristic (the most standards-based
  signal available); it hasn't been exercised against a real tracking-loss
  event.
- `dom-overlay` is requested as optional, not required — on a browser that
  grants an immersive-ar session but doesn't support dom-overlay, the
  in-session HTML controls (scanning instructions, Sound/Reposition/Reset/
  Help/Exit/Enter-the-Journey buttons) would not be visibly composited over
  the camera view on most browsers, since WebXR sessions typically take over
  the full display exclusively without it. Chrome on Android (the named
  target test platform) supports dom-overlay, so this is a reasonable bet,
  not a guaranteed-safe one.
- ~~No USDZ asset exists for the sample model, so iOS Quick Look AR is not
  available in this prototype~~ — **resolved in the iPhone correction round
  below.**
- Analytics events (AR started/permission granted-denied/surface detected/
  model placed/tracking lost/AR completed/continued without AR/device
  capability) are **prepared for, not implemented** — no tracking calls
  exist yet, per the explicit instruction not to implement without separate
  approval.
- No Supabase changes of any kind were made or needed for this phase.
- The 3 pre-existing high-severity `npm audit` findings (`postcss`, `sharp`,
  both transitive through `next` itself) are unrelated to this phase's new
  dependencies and were not touched, per the standing prohibition on
  `npm audit fix --force`.

### iPhone correction round (2026-08-03)

Physical testing on the Vercel preview from commit `0bed737` (iPhone,
Chrome on iOS, HTTPS) found: capability detection correctly reported no
`navigator.xr` and showed the inline GLB preview — truthful, but **iPhone
had no working AR launch action of any kind**, since no USDZ asset existed
to offer Apple AR Quick Look. Capability detection also keyed only off
`navigator.xr`, with no separate path for the very common case of "no
WebXR, but Quick Look is available" (every iPhone).

**Fix:**
- Capability detection (`lib/kameleon/ar/capability-detection.ts`) now
  resolves one of three `ARPathway`s — `"webxr"`, `"quicklook"`, or
  `"unsupported"` — checking WebXR first, then the standards-based
  `HTMLAnchorElement.relList.supports("ar")` feature check (true in Safari
  *and* Chrome/Edge/Firefox on iOS, since Apple requires every iOS browser
  to run on WebKit — this is why UA-sniffing alone, or `navigator.xr` alone,
  was insufficient), then falling back to `"unsupported"` only if neither
  applies.
- New `components/kameleon/ar/ARQuickLookScreen.tsx`: "Place the experience
  in your space" / "Open AR on iPhone" (a plain `<a rel="ar" href="/api/ar/usdz">`
  — the standards-based Quick Look trigger, not model-viewer's small built-in
  icon) / "View 3D preview" (inline `<model-viewer>`, reusing the animated
  GLB) / "Continue without AR". Detects Quick Look's dismissal via the
  WebKit-specific `webkitendfullscreen` event on the anchor, then shows "AR
  experience viewed" with "Enter the Journey" promoted to the primary action.
- New USDZ asset: **not** a Fox conversion (no reliable/verifiable
  conversion path existed in this Windows environment — see the asset
  manifest for why), but an original static geometric placeholder (two
  analytic USD cylinders, PBR-colored in the Kameleon copper/red palette),
  authored via `usd-core` (Pixar/NVIDIA's free, open-source PyPI OpenUSD
  Python bindings — no paid service). Named `sample-static-model.usdz`
  (not `sample-animated-model.usdz` as originally suggested) since it has
  no animation — animation is documented as pending, not claimed. Served via
  a dedicated route handler (`app/api/ar/usdz/route.ts`) with an explicit
  `Content-Type: model/vnd.usdz+zip` header, since Next's default
  `public/`-static-file MIME inference for `.usdz` was a plausible
  contributor to the original failure and can't be relied on across hosts.
- `ARUnsupportedFallback` (the true "neither path available" screen) is
  otherwise unchanged, and — critically — is no longer reachable on iPhone
  once Quick Look resolves, so "Full ground-plane AR isn't available here"
  no longer appears on a device that actually has a working AR path.

**Verification performed:**
- `npx tsc --noEmit`, `npm run lint`, `npm run build` — all clean (dev
  server stopped before build, restarted after). `/api/ar/usdz` confirmed
  as a new static-prerendered route in the build output.
- USDZ structural validation (can't substitute for physical-device
  confirmation, but is real verification of what's checkable here): valid
  ZIP with uncompressed (STORED) entries as Quick Look requires,
  `testzip()` reports no corruption, USD stage re-opens with the expected
  scene graph (`/Root` default prim, two bound-materialed cylinders),
  Y-up axis, 1 meter/unit.
- Desktop Chrome (this environment): capability detection still correctly
  falls through to `"unsupported"` with an updated, accurate combined
  reason ("...cannot start an immersive AR session, and Apple AR Quick Look
  isn't available here").
- iPhone path simulated on desktop via a `DOMTokenList.prototype.supports`
  override (the only realistic way to exercise this branch without a
  physical device): `ARQuickLookScreen` renders the exact required title/
  copy/buttons, the launch anchor carries `rel="ar"` and
  `href="/api/ar/usdz"` (confirmed via the DOM), "View 3D preview" loads
  the real animated GLB inline, a simulated `webkitendfullscreen` event
  correctly transitions to "AR experience viewed" with "Enter the Journey"
  promoted, and that button correctly ends the flow at `quick-account`.
- Android/WebXR path re-verified end-to-end after the capability-detection
  rewrite via a `navigator.xr.isSessionSupported` override (same technique
  as the original Phase 5 round): `ARStartScreen` still renders, session
  request still correctly attempted and still correctly error-handled
  (this non-HTTPS `localhost` environment can't complete a real session, so
  the honest `SecurityError` path was re-exercised, not placement itself —
  hit-test/reticle/placement code was untouched by this round's changes).
- No console errors observed during any of the above. Existing journey
  (commercial → AR → quick-account) reached correctly from both the
  WebXR-error and Quick-Look-viewed paths.

**What remains unverified — still the reason this phase isn't complete:**
ground-plane hit-test placement on Android, and the actual Quick Look
launch/placement/movement/dismissal sequence on a physical iPhone. Both
require real hardware this environment doesn't have.

**Files created:** `components/kameleon/ar/ARQuickLookScreen.tsx`,
`app/api/ar/usdz/route.ts`, `public/assets/kameleon/ar/sample-static-model.usdz`.
**Files changed:** `lib/kameleon/ar/{ar-types,capability-detection}.ts`,
`components/kameleon/ar/KameleonARExperience.tsx`,
`docs/KAMELEON_AR_ASSET_MANIFEST.md`.

**Status: READY FOR MOBILE AR REVIEW** (unchanged) — not APPROVED, not
COMPLETE until both the Android ground-plane placement and the iPhone Quick
Look sequence are confirmed on physical hardware.

### AR-only customer flow correction (2026-08-03)

Physical iPhone screenshots from the previous round confirmed Quick Look
itself works end-to-end (camera, surface detection, placement, native
AR/Object tabs) — this round is a customer-experience correction, not a
new capability. Two things prompted it: the page still offered a redundant
inline 3D-preview choice alongside real AR, and the placeholder USDZ (two
cylinders) needed to stop looking like it might be the intended design.

**AR-first iPhone flow (`components/kameleon/ar/ARQuickLookScreen.tsx`,
rewritten):**
- Removed "View 3D preview"/"Hide 3D preview" and the technical WebXR/iOS
  comparison paragraph entirely from the customer-facing screen — one
  primary action only.
- New copy exactly as specified: "Place the experience in your space" /
  "Move your phone slowly to find a surface, then place the Kameleon
  experience in your world." / "Open AR Experience" / "Need help?".
- "Continue without AR" is no longer shown by default — it now only
  appears (a) inside the "Need help?" panel, or (b) if a
  `visibilitychange`-timeout heuristic concludes Quick Look never actually
  took over the screen after the button was tapped (there is no direct
  browser event for "Quick Look failed to open," so this is a best-effort,
  not a guaranteed-precise, detector).
- The USDZ launch link now carries Apple's documented custom-banner
  fragment parameters (`callToAction=Continue Your Journey`,
  `checkoutTitle=Kameleon`, `checkoutSubtitle=Every Pour Is a
  Transformation`, `canonicalWebPageURL`) so Quick Look shows our own
  call-to-action instead of a bare close button. Tapping it dispatches a
  `message` event (`data === "_apple_ar_quicklook_button_tapped"`) to the
  triggering anchor — that event, not Quick Look's dismissal on its own
  (the user could just tap the native X), is what transitions the page
  straight to Quick Account, before Quick Look has finished closing. No
  personal data is placed in this URL — only the three static strings.

**Platform limitation, stated plainly:** Quick Look's AR tab, Object tab,
close button, and share button are rendered and owned by iOS. Nothing
on this website can hide, remove, or restyle them — confirmed against the
physical-device screenshots, and documented in
`docs/KAMELEON_AR_ASSET_MANIFEST.md` so this isn't re-litigated as a bug
later. The Object tab was **not** removed and no report will claim it was.

**Android consistency (`components/kameleon/ar/ARControls.tsx`,
`KameleonARExperience.tsx`):** the bottom-tray primary action is renamed
"Continue Your Journey" (from "Enter the Journey") and now only renders
once `phase === "placed"` — before that, "Exit AR" in the icon row remains
the only way out, matching the "no inline preview choice, no early exit
via a non-AR path" requirement. Ending it still cleanly ends the WebXR
session, stops the camera, disposes all Three.js/hit-test resources
(unchanged code path from the original Phase 5 round), and opens Quick
Account.

**Quick Account form rewritten (`components/kameleon/screens/
QuickAccount.tsx`, `lib/kameleon/profile.ts` new):** First name / Last
name / Email / Terms-and-privacy acknowledgment, replacing the previous
email+password+age-checkbox form. **No password field exists anymore, and
none is stored.** Submissions save to `localStorage` only
(`lib/kameleon/profile.ts`, a small isolated adapter — swapping in real
Supabase signup later touches only that one file) with copy that explicitly
says no account is created and nothing is sent anywhere yet.

**3D asset:** the two-cylinder USDZ and the Fox GLB are **kept as-is**,
relabeled in `docs/KAMELEON_AR_ASSET_MANIFEST.md` as deprecated technical
placement placeholders (their placement/pipeline-proving job is done, they
are not presented as final design) rather than replaced with a hand-coded
substitute. A rigged, animated, low-poly chameleon (idle-breathing,
head-turn, blink, tail movement, crawl loop for Android; a matching, static
unless verified, USDZ for iPhone) is **not achievable with the tools
available in this environment** — no 3D modeling/rigging/animation software
is installed, and raw geometry-API scripting (the only asset-authoring tool
actually available here) cannot produce organic character rigging. Per the
explicit instruction covering this exact case, a full Blender-ready
production specification (geometry, rig, named animation clips, materials,
GLB/USDZ delivery requirements, and exactly what code does *not* need to
change once delivered) was written into the asset manifest instead of
fabricating a worse substitute or claiming completion.

**Verification performed:**
- `npx tsc --noEmit`, `npm run lint`, `npm run build` — all clean (one
  real lint catch: an unnecessary `eslint-disable` comment on the
  message-event effect, removed rather than left in). Dev server stopped
  before the build, restarted after.
- Desktop simulation (the only testing this environment can do without
  physical hardware): the Quick Look screen renders the exact required
  copy with no scrolling needed; the launch anchor carries all four
  required fragment parameters; a simulated `MessageEvent` with
  `data: "_apple_ar_quicklook_button_tapped"` correctly and immediately
  transitions straight to the new Quick Account form (no intermediate
  screen); the new form's fields, no-password behavior, and
  `localStorage`-only persistence were exercised end-to-end and confirmed
  correct; "Need help?" reveals its panel with a working "Continue without
  AR"; the WebXR/Android start-screen path was re-verified reachable and
  unaffected by this round's changes (via the same
  `navigator.xr.isSessionSupported` override technique as prior rounds).
  No console errors observed at any point.
- **Not verified — still the reason this phase isn't complete:** the
  actual Quick Look banner tap on a physical iPhone (both Safari and
  Chrome), the `visibilitychange`-timeout failure heuristic under a real
  failure condition, and Android ground-plane hit-test placement itself.

**Files created:** `components/kameleon/ar/ARQuickLookScreen.tsx`
(rewritten, not new — see above), `lib/kameleon/profile.ts`.
**Files changed:** `components/kameleon/ar/{ARControls,
KameleonARExperience}.tsx`, `components/kameleon/screens/QuickAccount.tsx`,
`docs/KAMELEON_AR_ASSET_MANIFEST.md`.

**Status: READY FOR MOBILE AR REVIEW** (unchanged) — not APPROVED, not
COMPLETE until iPhone Safari, iPhone Chrome, and Android are all confirmed
on physical hardware per this round's specific test list.

## Phase 5B — Embedded Snap Camera Kit Evaluation

**Goal:** Evaluate running an existing, approved Hosted WebAR Snap Lens
directly inside the Kameleon webpage via Snap Camera Kit Web (camera feed
composited in-page, not a redirect to Snapchat/an external Snap surface),
so the existing "Continue Your Journey" interface can wrap it the same way
it wraps the WebXR and Quick Look paths.
**Status:** READY FOR ANDROID PHYSICAL REVIEW — embedded Camera Kit is
now the production AR pathway (Checkpoints 1-7 complete) and a physical
device review has confirmed the core flow works end-to-end. **Not**
APPROVED or COMPLETE: the physical review that passed did not name which
specific browser(s) were tested (see Checkpoint 7), and Android
Chrome/Samsung Internet have not been physically tested at all. Do not
treat any specific browser as individually confirmed passing beyond what
Checkpoint 7 states.
**Start date:** 2026-08-03
**Approval required:** Yes — this introduces a new third-party SDK,
external network calls (Snap's CDN/API), and a new credential (Camera Kit
API token) that don't exist anywhere else in this project; none of that
begins until explicitly approved past this preflight checkpoint.

**Existing Hosted WebAR Lens (documented, not yet integrated):**
`https://lens.snap.com/experience/907c0f39-5f64-49d5-9ee5-b911a8fa9248`

### Checkpoint 1 — Preflight findings (2026-08-03)

**Environment confirmed:**
- Working directory: `C:\Users\cotye\Documents\RetailExp\retail-exp`
- Branch: `main`
- Working tree: clean
- Remote: `https://github.com/playthecrowd/RetailExp.git`
- Latest local commit: `ac86f64`; confirmed identical on `origin/main`
  after a fresh `git fetch` (not stale local knowledge)
- `.env.local` (and every `.env*` variant) confirmed ignored by
  `.gitignore` line 34 (`.env*`) — verified with `git check-ignore`
  against a same-named test file, not just by reading the pattern. No
  `.env.local` exists in the repo yet, and no `process.env.*` reference
  exists anywhere in the codebase — environment variables are a genuinely
  blank slate here, no established `NEXT_PUBLIC_`-vs-server-only
  convention to follow or break yet.
- Existing Vercel deployment route: **not independently verifiable from
  this environment** — no `.vercel/project.json` exists locally, the
  Vercel CLI isn't installed, and this session's Vercel API access does
  not see a matching project under the one team it can query. Per your
  own physical-device testing, a deployment tracking this repo's `main`
  branch already exists; ask if you'd like the exact URL recorded here.

**Existing architecture inspected:**
- `package.json`: only `next`, `react`, `react-dom`, `three`,
  `@google/model-viewer` as runtime dependencies — no camera/AR SDK beyond
  what Phase 5 already added. Nothing Snap-related present.
- `next.config.ts`: minimal, no custom `headers()`, no CSP, no
  `Permissions-Policy`, no image-domain allowlist, no experimental flags.
- No `middleware.ts` exists. No CSP/`Permissions-Policy`/`X-Frame-Options`
  header is set anywhere in the codebase today — the existing WebXR/Quick
  Look camera access relies entirely on browser-default same-origin
  permission prompts, not an explicit policy. This means there's currently
  nothing to conflict with a Camera Kit integration, but also no existing
  pattern to extend — headers for Snap's CDN/API domains (script-src,
  connect-src, and likely `frame-src`/`worker-src` depending on how Camera
  Kit Web loads its runtime, plus `Permissions-Policy: camera=(self)`)
  would need to be designed from scratch.
- Current AR component tree (`components/kameleon/ar/`): `ARControls`,
  `ARErrorState`, `ARHelpPanel`, `ARQuickLookScreen`, `ARScanningOverlay`,
  `ARStartScreen`, `ARUnsupportedFallback`, `KameleonARExperience`
  (orchestrator). Corresponding logic in `lib/kameleon/ar/`:
  `animation-controller`, `ar-types`, `capability-detection`,
  `energy-rings`, `hit-test`, `model-loader`, `reticle`, `webxr-session`.
- Current Kameleon session state machine (`lib/kameleon/{types,actions,
  reducer}.ts`): `ar-permission` is the single top-level `screen` that
  hosts the entire AR experience; `KameleonARExperience` internally
  resolves one of three `ARPathway`s (`webxr` / `quicklook` /
  `unsupported`) via `detectARCapability()` and renders accordingly.
  `onEnterJourney`/`onSkipAr` props (mapped to the `ENTER_JOURNEY` /
  `CONTINUE_WITHOUT_AR_FALLBACK` actions) are the two exit points every AR
  path already funnels through to reach Quick Account — a fourth
  "snap-camera-kit" pathway would plug into this exact same seam rather
  than requiring a new top-level screen or reducer action.

**Proposed files (not yet created):**
- `lib/kameleon/ar/snap-camera-kit-session.ts` — SDK init/session
  lifecycle (mirroring the existing `webxr-session.ts` pattern: start,
  clean teardown, typed errors).
- `components/kameleon/ar/SnapCameraKitScreen.tsx` — the in-page camera
  view + "Continue Your Journey" UI, mirroring `ARQuickLookScreen.tsx`'s
  shape.
- Capability-detection addition (extend `ar-types.ts`'s `ARPathway` union
  and `capability-detection.ts`, not a new file) — need to decide whether
  Camera Kit becomes a 4th pathway, replaces one of the existing three, or
  is gated behind a separate entry point entirely; not decided yet.
- `docs/KAMELEON_SNAP_CAMERA_KIT_MANIFEST.md` — license/attribution/token
  handling documentation, mirroring `KAMELEON_AR_ASSET_MANIFEST.md`.
- `.env.local` (untracked, git-ignored) for the Camera Kit API token once
  one is actually provided.

**Risks:**
- **Credential handling.** Camera Kit requires an API token from Snap's
  developer portal. This project has no existing account/credential
  precedent — creating a Snap developer account or generating a token is
  an external-account action outside what's been authorized so far, and
  must be confirmed explicitly (and done by you, not fabricated by me)
  before any code references it.
- **Cost/tier uncertainty.** Snap Camera Kit's free-tier limits (usage
  caps, watermarking, feature gating) haven't been researched yet — this
  must be confirmed before integration, per the standing no-paid/no-
  credit-based-service restriction.
- **New CSP surface.** Introducing a third-party SDK loading remote
  scripts/assets into a codebase with zero existing CSP means the first
  Snap-related headers written here are also the first headers of any
  kind in this project — no prior pattern to lean on, higher chance of
  getting it wrong on the first pass than extending an established policy.
- **Two parallel camera-AR systems.** WebXR/Quick Look (Phase 5) and Snap
  Camera Kit would coexist as genuinely different technical approaches to
  the same customer moment. Product-level questions (does Snap replace
  Phase 5 entirely, run alongside it as an alternative, or serve a
  different use case?) aren't resolved by this preflight and shouldn't be
  assumed.
- **Bundle/performance impact.** Camera Kit Web's SDK size and runtime
  cost on mobile Safari/Chrome are unresearched; could meaningfully affect
  the page's existing lazy-loaded, client-only AR-module pattern
  (`next/dynamic(..., { ssr: false })`).

**Blockers:**
- No Snap Camera Kit API token exists yet — implementation cannot begin
  without one, and it must come from you (or an account you explicitly
  approve creating), never fabricated or guessed.
- Whether Camera Kit is additive (new option) or a replacement for an
  existing AR path is a product decision not yet made.
- Confirmed no code has been written and nothing has been installed for
  this evaluation — this section is documentation only, per the explicit
  instruction not to begin implementation until preflight is reviewed.

**Approval required:** Yes — before any package install, any file
creation, or any request for a Snap developer token.

### Checkpoint 2 — Safe scaffold (2026-08-03)

Added `.env.example` (blank placeholders for the three
`NEXT_PUBLIC_SNAP_*` variables), `lib/kameleon/ar/snap-camera-kit-config.ts`
(typed env reader using literal `process.env.NEXT_PUBLIC_*` references, per
Next.js's requirement that only literal references get inlined into the
client bundle), and the isolated route
`app/experience/kameleon/ar-snap-test/page.tsx`, which shows "Snap Camera
Kit configuration pending." until all three variables are set. No package
installed, no camera access requested, production route untouched.

### Checkpoint 3 — Isolated embedded prototype (2026-08-03, commit `167081b`)

Installed `@snap/camera-kit` and `@snap/react-camera-kit` (both official,
free — no billing found anywhere in Camera Kit's terms, npm registry, or
account setup). Implemented the isolated test route using
`@snap/react-camera-kit`'s `CameraKitProvider`/`LensPlayer`/`LiveCanvas`:
camera access is only requested after a "START SNAP AR TEST" tap, the
configured Lens loads full-screen with Continue Your Journey / Exit AR /
Help controls, and errors map to customer-friendly copy via
`lib/kameleon/ar/snap-error-messages.ts`. CSP scoped narrowly to this one
route in `next.config.ts` (real Snap hostnames found by grepping the
installed package's source, not guessed; `'unsafe-inline'` on `script-src`
required by Next dev-mode's own inline bootstrap script — see that file's
inline comments for the full isolation-testing trail). Cleanup relied on
unmounting `CameraKitProvider` (the wrapper exposes no separate dispose
method). `tsc`/lint/build all passed. Committed as `167081b`.

**Physical iPhone test result (reported after this commit):** camera
permission/activation succeeds on Safari, Firefox, and Chrome (all
WebKit-backed on iPhone), but the experience fails before the Lens becomes
visible on all three, landing on the generic error screen — and the camera
indicator stays on after the error screen renders, i.e. the
unmount-based cleanup assumption from Checkpoint 3 was wrong in practice.

### Checkpoint 4 — Diagnostic instrumentation and cleanup correction (2026-08-03)

**Root-cause direction:** `@snap/react-camera-kit`'s `useCameraKit()` only
exposes three coarse status buckets (`sdkStatus` / `source.status` /
`lens.status`), which can't distinguish "Lens not found in the configured
group" from "Lens content download failed" from "Lens apply failed" —
three separate core-SDK calls the wrapper collapses into one bucket. It
also never exposed the `MediaStream` it created internally, so this
project had no way to guarantee `track.stop()` ran — which matches the
observed bug (camera indicator staying on after the error screen).

**Change made:** `components/kameleon/ar/SnapArTestScreen.tsx` was
rewritten to use the core `@snap/camera-kit` API directly
(`bootstrapCameraKit`, `cameraKit.createSession`,
`cameraKit.lensRepository.loadLens`/`cacheLensContent`,
`session.applyLens`, `session.setSource`, `session.play`), per the
explicit instruction to drop the React wrapper if it couldn't provide
reliable lifecycle/cleanup control. `@snap/react-camera-kit` was removed
from `package.json` (no longer used anywhere in the codebase).

- **Own `getUserMedia()` call:** the component now requests the camera
  itself and holds the resulting `MediaStream` in a ref, so cleanup can
  always call `track.stop()` on every track regardless of SDK state.
- **12 named lifecycle stages** tracked in
  `lib/kameleon/ar/snap-ar-diagnostics.ts` (configuration, SDK bootstrap,
  terms/consent, camera request, camera ready, Lens group lookup, Lens
  content load, Lens apply, session play, first rendered frame, active
  session, cleanup), each tied to one specific core-API call. "Terms/
  consent" has no public hook (Camera Kit's legal-prompt handling is
  internal) — it's attributed by exclusion (passed if no `LegalError`
  surfaces), documented as such rather than reached via a private API.
  "First rendered frame" is detected via `session.metrics.beginMeasurement()`
  and polling `.measure().lensFrameProcessingN > 0` (a real frame-count
  signal from the SDK's own performance API, not a heuristic based on
  canvas size).
- **Cleanup sequencing rewritten:** on any exit path (error, Exit AR,
  Continue Your Journey, unmount), cleanup now runs *before* any
  transition is shown: cancel the first-frame polling loop → detach the
  session error listener → stop every `MediaStreamTrack` on the
  self-owned stream (unconditional, first, wrapped per-track so one
  failure can't block the rest) → `session.pause()` /
  `session.removeLens()` / `session.destroy()` → `cameraKit.destroy()` →
  mark `cleanupCompleted`. The error screen's "Try Again" button is
  hidden (replaced with "Finishing cleanup…") until
  `diagnostics.cleanupCompleted === "yes"`.
- **Retry** goes back through the Start screen (fresh user-gesture-backed
  `getUserMedia()` call, matching browser autoplay/permission-prompt
  requirements) and remounts a fresh session component via a `key` bump —
  a genuinely new `MediaStream`/`CameraKit`/`CameraKitSession` instance
  each time, not a reused one.
- **Diagnostics UI:** a "View diagnostics" toggle (visible during loading
  and on the error screen) renders the 12-field diagnostics record —
  last successful stage, failed stage, normalized error category
  (`SnapArError.category`, e.g. `"BootstrapError"`, `"NotAllowedError"`),
  and yes/no/pass-fail for each stage. Every field is a stage name,
  boolean, or matched error-type name — never an API token, Lens ID, Lens
  Group ID, or other environment-variable value.

**Verification:** `tsc --noEmit`, `eslint`, and `next build` all pass.
Production route (`app/experience/kameleon/page.tsx` and everything it
imports) untouched by this change.
**Not yet done:** a new round of physical iPhone testing (Safari,
Firefox, Chrome) against this rewrite — the diagnostics panel should now
show exactly which of the 12 stages fails and why, rather than a generic
error.
**Next action:** physical re-test, then read back the diagnostics panel's
values to actually root-cause the WebKit-common failure.

### Checkpoint 5 — Production integration (2026-08-04, commit `974c1f5`)

Embedded Camera Kit became the primary AR pathway on both iPhone and
Android, replacing the WebXR/Quick Look pathway in the production
journey. `app/experience/kameleon/page.tsx`'s `ar-permission` screen now
mounts `components/kameleon/ar/KameleonCameraKitExperience.tsx` (new)
instead of the old `KameleonARExperience` — same `onEnterJourney`/
`onSkipAr` contract, so no reducer/state-machine changes were needed.
Capability gating (`lib/kameleon/ar/snap-camera-kit-capability.ts`, new)
uses feature detection only (secure context + `getUserMedia` +
configuration present) — no user-agent sniffing, so iPhone and Android
run the identical code path. Session lifecycle ported directly from the
isolated route's Checkpoint 4 design (own `getUserMedia()`, core
`@snap/camera-kit` API, guaranteed track-stop cleanup), with production-
only additions: the commercial-gate Start screen, Kameleon sound
integration, and a `visibilitychange` handler that releases the camera
when the tab/app is backgrounded.

`lib/kameleon/ar/snap-error-messages.ts` (shared by both the isolated and
production routes) had its copy corrected — several messages said "AR
**test** couldn't start," diagnostic-route language that would have
leaked to real customers. Reworded project-wide; isolated route
regression-tested afterward (unaffected).

**Deliberately not done, by design:** no CSP added to the production
route (production has zero CSP anywhere today; adding one requires
enumerating every resource the whole Kameleon page needs, which is a
separate careful pass, not a Camera Kit side-effect). WebXR/Quick Look
code (`KameleonARExperience.tsx` and its dependents) kept fully intact
but unreachable — not deleted.

**Verification:** `tsc --noEmit`, `eslint`, `next build` all pass.
Production flow regression-tested via desktop browser (commercial-gate
hydration → Camera Kit start screen → "Continue without AR" → Quick
Account, no console errors) — the actual camera/Lens flow couldn't be
exercised from that environment (native permission prompt hangs
automated browser tooling).

### Checkpoint 6 — Camera-permission/unmount race-condition fix (2026-08-04, commit `7e5f43c`)

A review of the startup sequence found two real gaps around cancellation
handling in `KameleonCameraKitExperience.tsx`:

1. If `bootstrapCameraKit()` resolved *after* the attempt was already
   cancelled, the returned `CameraKit` instance was discarded without
   calling `.destroy()` — a resource leak. Fixed to destroy it on that
   branch, matching the pattern already used for the session.
2. `getUserMedia()` resolving after cancellation was already handled
   correctly (tracks stopped, never assigned to the active ref, never
   proceeded) — but there was no check for `document.visibilityState`
   immediately after it resolved. If permission was granted while the
   tab was still genuinely backgrounded, the code would have silently
   continued bootstrapping AR off-screen. Fixed: now stops the stream and
   runs the same "interrupted" path used for backgrounding an active
   session.

No separate "session generation" counter was added: this component runs
exactly one attempt per mounted instance ("Try Again" always produces a
fresh component instance via a `key` bump, with entirely fresh refs), so
two attempts can never share mutable state or race each other — the
existing `cancelledRef` (documented in the component with this reasoning)
already serves as both the cancellation guard and the disposed/unmounted
guard.

**Verification:** no test framework is configured in this project — a
standalone mock verification script (not committed, no test
infrastructure to hang it on) reproduced the exact guard pattern with a
controllable `getUserMedia()` promise and a fake `MediaStream`. Result:
9/9 assertions passed — confirmed the late-resolving stream's tracks are
all stopped, never assigned to the active ref, no session is created, no
state update occurs after cancellation, and cleanup is idempotent under a
second call. `tsc`/`eslint`/`next build` all pass; both routes
regression-tested afterward.

### Checkpoint 7 — Physical device review (2026-08-04, commit `7e5f43c` follow-up)

**Result:** a physical device review confirmed the following pass:
camera initialization; Lens-group lookup (after correcting the Lens
Group ID in the Vercel environment configuration — the isolated route's
Checkpoint 4 diagnostics work was built for exactly this kind of
misconfiguration); Her Wine Lens loading; Lens graphics/animation;
Continue Your Journey; camera cleanup; Continue without AR.

**Scope of this result — read carefully before citing it elsewhere:**
the review's own description (mentions of the iPhone-specific green
camera indicator and the native Motion & Orientation Access permission
prompt) indicates it was performed on an iPhone, but **no specific
browser (Safari, Chrome, or Firefox) was named**, so none of the three
can individually be marked as confirmed-passing — only that at least one
iPhone browser passed the full flow. **Android (Chrome, Samsung
Internet) has not been physically tested at all.** Per standing
instruction, Phase 5B stays at READY FOR ANDROID PHYSICAL REVIEW, not
APPROVED or COMPLETE, until Android is explicitly tested and until the
specific iPhone browser(s) are named.

**Staging branding (expected, not a bug):** the large green "Camera Kit
Staging" overlay visible during testing is produced by Snap's own
staging API token — this project's code has no involvement in it and
must not attempt to hide or cover it. It will be removed once the Camera
Kit app is submitted for and receives Snap's production approval, the
resulting Production API Token replaces
`NEXT_PUBLIC_SNAP_CAMERA_KIT_API_TOKEN` in Vercel, and the app is
redeployed. Separately, the iPhone green camera-in-use indicator and the
native Motion & Orientation Access permission popup are iOS system
privacy features, not part of this project's UI, and cannot be removed
by this project's code. Snap attribution ("powered by Snap AR" /
Learn More link) is kept in this build for user trust and transparency,
though Snap's current guidance treats it as optional for a personal-
device web experience like this one.

**Deferred, not in scope for this checkpoint:** Supabase and real
authentication (Quick Account remains the mock local-only flow); the
Snap production API token (blocked on Snap's own app-review process, not
something this project controls the timeline of).

## Phase 6 — Kameleon Cinematic AR Introduction

**Goal:** Replace the AR mock with the real ground-anchored introduction.
**Status:** NOT STARTED
**Approval required:** Yes — cinematic AR behavior approved before production media connected.

## Phase 7 — Supabase Foundation

**Goal:** Replace mock accounts and journey data with a secure Supabase backend.
**Status:** NOT STARTED — **BLOCKED until Supabase project/credentials are explicitly approved.**
**Approval required:** Yes — security and data isolation reviewed before production deployment.

## Phase 8 — Media and Content Management

**Goal:** Allow authorized admins to manage Kameleon content via Supabase Storage.
**Status:** NOT STARTED
**Approval required:** Implicit via Phase 7 gate; no AI video generation permitted.

## Phase 9 — Analytics and Admin Management

**Goal:** Provide first-party experience analytics (no paid analytics service without approval).
**Status:** NOT STARTED

## Phase 10 — Accessibility, Performance, and QA

**Goal:** Prepare the complete platform for deployment review.
**Status:** NOT STARTED

## Phase 11 — Vercel Deployment

**Goal:** Deploy an approved production candidate.
**Status:** NOT STARTED — **BLOCKED until explicit deployment approval.**

## Phase 12 — Custom Client URL and NFC Preparation

**Goal:** Prepare Kameleon's final customer access point (domain, SSL, QR, NFC).
**Status:** NOT STARTED — **BLOCKED until domain/DNS/NFC actions are explicitly approved.**

---

## Non-negotiable restrictions (standing, all phases)

- No paid AR platforms, AI-generation services, stock-media subscriptions, or usage-based/credit-based external services without an explicit approval checkpoint (cost/feature/alternative presented first).
- No external accounts or free trials created.
- No `npm audit fix --force`.
- No commit, push, deploy, DNS change, cloud project creation, or external write without explicit approval at the applicable checkpoint.
- Open-source 8th Wall only — never the retired hosted platform or a legacy cloud-editor dependency.
- Reference PNGs in `docs/design-reference/` are visual/interaction references only — never shipped as the app UI directly.
