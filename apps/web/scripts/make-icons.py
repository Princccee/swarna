"""Generate Svarna app icons (SVG + PNGs) from one geometry. Usage (from apps/web): python scripts/make-icons.py public   (needs Pillow)"""
import os
import sys
from PIL import Image, ImageDraw

OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)

BG = (12, 10, 6)          # #0C0A06 landing background
GOLD = (201, 151, 58)     # #C9973A
GOLD_LIGHT = (232, 184, 75)  # #E8B84B
GOLD_PALE = (245, 230, 200)  # #F5E6C8
GOLD_DEEP = (150, 105, 35)
GIRDLE = (92, 64, 22)  # solid line between crown and pavilion

# Geometry on a 512 canvas, centred at (256, 256)
TL, TR = (206, 178), (306, 178)          # table (top) corners
GL, GR = (146, 228), (366, 228)          # girdle ends
GML, GMR = (216, 228), (296, 228)        # girdle facet points
CUL = (256, 352)                          # culet (bottom point)
TOP_MID = (256, 178)

FACETS = [  # (polygon, colour)
    ([TL, TR, GMR, GML], GOLD_PALE),           # table
    ([GL, TL, GML], GOLD_LIGHT),               # crown left
    ([TR, GR, GMR], GOLD_LIGHT),               # crown right
    ([GL, GML, CUL], GOLD_DEEP),               # pavilion outer left
    ([GML, GMR, CUL], GOLD),                   # pavilion centre
    ([GMR, GR, CUL], GOLD_LIGHT),              # pavilion outer right
]
RING_R, RING_W = 176, 7
DOTS = [(256, 80), (256, 432), (80, 256), (432, 256)]  # mandala accents on the ring


def hexc(c):
    return '#%02X%02X%02X' % c


def svg(rounded: bool) -> str:
    rx = 112 if rounded else 0
    polys = '\n'.join(
        f'  <polygon points="{" ".join(f"{x},{y}" for x, y in p)}" fill="{hexc(c)}"/>' for p, c in FACETS)
    dots = '\n'.join(f'  <circle cx="{x}" cy="{y}" r="9" fill="{hexc(GOLD)}"/>' for x, y in DOTS)
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="{rx}" fill="{hexc(BG)}"/>
  <circle cx="256" cy="256" r="{RING_R}" fill="none" stroke="{hexc(GOLD)}" stroke-opacity="0.45" stroke-width="{RING_W}"/>
{dots}
{polys}
  <polyline points="{GL[0]},{GL[1]} {GR[0]},{GR[1]}" stroke="{hexc(GIRDLE)}" stroke-width="3"/>
</svg>
'''


def png(size: int, rounded: bool, scale: float = 1.0) -> Image.Image:
    """scale < 1 shrinks the artwork toward the centre (maskable safe zone)."""
    S = 4  # supersample
    W = 512 * S
    img = Image.new('RGBA', (W, W), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if rounded:
        d.rounded_rectangle([0, 0, W - 1, W - 1], radius=112 * S, fill=BG + (255,))
    else:
        d.rectangle([0, 0, W, W], fill=BG + (255,))

    def t(pt):
        x, y = pt
        return ((256 + (x - 256) * scale) * S, (256 + (y - 256) * scale) * S)

    r = RING_R * scale * S
    ring = Image.new('RGBA', (W, W), (0, 0, 0, 0))
    ImageDraw.Draw(ring).ellipse([W / 2 - r, W / 2 - r, W / 2 + r, W / 2 + r],
                                 outline=GOLD + (115,), width=int(RING_W * scale * S))
    img = Image.alpha_composite(img, ring)
    d = ImageDraw.Draw(img)
    for x, y in DOTS:
        cx, cy = t((x, y))
        rr = 9 * scale * S
        d.ellipse([cx - rr, cy - rr, cx + rr, cy + rr], fill=GOLD + (255,))
    for poly, c in FACETS:
        d.polygon([t(p) for p in poly], fill=c + (255,))
    d.line([t(GL), t(GR)], fill=GIRDLE + (255,), width=int(3 * scale * S))
    return img.resize((size, size), Image.LANCZOS)


with open(os.path.join(OUT, 'favicon.svg'), 'w', encoding='utf-8') as f:
    f.write(svg(rounded=True))

png(32, True).save(os.path.join(OUT, 'favicon-32.png'))
png(192, True).save(os.path.join(OUT, 'icon-192.png'))
png(512, True).save(os.path.join(OUT, 'icon-512.png'))
# Android crops maskable icons to a circle/squircle: full-bleed background, art inside the 80% safe zone
png(512, False, scale=0.78).convert('RGB').save(os.path.join(OUT, 'icon-maskable-512.png'))
# iOS rounds the corners itself and dislikes transparency
png(180, False, scale=0.9).convert('RGB').save(os.path.join(OUT, 'apple-touch-icon.png'))
# Classic favicon.ico (old browsers / direct /favicon.ico requests)
png(64, True).save(os.path.join(OUT, 'favicon.ico'), sizes=[(16, 16), (32, 32), (48, 48), (64, 64)])
print('written to', OUT)
