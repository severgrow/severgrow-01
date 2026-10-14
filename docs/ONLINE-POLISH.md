# FUTASAKU 0.5 online — polish, debugging and optimisation pass

**Branch:** `futa0.5-online` · **Channel:** `CHANNEL=futa05` (`/futa0.5/`) · **Date:** 2026-10-14
**Scope:** the online-duels addition only. No `src/engine/` rule change, no tutorial change, no
`futa0.4` build or `pages.yml` change, nothing on `main`.
**Game name:** FUTASAKU (the engine ids `Sprout` / `PlayFruit` / `MegaBomb` stay for compatibility).

This is the finishing pass the owner asked for: *"run a 2-3 debugging, optimisation, speed and
whatnot tests that we might have missed and fix whatevers easy fix."* Every number below was
measured on this machine; anything that was not measured says so.

## What was run

| Pass | Runner | What it is |
| --- | --- | --- |
| 1 — long-session soak / leak hunt | `npx tsx web/e2e/online-soak-teardown.ts` | 15 matches × 10 turns = **150 turns**, two live browser contexts, a resource probe installed before any app script (`web/e2e/helpers/online-probe.ts`) |
| 2 — speed / network efficiency | the soak's request counters + a channel build | requests per second idle / hidden / per turn / after leaving; bundle bytes and chunks; the Edge region pin in the built bundle |
| 3 — debugging / edge cases | `npx tsx web/e2e/online-polish-edge.ts` | double-tap Throw, no Realtime, offline mid-submit, close-the-tab-and-reopen, Reduce motion + Large text, console noise on Chromium **and** WebKit |
| 4 — stress / repeatability | `npx tsx web/e2e/online-stress-repeat.ts` | 30 consecutive turns across the turn boundary; first 10 vs last 10 |
| 5 — the regression guard | part of the soak | fails the run if heap, listener, DOM, socket, timer or rAF counts drift with the matches played |

The soak builds the real `CHANNEL=futa05` page and drives the real `DuelClient` against a real
in-process `MatchService` (+ real HTTP app) on `127.0.0.1`; two persistent players play 15 matches
in **one long-lived tab each** (no reloads between matches) and leave through a different route each
time: pause → Main menu, pause → New game, finish → Back to menu, finish → Menu, finish → Back to
matches.

## Pass 1 — is anything leaking?

**Verdict: no unbounded leak.** Resource counts return to the same baseline after every exit route,
and retained heap settles at a ceiling instead of climbing.

### Live resources after teardown (worst of every route)

| Resource | Boot | Worst after any teardown | Verdict |
| --- | --- | --- | --- |
| live `setInterval`s | 0 | **0** | every interval (the Realtime heartbeat, the reveal watchdog) is cleared |
| open WebSockets | 0 | **0** | the per-match Realtime socket is closed on teardown |
| outstanding `requestAnimationFrame` callbacks | 0 | **0** | no animation loop is left re-arming |
| live listeners | 203 | +225 after 15 matches (+2/match) | the lobby row for each match — see below |
| DOM elements | 588 | no linear growth (tail slope ~0/match) | the board rebuild and the lobby list, both bounded |
| localStorage keys | 3 | **5** after 15 matches | bounded; no key per match |
| sessionStorage keys | 0 | 0–1 | the per-match draft key; see below |

