# Renderer handoff (technical art only)

This is not game code. It describes the intended renderer behaviour so the art assets are used correctly.

## Render order
1. empty/gold/rock base
2. owned seamless ground sampled in screen-upright world coordinates
3. strength overlay through local coverage mask
4. local clarity attenuation under number/gold zones
5. props (LOD-limited)
6. network (continuous code path skinned by strip)
7. homes
8. scars/cutoff state
9. numbers / badges / gameplay overlays
10. FX

## Ground
Do not draw one finished raster image per owned hex.

Sample a seamless world texture across the board, then clip per hex. Adjacent owned cells should expose adjacent regions of the same world texture so the ground joins naturally.

Forest:
- base = forest_ground_a/b
- strength blend = forest_lush through coverage_01..09

Volcano:
- base = volcano_ground_a/b
- strength blend = volcano_hot through coverage_01..09

Variation A/B should be selected deterministically at a region/world level, not randomly re-rolled per frame.

## Number / gold clarity
After sampling/blending ground, attenuate high-contrast lush/hot treatment locally using:
- clarity_number_zone
- clarity_gold_zone

Do not paint calm circles into the seamless texture itself.

## Board rotation
When the board rotates by 60 degrees, geometry rotates but raster art/light should remain upright in screen space. Use inverse rotation or screen-projected UVs for texture sampling.

## Props
Deterministic placement. Respect clear zones.

Suggested maximum prop count by rendered tile width:
- <40 CSS px: 0
- 40–63: 0–1 large prop
- 64–95: 1
- 96–129: 1–2
- 130+: 2–3

No prop should be required to identify ownership.

## Network
The game draws exactly one continuous path per linked pair.

Apply the network strip/style to the path:
- forest = bark/root strip
- volcano = dark crust + molten strip

The strip must tile along path length. Structural geometry always comes from code. Never join two raster connector ends at a shared edge.

## Tier selection
Compute an estimate:
`effective pixels per hex = CSS tile width × devicePixelRatio × current zoom`

Recommended policy:
- start lo on phones/coarse-pointer devices unless the board is unusually zoomed
- upgrade to hi around 280 effective px/hex
- downgrade to lo around 200 effective px/hex
- use hysteresis so zoom does not flap between tiers
- hi is appropriate on desktop/tablet where memory is safe
- do not preload both tiers
- do not keep unused hi source textures decoded on phones

If a board is composited into a screen-resolution canvas, keep that canvas as the display surface and release temporary decoded source images when practical.

## Canvas
Draw the ground once per board/camera resolution, not as dozens of independent image elements. Repaint dirty regions if the existing renderer supports it.

Lines, plates, numbers and interaction outlines stay vector/code-drawn so they remain sharp at any resolution.

## Runtime assets
Shipping builds should use only `hi/` or `lo/`.
`masters/`, `reference/`, `docs/` and style frames are development-only.
