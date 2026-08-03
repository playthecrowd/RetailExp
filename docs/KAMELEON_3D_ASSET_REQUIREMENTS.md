# Kameleon 3D Asset Requirements (Phase 5/6 — not yet built)

This is a specification document only. **No 3D assets exist yet.** Nothing
in the current Phase 3 build depends on or pretends these exist. Phase 5 uses
a clearly labeled local primitive/test bottle; Phase 6 replaces it with the
approved assets described here, once supplied.

## Scene structure

- One optimized main GLB scene (or a small, coordinated set of GLB files).
- One root scene node, origin centered beneath the bottle.
- **Y = 0 is the ground-contact point** — the bottom of the bottle sits at
  Y = 0. No geometry may begin beneath the floor.
- Bottle mesh attached to the root.
- City ring meshes/planes attached to the root, spatially arranged around
  the bottle (not flat DOM/webpage overlays).
- Optional animated chameleon mesh attached to the scene, sharing its
  coordinate system.
- Effects (particles, energy trails) that must be built at runtime with
  Three.js — if used — must still belong to the anchored scene's coordinate
  system and move with the AR anchor; they may never behave like
  screen-facing webpage overlays.

## Scale and pivots

- Consistent real-world scale; a believable bottle height on first
  placement.
- Correct pivots so recentering/replacing/rescaling doesn't cause asset
  drift.
- Ring and character animation must remain correctly positioned after any
  approved rescale.

## Named animation clips (retrieve by name, not index)

| Clip | Purpose |
|---|---|
| `bottle_appear` | Materialization on placement |
| `bottle_idle` | Resting loop |
| `energy_begin` | Wine-like particle/energy start |
| `rings_form` | City rings forming around the bottle |
| `city_atlanta_reveal` | Atlanta ring reveal |
| `city_chicago_reveal` | Chicago ring reveal |
| `city_new_york_reveal` | New York ring reveal |
| `city_los_angeles_reveal` | Los Angeles ring reveal |
| `chameleon_enter` | Optional chameleon entrance |
| `chameleon_circle_bottle` | Optional chameleon movement |
| `chameleon_idle` | Optional chameleon resting loop |
| `worlds_merge` | Convergence moment |
| `journey_ready` | Stable final composition, "Enter the Journey" becomes active |
| `scene_exit` | Restrained exit transition before AR teardown |

Final clip names may change once real assets are delivered; the runtime is
expected to look clips up **by name**, never by anonymous index, so a
rename in the asset doesn't require a code change.

## Budgets and formats

| Requirement | Target |
|---|---|
| File format | `.glb` (binary glTF) |
| Texture resolution | Mobile-optimized (specific ceiling TBD with asset vendor) |
| Polygon count | Mobile-optimized (specific ceiling TBD with asset vendor) |
| Materials | PBR, glTF-compatible |
| Audio dependencies | None baked into the GLB — audio stays in the app's own Web Audio layer |

## Scene sequence (for the eventual real AR build, Phase 6)

1. **Materialization** — ground anchor confirmed, bottle appears via a
   restrained copper/red light effect, settles onto the floor, short sound
   cue if enabled.
2. **Bottle reveal** — materials/label fully visible, "Move Around the
   Bottle" instruction shown, user may begin moving the phone.
3. **Energy** — wine-like particles circle the bottle with real depth/
   parallax (not flat UI).
4. **City reveals** — Atlanta, Chicago, New York, Los Angeles appear in
   sequence, spatially attached to the scene.
5. **Optional chameleon** — enters and moves around the bottle/base/rings;
   deferred until an approved 3D character asset exists.
6. **Journey ready** — stable final composition; "Enter the Journey"
   becomes active.
7. **Exit** — restrained transition, camera/AR/Three.js resources disposed,
   direct hand-off to the four pathway tabs.

## Phase responsibility (confirmed understanding)

- **Phase 3** (this phase): simulated 2D visual introduction only
  (`ArIntroduction.tsx` — Canvas particles + SVG bottle + CSS ring cards).
  No claim of real ground tracking. No placement interstitial in the
  customer flow.
- **Phase 5**: integrates the real open-source AR engine, requests camera
  permission, detects the ground plane, shows a placement reticle, places a
  simple temporary/primitive test asset, proves recenter/replace/tracking-
  recovery/cleanup on real iPhone and Android devices.
- **Phase 6**: replaces the test asset with the approved Kameleon 3D scene
  described in this document, adds sound/captions, connects "Enter the
  Journey" to the pathway tabs, performs final device/performance/visual
  testing.

## Status tracking

| Asset | Format | Status | Placeholder in use | Approved |
|---|---|---|---|---|
| Kameleon bottle model | `.glb` | Not supplied | SVG silhouette (`Bottle.tsx`) | No |
| City ring presentations (×4) | `.glb` or textures | Not supplied | CSS/SVG ring cards | No |
| Wine/energy particle system | Three.js shader/particle spec | Not supplied | Canvas 2D particle system (`ParticlePortal.tsx`) | No |
| Chameleon character | `.glb` + animation clips | Not supplied | None (feature not built) | No |
| Phase 5 test/primitive asset | `.glb` (simple) | Not needed yet | N/A | N/A |

No AI 3D-generation service, paid asset marketplace, or credit-based service
has been or will be used to produce any of the above without explicit
approval, per the standing service restrictions.
