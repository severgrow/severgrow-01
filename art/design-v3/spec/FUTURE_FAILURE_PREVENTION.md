# Failure prevention — things V3 must solve before they become bugs

## 1. Never use contact sheets as production art
Style frames and contact sheets are review documents only.
Every production sprite must be exported from its own source with real alpha.

## 2. Ground continuity and screen-upright lighting are different requirements
Ground must join across hexes, but brush/light direction must not rotate when the board rotates.
Sample the world texture in screen-upright projected coordinates, then clip locally.

## 3. A seamless texture cannot contain per-hex number safe zones
Use the included local clarity masks after sampling. Otherwise repeating calm circles will visibly reveal the grid.

## 4. Network art must not define structural geometry
The game owns the path. Forest/lava strips only skin that exact continuous path.
Never use two capped connector sprites meeting at a tile edge.

## 5. Do not keep both runtime tiers decoded
Hi + lo resident together defeats the memory strategy.

## 6. Tier switching needs hysteresis
Do not swap hi/lo exactly at one threshold during zoom. Use an upgrade and downgrade threshold.

## 7. Hi and lo must have identical anchors
No tier should make a prop/home visibly jump when swapped.

## 8. No mixed projections
A beautiful 3/4 home is still wrong on a top-down board.

## 9. No one-pixel 'detail'
If a feature becomes a one-pixel sparkle at lo/40px, simplify or remove it.

## 10. Props are seasoning, not territory texture
At small LOD, show none or very few. The ground and network must carry the identity.

## 11. Keep basalt at high strength
Volcano 8–9 must retain dark structure. Hotter does not mean more orange fill.

## 12. Keep Level 1 finished
Strength should add richness, not repair an unfinished low rank.

## 13. Alpha edges
Export in sRGB, inspect against the actual #1c1f1e board, and avoid pale premultiplied fringes.

## 14. Seam tests are mandatory
Tiling 'looks seamless to me' is not enough. Compare opposite edges numerically and inspect a 3×3 repeat.

## 15. Do not bake UI into art
No number plates, strength digits, hex outlines, gold badges, ownership marks or interaction glows inside production terrain.
