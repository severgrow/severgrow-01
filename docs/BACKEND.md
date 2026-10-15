# Futasaku 0.5 — backend foundation

> **Status pointer:** start at [`ONLINE.md`](ONLINE.md) for the current online-duels status. This
> document describes the backend as built; the dated verification snapshots are
> [`ONLINE-SHIP-STATUS.md`](ONLINE-SHIP-STATUS.md) and [`DATABASE-VERIFICATION.md`](DATABASE-VERIFICATION.md).

Status: **built and shipped** — the online duel screens and backend are live on `/futa0.5/`.
`web/src/online/` holds the client layer (identity, sync, draft, OnlineDriver); the backend runs
against Supabase (deadlines, turn-gated views, batch submit, resign, match list, link codes,
Postgres rate limits, sweeper, Realtime turn pings). Live duels (challenge → real time) also
ship on `/futa0.5/` — see [`LIVE.md`](LIVE.md). The plan is [`ONLINE-PLAN.md`](ONLINE-PLAN.md).

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
server/migrations/0007_daily_sweeper.sql  runs the keep-alive/sweeper job daily (cron.alter_job)
server/src/live/                  live duels (futa-test + /futa0.5/ preview) — see docs/LIVE.md
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
npm run server:live-db-test   # live-duel DB tests (need LIVE_DATABASE_URL; same string as DATABASE_URL)
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
   Also set `LIVE_DATABASE_URL` to the same string: the live-duel tables live in the same database,
   and the live-duel Postgres suite skips loudly without it. See `docs/DEPLOY-ONLINE.md`.
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
| POST | `/v1/matches/:id/cancel` | retire the caller's own **waiting** match → `{ cancelled }` |

A **player view** contains: the engine `View` (`viewFor(state, seat)`), the seat, the public turn
and status, the legal actions (only when it is that seat's turn), and the public-safe events. It
never contains the seed, the deck, either full hand, `fruitKnown`, the event history internals, or
the authoritative `State`.

**Cancelling a waiting duel (new).** `POST /v1/matches/:id/cancel` retires the caller's own match
while it is still `waiting` (an invite nobody ever joined, or a parked Find-Opponent search). It is
**owner-only** (the caller must be the match's sole participant), **idempotent** (a repeat is a calm
`{ cancelled: false }`), and it **deletes** the row, so the invite code no longer resolves and a
later join cannot land in it. An `active` or `finished` match is never touched. The invite screen's
**Cancel match** button calls it (with a confirm). Before this, an unjoined invite could only be
cleared by waiting out the 48-hour window, so abandoned invites lingered as "open" duels; a player
sitting at the 10-open-duel cap saw the generic error because the client mapped the wrong code (see
below).

**Find-opponent error codes (one spelling).** The service emits `TOO_MANY_MATCHES` (409) when a
player is at the open-duel cap. The client maps error codes to player lines in
`web/src/online/lobby.ts` (`friendlyJoinError`); it used to key on `TOO_MANY_OPEN`, a code **no
server path emits**, so the specific "too many open duels" line was dead code and a capped player
saw the generic "Something went wrong". It now maps `TOO_MANY_MATCHES` → `ONLINE.errTooMany`, and
`web/tests/lobby.test.ts` drives the real service to the cap and asserts that exact code maps to
that line — so the two sides can never silently diverge again.

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

**Every limit is Postgres-backed** (`hitRateLimit` in `server/src/storage/postgres.ts`), so it holds
across Edge isolates — this is NOT an in-memory per-instance counter, which on Supabase Edge would
be per warm isolate and could be multiplied by concurrency. The memory adapter is used only in
tests and local dev, where a single process is the whole world.

| Bucket (default window) | Default | Environment variable |
| --- | --- | --- |
| Guest creation, per IP per hour | `200` | `RATE_GUEST_PER_IP_PER_HOUR` |
| Match **creation**, per **player** per hour | `30` | `RATE_CREATE_PER_PLAYER_PER_HOUR` |
| Match **creation**, per IP per hour | `120` | `RATE_CREATE_PER_IP_PER_HOUR` |
| Match join, per **player** per hour | `60` | `RATE_JOIN_PER_PLAYER_PER_HOUR` |
| Match join, per IP per hour | `400` | `RATE_JOIN_PER_IP_PER_HOUR` |
| Link-code creation, per player per hour | `10` | `RATE_LINK_CODE_PER_PLAYER_PER_HOUR` |
| Link-code redeem, per IP per hour | `20` | `RATE_LINK_REDEEM_PER_IP_PER_HOUR` |
| Actions, per player per minute | `120` | `RATE_ACTIONS_PER_PLAYER_PER_MINUTE` |
| Sweep, per IP per hour | `120` | `RATE_SWEEP_PER_IP_PER_HOUR` |
| Cron sweep token (`x-futasaku-cron`) | unset | `SWEEP_CRON_TOKEN` |

The **Find-opponent** call (`POST /v1/matchmaking/find`) and **join** (`POST /v1/matches/join`) share
the `join:*` budgets above; **cancel** (`/v1/matchmaking/cancel` and `/v1/matches/:id/cancel`) reuses
the per-player join budget. **Match creation** is the one lifecycle write that historically had no
limit — a create/cancel loop could mint rows and burn permanent invite codes without bound — so it
now carries both a per-player and a per-IP cap. Every over-limit path returns HTTP **429** with a
player-readable line (`ONLINE.errRateLimited`, "Too many tries. Wait a moment and try again."), never
a raw error.

Every limit is overridable at runtime by the environment variable above (read through
`readEnv` in `server/src/config.ts`, which checks `process.env` then `Deno.env`), so the live Edge
function can be tuned without a code change. Defaults are the safe values above.

**Sweeping.** `POST /v1/sweep` is meant to run from cron/CI, not from players. When the
`SWEEP_CRON_TOKEN` secret is set and the caller sends the matching `x-futasaku-cron` header, the
sweep uses the dedicated `sweep:internal` bucket, so a player's per-IP budget (or a shared
`unknown` bucket) can never starve routine housekeeping. It is still rate limited. Without the token
the ordinary `sweep:ip:<ip>` bucket applies.

