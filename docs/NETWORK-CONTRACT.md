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

## Abuse controls (rate limiting)

Rate limiting is part of the contract because it shapes what a legitimate player can do:

- **Per-IP limits are NAT-friendly.** A household, cafe, office or mobile carrier puts several real
  players behind one public IP, so per-IP caps must be generous enough for normal play for hours.
  The server derives that IP from `cf-connecting-ip` (Cloudflare-protected), then `x-real-ip`, then
  the leftmost *public* `x-forwarded-for` entry — never a shared/`unknown` bucket for real clients.
- **Per-player limits are the real anti-abuse control.** They are keyed by the player's own token,
  so they cannot be shared or pooled between players, and they stay tight.
- **Over-limit responses** are `429 RATE_LIMITED` with the same friendly message for every bucket.
- Exact defaults, bucket names and the `RATE_*` / `SWEEP_CRON_TOKEN` environment variables are
  documented in [`BACKEND.md`](BACKEND.md#rate-limits-nat-friendly).

## What this pass does NOT do

No accounts, database, matchmaking, WebSockets/realtime, world-map UI, clans or progression.
Sections 9 and 10 keep the existing `server-core` groundwork and the reward/world boundary
documented in `docs/SERVER-CORE.md`.

## Live duels (test channel; `docs/LIVE.md`)

Same bearer auth, headers, error shape (`{ ok:false, code, message }`) and rate-limit rules as above.
Routes live in their own router (`server/src/live/router.ts`).

| Method | Path | Body | Returns |
| --- | --- | --- | --- |
| POST | `/v1/players/me/presence` | `{ status: idle\|offline_game\|in_match\|in_live\|tutorial, matchId? }` | `{ status }` — heartbeat every 20 s while visible; older than 45 s = offline |
| PATCH | `/v1/players/me` | `{ liveChallengesEnabled: boolean }` | `{ liveChallengesEnabled }` (a `displayName` body still goes to the rename route) |
| GET | `/v1/players/me/challenges` | — | `{ incoming[], outgoing[], liveMatchId, challengesEnabled }` — the polling fallback (every 4 s while visible) |
| GET | `/v1/matches/:id/live` | — | `{ live: LiveStatus }` — also the lazy clock check for that match |
| POST | `/v1/matches/:id/live/challenge` | `{ kind?: 'live' \| 'rematch' }` | `{ challenge, liveMatchId }` (`liveMatchId` set when a mutual challenge became the accept) |
| POST | `/v1/challenges/:id/accept` · `/decline` · `/cancel` | `{}` | `{ challenge, liveMatchId? }` |
| POST | `/v1/matches/:id/live/leave` | `{}` | `{ live: LiveStatus }` |

**Challenge payload (hidden-information audit):** `id, matchId, kind, fromName, toName, fromMe,
limitMs, status, createdAt, expiresAt, newMatchId` — names and ids only, tested.

**Realtime hint:** broadcast event `challenge` on channel `player:<playerId>` with ONLY
`{ challengeId, fromName, kind }`. It means "poll now"; the data always comes from the authenticated
GET. A failed publish never fails the request.

**Stable error codes:** `BUSY_LIVE`, `BUSY` (tutorial), `NOT_AVAILABLE`, `OFFLINE`, `COOLDOWN`,
`TOO_MANY_PENDING`, `RATE_LIMITED`, `CHALLENGE_NOT_FOUND`, `CHALLENGE_CLOSED`, `NOT_LIVE`,
`MATCH_NOT_ACTIVE`, `TOO_MANY_MATCHES`.

**Clock:** the live clock reuses `turnDeadlineAt` (already in every view). Timeouts are decided at
the same lazy points as 24-hour deadlines (every read/write of the match, plus the sweeper); the
timed-out turn is committed through the normal move pipeline with request id `live-auto-<revision>`,
so both players see it as an ordinary turn (turn-gated, private draw hidden).
