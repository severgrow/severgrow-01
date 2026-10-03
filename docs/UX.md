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
| **Soil** (default) | neutral coal grey `#18191a` | a fine soil grain, a soft vignette, a few slow drifting spores; empty hexes are shallow soil pockets |
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
| Soil | 14.8 PASS | 7.4 PASS | 14.0 PASS | 5.1 PASS | 38 (bot / ember) PASS | 17 (ash / dew) PASS | 17 (bot / ember) PASS | 19 (moss / ash) PASS |
| Moss night | 14.9 PASS | 8.3 PASS | 14.4 PASS | 5.4 PASS | 38 (bot / ember) PASS | 17 (ash / dew) PASS | 17 (bot / ember) PASS | 19 (moss / ash) PASS |
| Ink | 15.9 PASS | 7.3 PASS | 15.5 PASS | 5.8 PASS | 38 (bot / ember) PASS | 17 (ash / dew) PASS | 17 (bot / ember) PASS | 19 (moss / ash) PASS |

The colour-blind columns simulate full deuteranopia, protanopia and tritanopia
(Machado 2009) for the two players and the four suits.

**Size:** textures, spores and glows are made in code (CSS gradients and a tiny SVG
noise); the whole polish pass adds about 5 kB to the page after compression.

- **Typeface:** Alegreya Sans (text 500, numbers 800), bundled.
- **Shapes:** soft, slightly uneven hexes; curved veins; rounded cards; pill buttons.

## Materials ("lowkey 3D")

One light for the whole game, from the top-left. Every raised thing gets a thin bright
rim on its top-left edge, a soft darker edge on the bottom-right, a soft contact shadow
and a slight inner shade; depth is 1-3 px. Matte everywhere; the only glow is the lava.

| Material | What it is | Detail |
| --- | --- | --- |
| **Grass** (my tiles) | photo-like: a flat, dense lawn seen from above, thousands of fine blades pointing every which way, darker at the base and sunlit yellow-green at the tips, with lighter and darker patches; every grass tile fills its whole hex and spills over the edge, so neighbouring tiles overlap into one lawn. **By strength:** 1-3 short plain lawn, 4-6 fuller with a few small yellow, red or white flowers and clover, 7-9 bushy with more flowers, clover and small leafy plants | the number has a soft light halo; my ring marker has one too; nothing grows on the number; my root is the lushest grass with a soft glowing core that breathes slowly |
| **Lava** (the bot's tiles) | photo-like: lumpy dark rock lit from the top-left. **By strength:** 1-3 dried, cooled lava (grey crust, faint dim embers in the cracks), 4-6 glowing molten cracks and pools toward the edge, 7-9 burning: lots of molten lava, small flames licking up and soft smoke rising (coral-red to orange-red, never amber) | light numbers with a dark halo on the rock; nothing molten or burning under the number or the marker (tested pixel by pixel), with a ragged natural edge round that clear area; the diamond marker stays; the root burns hardest |
| **Rock** | dark, slightly warm grey-brown stone with smaller stones lying on it ("rocky rocks"), grain, hairline cracks, small chips and flat facets | the heaviest thing: a thicker raised edge and a heavier shadow |
| **Empty** | a shallow soil pocket with a soft inner shadow | |
| **Gold** | warm amber with a fine weave, a faint metallic sheen and the "2" badge | |

- **Strength reads as height:** a stronger tile sits a little higher (more rim light and
  shadow) and brighter; the number stays crisp.
- **No stamped look:** each tile's blades, flowers and cracks vary a little, always from
  a hash of its position (the same tile always looks the same; no randomness).
- **Cut off:** my grass dries out (grey-brown, flat); the bot's lava cools (the glow goes,
  dark grey ash is left). The same shows in the marks left behind.
- **Readability first:** lava cracks never cross the number or the marker and grass blades
  stay short there (tested on every tile position and strength); textures stay low-contrast.