**The listener "drift" is the lobby list, not a leak.** The per-match growth is exactly
`li.online-row.bucket-*|click` and `|keydown` — one row per match in "Your online matches". The list
is capped (≤10 unfinished matches by the server's own limit, ≤10 finished by `trimLobbyList`), so the
growth saturates. Nothing on the board, the sync engine or the Realtime channel gains a listener per
match.

**sessionStorage: one draft key per match left mid-turn, on purpose.** The soak measured 1 key after
15 matches: a match left with an *unsent* mid-turn draft keeps `severgrow.duel.draft.v1.<matchId>`
so that a refresh mid-turn does not lose it. It is in `sessionStorage`, so it dies with the tab, and
it is removed when the draft is thrown or cleared.

### Retained heap — a real slow drift, reported not hidden

Retained heap was measured after a forced GC (CDP `HeapProfiler.collectGarbage` +
`Runtime.getHeapUsage`) at boot, at a middle checkpoint and at the end, and then once more after a
reload of the same tab:

| Checkpoint | seat0 | seat1 |
| --- | --- | --- |
| boot (menu, nothing open) | 2.99 MB | 3.00 MB |
| middle (5 matches in) | 6.32 MB | 6.30 MB |
| end (15 matches, 150 turns) | 7.27 MB | 7.34 MB |
| **after a reload of the same tab** | **3.13 MB** | — |

Slope: 682 KB/match over the first third, **97–106 KB/match** in the tail; 292 KB/match overall.
An earlier run of the same code measured 400–515 KB/match in the tail and 11.5 MB at the end, so the
run-to-run variance is real (the browser's own GC timing is part of it) — the honest statement is
**~100–500 KB per match, ending at 7–11.5 MB after 15 matches.**

**The reload result is what makes it a finding rather than a measurement artifact:** reloading the
tab drops the retained heap from 7.27 MB back to 3.13 MB. So ~4.1 MB (~270 KB/match) is retained
**inside the page** by the time a 15-match session ends, and only the reload (which throws away the
whole page) releases it.

What I could rule out:

- **Not live DOM**: the DOM element count is flat (~1020–1300 regardless of the matches played), the
  board's 37 hex cells and 14 layers are constant, and the canvas count is constant at 2.
- **Not the lobby list**: it grows one row per match but is capped (≤10 unfinished by the server's
  own limit, ≤10 finished by `trimLobbyList`), and the heap does not track its row count.
- **Not the soak's own probe**: the probe adds ~60 KB/match of bookkeeping (detached-listener
  entries) and holds only `WeakRef`s — ~20% of the drift, not the cause.
- **Not sockets, timers, rAF or live listeners**: all four are flat or zero after every teardown
  (`timeouts` sits at 3–5, `rafs` at 0, `intervals` at 0, `sockets` at 0).
- **Not the bounded debug logs**: `animMarks` stops at 4000 and `renderCosts` at 600; both were
  under their caps at the end.

The likely retainers are the per-match board rebuild (a fresh set of 37 hex elements plus a new
world layer with two canvases and its material defs on every `board.setup()`) and per-match object
graphs something still points at. Confirming it needs a heap-**snapshot diff by constructor** between
an early and a late match; I judged that a bigger job than this polish pass, and blind-fixing the
board teardown is exactly the kind of risk the brief rules out. **Suggested next step:** take a
`HeapProfiler.takeHeapSnapshot` at match 5 and at match 15 in one tab, diff the constructor counts
and fix whatever grows; `web/e2e/online-soak-teardown.ts` is already the regression test for it.

The Pass 5 guard is set above the measured drift so the run stays honest about what it accepts, and
the drift itself is printed as a `WARN` line on every run.

### What the soak also proved

- **150 turns, zero stuck gates.** Every turn had the watcher's gate open on the true final board,
  with nothing left queued or pumping.
- **Polling stops completely when you leave.** 0 requests in the 3.5 s window after every exit
  route, on both seats, on all 15 matches.
- **A hidden tab is cheap.** With the tab genuinely reporting `hidden`, the client made **0** `/view`
  requests in a 5 s window (the poll drops to the 30 s hidden cadence).
- **Nothing bled a socket, a timer or a rAF callback across 15 matches and five exit routes.**

## Pass 2 — speed and network efficiency

Measured on the soak's own request log (two real pages, one `MatchService` on `127.0.0.1`) over 15
matches; "requests" counts `GET /v1/matches/<id>/view` from **both** pages unless stated.

| Question | Measured | Meaning |
| --- | --- | --- |
| Idle on your turn, tab visible | median **2** in 1.5 s (~1.3/s across two pages) | the 2 s poll cadence, one poll per page — no busy-waiting |
| While the opponent is to move | median **1** `/view` per turn | the 0.9 s waiting cadence + the 2 s net, one request per turn boundary |
| Tab hidden | **0** in 5 s | the poll drops to the 30 s hidden cadence (≤0.2/s long-run) |
| After leaving the duel | **0** in 3.5 s | the sync engine's timer is cleared on teardown, on all five exit routes |
| One opponent turn | **1** `/view` on the other page | no duplicate fetches; the Realtime ping is skipped in favour of the poll when it is unavailable |
| Duplicated `/view` per render | none observed | the client never refetches on render |

### Edge region

The `/futa0.5/` bundle pins the Edge function to the database's region. Verified in the **built**
bundle, not in the source: `client-*.js` contains `forceFunctionRegion=` and `config-*.js` contains
`eu-west-1`. The pin is a query parameter (not a header), so it needs no CORS change. The live
`/v1/health?db=1` confirms the same project is on the Transaction pooler in `eu-west-1`
(`"pooler":"transaction-pooler","port":"6543"`).

### Live Edge latency (p50/p95)

A bounded probe (2 real HTTPS duels, 252 requests, 0 errors, no 429/500/503) through the same
`DuelClient` the browser uses, against the deployed Edge function:

| Call | p50 | p95 |
| --- | --- | --- |
| View fetch | **549 ms** | 635 ms |
| Submit action | **640 ms** | 717 ms |

For contrast, the same client against the local server on the same real database measured view p50
269 ms / p95 277 ms and submit p50 342 ms / p95 391 ms — the difference is the Edge hop plus the
network, not the game. The numbers match the previous verification (`docs/ONLINE-SHIP-STATUS.md`
recorded edge view p50 565 / p95 633, submit p50 644 / p95 749), so this pass did not regress
latency.

### Initial load of `/futa0.5/`

- `web/dist` total **5.4 MB**, 79 assets. Entry chunk `index-*.js` **244 KB** (86 KB gzip) + CSS
  **92.7 KB** (21 KB gzip).
- `index.html` references/preloads 26 files totalling **1087 KB** (JS + CSS + the preloaded fonts
  and card art); no reference is missing.
- **The online code is already deferred**: `online-*.js` (26.7 KB), `lobby-ui-*.js` (16.6 KB) and
  `smart-cockpit-*.js` (51 KB) are separate chunks, not part of the entry parse. Nothing heavy is
  loaded eagerly that could be moved without restructuring the boot, so **nothing was changed**.

## Pass 3 — debugging and edge cases

`web/e2e/online-polish-edge.ts` — all green:

| Check | Result |
| --- | --- |
| 8 rapid taps on Throw commit **one** EndAct batch | **1 POST /actions** for 8 taps; the whole turn costs exactly 2 commits (EndAct batch + the forced Discard) |
| Rapid repeated taps cannot double-apply | same check — one batch, one commit |
| The opponent's turn arrives with **no Realtime socket at all** (it is unavailable in this harness) | pass: polling carries the turn |
| Realtime is not retried in a loop when unavailable | the client stops after its bounded attempts (no churn) |
| Throw while **offline**: does not double-apply, does not advance the server | pass: server revision unchanged, and the page says "Reconnecting" rather than pretending success |
| The UI is not frozen offline | pass: the pause menu still opens |
| Coming back online restores the link | pass |
| The **unsent draft survives the outage** | pass and measured player-visibly: the page still shows the painted tile the server does not have (3 tiles vs 2), and the draft key is kept |
| The turn still completes after the network returns | pass |
| **Close the tab mid-turn and reopen** | pass: the committed Draw is on the server before the close; the reopened tab replays the missed step and then holds the turn with nothing queued, no stuck gate, on the committed revision |
| Reduce motion + Large text | pass: every visible duel control is ≥44×44 and the turn state is a word, never colour alone |
| A whole turn with **no console error or warning — Chromium** | pass (only the harness's own dead Realtime host is ignored, and it is counted in the output) |
| A whole turn with **no console error or warning — WebKit** | pass (same, plus 5 pre-existing font-preload notices, below) |

### One real (minor) thing the WebKit run surfaced

WebKit logs `The resource …/besley-wght.woff2 (and fragment-mono) was preloaded using link preload
but not used within a few seconds`. `web/index.html` preloads those two fonts for every modern
channel. It is a wasted preload (and a console warning) on `/futa0.5/`, where the font does not
arrive until later. **Not changed**: it is the shared product page's asset setup rather than the
online-duels feature, `web/index.html` is flagged in the brief as possibly being edited by another
session, and removing a preload can shift the first paint. Suggested next step: drop the two font
preloads on the `futa05` build (the Vite transform already knows the channel).

## Pass 4 — stress / repeatability

`web/e2e/online-stress-repeat.ts` — 30 consecutive turns across the turn boundary (15 in each
direction), as fast as the touch UI allows, sampled every 25 ms on both seats. All green:

| Measure | First 10 turns | Last 10 turns | All 30 |
| --- | --- | --- | --- |
| Gate duration (throw → input open) | p50 **701 ms**, p95 722 ms | p50 **711 ms**, p95 727 ms | p50 **710 ms**, p95 727 ms, max 736 ms |
| Frames during the live reveals | — | — | **4118 frames, p50 16.6 ms, p95 18.3 ms, max 40.2 ms, 0 frames over 50 ms** |
| Wrong turn word at any sample | — | — | **0** |
| Stuck reveals | — | — | **0** |
| Safety net (`watch:release`) fired on a normal replay | — | — | **0** |

Per seat: seat 0 15 reveals p50 719 ms, seat 1 15 reveals p50 702 ms — the two seats cross the
boundary at the same speed. The last ten turns are **not** slower than the first ten, so nothing
accumulates across the run. (Machine load during this run: 4.5.)

## Pass 5 — the regression guard

The soak is itself the guard: it fails if

- any exit route leaves a live interval, an open WebSocket or an extra rAF loop,
- the live-listener count drifts more than ±40 as matches accumulate (the lobby rows),
- the DOM node count grows with a slope that would blow up over 500 matches,
- the retained heap grows faster than **1024 KB/match** in the tail, or ends above **64 MB**.

Its thresholds sit above the current numbers on purpose (see the heap drift above) so the suite is a
tripwire for a *blow-up*, not a source of noise; the ~100–500 KB/match drift it accepts is printed
as a `WARN` line every run and written up above.

## What was changed

| Change | Why | Test |
| --- | --- | --- |
| `web/src/online/starter-reveal.ts`: the per-match "who starts" marker is now bounded (`STARTER_REVEAL_KEEP = 50`) with an index key; older markers are removed | one localStorage key per duel was being written and **never** cleaned, so a device that plays duels for months accumulates keys without bound | `web/tests/starter-reveal.test.ts` — "does not accumulate one storage key per duel forever" (fails before the change: 150 keys instead of 50) |
| `__severgrow.online()` (test-only hook) now also reports `revision`, `syncRevision` and `connection` | so a gate/poll test can tell "the page applied the view" from "the page is showing a stale gated payload" — a distinction that cost real debugging time | used by the soak and the stress suite |

## What was deliberately NOT changed

- **No engine, rules, tutorial, `futa0.4` or workflow change.** Out of scope by instruction.
- **The input gate and the animation pacing are untouched.** The gate opens only when the
  opponent's finished turn has fully animated; the soak's 150 turns and the stress suite's 30 turns
  measured it, they did not change it.
- **No loading screen.** Already measured and rejected in `docs/LOAD-PERFORMANCE.md`.
- **The ~100–500 KB/match retained-heap drift** (see Pass 1). Real, reproducible, and not
  attributed; the fix would be a blind change to the board/session teardown, which this brief rules
  out. The soak is the regression test for whoever fixes it.
- **The two font preloads in `web/index.html`** (see Pass 3). A shared product-page file, and the
  warning is harmless.
- **Nothing in `server/`.** The one server-side behaviour that looked odd during debugging
  (a watcher's payload revision sitting at the turn's start while the opponent is mid-turn) is the
  documented turn gate (`server/src/turn-boundary.ts`), it is what makes the reveal possible, and a
  first-turn poll from `revision=0` returns the whole delta — verified with a direct probe against
  the local service. It is also the Edge function's source, which the brief puts out of bounds.
- **The per-match `sessionStorage` draft key is not cleared on exit** on purpose: it is what makes a
  mid-turn refresh — and a network drop — keep the unsent draft (measured in Pass 3). It is bounded
  by the tab's life and by the matches played in that tab.

## Honest limits

- The soak's two seats are the same machine; "150 turns" is 150 turn boundaries, not 150 human
  minutes of waiting.
- Hidden-tab measurements fake `document.visibilityState` (the browser's own timer throttling is not
  simulated); they measure the app's own cadence choice, which is the thing that was fixed.
- `retainedHeap` needs a forced GC; the browser's own GC timing adds a few hundred KB of noise per
  measurement.
- Frame timing at 4× CPU throttle is sensitive to whatever else the machine is doing; the numbers in
  Pass 4 were taken with the load noted.

## Reproduce

```sh
# Pass 1 + 3(teardown) + 5 — 15 matches, 150 turns, ~13 min
SOAK_MATCHES=15 SOAK_TURNS=10 npx tsx web/e2e/online-soak-teardown.ts

# Pass 4 — 30 consecutive turns, first 10 vs last 10
npx tsx web/e2e/online-stress-repeat.ts

# Pass 3 — the edge cases (Chromium + WebKit)
npx tsx web/e2e/online-polish-edge.ts

# the earlier online suites still pass unchanged
npx tsx web/e2e/online-gate-safety.ts
npx tsx web/e2e/online-turn-gate-repeat.ts
```
