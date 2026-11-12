# Find opponent — parked search, honest computer fallback, timeout grace

> **Status pointer:** [`ONLINE.md`](ONLINE.md) is the index for the online-duels work.

Branch `futa0.5-online`. This document records (a) the queue design that is actually in the tree,
(b) the parked-search expiry and why, (c) the timeout-grace rule, and (d) the copy table for the
whole online flow so any line is a one-line change in `src/strings.ts`.

## 1. The queue design that exists

There is **no `matchmaking_queue` table**. The original plan mentioned one; it was never built.
Find Opponent reuses the `matches` table:

- `matches.open_queue boolean not null default false` — migration `0003_open_queue.sql`.
- Partial index `matches_open_queue_waiting_idx on (created_at) where status = 'waiting' and open_queue = true`.
- A parked search **is** a `waiting` open-queue match with one participant (the searcher).

Pairing is one atomic storage step, `Storage.claimOpenQueueOrPark`:

1. If an earlier search of the player has already been paired, the **active open-queue game** they
   are a seat of is returned (`paired: true, resumed: true`) and nothing is created. Without this
   a repeat Find (a second device, a reload, a re-entered screen) started a brand-new empty search:
   one device then waited in that new match while its opponent sat in the real one, both looking
   for an opponent forever (owner, 2026-11-12). Any leftover solo search of the same player is
   retired in the same step. A game that began as an **invite** is never resumed — an open invite
   must not stop a player meeting a stranger.
2. If the player already has a `waiting` open-queue match, it is returned as-is. A repeat tap can
   never create a second parked entry and can never pair a player with themselves.
3. The player's unfinished-match count is read in the same step. At
   `maxOpenMatchesPerPlayer` (10) the player may **not** join a fresh search or park: the call is
   refused with the friendly `TOO_MANY_MATCHES`. The cap never blocks step 1 or 4b below, which
   add no match.
4. Else the **oldest** `waiting` open-queue match with one free seat that the caller does **not**
   already share an open game with is claimed (FIFO, `FOR UPDATE SKIP LOCKED`), the joiner is
   seated and the match is activated — one step, so two simultaneous searchers can never both
   claim it and never both end up waiting. The one-game-per-pair rule is **pair-scoped**: an open
   game against a third party never blocks a search.
5. Else, if the only searcher waiting already **shares an open game** with the caller, that search
   is retired and the shared game is touched and returned to the caller (`continued: true`). The
   other page sees its search end and opens the same game, so a pair can never wait for each other
   forever and never gets a second game (owner, 2026-11-11).
6. Else the searcher is parked (a new `waiting` open-queue match, seat 0).

In Postgres the whole step runs inside a transaction holding
`pg_advisory_xact_lock(<constant>)`, which serialises every search across the shared pooler. In
`MemoryStorage` it is a synchronous critical section (Node is single-threaded), the same contract.

`POST /v1/matchmaking/cancel` retires a parked search (scoped `delete ... where id = $1 and status
= 'waiting'`, one participant) so no later searcher is ever matched into it.

## 2. Parked-search expiry

**The old "no heartbeat for 20 seconds = ignored" rule does not exist in the tree** (there is no
heartbeat, no ghost window and no test asserting one). It was a Phase 7 *plan* idea to avoid ghost
opponents. That goal is now **wrong**: a parked search is intentional and long-lived, so the player
must not be dropped.

The chosen window: **the existing waiting-match window, `waitingExpireMs` = 48 hours in
production** (`TURN_WAITING_EXPIRE_MS` is not a separate knob; it is the same 48h constant already
used for invite matches). A parked search *is* a `waiting` match, so reusing that window needs no
new number, no new index and no new failure mode, and it comfortably outlives any realistic
"nobody is on right now" gap while still eventually clearing an abandoned search. The atomic claim
step lazily finishes any parked search past its window before matching, so an expired search is
never joined.

## 3. Timeout grace (one grace per player per match)

The first time a seat misses its turn deadline it is **warned** and the deadline is **extended by
one full turn window** (`graceExtensionMs`, default = `TURN_TIMEOUT_MS` = 24h). A later miss by that
same seat finishes the match with the **unchanged** reason `timeout`.

- Tracked per seat on the match row: `grace_used_seat0`, `grace_used_seat1`, `grace_periods`,
  `grace_extension_ms` (migration `0004_timeout_grace.sql`, additive and idempotent; P-21 RLS +
  revoke + default-privileges guard).
- One decision point only: the existing `expiryDecision` used by lazy reads, the commit path and
  the sweeper. Extending from the **old** deadline makes a late sweep honest, and a second sweep is
  a no-op (idempotent).
