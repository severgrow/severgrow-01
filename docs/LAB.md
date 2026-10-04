# The Lab

The Lab is for quick experiments: other board shapes, other decks, longer games. It is only in
the **test copy** of the game (`…/test/`, built from the `dev` branch). The real game at the
site root never shows it or loads its code.

## Opening it

1. Open the test copy: https://severgrow.github.io/severgrow-01/test/
2. On the main menu, tap **Lab**.
3. Pick a preset under **Start from**, change anything you like, then tap **Apply and play**.

The line under the menu buttons says **Test build** and the experiment's name and short code.
**Back to Classic** there puts everything back to the normal game. The test copy keeps its own
saves and settings, separate from the real game.

## What you can change

**Map**
- Shape: the classic board, hexagon, rhombus, rectangle, triangle, ring or blob.
- Size: radius, width and height, the hole in a ring, or the number of hexes in a blob.
- Rock and gold, as a share of all hexes (about 11% rock and 14% gold by default).
- Homes: auto (as far apart as possible, mirrored when the shape allows), corners, or near the
  centre.
- Map seed, with **Randomise**: the same seed always gives the same map.
- A live preview: your home is green at the bottom, the opponent's is red at the top.
- Warnings (they never stop you playing): a home with fewer than 4 open neighbours, hexes cut
  off by rock, fewer than 20 hexes, more than 400 hexes, or homes closer than 4 steps.

**Deck and length**
- Hand size, copies of each card (1-3), highest card (5-9), Fruit cards (0-8).
- Sprout and Strengthen on or off.
- Reshuffle: when the deck runs out, the throw pile (all but its top card) is shuffled back in.
  With reshuffle on, the turn limit is the only clock, and the header counts down those turns.
- Turns each, or "until the deck runs out" (not with reshuffle).

**Opponent**: level 1 to 9.

## Watch a game

Two opponents play each other on the current experiment while you watch, live, with every
animation. Set **Green level** (green plays your side, at the bottom) and the opponent's
**Level** (red, at the top), then tap **Watch a game**. A small bar at the top shows who is
playing, a speed switch (**Slow**, **Normal**, **Fast**) and **Take over**: green stops and the
game waits for you to play its moves. Watched games don't count in your stats.

## Buttons

- **Apply and play** starts the experiment. "New game" from the menu keeps using it until you
  tap Back to Classic.
- **Reset to Classic** puts the panel back to the normal game.
- **Copy link** copies a link with the whole experiment in it. Whoever opens it (on any device)
  sees the Lab with a **Play this experiment** button. A broken link is ignored.
- **Save as preset** keeps it under "Start from" (in the test copy's own storage).

## Presets

| Preset | Board | Deck and length |
| --- | --- | --- |
| Classic | the normal board | the normal rules |
| Big hex | hexagon, radius 4 (61 hexes) | reshuffle, 40 turns each |
| Huge hex | hexagon, radius 6 (127 hexes) | reshuffle, 60 turns each |
| Rhombus 7x7 | 49 hexes | reshuffle, 40 turns each |
| Tall rectangle 6x10 | 60 hexes | reshuffle, 40 turns each |
| Ring | outer radius 5, hole radius 2 (84 hexes) | reshuffle, 40 turns each |
| Triangle | side 9 (45 hexes) | reshuffle, 40 turns each |
| Long game | the normal board | reshuffle, 50 turns each |

## Big boards

- The board shrinks to fit the screen.
- When tiles are smaller than 40pt: pinch with two fingers to zoom, drag with two fingers (or
  one finger on empty space) to move, or use the mouse wheel. **Reset view** shows the whole
  board again. Tapping and painting a Bloom work as usual while zoomed.
- The opponent's thinking is capped by counting, never by a timer, so it stays the same every
  time. On Lab boards it weighs 4 candidate moves (normally 6), imagines 3 hands for your reply
  (normally 6), looks at 12 of your replies besides Blooms, and quick-scores at most 300 Bloom
  shapes. The normal game's opponent is unchanged. If a step takes over 2 seconds, a calm
  "Thinking…" note shows.

## For developers

- Code: `web/src/lab-mode/` (`boardgen.ts` shapes and terrain, `setup.ts` presets and links,
  `panel.ts` the sheet, `panzoom.ts`). Engine: `config.board` (a set of hexes with rock, gold
  and homes) and `config.reshuffleDiscard`. Both default to off, which is the normal game.
- Smoke run: `CHANNEL=test npm run web:build && npx tsx web/e2e/lab-smoke.ts`.
- Known failing tests: `docs/LAB-KNOWN-BREAKAGE.md`.
