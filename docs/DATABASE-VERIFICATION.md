# Database verification against Supabase

**Status: BLOCKED — the Direct-connection hostname does not exist in DNS.** No migration has been
applied and nothing has been written to the project. `.env` is present and confirmed git-ignored;
the blocker is purely the hostname. See "Blocker" below for the evidence and the one-line fix.

This document is the checklist and the record of what was verified against the real Supabase
(FUTASAKU) development project, and what it means. Unit-level proofs live in `server/tests/`;
the adapter itself is documented in [`BACKEND.md`](BACKEND.md).

## Blocker (2026-10-12)

The configured host `db.wfrbeedlvjercrukngn.supabase.co` (Direct connection, port 5432) returns
**NXDOMAIN** — the name has no A, AAAA or CNAME record at all:

| Check | Result |
| --- | --- |
| `nslookup supabase.co` (control: DNS works at all) | resolves → `76.76.21.21` |
| `nslookup -type=A db.wfrbeedlvjercrukngn.supabase.co` | **NXDOMAIN** |
| `nslookup -type=AAAA db.wfrbeedlvjercrukngn.supabase.co` | **NXDOMAIN** |
| Cloudflare DoH (A / AAAA / CNAME) | **NXDOMAIN** for all three |
| `aws-0-*.pooler.supabase.com` (control: pooler DNS) | resolves in every region |

This is **not** the IPv6-only Direct-connection case: IPv6-only would show AAAA records and no A.
Here there are no records of any kind, from two independent resolvers, so the hostname itself does
not exist for this project ref. Likely causes: a mistyped project ref, or a project whose direct
endpoint is not published under that name.

**Fix:** copy the exact **Session pooler** URI from *Supabase → Connect → Session pooler*
(host `aws-0-<region>.pooler.supabase.com`, port `5432`), paste it into `.env` as `DATABASE_URL`,
and re-run `npm run server:verify`. Do not guess the region.

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
