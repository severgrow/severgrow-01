# Database verification against Supabase

**Status: VERIFIED against the real project (2026-10-12).** The existing Postgres adapter, the
migration runner and the versioned schema have all been exercised against the live Supabase
FUTASAKU development database. See "Results" for the evidence.

Unit-level proofs live in `server/tests/`; the adapter and the API are documented in
[`BACKEND.md`](BACKEND.md).

> **Update (note added 2026-10-14) — history kept below.** This is the dated 2026-10-12 verification
> of the database layer; its facts, results, the two faults and the security note stay accurate for
> that run. Since then migrations `0002`–`0006` were applied (deadlines/lists/rate limits, open queue,
> timeout grace, keep-alive cron, live duels), so the project now has **9 public tables, not 5**, and
> the "Outstanding after this step" list is now **done** — the live transport (Realtime ping + poll),
> the duel screen, the CORS lock-down, rate limits and the sweeper all exist.
> Current status: [`ONLINE.md`](ONLINE.md); live-duel schema: [`LIVE.md`](LIVE.md).

## Project facts (confirmed)

| Fact | Value |
| --- | --- |
| Project ref | `wbfrbeedlvjercrukngn` |
| Region | `eu-west-1` |
| Postgres | `17.11` (`select version()`) |
| Connection method | **Session pooler** — `aws-0-eu-west-1.pooler.supabase.com:5432` |
| User / database | `postgres.wbfrbeedlvjercrukngn` / `postgres` |
| Applied migrations | `0001_init.sql` (1) |
| `public` tables | 5 + `schema_migrations` |

The **Direct connection** (`db.<ref>.supabase.co`) resolves to an **AAAA record only** (IPv6) and
this machine has no IPv6 route, so it is unusable here; the Session pooler is IPv4 and is what the
verification used. A plain `postgres` login is the same role and password either way.

## Setup (once)

1. Copy `.env.example` to `.env` (git-ignored) and set `DATABASE_URL` from
   *Supabase → Project Settings → Database → Connection string* (**Session pooler**, port 5432).
   **Do not append `?sslmode=require`** — `server/src/storage/pg-pool.ts` already applies TLS for
   managed hosts, and that query flag flips node-postgres into full certificate-chain verification.
2. `npm run server:migrate` — applies the versioned schema.
3. `npm run server:db-test` — real-database integration tests.
4. `npm run server:smoke` — end-to-end flow against a running server (needs the server started).
5. `npm run server:verify` — migrate + integration suite in one command.

## Two faults found and fixed on the way here

1. **Misspelled project ref in the first connection string** — `wfrbeedlvjercrukngn` instead of
   `wbfrbeedlvjercrukngn` (a missing `b`). That produced a genuine `ENOTFOUND`, not an IPv6 problem.
2. **The `?sslmode=require` footgun.** Current node-postgres aliases that flag to `verify-full`,
   which demands a full certificate chain and fails against the pooler. Our `pg-pool.ts` applies
   `rejectUnauthorized:false` for managed hosts by itself, so the flag must be omitted. Documented
   in `.env.example` and `BACKEND.md`.

A third, non-blocking observation: **Supabase cannot set the `postgres` password through MCP** — the
MCP role is not a superuser (`alter role` → `42501`). The password must be set/reset from the
dashboard. This is a platform constraint, not a bug in our code.

## What "verified" means here (and the results)

| # | Claim | How it is checked | Result |
| --- | --- | --- | --- |
| 1 | The credentials work and TLS is negotiated | connect and read `version()` | ✅ `PostgreSQL 17.11` |
| 2 | The schema matches the migrations | five tables + columns + constraints from `information_schema` / `pg_constraint` | ✅ |
| 3 | Migrations are idempotent and checksummed | re-run `migrate` → 0 applied, all skipped | ✅ `0 applied, 1 already applied` |
| 4 | Row Level Security is on everywhere | `pg_class.relrowsecurity` for every table | ✅ all 6 |
| 5 | Client roles cannot read authoritative data | `has_table_privilege` + a real `SET ROLE anon` select must be denied | ✅ ran (roles exist), `42501` |
| 6 | Identity persists | create player + token, read back by token hash, token itself absent | ✅ |
| 7 | A match persists with immutable rules/seed/config | read back by id and by invite code | ✅ |
| 8 | Data survives a restart | read through a **brand-new pool** | ✅ |
| 9 | Two guests create, join and play on real rows | the service over the real adapter, rows counted | ✅ |
| 10 | Duplicate requests apply exactly once | DB-level: one `match_moves` row | ✅ |
| 11 | Two racing moves cannot both win | two concurrent `commitMove`s → exactly one ok | ✅ |
| 12 | Ten identical retries apply once | 1 applied + 9 replayed, one row | ✅ |
| 13 | Rejections roll back cleanly | stale revision + illegal move leave revision 0, no rows | ✅ |
| 14 | Real constraint violations roll back | duplicate invite code → failure, pool still usable | ✅ |
| 15 | Player views never leak | seed/deck/opponent hand absent for both seats on real data | ✅ |

