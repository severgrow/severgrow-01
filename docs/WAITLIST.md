# Waiting for the locked beta

Everything changed in the test copy (`dev`, published at `/test/`) is listed here until it goes
into the locked beta (`main`). Nothing here is in the real game yet. When the user says
"lock it in", show this list and ask which items to include; then each chosen item goes through
the strict flow (tests first, full `npm run check`, the checks listed under it, the user's
go-ahead). Tick an item and add the date when it reaches `main`.

## Waiting

### DESIGN: the Lab game with the V2 illustrated forest/volcano skin
- Date: 2026-10-05 · Commit: `3428aba` · In test only (inside the Lab)
- Main menu (test copy): **Design** next to **Lab** reopens the page in DESIGN ("Leave Design"
  there goes back; Continue carries the game over).
- Lab sheet -> **DESIGN** applies the experiment and reopens the page with `?design=1`: the same
  game, Lab tools, maps and rules, drawn by `DesignBoardView` (`web/src/ui/designBoard.ts`, a
  subclass of `BoardView`). **Leave DESIGN** in the sheet goes back. `BoardView`, the normal Lab
  and the live game are unchanged; the art is in `web/public/design-v2/`.
- Applied from the V2 implementation drop. Changes to it: the DESIGN button sits in the Lab sheet
  (the drop put it on the material lab page, which now links to it only in the test copy); the
  sprites with sprite-sheet crop damage (baked checkerboard, guide lines, neighbour slivers:
  details, scars, homes) were cleaned; only whole details are used (forest 1, 5, 6, 7, 8;
  volcano 6, 7).
- Check before locking in: volcano bases 02-06 still have a white strip (unused for now); the
  strength art looks soft when upscaled on big tiles; the old grass fringe shows around forest
  tiles; numbers on busy flower tiles; 13 MB of PNGs (convert to WebP); flat-top art is an
  overscaled pointy master.

### Pro phone layout: slim header, compact centred hand, control row (nothing overlaps)
- Date: 2026-10-05 · Commit: `5c75f68` · In test only
- Header: only the menu button and the score bar. Scores, turn, level, turns left and "What
  happened" are at the top of the menu, without the circle/diamond player marks.
- Bottom, from the edge up: the v3 fan (tilted ends, curve, rise to the right), now compact and
  centred with bigger cards; one control row
  with the deck and throw pile on the left, Undo and Sort on the right and the move buttons
  ("Bloom ...", "Skip sprout") stacked in the middle; then the map. The move buttons sit exactly
  halfway between the map and the hand. Smart overlap is off, so nothing ever lies on the map.
- Checked by `web/e2e/pro-check.ts` at 390x844, 390x664 (Safari with its bars), 360x640 and
  430x932, at every one of my steps for about 6 turns: no overlaps, buttons halfway, header,
  menu, no console errors (screenshots in `docs/screens/pro/`).
- Check before locking in: real iPhone Safari and Chrome (bars shown and hidden); Large text
  (long button names in the middle slot); left-hand mode; three move buttons at once; a big Lab
  hand (10+ cards); whether players miss the turn and score in the header; desktop/wide screens
  (the slim header applies there too).

### Camera auto-frame with minimum tile size; weak-spot icons removed; replay hidden
- Date: 2026-10-05 · Commit: `524c375` · In test only
- The map never shows tiles smaller than the Classic board's tile on that screen (59.4px on a
  390x844 phone). Big maps zoom to the area where both players have tiles (+2 hexes), with
  arrows at the edge for tiles off screen and a "Whole map" pill. It moves smoothly (300ms;
  instant with Reduce motion), never during painting or animations; manual pan/pinch pause it
  until the next turn.
- Shield and target icons gone; my worst weak link always pulses with "-N"; the opponent's
  weak links show on their tile card. The replay button is hidden by a flag.
- Check before locking in: whole-map fit on Classic; huge maps with far-apart homes; edge
  arrows; pan and zoom while painting a Bloom; the camera never moving during animations; the
  tip never covering a home; Large text; left-hand mode; the fan's overlap using the visible
  window.

### Thumb layout v3 (piles above the hand in the curve notch, bottom-anchored dock, aligned margins, tip never covers a home)
- Date: 2026-10-05 · Commit: `7d88857` · In test only (phones held upright, the "Thumb layout"
  setting on; Hand side Left mirrors everything)
