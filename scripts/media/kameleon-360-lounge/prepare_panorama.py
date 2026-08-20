"""Feather the wrap seam, then upscale to the 4096x2048 production source.

THE DEFECT
  The generated panorama is a genuine equirectangular projection - 2:1, level
  horizon, uniform poles, no black ceiling or floor band - but column 0 does
  not continue column W-1. The boundary measured 3.48x the interior
  column-to-column baseline, with a hard 141.7 discontinuity two thirds of the
  way down, which is furniture height. On a sphere that is a vertical tear
  directly behind the visitor.

THE FIX
  A symmetric cosine-free feather across a narrow band at each edge:

      w_i = 0.5 * (1 - i/B)

      new[:, i]       = (1-w_i)*a[:, i]       + w_i*a[:, W-1-i]
      new[:, W-1-i]   = (1-w_i)*a[:, W-1-i]   + w_i*a[:, i]

  At i=0 both sides become the same average, so the boundary is continuous by
  construction. The weight falls to zero at i=B, so nothing outside the band
  is touched. B is deliberately small - a few degrees of arc - and the band
  sits behind the viewer's opening direction, opposite the hero pedestal.

  This is a blend, not a reconstruction: it removes the tear rather than
  inventing what should have been there. For a placeholder that is the honest
  trade, and it is the same feather panorama tools apply at a stitch line.

ORDER MATTERS
  Feather BEFORE upscaling. Upscaling first would interpolate the tear across
  more pixels and make it wider, not softer.
"""
import numpy as np
from PIL import Image

SRC = r"C:\Users\cotye\Videos\Kameleon360Placeholders\Kameleon_360_Panorama_Handoff\kameleon-lounge-360-panorama.png"
OUT = r"C:\Users\cotye\Videos\Kameleon360Placeholders\kameleon-decision-lounge-placeholder-360.png"

TARGET_W, TARGET_H = 4096, 2048
BAND_FRACTION = 0.020  # ~7 degrees of arc, split either side of the boundary

img = Image.open(SRC).convert("RGB")
a = np.asarray(img).astype(np.float32)
h, w, _ = a.shape
print(f"source        : {w} x {h}")

band = max(4, int(w * BAND_FRACTION))
print(f"feather band  : {band} px per edge  ({band / w * 360:.1f} deg of arc)")

fixed = a.copy()
for i in range(band):
    weight = 0.5 * (1.0 - i / band)
    left = a[:, i, :]
    right = a[:, w - 1 - i, :]
    fixed[:, i, :] = (1.0 - weight) * left + weight * right
    fixed[:, w - 1 - i, :] = (1.0 - weight) * right + weight * left

before = np.abs(a[:, 0, :] - a[:, w - 1, :]).mean()
after = np.abs(fixed[:, 0, :] - fixed[:, w - 1, :]).mean()
baseline = np.abs(a[:, 1:, :] - a[:, :-1, :]).mean()
print(f"seam before   : {before:.3f}  ({before / baseline:.2f}x baseline)")
print(f"seam after    : {after:.3f}  ({after / baseline:.2f}x baseline)")

feathered = Image.fromarray(np.clip(fixed, 0, 255).astype(np.uint8))

# LANCZOS for the upscale: the source is soft already and a bicubic enlargement
# of 2.3x would soften it further.
production = feathered.resize((TARGET_W, TARGET_H), Image.LANCZOS)
production.save(OUT, "PNG", optimize=True)

print(f"written       : {OUT}")
print(f"production    : {production.size[0]} x {production.size[1]}  "
      f"ratio {production.size[0] / production.size[1]:.4f}")
