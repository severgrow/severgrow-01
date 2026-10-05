# Resolution and Export

Tiles render from about 20 to 160 CSS px at device pixel ratio 1–3, so the largest realistic case is roughly 480 device pixels per hex.

## Authoring
Keep the largest editable source art in `masters/`.

Recommended master scale:
- per-hex / home / mask source: ~1024 px per hex
- seamless ground textures: 4096×4096
- home master: ~1536×1536 where useful
- network strip master: 1024×128

Master files are development/source assets and do **not** ship to players.

## Runtime export tiers
Every runtime asset must keep identical naming, anchors, crop logic and composition between tiers.

### `hi/`
- nominal 512 px per hex
- ground textures 2048×2048
- for desktop, tablet and close/zoomed board views
- total compressed runtime tier target: **under 8 MB**

### `lo/`
- nominal 256 px per hex
- ground textures 1024×1024
- for phones and normal zoom
- total compressed runtime tier target: **under 3 MB**

## Export quality
- opaque ground: WebP around quality 88 unless visual inspection demands slightly more
- transparency: PNG or WebP alpha, whichever gives the cleaner edge/size result
- downscale from master with Lanczos
- follow with a *very light* sharpen only
- do not add new high-frequency detail during export

## Required visual checks
Inspect the lo tier at:
- 40 px per tile
- 64 px per tile

It must remain clean and stable with no shimmer, crunchy cracks or noisy foliage.

## Runtime memory rule
Compressed file size is not decoded memory.

A 2048×2048 RGBA image is ~16 MB decoded. Therefore:
- never preload both hi and lo tiers;
- on phones, default to lo;
- do not keep unused hi textures decoded 'just in case';
- if the ground has already been composited to a board canvas, release source ImageBitmap/image resources when practical;
- hi should be loaded only when the visible resolution genuinely needs it.

The renderer handoff includes recommended tier-selection hysteresis so zooming does not cause repeated tier swapping.
