# Skins: the picker, the contrast rule and the owner-colour rim

Owner decisions, 2026-11-20. This line is the **picker UI, choice model, contrast rule and unlock**
(`feat/skins-picker`). The **tile paint recipes, variant families and artwork** are a separate line
(`feat/wire-six-skins`); this document is the contract between them.

## The ten real skins, plus Colour

| Picker name | Id | Planet | Match |
| --- | --- | --- | --- |
| Colour (Slab) | `colour` | plain owner colour | **no** |
| Forest | `forest` | yes | yes |
| Ash | `ash` | yes | yes |
| Water | `water` | yes | yes |
| Toxic | `toxic` | yes | yes |
| Console | `console` | yes | yes |
| Voxel | `voxel` | yes | yes |
| Brushed | `brushed` | yes | yes |
| Carrara | `carrara` | yes | yes |
| Nero | `nero` | yes | yes |
| Hypnosis | `hypnosis` | yes | yes |

Ids and player-facing names live in `web/src/ui/skin-catalogue.ts` (`SKIN_IDS`, `SKIN_NAMES`). Do not
add a second list anywhere: the picker, the tests and the art branch all read that one table.

## The contrast rule

`web/src/ui/skin-contrast.ts` is the whole rule. It is a fixed table of five mutual pairs:

```
forest  ↔ ash
water   ↔ toxic
carrara ↔ nero
console ↔ hypnosis
voxel   ↔ brushed
```

`contrastPartner(skin)` returns the partner. `resolveSeatSkins(mine, theirs)` returns
`{ mine, theirs }` unchanged when the two differ, and `{ mine, theirs: contrastPartner(theirs) }`
when they collide. Only a collision changes the opponent's appearance; your own tiles never change.

**Where to call it:** the one place that resolves the two seats' appearances for a match, before
the board is painted — i.e. in the painter branch's seat resolver, not inside a tile painter and not
in this module. The exhaustive proof is `web/tests/skin-contrast.test.ts` (all 10 × 10 combinations,
plus totality, involution and symmetry).

**Online follow-up:** a live duel must know both seats' game skins to apply this. Today the server's
`skin` column stores the Planet skin of the account (four ids) and the opponent's board appearance
is not transmitted, so the resolver is ready but the online seat data must carry it (server-side
change, not done here).

## The choice model (two axes)

`web/src/ui/skinChoice.ts`:

```ts
type SkinChoice = {
  mine: PlanetSkin;            // SkinId | 'colour'
  theirs: PlanetSkin;
  mineGame: GameSkin | null;   // SkinId only; null = a colour planet with no match skin yet
  theirsGame: GameSkin | null;
  background: BackgroundId;    // independent backdrop
};
```

