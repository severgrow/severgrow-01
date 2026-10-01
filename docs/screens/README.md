# Screenshots

Made by the browser test (`npm run e2e -- --shots=docs/screens`) from real game
positions, at 390×844 (phone) and 1280×800 (desktop), in the one look the game now
has (Ink and glow colours with organic shapes):

| File | What it shows |
| --- | --- |
| `*-menu.jpg` | the main menu |
| `*-midgame.jpg` | a mid-game board, with the Draw / Grow / Discard step bar |
| `*-preview.jpg` | a card and a hex picked: ghost tiles, result chip, Confirm |
| `*-cut.jpg` | in the middle of the cut animation, with the "−3 tiles" badge |
| `*-after-cut.jpg` | after the cut: the cut-off arm is left as dashed scars |
| `*-danger.jpg` | "Weak spots" and "Bot's weak links" switched on |
| `*-gameover.jpg` | the game-over screen with three highlights |

## Self-review (this round)

Cheap before: on phones a layout bug gave the hint line all the spare space, which
pushed the board down. On desktop the hint ran under the "Bot's weak links" button,
and "End turn" surprised players by then asking for a discard. Strong now: Ink's
single glowing network with Nature's soft tiles and curved veins is the clearest
look so far, and the 1-2-3 step bar makes the turn obvious. Fixed: the layout rows,
the step bar plus a "Discard a card" button, a solid badge behind the cut number,
and a centred desktop layout with bigger cards.
