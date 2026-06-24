#!/usr/bin/env python3
"""Clean the sprite-atlas matte (the boss-square / mobile-readability fix).

The source art (assets/sprite-atlas.png) is a sprite-kit sheet where every sprite
sits on a DARK rounded card (luminance ~66, e.g. RGB 94,47,90). An earlier pass
only removed pure black (threshold 28), leaving those cards opaque — invisible on
the dark game background but showing as dark squares on mobile / lighter areas
("보스도 사각형"). See docs/plans/2026-06-24-atlas-matte-design.md.

Fix: a border-seeded flood fill that treats any pixel with luminance < T as
background and makes it transparent. Connectivity protects bright-rimmed sprite
interiors (e.g. the boss's dark-red core survives because a bright ring encloses
it). Verified against all 21 sprites referenced by sprites.js on a white bg.

Idempotent: re-running on the already-cleaned atlas is a no-op (the cards are gone,
nothing dark-and-connected remains). Run from the repo root:

    python3 tools/clean-sprite-atlas.py

Bump the ?v= cache-bust query in index.html and js/games/neonvortex/sprites.js
whenever this changes the atlas bits.
"""
import sys
from collections import deque
from PIL import Image

ATLAS = "assets/sprite-atlas.png"
THRESHOLD = 80  # luminance below this, reachable from the border, becomes transparent


def luminance(p):
    return 0.3 * p[0] + 0.59 * p[1] + 0.11 * p[2]


def main():
    src = Image.open(ATLAS).convert("RGB")
    w, h = src.size
    px = src.load()
    bg = bytearray(w * h)
    dq = deque()

    def seed(x, y):
        i = y * w + x
        if not bg[i] and luminance(px[x, y]) < THRESHOLD:
            bg[i] = 1
            dq.append((x, y))

    for x in range(w):
        seed(x, 0)
        seed(x, h - 1)
    for y in range(h):
        seed(0, y)
        seed(w - 1, y)
    while dq:
        x, y = dq.popleft()
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h:
                i = ny * w + nx
                if not bg[i] and luminance(px[nx, ny]) < THRESHOLD:
                    bg[i] = 1
                    dq.append((nx, ny))

    out = src.convert("RGBA")
    op = out.load()
    cleared = 0
    for y in range(h):
        for x in range(w):
            if bg[y * w + x]:
                r, g, b, _ = op[x, y]
                op[x, y] = (r, g, b, 0)
                cleared += 1
    out.save(ATLAS)
    print(f"cleaned {ATLAS}: {cleared} px transparent ({cleared * 100 // (w * h)}%), threshold {THRESHOLD}")


if __name__ == "__main__":
    sys.exit(main())
