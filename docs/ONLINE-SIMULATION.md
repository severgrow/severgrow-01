# FUTASAKU 0.5 — online duels: live fix, who-starts, and the 30-game simulation

**Branch:** `futa0.5-online`
**Date:** 2026-10-13
**Live:** https://severgrow.github.io/severgrow-01/futa0.5/
**API:** https://wbfrbeedlvjercrukngn.supabase.co/functions/v1/duel
**Rules:** `futasaku0.4-strength-draw` (browser and Edge share `src/engine/`; no rule changes)

This is the deliverable report for the online-duels pass: the live failure, the who-starts gap, the
30-game simulation, and the UI/UX walk. Everything below was reproduced and fixed on
`futa0.5-online`; secrets are never printed.

> **Update (note added 2026-10-14) — history kept below.** Dated deliverable report for the
> 2026-10-13 pass. Changed since:
> - **U4 / presence:** the "Realtime channel is a no-op stub" claim is **wrong** — the realtime
>   broadcast **pings work** (see [`ONLINE-SMOOTHNESS.md`](ONLINE-SMOOTHNESS.md)). The **presence
>   indicator is deliberately hidden**, not reading "Unknown".
> - **U5 / rate limit:** the per-IP guest cap is now **200/hour** (it was 30 at the time); every limit
>   is `RATE_*`-tunable.
> - **Invite codes** are now **4 characters** (the Phase D walk recorded an 8-char code).
> - A hidden tab now polls at the **30 s hidden cadence** (the matrix note in §Phase D said "2 s").
>
> Current status: [`ONLINE.md`](ONLINE.md).

---

## Phase A — the live guest-creation failure (fixed)

**Report:** opening `/futa0.5/` in two browsers showed *"Could not create a FUTASAKU guest. Check
your connection and try again."*

**Root cause: CORS preflight.** The browser sends two custom headers on every duel request
(`x-futasaku-client-version`, `x-futasaku-rules-version`); because `content-type: application/json`
is not CORS-safelisted, the browser always sends a preflight `OPTIONS`. The Supabase Edge entry had
its **own** short CORS constant — `access-control-allow-headers: authorization, content-type` — and
answered `OPTIONS` from it. The browser then blocked the real `POST /v1/guests`, so guest creation
failed even though `curl` worked (curl does not preflight).

Two divergent CORS lists existed:

| Path | `access-control-allow-headers` before |
| --- | --- |
| `server/src/fetch-app.ts` (Node + shared app) | `authorization, content-type, x-futasaku-client-version, x-futasaku-rules-version` |
| `server/src/edge-entry.ts` (Edge `OPTIONS`) | `authorization, content-type` ← **bug** |

**Fix:** one source of truth, `server/src/cors.ts` (`CORS_ALLOWED_HEADERS`, `CORS_ALLOWED_METHODS`,
`corsHeaders`, `corsPreflight`). Both the shared app and the Edge entry import it. Additive guard:
`server/tests/edge-cors.test.ts` asserts the shared preflight and the Edge entry preflight agree and
that `edge-entry.ts` never defines its own `access-control-allow-headers` literal again.

**Proved live** with two real Playwright browser contexts (`web/e2e/online-live-proof.ts`,
`BASE_URL=https://severgrow.github.io/severgrow-01/futa0.5/`): both create guests, one creates a
match, the other joins by code, both reach the duel, seats differ, and there are **no console or
network errors**. Edge redeployed (`bundle.ts`, CLI `--use-api`).

```
PASS  A: guest identity stored     PASS  B: guest identity stored
PASS  A: invite code shown         PASS  B: reached duel after join
PASS  A: reached duel after join   PASS  A/B seats differ (A=0 B=1)
PASS  A/B: no console/network errors
```

---

## Phase B — who starts (fixed)

**Report:** the match *"doesn't pick who starts"*.

The engine already decides the first seat with a seeded lottery (`startingPlayerFor` /
`matchSetup`, `startingPlayerLottery: true` for Futasaku 0.4) and the server builds every match
from `matchSetup`. The **online UI never showed it**: the offline `runStarterLottery(...)` banner
was only called from the offline `startGame`, and `MatchViewPayload` did not carry the starting
seat.

**Fixes (online path only, no engine rule change):**

- `MatchViewPayload.startingPlayer` is now sent by the server (`service.payload`); the Edge bundle
  is redeployed. Live check: `startingPlayer 0 · turnPlayer 0 · seat 0`.
- `MatchDriverSnapshot.startingPlayer` exposes it to the online UI.
- `openDuel` runs the same `runStarterLottery` banner as offline, once, on the first turn
  (`turnNumber === 1`), from the starting seat — so seat 1 sees "You start" when it really starts.
