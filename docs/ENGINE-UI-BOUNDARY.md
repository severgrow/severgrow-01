# Engine / presentation boundary

The authoritative engine (`src/engine/`) decides everything that affects the match; presentation
(`web/src/logic/`, `web/src/player/`, `web/src/ui/`) only displays it. This audit records where the
line is and the one low-risk refactor made to tighten it.

## The engine decides

legal actions (`legalActions`), resulting state (`apply`), score (`score`), turn/phase, winner and
result (`result.ts`), cuts/Sever (`sever.ts`), Bomb/Blast legality and effect, Strangle, final-turn
state, and the starting seat (`match.ts`). Anything a player can be rewarded or punished for is
engine output.

## Presentation may interpret (but not implement) rules

The UI reads the engine's public events and results to animate, colour and phrase things:

- `web/src/logic/anim.ts`, `web/src/player/outcome-light.ts`, `display-machine.ts`, `ui/effects.ts` —
  turn engine steps into pictures/sound.
- `web/src/logic/preview.ts` — uses the engine's `planBloom` / `planSprout` and the engine-based
  `simulate` to describe a move before it is played; it never decides legality.
- `web/src/logic/forecast.ts` — derives cut counts from `simulate` (engine-based).
- `web/src/logic/interaction.ts` — classifies a hex as grow / strengthen / replace for the UI; the
  real choice set still comes from `legalActions`.
- `web/src/logic/endgame.ts turnsLeft` / `finalTurns` — estimates how near the end is from public
  counts; the engine still owns who actually ends and when.
- `web/src/player/display-readout.ts owned()` — counts territory for the LED readout only.
- `web/src/logic/highlights.ts`, `log.ts`, `stats.ts`, `outcome-light.ts` — read the engine result
  and events; they do not recompute them.

## Audit findings and fixes

- **`web/src/logic/match-intel.ts` (fixed).** Sever/Strangle events name the *affected* seat; Match
  Intel now credits the attacker/winner and the cuts meter to the right seat (see Section 2).
- **`web/src/logic/race.ts` `breakdownOf` (tightened).** It used to re-add `tiles + gold + root` as
  the total, duplicating `score()`. It now takes the total from the engine's `score()` and keeps the
  split only for the display lines, so the shown total can never drift from the rules. The existing
  test (`web/tests/race.test.ts`) already asserts the two agree across real games.
- **`web/src/logic/session.ts` (verified).** Plays only actions the engine enumerates; Undo restores
  a stored prior state rather than recomputing one.

No rule logic was found re-implemented in the UI beyond the above; no architecture rewrite was made.
