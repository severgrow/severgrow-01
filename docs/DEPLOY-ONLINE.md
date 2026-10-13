# Deploy FUTASAKU online (test channel)

Plain-English guide for the live duel API on the one Supabase project **FUTASAKU**
(`wbfrbeedlvjercrukngn`, eu-west-1).

The game site stays on GitHub Pages. The API runs as a **Supabase Edge Function** named `duel`.

## What is deployed today

| Piece | URL / place |
| --- | --- |
| Edge Function | `https://wbfrbeedlvjercrukngn.supabase.co/functions/v1/duel` |
| Health | `…/duel/v1/health` (add `?db=1` for a real database ping **and** the pooler diagnostic) |
| CORS | Locked to `https://severgrow.github.io` (no path on the origin) |
| JWT gate | **Off** — guests use our own bearer tokens, not Supabase Auth |

**Current status (2026-10-12):** full `duel` Edge Function is live via CLI deploy (`verify_jwt` off, CORS locked). Health is not a stub; `?db=1` returns `db.ok`; `npm run server:smoke` against the deployed URL passed. Redeploy after server changes with the CLI steps below (needs `SUPABASE_ACCESS_TOKEN` or `npx supabase login`).

## One-time: put the database secret on the Edge Function

**Use the Transaction pooler (port `6543`).** Migrations and local tests use the **Session** pooler
(port `5432`); the Edge Function must not.

### Why the Transaction pooler

The free-tier project allows **`max_connections = 60`** Postgres backends, of which **3** are
reserved for the superuser, and Supabase's own services (PostgREST, pg_cron, pg_net, the exporter and
Supavisor itself) hold ~6. That leaves roughly **50 usable client connections**.

- The **Session** pooler (5432) **and the direct host `db.<ref>.supabase.co`** both pin **one
  Postgres backend per client connection**. Every warm Edge isolate holds up to `max` connections
  (currently **2**), so N isolates need up to `2 × N` backends. A burst of ~40 concurrent requests was
  measured to open **~48** `postgres.js` backends and push the project to **63/60** connections — new
  connections are then refused and the live API answers **500** for everyone (including real players).
- The **Transaction** pooler (6543) multiplexes many client connections onto a small, bounded
  server-side pool, so isolate count no longer multiplies backend count. It does **not** support
  named prepared statements, which is why the Edge client sets `prepare: false` (already coded, and
  enforced at build time).

### What we found and changed (2026-10-13)

The deployed `DATABASE_URL` secret was pointing at the **direct** host
(`db.wbfrbeedlvjercrukngn.supabase.co:5432`) — `GET /v1/health?db=1` reported
`"pooler":"direct","port":"5432"`. That is the connection-per-client worst case above. It was
switched to the project's **Transaction** pooler (`…pooler.supabase.com:6543`), the function was
redeployed, and `?db=1` then reported `"pooler":"transaction-pooler","port":"6543"`.

Measured effect of the same 40-concurrent-request burst, before → after:

| | Before (direct, 5432) | After (transaction, 6543) |
| --- | --- | --- |
| HTTP 500s | **33 / 40** (first run) | **0 / 40** (two runs) |
| Peak Postgres connections | **63** (of a 60 limit) | **19** |
| Edge-pinned `postgres.js` backends | **up to 48** | **0** (Supavisor multiplexes) |
| p50 under the burst | 462 ms (mostly failures) | ~0.99–1.04 s (all succeed) |

**To revert:** set the `DATABASE_URL` Edge secret back to the previous direct URI and redeploy. The
code changes (`server/src/storage/pool-config.ts`, `server/src/edge-entry.ts`) are pooler-agnostic
and safe on either.

### Exact clicks

