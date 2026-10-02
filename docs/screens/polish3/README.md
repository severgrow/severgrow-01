# UI polish pass 3: screenshots and self-review

`before-*` were taken from the version before this pass (`web/e2e/polish3-before.ts`), `after-*`
from this one (`web/e2e/polish3-shots.ts`). Phone 390x844 with touch; desktop 1280x800 with a mouse.

| After | Shows |
| --- | --- |
| `after-*-top-rank-and-action-row` | top-rank tiles with only the slight glow; the move row with no Fruit button; "Opponent" in the score bar |
| `after-*-tile-card-fruit` | the tile card on an opponent 9: "No card can replace this. Fruit can." and "Fruit this tile" |
| `after-*-tile-card-need-3` | the tile card when Fruit is not possible yet: "Fruit could remove this. You need 3 connected tiles next to it." |
| `after-*-fruit-suggested` | the 3 suggested tiles (soft "−" markers), "Give up these 3 tiles", Change, Next |
| `after-*-fruit-change` | Change: the tiles that still lead to a legal set glow |
| `after-*-fruit-preview-warning` | the plain-words preview with "Careful: this cuts off 1 of your tiles" |
| `after-*-line-drawing-mode` | a line chosen: the start hexes glow, the hint, Cancel |
| `after-*-line-mid-drag` | a line mid-drag: all 3 tiles with their numbers rising from the start, the result above the board |
| `after-*-line-blocked` | a blocked direction: the "can't" tile and "Rock is in the way" |
| `after-*-line-done-chip` | the finished line with its result chip and Confirm (no "Other way") |
| `after-*-clump-mid-drag-2of3` | a clump mid-drag at "2/3" |
| `after-desktop-live-preview` | desktop: after the first click, the line follows the mouse with its result |
| `after-*-opponent-turn` | the turn pill and the score bar saying "Opponent" |
| `after-lab`, `after-lab-glow-row` | the lab: old glow strength, the new subtle glow, no glow, in every palette; the mixed-strength board |

## Self-review (three honest sentences)

1. **Too loud or too quiet:** the first version of the new glow was too quiet: on a full phone board
   I could not find either 9 even when looking for it, so it failed "noticeable on a second look";
   and a top-rank tile is **not** recognisable at a glance on a full board by its material alone
   (moss 7, 8 and 9 look alike; the lava 9 is a little brighter): the number carries it.
2. **Strong:** drawing reads well: the whole line appears at once with its numbers rising from
   the start, a blocked direction says why in plain words above the board, and a part-drawn clump
   simply waits ("2/3: keep going") instead of failing.
3. **The fix I made:** the glow picture is fuller near the tile's edge (its opacity still capped at
   a quarter of the old glow), so it now shows as a faint light edge on a second look; and the
   header capsule said "Opponent thinking…" on two cramped lines on a phone, so it now says
   "Opponent's turn" with the thinking dots, on one line. Both re-screenshotted.
