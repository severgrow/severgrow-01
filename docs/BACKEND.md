# Futasaku 0.5 — backend foundation

Status: **verified against the live Supabase database** (unit + real-HTTP + real-database
integration). Not yet deployed, and not yet wired into the game UI. See
[`DATABASE-VERIFICATION.md`](DATABASE-VERIFICATION.md) for the evidence.

This document says exactly what works, what is unfinished, and what must happen before real
players are invited. The design follows [`NETWORK-CONTRACT.md`](NETWORK-CONTRACT.md) (the wire
contract) and [`SERVER-CORE.md`](SERVER-CORE.md) (the world/reward boundary). The game itself is
unchanged: the server imports the same `src/engine/` rules the browser uses.

## What this is

A minimal, server-authoritative backend for 1v1 duels, plus the first vertical slice:

1. Guest A creates a match and gets a private invite code.
2. Guest B joins with that code.
3. Both receive their **own** player view (never the opponent's hand or the deck).
4. The player to act submits a **semantic action** (the same `Action` the engine defines).
5. The server validates it through the shared engine, commits it, and persists it.
6. Both players receive their updated views.
7. A page refresh reconnects from the stored session and reconstructs the match.

## Layout

```
server/src/config.ts             server settings (rules version, limits, CORS)
server/src/errors.ts             stable API error codes + HTTP statuses
server/src/ids.ts                ids, bearer tokens (hashed at rest), invite codes, seeds
server/src/protocol.ts           the wire format shared by server and client
server/src/service.ts            identity, match lifecycle, the action pipeline
server/src/http.ts               the HTTP routes (thin: parse → auth → service → JSON)
server/src/client.ts             typed isomorphic client + local session (refresh/resume)
server/src/storage/types.ts      the Storage port and its atomicity contract
server/src/storage/memory.ts     in-memory adapter (dev/tests)
server/src/storage/postgres.ts   Postgres/Supabase adapter (transactional)
server/src/storage/pg-pool.ts    one place that builds the pool + TLS from DATABASE_URL
server/src/index.ts              entry point (DATABASE_URL → postgres, else memory)
server/migrations/0001_init.sql  the schema, with Row Level Security
server/scripts/migrate.ts         versioned, checksummed migration runner
server/scripts/smoke.ts          manual end-to-end smoke against a running server
server/tests/                    the test suite for all of the above
```

## Running it

Secrets live in a git-ignored `.env` (start from `.env.example`). The npm scripts load it via
Node's `--env-file-if-exists`, so no extra dependency is needed.

```sh
cp .env.example .env          # then paste your Supabase connection string into DATABASE_URL
npm run server:migrate        # apply server/migrations/*.sql (idempotent, checksummed)
npm run server:dev            # in-memory storage
npm run server:dev            # with DATABASE_URL set → Postgres/Supabase
npm run server:db-test        # real-database integration tests (skipped without DATABASE_URL)
npm run server:smoke          # end-to-end smoke against a running server
```

Because the engine is shared, the server needs no build step to run under `tsx`.

## Supabase setup

1. **Create the project** (Supabase dashboard). Note its region.
2. **Get the connection string:** *Project Settings → Database → Connection string*.
   - **Session pooler** (port `5432`) or **Direct connection** — use this for migrations and tests.
   - The **Transaction pooler** (port `6543`) is fine at runtime but not for DDL.
   - Use the **database password** (not the `anon`/`service_role` API keys). This is a real secret.
3. **Put it in `.env`** (git-ignored) as `DATABASE_URL=…`, with **no `?sslmode=…` query flag**.
   Never commit it, never paste it into a chat or an issue.
4. **Apply the schema:** `npm run server:migrate`. `--status` shows what is applied/pending;
   `--dry-run` lists without changing anything.
5. **Verify:** `npm run server:db-test` (integration), `npm run server:smoke` (end-to-end), or both
   at once with `npm run server:verify`.

TLS is automatic: any non-localhost host gets TLS with `rejectUnauthorized: false` (the pragmatic
managed-host default). Do **not** append `?sslmode=require`: current node-postgres treats that flag
as an alias for `verify-full`, which demands a full certificate chain and will fail on the pooler.
For genuine chain verification, install the provider's CA and set `PGSSL=verify-full`.

**RLS note:** the API server must connect as the database owner/superuser (what the password above
gives you). The migration enables RLS and revokes `anon`/`authenticated`, and the integration suite
asserts those roles are denied. Do **not** point the server at a role that only has the `anon` or
`authenticated` privileges.

## Endpoints

All responses are JSON. Authenticated routes require `Authorization: Bearer <token>`.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/v1/health` | liveness + the pinned rules version |
| POST | `/v1/guests` | create a guest identity → `{ player, token }` (token shown once) |
| POST | `/v1/players/me/upgrade` | upgrade a guest to a permanent account (keeps the id) |
| POST | `/v1/matches` | create a match → `{ match: { inviteCode, … }, player: view }` |
| POST | `/v1/matches/join` | join by `{ inviteCode }` → `{ match, player }` |
| GET | `/v1/matches/:id` | match summary (public: status, revision, seats) |
| GET | `/v1/matches/:id/view?since=N` | the caller's player view (+ events after revision N) |
| POST | `/v1/matches/:id/reconnect` | same, by `{ sinceRevision }` — used after a refresh |
| POST | `/v1/matches/:id/actions` | submit `{ expectedRevision, requestId, action }` |

A **player view** contains: the engine `View` (`viewFor(state, seat)`), the seat, the public turn
and status, the legal actions (only when it is that seat's turn), and the public-safe events. It
never contains the seed, the deck, either full hand, `fruitKnown`, the event history internals, or
the authoritative `State`.

## The action pipeline (exactly once)

```
receive { expectedRevision, requestId, action }
  → authenticate the bearer token to a player
  → resolve the seat from match_participants (never from the request)
  → if requestId already applied → return the stored outcome (no re-apply)
  → if expectedRevision ≠ match.revision → 409 STALE_REVISION
  → engine: applyAs(state, seat, action)  ← the single source of gameplay truth
  → revision += 1, persist the move + the new state atomically
  → return the caller's new view; the opponent sees it on their next fetch
```

Guarantees:

- **Exactly once.** `match_moves` has `unique (match_id, request_id)`; a duplicate returns the
  recorded move. A *different* player reusing a request id is refused (`REQUEST_ID_CONFLICT`).
- **No lost updates.** The `revision` must match; the Postgres adapter takes `SELECT … FOR UPDATE` on the
  match row for the whole check-and-write, so two racing submissions cannot both advance.
- **No forged seats.** The seat always comes from the database for the authenticated player.
- **One rules interpretation.** Legality, resulting state, score, turn, winner and the starting
  seat all come from `src/engine/` — the same code the browser runs.

## Identity and accounts

Guests get an opaque token (32 random bytes, base64url). Only `sha256(token)` is stored, so a
database leak cannot be replayed as a token. `player_tokens.revoked_at` supports future revocation.
`players.kind` moves `guest → account` on upgrade; the player id, its matches and its history are
preserved, so attaching real credentials later is additive.

## Hidden information

The server only ever sends projections:

- the board, terrain, discard pile, deck **count**, the opponent's hand **count**, scores, the
  current turn/phase and the public result — all public;
- the viewer's own hand and deadwood — private to that viewer;
- events filtered by the engine's single rule `hidePrivateEvents` (the opponent's deck draws hide
  the card), which the local game also uses (`eventsFor`).

Tests fail if any of the seed, the deck order, either hand, `fruitKnown` or an internal history
field appears in a payload, and if any card id the viewer may not know is present.

## Database and RLS

`server/migrations/0001_init.sql` creates `players`, `player_tokens`, `matches`,
`match_participants` and `match_moves`. `matches.state` is the authoritative state (server-only).
Row Level Security is **enabled on every table with no anon/authenticated policies**, and all table
privileges are revoked from those roles: only the API server's service role can read. `matches`
stores the immutable `rules_version`, `seed`, `config` and `starting_player`, so a match is always
replayed under the rules that created it.

`revision` on `matches` is the head; each `match_moves` row records the revision it produced, which
is why the moves table *is* the revision history and the idempotency record.

> **Security note (load-bearing).** Supabase's default privileges grant `anon` and `authenticated`
> full read/write on every new table in `public`. The `revoke all … from anon, authenticated` block
> in the migration is therefore **not cosmetic**: without it, `matches.state` (the whole deck and
> both hands) would be readable through Supabase's public API. The server's role owns the tables and
> has `bypassrls = true`, so it is unaffected. The integration suite proves the denial with a real
> `set role anon; select * from matches` that must fail with `42501`. Expect an informational
> `rls_enabled_no_policy` advisor lint — that is intentional.

## Test results

| Suite | Result |
| --- | --- |
| `server/tests/service.test.ts` | 20 tests: identity, joining, views, actions, idempotency, stale revisions, racing submissions, a full game to a finished result |
| `server/tests/http-e2e.test.ts` | 4 tests: the whole vertical slice over real HTTP with two clients + refresh/reconnect, auth failures, error codes, card-reconstruction |
| `server/tests/http.test.ts` | 8 tests: preflight/CORS, security headers, malformed and oversized bodies, missing bodies, 404s without internals, auth required on every match route, precise field validation, and that logs never contain tokens or bodies |
| `server/tests/postgres.test.ts` | 11 tests: row mapping, the transactional statement sequence, rollback on every rejection, idempotent replay, duplicate invite code (recording fake pool) |
| `server/tests/postgres.integration.test.ts` | **17 tests against the real database** (skipped unless `DATABASE_URL` is set): schema/constraints, migration idempotency+checksums, RLS everywhere, `anon`/`authenticated` denial, token-hash-only storage, persistence across a brand-new pool, a two-guest create/join/play slice, DB-level idempotency, racing transactions, ten-way retry storm, rollback, leak checks |
| `server/tests/migrate.test.ts` | migration runner: order, one transaction per migration, idempotency, checksum refusal, rollback, dry-run |
| `server/tests/pg-pool.test.ts` | TLS decisions, env handling, password redaction |
| `server/tests/client.test.ts` | 6 tests: request shape, bearer header, `since` handling, error mapping, session persistence/resume |
| `server/tests/engine-events.test.ts` | 3 tests: `hidePrivateEvents` ≡ `eventsFor` across real games |
| `server/tests/migration.test.ts` | 6 tests: tables, RLS everywhere, hashed tokens, immutable fields, idempotency key |

`vitest.config.ts` loads `.env` when it exists, so the real-database suite **runs** locally; in CI
there is no `.env`, so it skips and is pinned separately by `npm run server:db-test`. A manual smoke
script (`npm run server:smoke`, 14 checks) exercises a live deployment and reuses the same client
the browser will use.

The rest of the project's suite is unchanged and must stay green (see the final report).

## What is NOT built (on purpose or unfinished)

Deliberately out of scope, per the brief: accounts with credentials/OAuth, matchmaking, clans, XP,
world-map functionality, ranked play, and any game-mechanic change.

Unfinished / next:

1. **Live database run.** See the "Supabase setup" section and `docs/DATABASE-VERIFICATION.md`
   for exactly what has been verified against the real project.
2. **No push transport.** Clients poll (`/view?since=`). The contract's realtime step needs SSE or
   WebSocket on top of the same pipeline.
3. **No client UI wiring.** `server/src/client.ts` is ready and tested, but the game screen does not
   yet create/join a duel. Solo play is untouched.
4. **No rate limiting or abuse controls.** Nothing stops rapid guest creation or invite-code
   guessing; add per-IP/per-token limits and rotate codes.
5. **CORS is `*` by default** for local development. Production must set `CORS_ORIGIN`.
6. **No TLS termination** here (a deployment concern). Tokens are bearer tokens: HTTPS is required.
7. **No observability** beyond one line per request (method, path, status, duration). No metrics,
   tracing or alerting; logs never contain bodies or tokens.
8. **No cleanup jobs** for abandoned guest accounts or waiting matches.
9. **Reconnect returns only the view + events**, not a replay of the opponent's last turn visuals.

## Before inviting real players

1. Postgres (Supabase) with the migration applied; the adapter exercised against it in CI.
2. TLS + a locked-down `CORS_ORIGIN`; rotate the service-role key.
3. Rate limits on `/v1/guests`, `/v1/matches/join` and `/v1/matches/:id/actions`.
4. A decision on the live transport (SSE/WebSocket) and reconnect behaviour under it.
5. The client duel screen wired to `DuelClient` behind a feature flag, with solo play unchanged.
6. Monitoring (error rate, revision conflicts, match completion) and a cleanup job.
