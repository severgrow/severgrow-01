# CLAUDE CODE IMPLEMENTATION BRIEF — SEVEROR FOREST/VOLCANO SKIN v1

Work ONLY in the Beta/Lab test version. Do not change, merge into, or visually alter the main/default Severor build.

This folder is a production asset pack, not a concept sheet. Treat `manifest.json` and `geometry/geometry.json` as source-of-truth metadata. Read `BATCH_01.md` through `BATCH_05.md` in order before modifying code.

## Goal

Replace only the Lab tile visual layer with the `forest-volcano` skin while preserving all existing game state, rules, board geometry, cards, controls, scoring, layout and interaction behavior.

Key principle:

**INDIVIDUAL HEXES MECHANICALLY. CONNECTED ECOSYSTEMS VISUALLY.**

## Non-negotiable requirements

1. Keep the current renderer's exact board geometry.
2. Support both pointy-top and flat-top modes.
3. Do not rotate one orientation into the other.
4. Keep screen-space lighting/art upright while the board rotates in 60° steps.
5. Keep the strength number and gold badge UI unchanged and above the artwork.
6. Keep existing organic tile clipping unless it causes an unavoidable implementation problem; the raster sources intentionally contain enough surrounding material for clipping.
7. Network connectors are separate from base art.
8. Every linked pair must cross the shared edge at the exact midpoint using the SVG/geometry supplied.
9. No linked connection may use a closed/capped endpoint.
10. Make all variation deterministic. The same state must render the same art every time.
11. Keep performance suitable for browser/mobile play.
12. Do not change the main game.

## Suggested implementation order

### A. Add skin abstraction
Introduce a renderer-level skin abstraction if one does not already exist:
- baseMaterial
- strengthTreatment
- networkMaterial
- homeLandmark
- disconnectedTreatment
- severTreatment
- ambientTreatment

Do not hard-code generic architecture around names like `grass` and `lava`; future skins may be city, crystal, ocean, etc.

### B. Base materials
For each occupied tile:
- choose a base variant deterministically;
- render it through the current exact/organic hex clip;
- add the strength overlay matching 1–9;
- preserve the central number zone.

For neutral rocks, choose from the eight supplied neutral bases deterministically.

### C. Connections
Use the current actual screen-space neighbor direction to select one of the six half-spokes for the active orientation.

A connection half starts at 10.4 board units from the tile centre.
The supplied geometry guarantees the final approach is radial and crosses the exact edge midpoint.
The neighboring tile draws the reciprocal half.

Verify width class/load is symmetrical across both halves.

Do not replace this with hand-positioned CSS lines or approximate connector images.

### D. States
Disconnected forest:
- apply `forest_cutoff_overlay.png` plus existing desaturation logic if useful.

Disconnected volcano:
- apply `volcano_cutoff_overlay.png`, lowering heat intensity.

Strength 9:
- add the orientation/faction top-rank halo subtly.

Sever:
- select a scar variant deterministically and preserve it according to existing scar lifetime/state logic.

### E. Homes
Use home variant 01 initially.
Keep landmark upright in screen space.
Do not bake network exits into the home image: actual connectors remain separate.

### F. Decorative details
Do not flood the board with every provided sprite.
Use them only where they add intentional variation.
At small tile sizes, suppress micro-details first.

Suggested detail levels:
- < 40 CSS px tile: bases + strength + connectors + homes only
- 40–80: allow a small amount of larger detail
- 80–130: normal detail
- >130: full detail library, still restrained

### G. QA
Use the existing tests and add visual/dev checks if the project has a suitable mechanism.

Test:
- both orientations;
- all six directions;
- thin/normal/heavy links;
- levels 1–9;
- branches;
- roots/homes;
- gold cells;
- severed links;
- disconnected territories;
- huge Lab maps;
- mobile and desktop.

Compare against `preview/pointy_network_qa.png` and `preview/flat_network_qa.png` only for structural intent, not exact layout.

## Scope guard

If implementation requires touching shared renderer code because Lab/live currently share it, isolate the new behavior behind the Lab/Beta skin flag so the main/default game renders exactly as before. Do not silently roll the skin into production.

When finished:
1. run existing tests;
2. confirm game state snapshots are unchanged;
3. provide screenshots of Lab in pointy and flat modes;
4. report any asset or renderer limitation rather than improvising around it;
5. do not merge to main.
