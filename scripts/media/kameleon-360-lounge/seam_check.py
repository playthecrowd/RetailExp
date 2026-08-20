"""Seam and pole analysis for an equirectangular panorama.

A 2:1 ratio proves nothing about wrap-around. What matters is whether column 0
continues column W-1: in a real equirectangular image those two columns are
adjacent in the world, so the difference across that boundary should be no
larger than the difference between any two neighbouring interior columns.
"""
import sys
import numpy as np
from PIL import Image

path = sys.argv[1]
img = Image.open(path).convert("RGB")
a = np.asarray(img).astype(np.float32)
h, w, _ = a.shape

print(f"file      : {path}")
print(f"size      : {w} x {h}   ratio {w/h:.4f}")

# --- the wrap boundary -----------------------------------------------------
wrap = np.abs(a[:, 0, :] - a[:, w - 1, :]).mean()

# Baseline: the mean absolute difference between neighbouring interior columns.
# If the wrap difference is in the same band, there is no seam.
neighbour = np.abs(a[:, 1:, :] - a[:, :-1, :]).mean()
interior = np.abs(a[:, 1:-1, :][:, 1:, :] - a[:, 1:-1, :][:, :-1, :]).mean()

print()
print("--- wrap-around seam ---")
print(f"mean |col0 - colLast| : {wrap:8.3f}")
print(f"mean |neighbour cols| : {neighbour:8.3f}   (interior baseline)")
ratio = wrap / neighbour if neighbour else float("inf")
print(f"seam / baseline       : {ratio:8.3f}x")
verdict = "SEAMLESS (within neighbour noise)" if ratio <= 3.0 else "VISIBLE SEAM LIKELY"
print(f"verdict               : {verdict}")

# Worst row, so a localised seam cannot hide behind a good average.
per_row = np.abs(a[:, 0, :] - a[:, w - 1, :]).mean(axis=1)
worst = int(np.argmax(per_row))
print(f"worst row             : y={worst} ({worst/h*100:.1f}% down)  diff {per_row[worst]:.1f}")

# --- poles ------------------------------------------------------------------
# In equirectangular, the top and bottom rows collapse to single points, so
# each should be near-uniform across its width. A black band means a missing
# ceiling or floor.
print()
print("--- poles ---")
for name, row in (("top (ceiling)", a[0]), ("bottom (floor)", a[h - 1])):
    spread = row.std(axis=0).mean()
    lum = row.mean()
    state = "uniform" if spread < 12 else "NON-UNIFORM"
    black = "  <-- NEAR BLACK" if lum < 8 else ""
    print(f"{name:15s} mean luma {lum:6.2f}  spread {spread:6.2f}  {state}{black}")

# --- horizon ----------------------------------------------------------------
# The horizon sits at the vertical midpoint in a level equirectangular image.
mid = h // 2
band = a[mid - 2 : mid + 3].mean()
print()
print(f"--- horizon band (y={mid}) mean luma {band:.2f} ---")

# --- coverage ---------------------------------------------------------------
dark = float((a.mean(axis=2) < 6).mean() * 100)
print(f"pixels below luma 6   : {dark:.2f}%  (large values would mean empty regions)")
