# Art Lab — isolated transparent overhang study (13 November 2026)

This is **not** the live default skin. Base `futa0.5-online` was `f4ba65f5`; the unfinished
`fix/blast-input-planet-login` branch remains at `28b88c91` and is **not integrated**.

## Purpose

Use the *existing* `/art/` (Art Lab) to preview the original forest/ash source sheets after
removing fluorescent-green backgrounds. Do not introduce a separate board layout or model
overlays: `SkinBoardView` already owns gameplay geometry, the actual home orientation,
and the existing effects engine.

**For the owner:** the companion `FUTASAKU_ART_LAB_terrain_only_overhang.zip` contains only
the original 9+9 painted terrain variations and two homes. Open this branch's Art Lab
locally, then choose **Import terrain only** and select the ZIP. This keeps today's
cards, rocks, gold, supporting textures, FX and mechanics. Use the Art Lab's phone
sizes, Hold: today's art, and Grow / Strengthen / Cut / Bomb / Blast to judge it.

The source art was painted as flat-topped hexes. The companion pack's images
are converted once to **point-up canonical assets**. Runtime follows
`web/src/logic/orient.ts` and rotates only with the real board; no independent
preview lattice or extra game rotation is added.

## Isolated code changes

- `SkinBoardView` supports `nativeStones`: the full Art Lab skin still draws the
  **original physical numbered stones** via `drawSeedStone`, including their existing
  change/glint functionality. The default live option stays unchanged.
- `overhangingTiles` is opt-in and sizes transparent source canvases to fit
  the existing `S=30` pointy-side-up hex, with different margins for grass/ash.
  The click and hover areas are still the exact `BoardView` polygons.
- `BoardOverlay` duplicates **only artwork pixels outside a cell's own hex**
  into a decorative, non-interactive layer under the effects/selection/marks.
  Numeric stone zones in adjacent occupied tiles are masked out, keeping values
  readable even when grass reaches across their borders. The tree and volcano
  remain on the existing home layer (already over the claimed tiles).
- Only designer-supplied regular painted tiles enable the extra layer. Today's
  current Art Lab art has no additional painting pass.
- `Import terrain only` changes four terrain/home slots. Existing full **Import pack**
  behaviour remains untouched.
- No engine, server, data, gameplay rules, main render defaults, work flows, or deployment
  were changed.

## Verification before any release

Do not call this production ready until the **exact branch SHA** passes
`npm run check`, required `CHANNEL=futa04` build/assets, `CHANNEL=futa05`
and Art Lab builds, and `node --import tsx web/e2e/art-lab.ts` with
`art-lab-ios.ts` on WebKit. Inspect real gameplay at 360/390/430 and desktop,
tutorial rings, gold, number stones, Bloom/Blast, homes, overlap and reduced motion.

If this is later proposed for release, also compare the documented November
2026 rendering/performance counters; no permanent rAF or animation loops were added.
Do not touch `fix/blast-input-planet-login` to ship the art. Its WebKit Blast-drag
failure must be resolved and verified independently.

**Current status:** work branch + companion importable pack; CI/browser/device
release approval is not assumed. No push to `futa0.5-online` or promote.
