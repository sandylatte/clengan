#!/usr/bin/env python3
"""Generate the app icons from the C2 mark: three rounded bars stepping up.

Drawn here rather than exported from the SVG sprite because the icon is a
different object: it needs the maskable safe zone, a real background (a
transparent icon renders as a black square on some launchers), and fixed
colours, since a PNG cannot follow the app's tone tokens.
"""
from pathlib import Path
import struct
import zlib

BG = (0x00, 0x00, 0x00)
# Top to bottom, brightest first: the newest step is the lit one. Reversing
# these silently makes the stack read as draining rather than growing.
BARS = [(0x00, 0xEB, 0x62), (0x2E, 0x9E, 0x5E), (0x1C, 0x7A, 0x48)]

# How much of the canvas the mark spans. The mark occupies a square of this
# side, centred.
#
# 0.80 is the ordinary icon: as large as it can be while leaving a margin.
#
# The maskable one is smaller, and the reason is the shape of the guarantee.
# "Safe zone" is usually described as the middle 80%, which reads as a box —
# but the most aggressive common launcher mask is a CIRCLE of 80% diameter,
# and the corners of that box fall outside that circle. This mark is three
# full-width horizontal bars, which is precisely the shape that punishes the
# difference: measured against a circular mask, the 0.80 render loses 29% of
# its pixels and the top and bottom bars come out as chewed stubs.
#
# A square of side S fits a circle of radius r when S = r * sqrt(2). With
# r = 0.40 of the width that is 0.566, rounded down for margin.
SAFE = 0.80
SAFE_MASKABLE = 0.56


def rounded_bar(px, size, x0, y0, x1, y1, radius, colour):
    for y in range(max(0, int(y0)), min(size, int(y1) + 1)):
        for x in range(max(0, int(x0)), min(size, int(x1) + 1)):
            cx = min(max(x, x0 + radius), x1 - radius)
            cy = min(max(y, y0 + radius), y1 - radius)
            if (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2 + radius:
                px[y][x] = colour


def build(size, fraction=SAFE):
    px = [[BG for _ in range(size)] for _ in range(size)]
    safe = size * fraction
    left = (size - safe) / 2
    bar_h = safe * 0.185
    gap = (safe - 3 * bar_h) / 2
    radius = bar_h / 2
    # Equal lengths, stepping only in brightness — the approved C2 mark. The
    # icon and the in-app sprite have to stay the same object, so if one is
    # ever redrawn the other has to move with it.
    for i, colour in enumerate(BARS):
        top = left + i * (bar_h + gap)
        rounded_bar(px, size, left, top, left + safe, top + bar_h, radius, colour)
    return px


def write_png(path, px, size):
    raw = b"".join(b"\x00" + b"".join(bytes(p) for p in row) for row in px)

    def chunk(tag, data):
        body = tag + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body))

    png = (b"\x89PNG\r\n\x1a\n"
           + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0))
           + chunk(b"IDAT", zlib.compress(raw, 9))
           + chunk(b"IEND", b""))
    path.write_bytes(png)


if __name__ == "__main__":
    out = Path(__file__).parent / "icons"
    out.mkdir(exist_ok=True)
    # 180 is the apple-touch-icon size. Without that file iOS uses a
    # SCREENSHOT of the page as the home-screen icon, so the mark never
    # appears on an iPhone at all.
    for size in (180, 192, 512):
        write_png(out / f"icon-{size}.png", build(size), size)
        print(f"wrote icons/icon-{size}.png")

    # Separate files rather than one PNG serving both purposes. Declaring the
    # same image as `any` and `maskable` means one of the two is wrong: sized
    # for the box it is clipped by the circle, sized for the circle it is a
    # small mark floating in a large square everywhere else.
    for size in (192, 512):
        write_png(out / f"icon-{size}-maskable.png", build(size, SAFE_MASKABLE), size)
        print(f"wrote icons/icon-{size}-maskable.png")
