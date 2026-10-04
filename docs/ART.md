# Severor: art direction and consistency audit (v0.7)

One page that says how the game looks, sounds and moves, so every new piece matches. `docs/UX.md`
covers behaviour; this file covers the look and the rules that keep it consistent.

## The rules

1. **One focal point per state.** Each moment has one thing that is clearly the brightest or
   moving: the glowing deck in the Draw step, the legal hexes while painting, the result chip
   while a move waits for Confirm, the home under threat in danger.
2. **At most three emphasis levels** on screen at once: *primary* (one per moment: the main
   button, the glowing target), *secondary* (normal controls and text), *quiet* (labels, counts,
   dimmed hexes).
3. **Restraint.** Big effects only for earned moments: a Bloom of 4, a big cut, a Strangle, the
   end of the game. Ordinary moves get a short pop and a note. Danger is shown calmly (a ring, a
   tremble), never by flashing.
4. **The squint test.** At 25% size and in greyscale the board still reads: my side vs the
   opponent's, the two homes, strong vs weak tiles, where I can play.
5. **Input is never locked by motion.** Any tap during an animation jumps it to its end.

## Type

One typeface, **Alegreya Sans** (SIL Open Font License, bundled in `web/src/fonts`): 500 for
text, 800 for numbers and titles. The audit found one stray serif (the "i" info button used
Georgia); it now uses the game font. The dock uses at most three text sizes: 15px (hint line,
move buttons, Undo), 12px (pile counts, chips), and the card numerals.

## Icons

Line icons drawn in code (`web/src/ui/icons.ts`): a 24x24 grid, 2px stroke, round caps and
joins, `currentColor`, no fills except a 25% tint on suit symbols. No emoji. v0.7 adds `sort`,
`deck`, `sprout` and `throw` in the same style. The four corner tools are icon-only (40pt
visible, 44pt hit area), with a ring when switched on and a tooltip on long-press or hover.

## Colour

Three palettes (Soil, Moss night, Ink), each defined once as tokens (`web/src/logic/themes.ts`,
materials in `web/src/logic/materials.ts`). Mine is mint (grass, the tree), the opponent's is
red-orange (lava, the volcano); gold is a calm ochre with a dot pattern and a "2" badge, so it
never relies on colour alone. Shapes back up colour everywhere: circle = mine, diamond = theirs.

## Spacing

An 8pt grid: gaps of 8 or 16, never more than 16 between zones. Three fixed zones on a phone:
header (48 + 36 + 8), board, dock (message row, piles and moves, hand). The board picks the
orientation (pointy or flat hexes) that gives the biggest tiles, by measurement.

## Motion

Four durations and two easings, the same in code (`web/src/logic/motion.ts`) and CSS (a test
keeps them equal):

| Token | Value | For |
| --- | --- | --- |
| `tap` | 80 ms | a press: buttons and cards answer at once |
| `quick` | 160 ms | small state changes: a ring, a highlight, a chip |
| `move` | 280 ms | a tile, a card or a panel moving |
| `moment` | 600 ms | an earned moment: a Bloom ripple, a big cut |
| `ease-out` | cubic-bezier(0.2, 0.8, 0.3, 1) | most motion |
| `ease-spring` | cubic-bezier(0.2, 0.8, 0.3, 1.1) | tiles landing |

Reduce motion: no idle life, no shake, no pulse; state changes still show (instantly or by a
short fade). Effects Low: idle life off, particles off.

## The homes

My home is a small gnarled **tree** (round, soft shapes; a mint circle in its hollow); the
opponent's is a faceted basalt **volcano** (angular; a red-orange diamond crater; a thin light
rim so it reads on its own dark lava). They are drawn as tall as each other, upright in both
orientations, rising at most a quarter of a tile above it and never over a neighbour's number.
States: idle (sway, a falling leaf / curling smoke, an ember), danger (tremble / rumble, the
"N/6" ring in the other side's colour), tapped (heartbeat / thump), strangled (smothered by moss
with its crater gone to ash / withered grey), won (petals / a flare). Material detail Low draws
them flat.

**Squint results** (lab, `?lab=1`, every palette): in greyscale the tree and the volcano are
told apart by shape alone (round canopy vs triangle); at 40pt both read; at 25% the tree is a
green blob with a trunk and the volcano a dark triangle with a bright tip: they still read as
different things. First draft failure, fixed: the volcano was too small and too dark to read at
40pt (now as tall as the tree, with a light rim).

## Sound

All sounds are made in code (no files). Two buses into the master, each with a slider
(Settings → Sound and feel), and a limiter on the master so stacked effects never clip.

| Sound | When | Bus |
| --- | --- | --- |
| click | a tap on a control | effects |
| grow (rising notes) | each tile of a Sprout or a Bloom, a little scale for a Bloom | effects |
| chime | a tile lands on gold | effects |
| snap | a cut; the Strangle squeeze | effects |
| sparks | an opponent tile replaced | effects |
| thud / sad | a big loss | effects |
| undo (falling notes) | Undo | effects |
| turn | my turn starts | effects |
| rustle | tapping my tree | effects |
| rumble (with crackle) | tapping the volcano | effects |
| sigh | the volcano is smothered (Strangle) | effects |
| grind | my tree withers (Strangle) | effects |
| fanfare | the end of the game | effects |
| the bed (quiet hum) | Music on; ducks 6 dB under a cut, warmer in the final turns | music |

Limiter: threshold −6 dB, ratio 20:1, attack 3 ms, release 250 ms.

## Consistency audit (v0.7)

| Area | Finding | Fixed |
| --- | --- | --- |
| Type | the info button used Georgia italic | game font |
| Board | a frame and corner pins around the board competed with the tiles | removed |
| Board | gold was a bright amber that pulled the eye in every state | calmer ochre with a dot pattern |
| Dock | a toolbar row of labelled pills duplicated the corner tools | removed; icon-only corner tools |
| Dock | the hint line had a bobbing arrow (a second focal point) | removed |
| Dock | the Undo button showed greyed out when unusable | shown only when usable |
| Header | the turn count showed twice (pill and a separate clock) | one pill: "Level N · X turns left" |
| Piles | the top thrown card was a different component from hand cards | the same card, scaled |
| Overlays | the coach could cover the Undo chip | it now stops short of it |
| CSS | leftover toolbar and hint-arrow rules | deleted |
