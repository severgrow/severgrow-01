"""The 2026-11-14 default cards, cut from their original green-screen sheets.

Usage: python3 scripts/build-card-art-2.py

Sources (kept): art/cards/source/{moss,dew,ash,ember,bomb,back}.webp
Outputs (same names and sizes the game already reads, so every surface switches at once):
  web/src/assets/cards/{moss,ash,dew,ember}.webp   3 x 3 atlases, 256 x 356 per card, rank 1..9
  web/src/assets/cards/bomb.webp                   the Bomb (Blast too)
  web/src/assets/cards/back-frame.webp             the supplied blank back
  web/src/assets/cards/back.webp                   the blank back with the approved emblem, as
                                                   today's back carries it (the emblem is the
                                                   game's own futasaku-emblem.webp, not redrawn)

The green screen is removed with the board art's keyer (scripts/build-forest-ash.py), so the
rounded corners are transparent and no green fringe is left; the leaf suit keeps its own green.
"""

from __future__ import annotations

import importlib.util
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "art" / "cards" / "source"
OUT = ROOT / "web" / "src" / "assets" / "cards"
CELL = (256, 356)

spec = importlib.util.spec_from_file_location("fa", ROOT / "scripts" / "build-forest-ash.py")
fa = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fa)


def keyed(name: str) -> np.ndarray:
    rgb = np.asarray(Image.open(SRC / f"{name}.webp").convert("RGB"))
    return fa.key_sheet(rgb, 3, foliage=True)


def card_image(rgba: np.ndarray, box) -> Image.Image:
    """One card: its own bounding box (corners transparent), resized onto the game's cell."""
    x0, y0, x1, y1 = box
    c = rgba[y0:y1, x0:x1]
    a = c[..., 3] > 128
    ys, xs = np.nonzero(a)
    c = c[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    pm = c.copy()
    pm[..., :3] *= pm[..., 3:4] / 255.0
    chans = [Image.fromarray(pm[..., i].astype(np.float32), mode="F").resize(CELL, Image.LANCZOS) for i in range(4)]
    res = np.dstack([np.asarray(ch) for ch in chans])
    al = np.clip(res[..., 3], 0, 255)
    rgb = np.where(al[..., None] > 0.5, res[..., :3] * 255.0 / np.maximum(al[..., None], 1e-3), 0)
    return Image.fromarray(np.dstack([np.clip(rgb, 0, 255), al]).round().astype(np.uint8), "RGBA")


def save(image: Image.Image, name: str, quality: int = 86) -> None:
    image.save(OUT / name, "WEBP", quality=quality, method=6)


def main() -> None:
    for suit in ("moss", "dew", "ash", "ember"):
        rgba = keyed(suit)
        boxes = fa.split(rgba[..., 3] / 255.0, 3, 3)
        atlas = Image.new("RGBA", (CELL[0] * 3, CELL[1] * 3))
        for rank, box in enumerate(boxes, start=1):
            row, column = divmod(rank - 1, 3)
            atlas.paste(card_image(rgba, box), (column * CELL[0], row * CELL[1]))
        save(atlas, f"{suit}.webp")
        print(f"  {suit}: 9 cards")
    bomb = keyed("bomb")
    save(card_image(bomb, fa.split(bomb[..., 3] / 255.0, 1, 1)[0]), "bomb.webp", 88)
    back = keyed("back")
    blank = card_image(back, fa.split(back[..., 3] / 255.0, 1, 1)[0])
    save(blank, "back-frame.webp", 88)
    # Today's back carries the emblem centred at ~43% of the card's width: the same here.
    emblem = Image.open(ROOT / "web" / "src" / "assets" / "futasaku-emblem.webp").convert("RGBA")
    emblem = emblem.crop(emblem.getchannel("A").getbbox())
    # In the card's own cream: the colour of the blank back's printed border, sampled.
    b = np.asarray(blank).astype(float)
    edge = b[6:14, CELL[0] // 3: 2 * CELL[0] // 3]
    cream = edge[edge[..., 3] > 200][:, :3]
    cream = cream[cream.sum(axis=1).argsort()[-len(cream) // 4:]].mean(axis=0)
    e = np.asarray(emblem).astype(float)
    lum = (e[..., :3].mean(axis=2) / 255.0)[..., None]
    e[..., :3] = cream * (0.55 + 0.45 * lum)
    emblem = Image.fromarray(e.round().astype(np.uint8), "RGBA")
    w = round(CELL[0] * 0.43)
    emblem = emblem.resize((w, round(emblem.height * w / emblem.width)), Image.LANCZOS)
    withEmblem = blank.copy()
    withEmblem.alpha_composite(emblem, ((CELL[0] - emblem.width) // 2, (CELL[1] - emblem.height) // 2))
    save(withEmblem, "back.webp", 88)
    print("  bomb, back-frame, back")


if __name__ == "__main__":
    main()
