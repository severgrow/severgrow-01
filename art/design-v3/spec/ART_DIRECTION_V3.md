# SEVEROR V3 Art Direction

## Target
A premium, hand-crafted indie strategy board: calm, tactile and highly readable.

Reference *qualities*, not copies:
- Dorfromantik: clarity and calm grouping
- Bad North: strong silhouettes and disciplined values
- ISLANDERS: compact readable world building
- Root: confident physical-board-game identity

Original work only.

## Projection
Everything is strict top-down orthographic:
- terrain
- props
- blocked rocks
- homes
- scars
- particles/decals

No isometric view, 3/4 view, plinths or visible hex sides.

## Lighting
One screen-space light:
- top-left light
- short soft down-right shadow
- artwork stays upright while the board rotates in 60-degree steps

The renderer must sample ground in a **screen-upright projected world space**. This matters: if UVs simply rotate with the board, painted light direction will rotate too and the illusion breaks.

## Shape language
Large forms first. Use 3–4 value steps:
1. shadow
2. base
3. light
4. small highlight

No photo texture, sub-pixel grain, random speckle or tiny generated clutter.

At 25% size every asset should still read.

## Material hierarchy
Loudest -> quietest:
1. network
2. homes
3. owned ground
4. props
5. gold
6. blocked rock
7. empty ground

## Palette
### Empty
#1c1f1e / #262a28 / #323633

### Rock
#3d3b37 / #57534c / #7a7468 / #9a9386

### Gold
#5a4a2a / #8a6f36 / #c9a24a

### Forest
#1f3a26 / #2f5a32 / #4f8a3c / #86b552 / #cfe08a
sparingly: #e9c45a / #d8664a / #f2efe2

### Volcano
basalt: #1b1817 / #2c2523 / #463a35 / #6a5850
magma: #8f2212 / #d2481a / #f47a26 / #ffd46a

Forest and volcano must differ in grayscale and surface structure, not only hue.

## Important local clarity rule
A truly seamless world texture cannot itself know where each hex's number sits. Therefore V3 includes **local clarity masks** per orientation:
- `clarity_number_zone.png`
- `clarity_gold_zone.png`

The renderer uses these after world-space sampling to reduce lush/hot contrast and prop density under UI. Do not try to paint a repeated 'empty circle' into the seamless texture itself; that would reveal the hex grid and break continuity.
