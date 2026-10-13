# Deploy FUTASAKU online (test channel)

Plain-English guide for the live duel API on the one Supabase project **FUTASAKU**
(`wbfrbeedlvjercrukngn`, eu-west-1).

The game site stays on GitHub Pages. The API runs as a **Supabase Edge Function** named `duel`.

## What is deployed today

| Piece | URL / place |
| --- | --- |
| Edge Function | `https://wbfrbeedlvjercrukngn.supabase.co/functions/v1/duel` |
| Health | `…/duel/v1/health` (add `?db=1` for a real database ping once the full bundle is live) |
| CORS | Locked to `https://severgrow.github.io` (no path on the origin) |
| JWT gate | **Off** — guests use our own bearer tokens, not Supabase Auth |

**Current status (2026-10-12):** full `duel` Edge Function is live via CLI deploy (`verify_jwt` off, CORS locked). Health is not a stub; `?db=1` returns `db.ok`; `npm run server:smoke` against the deployed URL passed. Redeploy after server changes with the CLI steps below (needs `SUPABASE_ACCESS_TOKEN` or `npx supabase login`).

## One-time: put the database secret on the Edge Function

Migrations and local tests use the **Session** pooler (port **5432**). The Edge Function must use the **Transaction** pooler (port **6543**) with prepared statements off (already coded).

**Exact clicks:**

1. Open [https://supabase.com/dashboard](https://supabase.com/dashboard) → project **FUTASAKU**.
2. Left sidebar → **Project Settings** (gear) → **Database**.
3. Under **Connection string**, choose type **Transaction**, port **6543**, copy the URI.
4. Left sidebar → **Edge Functions** → open **Secrets** (or **Project Settings → Edge Functions → Manage secrets**).
5. **Add new secret**
   - Name: `DATABASE_URL`
   - Value: paste the Transaction URI (same database password you already set)
6. Save. Never paste this into chat, GitHub, or the repo.

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

It calls `GET $FUTA05_API_URL/v1/health?db=1` so a real database query runs (helps prevent the free project pausing after ~1 week idle).

**If GitHub stops scheduled workflows** (~60 days with no repo activity):

1. GitHub → **Actions** → **futa05-keepalive** → **Enable workflow** (or push any commit).
2. Optionally click **Run workflow** once.

**If the Supabase project is paused:**

1. Dashboard → **FUTASAKU** → **Restore** / resume the project.
2. Re-run the keep-alive workflow.
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