- **Links grow organically:** mine are vines (a gently wavy green stem with a dark edge, a
  thin tendril twisting along it and two small leaves); the bot's are a stream of lava with
  crusted dark banks, bright streaks racing along the molten middle, dark crust pieces
  drifting slower on top and a softly pulsing heat glow (all still under Reduce motion).
- **Palettes:** full in Soil, a little lighter in Moss night, minimal in Ink (flat shapes
  with a thin rim and shadow). Settings → **Material detail: Low, Normal** (Low is flat with
  only the rim and shadow). Reduce motion stops the lava glow, the flowing links and the breathing.
- **Cards** get no materials: only a slightly thicker edge, a soft shadow in the fan, and a
  deeper one when picked. **Buttons** are slightly raised and press down softly.
- **Photo-like, painted in code:** the grass and lava pictures are painted pixel by pixel
  once (seeded noise and thousands of blades, `web/src/logic/photo.ts`; no downloaded
  images), in small slices in the background after the page opens. Until they are ready,
  and in Low detail and Ink, the board uses the simpler drawn look.
- **Built once:** gradients and one small noise texture (a 64×64 canvas, made once) are
  shared by the whole board; each tile is a handful of plain shapes, with no per-tile filters.
- **Registry:** `web/src/ui/materials.ts` registers each material (moss = grass, fire = lava, rock, empty,
  gold); a new one (for example "wild" for a world map) is one more registration.
- **Material lab:** open the page with `?lab=1` (add `&detail=low` for Low) to see every
  material in every palette.

## Strength in the material (material pass 2)

A tile's strength shows in the material itself, not only in its number.
- **Vigour** `t = (strength - 1) / (maxRank - 1)`: 0 for a 1, 1 for the top rank (the same
  for 7- and 9-rank decks). Every look setting follows `t` smoothly (`web/src/logic/vigour.ts`).
- **Moss:** a 1 is patchy, mostly bare soil with short pale blades; as `t` rises the blades get
  taller and denser, the soil closes up, small red, yellow and white flowers appear, and
  from about `t = 0.6` roots show between the clumps; the green deepens.
- **Lava:** a 1 is dark cooled crust with about 3% molten showing; a top-rank tile is about 95%
  molten. Plates shrink, cracks widen, the glow grows. Red-orange only, never yellow or
  amber (amber means gold hexes). A test checks every colour.
- **Top rank (polish pass 3):** only a slight glow: a faint halo hugging the hex, a pale mint for
  moss and a soft pink-orange for lava (never amber or yellow), about a quarter of the old glow's
  strength, a small blur (7% of the hex width). No outline of any kind: the old contour, double
  rim and shimmer are gone. Tiles just under the top (t from 0.9) get a whisper of it; nothing
  below. Still by default; at Effects High only, an almost invisible slow breathing (4% over 6
  seconds; none with Reduce motion). Effects Low, or Settings → **Top-rank glow: Off**, turns it
  off (default Subtle). It is a pre-rendered picture (one per material and tile shape), drawn
  above the tiles and outside the hex only, so it never covers a number. A tile that reaches the
  top rank (a Strengthen) fades its glow in over half a second. The strength itself reads from
  the number and the material (bushiest moss, fully molten lava).
- **Seamless neighbours:** the texture is painted in board (world) coordinates, so grass,
  soil, cracks and plates run on from tile to tile. Between two tiles of the same owner,
  `t` blends over about a third of a tile across the shared border, so a 1 beside a 9 has
  no seam. Moss and lava never blend into each other. Hex edges stay drawn.
- **Numbers:** a soft round plate behind the digit (light under moss, dark under lava) keeps
  every number at WCAG AA contrast over the worst texture pixel, in every palette.
- **Legend** (How to play): "A bushier tile or hotter lava means a stronger tile."
- **How it is drawn:** one offscreen canvas holds the whole board's material
  (`web/src/logic/worldpaint.ts`, pure and deterministic: the same board always gives the
  same pixels). Every moss and lava tile is filled with it through an SVG pattern. After a
  move only the changed tiles are repainted, plus the area they can reach in their
  neighbours, in thin slices of rows so a frame is never held up; the new picture
  cross-fades in on the changed tiles. A test proves no pixel outside that area changes.
