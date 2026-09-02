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

# Maskable icons are cropped to a circle of 80% width on some launchers, so
# everything meaningful stays inside the middle 80%.
SAFE = 0.80


def rounded_bar(px, size, x0, y0, x1, y1, radius, colour):
    for y in range(max(0, int(y0)), min(size, int(y1) + 1)):
        for x in range(max(0, int(x0)), min(size, int(x1) + 1)):
            cx = min(max(x, x0 + radius), x1 - radius)
            cy = min(max(y, y0 + radius), y1 - radius)
            if (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2 + radius:
                px[y][x] = colour


def build(size):
    px = [[BG for _ in range(size)] for _ in range(size)]
    safe = size * SAFE
    left = (size - safe) / 2
    bar_h = safe * 0.185
    gap = (safe - 3 * bar_h) / 2
    radius = bar_h / 2
    # Lengths step with the colours: the icon and the in-app mark have to be
    # the same object, and three equal bars read as a hamburger menu.
    lengths = (1.0, 0.76, 0.53)
    for i, (colour, share) in enumerate(zip(BARS, lengths)):
        top = left + i * (bar_h + gap)
        rounded_bar(px, size, left, top, left + safe * share, top + bar_h, radius, colour)
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
