"""Neutral luxury-retail placeholder imagery, composed deterministically.

WHY NOT A 3D RENDER
  It was, first. Blender on this machine threw EXCEPTION_ACCESS_VIOLATION on
  roughly four runs in five - the same scene crashing and then succeeding
  unchanged - and the one frame that did survive came out blown to white. A
  placeholder is not worth chasing a driver fault for. Composing the images
  directly is instant, reproducible, and gives exact control over a palette
  that has one hard requirement: it must not read as Kameleon.

THE PALETTE, AND WHY
  Warm white, soft grey, charcoal, brushed silver, champagne, cool blue.
  Kameleon is near-black, copper, deep red and teal. These two sets share
  nothing, which is the point - a client looking at this demo should never
  wonder whether they are looking at someone else's brand.

WHAT MAKES IT LOOK EXPENSIVE RATHER THAN FLAT
  Three things, and they are all restraint: a wide soft key light rather than
  an even fill, a single champagne accent rather than several, and generous
  empty space. The bottle carries no label because the brief forbids one, so
  the composition has to do the work instead.
"""
import math
import os
import random

from PIL import Image, ImageDraw, ImageFilter, ImageFont

OUT = os.path.join(r"C:\Users\cotye\Videos\GiftingDemoAssets", "out", "stills")
os.makedirs(OUT, exist_ok=True)

WARM_WHITE = (240, 238, 234)
SOFT_GREY = (214, 215, 217)
MID_GREY = (176, 179, 184)
CHARCOAL = (46, 48, 51)
SILVER = (191, 194, 198)
CHAMPAGNE = (230, 216, 189)
COOL_BLUE = (173, 191, 207)

FONT_DIR = r"C:\Windows\Fonts"


def font(name, size):
    for candidate in (name, "calibril.ttf", "calibri.ttf", "georgia.ttf"):
        path = os.path.join(FONT_DIR, candidate)
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size)
            except Exception:
                continue
    return ImageFont.load_default()


