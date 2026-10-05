#!/usr/bin/env python3
"""Export approved SEVEROR V3 masters to runtime tiers.
Asset-pipeline helper only; not game code.
"""
from pathlib import Path
from PIL import Image, ImageFilter
import argparse

OPAQUE_TEXTURES = {
    "empty_ground","gold_ground","forest_ground_a","forest_ground_b",
    "forest_lush","volcano_ground_a","volcano_ground_b","volcano_hot"
}

def downscale(src: Path, dst: Path, size):
    im = Image.open(src)
    if isinstance(size, int):
        # preserve aspect
        scale = size / max(im.size)
        size = (max(1, round(im.width*scale)), max(1, round(im.height*scale)))
    out = im.resize(size, Image.Resampling.LANCZOS)
    # extremely light output sharpening; avoid crunchy one-pixel detail
    out = out.filter(ImageFilter.UnsharpMask(radius=0.55, percent=18, threshold=3))
    dst.parent.mkdir(parents=True, exist_ok=True)
    suffix = dst.suffix.lower()
    if suffix == ".webp":
        out.save(dst, "WEBP", quality=88, method=6, lossless=False)
    else:
        out.save(dst, optimize=True)

def main(root: Path):
    masters = root/"masters"
    # Opaque textures
    for p in (masters/"textures").glob("*"):
        if not p.is_file() or p.suffix.lower() not in {".png",".webp",".jpg",".jpeg"}:
            continue
        stem=p.stem
        ext=".webp" if stem in OPAQUE_TEXTURES else p.suffix.lower()
        downscale(p, root/"hi/textures"/f"{stem}{ext}", (2048,2048))
        downscale(p, root/"lo/textures"/f"{stem}{ext}", (1024,1024))

    # Generic transparent folders. Size caps are intentionally conservative.
    jobs = [
        ("props/forest",256,128),("props/volcano",256,128),("props/rock",256,128),
        ("homes",768,384),("fx",128,64),("states",256,128)
    ]
    for rel,hi_max,lo_max in jobs:
        srcdir=masters/rel
        if not srcdir.exists(): continue
        for p in srcdir.rglob("*"):
            if not p.is_file() or p.suffix.lower() not in {".png",".webp"}: continue
            sub=p.relative_to(srcdir)
            downscale(p, root/"hi"/rel/sub, hi_max)
            downscale(p, root/"lo"/rel/sub, lo_max)

    # Network strips: preserve required strip aspect exactly.
    for stem in ("forest_vine_strip","lava_flow_strip"):
        matches=list((masters/"network").glob(stem+".*"))
        if not matches: continue
        p=matches[0]
        downscale(p, root/"hi/network"/(stem+".webp"), (512,64))
        downscale(p, root/"lo/network"/(stem+".webp"), (256,32))

if __name__ == "__main__":
    ap=argparse.ArgumentParser()
    ap.add_argument("root", nargs="?", default=".")
    args=ap.parse_args()
    main(Path(args.root).resolve())
