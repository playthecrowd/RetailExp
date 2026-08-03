# Kameleon AR Asset Manifest

Tracks every 3D/AR asset used by the Phase 5 real WebXR ground-plane
prototype. See `docs/KAMELEON_3D_ASSET_REQUIREMENTS.md` for the eventual
Phase 5/6 specification of the real Kameleon bottle scene this prototype
stands in for.

## Sample prototype model — TEMPORARY, MUST BE REPLACED

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

## iPhone/iPad Quick Look model — TEMPORARY, ANIMATION PENDING

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

`ARQuickLookScreen` also offers its own "View 3D preview" toggle (the same
`<model-viewer>` element, showing the animated GLB) so iPhone users can
preview the model inline without leaving the page, in addition to the real
Quick Look launch action.
