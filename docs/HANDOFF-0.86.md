# Handoff: Beta 0.86 (cards, Blast pass, Forest & Ash, planet) — 2026-11-14

Read `AGENTS.md` first. This note says exactly where things stand and what is left.

## Branches

| Branch | Head | State |
| --- | --- | --- |
| `futa0.5-online` | `4b4ad839` | The Blast pass (`fix/blast-input-planet-login` + the WebKit cancel-then-up fix). **Published to /test/** (publish run 43543634849 and server deploy 43543634775 succeeded after CI re-runs). |
| `live` | `f4ba65f5` | Unchanged. Nothing was promoted. |
| `feat/skin-on-blast` | `a3eca9b5` | **Everything else, on top of `4b4ad839`** (fast-forwardable). Not on /test/ yet: CI is red on 3 jobs (below). |
| `feat/forest-ash-skin` | older | Superseded by `feat/skin-on-blast`; do not merge separately. |
| `fix/blast-input-planet-login` | `4b4ad839` | Done and published. |

To publish when green: `git push origin <sha>:refs/heads/futa0.5-online` (fast-forward only). The
release-gate job `living-territory-ios` (WebKit) is flaky on the release line: it needed 3 attempts
on `4b4ad839` and 2 on `f4ba65f5`; re-run failed jobs, then re-run the publish and deploy runs, which
stop at their CI gate.

## Done on `feat/skin-on-blast`

- **Forest & Ash board skin** (default): `scripts/build-forest-ash.py` cuts the original sheets in
  `art/forest-ash/source/` into `web/src/assets/forest-ash/` + `web/src/ui/forestAshData.ts`.
  Renderer: `web/src/ui/defaultArtBoard.ts`, registry `web/src/ui/forestAsh.ts`. Art spills over its
  hex; order: tiles row by row < rocks < homes < fringe of the tile below a home. Homes have a traced
  outline (build time) that masks highlights on the 3 cells above, with a rim. No hex overlay on a
  home. No two neighbours share a variant. Old tiles/rocks/gold files deleted.
- **Water & Toxic sets, 5 painted backgrounds** (cocoa, lichen, cinder, clay, slate; 50% opacity;
  default still `classic` because the grey file never arrived). `/test/`-only switch in the planet
  colour pane: `web/src/online/skin-switch.ts`, `web/src/ui/skinChoice.ts`.
- **Cards**: `scripts/build-card-art-2.py` (sources `art/cards/source/`) replaces
  `web/src/assets/cards/*` (same names). Back = blank back recoloured to the faces' tones + big
  emblem. Hand cards: no CSS border/outline when playable, selected or picked for Bloom/Blast; card
  box radius = printed corner (5.9% / 4.2%), art covers the box (`web/src/player/cards.ts`,
  `smart-cockpit.ts`, `information.ts`, `ui/instrument.css`).
- **Planet**: tiles flat side up (`web/src/sphere/tile-face.ts`; `planet.ts` keeps a roll, levels
  the centre tile after a drag, flights land level, zoom never levels); your land wears your set's
  nine plain tiles (`scripts/build-planet-tiles.py` atlases, uploaded once in world view); variants
  never repeat between neighbours (`tileVariants`, tested on the real geometry).
- **Beta name 0.86** (`src/strings.ts`, `web/tests/menu-beta.test.ts`).
- Tests rewritten for owner rule changes (stated in commits): sphere-test north-up checks,
  planet-matte north/no-glide checks, bloom-by-hand aqua border, off-white mask allow-list.
- Perf measured and recorded in `docs/PERFORMANCE-RELIABILITY-2026-11.md` (0.86 section).

Local checks that passed on `1f9b1081`/`a3eca9b5`: typecheck; full unit suite (489 files, 4,793
tests); `futa04-critical`, `territory-menu`, `blast-input`, `sphere-test` (164), `planet-matte` (61),
futa04 asset check. Not checkable here: WebKit (cannot be downloaded in this sandbox), the served
/test/ build (network blocks futasaku.com).

## CI failures on `a3eca9b5` (fix before publishing)

1. **`lessons-3`** — `L3 3:intro:rock: the caption follows the action into the lower half`.
   Root cause NOT found yet. On `4b4ad839` the lit thing at that step is the rock `-1,0`; on this
   branch it is the home `-2,2`, so the lesson sequence diverges earlier. Suspects:
   `DefaultArtBoardView.orderKeys()` re-sorts `this.keys` (and hex-cell DOM order) by screen row —
   anything that relies on key or DOM order (`board.boardKeys`, first `.hex-cell`, keyboard focus,
   lesson targeting) changes; and `hl()` hides overlays on home cells (`display="none"`). Next step:
   log `tag` + `lit` at the top of `checkPlateClear` in a temp copy of `web/e2e/lessons-3.ts` on both
   builds and diff the first divergence. Never weaken the check.
2. **`futa04-information`** — visual baseline `tips-320x568` changed (mean 4.68, p99 48) in
   `web/e2e/futa04-intel-rework.ts`. The board/cards look changed on purpose: inspect the captures
   (`/tmp/v081-intel/`) and re-record with `UPDATE_VISUAL_BASELINE=1` (file
   `web/e2e/baselines/intel.json`), all keys that changed, then run without the flag.
3. **`sphere-test-ios`** (WebKit) — error not read yet: CI run 43582317631, job 132409568979. Likely
   the levelling turn or the rival-tap guard on WebKit timing.

## Owner requests still open (2026-11-14)

1. **Glows trace the card exactly, every colour** (playable green, Bloom/Blast aqua, coach, Grow
   edge light, fruit, any other): only `box-shadow`, same radius as the printed card, no outline or
   border anywhere. Audit every rule hitting `#hand .card` and piles.
2. **Cards a bit bigger**: the earlier (wrong) glow box showed the size wanted — scale the hand cards
   (`--cw`/layout) so the printed card is about that size. Check phone and desktop layouts and the
   layout tests.
3. **Draw pile, discard and opponent piles** must draw the exact new card shape (radius, no extra
   frames), including stacked layers.
4. **Turn frame must not cover the tree/smoke**: the board's turn rim (`l-planet-skin`, incl. the
   rim hardware from the Blast branch, drawn by `BoardView.drawPlanetSkin`) sits above the homes.
   In `DefaultArtBoardView.afterSetup` move the homes layer (and `l-fa-front`) above it, or the skin
   below the homes; check the home's canopy and smoke over the rim on phone and desktop.
5. **Planet stamps follow the tile turn**: the crossed swords (challenge stamp, `vStamp`, north
   aligned) and any other per-tile mark must use the levelled tile frame (`vTile`) so they sit
   upright on the flat-side-up tiles.
6. **Planet skins per player**: "everyone can pick a skin or colour for their planet skin". Needs
   the choice stored server-side next to the world colour (`server/src/seeds/*`, a migration in
   `server/migrations/`, `npm run server:build-edge`), returned per claim, and the planet painting
   each owner's land in their pick (tinting/atlas per owner). Server must ship first and the page must
   keep working against the old server.
7. **Grey background** as the new default: the file was never received (ask the owner); add it to
   `art/forest-ash/source/backgrounds/`, list it in `BACKGROUNDS` in the build script, make it
   `DEFAULT_SKIN.background`.
8. **Perf**: style recalculation is up 9-10% on Bomb/Huge Cut/Bloom and Bloom's p95 moved 17 -> 33
   ms (recorded, not reduced). Ideas in the perf doc.
9. Screenshots for the owner of: phone + desktop game (live build), cards (selected, piles), the
   planet (flat side up, tiles), the skin switch, all four sets and backgrounds.
