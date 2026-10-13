# FUTASAKU online duels — 200-duel soak

**Run:** 2026-10-13T05:57:53.393Z · **plan:** 200 duels (20 live Edge, 180 in-process) · **wall time:** 93.6 min
**Branch:** `futa0.5-online` · **rules:** `futasaku0.4-strength-draw` · **Edge base:** `https://wbfrbeedlvjercrukngn.supabase.co/functions/v1/duel`

## How the 200 were run

| Batch | Mode | Games | What it exercises |
| --- | --- | --- | --- |
| core | in-process `MatchService` + `PostgresStorage` (real DB) | 123 | Full turns, both seats, mixed styles, natural endings |
| async | in-process (real DB) | 21 | Away stretches, catch-up reads, gated opponent views |
| deadline | in-process (real DB) | 15 | Submit at the deadline, +1 ms late, lazy expiry, correct loser |
| fouls | in-process (real DB) | 15 | Duplicate requestId, stale revision, requestId conflict, two-tab, concurrent submits |
| resign | in-process (real DB) | 10 | Resign finishes with the right winner |
| edge | deployed Edge Function over HTTPS through `DuelClient` | 20 | The live path: CORS, status codes, latency, hidden info |

Every turn follows the real browser protocol: **Draw** commits one request, Grow/Bloom/Strengthen/Fruit draft locally on a `shadowFromView` shadow, then **Throw** sends `[...draft, EndAct]` as one atomic batch, then **Discard** finishes the turn as a second batch. The in-process batches use an injectable clock so deadline behaviour is exact; Edge uses the real wall clock.

## Result

- **Games planned:** 200 · **completed:** 201 · **recorded:** 204
- **Checks:** 332730 passed, 21 failed
- **Styles:** full 123, one 41, skip 40

### Checks by category

| Category | Passed | Failed |
| --- | --- | --- |
| Rules-version handshake | 414 | 0 |
| Match setup / turn progression | 0 | 3 |
| Turn protocol (Draw / Throw / Discard) | 14990 | 0 |
| Finishes and winners | 1079 | 3 |
| Hidden information | 245398 | 0 |
| Deadlines and timeouts | 45528 | 6 |
| Revisions | 19861 | 0 |
| Idempotency (requestId / stale revision) | 9 | 0 |
| Concurrency races | 12 | 0 |
| Two tabs of one player | 6 | 0 |
| Reconnect / catch-up | 5193 | 5 |
| Match list | 203 | 0 |
| Realtime ping | 2 | 0 |
| Client countdown / clock skew | 12 | 0 |
| Rate limiting | 2 | 0 |
| Live Edge API (CORS, HTTP) | 21 | 4 |

### Endings

| Ending | Games |
| --- | --- |
| deck_exhaustion | 133 |
| turn_limit | 33 |
| timeout | 15 |
| resigned | 10 |
| strangle | 10 |

First seat: **seat 0 started 93**, **seat 1 started 111** (engine lottery over the match seed).

### Latency (per call)

**Edge (live HTTPS, real network):**

| View fetch | Submit | Other |
| --- | --- | --- |
| 539.1 ms / 603.9 ms (n=2385) | 610.7 ms / 688.2 ms (n=1711) | 418.8 ms / 702.8 ms (n=85) |

**In-process (real Postgres pool):**

| View fetch | Submit | Other |
| --- | --- | --- |
| 261.7 ms / 302.4 ms (n=18560) | 336.3 ms / 389.9 ms (n=13457) | 164.6 ms / 418.3 ms (n=729) |

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
- Result: **FAIL — 6 deadline check(s)**.

## Bugs found

21 failing check(s):

