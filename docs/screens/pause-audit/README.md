# The pause panel — audit and rebuild (2026-10-20)

Owner brief: *"something between current one, b and c. settings at the very end tho / right low corner.
make it smart nice and cool but lowkey analog vintage machine looking."*

## What was wrong (measured on the old panel, CHANNEL=futa05, over a real match)

| | 390x844 | 360x640 | 320x568 |
| --- | --- | --- | --- |
| panel height | 554.8 | 550.4 | 488.5 |
| panel overflow | 0 | **5px** | **67px** |
| last button (Main menu) bottom | 826 | 626.5 | 616.4 (past the 568 screen) |

Every control was a 44px pill in one `8px` stack, with `12px` before the first row: seven equal-looking
buttons, so nothing led. Settings sat fourth in the list, between How to play and Main menu, at the same
weight as the other rows — and on a 320 phone the whole column ran 67px past the bottom of the sheet.

Colour: the panel used `--c-surface` (#232425) with `--c-line` (#46474a) borders at **1.67:1** against the
panel — the border was dimmer than the labels it framed — while every row carried the same cream `--c-text`
(13.06:1). The "quiet" rows were not quiet: five identical cream pills on one surface, plus a mint score
(10.69:1) and a coral score (5.52:1) in the header. Three type scales (Besley 20px title, 15.2px uppercase
rows, 16px `--c-muted` link) with no shared tracking.

## What it is now

A single machine face, top to bottom:

- **nameplate** — amber lamp (`--light-core`), the title (Paused / LEVEL n) on the panel's centre line,
  Close on the right;
- **read-out** — both scores mirrored across a 1px centre rule in the players' own colours, the turn under
  them; a read-out, never a control;
- **lead key** — `Back to the game`, the only filled control; in a lesson it shares one row with
  `Exit tutorial` (the exit stays first, and the extra key can never force a scroll);
- **action column** — full-width rows, one hairline between neighbours, no second border, `Main menu`
  recedes to `--c-muted`;
- **corner plate** — the mode word (`Practice` / `Campaign` / `Duel`, a `<p>`, never a button) on the left,
  the `Settings` key alone on the right, **last in the DOM** and therefore last in tab order.

One accent: the amber lamp (`--light-core`) and a `--light-bloom` hairline on the lead key's top edge. No
glow, no gradient, no second warm tone. Motion is `translate` + `opacity` on `var(--dur-quick)` with
`var(--ease-standard)`; reduced motion is a designed static state.

## Measured after (`web/e2e/pause-panel.ts`)

| case | panel | overflow | row height | edges | title centre | Settings |
| --- | --- | --- | --- | --- | --- | --- |
| 390x844 soil | 541.4 at y=302.6 | 0 | 46 | 16..374 | 195 = axis | 266..374, 44px, last |
| 360x640 soil | 508.5 at y=131.5 | 0 | 46 | 14..346 | 180 = axis | 238..346, 44px, last |
| 320x568 soil | 508.5 at y=59.5 | 0 | 46 | 14..306 | 160 = axis | 198..306, 44px, last |
| 844x390 soil | 354.8 at y=17.6 | 0 | 44 | 211..633 | 422 = axis | 525..633, 44px, last |
| 320x568 Large text | 518.1 at y=49.9 | 0 | 46 | 14..306 | 160 = axis | 198..306, 44px, last |
| 390x844 moss | 541.4 at y=302.6 | 0 | 46 | 16..374 | 195 = axis | 266..374, 44px, last |
| 320x568 duel face | 454.5 at y=113.5 | 0 | 44 | 14..306 | 160 = axis | 198..306, 44px, last |
| 844x390 duel face | 354.8 at y=17.6 | 0 | 44 | 211..633 | 422 = axis | 525..633, 44px, last |

The lesson face (two lead keys) measures 0 overflow at the same four sizes: 508 / 540 / 517 / 353 px.

A live duel adds Resign, Leave live and Report on top of the four usual rows. From the sixth row
on the column pairs into a keypad (two halves in portrait, three in landscape), so every entry stays
visible at 44px instead of scrolling — the same axis, mirrored.

Settings' right edge equals the column's right edge to the pixel (374 at 390; 306 at 320; 633 in
landscape), and the mode word's left edge equals the column's left edge.

## Proof

- `web/tests/pause-panel.test.ts` — structure, one axis, one row height, one accent, tempo tokens,
  reduce-motion, Settings last and unfollowable by the two modules that add pause rows.
- `web/e2e/pause-panel.ts` — the numbers above, from the real build over a real match, six cases.
- `docs/screens/pause-audit/panel-*.png` — one shot per case; `*-tutorial.png` is the lesson face.