- Designed for a hand of 8 (7 + the card just drawn). From the bottom up: the fan sits 12pt
  above the bottom safe area, nearly full width (8pt margins), end cards tilted 7 degrees, a
  rise of 12% to the right; cards 52pt wide at 390px (48 before; 48 at 360px), each showing a
  44pt strip at 390px (42 before) and 40.5pt at 360px (the most a 360px row allows). Undo and
  Sort sit in the free corner under the fan's raised right end, on the same bottom margin. The
  deck and throw pile sit side by side in the notch above the fan's low left end, 8pt above the
  cards, on the shared left margin with the board and the replay icon; their counts are small
  badges on the cards, the labels underneath. The move buttons ("Bloom", "Skip sprout") sit
  beside the piles in the same notch.
- The map: the board zone is the screen minus the real header and dock (the bottom safe area is
  no longer counted twice, which left an empty band on iPhones); the board sits at the bottom of
  its zone, at most 24pt above the cards; any spare height goes above it.
- Tile width (centre to centre), v2 -> v3: 360x640 classic 49.9 -> 52.8, triangle 38.2 -> 40.5,
  rhombus 34.5 -> 36.6, tall rectangle 34.5 -> 34.8pt; 390x844 classic 59.4 -> 58.2, triangle
  46.8 -> 45.8, rhombus 54.3 -> 56.0, tall rectangle 38.6 -> 37.8pt (the 390px v2 numbers assumed
  a 4pt side margin while the page drew 8pt; on screen they were already the v3 values).
- Smart overlap stays (now the piles count too): only over empty or rock hexes, 55% see-through
  until touched, cancelled by any tile, home, gold, highlight or Bloom painting under a card or
  pile. In the checks it was on for the hexagon and the triangle at 360x640.
- The idle tip: never over a home, a tile, a gold hex's "2", a highlight or a target; it goes
  where it covers the most empty hexes; smaller words if nothing fits; very faint if still nothing.