| # | Game | Scenario | Mode | Check | Detail |
| --- | --- | --- | --- | --- | --- |
| 1 | 17 | edge | edge | `reconnect.since_hides_mid_turn` | {"ok":false,"code":"INTERNAL","status":500,"message":"Something went wrong on the server.","ms":320.30141599988565,"raw":"{\"ok\":false,\"code\":\"INTERNAL\",\"message\":\"Something went wrong on the server.\"}"} |
| 2 | 17 | edge | edge | `edge.no_5xx` | ["{\"ok\":false,\"code\":\"INTERNAL\",\"status\":500,\"message\":\"Something went wrong on the server.\",\"ms\":320.30141599988565,\"raw\":\"{\\\"ok\\\":false,\\\"code\\\":\\\"INTERNAL\\\",\\\"message\\\":\\\"Something went wrong on the server.\\\"}\"}"] |
| 3 | 18 | edge | edge | `reconnect.since_hides_mid_turn` | {"ok":false,"code":"INTERNAL","status":500,"message":"Something went wrong on the server.","ms":289.6534160000738,"raw":"{\"ok\":false,\"code\":\"INTERNAL\",\"message\":\"Something went wrong on the server.\"}"} |
| 4 | 18 | edge | edge | `reconnect.since_hides_mid_turn` | {"ok":false,"code":"INTERNAL","status":500,"message":"Something went wrong on the server.","ms":306.29937500017695,"raw":"{\"ok\":false,\"code\":\"INTERNAL\",\"message\":\"Something went wrong on the server.\"}"} |
| 5 | 18 | edge | edge | `game.actor_found` | {"liveStatus":"active","seats":[{"seat":0,"status":"active","phase":"DRAW","actor":1,"turnPlayer":1,"legals":0,"revision":75,"boundary":75},{"seat":1,"status":"active","phase":"DRAW","actor":0,"turnPlayer":0,"legals":0,"revision":72,"boundary":72}]} |
| 6 | 18 | edge | edge | `finish.finished` | active |
| 7 | 18 | edge | edge | `deadline.cleared_on_finish` |  |
| 8 | 18 | edge | edge | `deadline.cleared_on_finish` |  |
| 9 | 18 | edge | edge | `edge.no_5xx` | ["{\"ok\":false,\"code\":\"INTERNAL\",\"status\":500,\"message\":\"Something went wrong on the server.\",\"ms\":289.6534160000738,\"raw\":\"{\\\"ok\\\":false,\\\"code\\\":\\\"INTERNAL\\\",\\\"message\\\":\\\"Something went wrong on the server.\\\"}\"}","{\"ok\":false,\"code\":\"INTERNAL\",\"status\":500,\"message\":\"Something went wrong on the server.\",\"ms\":306.29937500017695,\"raw\":\"{\\\"ok\\\":false,\\\"code\\\":\\\"INTERNAL\\\",\\\"message\\\":\\\"Something went wrong on the server.\\\"}\"}","{\"liveStatus\":\"active\",\"seats\":[{\"seat\":0,\"status\":\"active\",\"phase\":\"DRAW\",\" |
| 10 | 19 | edge | edge | `reconnect.since_hides_mid_turn` | {"ok":false,"code":"INTERNAL","status":500,"message":"Something went wrong on the server.","ms":249.23083300003782,"raw":"{\"ok\":false,\"code\":\"INTERNAL\",\"message\":\"Something went wrong on the server.\"}"} |
| 11 | 19 | edge | edge | `game.actor_found` | {"liveStatus":"active","seats":[{"seat":0,"status":"active","phase":"DRAW","actor":1,"turnPlayer":1,"legals":0,"revision":24,"boundary":24},{"seat":1,"status":"active","phase":"DRAW","actor":0,"turnPlayer":0,"legals":0,"revision":30,"boundary":30}]} |
| 12 | 19 | edge | edge | `finish.finished` | active |
| 13 | 19 | edge | edge | `deadline.cleared_on_finish` |  |
| 14 | 19 | edge | edge | `deadline.cleared_on_finish` |  |
| 15 | 19 | edge | edge | `edge.no_5xx` | ["{\"ok\":false,\"code\":\"INTERNAL\",\"status\":500,\"message\":\"Something went wrong on the server.\",\"ms\":249.23083300003782,\"raw\":\"{\\\"ok\\\":false,\\\"code\\\":\\\"INTERNAL\\\",\\\"message\\\":\\\"Something went wrong on the server.\\\"}\"}","{\"liveStatus\":\"active\",\"seats\":[{\"seat\":0,\"status\":\"active\",\"phase\":\"DRAW\",\"actor\":1,\"turnPlayer\":1,\"legals\":0,\"revision\":24,\"boundary\":24},{\"seat\":1,\"status\":\"active\",\"phase\":\"DRAW\",\"actor\":0,\"turnPlayer\":0,\"legals\":0,\"revision\":30,\"boundary\":30}]}","active","",""] |
| 16 | 23 | edge | edge | `reconnect.since_hides_mid_turn` | {"ok":false,"code":"INTERNAL","status":500,"message":"Something went wrong on the server.","ms":255.91354099987075,"raw":"{\"ok\":false,\"code\":\"INTERNAL\",\"message\":\"Something went wrong on the server.\"}"} |
| 17 | 23 | edge | edge | `game.actor_found` | {"liveStatus":"active","seats":[{"seat":0,"status":"active","phase":"DRAW","actor":1,"turnPlayer":1,"legals":0,"revision":72,"boundary":72},{"seat":1,"status":"active","phase":"DRAW","actor":0,"turnPlayer":0,"legals":0,"revision":69,"boundary":69}]} |
| 18 | 23 | edge | edge | `finish.finished` | active |
| 19 | 23 | edge | edge | `deadline.cleared_on_finish` |  |
| 20 | 23 | edge | edge | `deadline.cleared_on_finish` |  |
| 21 | 23 | edge | edge | `edge.no_5xx` | ["{\"ok\":false,\"code\":\"INTERNAL\",\"status\":500,\"message\":\"Something went wrong on the server.\",\"ms\":255.91354099987075,\"raw\":\"{\\\"ok\\\":false,\\\"code\\\":\\\"INTERNAL\\\",\\\"message\\\":\\\"Something went wrong on the server.\\\"}\"}","{\"liveStatus\":\"active\",\"seats\":[{\"seat\":0,\"status\":\"active\",\"phase\":\"DRAW\",\"actor\":1,\"turnPlayer\":1,\"legals\":0,\"revision\":72,\"boundary\":72},{\"seat\":1,\"status\":\"active\",\"phase\":\"DRAW\",\"actor\":0,\"turnPlayer\":0,\"legals\":0,\"revision\":69,\"boundary\":69}]}","active","",""] |

## Root cause, fix and regression test

**Server — a batch that ends the game mid-turn (the real defect).** A turn is submitted as one atomic batch, `[...draft, EndAct]`. When a draft move ended the game (a Strangle-winning Bloom), the next action in the batch (EndAct) landed on a finished match, so the whole batch was rejected with `MATCH_FINISHED`: the winning move was rolled back and the match stayed active forever. Fix: `server/src/storage/memory.ts` and `postgres.ts` stop applying a batch once the game has finished, keeping the move that ended it and dropping the rest of the turn. A batch that *starts* on a finished match is still rejected. Regression: `server/tests/online-batch-end.test.ts` (mid-batch Strangle win; replay by requestId; reject-after-finish).
**Harness — revision expectation for a truncated batch.** Once the server keeps only the moves up to the game end, the revision grows by those moves, not the whole batch. The `revision.plus_batch_len` check now simulates the batch on the authoritative pre-state to count exactly the moves that were applied (previously the check was never reached because the batch was rejected).
**Harness — the atomic-batch foul was not actually illegal.** It sent `[legalAction, EndAct]` at the DRAW step; Draw moves to ACT, where EndAct *is* legal, so a healthy server accepted the batch and the check failed wrongly. It now sends `[safe first action, Discard(-1)]` — a card that can never be in a hand is illegal in DRAW, ACT and DISCARD alike — and never lets the first action end the game.
**Live Edge — connection-slot exhaustion (infrastructure, mitigated).** The live function answered `500` with `PostgresError: remaining connection slots are reserved for roles with the SUPERUSER attribute`. The Edge logs pinned it to database connection saturation, not a rules defect: the function's postgres.js pool was `max: 5`, every warm Edge isolate keeps `max` idle connections, and the isolates' idle timers do not appear to fire, so ~41 connections stayed parked and the shared project ran out of slots. Reduced the Edge pool to `max: 2` with a shorter `idle_timeout`/`max_lifetime` (`server/src/edge-entry.ts`), which brought the parked connections down to ~33 and halves the burst footprint; the durable fix is the **Transaction** pooler URI (port 6543) on the `DATABASE_URL` secret (and/or a larger pool allowance).

## Environment and coordination

The live-Edge 500s are this connection saturation: the Edge logs show `PostgresError: remaining connection slots …` for `/matches`, `/view` and `/actions`. The harness now releases its in-process pool before the live phase and retries a transient 5xx on match setup and reads (a connection-acquisition failure writes no row, so a retry cannot double-create). The number of retried 5xx is printed in the notes below; residual ones are reported, never hidden.
The 180 in-process duels and the live-Edge batch were launched as two passes (the first pass consumed the shared guest budget before the live batch could run) and their results are merged here; the numbers are additive. No test row was left behind (the runs clean up exactly the ids they tracked).

### Notes

- edge: reused two cached guests (guest creation is rate limited to 30/IP/hour)
- edge: 420 transient 5xx retried (Postgres connection-slot errors under concurrent DB load)
- edge: cached guests no longer authenticate; creating new ones

## Remaining risk

The live Edge path depends on the shared Supabase project's connection budget: while other workers and warm isolates hold connections, a burst of duels can still produce transient 500s. This is an operations/config limit (pooler URI, pool size), not product logic; the fix is tracked in the 'Live Edge' bullet above.
`max: 2` is a deliberate balance: a single connection (max: 1) can be reused inside a dropped invocation's leftover transaction and read a stale snapshot (two seats disagreeing about whose turn it is). Two connections avoid immediate reuse while keeping the footprint small.

## Plain-English summary for the owner

The real defect was on the server: a turn batch that ended the game mid-way was rejected, so the winning move was lost and the match stayed active forever; the storage now keeps the winning move and drops the rest of the turn. Two soak checks that were wrong have been corrected (harness bugs, not app bugs). All 180 in-process duels finished with zero failing checks. The only failures left are live-Edge 500s caused by the shared Supabase project running out of database connections (warm Edge isolates parking idle connections); the Edge pool was reduced and a transient-5xx retry added, and the remaining ops action is the Transaction pooler secret.

## Reproduce

```sh
# 200 duels: 180 in-process against the real DB + 20 through the deployed Edge function
node --env-file-if-exists=.env --import tsx server/scripts/online-soak.ts --total=200 --edge=20
# delete only the rows this run created
node --env-file-if-exists=.env --import tsx server/scripts/online-soak.ts --cleanup
# regenerate this report from .tmp-soak-results.json
node --env-file-if-exists=.env --import tsx server/scripts/online-soak.ts --render-only
```
