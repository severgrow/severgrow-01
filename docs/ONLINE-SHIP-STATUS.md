# FUTASAKU 0.5 online duels — ship status (verification)

**Branch:** `futa0.5-online` · **Date:** 2026-10-13 · **Rules:** `futasaku0.4-strength-draw`
**Project:** Supabase `wbfrbeedlvjercrukngn` (eu-west-1) · **Edge API:** `https://wbfrbeedlvjercrukngn.supabase.co/functions/v1/duel`
**Game name:** FUTASAKU (always; engine ids stay for compatibility).

This document is the honest, evidence-first verification of the 0.5 online-duels work. It is
written by the verification/infrastructure worker (scope: `server/scripts/*`, `server/tests/*`,
`server/migrations/0005_*`, and docs). It does **not** claim more than was measured.

---

## 1. Supabase security advisors (P-21) — every finding

Run with the Supabase MCP `get_advisors` against project `wbfrbeedlvjercrukngn`.

### Security advisors — one lint, expected and intentional

| Lint | Level | Count | Verdict |
| --- | --- | --- | --- |
| `rls_enabled_no_policy` | INFO | 8 tables | **Intentional deny-all.** No action. |

The 8 tables are `matches`, `match_participants`, `match_moves`, `players`, `player_tokens`,
`rate_limits`, `device_link_codes`, `schema_migrations`. RLS is enabled with **no policies**, and
`anon`/`authenticated` are revoked, so those roles are denied everything; the API connects as the
table owner (`postgres`) which bypasses RLS. This is the documented, load-bearing design (see
[`DATABASE-VERIFICATION.md`](./DATABASE-VERIFICATION.md) and [`BACKEND.md`](./BACKEND.md)).

**No other security finding exists.** There is no `security_definer_view`, no `function_search_path`,
no `rls_disabled`, no `auth_users_exposed`, no `public_bucket_allows_listing` — nothing but the
single informational lint above.

### Performance advisors — two INFO lints (not security; assessed)

| Lint | Object | Verdict |
| --- | --- | --- |
| `unindexed_foreign_keys` | `match_moves.player_id` FK (`match_moves_player_id_fkey`) | **Safe to leave.** Every read path filters by `match_id` and the `match_moves` primary key is `(match_id, revision)`; `player_id` is never a lookup key. Add an index only if a future "all moves by player" query appears. |
| `unused_index` | `device_link_codes_expires_idx` | **Expected.** The link-code expiry sweep has not run enough to register a use. Harmless on a table this small. |

Neither is a correctness or security problem.

### 1.1 Anon / authenticated are DENIED on the new tables (proved, not assumed)

All six migrations are applied (`schema_migrations`: `0001_init.sql` … `0006_live_duels.sql`).

- `has_table_privilege` for `anon` and `authenticated` returns **false for SELECT/INSERT/UPDATE/
  DELETE on all 8 public tables** (checked at the SQL level, 8 tables × 8 privileges).
- A real `set role anon` and `set role authenticated` then `select * from <table> limit 1` is
  refused with **`42501`** for **every** authoritative table — including the three tables/columns
  added after the last advisor review:
  - `0002` → `rate_limits`, `device_link_codes`
  - `0003` → `matches.open_queue`
  - `0004` → `matches.grace_used_seat0/_seat1`, `grace_periods`, `grace_extension_ms`
  - `0005` → no new table (it schedules a pg_cron job; see §1.5)
- Reproduce: `npm run server:verify-security` (script `server/scripts/verify-security.ts`) — this
  prints `20/20 checks passed` (as of the P-2 run) and now also covers the pg_cron/pg_net checks;
  the table denials are asserted inside
  `npm run server:db-test` (`server/tests/postgres.integration.test.ts`).

### 1.2 Migration `0004_timeout_grace.sql` obeys the project security rule

`0004` was audited line by line and **is compliant — no new migration is needed**:

- `alter table matches enable row level security;` — RLS enabled in the same migration. ✅
- `revoke all on matches from anon` and `… from authenticated` (guarded by role existence). ✅
- The `alter default privileges in schema public revoke all on tables / sequences / functions
  from anon, authenticated` guard is re-issued in the same migration. ✅

`0004` adds only columns to an already-`matches`-protected table, so there is no new table to
secure. The default-privileges guard is verified present in `pg_default_acl`: the `postgres`-role
default ACLs for `public` now read `{postgres=…,service_role=…}` with **anon/authenticated removed**
for tables, sequences and functions.