**What the sweep reaps (all three categories are covered).** One shared expiry decision
(`expiryDecision`) is used by BOTH the sweeper and every lazy read (`listMyMatches`, `viewPayload`,
`joinMatch`, `claimOpenQueueOrPark`, `applyExpiry`), so an expired-but-unvisited match is cleaned up
the moment either player looks, and the daily `futasaku-keepalive` cron is the backstop for matches
nobody ever revisits:

1. **Active matches past their turn deadline** — the acting seat spends its grace or the match
   finishes by `timeout`.
2. **Waiting matches past `waitingExpireMs` (48h)** — this covers BOTH an invite nobody ever joined
   AND a parked Find-Opponent search, because a parked search *is* a waiting open-queue match with
   the same `expiresAt` (`buildWaitingMatch`). Both become `finished`.
3. **Stale guest accounts** (no matches, older than 30 days) are deleted.

`server/tests/find-opponent-parking.test.ts` proves categories 1–2 with the real service and
sweeper; `server/tests/phase2.test.ts` proves the lazy read and the sweeper share one outcome.

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
`futasaku-keepalive`; migration `0007_daily_sweeper.sql` moves it to `17 6 * * *` (**06:17 UTC every
day**, via `cron.alter_job`, keeping the same job name and history), running as the `postgres` role.
Each run
does a **real database round trip** (`GET /v1/health?db=1` → `service.pingStorage()`) — which is what
resets the free project's ~1 week inactivity clock — and then `POST /v1/sweep` so overdue matches
and expired waiting matches are finished without a client visiting. The daily cadence means an
expired-but-unvisited match is cleaned up within a day instead of up to two. This replaces the inert GitHub
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

## Live duels (preview channels)

