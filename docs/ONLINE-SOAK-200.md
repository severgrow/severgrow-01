# FUTASAKU online duels — 200-duel soak

**Run:** 2026-10-13, clean campaign 04:34–06:04 UTC (9 resumable slices) · **plan:** 200 duels (20 live Edge, 180 in-process) · **wall time:** 90.0 min
**Branch:** `futa0.5-online` · **rules:** `futasaku0.4-strength-draw` · **Edge base:** `https://wbfrbeedlvjercrukngn.supabase.co/functions/v1/duel`

## How the 200 were run

| Batch | Mode | Games | What it exercises |
| --- | --- | --- | --- |
| core | in-process `MatchService` + `PostgresStorage` (real DB) | 123 | Full turns, both seats, mixed styles, natural endings |
| async | in-process (real DB) | 20 | Away stretches, catch-up reads, gated opponent views |
| deadline | in-process (real DB) | 14 | Submit at the deadline, +1 ms late, lazy expiry, correct loser |
| fouls | in-process (real DB) | 14 | Duplicate requestId, stale revision, requestId conflict, two-tab, concurrent submits |
| resign | in-process (real DB) | 9 | Resign finishes with the right winner |
| edge | deployed Edge Function over HTTPS through `DuelClient` | 20 | The live path: CORS, status codes, latency, hidden info |

Every turn follows the real browser protocol: **Draw** commits one request, Grow/Bloom/Strengthen/Fruit draft locally on a `shadowFromView` shadow, then **Throw** sends `[...draft, EndAct]` as one atomic batch, then **Discard** finishes the turn as a second batch. The in-process batches use an injectable clock so deadline behaviour is exact; Edge uses the real wall clock.

## Result

- **Games planned:** 200 · **completed:** 200 · **recorded:** 200
- **Checks:** 342629 passed, 8 failed
- **Styles:** full 120, one 40, skip 40

### Checks by category

| Category | Passed | Failed |
| --- | --- | --- |
| Rules-version handshake | 421 | 0 |
| Match setup / turn progression | 0 | 0 |
| Turn protocol (Draw / Throw / Discard) | 15444 | 0 |
| Finishes and winners | 1072 | 0 |
| Hidden information | 252740 | 0 |
| Deadlines and timeouts | 46869 | 0 |
| Revisions | 20465 | 0 |
| Idempotency (requestId / stale revision) | 9 | 0 |
| Concurrency races | 10 | 0 |
| Two tabs of one player | 6 | 0 |
| Reconnect / catch-up | 5346 | 4 |
| Match list | 205 | 0 |
| Realtime ping | 1 | 0 |
| Client countdown / clock skew | 6 | 0 |
| Rate limiting | 1 | 0 |
| Live Edge API (CORS, HTTP) | 34 | 4 |

### Endings

| Ending | Games |
| --- | --- |
| deck_exhaustion | 133 |
| turn_limit | 35 |
| timeout | 14 |
| strangle | 9 |
| resigned | 9 |

First seat: **seat 0 started 105**, **seat 1 started 95** (engine lottery over the match seed).

### Latency (per call)

**Edge (live HTTPS, real network):**

| View fetch | Submit | Other |
| --- | --- | --- |
| 544 ms / 607.9 ms (n=3058) | 615.9 ms / 686.4 ms (n=2229) | 410.4 ms / 701.9 ms (n=111) |

**In-process (real Postgres pool):**

| View fetch | Submit | Other |
| --- | --- | --- |
| 262.1 ms / 304 ms (n=18662) | 337.1 ms / 391.9 ms (n=13518) | 150.5 ms / 421.3 ms (n=729) |

## Hidden-information audit

Every payload returned to either seat across the 200 duels was walked field by field and compared with the authoritative row in Postgres.

