# The Daily Puzzle

Owner decision 2026-10-27 (design: the "Futasaku Daily Puzzle" doc). One turn a day, the same for
everyone (UTC); solving it grows one Territory tile.

## How it plays

- PLAY → `DAILY #042` (second entry, under LEVEL). Caption: `NEW TODAY · STREAK 6`,
  `2 TRIES LEFT`, `SOLVED · STREAK 7`, `1 TILE TO PLACE`, `NEXT PUZZLE TOMORROW`.
- The board is a real game frozen at the start of the player's Grow step. The opponent never moves.
- Three tries. Undo is free inside a try; ending the Grow step ends the try.
- The goal is always the best the turn allows: `LEAD +8` (grow the lead by 8), `CUT OFF 3 TILES`,
  or `SURROUND THEIR HOME` (win now).
- Solve → "You earned 1 tile" → `PLACE IT` → Territory, lit as usual → grow it → `BACK TO GAMES`.
  Leaving first keeps the tile waiting (`1 TILE TO PLACE`).
- Out of tries → `SHOW THE ANSWER` plays it on the board. Share copies a three-line printout.
- The streak and tries are kept on the device (`severgrow.daily.v1`). A reload restarts the try,
  never hands a try back.

## Where the code is

| What | Where |
| --- | --- |
| Rules side (measure a turn, search every ending, prove a puzzle) | `src/daily/core.ts` |
| Calendar, streak, share line | `src/daily/calendar.ts` |
| First day and count (tiny, read by the menu) | `src/daily/schedule.ts` |
| The puzzles (generated) | `src/daily/puzzles-data.ts`, from `src/daily/picks.json` |
| The page (sheets, header strip, record, tile flow) | `web/src/daily/mount.ts`, `web/src/daily/record.ts` |
| Hooks into the match | `beginDaily` / `endDaily` / `dailyActive` in `web/src/main.ts` |
| Server: verify by replay, pay one tile | `WorldEconomyService.daily` (`POST /v1/seeds/daily`) |

## The tile on the server

A solve is queued like a level's Seeds proof (`kind: 'daily'`, receipt `daily:<no>`). The server
replays the turn with `playTurn` from the shipped puzzle's own start and checks `goalMet`. It pays
exactly `SEED_ECONOMY.tileCost` (never the beta multiplier: the reward is one tile), outside the daily
cap, once per puzzle. Only today's puzzle is accepted (yesterday's too, as a grace for a solve sent
just after midnight UTC). No migration: it is recorded as mode `campaign`, like `lesson:10`.

Until the Edge function is redeployed (`docs/DEPLOY-ONLINE.md`), a solve stays queued on the device
and the tile shows as waiting; it is paid on the first visit after the deploy.

The three-try limit is the device's; the server cannot see tries. A player who clears their storage
gets fresh tries, but still at most one tile per puzzle.

## Adding puzzles

1. `npm run daily:gen -- --from=81 --to=160 --out=/tmp/c.jsonl` (real level-7 games; slow, ~25 s a game).
2. `npx tsx src/sim/daily-pick.ts --in=/tmp/c.jsonl` lists the usable candidates, hardest first.
3. Append `{ id, title, note }` entries to `src/daily/picks.json` (day order; never reorder or
   remove shipped days: a number names one puzzle forever), keep the candidate files, and run
   `npx tsx src/sim/daily-pick.ts --in=<all candidate files> --pick=src/daily/picks.json`.
4. Raise `DAILY_COUNT` in `src/daily/schedule.ts`. `tests/daily/puzzles.test.ts` re-proves every
   puzzle on every build.

The candidates the first 30 came from (seeds 1-80) are not in the repo; regenerating them with the
same seeds gives the same games.
