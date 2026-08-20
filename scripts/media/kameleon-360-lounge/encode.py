"""Encode the rendered frame sequence into the delivery MP4, then verify it.

WHY A SEPARATE STEP AND NOT BLENDER'S OWN FFMPEG OUTPUT
  Blender can write H.264 directly, but it does not expose faststart, and a
  4K file whose moov atom sits at the END must be fully downloaded before a
  phone can show the first frame. On a mobile connection that is the whole
  difference between "opens" and "spins". Rendering to PNG also means an
  interrupted render resumes, which a single muxed file cannot.

WHY yuv420p IS NOT OPTIONAL
  Cycles writes RGB; H.264 in yuv444p or yuv422p decodes on desktop and fails
  silently to a black frame on iPhone Safari. This is the single most common
  reason a 360 video "works on my laptop" and not on the device it was made
  for.

VERIFICATION IS PART OF THE STEP
  The encode is checked against the brief - 3840x1920, exactly 2:1, 30 fps,
  15 s, h264, yuv420p, moov first - and the script fails rather than hands on
  a file that does not match. A wrong asset is worse than a missing one: a
  missing one degrades honestly, a wrong one looks like a defect in the app.
"""
import json
import os
import subprocess
import sys

ROOT = r"C:\Users\cotye\Videos\Kameleon360Placeholders"
FRAMES = os.path.join(ROOT, "frames", "f_%04d.png")
OUT = os.path.join(ROOT, "kameleon-decision-lounge-360-v1.mp4")

FPS = 30
EXPECTED_FRAMES = 450
WIDTH, HEIGHT = 3840, 1920

present = sorted(f for f in os.listdir(os.path.join(ROOT, "frames")) if f.endswith(".png"))
print(f"frames present : {len(present)} (expect {EXPECTED_FRAMES})")
if len(present) != EXPECTED_FRAMES:
    sys.exit(f"ABORT: {EXPECTED_FRAMES - len(present)} frames missing - the render is incomplete")

# A gap in the middle would encode happily and drop time out of the loop.
numbers = [int(f[2:6]) for f in present]
if numbers != list(range(1, EXPECTED_FRAMES + 1)):
    sys.exit("ABORT: the frame numbering has a gap")

# Present is not the same as readable, and the difference is not academic: a
# render killed mid-write leaves a zero-byte placeholder that the resume logic
# then SKIPS, because a file exists at that name. ffmpeg stops at the first
# unreadable frame and produces a short clip that passes every other check -
# the first run of this script emitted a confident, correct-looking 0.43 s
# video. Opening each frame is the only thing that catches it.
from PIL import Image  # noqa: E402  - only needed for this check

unreadable = []
for name in present:
    path = os.path.join(ROOT, "frames", name)
    try:
        with Image.open(path) as im:
            im.load()
            if im.size != (WIDTH, HEIGHT):
                unreadable.append(f"{name} is {im.size[0]}x{im.size[1]}")
    except Exception as exc:
        unreadable.append(f"{name} ({os.path.getsize(path)} bytes): {exc}")
if unreadable:
    for problem in unreadable[:10]:
        print(f"  BAD  {problem}")
    sys.exit(
        f"ABORT: {len(unreadable)} frame(s) unreadable. Delete them and re-run "
        "build_scene.py - it renders only what is missing."
    )
print("frames verified: all readable at the target resolution")

cmd = [
    "ffmpeg", "-y",
    "-framerate", str(FPS),
    "-i", FRAMES,
    "-c:v", "libx264",
    # High profile, level 5.1: what current iPhone and Android hardware
    # decoders accept at this resolution.
    "-profile:v", "high",
    "-level:v", "5.1",
    "-preset", "slow",
    "-crf", "20",
    "-pix_fmt", "yuv420p",
    # A keyframe every second. Seeking and the viewer's own recovery after a
    # stall both land on one, and at 15 s the size cost is negligible.
    "-g", str(FPS),
    "-movflags", "+faststart",
    "-an",
    OUT,
]
print("encoding …")
proc = subprocess.run(cmd, capture_output=True, text=True)
if proc.returncode != 0:
    print(proc.stderr[-3000:])
    sys.exit("ABORT: ffmpeg failed")

probe = json.loads(subprocess.run(
    ["ffprobe", "-v", "error", "-select_streams", "v:0",
     "-show_entries", "stream=width,height,r_frame_rate,pix_fmt,codec_name,profile,nb_frames",
     "-show_entries", "format=duration,size",
     "-of", "json", OUT],
    capture_output=True, text=True, check=True).stdout)
s = probe["streams"][0]
fmt = probe["format"]
num, den = (int(x) for x in s["r_frame_rate"].split("/"))
fps = num / den
duration = float(fmt["duration"])

# faststart puts moov before mdat; reading the first megabyte is enough to see
# which came first, and it is the property most likely to be silently lost.
with open(OUT, "rb") as fh:
    head = fh.read(1_000_000)
moov, mdat = head.find(b"moov"), head.find(b"mdat")
faststart = moov != -1 and (mdat == -1 or moov < mdat)

print()
print(f"file        : {OUT}")
print(f"size        : {int(fmt['size']) / 1_000_000:.1f} MB")
print(f"resolution  : {s['width']} x {s['height']}   ratio {s['width'] / s['height']:.4f}")
print(f"codec       : {s['codec_name']} / {s['profile']} / {s['pix_fmt']}")
print(f"frame rate  : {fps:g}")
print(f"duration    : {duration:.2f} s   ({s.get('nb_frames')} frames)")
print(f"faststart   : {faststart}")

checks = [
    (s["width"] == WIDTH and s["height"] == HEIGHT, f"resolution is {WIDTH}x{HEIGHT}"),
    (s["width"] == s["height"] * 2, "aspect ratio is exactly 2:1"),
    (s["codec_name"] == "h264", "codec is H.264"),
    (s["pix_fmt"] == "yuv420p", "pixel format is yuv420p"),
    (abs(fps - FPS) < 0.01, f"frame rate is {FPS}"),
    (abs(duration - EXPECTED_FRAMES / FPS) < 0.1, "duration is 15 s"),
    (faststart, "moov atom is at the front (faststart)"),
]
print()
failed = 0
for ok, description in checks:
    print(f"{'PASS' if ok else 'FAIL'}  {description}")
    failed += 0 if ok else 1

sys.exit(failed and f"{failed} delivery check(s) failed")
