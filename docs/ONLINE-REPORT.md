# FUTASAKU 0.5 Online Duels — final report

**Branch:** `futa0.5-online`  
**Date:** 2026-10-12  
**Game name:** FUTASAKU  

> **Superseded (note added 2026-10-14) — history kept below.** This is the dated final report for the
> 2026-10-12 pass; some items have moved on since:
> - **Keep-alive (P-2):** no longer a GitHub Actions workflow — that workflow never ran (GitHub only
>   fires schedules from the default branch) and was **deleted**. The keep-alive is now the
>   Supabase-native `pg_cron` job `futasaku-keepalive` (now **daily** at 06:17 UTC, migration
>   `0007_daily_sweeper.sql`; it was every 2 days when this report was written: `GET /v1/health?db=1`
>   then `POST /v1/sweep`). See
>   [`DEPLOY-ONLINE.md`](DEPLOY-ONLINE.md#keep-alive-p-2--supabase-native-no-github).
> - **P-12 "no grace":** the one-grace-per-player rule now exists (migration `0004_timeout_grace.sql`).
> - **Owner follow-ups #2 and #4** are done/obsolete: `/futa0.5/` is published, and there is no GitHub
>   keep-alive schedule left to re-enable.
> - The live transport is now the Realtime broadcast **ping** (polling is the safety net), and a
>   reconnect **replays** the missed turns (2× with Skip). See [`ONLINE-SMOOTHNESS.md`](ONLINE-SMOOTHNESS.md).
>
> Current status: [`ONLINE.md`](ONLINE.md).

## What shipped

Online duels are live on Supabase Edge (`duel`) with the shared `src/engine/` (no rule changes). Players create/join friend matches, play Draw → local draft → Throw on the shared board with seat perspective (Me=moss), resign, and see finished screens. Catch-up replay runs at 2×. Find Opponent is behind a flag (on for `CHANNEL=futa05` / `VITE_FIND_OPPONENT=1`).

| Phase | Commit (approx) | Result |
| --- | --- | --- |
| 0–4 | through `832af4d` | Plan, Edge API, server deadlines/lists, client layer, perspective, lobby |
| 5 | `8391989` | Shared-board turn path, resign, catch-up, offline regression |
| 6 | `e06b604` | Two-browser Playwright, leak/409/load, DB RLS + advisors |
| 7 | `1b99bdb` | Find Opponent + migration `0003_open_queue` + Edge redeploy |
| 8 | this | Docs, preview build workflow, this report |
| 7.5 | server `f85c7c8` + client | Parked search never drops a player, honest computer fallback, timeout grace — see [`docs/FIND-OPPONENT.md`](./FIND-OPPONENT.md) |

## How to play (test)

1. Preview build with API URL (GitHub Variable `VITE_DUEL_API_URL` or local env).
2. **Play online** → Create a duel / Join with a code (or **Find opponent** on futa05).
3. Draw commits privately; Grow drafts locally with Undo; Throw sends the batch.
4. Opponent sees the whole turn only after Throw (2× catch-up).
5. 24h turn clock; miss it → timeout loss. Resign available.

## Preview `/futa0.5/`

```sh
CHANNEL=futa05 VITE_FIND_OPPONENT=1 \
  VITE_DUEL_API_URL=https://wbfrbeedlvjercrukngn.supabase.co/functions/v1/duel \
  npm run web:build
# Then compose into an existing Pages site tree (does not wipe Main/futa0.4):
# node scripts/compose-futa05-preview.mjs site web/dist "$(git rev-parse HEAD)"
```

CI: `.github/workflows/futa05-preview.yml` builds the dist artifact on `futa0.5-online` (does not auto-deploy Pages, so existing routes stay safe).

## Predicted problems (P-1 … P-21)

| # | Status | Notes |
| --- | --- | --- |
| P-1 Hosting | **Handled** | Edge + Transaction 6543; CPU ≪ 2s |
| P-2 Pause / GH schedule | **Handled** | Keep-alive workflow; Restore docs |
| P-3 iOS storage | **Handled** | Settings note + link codes |
| P-4 Invite other browser | **Handled** | Guest on join; `#/join/CODE` |
| P-5 SW / old client | **Handled** | Version handshake; API not cached |
| P-6 Hidden leaks | **Handled / tested** | Turn-gated views; Phase 6 leak audit |
| P-7 Shadow mismatch | **Handled / tested** | 200/0 shadow-equivalence |
| P-8 Deadline / two tabs | **Handled / tested** | Row lock; STALE_REVISION 409 |
| P-9 Timer skew | **Handled** | serverNow offset countdown |
| P-10 Seat 1 perspective | **Handled / tested** | Map/unmap + screenshots |
| P-11 Realtime limits | **Handled** | Ping hint; poll is truth |
| P-12 Forgotten matches | **Handled** | Deadline UI; last-2h warning; no grace (not requested) |
| P-13 Abuse | **Handled** | Rate limits; 10 open matches |
| P-14 Rules drift | **Handled** | Match stores rules version |
| P-15 Growth / N+1 | **Handled** | One-query list + indexes |
| P-16 Flaky e2e | **Handled** | State waits in two-browser e2e |
| P-17 CORS | **Handled** | Locked to `https://severgrow.github.io` |
| P-18 A11y countdown | **Handled** | Tone + text; not colour alone |
| P-19 Time zones | **Handled** | Durations only |
| P-20 Two devices | **Handled / tested** | 409 + refetch |
| P-21 Default grants | **Handled / tested** | RLS deny-all; advisor INFO intentional |

**Performance advisors (INFO):** unused indexes expected until load; optional future index on `match_moves.player_id` FK.

## Owner follow-ups (non-blocking)

1. Confirm GitHub Actions Variables: `VITE_DUEL_API_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
2. Publish `/futa0.5/` by composing the `futa05-preview-dist` artifact into the live Pages tree (or extend the futa0.4 preview workflow carefully).
3. Two-phone playtest when convenient.
4. Re-enable keep-alive if GitHub disables the schedule after ~60 idle days.

## Out of scope (unchanged)

Engine/rule changes, password/social accounts, push, ranking, world map, rewards, chat, spectators, locked build, renaming the game.