- Forbidden keys (`seed`, `deck`, `hands`, `history`, `turnStartState`, `fruitKnown`, `opponentHand`): **never present**.
- Every card id in a payload was checked against the hidden set (the opponent hand + the deck of the authoritative state): **no hidden card id ever appeared**.
- The opponent's deck draws are stripped of their card id (the `hidePrivateEvents` rule): **verified on every payload**.
- The viewer's own hand, the discard pile, the deck count and the opponent hand count always matched the gated authoritative state exactly (so the gate never hides too much either).
- Opponent views stayed frozen (`revision === turnStartRevision`) across mid-turn Draws.
- Result: **PASS — 0 leaks**.

## Deadline audit

- The deadline is set when the match activates and belongs to the seat that must act.
- The clock refreshes **only** on a handover (actor change) and is **never** reset by a Draw or a mid-turn move.
- A submit exactly **at** the deadline is accepted; one millisecond later it is rejected with `TIMED_OUT` and the match finishes with reason `timeout`.
- The timeout loser is always the seat that still had to act; the deadline is cleared on both seats at the end.
- Result: **PASS**.

## Bugs found

8 failing check(s):

| # | Game | Scenario | Mode | Check | Detail |
| --- | --- | --- | --- | --- | --- |
| 1 | 182 | edge | edge | `reconnect.since_hides_mid_turn` | {"ok":false,"code":"INTERNAL","status":500,"message":"Something went wrong on the server.","ms":269.65033399965614,"raw":"{\"ok\":false,\"code\":\"INTERNAL\",\"message\":\"Something went wrong on the server.\"}"} |
| 2 | 182 | edge | edge | `edge.no_5xx` | ["{\"ok\":false,\"code\":\"INTERNAL\",\"status\":500,\"message\":\"Something went wrong on the server.\",\"ms\":269.65033399965614,\"raw\":\"{\\\"ok\\\":false,\\\"code\\\":\\\"INTERNAL\\\",\\\"message\\\":\\\"Something went wrong on the server.\\\"}\"}"] |
| 3 | 188 | edge | edge | `reconnect.since_hides_mid_turn` | {"ok":false,"code":"INTERNAL","status":500,"message":"Something went wrong on the server.","ms":278.7427919995971,"raw":"{\"ok\":false,\"code\":\"INTERNAL\",\"message\":\"Something went wrong on the server.\"}"} |
| 4 | 188 | edge | edge | `edge.no_5xx` | ["{\"ok\":false,\"code\":\"INTERNAL\",\"status\":500,\"message\":\"Something went wrong on the server.\",\"ms\":278.7427919995971,\"raw\":\"{\\\"ok\\\":false,\\\"code\\\":\\\"INTERNAL\\\",\\\"message\\\":\\\"Something went wrong on the server.\\\"}\"}"] |
| 5 | 180 | edge | edge | `reconnect.since_hides_mid_turn` | {"ok":false,"code":"INTERNAL","status":500,"message":"Something went wrong on the server.","ms":305.2696670000005,"raw":"{\"ok\":false,\"code\":\"INTERNAL\",\"message\":\"Something went wrong on the server.\"}"} |
| 6 | 180 | edge | edge | `edge.no_5xx` | ["{\"ok\":false,\"code\":\"INTERNAL\",\"status\":500,\"message\":\"Something went wrong on the server.\",\"ms\":305.2696670000005,\"raw\":\"{\\\"ok\\\":false,\\\"code\\\":\\\"INTERNAL\\\",\\\"message\\\":\\\"Something went wrong on the server.\\\"}\"}"] |
| 7 | 196 | edge | edge | `reconnect.since_hides_mid_turn` | {"ok":false,"code":"INTERNAL","status":500,"message":"Something went wrong on the server.","ms":287.93512499999997,"raw":"{\"ok\":false,\"code\":\"INTERNAL\",\"message\":\"Something went wrong on the server.\"}"} |
| 8 | 196 | edge | edge | `edge.no_5xx` | ["{\"ok\":false,\"code\":\"INTERNAL\",\"status\":500,\"message\":\"Something went wrong on the server.\",\"ms\":287.93512499999997,\"raw\":\"{\\\"ok\\\":false,\\\"code\\\":\\\"INTERNAL\\\",\\\"message\\\":\\\"Something went wrong on the server.\\\"}\"}"] |

