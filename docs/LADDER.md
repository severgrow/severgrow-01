# The bot ladder (v0.5, bots-v0.6)

Nine bot levels. Each must beat the level below it clearly, so picking a higher level always
means a harder game. This file shows how that was checked and tuned.

## How it is measured

`src/sim/ladder.ts` plays level A against level B with the default v0.5 rules
(`v0.5-fruit-strengthen`). Each pairing is **800 games**: 400 seeds, each played twice with
the starts swapped, so neither level gets the first move more often. Every game is
deterministic (same seed, same moves), so any number here can be reproduced:

```
bash src/sim/ladder-run.sh ladder-out 800 2,1 3,2 4,3 5,4 6,5 7,6 8,7 9,8 9,7 7,1
npx tsx src/sim/ladder.ts --table --dir=ladder-out
```

With 800 games one result is good to about ±3.5 percentage points (95%).

## Targets

- each level beats the one below it in **at least 58%** of games;
- level 9 beats level 7 in **at least 65%**;
- level 7 beats level 1 in **at least 95%**.

## Results (final settings)

| Higher level | vs | Games | Higher level wins | Avg score lead | Target | Pass |
| --- | --- | --- | --- | --- | --- | --- |
| 2 | 1 | 800 | 65.3% | 4.2 | 58% | yes |
| 3 | 2 | 800 | 71.3% | 6.3 | 58% | yes |
| 4 | 3 | 800 | 70.0% | 6.5 | 58% | yes |
| 5 | 4 | 800 | 64.5% | 4.0 | 58% | yes |
| 6 | 5 | 800 | 71.9% | 6.8 | 58% | yes |
| 7 | 6 | 800 | 66.1% | 4.5 | 58% | yes |
| 8 | 7 | 800 | 68.4% | 5.1 | 58% | yes |
| 9 | 8 | 800 | 64.3% | 3.8 | 58% | yes |
| 9 | 7 | 800 | 76.8% | 7.9 | 65% | yes |
| 7 | 1 | 800 | 99.6% | 25.2 | 95% | yes |

There were no draws.

## What changed to get there

The first full v0.5 run had one miss: **level 8 beat level 7 in only 57.4%** (459/800).
Level 8 is level 7 plus a better throwing rule (it keeps its strong cards and combos), but it
also slipped (played a lesser move) 45% of the time, which cancelled out most of the gain.
Three variants were tried against level 7 over 400 games each:

| Level 8 variant | Wins vs 7 |
| --- | --- |
| A: slips 30%, plus level 9's Strengthen/Fruit judgement | 60.8% |
| B: slips 25% | 62.0% |
| C: slips 15% | 68.8% |

C was chosen: the clearest gap over level 7. Level 9 still beats it (64.3% over 800 games;
against the old level 8 it was 79.5%). The two pairings that involve level 8 were then run
again at 800 games (the table above). No other level changed. The bots read only their own
`View`, are deterministic, and never use timers.

## What each level is

| Level | What it does |
| --- | --- |
| 1-6 | Level 7's thinking with a "sloppiness" dial (k = 0.95, 0.85, 0.72, 0.55, 0.40, 0.15): more mistakes, stopping growth early, caring less about danger. |
| 1-2 | Ignore Strengthen and Fruit, except a rare whim (3% per Grow step, on its own random stream). |
| 3-4 | Simple rules for Strengthen and Fruit. |
| 5-6 | Weigh how exposed a tile is and the net swing. |
| 7 | GreedyBot, with the full Strengthen and Fruit judgement. |
| 8 | Level 7, keeping strong cards and combos when throwing; slips 15% of the time. |
| 9 | Plans its whole turn, keeps strong cards, throws what helps the opponent least, and imagines 6 opponent hands to judge their best reply; also thinks about the opponent's Fruit. |

Details of the Strengthen and Fruit judgement: `docs/BOT-TACTICS.md`. Settings:
`src/bots/levels.ts`. Only the current bot version is kept (v0.6: older bots and their replays were deleted).

