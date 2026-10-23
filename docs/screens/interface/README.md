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

**Format (2026-10-23):** one format for both sets — JPEG, quality 88, 2× device scale. The earlier
two passes had left a mix of `.png` and `.jpg` in `after/`; everything here is `.jpg` now, so a
reviewer can flip between `before/` and `after/` without a converter. `*-victory` and `*-defeat`
were re-captured for the result plate's balance pass (the plate is ~40px shorter and its lockup
sits lower); the other moments were unchanged by it.