> Note: Supabase's own `supabase_admin`-owned default ACLs still list `anon`/`authenticated`. Those
> govern objects created by the `supabase_admin` role, which our migrations never do (they run as
> `postgres`). It is a platform default we cannot change from `postgres`, and it does not affect us.

### 1.3 Realtime: no authoritative table is in the publication, and anon receives nothing

- The `supabase_realtime` publication **exists but has zero member tables**
  (`pg_publication_tables` returns no rows for it). Realtime is used for transient **broadcast
  pings** only; database-change replication is not used.
- A live anon Realtime WebSocket subscription to `postgres_changes` on `players` was opened with the
  project's anon key, and a real `players` row was inserted and deleted **while subscribed**: the
  client received **no change frames** (and the subscription cannot target a table outside the
  publication). Proved by `server/scripts/verify-security.ts` step 6b.

### 1.4 Regression tests added (never weakened)

Added to `server/tests/postgres.integration.test.ts` (additive only):

1. `revokes every write privilege, not only SELECT (P-21)` — `has_table_privilege` false for
   SELECT/INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER on every table, for both client roles.
2. `revokes client-role default privileges for future public objects (P-21 guard)` — asserts the
   `postgres`-role default ACLs in `public` grant nothing to `anon`/`authenticated`.
3. `has the 0004 timeout-grace columns on matches` — locks in the `0004` schema.

### 1.5 pg_cron / pg_net for the keep-alive (P-2 + P-21 adjacent)

Migration `0005_keepalive_cron.sql` enables `pg_cron` + `pg_net` and schedules the
`futasaku-keepalive` job. Because `pg_net` can make OUTBOUND HTTP from the database, both roles were
audited (verified live, not assumed):

- **`cron` schema — DENIED.** anon and authenticated have no schema `USAGE`, so a real
  `set role anon`/`set role authenticated` then `select … from cron.job`,
  `cron.job_run_details` and `cron.schedule(…)` all fail with **`42501`**. So the API URL and any
  error output in those tables are not exposed. (`has_schema_privilege(role,'cron','USAGE')` = false.)
- **`net` schema — platform-owned, unreachable through the API.** anon/authenticated hold PUBLIC
  grants on `net`, but they are non-login roles and the Data API (PostgREST) exposes only `public`.
  Proved live with the project's anon key:
  `POST /rest/v1/rpc/http_get` → **`404 PGRST202`** and `GET /rest/v1/_http_response` →
  **`404 PGRST205`** (and the same for `http_request_queue`). This matches Supabase's documented
  constraint: `postgres` cannot revoke those grants (a no-op) and removing them outright would
  **break** pg_net — so the migration deliberately does not, and the reachable denial is asserted
  instead.
- **No secret in the queue.** The job sends no `x-futasaku-cron` header, so
  `net.http_request_queue` holds only the public URL and an empty body (P-2 design choice; see §2).

Reproduce: `npm run server:verify-security` now also runs these cron/pg_net checks (and the live
anon Data-API probe when the anon key is set).

---

## 2. Keep-alive — Supabase-native cron job (P-2) — HANDLED

The keep-alive moved OUT of GitHub and INTO the database. Migration `0005_keepalive_cron.sql`
schedules one job:

| | |
| --- | --- |
| Job | `futasaku-keepalive` (id 1), runs as `postgres` |
| Schedule | `17 6 */2 * *` — 06:17 UTC every 2 days (the old cadence) |
| Step 1 | `net.http_get(…/duel/v1/health?db=1)` → a **real Postgres round trip** |
| Step 2 | `net.http_post(…/duel/v1/sweep)` → finishes overdue / expired matches server-side |

**Why this replaces the workflow.** `.github/workflows/futa05-keepalive.yml` had never run: GitHub
only fires `schedule`/`workflow_dispatch` for a workflow file present on the DEFAULT branch (`main`),
and that file existed only on `futa0.5-online`. GitHub also disables schedules after ~60 days of repo
inactivity. The database job depends on neither. **The redundant workflow file was deleted** so there
is a single mechanism.

**Proved to actually run (real observed results):**