- **Low:** Settings → Material detail → Low paints fewer blades and no flowers or roots. A
  device that needs more than 2.5 s of work for a full paint switches to Low by itself.
  Without a canvas, tiles keep their plain fill.
- **Lab:** `?lab=1` shows the 1-9 ramp for moss and lava, and a board of mixed strengths
  where moss meets lava, in every palette (`&detail=low` for Low).

## The turn pill

At the start of each turn a pill (at the top edge of the board area, never over tiles) says
**Your turn** (circle) or **Opponent's turn** (diamond):
250 ms in (fade and a 6 px slide), 700 ms hold with one thin highlight sweeping across it,
250 ms out. The header capsule cross-fades to the new side, a faint wash of that side's
colour shows along the board's edge, and two soft tones play (a gentle rise for you, a
lower settle for the bot; only with Sound on). During the bot's turn quiet dots show
until its first move appears, and only while it is really still choosing.
- Follows Animation speed; **Skip** hides it at once; **Reduce motion** gives a plain quick
  fade (no slide, sweep or wash); **Effects: Low** gives a plain pill (no sweep or wash).
- A new turn always replaces the old pill; nothing stacks.
- No countdowns, no flashing, no urgency: it only says whose turn it is.
- Logic: `web/src/logic/turnbanner.ts` (a pure state machine, tested without timers);
  drawing: `web/src/ui/turnpill.ts`.

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
  "+3 tiles, replaces 1, cuts 4". **No Confirm for a clear choice:** when the spot allows
  just one move it plays at once (Undo takes it back until you draw or throw).
- **A card with only one place to grow** shows its preview straight away (no hex tap).
- **Tap a hex first:** the cards that can use it glow, and the best move there is
  previewed.
