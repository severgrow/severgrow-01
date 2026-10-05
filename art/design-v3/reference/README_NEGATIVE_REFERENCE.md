# Current attempt: negative reference

`CURRENT_ATTEMPT_DO_NOT_COPY.png` is included only so the art team can see what failed.

Do not crop it, trace it, re-use its textures, use its homes, or treat it as a production source.

## Problems visible in it
1. Painted owned cells sit beside flat UI cells like stickers.
2. Neutral rock is louder and more colourful than important territory.
3. Each hex is an independent painting, so adjacent cells do not form one landscape.
4. Small blurry micro-detail collapses into mush on a phone.
5. Homes are effectively 3D/isometric objects sitting on top-down cells.
6. Busy high-contrast detail sits directly behind gameplay numbers.
7. The network, which is the defining mechanic, is too thin and visually secondary.
8. Lighting and texture logic reset from tile to tile.
9. The raster resolution is visibly too low for desktop.
10. Art extraction/contact-sheet artefacts must never become production sprites.

The V3 solution is systemic: continuous terrain + local masks + separate props + top-down homes + code-drawn continuous networks.
