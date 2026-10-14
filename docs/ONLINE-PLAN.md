# FUTASAKU 0.5 — Online Duels plan (Phase 0)

**Branch:** `futa0.5-online` (from `futa0.5-supabase-verify`, plus one merge of `futa0.4` tutorial polish).  
**Status:** Phase 0–8 green (2026-10-12). Online duels complete on this branch: shared-board play, hardening proofs, Find Opponent (flagged), preview build workflow, final report in `docs/ONLINE-REPORT.md`. Hosting: **Supabase Edge Functions**.  
**Rules:** the browser and the server keep using the **same** `src/engine/`. No rule changes. Test channel only. The game is always called **FUTASAKU**.

This document is in plain English for the owner. Code details live in the phase commits.

---

## 1. What we are building (one picture)

Online is **one** kind of match: live when both people are on the page, asynchronous when they are not. The match always lives in the database.

While you are mid-turn the opponent sees **nothing** change. When you Throw your last card, your **whole turn** is revealed at once and plays as one animated replay. Each complete turn has a **24-hour** limit. Miss the limit → you lose (“timeout”). You can also Resign.

**Build order:** Play with a friend + hybrid system first. Find Opponent last (Phase 7), behind a flag.

Menu: FUTASAKU, then PLAY ONLINE / PLAY OFFLINE. Offline stays exactly as today. (The tagline **GROW · CONNECT · CONQUER** was shown here in the first phases and was **removed from the menu on 2026-10-14**; the words survive in `src/strings.ts` (`ONLINE.tagline`) and `main.ts` re-inserts the element behind the one-line `SHOW_MENU_TAGLINE` switch — see `docs/DECISIONS.md`.)

---

## 2. Prerequisites (checked)

| Check | Result |
| --- | --- |
| Database verification finished on `futa0.5-supabase-verify` | **Yes** — commit `12c3866`. `docs/DATABASE-VERIFICATION.md` says migrate, 17 real-DB tests, and smoke passed. |
| `npm run server:verify` on this branch | **PASSED** after a small test fix: the verify script now saves the client session before calling `resume()` (same as a real page refresh). |
| Tools available | Supabase MCP (project **FUTASAKU**, ref `wbfrbeedlvjercrukngn`, eu-west-1), `DATABASE_URL` in git-ignored `.env` (Session pooler port **5432**), `npx supabase` CLI available, security advisors readable. |
| Missing for API go-live | Edge Function code + Deno HTTP/crypto/`prepare:false` DB client (Phase 1 writes these). Edge Function **secret** for the Transaction pooler URL (port **6543**). GitHub Actions **Variables** for the public API URL, Supabase URL, and anon key. |
| Other agents in the last hour | `origin/futa0.4` moved (`c9c3286` tutorial polish) — **merged in**, not touched further. Another agent may still edit the tutorial: **do not touch tutorial files / tutorial e2e / `futa0.4`**. |
| Database tests never skip silently | Loud `*** DATABASE TESTS SKIPPED ***` when `DATABASE_URL` is missing. `npm run server:db-test` sets `REQUIRE_DATABASE=1` so a missing URL **fails**, not a quiet green. CI without a URL still skips under `npm run check`, but prints the loud line. |

### Exact clicks you may need later (Phase 1)

**A. Put the Transaction pooler URL into Edge Function secrets** (runtime DB; migrations stay on Session 5432):