- Copy fix: the banner used `OPP.Label` ("Opponent's") → *"Opponent's starts"* now reads
  **"Opponent starts"** (and "Opponent goes first" in the offline log).

Verified in the two-browser walk: desktop *"You start"* / phone *"Opponent starts"* in the same
match, and `startingPlayer === view.turnPlayer` on both seats.

---

## Phase C — 30-game simulation (all green)

Harness: `server/scripts/online-simulation.ts` — plays full duels through the **real** `MatchService`
(via the shared Fetch app) and the **real** `DuelClient` (the same client the browser uses), on both
seats, with the production turn shape:

> `Draw` (committed alone) → local Grow draft on a shadow State → `Throw` = `[…draft, EndAct]` as one
> atomic batch → `Discard` (finishes the turn).

Run with `npx tsx server/scripts/online-simulation.ts` (add `--live` for short games on the deployed
Edge).

### Result table (30 local games, mixed seeds, both seats)

| # | kind | started by | player-turns | ending | result |
| --- | --- | --- | --- | --- | --- |
| 0 | scenario | seat 1 | 20 | deck_exhaustion | PASS |
| 1 | normal | seat 1 | 22 | deck_exhaustion | PASS |
| 2 | normal | seat 0 | 22 | deck_exhaustion | PASS |
| 3 | normal | seat 0 | 22 | deck_exhaustion | PASS |
| 4 | normal | seat 0 | 18 | deck_exhaustion | PASS |
| 5 | scenario | seat 1 | 26 | deck_exhaustion | PASS |
| 6 | normal | seat 1 | 24 | deck_exhaustion | PASS |
| 7 | normal | seat 1 | 22 | deck_exhaustion | PASS |
| 8 | normal | seat 1 | 20 | deck_exhaustion | PASS |
| 9 | normal | seat 1 | 18 | deck_exhaustion | PASS |
| 10 | scenario | seat 0 | 18 | deck_exhaustion | PASS |
| 11 | normal | seat 1 | 22 | deck_exhaustion | PASS |
| 12 | normal | seat 0 | 24 | deck_exhaustion | PASS |
| 13 | normal | seat 1 | 20 | deck_exhaustion | PASS |
| 14 | normal | seat 1 | 22 | deck_exhaustion | PASS |
| 15 | scenario | seat 0 | 24 | deck_exhaustion | PASS |
| 16 | normal | seat 1 | 18 | deck_exhaustion | PASS |
| 17 | normal | seat 0 | 24 | deck_exhaustion | PASS |
| 18 | normal | seat 1 | 26 | deck_exhaustion | PASS |
| 19 | normal | seat 1 | 24 | deck_exhaustion | PASS |
| 20 | scenario | seat 0 | 18 | deck_exhaustion | PASS |
| 21 | normal | seat 0 | 22 | deck_exhaustion | PASS |
| 22 | normal | seat 1 | 20 | deck_exhaustion | PASS |
| 23 | normal | seat 1 | 26 | deck_exhaustion | PASS |
| 24 | normal | seat 1 | 22 | deck_exhaustion | PASS |
| 25 | scenario | seat 0 | 22 | deck_exhaustion | PASS |
| 26 | normal | seat 1 | 22 | deck_exhaustion | PASS |
| 27 | normal | seat 0 | 22 | deck_exhaustion | PASS |
| 28 | normal | seat 0 | 22 | deck_exhaustion | PASS |
| 29 | normal | seat 1 | 24 | deck_exhaustion | PASS |

**30 / 30 pass.** Starting seat varied (seat 0 in 12 games, seat 1 in 18) — the lottery is live in
the simulated path. Each match is dealt from a fresh server seed, so the rows differ between runs;
the run above is the one that also ran the live Edge games. Hidden-information audit:
**656 payloads checked, 0 leaks** (a second run: 678 payloads, 0 leaks).

`END_REASON` here is `deck_exhaustion` for all 30 (bot play spends cards; the deck runs out before
the 30-turns-each cap). A separate **Strangle / surround** ending is proved below, and it also shows
up as a natural ending in some runs (28 deck + 2 strangle in one of them).

### Per-game checks

| Check | How | Result |
| --- | --- | --- |
| pass/fail | duel reaches a result without an illegal/rejected action | 30/30 |
| rules handshake | every served payload `rulesVersion === futasaku0.4-strength-draw` | all |
| hidden information | opponent hand ids + deck ids must never appear in a served payload (checked against the authoritative state after every view) | 656 payloads, 0 leaks |
| deadline correctness | timeout scenario: the seat that must act loses, winner = opponent, `turnDeadlineAt` set | pass |
| latency | wall p50/p95 of view + submit round trips | below |
| Strangle / surround | targeted: a genuine bot-game position handed to the service, winning move submitted through `DuelClient` → `result.reason === 'strangle'` | pass (seed 2) |
| deck-end fair last turn | any active payload with `deckCount === 0` must be the final `ACT` turn (no Draw) | pass |

