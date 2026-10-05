# SEVEROR V3 — Phase 1b Check Report

**Status: STOP FOR APPROVAL. Phase 2 has not been started.**

## Technical result

- Required-file/dimension errors: **0**
- `lo/` compressed size: **0.46 MB** / 3 MB budget
- `hi/` compressed size: **1.07 MB** / 8 MB budget
- geometry + masks + states unchanged: **YES**
- `network/style.json` preserved byte-for-byte: **YES**

## Seam error — final hi textures

| Texture | L/R MAE | T/B MAE |
|---|---:|---:|
| empty_ground | 0.853 | 0.691 |
| gold_ground | 1.212 | 1.269 |
| forest_ground_a | 1.332 | 1.543 |
| forest_lush | 1.394 | 1.738 |
| volcano_ground_a | 1.033 | 0.997 |
| volcano_hot | 1.338 | 1.081 |

Lossy WebP introduces tiny edge-pixel differences; the 3×3 proof images are included for visual verification.

## Key fill checks

- Forest home: 88.5% W × 85.4% H
- Volcano home: 88.0% W × 84.9% H
- Forest network band: 87.5% strip height
- Lava network band: 85.9% strip height

## Delivered review outputs

- pointy 40 / 80 / 150
- flat 40 / 80 / 150
- matching grayscale frames
- six 3×3 texture repeat proofs
- three blocked-rock clusters
- three forest sample props
- three volcano sample props
- review-only prop/home sample sheet

Detailed per-file alpha/dimension/fill checks are in `PHASE1B_CHECK_REPORT.json`.