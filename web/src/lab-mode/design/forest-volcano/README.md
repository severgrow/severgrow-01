# SEVEROR — forest-volcano skin v1

A modular Lab-only visual skin pack built around Severor's measured production geometry.

Start here:
1. `CLAUDE_IMPLEMENTATION.md`
2. `BATCH_01.md` → `BATCH_05.md`
3. `manifest.json`
4. `geometry/geometry.json`

The important technical difference from the earlier concept sheets is that this pack contains real separate assets and exact SVG connector geometry. Network pieces are not closed sprites: each linked tile draws a half-spoke that crosses its exact shared-edge midpoint and continues into bleed, so the reciprocal neighbor can meet it cleanly.

The included art is an implementable v1 style pack. It is intentionally modular so individual illustration assets can later be replaced/refined without changing network geometry or game logic.