- Grace is public state (`MatchListEntry` / `MatchSummary` / `MatchViewPayload`) and is announced on
  the existing status-change realtime ping path — never on a mid-turn action.
- Config: `TURN_GRACE_PER_PLAYER` (default 1; 0 disables grace) and `TURN_GRACE_MS`
  (default `TURN_TIMEOUT_MS`).

## 4. The honest computer fallback

A local game against the computer is offered from a long parked search (after `parkedOfferMs`,
default three minutes; `VITE_PARKED_OFFER_MS` shortens it in the e2e walk). It is **never** a
silent substitution:

- The offer names it plainly: **Play the computer** / **Invite a friend** / **Keep searching**.
- Choosing it starts the normal offline game (same engine, same save/Continue). A local game is
  **not** a server match, so it never consumes the 10-unfinished-games cap.
- The parked search **keeps running**. If an opponent arrives, the player gets a dismissible
  **Opponent found** prompt with **Play now** / **Later**; the offline game is never lost (Continue
  resumes it). Choosing Later leaves the online match waiting in the list with its correct
  turn/deadline state.
- Bots are never inserted into the matchmaking queue, and a queued match is never against a
  computer: the offer is the only place a bot can meet a queued player.

## 5. Copy table

All of these live in `src/strings.ts` (`ONLINE.*`). "Left alone" means the wording was already
punchy and was not churned.

| State | Old wording | New wording |
| --- | --- | --- |
| Search button | Find opponent | *left alone* |
| Searching (status) | Looking for an opponent… | Searching… |
| Search hint (title attr) | Pairs you with the next player who also taps Find opponent. | Matched with the next player who taps Find opponent. |
| Searching (screen title) | — | Finding an opponent |
| Searching (body) | — | You are in the queue. The duel opens the moment someone else joins. |
| Parked (screen title) | — | Nobody yet |
| Parked (body) | — | You stay in the queue. |
| Parked options | — | Play the computer · Invite a friend · Keep searching |
| Cancel (search) | Cancel match | Stop searching |
| Search stopped | — | Search stopped |
| Matched (title) | — | Opponent found |
| Matched (body) | — | Your duel is ready. |
| Matched actions | — | Play now · Later |
| Matched notice | — | Opponent found. |
| Matches heading | Your online matches | Your matches |
| Empty list | No online matches yet. | No matches yet. |
| Too many duels | You have too many open duels. Finish or cancel one first. | Too many open duels. Finish or cancel one first. |
| Waiting for a friend (title) | Waiting for a friend | *left alone* |
| Waiting body | Share this code. The duel opens when they join. | *left alone* |
| Invite expiry | Invite expires in 48 hours. | *left alone* |
| Join title / prompt / submit | Join a duel / Enter the invite code / Join | *left alone* |
| Your turn / Their turn / Waiting / In play / Finished | — | *left alone* |
| Grace: your warning | — | Time ran out — one more chance |
| Grace: yours spent (list) | — | Grace used |
| Grace: opponent spent (list) | — | Opponent used their grace |
| Grace (screen reader) | — | Time ran out. One more chance. / Your opponent used their grace. / You used your grace. |

Outcomes (**You won / You lost / Draw**) and reasons (**surround / score / deck end / timeout /
resigned**) are deliberately unchanged. No emoji anywhere.

## 6. Evidence

- `server/tests/find-opponent-parking.test.ts` — parking persists past 20s, FIFO with 3 parked,
  no self/double (incl. concurrent double-tap), never a second parked entry, cap refusal, atomic
  one-match race, matched-while-away list state/deadline/ping, cancel, rate limits.
- `server/tests/find-opponent-shared-pair.test.ts` — two searchers who already share a game continue
  that game (also at the open-match cap), a player with a game against a third party still pairs
  with a fresh stranger (both tap orders), two strangers pair, and a repeated Find (twice or three
  times parked, and again after both seats were paired) always returns the SAME game — never a
  second empty search (the owner's reports).
- `server/tests/matchmaking-hardening.test.ts` — Stop searching still works after Find resumes
  spend the join budget; cancel→find→cancel never doubles a player's queue rows; a paired result
  is two distinct human seats; expired parked searches stay unclaimable.
- `server/tests/timeout-grace.test.ts` — first miss extends, second loses, per-seat independence,
  idempotency (lazy read racing the sweeper), clock semantics, grace disabled.
- `server/tests/postgres.integration.test.ts` — real DB: two simultaneous searchers → exactly one
  active match; cancel; grace extend→finish; anon denied on the queue rows.
- `web/e2e/online-find-opponent-states.ts` — real browser: searching → parked offers → live pairing
  → play-the-computer → Opponent found → Play now, with screenshots in `docs/screens/online/`.
