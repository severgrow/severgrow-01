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


def tones(a: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """A card's two printed tones: its dark body and its cream (mean RGB of each)."""
    rgb, al = a[..., :3], a[..., 3]
    s = rgb.sum(-1)
    return rgb[(s < 200) & (al > 200)].mean(0), rgb[(s > 500) & (al > 200)].mean(0)


def match_faces(card: Image.Image, face: Image.Image) -> Image.Image:
    """The back in exactly the faces' colours: per channel, the line through the back's two tones
    (body, cream) onto the face's two tones. Texture and printing stay; only the colour moves."""
    a = np.asarray(card).astype(float)
    (bb, bc), (fb, fc) = tones(a), tones(np.asarray(face).astype(float))
    gain = (fc - fb) / np.maximum(bc - bb, 1.0)
    a[..., :3] = np.clip(fb + (a[..., :3] - bb) * gain, 0, 255)
    return Image.fromarray(a.round().astype(np.uint8), "RGBA")


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
    blank = match_faces(card_image(back, fa.split(back[..., 3] / 255.0, 1, 1)[0]), Image.open(OUT / "moss.webp").convert("RGBA").crop((0, 0) + CELL))
    save(blank, "back-frame.webp", 88)
    # The emblem big (owner, 2026-11-14: "we want the emblem big"): two thirds of the card's width.
    emblem = Image.open(ROOT / "web" / "src" / "assets" / "futasaku-emblem.webp").convert("RGBA")
    emblem = emblem.crop(emblem.getchannel("A").getbbox())
    # In the faces' own cream (owner, 2026-11-14: the back exactly the colour of the rest).
    cream = tones(np.asarray(Image.open(OUT / "moss.webp").convert("RGBA").crop((0, 0) + CELL)).astype(float))[1]
    e = np.asarray(emblem).astype(float)
    lum = (e[..., :3].mean(axis=2) / 255.0)[..., None]
    e[..., :3] = cream * (0.55 + 0.45 * lum)
    emblem = Image.fromarray(e.round().astype(np.uint8), "RGBA")
    w = round(CELL[0] * 0.66)
    emblem = emblem.resize((w, round(emblem.height * w / emblem.width)), Image.LANCZOS)
    withEmblem = blank.copy()
    withEmblem.alpha_composite(emblem, ((CELL[0] - emblem.width) // 2, (CELL[1] - emblem.height) // 2))
    save(withEmblem, "back.webp", 88)
    print("  bomb, back-frame, back")


if __name__ == "__main__":
    main()
