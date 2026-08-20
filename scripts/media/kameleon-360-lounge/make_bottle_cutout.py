"""Cut the approved Kameleon bottle out of its product shot.

WHY NOT A LUMINANCE KEY ALONE
  The bottle is dark glass on a black ground. Keying on brightness alone eats
  the glass edges and the lower third of the bottle. So brightness only
  IDENTIFIES lit pixels per row; the silhouette is filled between the leftmost
  and rightmost lit pixel of that row, which is exact for a horizontally
  convex object.

WHY A WIDTH CONSTRAINT
  The first attempt leaked. Near the bottom of the frame the polished marble
  surface is lit right across the image, so the row fill spanned all 1080
  pixels and swallowed the floor. The bottle is roughly 410 px wide; any row
  claiming much more than that is the surface, not the glass. The plausible
  width is measured from the shoulder region rather than assumed.

WHAT IS DELIBERATELY DISCARDED
  The photograph's own marble surface and its reflection. The scene already
  has a black-marble pedestal with its own lighting, and carrying a second
  surface in would put two floors in one shot.
"""
import numpy as np
from PIL import Image, ImageFilter

SRC = r"C:\Users\cotye\Documents\RetailExp\retail-exp\public\assets\kameleon\ar\kameleon-bottle.png"
OUT = r"C:\Users\cotye\Videos\Kameleon360Placeholders\kameleon-bottle-cutout.png"

LIT = 10
MIN_RUN = 40
WIDTH_TOLERANCE = 1.35
FEATHER = 2.0

img = Image.open(SRC).convert("RGB")
a = np.asarray(img).astype(np.float32)
h, w, _ = a.shape
luma = a.mean(axis=2)
print(f"source: {w} x {h}")

# Raw spans per row.
spans = {}
for y in range(h):
    lit = np.where(luma[y] > LIT)[0]
    if lit.size == 0:
        continue
    x0, x1 = int(lit.min()), int(lit.max())
    if x1 - x0 >= MIN_RUN:
        spans[y] = (x0, x1)

if not spans:
    raise SystemExit("no bottle found - check the LIT threshold")

# The body width, taken from the middle of the bottle where the label sits.
ys = sorted(spans)
mid_band = [spans[y][1] - spans[y][0] for y in ys if ys[0] + 0.35 * len(ys) <= y <= ys[0] + 0.75 * len(ys)]
body_width = float(np.median(mid_band))
limit = body_width * WIDTH_TOLERANCE
print(f"body width    : {body_width:.0f} px   accepting rows up to {limit:.0f} px")

mask = np.zeros((h, w), dtype=np.float32)
kept = []
for y in ys:
    x0, x1 = spans[y]
    if (x1 - x0) > limit:
        continue  # the lit marble surface, not the glass
    mask[y, x0 : x1 + 1] = 1.0
    kept.append(y)

top, base = min(kept), max(kept)
print(f"bottle rows   : {top} .. {base}")

cols = np.where(mask.sum(axis=0) > 0)[0]
pad = 8
x0, x1 = max(0, int(cols.min()) - pad), min(w - 1, int(cols.max()) + pad)
y0, y1 = max(0, top - pad), min(h - 1, base + pad)

rgb = Image.fromarray(a.astype(np.uint8)).crop((x0, y0, x1 + 1, y1 + 1))
alpha = Image.fromarray((mask[y0 : y1 + 1, x0 : x1 + 1] * 255).astype(np.uint8))
alpha = alpha.filter(ImageFilter.GaussianBlur(FEATHER))

out = rgb.convert("RGBA")
out.putalpha(alpha)
out.save(OUT, "PNG")

covered = float((np.asarray(alpha) > 127).mean() * 100)
print(f"written       : {OUT}")
print(f"cutout size   : {out.size[0]} x {out.size[1]}  h/w {out.size[1] / out.size[0]:.3f}")
print(f"opaque area   : {covered:.1f}% of the crop  (a bottle should be roughly 45-70%)")