- **Sprout first, then throw.** In the Grow step the bar says "Pick a card to sprout": tapping
  a card shows only where it can sprout, and tapping a spot plays it (a card with only one
  spot plays with that single tap). There is no "Throw a card" button until you have
  sprouted; a small **Skip sprout** link stays, because sprouting is optional in the rules.
  After the sprout the game goes on to "Tap a card to throw it" by itself (or shows "Throw a
  card" when a line or clump is still possible).
- **Combos have buttons** ("Grow a line of 3", "Grow a clump of 3"): tap one (a card too, if you
  want particular cards), then **draw it on the board** (see "Drawing a line or clump" below).
  There is no "Other way" button any more.
- **Cancel** always clears your choice. Esc does the same on a keyboard (while drawing, Esc first
  clears the shape, then the choice).
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
  weak spot, the confirm bar warns: "Your opponent could cut 5 of your tiles."
- **Opponent's weak links** (the icon at top-right): your opponent's tiles you could cut, with
  how many tiles they would lose; their fragile veins flicker too.
- **The tile card**: hover a tile with a mouse to see it; tap a tile (or hold it on a touch
  screen) and it stays open: strength, owner, gold or not, and what losing it would cost. On an
  opponent tile it offers Fruit (below). Tap the tile again, tap elsewhere or press Esc to close.
- **Deck and throw pile** sit side by side, each with a label and a count; the top
  thrown card shows its number and suit. In the Draw step both glow softly and say
  "Tap to draw" / "Tap to take"; in the Grow and Throw steps they are dimmed and
  cannot be tapped. (There are no separate "Draw a card" buttons any more.)

## Strengthen and Fruit (v0.5)

**Three kinds of Sprout target.** When a card is picked, every hex it can go on glows, and each
says what it does by its shape and a symbol, not by colour alone:

| Target | Looks like | Means |
| --- | --- | --- |
| Grow on an empty hex | a plain ring | a new tile with the card's number |
| Replace an enemy tile | a dashed ring with a small ⇆ badge | the opponent's weaker tile becomes mine |
| Strengthen my tile | a thick ring with a small + badge | my own weaker tile takes the card's number |

The hint line names the kinds on offer ("Tap a glowing hex: grow on an empty hex, replace an
opponent tile (⇆), strengthen your tile (+)"). Growing and replacing still play at once (Undo takes them
back). A **Strengthen** always shows its preview first: "Strengthen 5 → 9", a note ("No points,
but harder for your opponent to replace. It does not stop a cut or Fruit."), Confirm and Cancel.

**Fruit is used by tapping an opponent tile** (polish pass 3; there is no Fruit button in the move
row any more: the row only shows what you can do right now). In your Grow step, while your Fruit
is unused, the tile card of any opponent tile except their root shows:
- **"Fruit this tile"** when you have a legal set of tiles to give up for it (Fruit ignores
  strength); on a top-rank tile it adds "No card can replace this. Fruit can."
- an information line when it is not possible yet: "Fruit could remove this. You need 3 connected
  tiles next to it." (no button);
- nothing at all once your Fruit is used, or when Fruit is off.

A tap on an opponent tile that the picked card can take previews the Sprout as before; one it
cannot take (an opponent 9, say) opens the tile card instead, keeping the card picked. While a
Sprout onto an opponent tile is previewed, a small **i** button (or holding the tile) opens its
tile card, so Fruit is always reachable.

**The flow, target first** (a progress line "1 Give up 3 tiles · 2 Confirm"; Undo and Cancel at
every step):
1. *The game suggests the 3 tiles to give up*: among every legal set (3 connected tiles of yours,
   not your root, at least one next to the target) the one that cuts off the fewest of your own
   tiles, then the lowest total strength, then a fixed order. They carry a soft "−" marker;
   "Give up these 3 tiles", with **Change** and **Next**. **Change** lets you pick another set:
   the tiles that still lead to a legal set glow, wrong taps get a one-line reason ("Your root
   can't be given up", "Pick 3 of your own tiles", "Pick tiles that touch each other").
2. *Preview and confirm.* A plain-words chip: "You give up 3. They lose 1, plus 4 cut off. Net: -3
   for you, -5 for them." Warnings when it would cut off your own tiles ("Careful: this cuts off 2
   of your tiles") or leave your root easy to surround. The tiles that would be cut are marked.

A one-time tip, the first time an opponent top-rank tile appears while you still have Fruit: "Tip:
tap it. Fruit can remove tiles no card can beat." (re-open it from How to play).

A Fruit can be undone like any other growing move this turn (it reveals no hidden card).

**Animations** (through the animation queue and the effects tiers, from engine events; the board
is always right even when skipped):
- *Strengthen:* a quick level-up pulse, a thin ring expanding outward, the number ticking up, a
  small solid thud; to the top rank, a bigger gold ring and a few sparks (Medium tier).
- *Fruit:* the three tiles burst into spore puffs, the spores stream to the target, the target
  shatters, then any cut uses the normal cut effect. A Big moment: hit-stop, thud, a "Fruited!"
  banner, light vibration.
- Reduce motion, Sound, Vibration and Effects intensity apply as everywhere else.

**First-time tips.** The first time Fruit can be used, and the first time a Strengthen target
shows, a small card explains it (dismiss with "Got it"; remembered in this browser). Both can be
opened again from "How to play", which also explains each with an example. The 3-line summary at
the top is unchanged.

**The coach** mentions Fruit or Strengthen only when one of them is among its best few moves
right now, and its "Show me" arrow walks through the Fruit flow (button, the 3 tiles, the
target, Confirm).

Screenshots (390 px wide): `docs/screens/fruit-strengthen/`.

## Drawing a line or clump (polish pass 3)

After choosing "Grow a line of N" or "Grow a clump of N" you draw it on the board; "Other way" is
gone. Touch, mouse and pen share one code path (pointer events).
- **The board shows where to start**: for a line, the hexes next to your network that have at least
  one legal direction; for a clump, every legal hex. The rest dims. A hint says "Drag across the
  board to draw your line" / "Drag over hexes to draw your clump" ("Click where your line starts,
  then click to finish" with a mouse). Cancel is always there.
- **One place only?** It shows straight away as a ready preview with Confirm.
- **A line**: touch a start and drag. As soon as the drag clearly points along one of the 6
  directions (a small dead zone, a little hysteresis so it does not flicker), the ghost shows all
  N tiles with their numbers rising from the start. Moving the finger turns it. A blocked part
  (rock, your own tile, a stronger tile, the edge) shows in a "can't" style with the reason above
  the board; lifting there only gives a small shake. Touching just the start shows arrows for the
  legal directions. Starting at the far end and dragging back works too; if both ends touch your
  network, the end where your finger started is the start.
- **A clump**: touch any legal hex and drag; each new legal hex that touches the shape (any hex of
  it, so a Y or a triangle is possible) is added; others are skipped without breaking the drag;
  moving back onto the previous hex removes the last one; a counter shows "2/3". Tapping hexes
  works too (tap the last one to remove it). Lifting early keeps the shape ("2/3: keep going,
  from any hex of the shape") with a Clear button; a full shape that does not touch your tiles
  says "Your clump needs to touch your tiles".
- **Fast fingers**: every hex the finger's path crosses between two pointer events is added, in
  order; the hit area is a little smaller than each hex so corners never slip into a neighbour.
  The counter and the result chip sit in a small card above the board, never under the finger.
  Each added hex gives a light haptic tick and a soft rising note (Vibration and Sound toggles).
  Lifting the finger outside the board, or a second finger, cancels; pinch and scroll are blocked
  only while drawing.
- **On release** (or the second click): with **Confirm moves** on, the result chip appears with
  Confirm and Cancel; with it off, the move is placed at once. Settings → Confirm moves: **Auto**
  (on for touch screens, off with a mouse), On, Off.
- **With a mouse**: click a start; the shape follows the mouse (a line snaps to the nearest
  direction; a clump grows from the start towards the pointer along the shortest legal path, then
  the nearest legal hexes, always the same for the same pointer), with the result chip live;
  click again to finish. Esc or right-click cancels. Dragging with the mouse works like a finger.
- **Keyboard**: Tab to the board, arrows move a cursor hex, Enter starts or adds, Backspace removes
  the last hex, Esc cancels, Enter on a ready shape confirms. A screen reader hears "2 of 3 hexes
  chosen" and the result chip.
- **Placement list** (Settings, off by default): an opt-in step-through list of every legal
  placement for the chosen combo, for anyone who prefers not to draw.
- **First time**: a small tip with a looping ghost finger on a mini hex strip ("Drag over hexes to
  draw your clump or line. On a computer, click to start and click to finish."), re-openable from
  How to play; no animation with Reduce motion.
- **The coach's "Show me"**: points at the line or clump button, then shows its placement on the
  board, ready to confirm.

## Words

The player always reads **Opponent** ("Opponent's turn", "Your opponent could cut 3 of your
tiles"), never "bot". The word lives in one place, `OPPONENT_LABEL` in `src/strings.ts`, with
ready-made phrases (`OPP`); a unit test scans the HTML and every built message, and the browser
test scans the live page in every state. Code names (`src/bots/`, `botVersion`, CSS classes) stay.

## Playing against the opponent

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
speed (Slow, Normal, Fast, Off), Effects (Low, Normal, High), Show weak spots, Pulse my
weakest link, Large text, Coach. (The old "Confirm moves" setting is gone: clear choices
play at once and Undo takes them back.)

**Controls:** every button is a pill and every icon-only button is a circle, in three
heights (big 56 px, normal 44 px, compact 36 px; step labels and their "?" 32 px). Cards,
panels and level tiles are rounded rectangles. Hints like "Pick a card to sprout ↓" are
plain bold text, never shaped like buttons.

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

## UX pass (after the Seed A/B test)

Fifteen small changes to the look and feel; no rule changes.

1. **Turn pill on one line**: "Turn 6/30 · Level 8" (it used to wrap "Level / 8").
2. **Scars fade**: what a cut-off tile leaves is drawn fainter each turn (100%, 60%, 30%), and the
   tile card of that hex says whose tile was cut off and when.
3. **Gold badge on a tile**: smaller and nudged into the corner, clear of the owner mark.
4. **Seed number**: on a small dark plate, readable on every palette.
5. **What the opponent just did**: a small spark at the top of each hex it grew on or strengthened
   on its last turn, shown at the start of my turn until I change the board.
6. **Bigger cards on tall phones** (760px+ high): easier to tap, less empty space.
7. **Lab page**: shows a seed of each side and the three scar ages.
8. **No flash of the plain tile look**: the tiles fade in with their landscape texture.
9. **Corner buttons named**: "Your weak spots", "Opponent's weak links" and "Replay" show their
   names for 5 seconds at the start of the first 3 games.
10. **Deck running low**: its count turns amber at 5 cards or fewer (the game ends when it runs out).
11. **Record per version** on the menu: "Sprout version: won 3 of 5 · Seed version: won 1 of 2".
12. **"Try the other version"** on the result screen starts the same level in the other version.
13. **The version label is a button**: tapping it explains the version in one line.
14. **What you did with the move** on the result screen: "You planted 6 seeds and strengthened 4 tiles."
15. **Continue says where you left off**: version, level and turn.

Checked by `web/e2e/seed-ab.ts` (25 checks) and unit tests (stats per version, move summary).

## UI overhaul, Part 1 (twenty improvements)

No rule, engine or opponent changes. Each item names the file where its logic lives; every
piece of logic has a test in `web/tests/`.

### The design system (item 11)

One set of rules for every screen:

- **Spacing:** an 8pt grid: 4, 8, 16, 24, 32, 48 px (`--sp-1` … `--sp-6`).
- **Type scale:** 0.72, 0.85, 1, 1.25, 1.75 rem (`--fs-xs` … `--fs-xl`). Numbers are
  **tabular** (every digit the same width), so scores and counts never wobble as they change.
- **Buttons, three levels:**
  - **Primary** (`.btn.primary`): filled cream pill. At most one per moment, for the main next step.
  - **Secondary** (`.btn.ghost`): outlined pill on the surface colour.
  - **Tertiary** (`.btn.link`): text only, for "Why?", "Back to menu".
  - Heights: 56 (big), 44 (normal), 36 (compact); toolbar pills are 32 tall with a 44px hit area.
- **Press:** every button (and toolbar pill, segment, chip, icon button) shrinks to **0.97 over
  80ms** when pressed, plays a soft tick (Sound) and, with Effects High, a 6ms tap (Vibration).
  Reduce motion keeps the tick but not the shrink. Nothing plays before the first tap.
- **One light:** everything is lit from the top left (the plate's highlight, rims, shadows).

### The screen

1. **Bigger board, no dead space** (`logic/layout.ts`): the board takes everything the fixed dock
   leaves; on phones it sits just above the toolbar. The board's rim is exactly what the plate
   needs (`boardPad`), shared by the layout and the drawing.
2. **Stable layout:** the dock (toolbar, hint line, forecast bar, piles and actions, hand) has one
   fixed height for the whole game, so nothing that appears during a turn moves the board or the
   hand. The coach and first-time tips sit over the hint and forecast rows, never over the board,
   the toolbar, the piles or the hand.
3. **Hand** (`logic/hand.ts`): big numerals, at least 40px of every card visible in a full hand, a
   gentle fan, "By suit / By number" sort (remembered), a spring lift, a coloured underline
   joining cards that make a combo, unplayable cards dimmed, a slight tilt under the mouse.
4. **Toolbar under the board:** "My weak spots", "Their weak links" (on/off), "Replay" (only when
   there is a turn to replay), "Undo", "Skip" (only while something animates).
5. **Header:** one clock only. The turn count was removed (your choice); the deck count is the
   game's clock. The "Only 1 card left" pill is gone (the deck shows it). The version chip
   (SPROUT / SEED: which rules this game uses) sits with the three steps.
6. **Deck and throw pile** (`logic/piles.ts`): 48px+ targets; the stack is as thick as the pile is
   big; the count sits beside the label, clear of the art; they glow in the Draw step; the last
   card turns gold and the label says "Last card"; drawing arcs the card into the hand;
   throwing flips it onto the pile.
7. **Calm drawing highlights** (`logic/draw.ts`): a soft fill and a 1px edge; before a touch only
   the start hexes, while drawing only the next ones; the nearer your finger, the brighter.
8. **Smart confirmation** (`logic/forecast.ts`): Settings → "Confirm moves: **Smart** (default) /
   Always / Never". Smart plays safe moves at once (Undo takes them back) and asks only when a
   move leaves 3+ of your tiles cuttable (and worse than before), cuts off your own tiles, uses
   Fruit, uses your last card, or boxes in your root. The thresholds are config values
   (`CONFIRM_RULES`). The forecast bar shows the result and an icon and a short line for each
   risk; it keeps the same height in every state.
9. **Undo:** in the toolbar, lit with a dot while a move can be taken back (until you throw).
   The move runs backwards with a falling sound and a light double tap. The state after Undo is
   exactly the state before the move.
10. **Previews in real materials:** translucent moss (lava glowing through when replacing),
    the real number, breathing gently; the veins it would grow draw on; a dashed red "−N" on your
    tile that becomes cuttable, a gold "−N" on the opponent tiles it would cut. Computed on copies.
11. **The design system** (above).
12. **The board as a place:** a ground plate lit from the top left, a lighter edge, a soft shadow,
    a fine soil grain in empty hexes (Material detail Normal only).
13. **Hint line** (`logic/hint.ts`): one short line (it always fits a 360px phone) with a tiny
    arrow toward where to tap; it says why a move isn't available. The single-tile move keeps
    its version's word (Sprout / Seed): no renaming.
14. **Score race** (`logic/race.ts`): a slim tug-of-war bar under the header; scores count up and
    bounce; tap a score for what it is made of.
15. **Final turns** (`logic/endgame.ts`): when 3 of your turns are left (turn limit) or the deck
    has 6 cards or fewer, a slightly deeper vignette fades in, the ambient sound turns warmer, and
    one short banner says "Last 3 turns" (or "The deck is running low"). No flashing, no red.
16. **Ambient life** (`logic/ambient.ts`): moss sways, lava bubbles and embers, gold glints (each
    gold hex at its own moment, from a hash), nutrient pulses running out from your root along
    connected veins. At most 24 small shapes; none with Effects Low or Reduce motion.
17. **Placement feel** (`logic/feedback.ts`): squash and stretch; higher numbers drop from a
    little higher and settle heavier (the top rank lands with a stronger tap); grass blades spring
    up; a puff of spores; veins draw on; the rising pitch ladder.
18. **Sound and vibration** (`logic/feedback.ts`): one table of vibration patterns, all
    different, none longer than 0.4s; cuts get bigger patterns as they get bigger, being cut is
    calmer. The ambient bed ducks 6 dB during a cut. Sounds wobble slightly in pitch.
19. **The opponent's turn** (`logic/opponent.ts`): thinking dots; a caption near each action; the
    rest of the board dims a little; the view leans 1.5% toward the action; Replay plays at 0.75×;
    when it cuts you, the cut is calmer (no shake, no thud).
20. **Game over:** a calm glow, the score counts up, three highlights, "Replay the biggest cut",
    "Share" (a picture made on the phone: the share sheet, or saved; nothing is uploaded),
    Rematch and Menu.

## UI overhaul, Part 2: the cinematic cut

One pure generator (`web/src/logic/cut.ts`, tested in `web/tests/cut.test.ts`) turns a cut into
a timeline; the page only plays it. The same cut always looks the same, and a replay plays the
same sequence slower.

- **Tiers** (config values, `CUT_TIERS`): Small 1–2 tiles, Medium 3–4, Big 5–7, Huge 8+ or at
  least half of the victim's tiles.
- **Stages:** anticipation (the board draws in a little; first cut of a move only) → impact
  hit-stop (~100ms, nothing moves) with a small local flash (≤60ms, ≤35% white, a few hexes
  around the cut) and a micro zoom (1–3%) → a pulse along the cut vein → the snap (a click and a
  2–6px shake, bigger for bigger tiers, its own vibration) → the slow-motion ripple (the tiles die
  one ring at a time, 70ms apart, all started within 700ms; moss dries and curls away, lava flares
  once, cools and sinks into crumbs) → the crumble, leaving a ground scar → the payoff (the "−N"
  number, the score tally, a banner for Big and Huge, the ambient sound ducked 6 dB).
- **Length:** at most 1.8s at Normal speed, also for chains and several cuts in one move (they
  follow each other and are squeezed to fit).
- **The opponent cutting me:** calmer: no flash, no zoom, no anticipation, at most a 2px shake,
  a soft vibration, no exclamation.
- **Fruit** uses the same generator for the tiles you give up (calm, no banner).
- **Replay the biggest cut** (result screen) plays it at 0.5×, from the saved board before it.
- **Reduce motion:** one plain fade. **Effects Low:** no shake, flash or zoom.
- Photosensitivity: the old cut "flash" (a full-strength ring for half a second) is gone; the
  remaining soft rings are at most 35% and at most 3 a second.
- Frames: `npx tsx web/e2e/cut-filmstrip.ts` saves frames at 0, 100, 220, 400, 700, 1000, 1400
  and 1800ms with a contact sheet per tier and variant (`docs/screens/overhaul/cut/`).

## UI overhaul, Part 3: eye candy

All of it sits behind **Settings → Animations → Eye candy** (on by default), and every moving
piece stops with Reduce motion. Decisions are pure and tested (`web/src/logic/candy.ts`).

- **A. Root life:** your root breathes slowly. When it is hemmed in (4 sides closed, one by the
  opponent) it beats like a heart; at 5 closed sides (one more and it is strangled) it beats
  faster and a small "Root in danger" sign appears at the top of the board. The beat is a gentle
  swell (never a flash, never faster than once every 0.9s).
- **B. Splash:** once per visit, about 1.6s: a vein grows from a root to a tile and the game's
  name appears. Any tap ends it; it never blocks a tap. With Reduce motion it is a still picture.
- **C. Last card:** when the deck goes down to one card it pops once with a soft chime; when it
  runs out it settles and fades.
- **D. Spores home:** after you grow tiles, a few spores drift from them back to your root.
- **E. One light:** a faint warm light from the top left over the whole game, the same light the
  board's plate and rims use.
- **F. Terrarium menu:** the menu shows a small glass dome with a living board inside (moss that
  sways, lava that glows, floating spores).
- **G. Small details:** at the start of a game the hand is dealt from the deck, card by card.

## UI overhaul, Part 4 (light): smoothness

- **Smoother mode** (`web/src/logic/perf.ts`, tested): while moves animate, the page watches the
  frame rate. Under 50 frames a second for 3 seconds in a row, Effects drop to Low (once per
  device) and a note says so, with **Keep** and **Undo**. A single very long frame (switching
  tabs) is ignored.
- **The cut is cheaper:** the veins' blur glow rests while a cut plays (it also drew a black box in
  Chrome). Measured in the CI smoke test during a big cut on a 4× slowed CPU: about 22 fps before
  Part 2, about 42 fps after.
- The full before/after screenshots and the adversarial set are deferred until after the Fruit
  cards change (agreed with the owner, so they show the final game).