## Results

### Migration

```
$ npm run server:migrate -- --status
  pending  0001_init.sql

$ npm run server:migrate
target: postgresql://postgres.wbfrbeedlvjercrukngn:***@aws-0-eu-west-1.pooler.supabase.com:5432/postgres
  applied  0001_init.sql
done: 1 applied, 0 already applied

$ npm run server:migrate            # idempotency
  up to date  0001_init.sql
done: 0 applied, 1 already applied
```

### Integration suite (`npm run server:db-test`)

```
Test Files  1 passed (1)
     Tests  17 passed (17)
  Duration  12.28s
```

All 17 passed, including the real `SET ROLE anon` denial (the Supabase `anon`/`authenticated` roles
exist on this project, so that check ran rather than skipping).

### End-to-end smoke against the real database (`PORT=8793 npm run server:smoke`)

```
futasaku duel server listening on http://localhost:8793
  rules version: futasaku0.4-strength-draw
  storage: postgres (postgresql://postgres.wbfrbeedlvjercrukngn:***@aws-0-eu-west-1.pooler.supabase.com:5432/postgres)

PASS  health reports the pinned rules version
PASS  two guests can be created
PASS  guest A creates a waiting match with an invite code
PASS  guest B joins with the code and the match becomes active
PASS  both views hide the seed, the deck and both hands
PASS  the two seats see different own hands
PASS  the player to act has legal actions
PASS  a legal action is accepted and the revision advances
PASS  the same request id is applied exactly once (replayed)
PASS  a stale revision is refused  (STALE_REVISION)
PASS  both seats see the new revision
PASS  reconnect returns the view and the public events
PASS  an unrelated player cannot read the match  (NOT_A_PARTICIPANT)
PASS  a bad token is rejected  (UNAUTHORIZED)

smoke: all checks passed
```

### Persistence, read back from the database itself

```sql
select (select count(*) from players)  as players,       -- 3
       (select count(*) from player_tokens) as tokens,   -- 3
       (select count(*) from matches)  as matches,       -- 1
       (select count(*) from match_participants) as participants, -- 2
       (select count(*) from match_moves) as moves,      -- 1
       (select count(*) from schema_migrations) as migrations;     -- 1
```

The rows are exactly the guests, match, participants and one committed move produced by the smoke
run — so the flow is genuinely persisted, not held in memory.

## Security note for whoever works on this next (important)

Supabase's **default privileges grant `anon` and `authenticated` full read/write on every new table
in `public`**:

```
pg_default_acl → owner=postgres schema=public objtype=r
                 acl={postgres=arwdDxtm, anon=arwdDxtm, authenticated=arwdDxtm, service_role=arwdDxtm}
```

So the `revoke all … from anon, authenticated` block in `0001_init.sql` is **load-bearing**: without
it, the authoritative tables (including `matches.state` — the whole deck and both hands) would be
readable through Supabase's public API. The adapter's server role (`postgres`) is unaffected because
it **owns** the tables and has `bypassrls = true`; `anon`/`authenticated` have `bypassrls = false`
and are revoked, so RLS default-denies them. The integration suite proves this with a real
`set role anon; select * from matches` that must fail with `42501`.

Expect an **informational** Supabase advisor lint `rls_enabled_no_policy` on those tables. That is
intentional (deny-all to client roles) and needs no action.

## Outstanding after this step (before the game UI)

The database layer is verified. What remains is unchanged from the earlier plan:

1. **A transport for live updates.** Clients currently poll (`GET …/view?since=N`). Choose SSE or
   WebSocket over the same pipeline; define reconnect/backoff behaviour.
2. **Wire `DuelClient` into the game screen** behind a feature flag — create/join by code, submit
   actions, render the returned player view — leaving solo play untouched.
3. **Abuse controls:** rate limits on guest creation, join attempts and action submissions; rotate
   invite codes on a schedule (codes currently never expire).
4. **Deployment hardening:** TLS termination, a locked `CORS_ORIGINS` allow-list, the database
   password handled as a secret, and a decision on where the server runs (the pooler is designed
   for this).
5. **Monitoring and housekeeping:** error rate, revision conflicts, and a cleanup job for
   abandoned guests and waiting matches.
6. **A dedicated database role for the API** (optional): the server currently connects as
   `postgres`. A narrower role with `bypassrls` on exactly these tables would be tidier than the
   owner role.
