# Database verification against Supabase

**Status: BLOCKED on the database password.** The connection method is now confirmed correct and
our client reaches the project, but no usable credential exists: Supabase's MCP cannot set the
`postgres` password (not a superuser), and the project's current password is unknown. Nothing has
been applied — the project still has **0 migrations and an empty `public` schema**. See "Blocker"
below for the exact tool output and the one action needed.

This document is the checklist and the record of what was verified against the real Supabase
(FUTASAKU) development project, and what it means. Unit-level proofs live in `server/tests/`;
the adapter itself is documented in [`BACKEND.md`](BACKEND.md).

## Project facts (confirmed)

| Fact | Value |
| --- | --- |
| Project ref | `wbfrbeedlvjercrukngn` |
| Region | `eu-west-1` |
| Postgres | `17.11` (from `select version()`) |
| Connection method | **Session pooler** — `aws-0-eu-west-1.pooler.supabase.com:5432` |
| User | `postgres.wbfrbeedlvjercrukngn` |
| Database | `postgres` |
| Applied migrations | **none** (`list_migrations` → `[]`) |
| `public` tables | **none** (`list_tables` → `[]`) |

## Blocker (2026-10-12) — the database password

**Resolved first:** the earlier `ENOTFOUND` was **not** an IPv6 problem. The project ref I was
given initially was misspelled — `wfrbeedlvjercrukngn` instead of `wbfrbeedlvjercrukngn` (a missing
`b`) — so that hostname genuinely did not exist. With the corrected ref, DNS resolves and our
client connects to the pooler and reaches authentication.

**Current blocker:** every connection stops at
`error: password authentication failed for user "postgres"`.

Attempting to set the password through the Supabase MCP was **refused by PostgreSQL**:

```
execute_sql(project_id=wbfrbeedlvjercrukngn, query="alter role postgres with password '<generated>'")
→ ERROR: 42501: permission denied to alter role
  DETAIL: Only superusers can alter privileged roles.
```

Diagnosis (read-only): the MCP connects as `postgres`, but with `is_superuser = off`:

```
select current_user, session_user, current_setting('is_superuser')
→ postgres | postgres | off
```

PostgreSQL therefore refuses to alter a privileged role such as `postgres`. The Supabase namespace
exposes **no** password or project-configuration tool (its 30 tools are migration/branch/log/advisor
/keys/docs related; none sets a database password). No further attempt was made, per instruction.

**The one action needed (dashboard, ~30 seconds):**

1. Open <https://supabase.com/dashboard/project/wbfrbeedlvjercrukngn/settings/database>.
2. Find **Database password** → **Reset database password**.
3. Copy the value it produces and paste it into `/Users/patryk/severgrow-01/.env` as the password in
   `DATABASE_URL` (the file currently holds a generated password that was never applied, so it will
   fail until this is done).

Then `npm run server:verify` runs the whole verification (migrate → integration suite → smoke).

> Alternative, if the dashboard offers a **custom** password field: it already exists in `.env`
> (the part between `postgres.wbfrbeedlvjercrukngn:` and `@aws-0-eu-west-1...`); paste that value
> there and `.env` needs no change. No secret needs to pass through chat either way.

> Forward note: setting the password via SQL would desynchronise the value the dashboard displays.
> That route is unavailable here anyway (the role is not a superuser).

## Setup (once)

1. Copy `.env.example` to `.env` (git-ignored) and set `DATABASE_URL` from
   *Supabase → Project Settings → Database → Connection string* (**Session pooler**, port 5432).
   **Do not append `?sslmode=require`** — `server/src/storage/pg-pool.ts` already applies TLS for
   managed hosts, and that query flag flips node-postgres into full certificate-chain verification.
2. `npm run server:migrate` — applies the versioned schema.
3. `npm run server:db-test` — real-database integration tests.
4. `npm run server:smoke` — end-to-end flow against a running server.
5. `npm run server:verify` — all three in one command.

## What "verified" means here

| # | Claim | How it is checked |
| --- | --- | --- |
| 1 | The credentials work and TLS is negotiated | connect and read `version()` |
| 2 | The schema matches the migrations | five tables + columns + constraints from `information_schema` / `pg_constraint` |
| 3 | Migrations are idempotent and checksummed | re-run `migrate` → 0 applied, all skipped |
| 4 | Row Level Security is on everywhere | `pg_class.relrowsecurity` for every table |
| 5 | Client roles cannot read authoritative data | `has_table_privilege` + a real `SET ROLE anon` select must be denied |
| 6 | Identity persists | create player + token, read back by token hash, token itself absent |
| 7 | A match persists with immutable rules/seed/config | read the row back by id and by invite code |
| 8 | Data survives a restart | read through a **brand-new pool** |
| 9 | Two guests create, join and play on real rows | the service over the real adapter, then rows counted |
| 10 | Duplicate requests apply exactly once | DB-level: one `match_moves` row |
| 11 | Two racing moves cannot both win | two concurrent `commitMove`s → exactly one ok |
| 12 | Ten identical retries apply once | 1 applied + 9 replayed, one row |
| 13 | Rejections roll back cleanly | stale revision and illegal move leave revision 0 and no rows |
| 14 | Real constraint violations roll back | duplicate invite code → failure, pool still usable |
| 15 | Player views never leak | seed/deck/opponent hand absent for both seats on real data |

## Results

**Not run — blocked at step 1 (credentials).** No row in the table above has been exercised against
the real project; the project remains empty. The same behaviours are proven against the in-memory
adapter and a recording fake pool in `server/tests/` (see [`BACKEND.md`](BACKEND.md)), and the
real-database suite (`server/tests/postgres.integration.test.ts`, 17 tests) is written, type-checks,
and **skips cleanly** when `DATABASE_URL` is absent.

| # | Claim | Real-database result |
| --- | --- | --- |
| 1–15 | see the table above | **BLOCKED** — waiting on the database password |

What *was* verified about the connection itself:

| Check | Result |
| --- | --- |
| Project reachable at the Session pooler host | ✅ connection reaches authentication |
| TLS negotiated without `?sslmode=require` | ✅ (no certificate error before auth) |
| Migration runner refuses to guess | ✅ exits 2 with a clear message when `DATABASE_URL` is unset |
| Nothing written to the project | ✅ `list_migrations` → `[]`, `list_tables` → `[]` |

## Outstanding after this step (before the game UI)

Blocking the whole list:

1. **The database password** (see "Blocker"). Everything below depends on it.

Once a credential works, still to do inside this verification step:

2. Apply `0001_init.sql` and confirm the five tables + RLS + the `anon`/`authenticated` denial on
   the real database.
3. Run the 17 real-database integration tests (concurrency, idempotency, rollback, persistence,
   hidden-information).
4. Run the end-to-end smoke against a server backed by the real database.

Then, before wiring online duels into the game interface (unchanged from the earlier plan):

5. **A transport for live updates.** Clients currently poll (`GET …/view?since=N`). Choose SSE or
   WebSocket over the same pipeline; define reconnect/backoff behaviour.
6. **Wire `DuelClient` into the game screen** behind a feature flag — create/join by code, submit
   actions, render the returned player view — leaving solo play untouched.
7. **Abuse controls:** rate limits on guest creation, join attempts and action submissions; rotate
   invite codes on a schedule.
8. **Deployment hardening:** TLS termination, a locked `CORS_ORIGIN`, the service-role key handled
   as a secret, and a decision on where the server runs (the pooler is designed for this).
9. **Monitoring:** error rate, revision conflicts, and a cleanup job for abandoned guests and
   waiting matches.
