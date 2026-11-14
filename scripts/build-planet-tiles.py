"""The planet's tile atlases: each territory set's nine plain tiles, cut to their hex, 3 x 3.

Usage: python3 scripts/build-planet-tiles.py   (after scripts/build-forest-ash.py)

Reads the exported sprites (web/src/assets/forest-ash/<set>-0N.webp) and their placements
(web/src/ui/forestAshData.ts) and writes web/src/assets/forest-ash/planet-<set>.webp: a 3 x 3 atlas of
CELL px tiles in the top-left of a SIZE x SIZE picture, each tile's flat-top hex centred in its cell with its circumradius = CELL / 2
(points touching the cell's left and right sides). Outside the hex is transparent: on the planet
each tile is drawn only inside its own cell, so spill is not wanted there.
"""

from __future__ import annotations

import math
import re
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
ART = ROOT / "web" / "src" / "assets" / "forest-ash"
DATA = ROOT / "web" / "src" / "ui" / "forestAshData.ts"
S = 30.0
CELL = 160
SIZE = 512  # power of two: WebGL 1 mipmaps it, so a zoomed-out planet never shimmers
SETS = ("forest", "ash", "water", "toxic")


def placements() -> dict[str, tuple[float, float, float, float]]:
    out = {}
    for m in re.finditer(r"'([a-z]+-\d\d)': \{ x: (-?[\d.]+), y: (-?[\d.]+), w: ([\d.]+), h: ([\d.]+)", DATA.read_text()):
        out[m.group(1)] = tuple(float(v) for v in m.groups()[1:])
    return out


def hex_mask(size: int) -> np.ndarray:
    yy, xx = np.mgrid[0:size, 0:size]
    c = size / 2.0
    r = size / 2.0
    x = np.abs(xx + 0.5 - c)
    y = np.abs(yy + 0.5 - c)
    return ((y <= math.sqrt(3) / 2 * r) & (math.sqrt(3) * x + y <= math.sqrt(3) * r)).astype(np.float32)


def main() -> None:
    place = placements()
    k = (CELL / 2) / S  # px per board unit
    mask = hex_mask(CELL)
    for name in SETS:
        atlas = Image.new("RGBA", (SIZE, SIZE))
        for i in range(9):
            key = f"{name}-0{i + 1}"
            x, y, w, h = place[key]
            src = Image.open(ART / f"{key}.webp").convert("RGBA").resize((round(w * k), round(h * k)), Image.LANCZOS)
            cell = Image.new("RGBA", (CELL, CELL))
            cell.alpha_composite(src, (round(CELL / 2 + x * k), round(CELL / 2 + y * k)))
            a = np.asarray(cell).astype(np.float32)
            a[..., 3] *= mask
            atlas.alpha_composite(Image.fromarray(a.round().astype(np.uint8), "RGBA"), ((i % 3) * CELL, (i // 3) * CELL))
        atlas.save(ART / f"planet-{name}.webp", "WEBP", quality=84, method=6)
        print(f"  planet-{name}.webp")


if __name__ == "__main__":
    main()
