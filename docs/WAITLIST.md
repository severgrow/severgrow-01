# Waiting for the locked beta

Everything changed in the test copy (`dev`, published at `/test/`) is listed here until it goes
into the locked beta (`main`). Nothing here is in the real game yet. When the user says
"lock it in", show this list and ask which items to include; then each chosen item goes through
the strict flow (tests first, full `npm run check`, the checks listed under it, the user's
go-ahead). Tick an item and add the date when it reaches `main`.

## Waiting

### V3: skinned renderer and art pipeline (V3 art pending, greybox)
- Date: 2026-10-05 · In test only (menu -> **V3**, or `?design=v3`)
- A generic skinned board (`web/src/ui/skin/`) with Forest/Volcano V3 as data
  (`web/src/skins/forestVolcanoV3.ts`): continuous world-space ground (base + overlay through
  the strength coverage masks, clarity masks under number and gold badge, cut-off tints), one
  continuous code path per linked pair skinned by the network style (strip textures when they
  exist), props by folder with LOD and clear zones, home sprite layers with animation classes.
- Art tiers `lo`/`hi` in `web/public/design-v3/`: one tier loaded at a time, picked from tile
  CSS px x DPR x zoom (phones start lo; up at 280, down below 200). `npm run skin:manifest`
  lists what each tier has; missing art falls back (greybox palette colours, the board's own
  homes, no props). The development pack (briefs, masters, QA) is in `art/design-v3/`.
- `BoardView`: drawing steps became overridable methods (same code, same order); the live
  game, the Lab and Design draw exactly as before (web tests 483/483).
- 2026-10-05: the final Phase 2 V3 art is in (8 textures, 12+12 props, 4 rock clusters, home
  layers, strips, scars, wilt/ash props for cut-off tiles and scars, FX motes not used yet);
  review material and masters in `art/design-v3/phase2/`.
- Check before locking in: volcano heat at high strength (readable, could be stronger); the FX motes (unused); strip skinning on a straight
  path (the strip carries the organic look); hi tier memory on tablets; the ground repaint time
  on big boards on a real phone.

### Typography v2: Besley (display) + Commissioner (UI), tabular numbers
- Date: 2026-10-05 · Commit: `fc6a4ec` · In test only (replaces the Fraunces + Plus Jakarta Sans pick)
- Besley for the SEVEROR wordmark, page and sheet titles, "Pick a level" and the result title;
  Commissioner for everything else; numbers in "Severor Numerals" (Commissioner Bold with equal
  digit widths) so scores and counts never shift. 45 KB of fonts. Audited at 360x640, 390x844,
  430x932, 768x1024, 1280x800, 1600x980 and 1920x1080 on the menu, levels, Draw, Grow, Throw,
  Settings, How to play, Pause, Lab and game over (`web/e2e/typography-audit.ts`, screenshots in
  `docs/screens/typography/`).
- Check before locking in: real phones (Safari and Chrome) for weight and hinting at small
  sizes; tile numbers on every material and palette and in the DESIGN skin; Large text; the
  result title on long level names; left-hand mode; the font load on a slow connection.

