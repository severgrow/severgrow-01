# Screenshots

Made by the browser test (`npm run e2e -- --shots=docs/screens`) from real game
positions, at 390×844 (phone) and 1280×800 (desktop), in each theme:

| File | What it shows |
| --- | --- |
| `*-menu.jpg` | the main menu |
| `*-midgame.jpg` | a mid-game board, about 10-12 tiles a side |
| `*-preview.jpg` | a card and a hex picked: ghost tiles, result chip, Confirm |
| `*-cut.jpg` | in the middle of the cut animation |
| `*-after-cut.jpg` | after the cut: the cut-off arm is left as dashed scars |
| `*-danger.jpg` | "Weak spots" and "Bot's weak links" switched on |
| `*-gameover.jpg` | the game-over screen with three highlights |

## Self-review

I looked at every screenshot and wrote three honest sentences per theme: what looks
cheap or generic, what looks strong, and what I changed. After the changes I took
the screenshots again.

**Ink and glow.** Cheap: before the fix, the bot's mark in the scoreboard was a bar
that read like a minus sign, and with 8 cards the fanned hand ran off the screen
edges. Strong: the single mint network on near-black is the clearest of the three;
you can read your veins back to the root at a glance, and the cut flash stands out.
Changed: the bot's mark is now a small square, the hand fan is tighter and stays on
screen, and the white focus box that appeared after tapping the board now shows only
for keyboard users.

**Macro nature.** Cheap: the veins were too thin and hid under the tiles, and the
glowing "you can play here" outlines were gold, the same colour as gold hexes, which
was confusing. Strong: the soil texture and the soft, uneven tiles feel warm and
organic without getting busy. Changed: veins now sit on top of the tiles in a lighter
tint and are thicker, and the play-here outlines use your own colour in every theme.

**Tabletop.** Cheap: the red ✕ next to "Bot" looked like an error icon, and the wood
grain at first looked like streaky motion blur. Strong: the chunky pieces with a
darker side, the parchment cards and the brass buttons feel like a real board game;
this is the most "physical" theme. Changed: the bot's mark is now a triangle (on the
tiles and in the scoreboard), and the grain is subtler under a lamp-light vignette.