- Code: `web/src/logic/layout.ts` (thumbDock v3), `web/src/main.ts`, `web/src/lab-mode/thumb.ts`
  (the tip's anchor), `web/src/lab-mode/lab-css.ts`. Check: `web/e2e/thumb-check.ts`;
  screenshots in `docs/screens/thumb3/`.
- Check before locking in:
  - tapping every card in an 8-card hand (44pt strips at 390px, 40.5pt at 360px);
  - drag onto the piles (the game has no drag-to-throw yet: tap a card, or a card then the pile);
  - the 360px width;
  - Large text (pile labels and badges, the move pills);
  - left-hand mode;
  - overlap on the triangle, rhombus and rectangle maps;
  - no tile ever hidden under a card or a pile (none in 8 checked layouts);
  - the tip never covering a home (none in 8 checked layouts);
  - on a real iPhone: the dock on the bottom margin (the empty band should be gone).
- Earlier versions, kept for reference:
  - v2 notes:
  ### Thumb layout v2 (gentler fan, map first, smart overlap)
  - Date: 2026-10-05 · Commit: `9fa0846` · In test only (replaces the v1 fan below; same settings)
  - Map first: the board takes the full width and at least 60% of the usable height; the card
    area is capped at 40% (it now takes 28-40%). The hand is a gentle fan (middle card flat, end
    cards tilted 7 degrees, a shallow curve, a slight rise to the right) anchored at the right edge
    above a bottom band: deck and throw pile (left, 52pt wide, label with the count under it), the
    move buttons ("Skip sprout" as a small pill, only when useful) and Undo/Sort (right, next to
    the fan). Cards are 25% smaller (48pt wide instead of 64). Hand side Left mirrors it all.
  - Smart overlap: when the board is held back by the height, it may reach under the fan by up to
    15% of its height, only where every hex under a card is empty or rock and nothing can be
    played there this turn (4 hexes from my network, 1 from the opponent's); no tile, home, gold
    hex, target highlight or Bloom painting is ever under a card (any of them cancels it at once).
    Over the map the cards are 55% see-through until I touch the fan. Worked out when the board
    changes, with a short crossfade.
  - Tile width (centre to centre): 360x640 classic 44.0 -> 49.9pt, triangle 31.5 -> 38.2pt, tall
    rectangle 26.0 -> 34.5pt; 390x844 unchanged for boards that already fill the width (classic
    59.4, triangle 46.8, tall rectangle 38.6pt), rhombus 44.9 -> 54.3pt.
  - Code: `web/src/logic/layout.ts` (thumbDock v2, fanSlots), `web/src/main.ts` (checkOverlap,
    the see-through fan), `web/src/lab-mode/lab-css.ts` (v2 block). Check: `web/e2e/thumb-check.ts`;
    screenshots in `docs/screens/thumb2/`.
  - Check before locking in:
    - tapping every card in a full hand (8 cards: 42pt slices at 390px, 40.5pt at 360px; a
      10-card Lab hand gets 32-36pt, the map comes first);
    - the 360px width;
    - Large text (the pile labels, the move pills);
    - left-hand mode;
    - overlap on the triangle and rectangle maps (in the checks, overlap only happened on the
      classic hexagon at 360x640; the triangle and rectangle stayed below the board because their
      bottom rows are near the homes or already fill the width);
    - that no tile is ever hidden under a card (the check found none in 12 layouts);
    - the board changing size during a game when the overlap turns on or off (crossfade): is it
      distracting?
  - v1 notes (the original thumb layout and the idle tip):
  ### Thumb layout and the idle tip (phones)
  - Date: 2026-10-05 · Commits: `7254eeb`, `5c8b4f2` (matched to the user's touch map), `ffb332e` (fan packed to the bottom: bigger map) · In test only
  - Phones held upright (touch, portrait, up to 600px wide). The hand is a curved fan rising from
    near the bottom centre to the right edge, the deck and throw pile sit side by side in the top left
    of the card area (just under the board; the user's touch map), the move buttons under them, Undo and Sort in the free bottom-right corner, the "?" button is gone (How to play is in
    the menu). No hint row: its height goes to the board, and the step's tip shows as large faint
    words over the board after 4 seconds without a touch on my turn. Settings: Thumb layout
    On/Off, Hand side Right/Left (Left mirrors everything), Idle tip On/Off.
  - Code: `web/src/logic/layout.ts` (the `thumb` variant of the one layout engine), the test-only
    `web/src/lab-mode/thumb.ts` and `lab-css.ts`, the lines in `web/src/main.ts` marked "thumb".
    Check: `web/e2e/thumb-check.ts`; screenshots in `docs/screens/thumb/`.
  - Check before locking in:
    - card tap accuracy on real phones (every visible slice picks its card; 5, 8 and 10 cards);
    - the 360px width: the board's tiles are about 44pt with 8 cards (52px cards), and a
      10-card hand (Lab only) gets 32pt slices instead of 40;
    - a picked card at the top of the fan lifts briefly into the gap above the cards (by design);
    - Large text (the move buttons and the tip corner beside the fan);
    - left-hand mode on a real phone;
    - the idle tip on a crowded map (readable? the faint plate only when the map is busy);
    - the coach and first-time tips, now just above the cards over the board's lower-left edge
      (44% wide, so my home stays visible): does the tutorial coach hide too much of the board?

### Desktop: a proper coach and tip panel
- Date: 2026-10-04 · Commit: `dcc76c0` · In test only
- On wide screens the coach and first-time tips use the empty space above the deck and throw
  pile, at full size; with the coach on, the cards sit low in their column so the panel has room.
- Code: `web/src/lab-mode/lab-css.ts` (the "desktop" block).
- Check before locking in: the panel never overlaps the piles, the hand or the header at
  1280x800, 1440x900, 1600x980 and 1920x1080; move it into `web/src/style.css`.

### No Confirm box: tap again to place
- Date: 2026-10-04 · Commit: `a46a5e8` · In test only
- A waiting move shows no box; tapping the same card or hex again places it; another card or hex
  changes the choice; Undo after. The hint says "Tap again to place it".
- Code: `web/src/main.ts`, lines marked "the test copy: no Confirm box".
- Check before locking in: where the risk warning ("Your opponent could cut 4 of yours") goes
  now (the board's -3 badges already show it); the e2e tests that click `#confirm-play`; the
  coach's "Confirm" step.

### No owner marks on tiles
- Date: 2026-10-04 · Commit: `fe00c08` · In test only
- The circle on my tiles and the diamond on the opponent's are gone (moss and lava show whose).
- Code: `web/src/ui/board.ts`, `mark()`.
- Check before locking in: colour-blind readability without the marks, the "Low detail" look and
  the legend; remove or keep `youMark` / `botMark` (an accessibility setting?).

### Watch a game
- Date: 2026-10-04 · Commit: `ceeadeb` · In test only (inside the Lab)
- Two opponents play each other live; speed switch; Take over.
- Check before locking in: does it belong in the real menu (e.g. to learn from Level 9)? The
  pop-ups that still say "You" for the green side.

### The Lab: boards of any shape, reshuffle, longer games
- Date: 2026-10-04 · Commits: `04297e9`, `9afb814`, `4ef2ccd` · In test only
- Only if a preset proves fun. Needs SPEC changes, new golden games, and the tests listed in
  `docs/LAB-KNOWN-BREAKAGE.md` fixed.