### Targeted scenarios (all pass)

| Scenario | Result |
| --- | --- |
| duplicate `requestId` replays (no double move) | PASS |
| stale revision rejected (`STALE_REVISION`) | PASS |
| concurrent submit race: exactly one wins | PASS |
| resign hands the win to the opponent | PASS |
| timeout: the seat on the clock loses | PASS |
| reconnect mid-turn returns own Draw since a revision | PASS |
| two tabs of one player: stale tab 409s then recovers by refetch | PASS |
| hidden information: opponent hand/deck ids never in a payload | PASS |
| strangle (surround) ending via the real service | PASS |

### Bugs found by the simulation, fixed at the cause

**C1 — an online turn never completed (the Discard was never sent).** *(fixed)*

A turn is `Draw → Grow draft → Throw(EndAct) → Discard`. `Draw` committed and `Throw` committed
`[…draft, EndAct]`, but `OnlineSession.play` sent `Discard` through `draftPlay` (local only), so the
server stayed in the `DISCARD` step and the board never handed over — both players waited forever.

- Fix: `driver.throwTurn` accepts `EndAct` **or** `Discard`; `OnlineSession.play` and
  `duel-bridge.playScreenAction` route both to the batch submit.
- Regression test: `web/tests/online-turn-complete.test.ts` plays a full turn through the **real**
  `MatchService` + `DuelClient` and asserts the turn passed **and** the server revision advanced
  past the discard. It fails on the old code (the discard stays drafted) and passes now.

### Latency (wall clock, same machine)

| Path | p50 | p95 | n |
| --- | --- | --- | --- |
| local view (GET) | 0.6 ms | 1.2 ms | 1393 |
| local submit (POST) | 1.2 ms | 2.1 ms | 1954 |
| **live Edge view (GET)** | **559 ms** | **622 ms** | 52 |
| **live Edge submit (POST)** | **632 ms** | **721 ms** | 72 |

The local numbers are the service + client round trips with in-memory storage. The live numbers are
real round trips to the deployed Edge (`eu-west`) from this machine — roughly one network RTT
(~500 ms) plus ~60–120 ms of Edge + Postgres work, well inside any reasonable turn budget. Edge CPU
headroom is bounded by the Phase 0 measurements (worst CPU ≈ 7 ms vs Edge’s 2 s budget, ~0.3%).

### Live Edge games (deployed API)

`--live` plays short games on the deployed API through the same `DuelClient`:

| game | started by | turns played | ending | result |
| --- | --- | --- | --- | --- |
| 1 | seat 0 | 12 | resigned | PASS |
| 2 | seat 1 | 12 | resigned | PASS |

Both seats started a live game; guest creation, create/join, Draw, draft+Throw batches, Discard,
view polling and resign all succeeded against the deployed Edge. A hand-probe
(`/v1/guests → /v1/matches → join → view → actions`) confirmed the whole path returns `200`.

**Infrastructure note (not a code defect).** During the first attempt the Edge returned
`500 INTERNAL` for several requests with
`PostgresError: remaining connection slots are reserved for roles with the SUPERUSER attribute` —
i.e. the **database connection pool was momentarily exhausted** (a concurrent heavy soak was
running against the same free-plan project; many match ids I never created appeared in the logs).
`pg_stat_activity` showed 20/57 usable slots once the spike passed, and the live games then ran
clean. If this recurs under real load, the follow-up is a connection-budget review (pooler mode /
`max_lifetime`), not a rule or client change. The API currently surfaces it as a generic 500 with no
retry.


---

## Phase D — two-browser UI/UX walk

Script: `web/e2e/online-ux-walk.ts` (live), with a local runner `web/e2e/online-ux-local.ts`.
Screenshots (390×844 phone + 1280×800 desktop) live in `docs/screens/online/`. The final run below
is against the **live** site `https://severgrow.github.io/severgrow-01/futa0.5/` (build
`6e9b2dc`), desktop + phone in two real browser contexts.

Flow walked: menu → hub → create → waiting (invite code) → join → duel → starter lottery → a full
played turn → opponent catches the turn up → resign → finished, both viewports.

