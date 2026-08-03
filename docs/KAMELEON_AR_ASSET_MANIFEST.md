# Kameleon AR Asset Manifest

Tracks every 3D/AR asset used by the Phase 5 real WebXR ground-plane
prototype. See `docs/KAMELEON_3D_ASSET_REQUIREMENTS.md` for the eventual
Phase 5/6 specification of the real Kameleon bottle scene this prototype
stands in for.

## DEPRECATED TECHNICAL PLACEMENT PLACEHOLDER — Android GLB (Fox)

**Status: deprecated technical placement placeholder.** This asset has
served its purpose — proving the WebXR hit-test/placement/animation
pipeline end-to-end, confirmed working on physical hardware — and is not
presented as the Kameleon prototype design. See "Chameleon replacement
specification" below for what replaces it. It is **kept in place and
functioning** rather than swapped for an inferior hand-built substitute:
per the explicit instruction covering this exact situation ("if a polished
animated [asset] cannot be produced with the locally available tools... keep
the working placement prototype"), no rigged/animated 3D character can be
produced with the tools available in this environment (see that section for
why), so replacing a proven, working, animated placeholder with a cruder
one would be a regression, not an improvement.

| | |
|---|---|
| **File** | `public/assets/kameleon/ar/sample-animated-model.glb` |
| **Source model** | Fox — Khronos Group glTF Sample Assets |
| **Format** | glTF 2.0 Binary (.glb), 162,852 bytes |
| **Downloaded from** | `https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/Fox/glTF-Binary/Fox.glb` (downloaded once at build time, 2026-08-03; loaded locally at runtime, never fetched remotely by the app) |
| **Upstream directory** | `Models/Fox/` in [KhronosGroup/glTF-Sample-Assets](https://github.com/KhronosGroup/glTF-Sample-Assets) |
| **Animations available** | `Survey` (used as the default/looping animation), `Walk`, `Run` — all three drive the same joints, so only one plays at a time per the model's own README |

### License / attribution

Per the model's own `LICENSE.md` and `README.md` in the upstream repository:

- **Model (PixelMannen, 2014):** [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/legalcode) — public domain, no attribution legally required, credited here as a courtesy.
- **Rigging & Animation (tomkranis, 2014):** [CC BY 4.0 International](https://creativecommons.org/licenses/by/4.0/legalcode)
- **glTF conversion (@AsoboStudio and @scurest, 2017):** [CC BY 4.0 International](https://creativecommons.org/licenses/by/4.0/legalcode)

All licenses are free, open, and require no payment, account, or credit-based
service to use — consistent with the project's standing restriction against
paid/metered assets.

### Why this model

The Fox GLB is a small (~160KB), well-formed, publicly-licensed animated
glTF model with multiple named animation clips (`Survey`/`Walk`/`Run`),
making it a convenient, zero-cost stand-in to prove the AR pipeline (GLTF
loading, `AnimationMixer` playback, hit-test-anchored placement, scale,
cleanup) end-to-end before the real Kameleon bottle asset exists. It has no
narrative relationship to Kameleon and is visually and thematically
unrelated to the brand.

### Replacement requirement

**This is a placeholder, not final creative.** Before any customer-facing
release, `sample-animated-model.glb` must be replaced with the production
Kameleon bottle GLB (see `docs/KAMELEON_3D_ASSET_REQUIREMENTS.md` for the
asset spec: packaging, origin, animation clips, scale). The model path is
isolated to a single constant in `lib/kameleon/ar/ar-types.ts`
(`SAMPLE_MODEL_URL`) so swapping the file is a one-line change, not a
component rewrite. Every UI surface that names the model in this prototype
(loading states, error messages, help text) refers to it generically as
"the sample model," never as "the Kameleon bottle," so nothing in the
current UI copy needs to change either when the swap happens.

## DEPRECATED TECHNICAL PLACEMENT PLACEHOLDER — iPhone/iPad USDZ

**Status: deprecated technical placement placeholder.** Physical iPhone
testing confirmed this asset's actual purpose — proving Quick Look launches,
requests camera access, detects a surface, and places/anchors an object —
is fully working. The two-cylinder geometry is a technical proof, not the
Kameleon prototype design; see "Chameleon replacement specification" below.

Physical-device testing (iPhone, Safari/Chrome, HTTPS, commit `0bed737`)
found that iOS never opened the camera: capability detection correctly
reported no `navigator.xr`, but there was no USDZ asset to offer Apple AR
Quick Look either, so iOS fell through to the inline 3D-preview fallback
with no real AR launch path at all. This section documents the fix.

| | |
|---|---|
| **File** | `public/assets/kameleon/ar/sample-static-model.usdz` |
| **Served at runtime via** | `/api/ar/usdz` (`app/api/ar/usdz/route.ts`), not the direct `public/` path — see "Why a route handler" below |
| **Source** | An **original** model authored directly as USD, **not a conversion of the Fox GLB** |
| **Format** | USDZ (a zip container around a single `.usdc` binary-USD layer), 1,896 bytes |
| **Geometry** | Two stacked analytic `UsdGeom.Cylinder` primitives (a "body" ~8cm diameter × 16cm tall, and a narrower "neck" on top) — a plain bottle-like silhouette, not a copy of any existing asset |
| **Materials** | Two `UsdPreviewSurface` PBR materials (copper-toned body, red-toned neck) matching the Kameleon brand palette — solid color, no textures |
| **Animation** | **None.** Static geometry only. |
| **Built with** | [`usd-core`](https://pypi.org/project/usd-core/) — Pixar/NVIDIA's official OpenUSD Python bindings, distributed free on PyPI (`pip install usd-core`), no account, no paid tier, no credit-based service. The authoring script is not committed (one-off, scratch-directory); regenerating it only requires `usd-core` and the two-cylinder construction described above. |

### Why not convert the Fox to USDZ?

A glTF → USDZ conversion of the animated Fox was considered first (matching
the originally-requested file name, `sample-animated-model.usdz`), but
**no reliable, verifiable conversion path was available in this
environment**: Apple's Reality Converter is macOS-only (this environment is
Windows), and command-line USD conversion tools (`usdzconvert` /
`usd_from_gltf`) either require a macOS/Apple toolchain or a from-source USD
build neither available nor practical here. Producing a USDZ via an
unverified, untested conversion pipeline and *labeling it as animated*
without being able to open it on an actual Apple device to confirm would
have violated the explicit instruction not to claim animation survived
conversion unless physically verified. Per that same instruction's own
fallback clause, a simple original static geometric model was built instead
via `usd-core`, which this environment *can* validate structurally
(zip integrity, USD scene-graph traversal, default-prim/up-axis/units — all
checked and passing) even though real on-device rendering still cannot be
confirmed without a physical Apple device.

**Animation is pending, not implemented, for the Quick Look path.** The
Android/WebXR path's GLB keeps its full Survey/Walk/Run animation
unaffected — this limitation is USDZ-specific.

**File naming note:** the originally-requested path was
`sample-animated-model.usdz`. Since the delivered file has no animation,
naming it "animated" would misrepresent it — it's named
`sample-static-model.usdz` instead, an intentional, disclosed deviation from
the requested filename for honesty's sake.

### Why a route handler instead of a direct `public/` link

Quick Look on iOS is triggered by a plain `<a rel="ar" href="....usdz">`
link (see `components/kameleon/ar/ARQuickLookScreen.tsx`). Apple's own
guidance is that the response should carry the `model/vnd.usdz+zip`
content-type; Next's default static-file serving from `public/` infers
content-type from a generic extension table that may not reliably map
`.usdz` on every host/CDN, which is a plausible contributor to the original
device-test failure (no working iPhone AR launch action at all). Serving it
through `app/api/ar/usdz/route.ts` instead guarantees the correct header on
every request regardless of platform defaults, removing that variable
entirely.

### Replacement requirement

Same as the GLB above: **temporary, not final creative.** Isolated to one
constant (`SAMPLE_MODEL_USDZ_URL` in `lib/kameleon/ar/ar-types.ts`) so
swapping in the real, animated, verified Kameleon-bottle USDZ later is a
one-line change plus the route handler's file path.

## Procedural effects (no external assets)

The "energy ring" glow around the placed model (`lib/kameleon/ar/energy-rings.ts`)
is generated entirely in code — Three.js primitive geometry (torus/ring
meshes) with additive-blended materials and a small low-count particle
system, no textures, no external files, no generation service of any kind.

## Three real capability-based paths (not two)

As of the iPhone correction, capability detection
(`lib/kameleon/ar/capability-detection.ts`) resolves one of three paths —
never guessed from device name alone:

1. **`navigator.xr.isSessionSupported("immersive-ar")` → true** — the
   embedded WebXR ground-plane experience (Android Chrome today):
   `components/kameleon/ar/KameleonARExperience.tsx`'s own hit-test/scanning/
   placement flow, using the animated GLB.
2. **WebXR unavailable, but `HTMLAnchorElement.relList.supports("ar")` →
   true** — Apple AR Quick Look (iPhone/iPad, any WebKit-based browser —
   Safari, Chrome, Edge, Firefox, since Apple requires all iOS browsers to
   run on WebKit): `components/kameleon/ar/ARQuickLookScreen.tsx`, launched
   via a plain `<a rel="ar" href="/api/ar/usdz">`, using the static USDZ.
3. **Neither** — `components/kameleon/ar/ARUnsupportedFallback.tsx`: a real
   `@google/model-viewer` (Apache-2.0, npm, no account/credit/paid tier)
   inline orbit preview of the animated GLB, an honest explanation, and
   "Continue without AR." This is the only path where AR genuinely isn't
   available — it no longer appears on iPhone once Quick Look is reachable
   there, and never claims "Full ground-plane AR isn't available here" on a
   device that actually has a working AR path.

**Update (AR-only correction round):** `ARQuickLookScreen` no longer offers
an inline "View 3D preview" toggle or any choice between AR and a webpage
preview — physical iPhone testing confirmed Quick Look itself launches,
opens the camera, and places the object correctly, so the customer flow was
simplified to a single "Open AR Experience" action per the correction
request. `ARUnsupportedFallback`'s inline `<model-viewer>` preview (path 3
above) is unchanged — that's the only place a webpage-rendered 3D preview
still appears, and only for devices with no real AR path at all.

## Apple AR Quick Look — the "Continue Your Journey" call-to-action

`ARQuickLookScreen` builds the Quick Look launch URL with Apple's
documented custom-banner fragment parameters —
`callToAction=Continue Your Journey`, `checkoutTitle=Kameleon`,
`checkoutSubtitle=Every Pour Is a Transformation`, and
`canonicalWebPageURL` (the current page, Apple's documented convention for
"return here") — so Quick Look shows our own call-to-action button instead
of a bare close control. Tapping it dispatches a WebKit `message` event
(`event.data === "_apple_ar_quicklook_button_tapped"`) to the triggering
anchor; that event — not Quick Look's dismissal on its own, since the user
could just tap the native X instead — is what transitions the page straight
to Quick Account, before Quick Look has even finished its own close
animation. No personal data (name, email, or any authentication value) is
ever placed in this URL — only the three static strings above.

### Platform limitation — documented, not worked around

**Once Quick Look opens, its AR tab, Object tab, close button, and share
button are rendered and controlled entirely by iOS.** No CSS, JavaScript,
or configuration on this website can hide, restyle, remove, or reorder any
of them — this is true for every website using AR Quick Look, not a gap in
this implementation. Physical-device screenshots confirmed all four native
controls display normally; **the Object tab was not, and cannot be,
removed**, and no report claiming otherwise should be trusted. The only
page-controllable pieces of the Quick Look surface are the custom banner
(configured above) and reacting to the `message`/`webkitendfullscreen`
events once the user has finished interacting with it.

## Chameleon replacement specification (for a 3D artist — not yet built)

**Honest status: not attempted beyond this specification.** A polished,
rigged, animated chameleon character cannot be produced with the tools
available in this environment — there is no 3D modeling/rigging/animation
software here (Blender itself isn't installed), and the only asset-creation
tooling actually available (`usd-core`'s raw Python geometry API, Three.js
`BufferGeometry` construction by hand) can express simple analytic
primitives (the cylinders above) but not organic character topology,
skeletal rigging, skinning weights, or keyframe animation — attempting one
by hand-coding vertices would produce something no more "recognizable as a
chameleon" than the current placeholder, while being far more likely to
contain real geometry/normal/rig errors nothing here could catch. Per the
explicit fallback instruction for exactly this situation, the working
placement prototype is kept (above) and this specification is provided
instead, so a 3D artist has everything needed to build the real asset.

### What must be supplied by a 3D artist

Everything in this section — there is no partial/placeholder version of
any of it in the current build.

#### Geometry
- Stylized, low-poly chameleon: recognizable head and body silhouette,
  coiled tail, four legs with simple foot contact geometry.
- Mobile-friendly polycount (target a similar order of magnitude to the
  current Fox placeholder, a few thousand triangles — exact ceiling TBD
  with the artist based on final style).
- Modeled at real-world scale with **Y = 0 at the ground-contact point**
  (feet/belly touching the floor when placed), matching the hit-test
  anchor convention already used by `applyHitPose`/`applyPlacementScale` in
  `lib/kameleon/ar/hit-test.ts` and `model-loader.ts`.
- Correct forward-facing orientation matching glTF/USD's standard +Z or -Z
  forward convention (confirm which with whatever export pipeline is used).

#### Rig
- A skeleton sufficient for: head rotation (for a head-turn animation),
  simple eye/eyelid deformation or blend shapes (for blinking), a jointed
  tail (for tail movement), and leg articulation (for a crawl cycle).
- Clean skinning weights — no unweighted or fully-rigid vertices where
  deformation is expected, since a badly-skinned mesh will visibly tear
  during animation on-device with no way for the app code to compensate.

#### Animation clips (named, not indexed — see the naming convention already
established in `docs/KAMELEON_3D_ASSET_REQUIREMENTS.md`)
| Clip | Purpose |
|---|---|
| `idle_breathing` | Resting loop, subtle chest/body movement |
| `head_turn` | Head-turn loop or triggerable action |
| `blink` | Eye movement/blink cycle |
| `tail_move` | Idle tail motion |
| `crawl_loop` | Short crawling/locomotion cycle |

All clips should be exported so the runtime can look them up **by name**
(matching the existing `AnimationController.playByName`/`playPreferred`
pattern in `lib/kameleon/ar/animation-controller.ts` — no code change is
needed there to support new named clips, only the `SAMPLE_MODEL_ANIMATIONS`
preference list needs updating to the new clip names once delivered).

#### Materials / texture
- Dark charcoal or black base body color.
- Copper accent detailing (matching the brand copper used throughout the
  app, `#c08552`-ish).
- Deep-red luminous highlight accents (matching the brand red, `#b23a3a`-ish)
  — can be a plain emissive material, doesn't need to be a literal light
  source.
- A subtle "Kameleon energy ring" motif at the base is **already solved in
  code**, not something the model needs to include — see
  `lib/kameleon/ar/energy-rings.ts`, a separate procedural Three.js effect
  layered around whatever model is placed. The artist's model does not need
  to model or texture this itself.
- PBR-compatible materials (metallic/roughness workflow), mobile-appropriate
  texture resolution (exact ceiling TBD with the artist).

#### Delivery formats
- **GLB** (binary glTF) for the Android/WebXR path — replaces
  `public/assets/kameleon/ar/sample-animated-model.glb`
  (`SAMPLE_MODEL_URL` in `lib/kameleon/ar/ar-types.ts`).
- **USDZ** for the iPhone/Quick Look path, matching the same visual model —
  replaces `public/assets/kameleon/ar/sample-static-model.usdz`
  (`SAMPLE_MODEL_USDZ_URL`, served via `app/api/ar/usdz/route.ts`).
- **Animation in the USDZ is optional, not required**, and must not be
  claimed working until physically verified on an actual iPhone — if the
  delivery pipeline used to produce the USDZ (e.g. Reality Converter from a
  rigged GLB/FBX, on macOS) doesn't reliably carry the animation through,
  ship a correctly-posed static USDZ instead and note that explicitly,
  exactly as this round's placeholder does.
- Both files should be reasonably small (the current placeholders are
  163KB/2KB respectively) — mobile load time matters more than fidelity for
  this early-funnel AR moment.

#### What does *not* need to change in code
Once delivered, swapping in the real assets is intended to be a small,
localized change: two file-path constants
(`SAMPLE_MODEL_URL`/`SAMPLE_MODEL_USDZ_URL` in `lib/kameleon/ar/ar-types.ts`),
the animation-name preference list (`SAMPLE_MODEL_ANIMATIONS`), and the
placement scale constant (`SAMPLE_MODEL_SCALE` in `model-loader.ts`, tuned
to the new model's real-world proportions) — the loading, hit-test
placement, cleanup, and UI code do not need to change.
