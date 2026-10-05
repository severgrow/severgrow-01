#!/usr/bin/env python3
from pathlib import Path
from PIL import Image
import numpy as np, json, sys

TEXTURES=[
 "empty_ground","gold_ground","forest_ground_a","forest_ground_b",
 "forest_lush","volcano_ground_a","volcano_ground_b","volcano_hot"
]
BUDGET={"lo":3*1024*1024,"hi":8*1024*1024}
TEX_SIZE={"lo":1024,"hi":2048}

def bytes_in(folder):
    return sum(p.stat().st_size for p in folder.rglob("*") if p.is_file())

def seam_error(im):
    a=np.asarray(im.convert("RGB"),dtype=np.float32)
    return float(np.mean(np.abs(a[:,0]-a[:,-1]))),float(np.mean(np.abs(a[0]-a[-1])))

def main(root: Path):
    errors=[]; warnings=[]
    for tier in ("lo","hi"):
        for name in TEXTURES:
            p=root/tier/"textures"/f"{name}.webp"
            if not p.exists():
                errors.append(f"missing {p.relative_to(root)}"); continue
            im=Image.open(p)
            if im.size!=(TEX_SIZE[tier],TEX_SIZE[tier]):
                errors.append(f"{p.relative_to(root)} wrong size {im.size}")
            lr,tb=seam_error(im)
            if max(lr,tb)>3.0:
                warnings.append(f"{p.relative_to(root)} seam MAE {lr:.2f}/{tb:.2f}")
        b=bytes_in(root/tier)
        if b>BUDGET[tier]:
            errors.append(f"{tier}/ over budget: {b/1024/1024:.2f} MB")

    fp=list((root/"hi/props/forest").glob("*.png"))
    vp=list((root/"hi/props/volcano").glob("*.png"))
    rp=list((root/"hi/props/rock").glob("*.png"))
    if not 10<=len(fp)<=14: errors.append(f"forest prop count {len(fp)}")
    if not 10<=len(vp)<=14: errors.append(f"volcano prop count {len(vp)}")
    if len(rp)!=4: errors.append(f"rock cluster count {len(rp)}")

    hs={str(p.relative_to(root/"hi")) for p in (root/"hi").rglob("*") if p.is_file()}
    ls={str(p.relative_to(root/"lo")) for p in (root/"lo").rglob("*") if p.is_file()}
    if hs!=ls: errors.append("hi/lo relative path mismatch")

    print("SEVEROR V3 PHASE 2")
    print("errors",len(errors))
    for e in errors: print("ERROR",e)
    print("warnings",len(warnings))
    for w in warnings: print("WARN ",w)
    sys.exit(1 if errors else 0)

if __name__=="__main__":
    main(Path(sys.argv[1] if len(sys.argv)>1 else ".").resolve())
