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

## Procedural effects (no external assets)

The "energy ring" glow around the placed model (`lib/kameleon/ar/energy-rings.ts`)
is generated entirely in code — Three.js primitive geometry (torus/ring
meshes) with additive-blended materials and a small low-count particle
system, no textures, no external files, no generation service of any kind.

## Fallback viewer

`@google/model-viewer` (Apache-2.0, npm package, no account/credit/paid tier)
renders `sample-animated-model.glb` directly via `<model-viewer>` on devices
without immersive WebXR ground-plane support, using its built-in `ar-modes`
(`webxr scene-viewer quick-look`) to opportunistically offer native
Android Scene Viewer or iOS Quick Look AR where the OS/browser supports it.

**iOS Quick Look note:** Quick Look's AR Quick Look viewer requires a
**USDZ** file, not GLB — `<model-viewer>` can only offer the `quick-look`
AR mode if a USDZ asset is also supplied via its `ios-src` attribute. No
USDZ conversion of the sample model has been produced for this prototype, so
on iOS Safari this fallback currently renders as a **static/orbit 3D
preview only** (via `<model-viewer>`'s own WebGL renderer), not a native
AR placement experience — this is disclosed truthfully in the fallback UI
rather than implying Quick Look AR works without the required asset. A USDZ
version of the final Kameleon bottle GLB is a separate, tracked asset
requirement for whenever native iOS AR support is prioritized.
