"""Extract the approved Futasaku card sheets into compact, deterministic WebP atlases.

Usage: python3 scripts/build-card-art.py /path/to/Archive.zip
The archive is source material; only the generated WebP files ship with the game.
"""

from __future__ import annotations

import io
import sys
import zipfile
from pathlib import Path

from PIL import Image

OUT = Path(__file__).resolve().parents[1] / "web" / "src" / "assets" / "cards"
CELL = (256, 356)
SHEETS = {
    "moss": "10_58_12 AM-1.png",
    "ash": "10_58_13 AM-2.png",
    "dew": "10_58_14 AM-3.png",
    "ember": "10_58_16 AM-4.png",
    "bomb": "10_58_18 AM-5.png",
}
# Each crop stops before the printed sheet label. Source cards vary a few pixels;
# resizing into one cell removes those inconsistencies without cutting the artwork.
COLUMNS = ((175, 450), (483, 769), (804, 1080))
ROWS = ((20, 379), (433, 790), (838, 1191))


def from_archive(archive: zipfile.ZipFile, suffix: str) -> Image.Image:
    names = [name for name in archive.namelist() if name.endswith(suffix) and not name.startswith("__MACOSX/")]
    if len(names) != 1:
        raise ValueError(f"Expected one image ending {suffix!r}; found {names}")
    image = Image.open(io.BytesIO(archive.read(names[0]))).convert("RGB")
    image.load()
    return image


def correct_lower_index(card: Image.Image) -> Image.Image:
    """Print the exact top-left numeral and suit mark upside down at bottom right.

    AI-rendered lower indices can resemble another rank. Reusing the correct upper
    index preserves the printed typography, cream and texture of that same card.
    The softly feathered patch includes the matching corner of its frame.
    """
    width, height = card.size
    left, top, right, bottom = 8, 10, 80, 132
    patch = card.crop((left, top, right, bottom)).transpose(Image.Transpose.ROTATE_180)
    mask = Image.new("L", patch.size)
    pixels = mask.load()
    for y in range(patch.height):
        for x in range(patch.width):
            edge = min(x, y, patch.width - 1 - x, patch.height - 1 - y)
            pixels[x, y] = max(0, min(255, edge * 43))
    position = (width - right, height - bottom)
    original = card.crop((position[0], position[1], position[0] + patch.width, position[1] + patch.height))
    card.paste(Image.composite(patch, original, mask), position)
    return card


def save_webp(image: Image.Image, name: str, quality: int = 82) -> None:
    image.save(OUT / name, "WEBP", quality=quality, method=6)


def main(archive_path: Path) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(archive_path) as archive:
        for suit in ("moss", "ash", "dew", "ember"):
            sheet = from_archive(archive, SHEETS[suit])
            if sheet.size != (1254, 1254):
                raise ValueError(f"Unexpected {suit} sheet size: {sheet.size}")
            atlas = Image.new("RGB", (CELL[0] * 3, CELL[1] * 3))
            for rank in range(1, 10):
                row, column = divmod(rank - 1, 3)
                x0, x1 = COLUMNS[column]
                y0, y1 = ROWS[row]
                card = sheet.crop((x0, y0, x1, y1)).resize(CELL, Image.Resampling.LANCZOS)
                atlas.paste(correct_lower_index(card), (column * CELL[0], row * CELL[1]))
            save_webp(atlas, f"{suit}.webp")
        bomb = from_archive(archive, SHEETS["bomb"])
        # The right-hand card on this sheet is an obsolete generic back. Never crop it.
        save_webp(bomb.crop((37, 191, 614, 1037)).resize(CELL, Image.Resampling.LANCZOS), "bomb.webp", 86)
        back_name = "Distressed Vintage Cloud Emblem Card.png"
        back = Image.open(io.BytesIO(archive.read(back_name))).convert("RGB")
        if back.size != (1064, 1479):
            raise ValueError(f"Unexpected Futasaku back size: {back.size}")
        # The approved logo is kept as supplied; resize the entire card, never recrop it.
        save_webp(back.resize(CELL, Image.Resampling.LANCZOS), "back.webp", 88)


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    main(Path(sys.argv[1]))
