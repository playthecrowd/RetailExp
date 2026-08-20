"""Rectilinear proof views from an equirectangular image.

Looking at a flat equirectangular strip tells you very little about what a
visitor sees: everything above and below the horizon is stretched, and the one
place a seam actually shows - the wrap - is split across two opposite edges.
These are the views the visitor's camera would actually produce.

Usage:
  python make_proof_views.py <equirect.png> <out_dir> [--tag NAME]
"""
import os
import sys

import numpy as np
from PIL import Image

src_path = sys.argv[1]
out_dir = sys.argv[2]
tag = sys.argv[sys.argv.index("--tag") + 1] if "--tag" in sys.argv else "view"
os.makedirs(out_dir, exist_ok=True)

pano = np.asarray(Image.open(src_path).convert("RGB")).astype(np.float32)
H, W, _ = pano.shape
print(f"source {W} x {H}")


def sample(lon, lat):
    """Bilinear sample of the panorama at spherical coordinates."""
    x = (lon / (2 * np.pi) + 0.5) * W - 0.5
    y = (0.5 - lat / np.pi) * H - 0.5
    x0 = np.floor(x).astype(np.int64)
    y0 = np.clip(np.floor(y).astype(np.int64), 0, H - 2)
    fx = (x - x0)[..., None]
    fy = (y - y0)[..., None]
    x0m = x0 % W
    x1m = (x0 + 1) % W
    y1 = y0 + 1
    top = pano[y0, x0m] * (1 - fx) + pano[y0, x1m] * fx
    bot = pano[y1, x0m] * (1 - fx) + pano[y1, x1m] * fx
    return top * (1 - fy) + bot * fy


def rectilinear(yaw_deg, pitch_deg, fov_deg=90.0, size=(1280, 720)):
    w, h = size
    fov = np.deg2rad(fov_deg)
    f = (w / 2) / np.tan(fov / 2)

    u = np.arange(w) - (w - 1) / 2
    v = np.arange(h) - (h - 1) / 2
    uu, vv = np.meshgrid(u, v)

    # Camera-space ray, +Z forward.
    x = uu
    y = -vv
    z = np.full_like(uu, f, dtype=np.float32)
    n = np.sqrt(x * x + y * y + z * z)
    x, y, z = x / n, y / n, z / n

    pitch = np.deg2rad(pitch_deg)
    yaw = np.deg2rad(yaw_deg)

    # Pitch about the camera's X axis, then yaw about world Y.
    y2 = y * np.cos(pitch) - z * np.sin(pitch)
    z2 = y * np.sin(pitch) + z * np.cos(pitch)
    x3 = x * np.cos(yaw) + z2 * np.sin(yaw)
    z3 = -x * np.sin(yaw) + z2 * np.cos(yaw)

    lat = np.arcsin(np.clip(y2, -1, 1))
    lon = np.arctan2(x3, z3)
    return np.clip(sample(lon, lat), 0, 255).astype(np.uint8)


VIEWS = [
    ("forward", 0, 0, 90, (1280, 720)),
    ("right", 90, 0, 90, (1280, 720)),
    ("rear", 180, 0, 90, (1280, 720)),
    ("left", 270, 0, 90, (1280, 720)),
    ("ceiling", 0, 80, 100, (1000, 1000)),
    ("floor", 0, -80, 100, (1000, 1000)),
    # The wrap lands at 180 degrees from centre. A narrow field there makes a
    # tear obvious rather than lost in a wide shot.
    ("seam", 180, 0, 40, (1000, 700)),
    # What a phone actually shows first, in portrait.
    ("mobile-forward", 0, 0, 75, (720, 1280)),
]

for name, yaw, pitch, fov, size in VIEWS:
    img = rectilinear(yaw, pitch, fov, size)
    path = os.path.join(out_dir, f"{tag}-{name}.png")
    Image.fromarray(img).save(path)
    print(f"  {name:16s} yaw {yaw:4d}  pitch {pitch:4d}  fov {fov:3d}  -> {os.path.basename(path)}")

# A contact sheet so the whole set can be judged at once.
tiles = [Image.open(os.path.join(out_dir, f"{tag}-{n}.png")).convert("RGB").resize((640, 360))
         for n, *_ in VIEWS[:4]]
sheet = Image.new("RGB", (1280, 720))
for i, t in enumerate(tiles):
    sheet.paste(t, ((i % 2) * 640, (i // 2) * 360))
sheet_path = os.path.join(out_dir, f"{tag}-contact-sheet.png")
sheet.save(sheet_path)
print(f"  contact sheet    -> {os.path.basename(sheet_path)}")