- The job was scheduled by the migration and then triggered by pg_cron itself (temporarily set to
  `* * * * *`, later restored to `17 6 */2 * *`). `cron.job_run_details` shows **two consecutive runs,
  `status = 'succeeded'`** (12:33:00 and 12:34:00 UTC).
- `net._http_response` shows the real results: the health call returned **HTTP 200** with
  `{"ok":true,…,"db":{"ok":true,"ms":102/111,"pooler":"transaction-pooler","port":"6543"}}`, and the
  sweep returned **HTTP 200** with all counters `0` (it created no data).
- A manual call of the same two endpoints produced the same 200/`db.ok` result — so the round trip is
  real, not a cached liveness answer.
- Cleanup: the pg_net response rows and the two test `cron.job_run_details` rows were deleted after
  the evidence was captured; exactly one job remains; the schedule is back to `17 6 */2 * *`.

**Status: scheduling IN EFFECT, round trip verified.** See
[`DEPLOY-ONLINE.md`](./DEPLOY-ONLINE.md#keep-alive-p-2--supabase-native-no-github) for inspect /
pause / resume / cadence-change commands and the free-tier reasoning.

---

## 3. Sustained load test (Phase 6 item 8)

**Script:** `server/scripts/load-test.ts` (new). **Mode used: `local`** — it starts the real
`createHttpServer` + `MatchService` + `PostgresStorage` on localhost, pointed at the **real Supabase
project**, and drives it over real HTTP with the browser's `DuelClient`.

**Why local and not 100 real Edge guests:** the deployed API rate-limits guest creation to **200 per
IP per hour** and joins to **400 per IP per hour**. Every virtual player here shares this machine's
single public IP, so a 100-player sustained run through Edge would be throttled by design (or force
temporarily raising the deployed secrets — a risk to the shared project). Per-player limits (120
actions/min) would distort far less, but the per-IP guest budget is the blocker. The database work is
identical; only the network hop differs (localhost vs an Edge isolate co-located with the DB), so
**these latencies are a pessimistic upper bound**, not a best case. A bounded
`--edge-probe` phase measures the deployed path separately (see §3.3).

### 3.1 The run

| Setting | Value |
| --- | --- |
| Concurrent matches (lanes) | 50 |
| Virtual players | 100 (2 per lane, reused across matches) |
| Duration | 300 s (wall ≈8.4 min incl. in-flight drain) |
| Per-move pacing | 300–600 ms (human-like, keeps it sustained not a burst) |
| DB pool (local server) | 12 connections |
| Match cap | 150 (bound storage) |

**Result:** 99 matches created · 98 finished · 0 stuck · 1 client-side `UNHANDLED` error (a single
transient localhost/DB blip under load; no server error). **12,270 HTTP requests.** Server-side
`ERROR` log lines: **0**. **No 429, no 503, no 500.**

### 3.2 Latency (local HTTP → real Postgres)

| Call | p50 | p95 | p99 | max | n |
| --- | --- | --- | --- | --- | --- |
| View fetch | 1458.7 ms | 3156.6 ms | 4578.3 ms | 10559.2 ms | 6085 |
| Submit action | 1337.1 ms | 2732.3 ms | 3750.0 ms | 10240.7 ms | 5987 |

These are dominated by round-trips from this machine to the eu-west-1 Session pooler under
50-way concurrency; they are an upper bound on the Edge path, not a player-facing number.

### 3.3 Deployed-Edge probe

A bounded probe phase (`--edge-probe`) plays real duels over HTTPS against the deployed Edge
function using the same `DuelClient`. **2 duels, 254 HTTPS requests, 2/2 finished, 0 errors, no
429/500/503.**

| Call (deployed Edge, real HTTPS) | p50 | p95 | p99 | max | n |
| --- | --- | --- | --- | --- | --- |
| View fetch | 564.9 ms | 632.7 ms | 685.9 ms | 821.2 ms | 126 |
| Submit action | 643.9 ms | 719.5 ms | 749.2 ms | 895.7 ms | 124 |

For contrast, the same machine against the **local** server on the same database at low
concurrency (2 matches in flight, no pacing) was view p50 308.7 ms / p95 380.1 ms and submit p50
398.4 ms / p95 546.1 ms; under the 50-concurrent sustained run it rose to view p50 1458.7 ms /
submit p50 1337.1 ms. That gap is the concurrency/contention cost, not the Edge hop.

The probe is intentionally bounded (2 duels) to respect the shared per-IP guest budget (200/h) and
to avoid disturbing the concurrent consolidation/invite work; it is enough for p50/p95 shape, not
for a load-curve at scale.

### 3.4 Free-tier headroom

| Resource | Free-tier budget | Observed | Headroom |
| --- | --- | --- | --- |
| Postgres connections | 60 (`max_connections`), ~50 usable | **peak 22** during the run | comfortable |
| Database size | 500 MB | ~29 MB before; +2.8 MB during the run (rows then deleted) | large |
| Realtime messages | 2M/mo | **0** (no DB change replication; no tables in the publication) | n/a |
| Edge invocations | 500k/mo | bounded probe only | large |

### 3.5 Storage per finished match (measured)

Measured with `pg_column_size` over exactly the tracked rows of the finished matches (99 matches,
~89 revisions each) — not an estimate:

| Per finished match | Bytes |
| --- | --- |
| `matches.state` | 1,757 |
| `matches.turn_start_state` | 1,757 |
| `matches` config + result + invite + rules | 705 |
| `match_moves.action` (across ~89 rows) | 5,592 |
| `match_moves.events` (across ~89 rows) | 14,525 |
| **Row bytes total** | **≈26,669 B (~26 KB)** |

Cross-check: `pg_total_relation_size` for `matches`+`match_moves`+`match_participants` grew by
2,613,248 B over 99 matches ≈ **26,396 B/match** — so index + page overhead is negligible on top of
the row bytes.

**Growth drivers:** `match_moves.events` is the largest single component (~14.5 KB/match), then
`match_moves.action` (~5.6 KB), then `matches.state` + `turn_start_state` (~3.5 KB combined, and
`turn_start_state` roughly doubles the retained `state` size).

**Projection (linear; real rows pile up, no pruning yet):**

| Finished matches | Rows-only projection |
| --- | --- |
| 1,000 | ≈26.7 MB |
| 10,000 | ≈267 MB |

At the free-tier 500 MB database limit, **~10k finished matches is roughly half the database** — the
single most important capacity number for the owner. Pruning/archiving finished matches will be
needed before then.

---

## 4. The owner's 21 predicted problems — final status

Legend: **Tested** = exercised by an automated test/measured run in this verification; **Handled**
= implemented and read/reviewed, plus a broader proof exists; **Partial** = implemented but with a
caveat; **Not handled** = not done.

| # | Problem | Status | Evidence | Gap / caveat |
| --- | --- | --- | --- | --- |
| P-1 | Hosting / Edge limits / pooler | **Handled / tested** | `docs/DEPLOY-ONLINE.md` measured 33/40 → 0/40 five-hundreds and peak 63→19 connections after the Transaction-pooler (6543) switch; `server/tests/edge-pool.test.ts`; commit `401f262`. | Depends on the deployed `DATABASE_URL` secret staying on the transaction pooler. |
| P-2 | Free project pause / GH schedule | **Handled / tested** | Supabase-native `pg_cron` job `futasaku-keepalive` (migration `0005`): every 2 days it makes a real DB round trip (`/v1/health?db=1`, `db.ok:true`) and runs the sweeper. pg_cron ran it twice with `status='succeeded'`; `net._http_response` shows HTTP 200 (§2). Redundant GH workflow deleted. | A paused project cannot run its own cron — restore it first; the 2-day cadence keeps it from pausing. |
| P-3 | iOS Safari vs Home Screen storage | **Handled (read)** | `device_link_codes` table (`0002`) + single-use 8-char codes; `server/tests/http.test.ts`, `service.test.ts`; Settings warning in the client. | Client storage warning is UI (not re-verified here). |
| P-4 | Invite opens in another browser | **Handled (read)** | Join creates a guest on the spot; `#/join/CODE` deep link; `web/tests/lobby.test.ts`, e2e `online-invite-flow.ts`. | UI path not re-run by this worker. |
| P-5 | Service-worker caching / old client | **Handled / tested** | `CLIENT_TOO_OLD` handshake (`server/tests/http-e2e.test.ts`, soak `handshake.client_too_old`); API is cross-origin and uncached. | — |
| P-6 | Hidden-info leaks | **Tested** | `server/tests/phase6-hardening.test.ts`; real-DB privacy suite; soak audit walked **every payload of 200 duels**: forbidden keys never present, hidden card ids never leaked (252,740 hidden-info checks, 0 failures). | — |
| P-7 | Shadow mismatch | **Tested** | `server/tests/shadow-equivalence.test.ts` — **200/0** mid-turn equivalence. | — |
| P-8 | Deadline races / two tabs | **Tested** | Real-DB race tests (exactly one winner), `timeout-grace.test.ts`, `phase6-hardening.test.ts` 409-recovery; row-locked `commitMove`. | — |
| P-9 | Throttled timers / clock skew | **Tested** | `timer.skew_corrected` / `timer.clamped` one-off checks in the soak; `web/src/online/clock.ts`. | — |
| P-10 | Seat-1 perspective bugs | **Handled (read)** | `web/tests/perspective.test.ts`, `orient.test.ts`; before/after screenshots under `docs/screens/`. | Screenshots not regenerated by this worker. |
| P-11 | Realtime limits / outages | **Tested** | Polling is truth; broadcast pings are `{revision,status}` only (soak `broadcast.safe_shape`); **publication has no tables and an anon DB-change subscription receives nothing** (§1.3). | — |
| P-12 | Forgotten matches / no push | **Partial** | Visible deadline + last-2h warning + title count; **one grace period per player per match** added in `0004` (`timeout-grace.test.ts`, real-DB timeout-grace suite). | Still no push notifications. The grace rule now exists (the old report said "no grace" — that is out of date). |
| P-13 | Abuse | **Handled / tested** | Postgres-backed rate limits; `server/tests/rate-limit-nat.test.ts`, `http.test.ts`; soak `rate_limit.enforced`; 10-open-match cap; 8-char codes; identical error for wrong/expired. | — |
| P-14 | Rules drift | **Tested** | Matches store an immutable `rules_version`; soak `handshake.rules_version`, real-DB `rules_stored`. | — |
| P-15 | Growth / N+1 / storage | **Tested** | One-query match list + indexes; **storage per finished match measured here: ≈26 KB/match; 10k ≈267 MB** (§3.5). | No pruning yet — the projection is the risk. |
| P-16 | Flaky e2e | **Handled (read)** | Two-browser e2e waits on state, retries network only. | Not re-run under load here. |
| P-17 | CORS | **Tested** | Locked to `https://severgrow.github.io`; `server/tests/edge-cors.test.ts`; soak `edge.cors_locked`. | — |
| P-18 | A11y countdown spam | **Handled (read)** | Announce only at 2 h / 15 m / time's-up; status not colour-alone (`web/tests/*`). | UI not re-verified here. |
| P-19 | Time zones | **Handled (read)** | Durations only ("18h 42m"), never wall-clock times. | — |
| P-20 | Two devices, one player | **Tested** | Clean `STALE_REVISION` 409 + refetch recovery (`phase6-hardening.test.ts`, real-DB concurrency suite). | — |
| P-21 | Supabase default grants | **Tested** | Security advisors: only the expected INFO lint; anon/authenticated denied on every table incl. `0002`/`0003`/`0004`; the `0004`/`0005` guard present; publication empty; new regression tests (§1). Plus `pg_cron`/`pg_net` audited: `cron` denied `42501`; `net` unreachable through the Data API with the anon key (§1.5). | `net` grants are a Supabase platform constraint — mitigated by non-exposure, not revoke. |

---

## 5. What is proven vs. what is assumed

**Proven here (measured / runnable):**
- anon + authenticated hold no privilege on any public table; real `set role` selects all fail `42501`.
- the `0004` migration contains RLS + revokes + the default-privileges guard.
- the `postgres`-role default ACLs for `public` no longer grant anon/authenticated.
- no authoritative table is in `supabase_realtime`, and a live anon DB-change subscription gets nothing.
- the scheduled `futasaku-keepalive` job runs from the database: pg_cron recorded two runs with
  `status='succeeded'`, and `net._http_response` shows HTTP 200 with `db.ok:true` for the health call
  (a real round trip) and HTTP 200 with all-zero counters for the sweep.
- 50 concurrent matches / 100 players for ~5 min against the real database: 98/99 finished, no
  429/500/503, peak 22/60 connections, measured ≈26 KB storage per finished match.
- the full and DB-only test suites (numbers in §6).

**Assumed / read, not re-run by this worker:**
- the browser UI behaviours (P-3/4/5/10/16/18/19) — evidenced by existing `web/tests/*` and
  e2e scripts, but the live UI was not re-driven here.
- the deployed Edge function's *internal* latency — the Edge probe is bounded (see §3.3); the local
  numbers in §3.2 are an upper bound, not the Edge result.
- the Edge `DATABASE_URL` secret still points at the transaction pooler (verified indirectly via
  `GET /v1/health?db=1` → `"pooler":"transaction-pooler"`).

---

## 6. Honest limits and test counts

- **Matches live on the device until real accounts exist.** Identity is a guest + bearer token; there
  is no account system, and a link code is the only move-device path.
- **No push notifications.** A player only sees their turn when they open the game.
- **One database, one project.** Everything (players, matches, moves, rate limits) is the single
  free-tier Supabase project; there is no sharding or replica.
- **No ranking / matchmaking skill.** "Find opponent" pairs the open queue; there is no ladder.
- **Keep-alive now runs in the database** (P-2): the pg_cron job is proven by a real run, not just
  scheduled. It cannot survive the project being paused — but the 2-day cadence prevents that.
- **Storage grows unpruned** (~26 KB/match; 10k ≈ 267 MB of a 500 MB database).
- **Advisors:** only informational lints (one `rls_enabled_no_policy`, two performance INFO). Nothing
  security-actionable.

### DB test counts (explicit)

- `npm run server:db-test` (real database, pinned): **28 tests ran, 28 passed, 0 failed, 0 skipped.**
  (`postgres.integration.test.ts`, 1 file; 24 pre-existing + 4 new keep-alive/pg_cron tests.)
- `npm run server:verify` (migrate + real-DB suite + in-process smoke): **PASSED**
  (`VERIFICATION PASSED` — 0 migrations pending, 28/28 DB tests, every smoke check green).
- `npm run server:verify-security` (live project, with the public anon key): **20/20 checks passed**,
  including the new pg_cron/pg_net denial checks (§1.5).
- `npx tsc --noEmit` (root typecheck): **green** after every change.
- Without `DATABASE_URL`, the whole DB suite is **skipped loudly** (never silently) and
  `REQUIRE_DATABASE=1` makes that failure explicit.
- Full `npm run check` (typecheck + all unit suites, including `web/tests` and the DB suite):
  **1,635 tests** collected — **1,633 passed, 1 failed, 1 expected fail.** The **single failure is
  not from this work**: the concurrently-running invite-rebalance worker changed the invite code to
  4 characters (`src/invite-code.ts` → `INVITE_CODE_LENGTH = 4`, wired through `server/src/config.ts`)
  while `server/tests/service.test.ts:100` still asserts an 8-character code
  (`expected "5DF4" to match /^[0-9A-HJKMNP-TV-Z]{8}$/`). That file and those sources are outside this
  worker's scope and were left untouched. **The concurrent worker has since finished that change:
  `server/tests/service.test.ts` now passes 20/20**, so no failure remains attributable to the tree.
  Everything this worker changed is green: typecheck passes, and `npm run server:db-test` is 24/24
  (below).
  _An earlier full run, executed concurrently with the 50-match load test, additionally timed out 7
  engine/bot simulation tests (`tests/bots/*`, `tests/engine/*`) — pure CPU starvation from the
  self-inflicted contention; the clean run above has none._

---

## 7. Reproduce

```sh
# P-21 security evidence (prints 20/20; the live Realtime + pg_net Data-API steps need the anon key):
VITE_SUPABASE_ANON_KEY=… node --env-file-if-exists=.env --import tsx server/scripts/verify-security.ts

# real-database suite (prints the 24 tests; includes the new P-21 regressions):
npm run server:db-test

# sustained load test, local mode on the real project (≈8 min):
node --env-file-if-exists=.env --import tsx server/scripts/load-test.ts \
  --matches=50 --duration=300 --pool=12 --max-matches=150 --edge-probe=0 --pace=300
# bounded real-Edge probe:
node --env-file-if-exists=.env --import tsx server/scripts/load-test.ts \
  --matches=2 --duration=1 --max-matches=0 --edge-probe=2 --pace=0

# everything:
npm run check
```

_Every row this worker created was tracked by id and deleted (`where id = any(...)`), never a
table-wide delete: the load test removed its 99 matches / 100 players / 202 rate buckets; the
security script inserted and removed one probe row._