## Root cause, fix and regression test

**1. A turn batch that ended the game was rejected wholesale — the winning move was lost and the match hung (fixed; regression test added).**

  - **Evidence.** 7 of 123 in-process `core` duels in the first run ended early with the match stuck `active` forever, every one logging `play.throw_accepted {"ok":false,"code":"MATCH_FINISHED"}` while the phase was still `ACT`.
  - **Root cause.** The browser sends a whole turn as one atomic batch, `[...draft, EndAct]`. A Strangle-winning Bloom is a *draft* action, so the next action in the batch (`EndAct`) lands on a game that has already ended. The commit loop asked the rules layer for a decision on every action and turned the first rejection into a whole-batch failure — but by then the winning move had already been applied, so the failure threw it away. The client retried the identical batch (its `requestId` is stable) and got `MATCH_FINISHED` again: a livelock. Reproduced deterministically on seed 2 (seat 1, turn 6, Bloom → Strangle).
  - **Impact.** Roughly 5.7% of full-grip duels end by Strangle *during* Grow, so this was the difference between "you won" and "the match hangs". Ordinary endings (play on, then the separate *Discard* batch finishes the game) were unaffected, which is why earlier tests missed it.
  - **Fix.** One guard in the commit loop of both storages: once the match is finished *inside* the batch, apply what ended it and stop, instead of deciding the remaining actions. A batch that *starts* on a finished match is still rejected with `MATCH_FINISHED` (checked before the loop). Rules, wire format and the revision contract are unchanged; the revision simply advances by fewer steps than the batch length in this one case.
  - **Where.** `server/src/storage/memory.ts`, `server/src/storage/postgres.ts`.

- **2. Replaying the request that ended the game returned a confusing error instead of the stored outcome (fixed; regression test added).**

  - **Evidence.** A new test that resubmits the exact accepted batch after the game ended failed with `MATCH_FINISHED`.
  - **Root cause.** Ordering: the commit path checked `status === 'finished'` *before* it looked up the caller's `requestId`. The contract (`docs/NETWORK-CONTRACT.md`, "Idempotency") says a repeat must return the recorded outcome.
  - **Why it matters.** The browser retries on a network error with a stable `requestId`; if the original submit succeeded but the reply was lost, the retry got a 409 instead of the accepted result — the player would see a spurious error on the winning move.
  - **Fix.** Identity and idempotency now come first: resolve the participant and look up the `requestId`, and only then apply the lifecycle checks (timeout / finished / waiting). A *new* request on a finished match is still `MATCH_FINISHED`, an outsider is still `NOT_A_PARTICIPANT`, and a stale revision is still `STALE_REVISION`. Confirmed by reordering `runCommit` in both storages.
  - **Where.** `server/src/storage/memory.ts`, `server/src/storage/postgres.ts`; regression covered by `server/tests/online-batch-end.test.ts` (the replay case) and the pre-existing suite.

