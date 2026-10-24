# Interface refinement — before / after

Owner brief, 2026-10-22. Captured from the real app (dev server) at the four supported sizes,
with Reduce motion on for the stills. `before/` is the 0.6 base (`c6995f8`) at 390×844; `after/`
is the same moments after this pass.

| File | Moment |
| --- | --- |
| `*-menu` | main menu (no campaign read-out — owner review, 2026-10-23) |
| `*-play-menu` | the PLAY submenu, with the chapter progress caption under `LEVEL <n>` |
| `*-game` | a live campaign board |
| `*-pause` | the offline pause faceplate over the dimmed board |
| `*-match-menu` | the online match menu (duel rows, clock note) |
| `*-victory` | the campaign result plate (`LEVEL 12` over `COMPLETE`), board still visible |
| `*-defeat` | the defeat plate (`LEVEL 12` above the outcome) |
| `pause-mid-open` / `pause-mid-close` | mid-transition frames (390×844, normal motion) |

The before set predates the pass; the after set was taken with the final CSS and markup. The
motion itself is measured, not inferred from stills: see the open/close samples in the hand-off
notes and `web/tests/interface-motion.test.ts`.

**Format (2026-10-23):** one format for both sets — PNG, 2× device scale. The after set was
re-generated from a `CHANNEL=futa04` build of the shipped tree, with Reduce motion on and the
pre-game starter ritual allowed to hand the board over before the game and pause frames (otherwise
the still would catch the ritual overlay). `before/` is the same 0.6 baseline, re-encoded
losslessly from its JPEG captures into the one PNG format; nothing was cropped or rescaled. No
`foo.png` + `foo.jpg` pairs remain.