1. Open [https://supabase.com/dashboard](https://supabase.com/dashboard) → project **FUTASAKU**.
2. Left sidebar → **Project Settings** (gear) → **Database**.
3. Under **Connection string**, choose type **Transaction**, port **6543**, copy the URI.
4. Left sidebar → **Edge Functions** → open **Secrets** (or **Project Settings → Edge Functions → Manage secrets**).
5. **Add new secret**
   - Name: `DATABASE_URL`
   - Value: paste the Transaction URI (same database password you already set)
6. Save. Never paste this into chat, GitHub, or the repo.

### Verify it from outside (no secret needed)

`GET /v1/health?db=1` now reports the pooler the secret actually points at — classification only,
never the URL, host or password:

```sh
curl -sS 'https://wbfrbeedlvjercrukngn.supabase.co/functions/v1/duel/v1/health?db=1'
# {"ok":true,"rulesVersion":"…","serverNow":…,"db":{"ok":true,"ms":173,
#   "pooler":"transaction-pooler","port":"6543"}}
```

| `db.pooler` | Meaning |
| --- | --- |
| `transaction-pooler` | Correct — the 6543 Supavisor pooler. |
| `session-pooler` | Wrong pooler for Edge — switch the secret to 6543 (above). |
| `direct` | `db.<ref>.supabase.co` — switch the secret to 6543. |
| `local` / `unknown` | Not a managed pooler; re-copy the Transaction URI. |

### Tuning the Edge pool without a code change

Every value is an Edge secret with a safe clamp (see `server/src/storage/pool-config.ts`):

| Secret | Default | Clamp | Meaning |
| --- | --- | --- | --- |
| `EDGE_POOL_MAX` | `2` | 1–4 | Connections one warm isolate may hold |
| `EDGE_POOL_IDLE_TIMEOUT` | `10` | 2–120 | Seconds an idle connection may sit |
| `EDGE_POOL_MAX_LIFETIME` | `60` | 15–900 | Seconds before a connection is recycled |
| `EDGE_POOL_CONNECT_TIMEOUT` | `8` | 2–30 | Seconds to wait for a new connection |

Do **not** raise `EDGE_POOL_MAX` to "fix" 500s on the Session pooler: more connections per isolate
makes the exhaustion worse. Switch to the Transaction pooler instead. Redeploy after changing a
secret so a fresh isolate picks it up.

## Deploy the full duel API from this repo

On a machine that has this branch and Node 20+:

```sh
# 1) Build the Deno bundle (minified, postgres stays as npm: import)
node server/scripts/build-edge.mjs

# 2) Log in once (browser window)
npx supabase login

# 3) Deploy (JWT verification stays off — our own bearer tokens)
npx supabase functions deploy duel --project-ref wbfrbeedlvjercrukngn --no-verify-jwt
```

**If you prefer the dashboard:** Edge Functions → **duel** → deploy from CLI is the supported path for this sized bundle; the agent can also redeploy via MCP once `DATABASE_URL` is set.

## Rate limits (Edge secrets — tune without a code change)

Per-IP limits are **NAT-friendly** because a household / cafe / office / mobile carrier shares one
public IP. The **per-player** limits (keyed by each player's token) are the real anti-abuse control
and stay tight. The client IP is read from `cf-connecting-ip` (Cloudflare-protected), then
`x-real-ip`, then the leftmost *public* `x-forwarded-for` entry — real players are never dumped into
a shared `unknown` bucket. See [`BACKEND.md`](BACKEND.md#rate-limits-nat-friendly) for the full model.

Every limit is overridable with an Edge Function secret/env var; the code default is the value in
brackets. Set only the ones you want to change:

| Secret / env var | Default | Meaning |
| --- | --- | --- |
| `RATE_GUEST_PER_IP_PER_HOUR` | `200` | Guest creations per IP per hour |
| `RATE_JOIN_PER_PLAYER_PER_HOUR` | `60` | Joins per **player** per hour (anti-abuse) |
| `RATE_JOIN_PER_IP_PER_HOUR` | `400` | Joins per IP per hour |
| `RATE_LINK_CODE_PER_PLAYER_PER_HOUR` | `10` | Link codes per player per hour |
| `RATE_LINK_REDEEM_PER_IP_PER_HOUR` | `20` | Link-code redemptions per IP per hour |
| `RATE_ACTIONS_PER_PLAYER_PER_MINUTE` | `120` | Actions per player per minute |
| `RATE_SWEEP_PER_IP_PER_HOUR` | `120` | Sweeps per IP per hour |
| `SWEEP_CRON_TOKEN` | unset | Shared secret so a cron/CI sweeper gets its own bucket |

When `SWEEP_CRON_TOKEN` is set, a caller sending the matching `x-futasaku-cron: <token>` header on
`POST /v1/sweep` uses the dedicated `sweep:internal` bucket, so player traffic can never exhaust the
housekeeping budget. Without it, sweeps use the normal per-IP bucket.

```sh
# Optional: set one or more overrides (never print the values afterwards)
npx supabase secrets set --project-ref wbfrbeedlvjercrukngn RATE_GUEST_PER_IP_PER_HOUR=200
# Then redeploy so a fresh isolate picks them up.
```

### Smoke the deployed URL

```sh
curl -sS 'https://wbfrbeedlvjercrukngn.supabase.co/functions/v1/duel/v1/health'
curl -sS 'https://wbfrbeedlvjercrukngn.supabase.co/functions/v1/duel/v1/health?db=1'
# Expect: ok, rulesVersion, serverNow, and db.ok when the full bundle + secret are live
```

Or point a local smoke at it (no secrets printed):

```sh
BASE_URL=https://wbfrbeedlvjercrukngn.supabase.co/functions/v1/duel npm run server:smoke
```

## If you see 500s (`code: "INTERNAL"`)

The most common live failure is the shared project running out of **database connections**, not a
game bug. Work through this list:

1. **Confirm the pooler.** `curl -sS '…/duel/v1/health?db=1'` → `db.pooler` must be
   `transaction-pooler` on port `6543`. If it says `session-pooler` or `direct`, switch the
   `DATABASE_URL` secret to the Transaction URI (above) and redeploy. This is the durable fix.
2. **Check how close the project is to its limit.** The free tier allows **60** connections with
   **3** reserved and ~6 used by Supabase services (~50 usable). Bursts that open many connections
   at once are the risk, especially with more than one load driver or a redeploy in flight.
3. **Isolate the cause.** `400`/`409`/`422` are correct refusals (bad input, stale revision, illegal
   action) — only `500`/`503` are infrastructure. A `503` with `code: "DB_UNAVAILABLE"` is the
   bounded, retried "the pooler was briefly saturated" path; it is expected to be rare.
4. **A redeploy drops in-flight invocations.** The platform logs `Shutdown … reason: "EarlyDrop"`.
   Those requests can surface as a one-off 500; the client retries safely with a stable `requestId`,
   so a player sees at worst a short pause.
5. **Do not raise `EDGE_POOL_MAX` to chase 500s** — that adds connections per isolate. Lower it, or
   shorten `EDGE_POOL_MAX_LIFETIME`, only to *reduce* the project's footprint on the Session pooler;
   the real fix is the Transaction pooler.
6. **Reproduce lightly.** A short burst of 20–40 concurrent `?db=1` calls (they are not rate
   limited) is enough to see exhaustion without disturbing the shared project:

   ```sh
   for i in $(seq 1 40); do
     curl -sS -o /dev/null -w '%{http_code}\n' '…/duel/v1/health?db=1' &
   done > /tmp/duel-codes.txt; wait
   sort /tmp/duel-codes.txt | uniq -c
   # Expect: 40  200. Many 500s ⇒ check step 1.
   ```

7. **Only one driver at a time.** The function is shared; two agents (or a soak plus a redeploy) at
   once is the worst case for the free tier and produces 500s that are not a code defect.

## GitHub Actions variables (public — not Secrets)

Repo → **Settings** → **Secrets and variables** → **Actions** → tab **Variables** → **New repository variable**:

| Name | Value |
| --- | --- |
| `FUTA05_API_URL` | `https://wbfrbeedlvjercrukngn.supabase.co/functions/v1/duel` |
| `VITE_DUEL_API_URL` | same as above (for the web build later) |
| `VITE_SUPABASE_URL` | `https://wbfrbeedlvjercrukngn.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Project Settings → **API Keys** → **anon** / **public** key |

The anon key is public by design. Never put the **service_role** key or `DATABASE_URL` in Variables.

## Keep-alive (P-2)

Workflow: `.github/workflows/futa05-keepalive.yml` — every 2 days, and on **Run workflow**.

It calls `GET $FUTA05_API_URL/v1/health?db=1` so a real database query runs (helps prevent the free project pausing after ~1 week idle). It is a single job: fails loudly if the `FUTA05_API_URL` variable is missing, then asserts `ok`, `rulesVersion`, `serverNow` and `db.ok`.

**Verified 2026-10-13:** the `FUTA05_API_URL` repository Variable is set to
`https://wbfrbeedlvjercrukngn.supabase.co/functions/v1/duel`, and the workflow's exact steps were
run against the live API: HTTP 200, `db.ok=true` (real Postgres round-trip, ~160 ms), correct
`rulesVersion`. The missing-variable path prints the clear message and exits 1 — both paths behave
as designed.

> **Blocker (must be fixed for the schedule to ever fire): the workflow only exists on the
> `futa0.5-online` branch, not on the default branch (`main`).** GitHub runs `schedule` triggers —
> and allows `workflow_dispatch` — **only for a workflow file that is present on the default
> branch**. Until this file is on `main`, the 2-day schedule will never run and
> `workflow_dispatch` returns 404 (confirmed: `POST …/actions/workflows/futa05-keepalive.yml/
> dispatches` → `404 Not Found`). No keep-alive run has ever executed. Landing this workflow on the
> default branch is the owner's/maintainer's call (this worker does not touch `main`).

**If GitHub stops scheduled workflows** (~60 days with no repo activity):

1. GitHub → **Actions** → **futa05-keepalive** → **Enable workflow** (or push any commit).
2. Optionally click **Run workflow** once.

**If the workflow is missing from Actions entirely** (most likely because it is still only on a
side branch): copy `.github/workflows/futa05-keepalive.yml` onto the default branch, then
**Actions → futa05-keepalive → Run workflow**. Verify the repo Variable `FUTA05_API_URL` is still
set under **Settings → Secrets and variables → Actions → Variables**.

**If the Supabase project is paused:**

1. Dashboard → **FUTASAKU** → **Restore** / resume the project.
2. Re-run the keep-alive workflow (or click **Run workflow**).
3. Confirm `…/v1/health?db=1` returns `ok`.

## Read logs

1. Dashboard → **Edge Functions** → **duel** → **Logs**.
2. Or: `npx supabase functions logs duel --project-ref wbfrbeedlvjercrukngn`

Logs show method, path, status and duration only — never tokens or request bodies.

## Rotate keys

| Key | How |
| --- | --- |
| Database password | Dashboard → Project Settings → Database → **Reset database password**, then update local `.env` **and** the Edge Function `DATABASE_URL` secret (Transaction URI with the new password). |
| Anon key | Rarely needed; if rotated, update the GitHub Variable `VITE_SUPABASE_ANON_KEY` and redeploy the web preview. |
| Guest player tokens | Not rotatable in bulk yet — each browser holds its own token (see Settings “another browser” link-code in later phases). |

## Preview channel `/futa0.5/` (Phase 8)

```sh
CHANNEL=futa05 VITE_FIND_OPPONENT=1 \
  VITE_DUEL_API_URL=https://wbfrbeedlvjercrukngn.supabase.co/functions/v1/duel \
  npm run web:build
# Compose into an existing Pages site tree (keeps Main / futa0.4):
node scripts/compose-futa05-preview.mjs site web/dist "$(git rev-parse HEAD)"
```

CI builds the dist on branch `futa0.5-online` via `.github/workflows/futa05-preview.yml` (artifact only — does not wipe other Pages routes). Find Opponent stays **off** on product `futa04` builds.

## Local development (unchanged)

```sh
# Session pooler in .env (port 5432) — never commit .env
npm run server:migrate
npm run server:dev          # CORS * for local
CORS_ORIGIN=https://severgrow.github.io npm run server:dev   # production CORS locally
npm run server:verify
```

## Security reminder (P-21)

Every new table must enable RLS and `revoke all from anon, authenticated` in the same migration. Supabase grants those roles full access by default. See `docs/BACKEND.md` and `docs/ONLINE-PLAN.md`.
