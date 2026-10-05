# QA scripts

These scripts are asset-pipeline helpers, not game code.

Recommended Python packages:
- Pillow
- numpy

## `export_tiers.py`
Downscales approved masters into hi/lo tiers with Lanczos + very light sharpening.

## `check_v3_pack.py`
Checks:
- dimensions
- alpha expectations
- sprite transparent margin
- opposite-edge texture seam error
- hi/lo compressed tier budgets
- required file presence
- manifest presence

## `make_repeat_proofs.py`
Creates 3×3 repeats for seamless runtime textures.

Important:
The final visual decision is still human review. Numerical seam tests can catch technical errors but cannot prove the pattern has no obvious repetition.
