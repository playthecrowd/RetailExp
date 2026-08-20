# Kameleon Decision Lounge — 360° production pipeline

The four scripts here produce `kameleon-decision-lounge-360-v1.mp4`, the single
equirectangular environment offered behind **Explore in 360°** at every pathway
decision. They are checked in so the asset is reproducible; they are **not**
part of the Next.js app and nothing imports them.

They read and write a working directory **outside this repository**. Nothing
they produce — the 4096×2048 panorama, the `.blend`, 450 PNG frames, the proof
renders — belongs in Git. Only the finished MP4 leaves, and it leaves through
Supabase Storage, not through a commit.

```
WORKDIR = C:\Users\cotye\Videos\Kameleon360Placeholders
```

## The pipeline

| Step | Script | Produces |
|---|---|---|
| 1 | `prepare_panorama.py` | `kameleon-decision-lounge-placeholder-360.png` — 4096×2048, wrap seam feathered |
| 2 | `make_bottle_cutout.py` | `kameleon-bottle-cutout.png` — the approved bottle with alpha |
| 3 | `build_scene.py` | the `.blend`, and 1800 frames into `frames/` (~90 min on a 4080, ~15 GB) |
| 4 | `encode.py` | the delivery MP4, verified against the brief |

Then, from the repository root:

```bash
node --env-file=.env.local scripts/install-360-lounge-asset.mjs \
  "C:\Users\cotye\Videos\Kameleon360Placeholders\kameleon-decision-lounge-360-v1.mp4"
```

Supporting checks, run when something looks wrong rather than every time:
`seam_check.py` (is the wrap actually continuous), `measure_yaw.py` (is
Blender's equirectangular mapping rotated relative to the source), and
`make_proof_views.py` (what the visitor's camera would actually show, as
rectilinear stills, including a narrow view straight at the seam).

## The three decisions worth knowing

**The lounge is the WORLD, not geometry.** The panorama is an equirectangular
environment texture. That gives complete 360×180 coverage with no mesh, so
there are no normals to flip, no pole pinching, and no seam that geometry could
introduce. Only the brand is modelled — the bottle, its contact shadow, and the
wordmark — because those are the things that must be exact and the things a
generated image cannot be trusted with.

**Cycles, not EEVEE.** Panoramic cameras are a Cycles feature; EEVEE cannot
render equirectangular at all. This is not a quality preference.

**Orientation is measured, not assumed.** `build_scene.py --calibrate` renders
the world alone so `measure_yaw.py` can correlate it against the source and
report the exact offset. Guessing Blender's mapping is how the hero bottle ends
up 90° behind the visitor, which is what happened on the first pass.

## Why the animation looks the way it does

Sixty seconds is long enough for the eye to learn a period and start predicting
it, which is what makes a loop *feel* like a loop. So no two properties breathe
on the same one: the key light runs a single cycle across the minute, the rim
one and a half, the pedestal two and a half, the sign one and three quarters,
the bottle one and a quarter. Their sum never repeats inside the clip.

Every curve is nonetheless sampled from a cosine completing a **whole number**
of cycles, so frame 1 and frame 1800 hold identical values and the minute can
loop without a visible jump. Non-repeating within, seamless across — the two
are not in tension, they just need different parts of the same construction.

The key light also travels a few centimetres on a slow arc. The light does not
visibly move; its reflection slides across the polished marble and the shoulder
of the glass, which is the only honest "environmental animation" a world-texture
lounge can offer — there is no furniture to sway.

## Two traps that cost real time

*The denoiser, not the ray tracing, is the cost.* A frame of this scene renders
on the GPU almost instantly and then spends ~11 seconds in OpenImageDenoise on
the CPU — 30 cores saturated while the GPU sits at 2%. `scene.cycles.denoiser =
"OPTIX"` moves it onto the GPU and takes the frame to ~2.5 s. If a render is
mysteriously slow, check which device is *denoising* before anything else.

*Blender's `print()` does not reach a redirected log on Windows.* That is how
the CPU fallback above went unnoticed for a whole render. Diagnostics in
`build_scene.py` go to **stderr** for exactly this reason.

## Resuming an interrupted render

`build_scene.py` sets `use_overwrite = False` and `use_placeholder = True`, so
re-running it skips every frame already on disk and picks up where it stopped.
Check for a truncated final frame first — a process killed mid-write leaves a
PNG that exists but will not open, and a skipped-because-present check cannot
tell the difference:

```bash
python -c "from PIL import Image; [Image.open(p).load() for p in __import__('glob').glob('frames/*.png')]"
```
