# Severgrow: how the page looks and feels

This file explains the design of the playable page in plain words. The rules of the
game are in `docs/SPEC.md` and are not changed by anything here: the page only
draws the game and listens to taps.

## Design rules (all themes)

- **One hero: the network.** Your tiles are joined to your root by visible veins.
  A link that is the only way back to the root is drawn thin and flickers, so you
  can see where you are fragile. Cut-off tiles leave a faint dashed outline (a scar)
  for two turns.
- **Restraint.** Big effects only for the big moments: a cut (flash, short shake,
  the cut-off tiles wither in a ripple, "−4 tiles" floats up) and the win. Everything
  else is small and quick.
- **Hierarchy.** Your hand and the board first, numbers second, labels last.
- **Tiles look alive.** Tiles grow bigger and brighter with strength. Roots are
  big bulbs with a slow pulse. Gold hexes shimmer softly. Rock is grey and heavy.
- **Colour-blind safe.** The two players always differ by a mark and a pattern,
  not only by colour: your tiles are plain with a round mark; the bot's tiles carry
  a pattern (hatching, grain or stripes) and an angular mark.
- **No emoji as icons.** Every icon is a small SVG line drawing, made in code.
- **Nothing downloaded.** No images, no sound files, no trackers, no outside
  requests. Fonts are free (SIL Open Font License) and bundled in `web/src/fonts`.

## The three themes

Every colour, the typeface, tile shape, texture, shadow and movement strength come
from design tokens in `web/src/logic/themes.ts`. A test checks that every theme
defines every token, uses at most 5 palette colours, and has readable contrast.

### Theme A: Ink and glow

*Near-black paper, flat bold shapes, and one glowing colour for your network.*

| Role | Hex |
| --- | --- |
| Paper (background) | `#0d0e11` |
| Ink (text) | `#edeae2` |
| Glow (you) | `#4df0b4` |
| Signal (bot) | `#ff6b4a` |
| Gold | `#f2c14e` |

Typeface: **Space Grotesk**. Flat hexagons, no texture, no shadows. Only your veins
and root glow. Marks: you = dot, bot = small square, bot tiles hatched.

### Theme B: Macro nature

*Dark soil up close: soft organic tiles joined by fine living veins.*

| Role | Hex |
| --- | --- |
| Soil (background) | `#1a120c` |
| Bone (text) | `#f0e2c4` |
| Lichen (you) | `#86d0bd` |
| Rust (bot) | `#e0703f` |
| Amber (gold) | `#e3b04b` |

Typeface: **Fraunces**. Slightly uneven, soft-cornered hexes; a soil texture made
in code (SVG noise); thin curved veins. Marks: you = ring, bot = diamond, bot tiles
grained.

### Theme C: Tabletop

*A board game on a dark wooden table: chunky pieces, printed cards, lamp light.*

| Role | Hex |
| --- | --- |
| Walnut (background) | `#24160c` |
| Parchment (text, cards) | `#f4e7cf` |
| Enamel blue (you) | `#6aa3e0` |
| Lacquer red (bot) | `#e0604a` |
| Brass (gold) | `#d8a23c` |

Typeface: **Bree Serif**. Chunky pieces with a darker side and a bevel, a wooden
table texture made in code, a soft lamp-light vignette, parchment cards. Marks:
you = pip, bot = cross, bot tiles striped.

Shades between these colours (for example the empty hexes) are mixes of two palette
colours, never new colours.

## Playing

- **Tap a card:** every hex it can grow on glows; the rest dims. **Tap a glowing
  hex:** ghost tiles show exactly where the tiles will grow, with a result chip like
  "+3 tiles, replaces 1, cuts 4". Then **Confirm**. If the same card and hex allow
  more than one move, **Other way** shows the next one.
- **Tap a hex first:** the cards that can use it glow, and the best move there is
  previewed.
- **Move buttons** above the hand say what kinds of moves you have ("Grow a line of
  3", "Grow a clump of 3", "Sprout one tile"); tapping one shows only those.
- **Cancel** always clears your choice. Esc does the same on a keyboard.
- **Weak spots** (top-left of the board): your tiles whose loss would cut off the
  most, with a number like "−4". Before you confirm a move that leaves a bigger
  weak spot, the confirm bar warns: "The bot could cut 5 of your tiles."
- **Bot's weak links** (top-right): the bot's tiles you could cut, with how many
  tiles it would lose.
- **Hold a tile** (or hover with a mouse): strength, owner, gold or not, and what
  losing it would cost.
- **Deck and discard** are small stacks with counts; tap one to draw.

## Animations

Animations are driven by the engine's own event list. They only change what is
*shown*; the real game state never waits for them. The last step of every move sets
the shown board to the real one, so skipping or turning animations off can never
leave a wrong board (tests check this).

| Moment | What you see |
| --- | --- |
| Line (Hypha) | tiles unroll one by one from the start, veins follow |
| Clump (Bloom) | tiles pop outward from the middle |
| Sprout | a quick spring pop |
| Replacing a tile | the old tile bursts into sparks as yours grows in |
| Cut (Sever) | flash at the cut, short shake, veins snap, cut-off tiles fade grey and wither in a ripple outward, "−4 tiles" floats up, caption "You cut off 4 bot tiles!" |
| Strangle | tiles around the root squeeze inward twice, a slow beat, then a flash |
| Scores | count up or down smoothly |
| Turns | "Your turn" / "Bot's turn" slides across |
| Draw / discard | the card flies from the pile into your hand / flips onto the pile |
| Bot turn | a short "thinking" beat, then each of its moves one at a time |

**Replay bot** (bottom-left of the board) plays the bot's last turn again. **Skip**
(bottom-right, while animating) jumps to the end. With **Reduce motion** on, movement
becomes quick fades; each theme also sets its own movement strength.

## Sound and feel

All sounds are made in code with the Web Audio API: a soft click for taps, a rising
hum for growth, a bright chime on gold, a snap and a low thud for a cut, a soft sad
tone for lost tiles, and a short fanfare for a win. "Music" is a very quiet hum. Each
theme tunes the pitch and tone slightly. Nothing plays before your first tap. Phones
that support it vibrate lightly on cuts and wins.

## Settings (saved in this browser only)

Theme, Sound, Music, Vibration, Reduce motion, Animation speed (Slow, Normal, Fast,
Off), Confirm moves (on: preview then Confirm; off: a tap on a hex plays at once),
Show weak spots, Large text, Coach.

## Accessibility

- Text contrast is checked by a test (main text 7:1 or better, all other text 4.5:1).
- Touch targets are at least 44 px. Large text makes everything about 18% bigger.
- Keyboard: Tab through buttons and cards, number keys 1-9 pick a card, arrows move
  over the board, Enter picks a hex, Esc cancels or closes.
- Buttons, cards and the board have screen-reader labels.
- The bot thinks in a background worker, so the page never freezes.
- Works in portrait and landscape; on wide screens the board sits on the left and
  the controls on the right. Phone notches are respected (safe-area padding).

## Code map

- `web/src/logic/` pure, tested logic: themes, settings, preview, weak spots, veins,
  animation steps, highlights, taps and the game session.
- `web/src/ui/` drawing and effects: board (SVG), icons, sound, the bot worker client.
- `web/src/main.ts` ties it together; `web/src/style.css` holds the looks.
- `web/e2e/smoke.ts` plays the page in a real browser in every theme and saves the
  screenshots in `docs/screens/<theme>/`.
