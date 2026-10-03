# Sprout vs Seed: what the bots show

The A/B test lets you play both versions. This page adds numbers from bot-vs-bot games, so your
own feel can be checked against something. **No rule was changed for these runs.** The bots were
tuned on the Sprout version, so treat the Seed numbers as "the same players, a new rule".

## In short

| | Sprout | Seed | What it means |
| --- | --- | --- | --- |
| Takeovers and cuts per game | **16.2** | **9.3** | Seed has about 40% less fighting: a 1 can never take an enemy tile. |
| Games where the last 8 turns had no takeover, cut or Fruit | 0.2% | 7.7% | Seed endings are calmer; Sprout almost always fights to the end. |
| Strengthens per game | 2.0 | 4.9 | Seed is a "plant, then invest" game, as intended. |
| Side that strengthened more wins | 51% | 41% | In Seed, strengthening a lot is often a sign of falling behind. |
| Comebacks (behind at half time, winning at the end) | 33.9% | 35.9% | Slightly more comebacks in Seed. |
| Fruit used (once per game) | 71% of games | 76% | A bit more Fruit in Seed (more strong tiles to remove). |
| Games ending with >30% of a side's tiles at top rank | 21% | 24% | Slightly more "walls of 9s" in Seed. |
| First player wins | 52.7% | 53.1% | The same. |
| Game length (turns each) | 9.0 | 9.0 | The same. |
| Strangle wins | 6.3% | 6.2% | The same. |

**My reading:** Seed trades fighting for building. Games are as long and as fair, with slightly
more comebacks, but there are far fewer takeovers and cuts, and more turtling at the end. If the
fun of Severor for you is the cut, the snap and the takeover, Sprout delivers more of it. If you
enjoy planning a network and choosing where to invest, Seed gives more of that. Play both and see
which side of that trade you prefer.

## The bot levels still work in Seed

Every level still beats the one below it (800 games per pairing, half each way round). All targets
pass, though 7 vs 6 is right on the line:

| Higher level | vs | Seed: higher level wins | Sprout (for comparison) | Target |
| --- | --- | --- | --- | --- |
| 2 | 1 | 67.0% | 65.3% | 58% |
| 3 | 2 | 69.5% | 71.3% | 58% |
| 4 | 3 | 67.3% | 70.0% | 58% |
| 5 | 4 | 59.6% | 64.5% | 58% |
| 6 | 5 | 68.4% | 71.9% | 58% |
| 7 | 6 | **58.0%** | 66.1% | 58% |
| 8 | 7 | 71.1% | 68.4% | 58% |
| 9 | 8 | 59.0% | 64.3% | 58% |
| 9 | 7 | 75.3% | 76.8% | 65% |
| 7 | 1 | 99.1% | 99.6% | 95% |

So picking a higher level means a harder opponent in both versions.

## How these were measured

- Comparison: `src/sim/v05.ts`, level 7 vs level 7, 2,000 games per version on the same deals
  (seeds 70000+, starts swapped). Accurate to about ±2 percentage points.
  `bash src/sim/v05-stage.sh <dir> 2000 70000 'Sprout={}' 'Seed={"ruleset":"seed","strengthenLimitPerGame":-1}'`
- Ladder: `RULESET=seed bash src/sim/ladder-run.sh <dir> 800 2,1 3,2 4,3 5,4 6,5 7,6 8,7 9,8 9,7 7,1`
- Every game is deterministic, so every number here can be reproduced.

## Full table

| Setting | Games | Fruit games | Fruit mean turn | Fruit user wins | Comeback | Leader wins | Decided by Fruit | Strengthen games | Strengthen/game | More-strengthen side wins | Overgrow+cut/game | Quiet last 8 | >30% top-rank | Blocker removed | Stuck early | Turns/player | P1 wins | Strangle | Reflexive Fruit | Forgotten Fruit |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Seed | 2000 | 75.9% | 13.0 | 47.5% | 35.9% | 64.1% | 6.5% | 98.6% | 4.91 | 41.1% | 9.3 | 7.7% | 23.9% | 73.0% | 0.0% | 9.03 | 53.1% | 6.2% | 2.5% | 51.7% |
| Sprout | 2000 | 70.6% | 13.3 | 49.0% | 33.9% | 66.1% | 5.6% | 91.7% | 1.98 | 51.2% | 16.2 | 0.2% | 21.4% | 75.8% | 0.0% | 9.03 | 52.7% | 6.3% | 1.6% | 58.7% |
