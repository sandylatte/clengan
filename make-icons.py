#!/usr/bin/env python3
"""Regenerate the app icons.

The mark is the Budget card reduced to three bars: fixed, flexible, savings,
descending. It is the one visual the app actually owns, and it survives being
shrunk to 48px in a launcher.

The icons are declared `purpose: any maskable`, so Android may crop them to an
arbitrary shape. Everything is drawn inside the maskable safe zone — the
centred circle of 80% diameter — which is why the bars occupy a good deal less
of the canvas than they otherwise would.

Run after changing the palette:  python3 make-icons.py
"""
from PIL import Image, ImageDraw

BACKGROUND = '#0D0E10'   # Tone A canvas
BAR = '#C8A15A'          # Tone A brass
SUPERSAMPLE = 4          # draw large, downscale once, get free antialiasing


def render(size):
    s = size * SUPERSAMPLE
    image = Image.new('RGB', (s, s), BACKGROUND)
    draw = ImageDraw.Draw(image)

    # Safe zone: the maskable circle has radius 0.4*s, so the largest square
    # that always survives a crop is its inscribed one, 0.4*s*sqrt(2) across.
    span = 0.566 * s
    left = (s - span) / 2

    thickness = span * 0.193
    gap = span * 0.138
    block = thickness * 3 + gap * 2
    top = (s - block) / 2

    for i, fraction in enumerate((1.0, 0.70, 0.45)):
        y = top + i * (thickness + gap)
        draw.rounded_rectangle(
            [left, y, left + span * fraction, y + thickness],
            radius=thickness / 2,
            fill=BAR,
        )

    return image.resize((size, size), Image.LANCZOS)


if __name__ == '__main__':
    for size in (192, 512):
        path = f'icons/icon-{size}.png'
        render(size).save(path, optimize=True)
        print(f'wrote {path}')
