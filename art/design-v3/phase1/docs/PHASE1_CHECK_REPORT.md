# SEVEROR V3 Phase 1 check report

## Seam error (hi runtime textures)

| texture | L/R MAE | T/B MAE |
|---|---:|---:|
| empty_ground | 0.018 | 0.248 |
| gold_ground | 0.140 | 0.200 |
| forest_ground_a | 0.511 | 0.728 |
| forest_lush | 0.637 | 0.708 |
| volcano_ground_a | 0.716 | 0.733 |
| volcano_hot | 1.520 | 1.313 |

- lo/ compressed size: **0.44 MB** (budget <3 MB)
- hi/ compressed size: **0.94 MB** (budget <8 MB)
- Six pointy/flat style frames generated at 40 / 80 / 150 px per hex.
- Matching grayscale frames generated.
- Repeat proofs generated from the actual hi runtime textures.
- Masks, state JSON and geometry are copied unchanged from the V3 starter.

Phase 1 intentionally stops here for visual approval.