def backdrop(w, h, top=WARM_WHITE, bottom=SOFT_GREY):
    """A vertical gradient with a soft key glow high and right.

    Two passes: the gradient sets the room, the radial glow sets the light.
    Painting the glow at a quarter size and scaling up is what keeps it smooth
    instead of banded."""
    base = Image.new("RGB", (w, h), top)
    draw = ImageDraw.Draw(base)
    for y in range(h):
        t = (y / max(1, h - 1)) ** 1.15
        draw.line(
            [(0, y), (w, y)],
            fill=tuple(round(top[i] + (bottom[i] - top[i]) * t) for i in range(3)),
        )

    small = (max(1, w // 4), max(1, h // 4))
    glow = Image.new("L", small, 0)
    gd = ImageDraw.Draw(glow)
    cx, cy = int(small[0] * 0.68), int(small[1] * 0.24)
    radius = int(max(small) * 0.62)
    for i in range(radius, 0, -2):
        gd.ellipse([cx - i, cy - i * 0.82, cx + i, cy + i * 0.82], fill=int(150 * (1 - i / radius) ** 1.6))
    glow = glow.resize((w, h), Image.LANCZOS).filter(ImageFilter.GaussianBlur(w * 0.03))
    base = Image.composite(Image.new("RGB", (w, h), (255, 255, 255)), base, glow)
    return base


def vignette(img, strength=0.30):
    w, h = img.size
    mask = Image.new("L", (w, h), 0)
    md = ImageDraw.Draw(mask)
    md.ellipse([-w * 0.20, -h * 0.20, w * 1.20, h * 1.20], fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(min(w, h) * 0.16))
    dark = Image.new("RGB", (w, h), (150, 152, 156))
    return Image.blend(dark, img, 1.0).point(lambda v: v) if strength <= 0 else Image.composite(
        img, Image.blend(img, dark, strength), mask
    )


def grain(img, amount=3):
    """Barely-there noise. Perfectly clean gradients read as a screenshot of a
    CSS background; a little grain reads as a photograph."""
    w, h = img.size
    rnd = random.Random(11)
    noise = Image.new("L", (w // 2, h // 2))
    noise.putdata([128 + rnd.randint(-amount * 8, amount * 8) for _ in range((w // 2) * (h // 2))])
    noise = noise.resize((w, h), Image.BILINEAR)
    return Image.blend(img, Image.merge("RGB", (noise, noise, noise)), 0.035)


def soft_shadow(img, box, blur, opacity=90):
    w, h = img.size
    layer = Image.new("L", (w, h), 0)
    ImageDraw.Draw(layer).ellipse(box, fill=opacity)
    layer = layer.filter(ImageFilter.GaussianBlur(blur))
    shade = Image.new("RGB", (w, h), (120, 122, 127))
    return Image.composite(shade, img, layer)


def bottle(img, cx, base_y, height, tint=(252, 251, 249)):
    """A plain white bottle: body, shoulder, neck, cap. No label, no mark.

    Drawn on its own transparent layer so the highlight and the rim can be
    composited with real alpha rather than approximated by lightening pixels.
    """
    w, h = img.size
    layer = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)

    body_w = height * 0.30
    body_h = height * 0.56
    shoulder_h = height * 0.14
    neck_h = height * 0.22
    neck_w = body_w * 0.34
    cap_h = height * 0.08

    left, right = cx - body_w / 2, cx + body_w / 2
    body_top = base_y - body_h

    d.rounded_rectangle([left, body_top, right, base_y], radius=body_w * 0.16, fill=tint + (255,))
    # Shoulder: a polygon rather than a curve, because at these sizes the
    # straight taper reads cleaner than a spline and never wobbles.
    d.polygon(
        [(left, body_top), (right, body_top),
         (cx + neck_w / 2, body_top - shoulder_h), (cx - neck_w / 2, body_top - shoulder_h)],
        fill=tint + (255,),
    )
    neck_top = body_top - shoulder_h - neck_h
    d.rectangle([cx - neck_w / 2, neck_top, cx + neck_w / 2, body_top - shoulder_h + 2], fill=tint + (255,))
    d.rounded_rectangle(
        [cx - neck_w * 0.62, neck_top - cap_h, cx + neck_w * 0.62, neck_top + cap_h * 0.25],
        radius=neck_w * 0.18, fill=SILVER + (255,),
    )

    # One specular strip down the left third. A bottle with no label needs its
    # form described by light or it reads as a flat shape.
    hi = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    hd = ImageDraw.Draw(hi)
    hd.rounded_rectangle(
        [left + body_w * 0.14, body_top + body_h * 0.06, left + body_w * 0.30, base_y - body_h * 0.10],
        radius=body_w * 0.08, fill=(255, 255, 255, 170),
    )
    hd.rectangle([cx - neck_w * 0.30, neck_top + 4, cx - neck_w * 0.14, body_top - shoulder_h], fill=(255, 255, 255, 130))
    hi = hi.filter(ImageFilter.GaussianBlur(body_w * 0.05))
    layer = Image.alpha_composite(layer, hi)

    # A cool rim on the right edge, which is what separates it from the
    # backdrop without drawing an outline.
    rim = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    ImageDraw.Draw(rim).rounded_rectangle(
        [right - body_w * 0.10, body_top + body_h * 0.04, right - body_w * 0.02, base_y - body_h * 0.06],
        radius=body_w * 0.05, fill=COOL_BLUE + (120,),
    )
    layer = Image.alpha_composite(layer, rim.filter(ImageFilter.GaussianBlur(body_w * 0.06)))

    img = soft_shadow(img, [cx - body_w * 0.95, base_y - height * 0.03,
                            cx + body_w * 0.95, base_y + height * 0.075], blur=height * 0.035, opacity=105)
    out = img.convert("RGBA")
    out = Image.alpha_composite(out, layer)
    return out.convert("RGB")


def gift_box(img, cx, base_y, size, rotation_hint=0):
    w, h = img.size
    layer = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    half = size / 2
    top = base_y - size * 0.78
    d.rounded_rectangle([cx - half, top, cx + half, base_y], radius=size * 0.05, fill=SOFT_GREY + (255,))
    # Lid, a shade lighter, so the box has two planes instead of one.
    d.rounded_rectangle([cx - half * 1.06, top - size * 0.16, cx + half * 1.06, top + size * 0.10],
                        radius=size * 0.05, fill=(226, 227, 229, 255))
    # The single champagne accent.
    d.rectangle([cx - size * 0.09, top - size * 0.16, cx + size * 0.09, base_y], fill=CHAMPAGNE + (255,))
    d.rectangle([cx - half * 1.06, top + size * 0.22, cx + half * 1.06, top + size * 0.34], fill=CHAMPAGNE + (255,))

    img = soft_shadow(img, [cx - half * 1.5, base_y - size * 0.05, cx + half * 1.5, base_y + size * 0.10],
                      blur=size * 0.10, opacity=95)
    out = Image.alpha_composite(img.convert("RGBA"), layer)
    return out.convert("RGB")


def plinth(img, cx, cy, width, height):
    w, h = img.size
    layer = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    d.ellipse([cx - width / 2, cy - height / 2, cx + width / 2, cy + height / 2], fill=SILVER + (200,))
    d.ellipse([cx - width / 2, cy - height / 2 - height * 0.35, cx + width / 2, cy + height / 2 - height * 0.35],
              fill=(225, 227, 230, 255))
    out = Image.alpha_composite(img.convert("RGBA"), layer.filter(ImageFilter.GaussianBlur(2)))
    return out.convert("RGB")


def shelves(img, x, y, width, count=3, gap=None):
    """Glass shelving, for the retail-welcome scene."""
    w, h = img.size
    gap = gap or width * 0.34
    layer = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    for i in range(count):
        top = y + i * gap
        d.rounded_rectangle([x, top, x + width, top + width * 0.028], radius=3, fill=(255, 255, 255, 150))
        d.rounded_rectangle([x, top + width * 0.028, x + width, top + width * 0.040], radius=2, fill=COOL_BLUE + (90,))
    out = Image.alpha_composite(img.convert("RGBA"), layer.filter(ImageFilter.GaussianBlur(1.2)))
    return out.convert("RGB")


def caption(img, title, subtitle=None, align_bottom=True):
    """A restrained label. Letter-spaced small caps for the title, because that
    is what reads as premium retail rather than as a web app heading."""
    w, h = img.size
    layer = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    title_font = font("calibril.ttf", int(h * 0.032))
    sub_font = font("calibri.ttf", int(h * 0.020))

    spaced = " ".join(title.upper())
    tw = d.textlength(spaced, font=title_font)
    y = h * (0.86 if align_bottom else 0.08)
    d.text(((w - tw) / 2, y), spaced, font=title_font, fill=CHARCOAL + (235,))
    d.line([(w / 2 - tw * 0.22, y + h * 0.052), (w / 2 + tw * 0.22, y + h * 0.052)], fill=CHAMPAGNE + (220,), width=2)
    if subtitle:
        sw = d.textlength(subtitle, font=sub_font)
        d.text(((w - sw) / 2, y + h * 0.064), subtitle, font=sub_font, fill=(110, 113, 118, 220))
    out = Image.alpha_composite(img.convert("RGBA"), layer)
    return out.convert("RGB")


def finish(img):
    return grain(vignette(img))


# ---------------------------------------------------------------------------
# The scenes
# ---------------------------------------------------------------------------

def scene_product(w, h, label=None, sub=None):
    img = backdrop(w, h)
    base = h * 0.74
    img = plinth(img, w / 2, base + h * 0.012, w * 0.34, h * 0.045)
    img = bottle(img, w / 2, base, h * 0.50)
    if label:
        img = caption(img, label, sub)
    return finish(img)


def scene_retail(w, h, label=None, sub=None):
    img = backdrop(w, h, top=(238, 240, 242), bottom=(210, 214, 218))
    img = shelves(img, w * 0.06, h * 0.22, w * 0.30)
    img = shelves(img, w * 0.64, h * 0.26, w * 0.30)
    base = h * 0.76
    img = plinth(img, w / 2, base + h * 0.012, w * 0.30, h * 0.042)
    img = bottle(img, w / 2, base, h * 0.42)
    if label:
        img = caption(img, label, sub)
    return finish(img)


def scene_gift(w, h, label=None, sub=None):
    img = backdrop(w, h, top=(242, 239, 235), bottom=(216, 214, 210))
    base = h * 0.76
    img = gift_box(img, w * 0.30, base, min(w, h) * 0.20)
    img = gift_box(img, w * 0.72, base, min(w, h) * 0.16)
    img = bottle(img, w * 0.51, base, h * 0.44)
    if label:
        img = caption(img, label, sub)
    return finish(img)


def scene_gate(w, h):
    """Deliberately empty in the middle: text sits on top of this one."""
    img = backdrop(w, h, top=(243, 241, 238), bottom=(206, 209, 213))
    img = bottle(img, w * 0.74, h * 0.90, h * 0.42)
    img = shelves(img, w * 0.02, h * 0.12, w * 0.26)
    return finish(img)


LANDSCAPE = (1600, 1000)
PORTRAIT = (1080, 1920)
CARD = (1200, 800)

ASSETS = {
    "hero-product": (scene_product, LANDSCAPE, ("Signature Collection", "Presented in the studio")),
    "template-luxury-product-reveal": (scene_product, CARD, ("Luxury Product Reveal", "Studio light, brushed metal, clean white")),
    "template-modern-retail-welcome": (scene_retail, CARD, ("Modern Retail Welcome", "Flagship interior, glass and daylight")),
    "template-gift-presentation": (scene_gift, CARD, ("Gift Presentation", "Refined table, ribbon, understated")),
    "poster-brand-intro": (scene_retail, PORTRAIT, ("A Personal Story", "Brand introduction")),
    "poster-gift-reveal": (scene_gift, PORTRAIT, ("A Gift For You", "Personal message")),
    "poster-standard-gift": (scene_product, PORTRAIT, ("Your Gift", "Recorded message")),
    "poster-ai-gift": (scene_gift, PORTRAIT, ("Your Gift", "Scene presentation")),
    "product-package": (scene_gift, LANDSCAPE, ("Signature Gift Package", None)),
    "dashboard-card": (scene_product, CARD, (None, None)),
}

for name, (fn, size, labels) in ASSETS.items():
    w, h = size
    if fn is scene_gate:
        img = fn(w, h)
    else:
        img = fn(w, h, labels[0], labels[1])
    img.save(os.path.join(OUT, f"{name}.png"), "PNG", optimize=True)
    print(f"  {name:34s} {w}x{h}")

scene_gate(*PORTRAIT).save(os.path.join(OUT, "gate-background.png"), "PNG", optimize=True)
print(f"  {'gate-background':34s} {PORTRAIT[0]}x{PORTRAIT[1]}")
print("done")
