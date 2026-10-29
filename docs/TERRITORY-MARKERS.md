# Territory dispute markers — eight ideas, one pick

Owner, 2026-10-29, verbatim:

> "at the moment as RYK I have a duel over a tile in territory - but theres no swords icon on the tile
> that is being challenged right now - it should always show one. also find a smart way to have that
> icon on EVERY players tile that is in duel challenge right now, but also, other people challenges --
> clear distinction between my tiles that are challenged -- and challenges other people have over
> tiles, but similar u get me. think of 8 different ideas first, and then pick the best one,
> implement. efficient, quick loading, no battery draining."

This is the thinking, written before the code. The rules are in
[`TERRITORY-CHALLENGES.md`](TERRITORY-CHALLENGES.md); this note is only about **the mark on the map**.

## What the mark has to say

Three states share one tile:

| State | What it is | What the player should do |
| --- | --- | --- |
| **mine, incoming** | my tile; somebody challenged me | answer it (a call to action) |
| **mine, outgoing** | my challenge out there; my own tile is also at stake | open the duel / watch it |
| **theirs** | two other players are settling a tile | know it, and nothing else |

So the layer needs **two weights**, not three icons: *mine* (full, tappable) and *theirs* (quiet,
information only). The incoming/outgoing split already exists as `data-side`; it stays.

Hard constraints, from the owner and the code:

- 46 px tiles at the phone's shipping zoom, a 6-inch screen, one mark per disputed tile.
- Steady state free: no animation loop, no per-frame work, no intervals. The map already pauses
  expensive layers while panning and rebuilds its whole `<svg>` on every paint — the mark must
  follow those idioms, not invent a second renderer.
- Reuse the existing vocabulary before inventing: the six-point hex, the traced swords
  (`web/src/online/swords-glyph.ts`), `data-side`.
- Mine and theirs must differ by **shape or mark**, never by hue alone (colour-blindness, and the
  tiles are already coloured by owner).

## The eight ideas

| # | Idea | Clarity at a glance | Mine vs theirs without colour | Cost | Battery | Reads at 46 px? |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | **One glyph, two inks.** Same swords; cream for mine, dim grey for theirs. | Good while you look straight at it | **No** — colour only | 1 node/tile | Free | Grey on grey ground: no |
| 2 | **One glyph, two fills.** Mine: the existing solid white trace + red bloom, full size, 44 px tappable disc. Theirs: the *same* traced silhouette drawn as a hollow stroke, smaller, no bloom, no tap disc, `data-side="others"`. | Immediate: a solid X is a "you" mark, a wireframe X is background news | **Yes** — solid vs outline, tappable vs not | 1 node per *their* tile (1 `<path>`), 4 per mine tile (group+hit+glyph+path) | Free (static) | Yes at full size; the quiet mark needs ~0.8 px stroke to survive |
| 3 | **Badge / medallion.** A disc with the swords inside, like a token dropped on the tile. | Strong, but it covers the tile's face and says "item", not "dispute" | Yes (disc vs none) | 3–4 nodes/tile, plus a fill that fights the owner-colour language | Free | No: disc + glyph inside a 46 px hex is mud |
| 4 | **Outline the whole hex.** A second hex stroke: solid mine, dashed theirs, no glyph. | Ambiguous — it collides with the timer ring (already a hex outline) and the frontier mark | Yes (solid vs dashed) | 1 node/tile | Free | Yes, but it re-names an existing shape |
| 5 | **Corner pennant / flag.** A small triangle pinned to the hex corner. | Invented glyph: the player must learn a new symbol | Yes (flag vs none) | 1 node/tile | Free | No: ~6 px at 46 px cells |
| 6 | **Breathing ring / pulse on disputed tiles.** Slow opacity breath so disputes "glow". | Very visible | Yes (only mine breathes) | 1 node/tile but **continuous animation** | Drains: N tiles × infinite animation, and must be re-listed in the paused + both reduce-motion blocks | Yes, but 20 disputes make the map strobe |
| 7 | **A disputes layer, off by default**, toggled from the menu. | Zero noise by default | n/a | 0 until opened | Free | Information nobody turns on — fails the request |
| 8 | **List only.** No map mark; the challenge rail counts disputes. | Cheap, but the map is *where the tile is* | n/a | 0 | Free | Fails the request outright |

Two more were considered and are impossible or dishonest, so they are not in the table:

- **A count badge ("×2") for two challenges on one tile.** The schema has
  `world_challenges_one_open_idx` — a partial unique index on `cell_id` where the status is open.
  A cell can only ever carry one open challenge, so the count would always read ×1.
- **Hatching the contested tile.** It re-fills the hex, and fill is how the map says *who owns
  this*. The mark must not touch the language of ownership.

## The pick: idea 2 — one glyph, two fills

Why it wins on all five axes the owner named:

1. **It reuses the game's own word for "challenge".** The swords are already on the CHALLENGES key
   and already on contested tiles; a player learns nothing new. The change is weight, not vocabulary.
2. **The distinction is structural, not chromatic.** Mine is a *filled* mark with a red bloom and a
   44 px target that opens the sheet; theirs is the *outline* of the same silhouette, no bloom, no
   target, `role="img"`. Solid vs hollow and pressable vs not are both readable with any colour
   vision, and both survive the owner-coloured tiles underneath.
3. **It is the cheapest mark that still reads.** One `<path>` per other player's disputed tile — no
   wrapper, no disc, no pattern, no filter. Mine keeps exactly the nodes it has today. At 1 dispute
   that is 1–4 nodes; at 10 it is ≤40; at 100 it is ≤400 on a map that already draws ~2 000 nodes,
   and the count grows *linearly with the number of disputed cells*, never per challenge per cell.
4. **Steady state is free.** Both marks are static: no keyframes, no transition, no `setInterval`.
   There is nothing new to add to `animation-play-state: paused` or to either reduce-motion block,
   because there is nothing to pause. The only work is the one attribute pass the map already does
   on a poll or a repaint.
5. **It answers the owner's exact bug first.** The marker now follows the *challenge*, not the
   *timer*: pending **and** accepted, and it leaves only when the row closes (resolved, declined,
   expired, stale). A live duel keeps its swords; the timer ring stays a pending-only countdown,
   because a countdown that has stopped is a lie.

The quiet mark is *subordinate by every channel at once* — hollow instead of solid, smaller, ~55%
opacity, no bloom, no touch target, and never a keyboard stop. It is still a real, named image for
assistive technology, because "there is a fight over this ground" is information, not decoration.
