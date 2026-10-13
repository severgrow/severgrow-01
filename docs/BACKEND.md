# Futasaku 0.5 — backend foundation

Status: **Phase 3 client layer ready** (`web/src/online/`: identity, sync, draft, OnlineDriver).
Phase 2 live against Supabase (deadlines, turn-gated views, batch submit, resign, match list,
link codes, Postgres rate limits, sweeper). Edge API from Phase 1. No duel screens yet (Phase 4+).
See [`ONLINE-PLAN.md`](ONLINE-PLAN.md) and [`DATABASE-VERIFICATION.md`](DATABASE-VERIFICATION.md).

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
server/src/config.ts             server settings (rules version, limits, CORS, env overrides)
server/src/client-ip.ts          trustworthy client-IP derivation behind the proxy
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
server/migrations/0005_keepalive_cron.sql  Supabase-native keep-alive + sweeper (pg_cron + pg_net)
server/migrations/0006_live_duels.sql  live duels: challenges, live clock columns, presence (RLS, revoked)
server/src/live/                  live duels (test channel) — see docs/LIVE.md
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

## Rate limits (NAT-friendly)

Limits are Postgres-backed counters keyed by a **bucket string** (`rate_limits(bucket, window_start,
count)`). The service derives the key from the bucket type plus either the authenticated player id
or the client IP.

**How the client IP is derived** (`server/src/client-ip.ts`). Behind Supabase Edge a request passes
through Cloudflare and the runtime proxy, so the header order matters:

1. `cf-connecting-ip` — Cloudflare sets this to the real client; a forged value is rejected with
   HTTP 403, so it cannot be spoofed. Preferred.
2. `x-real-ip`.
3. The leftmost **valid public** entry of `x-forwarded-for`. The Supabase Edge proxy *replaces* this
   header, so the leftmost entry is the client and a client-sent value never survives. Private /
   loopback / benchmark hops (e.g. the internal `198.19.9.x` seen in production) are skipped so one
   proxy hop cannot collapse unrelated players into a single bucket.
4. If only private candidates exist, the first valid one is used (an internal caller still gets its
   own bucket).
5. Otherwise `null`, which the service buckets as `unknown`.

Verified against the live Edge: a request with no forwarding headers was bucketed under the caller's
public IP, and a spoofed `x-forwarded-for` was ignored — so per-IP bucketing really isolates
players. The worldwide-shared-`unknown` bucket only affects in-process/cron callers that pass no IP.

