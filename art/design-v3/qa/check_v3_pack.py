#!/usr/bin/env python3
"""Technical validation for a SEVEROR V3 art pack."""
from pathlib import Path
from PIL import Image
import numpy as np, argparse, json, os, sys

TEXTURES = [
 "empty_ground","gold_ground","forest_ground_a","forest_ground_b",
 "forest_lush","volcano_ground_a","volcano_ground_b","volcano_hot"
]
BUDGETS={"lo":3*1024*1024,"hi":8*1024*1024}
TEX_SIZE={"lo":1024,"hi":2048}

def find(folder,stem):
    for ext in (".webp",".png"):
        p=folder/(stem+ext)
        if p.exists(): return p
    return None

def seam_error(im):
    a=np.asarray(im.convert("RGB"),dtype=np.float32)
    lr=np.mean(np.abs(a[:,0,:]-a[:,-1,:]))
    tb=np.mean(np.abs(a[0,:,:]-a[-1,:,:]))
    return float(lr),float(tb)

def alpha_margin(im, px=2):
    if "A" not in im.getbands(): return None
    a=np.asarray(im.getchannel("A"))
    border=np.concatenate([a[:px,:].ravel(),a[-px:,:].ravel(),a[:,:px].ravel(),a[:,-px:].ravel()])
    return int(border.max())

def tier_size(folder):
    return sum(p.stat().st_size for p in folder.rglob("*") if p.is_file())

def main(root):
    errors=[]; warns=[]
    for tier in ("lo","hi"):
        tf=root/tier/"textures"
        for stem in TEXTURES:
            p=find(tf,stem)
            if not p:
                errors.append(f"missing {tier} texture {stem}")
                continue
            im=Image.open(p)
            if im.size != (TEX_SIZE[tier],TEX_SIZE[tier]):
                errors.append(f"{p}: expected {TEX_SIZE[tier]} square, got {im.size}")
            if "A" in im.getbands():
                a=np.asarray(im.getchannel("A"))
                if int(a.min()) != 255:
                    errors.append(f"{p}: opaque texture has alpha <255")
            lr,tb=seam_error(im)
            if max(lr,tb)>3.0:
                warns.append(f"{p}: seam MAE high L/R={lr:.2f}, T/B={tb:.2f}")

        size=tier_size(root/tier)
        if size>BUDGETS[tier]:
            warns.append(f"{tier} compressed folder {size/1024/1024:.2f}MB > budget {BUDGETS[tier]/1024/1024:.0f}MB")

    # alpha sprites must have transparent edge margin
    for tier in ("lo","hi"):
        for base in ("props","homes","states","fx"):
            folder=root/tier/base
            if not folder.exists(): continue
            for p in folder.rglob("*.png"):
                im=Image.open(p)
                if "A" not in im.getbands():
                    errors.append(f"{p}: expected real alpha")
                    continue
                m=alpha_margin(im,2)
                if m is not None and m>8:
                    warns.append(f"{p}: artwork touches 2px canvas margin (max alpha {m})")

    if not (root/"manifest.json").exists():
        warns.append("final manifest.json not found (expected after full-pack approval)")
    print("SEVEROR V3 CHECK")
    print("errors:",len(errors))
    for x in errors: print("ERROR",x)
    print("warnings:",len(warns))
    for x in warns: print("WARN ",x)
    sys.exit(1 if errors else 0)

if __name__=="__main__":
    ap=argparse.ArgumentParser()
    ap.add_argument("root",nargs="?",default=".")
    a=ap.parse_args()
    main(Path(a.root).resolve())
