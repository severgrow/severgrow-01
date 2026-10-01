# Severgrow: how the page looks and feels

This file explains the design of the playable page in plain words. The rules of the
game are in `docs/SPEC.md` and are not changed by anything here: the page only
draws the game and listens to taps.

## Design rules

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

## The look: Ink and glow

*Near-black paper, soft organic tiles, and one glowing colour for your network.*

Three themes were built and played (Ink and glow, Macro nature, Tabletop). The
player chose Ink and glow's colours with Macro nature's shapes, so the page now has
this one look and no theme switch. Everything still comes from design tokens in
`web/src/logic/themes.ts`; a test checks every token, the 5-colour limit and contrast.

| Role | Hex |
| --- | --- |
| Paper (background) | `#0d0e11` |
| Ink (text) | `#edeae2` |
| Glow (you) | `#4df0b4` |
| Signal (bot) | `#ff6b4a` |
| Gold | `#f2c14e` |

- **Typeface:** Alegreya Sans (a humanist sans with calligraphic roots: organic and
  warm, yet clear at small sizes; text 500, numbers 800). Free (SIL Open Font License), bundled in `web/src/fonts`.
- **Shapes (from Macro nature):** soft, slightly uneven hexes; thin curved veins;
  rounded cards and pill-shaped main buttons.
- **Glow:** only your network's veins and root glow.
- **Marks:** you = ring, bot = diamond, and the bot's tiles are grained.
- Shades between these colours (empty hexes, rock) are mixes of two palette colours.
- **Finishing touches:** fine film grain over a soft pool of light (both made in code),
  a framed hexagonal plate with corner pins under the board, printed inner frames on
  the cards, a hairline under the scores, a slim gold edge on the coach, a grab handle
  on the sheets, and a small footer on the menu.

## Playing

- **Tap a card:** every hex it can grow on glows; the rest dims. **Tap a glowing
  hex:** ghost tiles show exactly where the tiles will grow, with a result chip like
  "+3 tiles, replaces 1, cuts 4". Then **Confirm**. If the same card and hex allow
  more than one move, the next button shows the next one: **Change card** when only the card differs, **Other way** when the tiles would land elsewhere.
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

## Playing against the bot

- **Bot level** (menu and Settings): Easy, Normal or Hard. Normal is the original bot;
  Easy sometimes settles for a lesser move; Hard plans its whole turn and won 55% of
  games against Normal in testing.
- **Undo**: take back the moves you made this turn (growing tiles, or pressing "Discard a
  card"), until you draw a new card or discard one.
- **Points before you play**: the preview says what a move scores, e.g.
  "+3 tiles, cuts 2 · +5 points".
- **The end is never a surprise**: "3 turns left", "Last turn!" or "Only 4 cards left"
  shows under the turn steps near the end.
- **Your record**: wins, losses, best score and winning streak, on the menu and the
  game-over screen (this browser only). Game over also shows how each score was made
  (tiles, and how many on gold).
- **First visit**: the menu suggests the tutorial game.
- **Install it**: "Add to Home Screen" makes it an app that also works offline. The page
  always checks for a newer version first.

## The coach

The coach suggests its one best move at a time for your first 15 actions, with one
short tip. **Show me where** puts a bouncing arrow on the one thing to tap next:
first the card, then the hex, then Confirm (or the deck, or "End turn"). **Why?**
explains the move. It never plays for you.

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
becomes quick fades.

## Sound and feel

All sounds are made in code with the Web Audio API: a soft click for taps, a rising
hum for growth, a bright chime on gold, a snap and a low thud for a cut, a soft sad
tone for lost tiles, and a short fanfare for a win. "Music" is a very quiet hum.
Nothing plays before your first tap. Phones that support it vibrate lightly on cuts and wins (iPhone browsers never allow
websites to vibrate). Settings has **Test sound** and **Test vibration** buttons.

## Settings (saved in this browser only)

Sound, Music, Vibration, Reduce motion, Animation speed (Slow, Normal, Fast,
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
- `web/e2e/smoke.ts` plays the page in a real browser and saves the
  screenshots in `docs/screens/`.