1. Open [https://supabase.com/dashboard](https://supabase.com/dashboard) → project **FUTASAKU**.
2. Left sidebar → **Project Settings** (gear) → **Database**.
3. **Connection string** → type **Transaction** → port **6543** → copy (URI). Password is the database password you already set.
4. Left sidebar → **Edge Functions** → **Secrets** (or **Project Settings → Edge Functions → Secrets**).
5. **Add secret** → name `DATABASE_URL` → paste the Transaction URI → Save.  
   Never paste this into chat, GitHub, or the repo.

**B. Public values for the web build** (not secrets — GitHub **Variables**, not Secrets):

1. GitHub repo → **Settings** → **Secrets and variables** → **Actions** → tab **Variables**.
2. **New repository variable** for each:
   - `VITE_DUEL_API_URL` — the deployed Edge Function base URL (Phase 1 will give you the exact string after deploy).
   - `VITE_SUPABASE_URL` — `https://wbfrbeedlvjercrukngn.supabase.co`
   - `VITE_SUPABASE_ANON_KEY` — Project Settings → **API Keys** → **anon** / **public** key (safe to put in the client).

**C. If the free project pauses after ~1 week idle:** Dashboard → project → **Restore** / resume. The Supabase-native `pg_cron` job `futasaku-keepalive` (migration `0005_keepalive_cron.sql`, every 2 days) keeps it awake with a real DB round trip and runs the sweeper; it replaced the GitHub workflow, which never fired from a side branch. See [`DEPLOY-ONLINE.md`](DEPLOY-ONLINE.md#keep-alive-p-2--supabase-native-no-github).

---

## 3. Hosting decision (P-1) — measured

**Choice: Supabase Edge Functions** hosting the same `MatchService` against Postgres through the **Transaction** pooler (6543). Migrations and DB tests keep using the **Session** pooler (5432).

### Measurements (`server/scripts/hosting-spike.ts`, MemoryStorage, late game rev≈41, hand=8, Bloom legal, 24 samples)

| Path | Wall p95 (ms) | CPU p95 (ms) | CPU max (ms) |
| --- | --- | --- | --- |
| `legalActions` alone | ~2.5 | ~4.3 | ~5.3 |
| `viewFor` only (no legal) | ~0.9 | ~0.1 | ~0.4 |
| `viewFor` + `legalActions` | ~2.9 | ~5.4 | ~6.7 |
| `service.viewPayload` | ~3.1 | ~6.3 | ~6.5 |
| `applyAs` (decide core) | ~0.3 | ~0.9 | ~1.3 |
| `service.submitAction` | ~4.4 | ~2.7 | ~3.8 |

**No sample over 300 ms CPU.** Worst CPU ≈ **7 ms** vs Edge’s **2 s** budget (~0.3%). Comfortable.

**Optimisation kept for Phase 1+:** the server may stop attaching `legalActions` on every view (the client already computes them from its own View with the shared engine). The server still fully validates every submitted action.

**Port work (not blockers, estimated &lt;1 day):** replace `node:http` with `Deno.serve`, `node:crypto` in `ids.ts` with Web Crypto, and `pg` with a Deno Postgres client using **`prepare: false`** on port 6543. `MatchService` + engine stay shared.

**Fallback only if Edge fails in Phase 1:** a small free Node host (Render cold starts often 30s+; Fly may ask for a card). We will **ask you before** opening any paid account.

---

## 4. Shadow / turn-gated design (P-7) — proved

Decided design (do not change without asking):

1. **Draw** commits to the server immediately (only the server knows the deck). Stored privately: the opponent’s view, events, list entry and live ping do **not** change because of it.
2. After Draw, Grow / Bloom / Strengthen / Bomb / Blast are a **local draft** on a **shadow State** built from my View (my hand and board real; deck and opponent hand = placeholder cards with the right counts), same engine, Undo works as offline.
3. At **Throw**, the client sends the whole draft as **one atomic batch**. The server re-validates every action in order; all succeed or all fail.

**Proof:** `server/tests/shadow-equivalence.test.ts` — **200 / 0** mid-turn equivalence (legal actions + apply results for public actor slice), including ~30 deck-end samples. Placeholder card ids start at 50_000 so they never collide with the real deck. **No STOP** — shadow mid-turn preview looks reliable.

---

## 5. UI seam audit (summary)

Today’s UI is a local PvE shell: `HUMAN = 0`, `BOT = 1`, full `State` in `Session`, bot planner, moss = seat 0 / lava = seat 1.

**Smallest clean seam (Phases 3 / 3b — not coded in Phase 0):**

- **`Perspective`:** implemented in `web/src/online/perspective.ts` — `me` / `opp`; mine → moss/tree/bottom; theirs → lava/volcano/top. Offline keeps `me = 0` (identity mapping). Online seat 1 rotates board coords 180° `(q,r) → (-q,-r)` for paint/taps; text never rotates. Scores read Me:Opponent; captions You/Opponent.
- **`MatchDriver`:** `LocalDriver` (today’s Session + bot) vs `OnlineDriver` (Views + filtered events only; never full State). Shared: board, hand, `AnimQueue`, sounds. OnlineDriver snapshot exposes `screenView` / `screenLegal` / `screenEvents` plus perspective flags (coach off online).
- Service worker `web/public/futa04-sw.js`: cross-origin API is already not cached; if the API is ever same-origin under the app path, add an explicit bypass so match GETs are never cached.

Phase 0 does **not** heavily edit `web/src/main.ts` (another agent owns tutorial work there).

---

## 6. The 21 predicted problems — planned fix

| # | Problem | Phase | Planned fix |
| --- | --- | --- | --- |
| P-1 | Hosting / Edge limits / pooler | 0, 1 | Edge + Transaction 6543 + `prepare:false`; Session 5432 for migrate/tests. Measured CPU ≪ 2 s. |
| P-2 | Free project pause; GH schedule dies at ~60 days | 1, 8 | Keep-alive Actions every 2 days hitting `/v1/health?db=1` + sweeper; document Restore + re-enable workflow. |
| P-3 | iOS Safari vs Home Screen storage | 2, 3, 4 | Honest Settings warning + one-time 8-char link code (10 min, single use, rate limited) → **new** token for same player. Never move an existing token. |
| P-4 | Invite opens in another browser | 4 | Join creates guest on the spot; deep link `#/join/CODE` survives redirect. |
| P-5 | SW caching / old client | 2, 3 | Never cache API; client version handshake → `CLIENT_TOO_OLD` + “Reload to update FUTASAKU”. |
| P-6 | Hidden-info leaks | 2, 3, 6 | Turn-gated views from `turn_start_state`; audit network + Realtime in Phase 6. |
| P-7 | Shadow mismatch | 0, 3 | Proved 200/0; keep test green; STOP if it later fails. |
| P-8 | Deadline races / two tabs | 2 | One decision inside row-locked transaction; lazy + sweeper; idempotent. |
| P-9 | Throttled timers / skew | 3 | Countdown from timestamps + `serverNow` offset; never accumulate intervals. |
| P-10 | Seat 1 perspective bugs | 0, 3b, 6 | One map/unmap; screenshots seat 0 vs 1. |
| P-11 | Realtime limits / outages | 2, 3, 6 | Broadcast ping is a hint; polling is truth. |
| P-12 | Forgotten matches / no push | 4, 5 | Visible deadline, last-2h warning, title count, one-tap nudge. **Grace rule:** not added unless you ask; recommendation in Phase 5 report. |
| P-13 | Abuse | 2 | Postgres rate limits; 10 open matches; 8-char codes; same error for wrong/expired. |
| P-14 | Rules drift | 2 | Match stores rules version forever; refuse unreplayable versions; keep golden games. |
| P-15 | Growth / N+1 / storage | 2, 6 | One-query match list + indexes; report storage per finished match. |
| P-16 | Flaky e2e | 6 | Wait on state, never fixed sleeps; retry network only. |
| P-17 | CORS | 1 | Lock to `https://severgrow.github.io`; no prod wildcard. |
| P-18 | A11y countdown spam | 5 | Announce only at 2h / 15m / time’s up; status not colour-alone. |
| P-19 | Time zones | 4, 5 | Durations only (“18h 42m”), never clock times. |
| P-20 | Two devices one player | 2, 6 | Second gets clean 409; recover by refetch. |
| P-21 | Supabase default grants | 2, 6 | Every new table: RLS + revoke anon/authenticated; migration 0002 `alter default privileges … revoke`; tests as anon/authenticated DENIED; advisors clean; no tables in `supabase_realtime` publication; document in `BACKEND.md`. |

*(Final report after Phase 8 will mark each: handled / tested / not handled and why.)*

---

## 7. Phase list (order locked)

| Phase | What | Commit when green |
| --- | --- | --- |
| **0** | Read, audit, decide, spikes, this plan | This milestone |
| **1** | Live API on Edge, CORS, `/v1/health?db=1`, keep-alive workflow, public build vars, `docs/DEPLOY-ONLINE.md` | After deployed smoke |
| **2** | Migration 0002, deadlines, gated views, batch, resign, lists, link codes, rate limits, ping, security tests | After server suite green |
| **3** | `web/src/online/` client layer (identity, sync, draft, OnlineDriver) — no full screens yet | After unit tests green |
| **3b** | Perspective mapping (seat 1) before screens | After map tests + screenshots |
| **4** | Menu + lobby (Play with a friend, match list, storage note) | After UI checks |
| **5** | Duel screen (timer, private turn, replay, resign) | After flow checks |
| **6** | Two-browser Playwright, leak audit, load, security re-check | After proof suite |
| **7** | Find Opponent behind flag (only if 0–6 green) | Or skip with reason |
| **8** | Docs, `/futa0.5/` preview, final report to you | Final |

**Out of scope:** engine/rule changes, password/social accounts, push, ranking, world map, rewards, chat, spectators, locked build, renaming the game.

---

## 8. What you must do yourself

1. **Nothing blocking Phase 0** — verify and spikes are done on this machine.
2. **Phase 1:** add the Edge Function `DATABASE_URL` secret (clicks in §2 A) if the agent cannot set it via CLI/MCP. Confirm GitHub Variables (clicks in §2 B) when asked.
3. **Later:** two-phone playtest script (Phase 8). The keep-alive is now a database `pg_cron` job — no GitHub re-enabling needed.
4. **Do not** share the database password, service role key, or `.env` in chat.

---

## 9. Branch hygiene

- Work only on **`futa0.5-online`**.
- Do **not** modify `main`, `dev`, locked build, or **`futa0.4`**.
- Merged `origin/futa0.4` commit `c9c3286` (tutorial polish) via merge (no rebase). Further tutorial edits by other agents: leave alone.
- `.env` stays git-ignored. Never commit secrets.

---

## 10. Evidence files from Phase 0

| File | Role |
| --- | --- |
| `server/scripts/hosting-spike.ts` | CPU / wall timings + Edge portability verdict |
| `server/tests/shadow-equivalence.test.ts` | 200-turn shadow proof (P-7) |
| `server/scripts/verify.ts` | Saves session before `resume()` (real refresh path) |
| `server/tests/postgres.integration.test.ts` | Loud skip + `REQUIRE_DATABASE` |
| `package.json` | `server:db-test` sets `REQUIRE_DATABASE=1` |
| `docs/ONLINE-PLAN.md` | This plan |
