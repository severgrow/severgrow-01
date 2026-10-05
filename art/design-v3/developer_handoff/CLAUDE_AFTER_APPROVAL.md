# Claude Code handoff after V3 art approval

Do not use this until Phase 1 is approved and the final V3 art pack exists.

Renderer requirements:
- use runtime `lo/` or `hi/`, never `masters/`;
- select one tier using `tier_policy.json`;
- keep only one tier decoded at a time;
- render owned terrain from continuous seamless ground, not one image per hex;
- sample raster ground in screen-upright projected world coordinates;
- use orientation-specific coverage + clarity masks;
- keep numbers/plates/edges in code;
- place props separately with LOD and safe-zone exclusion;
- draw network as one continuous code path per linked pair and skin it with the strip;
- homes remain upright screen-space sprites;
- preserve Main/Lab/Design isolation as directed by the game branch plan.

Do not:
- import style-frame composites as art;
- use the current failed screenshot;
- revive V1/V2 per-tile connector sprites;
- rotate pointy raster art into flat orientation;
- load both hi and lo tiers simultaneously.