Per-IP limits are deliberately loose because a **household, cafe, office or mobile carrier NAT**
shares one public address. The **per-player** limits are the real anti-abuse control: they are keyed
by the player's own token, so players cannot share or pool them. The 10-open-matches-per-player cap
is unchanged. Invite codes are now **4 characters** (see [Invite codes](#invite-codes)).

| Bucket (default window) | Default | Environment variable |
| --- | --- | --- |
| Guest creation, per IP per hour | `200` | `RATE_GUEST_PER_IP_PER_HOUR` |
| Match join, per **player** per hour | `60` | `RATE_JOIN_PER_PLAYER_PER_HOUR` |
| Match join, per IP per hour | `400` | `RATE_JOIN_PER_IP_PER_HOUR` |
| Link-code creation, per player per hour | `10` | `RATE_LINK_CODE_PER_PLAYER_PER_HOUR` |
| Link-code redeem, per IP per hour | `20` | `RATE_LINK_REDEEM_PER_IP_PER_HOUR` |
| Actions, per player per minute | `120` | `RATE_ACTIONS_PER_PLAYER_PER_MINUTE` |
| Sweep, per IP per hour | `120` | `RATE_SWEEP_PER_IP_PER_HOUR` |
| Cron sweep token (`x-futasaku-cron`) | unset | `SWEEP_CRON_TOKEN` |

Every limit is overridable at runtime by the environment variable above (read through
`readEnv` in `server/src/config.ts`, which checks `process.env` then `Deno.env`), so the live Edge
function can be tuned without a code change. Defaults are the safe values above.

**Sweeping.** `POST /v1/sweep` is meant to run from cron/CI, not from players. When the
`SWEEP_CRON_TOKEN` secret is set and the caller sends the matching `x-futasaku-cron` header, the
sweep uses the dedicated `sweep:internal` bucket, so a player's per-IP budget (or a shared
`unknown` bucket) can never starve routine housekeeping. It is still rate limited. Without the token
the ordinary `sweep:ip:<ip>` bucket applies.

## Invite codes

A code is **4 characters** of Crockford base32 (`0123456789ABCDEFGHJKMNPQRSTVWXYZ` — no `I`, `L`,
`O` or `U`), i.e. 32⁴ = 1,048,576 possibilities, generated server-side by `newInviteCode`. The
length has **one home**: `INVITE_CODE_LENGTH` in `src/invite-code.ts`, which the server re-exports as
`config.inviteCodeLength` and which the player-facing format hint (`ONLINE.errCodeFormat` in
`src/strings.ts`) derives from — so the copy and the generated codes can never drift. The client
accepts any 4–16 uppercase alphanumerics and the join lookup normalises case, spaces and dashes, so
it needs no change when this value moves.

**Codes are permanent.** `matches.invite_code` is `not null unique`, and that unique index spans
every match ever created — a finished duel never releases its code, so the usable pool only shrinks
as the game grows. Short codes are therefore only safe together with the bounded retry below; code
recycling is deliberately out of scope (do not make the index partial).

**Safe generation (bounded retry, P-13).** Both paths that create a match — `createMatch` (invite)
and the parked Find-Opponent path (`findOpponent` → `claimOpenQueueOrPark`) — generate a *fresh*
code and retry up to `MAX_INVITE_CODE_ATTEMPTS` (5) times when the insert fails with a **genuine**
unique violation on `matches.invite_code`. The Postgres adapter reports `DUPLICATE_INVITE_CODE` only
for a `23505` whose constraint is `matches_invite_code_key` (the memory adapter checks its own invite
index), so an unrelated failure is never swallowed and never retried. After the last attempt the
caller gets a friendly `INTERNAL` error, and because each insert is a single statement there is no
partial row. A warning is logged only when a retry actually happens, and the code itself is never
logged, so the collision rate is observable.

**Existing codes keep working:** lookup is by value, not length, so a code created before this
change (for example 8 characters) still resolves and joins. **Path to longer codes later:** raise
`INVITE_CODE_LENGTH` in `src/invite-code.ts` — that one constant feeds both the server config and
the player-facing hint.

## Device link codes (different from invite codes)

A link code (the Settings **"Use my matches on another browser"** path) is **NOT** an invite code,
and the two must never share a length:

| | Match invite code | Device link code |
| --- | --- | --- |
| Length | `INVITE_CODE_LENGTH` = **4** | `LINK_CODE_LENGTH` = **8** |
| Server config | `config.inviteCodeLength` | `config.linkCodeLength` |
| Harm if guessed | A stranger joins somebody's private duel — low | **A new token for another player** — full account takeover, and every match they own — high |
| Read aloud? | Yes (shared, typed on another device) | No (generated and entered once, same device, by copy/paste) |

Both lengths have **one home** each in `src/invite-code.ts`; `server/src/config.ts` re-exports them
as `inviteCodeLength` / `linkCodeLength`, and the player-facing hints (`ONLINE.errCodeFormat`,
`ONLINE.linkCodeHelp`) derive from the same constants. Shortening link codes buys nothing — there is
no readability use case — so link codes stay long. `createLinkCode` generates
`newInviteCode(config.linkCodeLength)` (Crockford base32) and `redeemLinkCode` normalises and hashes
the typed code; redemption is single-use and rate limited per IP (`linkRedeemPerIpPerHour`), and
creation is rate limited per player (`linkCodePerPlayerPerHour`).

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
`match_participants` and `match_moves`. Migration `0002_deadlines_lists.sql` adds turn deadline /
gated-view columns, `rate_limits`, and `device_link_codes`, plus
`alter default privileges … revoke` for future tables (P-21). Migration
`0005_keepalive_cron.sql` adds the scheduled keep-alive/sweeper job (below) and re-issues the same
guard. `matches.state` and
`matches.turn_start_state` are authoritative (server-only). Row Level Security is **enabled on
every table with no anon/authenticated policies**, and all table privileges are revoked from those
roles: only the API server's service role can read. Do **not** add these tables to the
`supabase_realtime` publication — live pings use broadcast channels, not table replication.
`matches` stores the immutable `rules_version`, `seed`, `config` and `starting_player`, so a match
is always replayed under the rules that created it.

`revision` on `matches` is the head; each `match_moves` row records the revision it produced, which
is why the moves table *is* the revision history and the idempotency record.

> **Security note (load-bearing).** Supabase's default privileges grant `anon` and `authenticated`
> full read/write on every new table in `public`. The `revoke all … from anon, authenticated` block
> in the migration is therefore **not cosmetic**: without it, `matches.state` (the whole deck and
> both hands) would be readable through Supabase's public API. The server's role owns the tables and
> has `bypassrls = true`, so it is unaffected. The integration suite proves the denial with a real
> `set role anon; select * from matches` that must fail with `42501`. Expect an informational
> `rls_enabled_no_policy` advisor lint — that is intentional.

## Keep-alive (pg_cron + pg_net)

Migration `0005_keepalive_cron.sql` enables `pg_cron` + `pg_net` and schedules one job,
`futasaku-keepalive`, at `17 6 */2 * *` (06:17 UTC every 2 days) as the `postgres` role. Each run
does a **real database round trip** (`GET /v1/health?db=1` → `service.pingStorage()`) — which is what
resets the free project's ~1 week inactivity clock — and then `POST /v1/sweep` so overdue matches
and expired waiting matches are finished without a client visiting. This replaces the inert GitHub
Actions workflow (`futa05-keepalive.yml`), which could never fire because it was never on the
default branch; the workflow file was deleted.

Full operator guide (inspect, pause, resume, change cadence, free-tier reasoning) is in
[`DEPLOY-ONLINE.md`](DEPLOY-ONLINE.md#keep-alive-p-2--supabase-native-no-github). In short:
`select * from cron.job;`, `select * from cron.job_run_details order by start_time desc;`, and
`select * from net._http_response order by created desc;`.

**Security (P-21 adjacent).** `pg_net` makes OUTBOUND HTTP from the database, so anon/authenticated
must not reach it.
- `cron` schema: anon and authenticated have no `USAGE`, so `cron.job`, `cron.job_run_details` and
  `cron.schedule()`/`unschedule()` are refused with `42501` (proved with a real `set role` in
  `server/tests/postgres.integration.test.ts` and `npm run server:verify-security`).
- `net` schema: owned by `supabase_admin`; anon/authenticated hold PUBLIC grants but are non-login
  roles and the Data API exposes only `public`, so `net.http_get`/`http_post` and
  `net._http_response` are unreachable through the API. This is Supabase's documented platform
  constraint — `postgres` cannot revoke those grants (a no-op) and removing them outright would
  break pg_net. `verify-security.ts` proves the reachable denial live with the anon key
  (`POST /rest/v1/rpc/http_get` → `PGRST202`, `GET /rest/v1/_http_response` → `PGRST205`).
- The job sends no auth header, so its request queue holds only the public URL and an empty body.

## Live duels (test channel)

`server/src/live/` adds challenges, presence and a short per-turn clock on the SAME match. It wraps
the Storage port (`liveAwareStorage`) so the live clock is decided at the same lazy points as the
24-hour deadline; the base expiry decision skips rows the live layer owns (`liveManaged`). Migration
`0006_live_duels.sql` follows the 0002 lock-down: RLS on, anon/authenticated revoked (proved with a
real `set role` in `server/tests/live-postgres.integration.test.ts`), nothing in the realtime
publication, one pending challenge per match enforced by a unique partial index. Endpoints and
tuning: [`LIVE.md`](LIVE.md), [`NETWORK-CONTRACT.md`](NETWORK-CONTRACT.md#live-duels-test-channel-docslivemd).

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
| `server/tests/phase6-hardening.test.ts` | Phase 6: leak-key audit, turn-gated Draw privacy, concurrent STALE_REVISION 409 + refetch, viewPayload load p95, short action burst |
| `web/e2e/online-duel-two-browser.ts` | Phase 6: two Chromium contexts, local API + preview, create/join, Me/Opponent HUD, resign → finished on both |
| `server/tests/phase7-matchmaking.test.ts` | Phase 7: open-queue create + pair; invite matches stay out of the pool |
| `server/tests/client-ip.test.ts` | client-IP derivation: `cf-connecting-ip` precedence, `x-real-ip`, `x-forwarded-for` leftmost public pick, private-hop skipping, malformed/`unknown` fallbacks, private-range classification |
| `server/tests/rate-limit-nat.test.ts` | NAT/shared-IP regression: two players behind one IP create + join; a single IP still blocked above the new ceiling; per-player limits trip independently of IP; distinct forwarded IPs get distinct buckets; `cf-connecting-ip` beats a spoofed `x-forwarded-for`; cron sweep uses its dedicated bucket |
| `docs/ONLINE-REPORT.md` | Phase 8 final report (P-1…P-21) |

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
4. **Rate limits are in Postgres** (guest/join/actions/link/sweep), now NAT-friendly and
   env-tunable — see [Rate limits (NAT-friendly)](#rate-limits-nat-friendly). Defaults are safe;
   adjust with the `RATE_*` environment variables if a deployment needs different caps.
5. **CORS is `*` by default** for local development. Production must set `CORS_ORIGIN`.
6. **No TLS termination** here (a deployment concern). Tokens are bearer tokens: HTTPS is required.
7. **No observability** beyond one line per request (method, path, status, duration). No metrics,
   tracing or alerting; logs never contain bodies or tokens.
8. **Sweeper exists and now runs itself** (`POST /v1/sweep`): timeouts, waiting expiry, stale
   guests. Migration `0005_keepalive_cron.sql` schedules it from inside the database (pg_cron every
   2 days, together with a `GET /v1/health?db=1` round trip that keeps the free project awake) — see
   [Keep-alive](#keep-alive-pgcron--pgnet). Make it more frequent with `cron.alter_job` if wanted.
9. **Reconnect returns only the view + events**, not a replay of the opponent's last turn visuals.

## Before inviting real players

1. Postgres (Supabase) with the migration applied; the adapter exercised against it in CI.
2. TLS + a locked-down `CORS_ORIGIN`; rotate the service-role key.
3. Rate limits on `/v1/guests`, `/v1/matches/join` and `/v1/matches/:id/actions` (per-IP plus the
   per-player limits that are the real abuse control).
4. A decision on the live transport (SSE/WebSocket) and reconnect behaviour under it.
5. The client duel screen wired to `DuelClient` behind a feature flag, with solo play unchanged.
6. Monitoring (error rate, revision conflicts, match completion) and a cleanup job.
