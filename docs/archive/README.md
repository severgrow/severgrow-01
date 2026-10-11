# Archive

Records kept for history. Nothing here describes the current game: the rules are in
`../SPEC.md` and the way of working in `../../AGENTS.md`.

| File | What it was |
| --- | --- |
| `SPEC-HISTORY.md` | The old spec up to Futasaku 0.3: full changelog, the simulations that chose the defaults, retired rules |
| `FUTASAKU_0_4_BASELINE.md` | The audit made when the Futasaku 0.4 branch was cut from Test2/Main2.0 |
| `UX-v0.8.md`, `ART-v0.7.md` | How the old Severor page looked and behaved |
| `LAB.md`, `LAB-KNOWN-BREAKAGE.md` | The old test copy's Lab (other boards, decks, presets) |
| `RELEASES.md` | The old Main / Test / Test2 publishing setup |
| `WAITLIST-dev-and-main2.md` | The old test copy's waitlist and its Main2.0 decisions |

## Code that was removed

Everything removed in the Futasaku 0.4 cleanup (2026-10-11) is kept, unchanged, on the branch
**`archive/futa0.4-before-cleanup`** (commit `6972446`):

- the old live game build and the old test copy build (the `CHANNEL` switch, `FEATURES`);
- the Lab panel and its board generator (`web/src/lab-mode/`), the DESIGN view and its art
  (`web/public/design-v2/`), the bake-off fonts;
- the V3 skin (`web/src/ui/skin/`, `web/src/skins/`) and its 11 MB of art (`web/public/design-v3/`).
  The six pictures the current board still uses (empty ground, five rocks) moved to
  `web/src/assets/board/`;
- browser scripts for the old builds (smoke, painting, overhaul, propass, lab-smoke, typography
  audit, V3 and others).

The old game itself still runs from `main` at the site root.
