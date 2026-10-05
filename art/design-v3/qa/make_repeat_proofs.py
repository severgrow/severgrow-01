#!/usr/bin/env python3
from pathlib import Path
from PIL import Image, ImageDraw
import argparse

NAMES = [
    "empty_ground","gold_ground","forest_ground_a","forest_ground_b",
    "forest_lush","volcano_ground_a","volcano_ground_b","volcano_hot"
]

def find_texture(folder, stem):
    for ext in (".webp",".png",".jpg",".jpeg"):
        p=folder/(stem+ext)
        if p.exists(): return p
    return None

def main(root: Path):
    out=root/"docs/repeat_proofs"
    out.mkdir(parents=True,exist_ok=True)
    for tier in ("hi","lo"):
        folder=root/tier/"textures"
        for stem in NAMES:
            p=find_texture(folder,stem)
            if not p: continue
            im=Image.open(p).convert("RGB")
            proof=Image.new("RGB",(im.width*3,im.height*3))
            for y in range(3):
                for x in range(3):
                    proof.paste(im,(x*im.width,y*im.height))
            proof.save(out/f"{tier}_{stem}_3x3.jpg",quality=90)
if __name__=="__main__":
    ap=argparse.ArgumentParser()
    ap.add_argument("root",nargs="?",default=".")
    a=ap.parse_args()
    main(Path(a.root).resolve())