`server/src/live/` adds challenges, presence and a short per-turn clock on the SAME match. It wraps
the Storage port (`liveAwareStorage`) so the live clock is decided at the same lazy points as the
24-hour deadline; the base expiry decision skips rows the live layer owns (`liveManaged`). Migration
`0006_live_duels.sql` follows the 0002 lock-down: RLS on, anon/authenticated revoked (proved with a
real `set role` in `server/tests/live-postgres.integration.test.ts`), nothing in the realtime
publication, one pending challenge per match enforced by a unique partial index. Endpoints and
tuning: [`LIVE.md`](LIVE.md), [`NETWORK-CONTRACT.md`](NETWORK-CONTRACT.md#live-duels-preview-channels-docslivemd).

## Tests and the Supabase quota

Every request to the deployed API is a paid **Edge Function invocation** (Free plan: a hard monthly
cap; Pro: a larger allowance, then billed). One day of automated tests against the real project
used the whole Free allowance (2026-10-15), so:

- `npm run check`, `npm run e2e` and every local browser suite (`web/e2e/helpers/local-duel.ts`,
  `npm run e2e:live`) run against an **in-process** API and never touch Supabase.
- Scripts that DO hit the real project stop with `SKIPPED … (exit 3)` unless run on purpose:
  `FUTASAKU_REAL_PROJECT=1 npx tsx <script>`. Guarded: `web/e2e/online-live-ping-latency.ts`,
  `online-live-smoothness.ts` (when `LIVE_API` is the real project), `online-device-matrix.ts`,
  `offline-vs-online-audit.ts`, `server/scripts/online-soak.ts`, `server/scripts/load-test.ts`
  (`server/scripts/real-project-guard.ts`). `online-simulation.ts` already needs `--live`.
- The app itself keeps idle traffic low: the live-duel challenge check runs every **30 s** while the
  per-player Realtime ping is connected (4 s only when Realtime is down, or a challenge is waiting),
  and the live status check runs every **10 s** in a match (1 s only while live or waiting; 30 s
  when the tab is hidden). The duel board's own 2 s sync poll is unchanged.

## Test results

| Suite | Result |
| --- | --- |
| `server/tests/service.test.ts` | 20 tests: identity, joining, views, actions, idempotency, stale revisions, racing submissions, a full game to a finished result |
| `server/tests/http-e2e.test.ts` | 4 tests: the whole vertical slice over real HTTP with two clients + refresh/reconnect, auth failures, error codes, card-reconstruction |
| `server/tests/http.test.ts` | 8 tests: preflight/CORS, security headers, malformed and oversized bodies, missing bodies, 404s without internals, auth required on every match route, precise field validation, and that logs never contain tokens or bodies |
| `server/tests/postgres.test.ts` | 11 tests: row mapping, the transactional statement sequence, rollback on every rejection, idempotent replay, duplicate invite code (recording fake pool) |
| `server/tests/postgres.integration.test.ts` | **17 tests against the real database** (skipped unless `DATABASE_URL` is set): schema/constraints, migration idempotency+checksums, RLS everywhere, `anon`/`authenticated` denial, token-hash-only storage, persistence across a brand-new pool, a two-guest create/join/play slice, DB-level idempotency, racing transactions, ten-way retry storm, rollback, leak checks |
| `server/tests/live-postgres.integration.test.ts` | **7 tests against the real database** (skipped unless `LIVE_DATABASE_URL` is set): a whole live session (go-live, timeout auto-play, a strike, board unchanged by the switch), P-21 `42501` denial for `anon`/`authenticated` on every live table and column, nothing in the realtime publication, the one-pending-challenge partial index under racing inserts, mutual challenges and accept races serialized by real row locks, a late move racing the timeout tick |
| `server/tests/migrate.test.ts` | migration runner: order, one transaction per migration, idempotency, checksum refusal, rollback, dry-run |
| `server/tests/pg-pool.test.ts` | TLS decisions, env handling, password redaction |
| `server/tests/client.test.ts` | 6 tests: request shape, bearer header, `since` handling, error mapping, session persistence/resume |
| `server/tests/engine-events.test.ts` | 3 tests: `hidePrivateEvents` ≡ `eventsFor` across real games |
| `server/tests/migration.test.ts` | 6 tests: tables, RLS everywhere, hashed tokens, immutable fields, idempotency key |
| `server/tests/phase6-hardening.test.ts` | Phase 6: leak-key audit, turn-gated Draw privacy, concurrent STALE_REVISION 409 + refetch, viewPayload load p95, short action burst |
| `web/e2e/online-duel-two-browser.ts` | Phase 6: two Chromium contexts, local API + preview, create/join, Me/Opponent HUD, resign → finished on both |
| `server/tests/phase7-matchmaking.test.ts` | Phase 7: open-queue create + pair; invite matches stay out of the pool |
| `server/tests/client-ip.test.ts` | client-IP derivation: `cf-connecting-ip` precedence, `x-real-ip`, `x-forwarded-for` leftmost public pick, private-hop skipping, malformed/`unknown` fallbacks, private-range classification |
| `server/tests/rate-limit-nat.test.ts` | NAT/shared-IP regression: two players behind one IP create + join; a single IP still blocked above the new ceiling; per-player limits trip independently of IP; distinct forwarded IPs get distinct buckets; `cf-connecting-ip` beats a spoofed `x-forwarded-for`; cron sweep uses its dedicated bucket; the new **create** cap per player and per IP |
| `server/tests/cancel-waiting-match.test.ts` | cancel a waiting invite: owner-only, waiting-only, idempotent, and the cancelled code no longer joins (service + real HTTP) |
| `web/tests/lobby.test.ts` | lobby helpers; a **regression** drives the real service to the open-duel cap and asserts `TOO_MANY_MATCHES` maps to the specific `ONLINE.errTooMany` line (so the client mapping can never silently diverge from the server code again) |
| `docs/ONLINE-REPORT.md` | Phase 8 final report (P-1…P-21) |

`vitest.config.ts` loads `.env` when it exists, so the real-database suites **run** locally; in CI
there is no `.env`, so they skip and are pinned separately by `npm run server:db-test` and
`npm run server:live-db-test` (the live suite needs its own `LIVE_DATABASE_URL` — the same
session-pooler string as `DATABASE_URL`). A manual smoke
script (`npm run server:smoke`, 14 checks) exercises a live deployment and reuses the same client
the browser will use.

The rest of the project's suite is unchanged and must stay green (see the final report).

## What is NOT built (on purpose or unfinished)

Deliberately out of scope, per the brief: accounts with credentials/OAuth, matchmaking skill /
ranking, clans, XP, world-map functionality, ranked play, and any game-mechanic change.

Built since the original phases (so no longer "unfinished"):

- **Live database run** — verified against the real project; see
  [`DATABASE-VERIFICATION.md`](DATABASE-VERIFICATION.md) and
  [`ONLINE-SHIP-STATUS.md`](ONLINE-SHIP-STATUS.md).
- **Live transport** — a Supabase Realtime **broadcast ping** on turn completion, with polling as
  the safety net (below).
- **Client UI** — the lobby and duel screen (and the live-duel pop-up) are wired to `DuelClient`;
  solo play is unchanged.
- **Rate limits** — Postgres-backed, NAT-friendly and `RATE_*`-tunable (see the section above).
- **Sweeper** — runs itself from the `futasaku-keepalive` pg_cron job (see
  [Keep-alive](#keep-alive-pgcron--pgnet)).

Still open / deliberately unfinished:

1. **No push while the tab is closed.** An open tab receives the Realtime ping; a closed tab is only
   updated on the next visit (no web-push notifications). Polling is unchanged as the safety net.
2. **No TLS termination** here (a deployment concern). Tokens are bearer tokens: HTTPS is required.
3. **No observability** beyond one line per request (method, path, status, duration). No metrics,
   tracing or alerting; logs never contain bodies or tokens.
4. **Presence (Online / Away) is not wired.** The API has a presence heartbeat, but the client
   deliberately **hides** the indicator rather than faking it. This is a known open item.
5. **Retained-heap drift (open, frontend).** A long-lived tab retains ~270 KB per match
   (~100–500 KB/match measured end to end), released only by a reload — see
   [`ONLINE-POLISH.md`](ONLINE-POLISH.md#retained-heap--a-real-slow-drift-reported-not-hidden).
6. **Intermittent seat-1 Bloom painting stall (open, frontend).** Roughly 1 run in 3; the cause is
   not yet identified. Not a server issue.

## Before inviting real players (status)

1. **Done** — Postgres (Supabase) with migrations `0001`–`0006` applied; the adapter is exercised
   against the real project (`npm run server:db-test`).
2. **Done** — TLS on managed hosts and a CORS **allow-list** on the deployed Edge function
   (`server/src/config.ts`): it defaults to `https://severgrow.github.io`, `https://www.futasaku.com`
   and `https://futasaku.com`, and is extended or replaced by the comma-separated `CORS_ORIGINS` Edge
   secret without a rebuild (see [`CUSTOM-DOMAIN.md`](CUSTOM-DOMAIN.md)). The `*` wildcard is only the
   local/dev default, so a browser on another origin is blocked: an allow-listed origin is echoed
   back, while a foreign origin receives the first configured origin and never an echo
   (`server/tests/cors-allow-list.test.ts` proves both over real HTTP). Rotate the service-role key
   as routine hygiene.
3. **Done** — rate limits on guest creation, join and actions: NAT-friendly per-IP caps plus the
   per-player limits that are the real abuse control.
4. **Done** — the live transport is the Realtime broadcast ping with polling as the safety net;
   reconnect replays the missed turns (see [What is NOT built](#what-is-not-built-on-purpose-or-unfinished)).
5. **Done** — the duel screen (and the live-duel pop-up) is wired to `DuelClient`; solo play is
   unchanged.
6. **Partly** — the sweeper runs from the `futasaku-keepalive` pg_cron job; monitoring is still just
   one log line per request (no metrics, tracing or alerting).