### Step plate redesign, pile chips removed, font changed (Fraunces + Plus Jakarta Sans)
- Date: 2026-10-05 · Commit: `61c9478` · In test only (updates "Step guidance ... and new font" below)
- The step's cue is now a small crafted plate at the top of the map (icon, "Step 1 of 3", the
  words, three step pips; the opponent's turn in ember colours), with a soft entrance and one pass
  of light. The "Tap to draw / Tap to take" chips are gone (the piles' highlight is enough).
- New type: Fraunces, soft (headline words) + Plus Jakarta Sans (text and all numbers), 37 KB;
  Lab "Font: New / Previous"; bake-off in the material lab (?lab=1).
- Check before locking in: the plate on every step on a real phone (Safari's blur); where it moves
  on busy and zoomed maps; Reduce motion; Large text; tile numbers in every palette with the new
  font; left-hand mode; Subtle and Off; font load time on a slow connection.

### Step guidance (cue at step start, per-step focus) and new font
- Date: 2026-10-05 · Commit: `e461510` · In test only
- The step's word appears on the map as soon as a step starts ("Draw a card", "Play or skip",
  "Throw one card", "Opponent"), bright then settling, with a short premium entrance; the step's
  controls become the hero (Draw: both piles glow, lift, ring and "Tap to draw" chips for the
  first 3 turns, hand at 75%; Throw: cards faintly lit, throw pile as the target, deck dimmed;
  Opponent: calm, piles and hand at 70%). Setting "Step guidance: Full / Subtle / Off" replaces
  "Idle tip".
- New type: Bricolage Grotesque (words and numbers) + Figtree (text), 35 KB, tabular numbers;
  Lab sheet "Font: New / Previous"; bake-off in the material lab (?lab=1).
- Check before locking in: every step on a phone; Reduce motion; Large text and the longest
  labels; tile numbers on every material and palette; left-hand mode; Subtle and Off settings;
  the font file size and load time on a slow connection (and the brief Alegreya flash before
  the swap).

### Reload once when a cached page names removed files
- Date: 2026-10-05 · In test only
- After a redeploy, a page cached by GitHub Pages (up to 10 minutes) can name script and style
  files that are gone, so the game shows as bare unstyled text. `web/index.html` now reloads
  once from a fresh address when its own built script or stylesheet (./assets/) fails to load.
  Fixed 2026-10-05: the first version also reacted to font preloads and reset itself on every
  load, so a failing font made the page reload endlessly (fonts flickering on iPhone). Now only
  the page's own assets count, and never twice within 30 seconds.
- Check before locking in: the live game has the same risk (and an offline worker); keep this
  or rely on the worker.

### Zoomed map runs on behind the cards (smart fade)
- Date: 2026-10-05 · Commit: `d281f9f` · In test only (phones, the thumb layout)
- When the camera is zoomed in and there is more map below, it is no longer cut off at the deck:
  it shows through behind the piles and the cards under a soft fade. Choosing, drawing or
  throwing a card: the cards are clear and the map behind faint. Working on the map (a card
  picked, painting a Bloom, the opponent's turn, a finger on the map): the map behind shows more
  and the cards and piles go see-through until touched. The camera keeps framing the important
  part above the cards.
- Check before locking in: Huge hex and Rhombus zoomed in mid-map; painting a Bloom near the
  bottom edge of the window; the fade on the light theme/palettes; tile cards (tooltips) near the
  bottom; Reduce motion; that taps on the cards never reach the map behind.

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
- **V3 gold piles on x2 hexes** (2026-10-05, dev, in test only): gold hexes use the empty ground plus one of five painted gold-nugget piles (props/gold, lo/hi). Check before locking in: pile hidden under owned tiles, "2" badge still readable, lo/hi budgets.
- **V3 sharper owned ground, bigger dimmer gold, dead-wood scar hook** (2026-10-05, dev, in test only): forest and volcano textures rebuilt with far less blur (forest 12%, volcano 20% instead of stacked 50%+30% / 45%); gold piles 64 units and ~14% dimmer; lost tiles show the empty ground + one of five painted dead-wood sprites (props/dead). Check before locking in: texture budgets, scar readability.
- **V3 hex-fitted rocks** (2026-10-05, dev, in test only): blocked hexes use five painted grey rock clusters (props/rock/rock_hex_*), fitted and trimmed to the hex and turned with the board (pointy or flat); old mossy boulders removed. Check before locking in: fit in both orientations and all board rotations.
- **V3 painted grass tiles by strength** (2026-10-05, dev, in test only): the player's tiles show one of 25 painted hex grass pictures for their strength (tiles/forest/s<N>_*; mapping in art/design-v3/painted/grass_tiles/strengths.txt), turned with the board; forest props off on painted tiles; cut-off tiles desaturated. Check before locking in: brightness against the dark board, all rotations, budgets (lo 2.9 / hi 7.0 MB).
- **V3 painted home trees, alive** (2026-10-05, dev, in test only): the player's home is one of five painted hex trees (homes/forest_home_0N, picked per home), turned with the board; it breathes (soft brightness), a light swells over the crown every ~7 s, three fireflies blink and drift up at staggered times; all off with Reduce motion. Old layered tree art removed. Check before locking in: animation cost on low-end phones, Reduce motion.
- **V3 lava tiles, blended territories, living lava** (2026-10-05, dev, in test only): enemy tiles show 10 painted lava hexes by strength (art/design-v3/painted/lava_tiles/strengths.txt); painted tiles crossfade into same-owner neighbours (soft per-side masks, average-colour base under them) so a territory reads as one field; lava breathes (screen-blended glow), embers spark and rise on stronger tiles, an occasional smoke puff on strong ones; all off with Reduce motion. Check before locking in: mask cost with many tiles on low-end phones.
