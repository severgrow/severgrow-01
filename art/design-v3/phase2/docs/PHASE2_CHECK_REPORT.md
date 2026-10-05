# SEVEROR V3 — Phase 2 Check Report

**Result: PASS**

## Runtime budgets

- `lo/`: **0.72 MB** / 3 MB
- `hi/`: **1.72 MB** / 8 MB

## Asset counts

- Forest props: **12**
- Volcano props: **12**
- Blocked rock clusters: **4**
- Forest wilt props: **4**
- Volcano ash props: **4**
- Home layers: **8**
- FX PNGs: **8**

## Critical volcano heat check — actual 40 px renderer logic

- Strength 2 mean heat score: **11.692**
- Strength 9 mean heat score: **17.025**
- Difference: **5.333**
- Strength 9 / strength 2 heat ratio: **1.456×**
- Multi-position proof: `docs/downscale_checks/volcano_strength_02_vs_09_40px_multisample.png`

## Seam error — hi textures

| Texture | L/R MAE | T/B MAE |
|---|---:|---:|
| empty_ground | 0.853 | 0.691 |
| gold_ground | 1.212 | 1.269 |
| forest_ground_a | 1.332 | 1.543 |
| forest_ground_b | 0.472 | 0.513 |
| forest_lush | 1.394 | 1.738 |
| volcano_ground_a | 0.403 | 0.426 |
| volcano_ground_b | 0.443 | 0.553 |
| volcano_hot | 1.757 | 0.943 |

Lossy WebP can introduce tiny edge-pixel differences even when the source master is exactly periodic. 3×3 repeat proofs are included for visual verification.

## Preservation / structure

- hi/lo runtime paths identical: **YES**
- Geometry + masks + cutoff tint JSON unchanged: **YES**
- `network/style.json` preserved byte-for-byte: **YES**

## Downscale review

- `docs/downscale_checks/lo_assets_at_40px_per_hex.png`
- `docs/downscale_checks/lo_assets_at_64px_per_hex.png`

## Warnings

- None.

## Errors

- None.