| Check | Result |
| --- | --- |
| Play online visible; no clipped menu text | PASS |
| hub renders; create → waiting shows an 8-char invite code | PASS |
| join by code → both reach the duel with a HUD | PASS |
| starter banner shows "You start" / "Opponent starts" per seat | PASS |
| HUD shows opponent name, presence, and a **duration** deadline (`23h 59m`, never a wall clock — P-19) | PASS |
| exactly one side has the turn | PASS |
| a full turn completes through the UI; the turn passes to the opponent | PASS |
| the opponent sees the turn arrive (catch-up) | PASS |
| resign → finished with opposite results on each side | PASS |
| no console errors during the walk | PASS |

### UI/UX findings

| # | Finding | Status |
| --- | --- | --- |
| U1 | Starter banner read "Opponent's starts" (possessive used as a subject) | **Fixed** → "Opponent starts" / "Opponent goes first" |
| U2 | Online matches showed no who-starts signal at all | **Fixed** (Phase B) |
| U3 | A live-discard bug meant the turn never ended (see C1) | **Fixed** (Phase C) |
| U4 | Presence always reads **"Unknown"** because the Realtime channel is a no-op stub; the HUD has nothing better to show | **Needs your decision** (options below) |
| U5 | A guest rate limit (30/IP/hour) is reported with a retry message; heavy manual testing can trip it | INFO — by design (P-13); mentioned so it is not mistaken for a bug |

**U4 options** (genuine product-direction choice):

1. Hide the presence chip while presence is `unknown` (quietest; the turn word already says whose
   turn it is).
2. Show **"Live"** once the opponent's tab has polled recently (presence from server activity, not
   Realtime), else hide it.
3. Leave "Unknown" as-is until Realtime presence is wired.

---

## Deliverables / status

- **Fixes committed** on `futa0.5-online`, pushed. **Edge redeployed** (CORS + `startingPlayer`).
  `/futa0.5/` rebuilt by the Pages preview workflow on push; the live site now runs build `6e9b2dc`.
- **Phase A** proved live with two real browser contexts (guest creation, create/join, both seats).
- **Phase B** proved in the live UI walk on both seats ("You start" / "Opponent starts").
- **Phase C** 30/30 games + 9 scenarios green (local), plus 2 clean live games on the deployed Edge;
  one turn-completion bug found and fixed with a regression test.
- **Phase D** walk green 16/16 against the live site at both viewports; screenshots in
  `docs/screens/online/`.
- `npm run check` green (151 files, 1488 passed, 1 expected fail).

**Ask for you:** only U4 (presence while unknown) — pick option 1, 2, or 3. Everything else was
decided and done.

### Note on the working tree

Another agent/run was writing online-soak files into the same checkout during this pass
(`server/scripts/online-soak.ts`, `docs/ONLINE-SOAK-200.md`, `web/e2e/online-device-matrix.ts`, …).
I did not touch or commit those; my commits contain only the fix files listed above.

---

## Phase D — device/browser matrix follow-up (2026-10-13)

The 30-duel device/browser matrix (`docs/ONLINE-DEVICE-MATRIX.md`) found one clear UI bug and two
"needs confirmation" items. All were re-checked against the deployed `/futa0.5/` build:

- **Resign was not tappable** (it overflowed the 44px duel strip and was painted over by the header/board):
  fixed in `web/src/online/online-css.ts` (the strip is lifted above both, starts after the menu button,
  and keeps its controls on one line). Re-verified live: **0 unreachable-control issues, was 65**, and
  `#duel-resign` is 79x48.
- **Hidden / offline tabs kept the 2s poll**: `web/src/main.ts` now wires `visibilitychange` / `online` /
  `offline` to `sync.setVisible` / `setOnline`.
- **WebKit logged a spurious CORS console error** on every load: the numerals font was inlined as a
  `data:` URI; on the `futa05` channel fonts are no longer inlined, and a real WebKit load now logs
  **0 console errors**.
- **"Placed Grow left no draft" and "no fresh identity after clearing storage"** were both **harness
  artefacts** (the draft lives in `sessionStorage`, and the identity is created asynchronously); the
  harness checks were corrected and both now pass, with no app change.

A second, **volume pass of 30 more duels** covers five new profiles (WebKit at an Android size, Firefox
mobile-ish, 320px, 1920px, and Large text + reduced motion) and five new scenarios (rapid double-tap
Throw, refresh on both sides, slow 3G, full-landscape turns, accessibility settings). It confirms
landscape and slow-network play, no overflow at 320px/1920px, and a corrected double-tap check
(6/6); the remaining failures are harness Throw-gesture / reload artefacts, detailed in the matrix
report.

The 200-duel soak (`docs/ONLINE-SOAK-200.md`) is the matching server-side report: all 180 in-process
duels are green after the mid-batch fix, and the only live-Edge failures are the shared Supabase
project's connection limit.
