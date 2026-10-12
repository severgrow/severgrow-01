# Futasaku PvP network contract

> **Status:** implemented for the vertical slice. See [`BACKEND.md`](BACKEND.md) for the actual
> endpoints, the storage schema, the security model and what is still unfinished. This document
> remains the contract the implementation follows.

This is the minimum contract the future server-authoritative PvP layer will use. It defines the
boundary now so the backend can be built without re-litigating the game underneath it. **No
networking is implemented in this pass.**

## Principles

1. **One engine, two callers.** The server and the client run the same `src/engine/` rules. There
   is no second implementation of legality, scoring, turns or ending.
2. **Semantic actions only.** Clients never send board/state; they send intent (`Draw`, `Bloom`,
   `Sprout`, …) exactly as the engine's `Action` type defines it. The server re-validates every
   action with `legalActions(viewFor(state, seat))` before applying it.
3. **Server owns the seed.** The deal follows from the match seed, so the server chooses it
   (never the client). This is already the rule for game tickets (`issueTicket`).
4. **One authoritative start.** The engine decides the starting seat from the seed
   (`startingPlayerFor` / `matchSetup`); client and verifier agree by construction.
5. **Safe views only.** A client ever receives only `viewFor(state, seat)` data plus
   player-filtered events (`eventsFor`). Never the full `State`.
6. **Exactly once.** Every submission carries a `requestId`; duplicates return the stored result
   instead of applying the move twice.
7. **Revisioned.** Every accepted change increments a monotonic `matchRevision`; a submission
   names the revision it expects so stale or replayed requests are rejected.

## Messages

| Message | Direction | Payload |
| --- | --- | --- |
| `CREATE_MATCH` | client → server | `{ rulesVersion?, seatCount: 2 }` |
| `MATCH_CREATED` | server → client | `{ matchId, rulesVersion, seed, config, startingPlayer, revision: 0, seats }` |
| `JOIN_MATCH` | client → server | `{ matchId, playerId }` |
| `MATCH_JOINED` | server → client | `{ matchId, seat, revision, view, legalActions }` |
| `GET_PLAYER_VIEW` | client → server | `{ matchId, seat }` |
| `PLAYER_VIEW` | server → client | `{ matchId, revision, view, legalActions, events }` |
| `SUBMIT_ACTION` | client → server | `{ matchId, seat, expectedRevision, requestId, action }` |
| `ACTION_ACCEPTED` | server → client | `{ matchId, revision, events }` |
| `ACTION_REJECTED` | server → client | `{ matchId, revision, code, reason }` |
| `STATE_UPDATED` | server → client (broadcast) | `{ matchId, revision, view, events }` |
| `RECONNECT` | client → server | `{ matchId, playerId, sinceRevision? }` |
| `RECONNECTED` | server → client | `{ matchId, seat, revision, view, legalActions, events }` |
| `MATCH_FINISHED` | server → client | `{ matchId, revision, result, verified }` |

`view` is `viewFor(state, seat)` (see the leak audit): public fields plus the seat's own hand and
deadwood. `events` is `eventsFor(state, seat)` sliced from the caller's last seen length.

## The authoritative action payload

```
{
  matchId: string,
  seat: 0 | 1,            // the sender's seat, checked against the connection's identity
  expectedRevision: number,
  requestId: string,      // idempotency key, chosen by the client (uuid)
  action: Action          // a semantic engine action, e.g. { t: 'Bloom', cards: [...], hexes: [...] }
}
```

The server **must not** accept board state, scores, results or card identities from the client.

## Server pipeline (once)

```
receive SUBMIT_ACTION
  → authenticate the connection and map it to `seat`
  → if requestId already applied: return the stored ACTION_ACCEPTED/REJECTED (no re-apply)
  → if expectedRevision ≠ matchRevision: reject (stale)
  → if seat ≠ state.actor: reject NOT_ACTOR
  → validate action with shared engine (legalActions / apply, catching IllegalActionError)
  → apply exactly once
  → matchRevision += 1
  → persist (state + revision + requestId record) atomically
  → return ACTION_ACCEPTED + events, and broadcast STATE_UPDATED with each seat's own view
```

Validation uses the same stable codes the engine throws (`NOT_ACTOR`, `WRONG_PHASE`,
`CARD_NOT_IN_HAND`, …), so rejections are precise and testable.

## Idempotency

A duplicate network submission must never apply a move twice. Keep a per-match record of
`requestId → { revision, outcome }` (or store the `requestId` on the accepted revision). On a
repeat, return the recorded outcome. `expectedRevision` guards the related case where two *different*
requests race for the same turn.

## Reconnect

`RECONNECT` returns the seat, the current revision, a fresh safe `view`, `legalActions`, and every
event since `sinceRevision` (or the full filtered history). Nothing hidden is ever resent.

## Rules version

Every match record stores the exact rules version that created it (Section 11). A server must never
silently reinterpret an old match under new rules — it replays it with the stored `rulesVersion`
through `rulesConfig()`.

## What this pass does NOT do

No accounts, database, matchmaking, WebSockets/realtime, world-map UI, clans or progression.
Sections 9 and 10 keep the existing `server-core` groundwork and the reward/world boundary
documented in `docs/SERVER-CORE.md`.
