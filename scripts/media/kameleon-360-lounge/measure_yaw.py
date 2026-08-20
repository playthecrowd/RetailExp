"""Measure how Blender's equirectangular render is rotated relative to the source.

Blender's mapping between world directions and equirectangular columns is easy
to be wrong about by 90 or 180 degrees, and being wrong puts the hero bottle
somewhere behind the visitor. So it is measured: correlate the rendered world
against the source panorama across every possible horizontal shift and take the
best match.
"""
import numpy as np
from PIL import Image

SRC = r"C:\Users\cotye\Videos\Kameleon360Placeholders\kameleon-decision-lounge-placeholder-360.png"
RENDER = r"C:\Users\cotye\Videos\Kameleon360Placeholders\calibration\world_.png"

W = 512  # correlate at low width; a degree of precision is plenty


def load(path):
    img = Image.open(path).convert("L").resize((W, W // 2), Image.LANCZOS)
    a = np.asarray(img).astype(np.float32)
    return (a - a.mean()) / (a.std() + 1e-6)


src = load(SRC)
ren = load(RENDER)

# Correlate over the horizon band, where the lounge has the most structure.
band = slice(int(W * 0.5 * 0.35), int(W * 0.5 * 0.75))
s = src[band]
r = ren[band]

best_shift, best_score = 0, -1e9
for shift in range(W):
    score = float((s * np.roll(r, shift, axis=1)).sum())
    if score > best_score:
        best_score, best_shift = score, shift

# Also test the mirrored case: if the render is flipped the correlation of the
# unflipped image never rises properly, and silently accepting a poor best
# match would put the whole lounge backwards.
flip_shift, flip_score = 0, -1e9
rf = ren[band][:, ::-1]
for shift in range(W):
    score = float((s * np.roll(rf, shift, axis=1)).sum())
    if score > flip_score:
        flip_score, flip_shift = score, shift

pixels = s.size
print(f"best normalised score : {best_score / pixels:8.4f}  at shift {best_shift}/{W}")
print(f"best mirrored score   : {flip_score / pixels:8.4f}  at shift {flip_shift}/{W}")

if flip_score > best_score * 1.02:
    print("WARNING: the render correlates better MIRRORED - the mapping is flipped.")

degrees = best_shift / W * 360.0
radians = np.deg2rad(degrees)
# The render is the source rolled by +shift, so the world must be rotated back.
print()
print(f"render is rotated by  : {degrees:.2f} deg")
print(f"apply mapping yaw of  : {-radians:.6f} rad  ({-degrees:.2f} deg)")
print()
print(f"  --yaw {-radians:.6f}")