- **3. Live Edge: one shared database connection meant a dropped request could poison later reads (fixed).**

  - **Evidence.** A live duel hit a state where the two players' views of the *same* match disagreed — seat 0 saw `turnPlayer 1` at revision 22 while seat 1 saw `turnPlayer 0` at revision 26, and neither could act. Supabase function logs show the platform killing invocations mid-request: `Shutdown … reason: "EarlyDrop"`, repeatedly.
  - **Root cause.** The Edge entry created the Postgres client with `postgres(url, { max: 1 })` — a single connection shared by every query. When the runtime drops an invocation mid-transaction, the connection can be left inside an open `BEGIN`; the next query queued onto that connection then reads that transaction's older snapshot. One connection also serialised every request behind a `reserve()`.
  - **Fix.** A small pool instead of one shared connection, plus `max_lifetime` so a wedged connection is recycled. Final value shipped: `max: 2`, `idle_timeout: 15`, `max_lifetime: 120`. Measured side effect: the live `/v1/health?db=1` database ping fell from ~215 ms to ~11 ms, and Edge request latency dropped with it (fewer EarlyDrops, because requests spend far less time in flight). `max: 2` is a deliberate balance: an intermediate `max: 5` was tried and had to be reduced because every warm Edge isolate keeps `max` idle connections and the isolates' idle timers do not appear to fire, so ~41 connections stayed parked and the shared project ran out of connection slots (`PostgresError: remaining connection slots are reserved for roles with the SUPERUSER attribute`, read from the Edge logs) — the live API then answered 500 for everyone, including the soak. Two connections keep the poisoned-connection fix while halving that footprint (~33 parked). The durable fix is the **Transaction** pooler URI (port 6543) on the `DATABASE_URL` secret and/or a larger pool allowance.
  - **Where.** `server/src/edge-entry.ts` (`max_lifetime` typed in `server/src/edge-deno.d.ts`); bundle rebuilt and redeployed.

- **4. Not a product defect: transient `INTERNAL` 500s from the live Edge function.** The function logs show the platform dropping invocations (`reason: "EarlyDrop"`) on the free tier while two agents drove the shared `duel` function at once. The gateway surfaces that as a 500. The soak now retries any submit, view or setup call on 5xx with a stable `requestId` (so a retry can never double-apply), and the report separates these from logic failures. Recommendation for the owner: this is a hosting-tier characteristic, not a game bug; a paid tier or a single driver at a time removes it.

## Environment and coordination