- **A real skin is one tap for both.** `chooseSkin({ mine: 'carrara' })` sets the planet and the
  match. `chooseSkin({ mineGame: 'voxel' })` (the picker's MATCH row) sets only the match.
- **Colour is planet-only.** `chooseSkin({ mine: 'colour' })` keeps the existing match skin; the
  picker's Done passes an explicit `mineGame: null` so a fresh match skin must be chosen. With no
  match skin, `mineGame` is `null` and the picker keeps the required second step visible. Painting
  still resolves a valid board skin through `gameSkinFor()`.
- **One normaliser.** `normaliseSkinChoice(input, base)` is the only code that coerces: unknown
  values fall back, a real planet with a missing game follows the planet (old saves), a valid game
  is kept (match row), `game` is never `'colour'`, and a corrupt background falls back.
- **Back-compat.** The old stored shape `{ mine, theirs, background }` loads with the game
  appearance derived from the planet, so a saved Water/Toxic board looks exactly as it did.
- **Default unchanged.** With nothing stored, `DEFAULT_SKIN` is Forest against Ash on slate —
  the board this game ships. Pinned by `web/tests/skin-choice-model.test.ts`.

## The owner-colour rim (art contract)

Owner colour on a skinned planet tile is a **thin inner rim**, not an outline outside the hex and
not a tint of the painting. `web/src/ui/skin-catalogue.ts` exports:

- `OWNER_RIM` — `insetFraction`, `widthFraction`, `minWidthPx`, `maxWidthPx`;
- `ownerRimFor(colour, hexRadiusPx)` — the exact ring (`insetPx`, `widthPx`, `colour`) the painter
  must draw inside the hex boundary;
- `skinnedTilePaint(id)` — the tile's preview/base/rim bundle.

**Every skin tile recipe must accept this ring and draw it in the same pass as the art.** A recipe
that ignores it has no owner colour on the planet. The four shipped atlas sets are already consumed;
the six recipe-branch sets must expose the same hook.

### The two halves, in one build

The six recipes' paintings live in `ui/tileSkinArt.ts` (the recipe half) and the picker is the other
half; this branch is the merge of both. `PLACEHOLDER_SKIN_CSS` survives only as the no-DOM (node
test) fallback — in a browser a recipe's chip is drawn by the SAME builder the board paints from, so
the pane cannot advertise a family the board does not draw.

`BOARD_READY_SKIN_IDS` is all ten. The board has two painters and dispatches on the id: the four
atlas sets go through `setFaSides` (their pictures are in the ground atlas), the six recipes through
`setTileSkins` (`ui/tileSkins.ts`). A recipe id must never reach `setFaSides` — `atlasSkinFor` is the
narrower question the territory painter asks, and it falls back to the seat's product set.

## The picker

- The key and window title are **SKINS** (`ONLINE.worldSkins`).
- Two tile rows make the two appearances distinct:
  - **On the planet** — Colour first, then the ten real skins; the current one is marked, and the
    row states its value (`Land: Carrara`).
  - **In a match** — the ten real skins only; its value (`Tiles: Carrara`) and its own mark.
- A guest sees only the **Colour** tile and a “Sign in to choose a skin.” line.
- Choosing **Colour** opens the twenty-colour picker in a dark-glass sheet over the pane (the
  established sheet material and `enterSurface`/`exitSurface` motion). **Done** commits the colour
  planet AND clears the match skin, so the MATCH row becomes a real required next step: the group
  glows, the line “Now pick how your tiles look in a match.” appears, no match tile is marked, and
  focus moves to the first one. That state is stored, so it survives a reload. A cancel (scrim,
  close, Escape) restores the previous planet AND match appearance exactly.
- The board backdrop keeps its own small row. Targets are 44 px+, every tile is a native button
  with `aria-pressed`, the sheet is a labelled `role="dialog"`, Escape closes the sheet first, and
  Tab is trapped inside it.

## Unlock

`skinPickerVisible()` in `web/src/ui/skinChoice.ts` is now **signed-in account**, not the owner's
nickname. To narrow it again, replace the body with `signedInNickname() === SKIN_PICKER_ADMIN`.
Guests are pinned to the product board and never spend a server request on a skin.

**A guest still gets the Colour tile.** The twenty owner colours are not skins and were always
everyone's; the pane is built for every player, the Colour tile opens the colour sheet for everyone,
and every real skin (the match row and the board row) is hidden until an account signs in, with one
quiet line saying why.

## The server's `skin` column

The API (`server/src/client.ts`, `protocol.ts`) still accepts only `forest | ash | water | toxic`.
The picker therefore:

- sends a real four-id planet skin to `chooseWorldSkin` exactly as before;
- **never** sends the six new ids or `colour` to that column — it keeps the wider choice locally
  (`severgrow.board-skin.v1`), and `adoptServerSkin` refuses to overwrite a local six-id choice
  with the server's older four-id answer.

**Server follow-up (not in this change):** widen the column/protocol to `SkinId`, and carry both
seats' game skins into a match so the contrast rule can run online.

## Verifying

```sh
npm run typecheck
CHANNEL=futa04 npm run web:build
CHANNEL=futa04 node scripts/check-channel-assets.mjs
npx vitest run web/tests/skin-contrast.test.ts web/tests/skin-choice-model.test.ts \
  web/tests/skin-picker-gate.test.ts web/tests/skin-picker-gate-live.test.ts \
  web/tests/tile-skin-switch.test.ts --maxWorkers=1 --no-file-parallelism
```

Browser proof: `npx tsx web/e2e/futa04-skins-picker.ts` (phone 390×844 and desktop), which writes
screenshots to `/tmp/picker/`.
