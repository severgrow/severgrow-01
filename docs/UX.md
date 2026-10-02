# Severgrow: how the page looks and feels

This file explains the design of the playable page in plain words. The rules of the
game are in `docs/SPEC.md` and are not changed by anything here: the page only
draws the game and listens to taps.

## Design rules

- **One hero: the network.** Your tiles are joined to your root by glowing veins.
  A vein is thicker and brighter the more tiles depend on it (thickest next to the
  root). A link that is the only way back for some tiles is thin and flickers, so you
  can see where you are fragile. Cut-off tiles leave a faint dashed scar for two turns.
- **A juice budget.** Small moves get small effects, big moments get big ones, and the
  screen never turns into noise (see "Satisfying feel" below).
- **Colour roles.** Mint is only you, coral is only the bot, amber is only gold hexes.
  Buttons, the coach and text are a neutral warm cream, so nothing competes with the
  pieces. Suit colours appear only on cards in your hand, never on the board.
- **Not colour alone.** The two players differ by a mark and a pattern (yours: a ring;
  the bot's: a diamond and a grain). Gold hexes have a fine weave and a "2" badge.
  Suits have their own icons. Board marks have their own shapes (see the legend).
- **No emoji as icons.** Every icon is a small SVG line drawing, made in code.
- **Nothing downloaded.** No images, no sound files, no trackers, no outside
  requests. Fonts are free (SIL Open Font License) and bundled in `web/src/fonts`.

## The look: three palettes

Settings → **Look → Colours** switches instantly and is remembered. Same screen, same
shapes; only the colours and the background change. All colours are design tokens in
`web/src/logic/themes.ts`; a test checks every palette defines every token.

| Palette | Background | Feel |
| --- | --- | --- |
| **Soil** (default) | very dark warm olive-brown `#1b1912` | a fine soil grain, a soft vignette, a few slow drifting spores; empty hexes are shallow soil pockets |
| **Moss night** | cool green-black `#0d1613` | a soft green glow pooled under the board |
| **Ink** | near-black paper `#0d0e11` | flat, no texture |

Shared by all three: you `#4df0b4` (mint), bot `#ff6b4a` (coral), gold `#f2b84b`
(amber), rock a cool blue-grey stone with speckle, facets and a darker lower edge.
Suit tints (cards only): Moss olive-lichen `#bfcf7c`, Ash lavender `#bd9be8`,
Dew sky blue `#a3d1eb`, Ember terracotta `#cd876f`, each with a thin tinted card edge.

**Checks** (made by `npx tsx web/e2e/palette-report.ts`; contrast is the WCAG ratio,
AA needs 4.5; colour distance is CIE delta E, 12 or more counts as clearly different):

| Palette | Text on page | Hints on page | Button text | Suit numbers on cards (lowest) | Closest pair, normal vision | Deuteranopia | Protanopia | Tritanopia |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Soil | 14.4 PASS | 7.7 PASS | 14.0 PASS | 5.1 PASS | 38 (bot / ember) PASS | 17 (ash / dew) PASS | 17 (bot / ember) PASS | 19 (moss / ash) PASS |
| Moss night | 14.9 PASS | 8.3 PASS | 14.4 PASS | 5.4 PASS | 38 (bot / ember) PASS | 17 (ash / dew) PASS | 17 (bot / ember) PASS | 19 (moss / ash) PASS |
| Ink | 15.9 PASS | 7.3 PASS | 15.5 PASS | 5.8 PASS | 38 (bot / ember) PASS | 17 (ash / dew) PASS | 17 (bot / ember) PASS | 19 (moss / ash) PASS |

The colour-blind columns simulate full deuteranopia, protanopia and tritanopia
(Machado 2009) for the two players and the four suits.

**Size:** textures, spores and glows are made in code (CSS gradients and a tiny SVG
noise); the whole polish pass adds about 5 kB to the page after compression.

- **Typeface:** Alegreya Sans (text 500, numbers 800), bundled.
- **Shapes:** soft, slightly uneven hexes; curved veins; rounded cards; pill buttons.

## Gold hexes and board marks

- **Gold hex:** warm amber with a fine diagonal weave, a soft shimmer, and a small
  amber "2" badge in its lower-right corner. The badge sits above tiles, so it stays
  visible when a tile is on the hex.
- **What the dashed yellow outline used to mean:** two things, both amber. The dashed
  ring marked a gold hex (it showed around tiles standing on gold), and a dotted ring
  was the coach's suggested hex. Now gold is the weave plus the "2" badge, and the
  coach's hint is a cream circle that breathes.
- **Legend** (one line in How to play): gold hex (×2), coach tip (circle), preview
  (dashed ghost hex), weak link ("−4" badge).

## Playing

- **Tap a card:** every hex it can grow on glows; the rest dims. **Tap a glowing
  hex:** ghost tiles show exactly where the tiles will grow, with a result chip like
  "+3 tiles, replaces 1, cuts 4". Then **Confirm**, or tap the same hex again. If the same card and hex allow
  more than one move, the next button shows the next one: **Change card** when only the card differs, **Other way** when the tiles would land elsewhere.
- **A card with only one place to grow** shows its preview straight away (no hex tap).
- **Tap a hex first:** the cards that can use it glow, and the best move there is
  previewed.
- **Sprout is the default.** In the Grow step the bar says "Pick a card to sprout":
  tapping a card shows only where it can sprout. A card with one spot previews at once,
  and one more tap on that spot plays it.
- **Combos have buttons** ("Grow a line of 3", "Grow a clump of 3"): tap one, then a
  card, to see where that combo can grow. Tapping a hex first still shows the best move
  there of any kind.
- **Cancel** always clears your choice. Esc does the same on a keyboard.
- **Steps 1 2 3: Draw, Grow, Throw.** The tip for the current step hides behind the
  **?** button next to them; tap it to read the tip, tap again to hide it.
- **Throw:** when it is time to throw, the hint says "Tap a card to throw it" and one
  tap throws that card (no Confirm). If nothing in your hand can grow, the game skips
  straight to the throw step for you.
- **My weakest link pulses** by default: the one tile the bot could cut next turn that
  would cost the most, with a small "−4" and a gentle growing ring (Settings → "Pulse my
  weakest link" turns it off).
- **Weak spots** (the icon at top-left of the board; its name shows when switched on): your tiles whose loss would cut off the
  most, with a number like "−4". Before you confirm a move that leaves a bigger
  weak spot, the confirm bar warns: "The bot could cut 5 of your tiles."
- **Bot's weak links** (the icon at top-right): the bot's tiles you could cut, with how many
  tiles it would lose; the bot's fragile veins flicker too.
- **Hold a tile** (or hover with a mouse): strength, owner, gold or not, and what
  losing it would cost.
- **Deck and throw pile** sit side by side, each with a label and a count; the top
  thrown card shows its number and suit. In the Draw step both glow softly and say
  "Tap to draw" / "Tap to take"; in the Grow and Throw steps they are dimmed and
  cannot be tapped. (There are no separate "Draw a card" buttons any more.)

## Playing against the bot

- **Bot level**: **Play** opens a 3×3 screen of levels 1-9. Each shows its number, a
  small nature icon that grows with the level (seedling, sprig, clover, moss, fern, ivy,
  oak, elder, ancient tree) and its name; your wins show as a small count in the
  corner once you have some. Level 7 (Oak) is the original
  bot and the default; the last level you picked is remembered. See `docs/LADDER.md`.
- **Undo**: take back the moves you made this turn (growing tiles, or pressing "Throw a
  card"), until you draw a new card or throw one.
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

## Animations and satisfying feel

Animations are driven by the engine's own event list, through one animation queue.
They only change what is *shown*; the real game state never waits for them. The last
step of every move sets the shown board to the real one, so skipping, interrupting or
turning animations off can never leave a wrong board (tests check this).

**The juice budget** (`web/src/logic/juice.ts`, tested): each move gets a size from its
engine events.

| Size | When | Effects |
| --- | --- | --- |
| Small | a Sprout, 1-2 tiles | a quick squash-and-stretch pop, a soft note, one small spark |
| Medium | 3-4 tiles, a gold hex, replacing a bot tile, a cut of 1-3 | a staggered ripple, one rising note per tile, a chime on gold, "+3" floats up |
| Big | 5+ tiles, a cut of 4+, a Strangle | a short build-up beat, a ~100 ms hit-stop, a stronger ripple, a soft shake, a low thud, a banner ("Big grow!", "Cut off 5!", "Strangled!"), a light buzz |

| Moment | What you see and hear |
| --- | --- |
| Growth | tiles pop in a ripple; each makes a short rising note, so a long line plays a little scale |
| Replacing a bot tile | it dissolves into sparks as yours takes its place |
| The cut | the vein flashes and snaps (a sharp snap), cut-off tiles go grey and wither outward from the cut, shedding a few motes, and "−4 tiles" floats up |
| Place, then cut | both play back to back, the second a little higher in pitch |
| Scores | a fast tick, then a tiny bounce on the final number |
| Your turn | "Your turn" slides in and a soft glow passes over your hand |
| Picking a card | it lifts with a small spring; legal hexes fade in, then breathe |
| New veins | draw themselves on from the old tile to the new one |
| Win / loss | a fuller flourish (flashes, sparks from your root, a short arpeggio and chord) / one calm soft tone, never mocking |
| Idle | after about 8 seconds without a tap, the next control pulses twice, very quietly |
| Draw / throw | the card flies from the pile into your hand / flips onto the throw pile |

**Keeping it light:** at most 60 particles on screen at once (a tested budget; each
frees its slot when it ends), elements are made only for the moment and removed after,
movement uses transforms and opacity only, and the board is redrawn only when it
changes. Measured in the browser test with the CPU slowed 4× (about a mid-range phone):
54-57 fps on average during a big cut, slowest single frame about 70-115 ms (the board
redraw), peak 36 particles.

**Settings that shape it:** Effects intensity (Low, Normal, High; Low has no shake or
hit-stop and fewer sparks), Animation speed, Reduce motion (shakes and particles become
quick fades), Sound, Vibration. No fake urgency, countdowns, streak guilt or random
rewards: the satisfaction comes from your own good moves.

**Replay bot** plays the bot's last turn again. **Skip** (while animating) jumps to the end.

## Sound

All sounds are made in code with the Web Audio API, short and softly layered at a
modest volume, each note with a tiny random pitch wobble so repeats don't sound
robotic: a soft click for taps, rising notes for growth, a bright chime on gold, a
sharp snap for a cut and a low thud for big moments, a soft falling tone for lost
tiles, a flourish for a win and one calm tone for a loss. "Music" is a very quiet hum.
Nothing plays before your first tap. Phones that support it vibrate lightly on big
moments (iPhone browsers never allow websites to vibrate). Settings has **Test sound**
and **Test vibration** buttons.

## Settings (saved in this browser only)

Colours (Soil, Moss night, Ink), Sound, Music, Vibration, Reduce motion, Animation
speed (Slow, Normal, Fast, Off), Effects (Low, Normal, High), Confirm moves (on:
preview then Confirm; off: a tap on a hex plays at once), Show weak spots, Pulse my
weakest link, Large text, Coach.

## Accessibility

- Text contrast is checked by a test in every palette (main text 7:1 or better, all
  other text 4.5:1), and so is colour-blind separation of the players and suits.
- Touch targets are at least 44 px. Large text makes everything about 18% bigger.
- Keyboard: Tab through buttons and cards, number keys 1-9 pick a card, arrows move
  over the board, Enter picks a hex, Esc cancels or closes.
- Buttons, cards and the board have screen-reader labels.
- The bot thinks in a background worker, so the page never freezes.
- Works in portrait and landscape; on wide screens the board sits on the left and
  the controls on the right. Phone notches are respected (safe-area padding).

## Code map

- `web/src/logic/` pure, tested logic: palettes and colour checks, settings, preview,
  weak spots, veins (link loads), piles, the juice budget, animation steps,
  highlights, taps and the game session.
- `web/src/ui/` drawing and effects: board (SVG), icons, sound, the bot worker client.
- `web/src/main.ts` ties it together; `web/src/style.css` holds the looks.
- `web/e2e/smoke.ts` plays the page in a real browser and saves the
  screenshots in `docs/screens/`.