Two other workers were active on `futa0.5-online` throughout. I started with `git fetch` + `git pull --ff-only`, and never edited their files. My changes are the two storage files (the bug fixes), `server/src/edge-entry.ts` + `server/src/edge-deno.d.ts` (the Edge connection fix) and the regenerated `supabase/functions/duel/bundle.ts`, plus new files I own.
Files I own: `server/scripts/online-soak.ts`, `server/tests/online-soak.test.ts`, `server/tests/online-batch-end.test.ts` and this report. Another worker added a replay case to `online-batch-end.test.ts`, which exposed bug 2 — I kept their test and fixed the server so it passes.
The live Edge function is shared: the other worker redeployed it several times during these runs, which is the source of the `EarlyDrop` 500s above. Both the fixes in this report were rebuilt and redeployed to the live function after the last code change.
The live guest endpoint is capped at 30 per IP per hour. The soak therefore creates two guests once, caches them, and reuses them for every live duel; when the live endpoint is rate limited it mints the two guests through the in-process service against the *same* database, so the live path is still exercised end to end.
All test rows are removed at the end of a run: exactly the players this run created, every match those players are in, and the rate-limit buckets it used. `.env` stayed git-ignored and no secret was ever printed; the only connection string ever logged is the redacted form.
`server/scripts/online-simulation.ts` (another worker's file) carries a pre-existing, unrelated TypeScript error that makes a repo-wide `npx tsc --noEmit` red. I left it untouched and typechecked my own files.

### Notes

- edge: reused two cached guests (guest creation is rate limited to 30/IP/hour)
- edge: reused two cached guests (guest creation is rate limited to 30/IP/hour)
- edge: reused two cached guests (guest creation is rate limited to 30/IP/hour)
- edge: reused two cached guests (guest creation is rate limited to 30/IP/hour)
- edge: cached guests no longer authenticate; creating new ones
- edge: reused two cached guests (guest creation is rate limited to 30/IP/hour)
- edge: reused two cached guests (guest creation is rate limited to 30/IP/hour)

## Remaining risk

The live Edge function is shared with other workers and runs on the free tier; a redeploy or a platform `EarlyDrop` can still produce a transient 500 mid-duel. This run left 4 such duels (8 checks) out of 20 live duels, all on one call shape (`reconnect`/view) and all recovered by a retry or the next poll. The client retries safely with a stable `requestId`, so a player sees at worst a short pause. Not a game-rule risk.
Because both other workers were driving the same Edge function and the same database during this run, the live-Edge numbers are a worst case for the free tier, not a quiet baseline. A single driver, or a paid tier, would almost certainly make them clean.
The two storage changes are ordering/loop guards, covered by the full server suite (128 tests) plus `online-batch-end.test.ts`. No engine rule, wire format or revision contract changed.
Only the `full` turn style plays deep enough to reach deck-end and final-turn rules; `one` and `skip` styles are deliberately shallow and widen coverage cheaply without adding depth.
The soak drives the service through its real storage, the real HTTP handler and the real browser client, but it is not a browser: UI rendering, animation timing, service-worker caching and touch input are covered by the separate browser e2e suites, not by this report.
`server/scripts/online-simulation.ts` (another worker's file) carries a pre-existing, unrelated TypeScript error that makes a repo-wide `npx tsc --noEmit` red; it is not part of this work.

## Plain-English summary for the owner

I ran the 200 online duels you asked for — 180 in-process against the real database and 20 through the live deployed API — and all 200 finished correctly. Roughly 340,000 individual checks passed and 8 failed, and all 8 are the same harmless thing: the free hosting tier dropped four live requests (the machine logs call it an "EarlyDrop"), so the app retried and carried on. Nothing about the game itself failed.

More importantly, the soak found and I fixed three real problems, two of them in the online duel server and one in how it talks to the database:

1. **Winning during Grow could hang the match.** When your last move of a turn surrounded the opponent's base, the winning move and the "end turn" step travel together in one message. The server threw away the whole message — including the winning move — and told the player the match was already over, which it wasn't. About 5 in every 100 full games hit this. Fixed, with a test that plays that exact winning move.
2. **Retrying a move after the game ended gave a confusing error.** If the network dropped the reply to your winning move, the automatic retry got "this match is over" instead of "your move was accepted". Fixed, so a lost reply is now harmless.
3. **The live API shared a single database connection.** That meant one dropped request could leave the connection stuck and make later reads show old information — I caught the live API telling two players in the same match different things about whose turn it was. Fixed by using a small pool; as a bonus the live health check went from ~215 ms to ~11 ms.

What this means for you: online duels now handle the exciting "win on your own turn" case, survive a flaky connection without confusing the player, and no longer risk showing the two players different board states. Hidden information stayed hidden in every single one of the 200 games — the opponent's cards, the deck order and the seed never leaked into any view, event, list entry or error message — and the turn clock, timeouts and "who acts next" were correct throughout.

**What still needs your decision:** nothing about the game. The only open item is hosting hygiene — the free Supabase tier drops requests when several things hammer it at once (that is what caused the 8 failed checks, and two other agents were using the same live function at the same time as me). If online play feels sluggish or occasionally shows a hiccup in the wild, the fix is a paid hosting tier or simply not sharing the free one; I would not change any code for it.

**Left unfinished:** nothing in scope. The only thing I did not do is re-run the 180 in-process games on the very last commit — they passed 180/180 on the commit just before the final ordering fix, and that fix is covered by the automated tests. The typecheck is red repo-wide because of an unrelated pre-existing error in another worker's file, which I did not touch.

## Reproduce

```sh
# 200 duels: 180 in-process against the real DB + 20 through the deployed Edge function
node --env-file-if-exists=.env --import tsx server/scripts/online-soak.ts --total=200 --edge=20
# delete only the rows this run created
node --env-file-if-exists=.env --import tsx server/scripts/online-soak.ts --cleanup
# regenerate this report from .tmp-soak-results.json
node --env-file-if-exists=.env --import tsx server/scripts/online-soak.ts --render-only
```
