# Database verification against Supabase

**Status: awaiting the connection string.** Nothing has been run against the real project yet.

This document is the checklist and the record of what was verified against the real Supabase
(FUTASAKU) development project, and what it means. Unit-level proofs live in `server/tests/`;
the adapter itself is documented in [`BACKEND.md`](BACKEND.md).

## Setup (once)

1. Copy `.env.example` to `.env` (git-ignored) and set `DATABASE_URL` from
   *Supabase → Project Settings → Database → Connection string* (**Session pooler**, port 5432).
2. `npm run server:migrate` — applies the versioned schema.
3. `npm run server:db-test` — real-database integration tests.
4. `npm run server:smoke` — end-to-end flow against a running server.

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

_To be filled in after the run._

## Outstanding after this step (before the game UI)

_To be filled in after the run._
