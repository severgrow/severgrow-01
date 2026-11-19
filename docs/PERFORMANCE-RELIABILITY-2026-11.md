# Performance and online reliability pass

Baseline: `79ca4f32` on `futa0.5-online` and `live`, 13 November 2026.
Working branch: `perf/mobile-rendering-power`. Other agents' unfinished visual work is excluded.

## Acceptance and measurement

Preserve appearance, normal animation timing, rules, saves/replays and authoritative deadlines.
Measure before/after with the same fixtures. Never infer physical battery/thermal performance from
software rendering. Application rAF gaps are not displayed frame times. A sphere with 3,000 claimed
tiles does not expose all 3,000 faces simultaneously; report that distinction.

| Scenario | Evidence / acceptance |
| --- | --- |
| Idle board and menu | Passive rAF/timer/GL counters, long tasks, CDP main-thread metrics |
| Ten animated moves | Actual legal human actions and the production opponent worker, normal timing |
| Six complete offline games | One document, deterministic fresh positions, retained heap after GC, actual DOM/listeners, animations/canvases |
| Planet navigation cycles | Warm-up versus retained resources after repeated entry/exit |
| Drag and zoom | Same scripted gestures, geometry reads, draw/upload counts and submitted pixel bounds |
| 3,000 claimed tiles | Real planet cell IDs/topology, fixed ownership fixture, no backend writes |
| Hidden, pagehide and resume | No unnecessary drawing/socket heartbeats, exact animation recovery |
| Pairing and Blitz | Two authenticated clients, both directions, existing games/parked searches, interruption, notification failure and stale response cases |
| Regressions | Full typechecks/unit tests, required builds/assets, relevant browser and database suites |

Test scripts are under `web/e2e/performance-{lifecycle,offline-soak}.ts` and the existing online
journey suites. `helpers/activity-probe.ts` does not schedule its own idle frames or read back GPU
pixels. Resource counts use CDP, not an add/remove-listener approximation that misses AbortSignal
cleanup. Full visual/pixel checks are separate from performance windows.

## Confirmed findings so far

- The globe was still building a hidden legacy SVG map. With 3,000 claimed cells the mobile
  fixture retained a median 10,447 DOM nodes and 3,958 actual listeners. The candidate retains
  2,818 nodes and 430 listeners. Desktop: 10,415/3,947 becomes 2,814/430. The flat channel keeps
  its renderer; the globe retains its existing data, materials, geometry, camera and controls.
- Free-tile actions now derive availability from world data rather than the hidden SVG's classes.
  Preserve both the current `growAnywhere` capability and older servers' seen/adjacency rules.
- The settled Planet already requests zero frames and uploads no textures. Preserve that behaviour.
- In the initial mobile drag sample the renderer read the same panel twice per frame and queried
  three unchanged shader attribute locations per draw. Both are invariant work.
- The full-screen WebGL canvas shades outside the CSS-clipped Planet window. Limit rasterisation to
  the visible crop without changing viewport, resolution, projection, geometry or iris timing.
- Ten human actions in the initial offline run caused 216 canvas dimension assignments, including
  45 assignments of an unchanged dimension. The LED repeatedly bakes the same captions. A bounded
  exact-pixel sprite cache and explicit clearing can reuse those resources without changing art.
- The notification socket continued heartbeat work while hidden and could exhaust its retry budget
  without an immediate recovery on returning online. A known disconnect did not re-arm the inbox's
  slow connected-channel timer immediately. Cover these with transport and center tests.
- The invitation gesture gate tracked only a boolean. A lost pointer-up outside the app could leave
  it blocked; multitouch also cleared it too early. Track held pointers and clear on blur/suspension.
- Two already parked searches belonging to players who share a game bypassed shared-game
  continuation. The regression fails on the baseline and passes with a common atomic continuation
  path in both storage adapters. Never delete or duplicate their real shared game.
- A fresh Find could reopen an old, unmoved game created by an earlier Find. Fresh requests now
  explicitly opt out of arbitrary resume; search heartbeats carry their own match ID. Omitted
  fields preserve old-client behaviour. Membership is checked by the storage query, never trusted
  from that ID. The waiting page listens to the existing activation broadcast while searching,
  with the original two-second safety poll and clean teardown on entry, hiding and cancellation.
- A match channel could remain unjoined after a topic error while its socket stayed open. Old
  socket messages could also acknowledge a replacement connection. Rejoin failed transports,
  bound connecting/join waits, ignore stale attempts, and stop transport work while suspended.
- A missing invitation broadcast formerly left the receiver waiting for the slow inbox safety
  read. Authenticated match status now supplies a deduplicated hint to that same inbox. It never
  invents a challenge or increases the ordinary idle polling frequency.
- Duplicate hidden events forgot the animation set to resume. The gate also ignored pagehide.
  Both new lifecycle tests fail on the baseline and pass with idempotent pause ownership.
- The app-level Blitz display used a permanent 250 ms interval even with no live clock/countdown.
  Keep its original precision when needed, with no timer while inactive or hidden.
- The browser sweep exposed a startup ownership race: the HTML's missing-code fallback could
  reveal before the working app's first Planet frame (observed at 1,595 ms with app ready, no
  painted frame and no fade). Three later alternating baseline/candidate cold-launch pairs
  passed, confirming it is intermittent, not a consistently slow import. A subsequent diagnostic
  caught the timer firing before the app module even mounted. A longer emergency ceiling did not
  reliably fix the check on this software-GPU host. Do not change the approved startup timing on
  that evidence: startup runtime is unchanged. Its strict first-paint check remains a release gate;
  report any remaining failure and require the normal CI/device checks, rather than weakening it.
  The delayed-import regression now requires zero old SVG allocations, stronger than merely
  requiring them to be hidden.

## Results and limits

These are recorded candidate measurements, not release sign-off. Require the exact candidate's
normal CI gates before integration or publication.
An initial healthy local account/guest journey paired in 1,872 ms, became mutually online 401 ms
after entry, and delivered its invitation in 50 ms. That does not prove production Supabase delivery
or physical-device behaviour; fault injection and both directions are separate acceptance checks.

### Repeated material benchmark and visual checks

Serial Chromium runs, CPU slowdown 4, DPR 3, 60 LED caption changes, three repetitions:

| Work | Baseline | Candidate |
| --- | --- | --- |
| Component time, median | 920.7 ms | 43.7 ms |
| Canvas dimension assignments | 840 | 90 |
| Assignments of an unchanged dimension | 270 | 0 |
| Cache after the sequence | none | 8 sprites / 429,728 bytes |

This is a component microbenchmark, **not whole-game FPS or battery evidence**. First-draw hashes
of DRAW, GROW, THROW and 12:8 match for all three LED canvases. The full globe hash matches too;
the visible scissored crop has zero differing channels and expanding it restores the same full
image. Native repeated canvas readbacks have small backend-dependent differences in both builds;
do not claim all repeated readbacks are identical.

During scripted drag, panel rectangle reads per globe draw fall from approximately 2.04 to 1.04.
The three shader attribute locations are looked up once per renderer rather than every frame.
They are resolved lazily at the original first-draw point; construction does not move those GL
queries ahead of the first frame. Full-window draws keep the original unclipped GL path, while
cropped draws apply and release the scissor exactly once. Native GL counters and exact pixels
verify both paths. This preserves baseline ordering without changing startup timers.
The scissor limits submitted pixel bounds, not geometry submission; it does not claim to cull
3,000 simultaneously visible faces or measure actual GPU fragment execution.

In the lifecycle fixture the inactive app's 250 ms callbacks fall from 16 per four seconds to zero.
Settled Planet frames and texture uploads were already zero in the baseline and stay zero.
Software-GPU timing is highly variable, including samples where the candidate is slower; use
the repeatable work-count and pixel evidence above, not a blanket frame-rate improvement claim.

### Sustained play and sound

The completed baseline consists of six real games in one document, with normal animations and
the production opponent worker. Retained heap after each result: 11.34, 11.85, 12.25, 12.35,
12.66 and 12.78 MiB. The matching candidate results are 11.36, 11.88, 12.27, 12.41, 12.69 and
12.81 MiB. Listener counts fluctuate and fall again after game five; this does not show a
monotonically growing per-game listener leak. Candidate listeners stay exactly two above the
baseline at every result (the added pagehide/pageshow gate), rather than growing per game.
Both builds leave zero running animations and zero app frame callbacks at every result.

| Game | Human actions (both builds) | Baseline session time | Candidate session time |
| --- | --- | --- | --- |
| 1 | 38 | 118 s | 189 s |
| 2 | 34 | 101 s | 106 s |
| 3 | 35 | 110 s | 127 s |
| 4 | 14 | 68 s | 70 s |
| 5 | 31 | 90 s | 90 s |
| 6 | 37 | 107 s | 107 s |

Do not call this an across-the-board speedup: the first candidate game was substantially slower.
Both runs include normal effects and bot thinking, and run on software graphics. A separate
repeated move-cost comparison is required to investigate that difference. The first ten human
actions reduced canvas dimension assignments from 262 to 141, including same-size resets from
57 to zero, but frame pacing and real-device power remain distinct questions.

The first soak fixture used the wrong saved sound key (`sound`, rather than `soundOn`), so the
effective six-game baseline was silent. The corrected comparative fixture explicitly asserts
that same silent condition. Sound was then checked separately with the real enabled sound
engine, a trusted unlocking gesture and 240 cues: 328 audio nodes created, 320 destroyed,
eight retained at every 40-cue checkpoint. No audio rewrite is justified by that evidence.

### Database and regression checks

Final `npm run check` passes: 482 files, 4,740 tests, one expected failure,
six skipped files / 70 skipped tests. Full typechecks cover game, web and admin. The required
futa04 and futa05 product builds and asset checks pass. Browser release
verification is still in progress, including the cold-start limitation recorded above.
Real Postgres matching tests passed five cases and live transaction/security
tests passed eight. The local fixture excludes platform-only pg_cron/pg_net migrations 0005/0007;
hosted cron execution is not tested here. Live database timeout assertions were corrected to the
owner-approved rule shipped in `6ccf625e`: connected Blitz timeout auto-plays a turn, not a loss.
No gameplay runtime or migration was changed for those assertions.

Two-client HTTP-service journeys pass all four account/guest entry and invitation directions:
pairing 802–1,807 ms, normal invitation presentation 30–251 ms, observed remote move 166–255 ms.
These use independently authenticated clients and the real local service, with the Supabase wire
simulated and graphics disabled for transport isolation. They are not production latency numbers.
The old-third-party-game, lost-pointer release and held invitation response combination passes;
the sender adopts the actual pending row in about 1.1 s without duplicating the invitation.
A dropped invitation notification recovers from authenticated status in 8.8 s, within the existing
ten-second status cadence. Healthy idle polling remains unchanged. The no-Realtime matchmaking
fallback also passes, joining an away player's open game after the existing live-search window.

The first six-match online soak found no growing live-listener drift, no duel requests after exit,
and no requests while hidden. Its zero-socket assertion caught the legitimate app-level invitation
reconnect attempts after each simulated resume. The fixture already waited for those bounded
retries at boot; it now checks the same quiet state after resume, retaining the zero-socket
assertion and adding an explicit failure if retries do not settle within the original 60 s limit.
The immediate post-exit polling window is unchanged.

The old soak probe also retained metadata for every collected listener and could count a dead
callback on a surviving target. Two new deterministic tests fail before fixing that bookkeeping
and pass afterwards. The probe now sweeps collected callback/target records; reachable detached
nodes remain visible in diagnostics. Its descriptive counts are estimates, not native listener
totals. The primary lifecycle/offline measurements above use native CDP counters without this
listener wrapper. Do not interpret the first online probe's heap slope as proven application leakage;
the corrected soak passes six matches / 24 turns across live and async play and all five exit routes.
Every teardown converges to zero sockets, zero intervals and zero frame callbacks. The corrected
tail still measures about 266 KiB/match in this short run, below the existing guard. That is **not**
proof of unlimited-session stability: warming caches, the retained current board and match-list
rows remain, and longer hardware sessions should verify that they plateau. Do not extrapolate
six matches linearly to hundreds or claim the measuring-tool fix explains all heap growth.

### Repeated animation comparison

Existing `motion-cost.ts`, unchanged legal fixtures, normal motion, 390×844, CPU slowdown 4,
three serial repetitions per action on the original runtime and candidate. These are medians
of three runs; p95 is the median of each run's rAF-opportunity p95, not presented display frames.

| Action | Main-thread work before / after | Script before / after | rAF p95 before / after |
| --- | --- | --- | --- |
| Blast | 2,378 / 2,101 ms | 265 / 230 ms | 67 / 100 ms |
| Bomb | 2,726 / 2,448 ms | 243 / 197 ms | 83 / 117 ms |
| Huge Cut | 3,123 / 2,869 ms | 259 / 192 ms | 50 / 50 ms |
| Bloom | 1,407 / 1,269 ms | 147 / 111 ms | 67 / 33 ms |

Main-thread medians fall 8–12%, with lower median script/style work for all four moves. The
frame-gap results remain uneven: Blast/Bomb p95 worsens in these samples. Report the reduction
in work, **not** a uniform FPS improvement. Recalculation/painting at existing full-render
boundaries remains expensive. No broad animation/main-module rewrite or visual degradation is
justified by this software-GPU run. Real iPhone/Android frame, thermal and power checks remain.

For reproductions, run benchmarks serially, outside unit/build jobs. The lifecycle and offline
fixtures require a futa05 build with the local API at `http://127.0.0.1:65530`; the online journey
builds its own local service fixture at port 4305. Do not reuse one fixture's build for the other.
`motion-cost.ts` uses a futa04 build and its existing main2 save prefix. Copy measurement harnesses
to the baseline checkout without changing its runtime; keep CPU, DPR, seeds and audio identical.

The first lifecycle benchmark stopped on a heavy-map browser timeout; retain its partial data only
as diagnostic evidence, not a completed stress-test result. The first sustained-play attempt hit
the legitimate install invitation after its first game. The final fixture records an existing
player's "don't show again" setting so that invitation cannot interrupt the multi-game run.

No physical iPhone, Android, power, thermal or Safari-on-device measurements are available here.
Local WebKit launch was attempted: the binary is absent. Its official download host is denied by
the managed network policy (HTTP 403), so local Safari-engine checks are unavailable; release CI
must supply its usual WebKit gates.
Production domains/API access may be restricted by the environment; use local authenticated
services and clearly disclose the deployment/device checks that remain unavailable.

## Integration

The implementation is isolated on `perf/mobile-rendering-power`, based on the approved Beta 0.85
`79ca4f32`. Other worktrees and unrelated visual changes are excluded. There are no migrations,
dependencies, engine changes or new UI controls. The Edge bundle is rebuilt and committed.

The new matchmaking field is optional: older pages retain their behaviour, and the new page stays
compatible while waiting for the server update. Integrate only after the exact commit passes CI,
then use the existing `futa0.5-online` release flow, including its server deployment. Do not
promote a failed gate, change `main`, or force-push over concurrent work. Recheck the remote head
before integration. Production verification must check the actually served build and server,
not just branch refs. Physical iPhone/Android thermal and power validation remains a separate step.

## Beta 0.86: Forest & Ash board, new cards, planet tiles (2026-11-14)

Same machine, serial runs, `motion-cost.ts` (unchanged fixtures, 390x844, CPU slowdown 4), medians of
three: the published Blast build (`4b4ad839`, the base) against the 0.86 build (board art that spills
over its hex, rocks/homes layers, home outline mask and rims, painted backgrounds off by default, new
card atlases, planet tile atlas).

| Action | Main-thread work base / 0.86 | Script | Style recalc | rAF p95 |
| --- | --- | --- | --- | --- |
| Blast | 1,052 / 1,051 ms | 100 / 97 | 272 / 271 | 33 / 33 |
| Bomb | 1,285 / 1,319 ms | 93 / 92 | 349 / 381 | 33 / 33 |
| Huge Cut | 1,444 / 1,427 ms | 108 / 99 | 314 / 347 | 17 / 17 |
| Bloom | 649 / 674 ms | 49 / 51 | 162 / 176 | 17 / 33 |

This machine reads about half of the 2026-11 table above (e.g. Blast 1,052 vs 2,101 ms): compare rows
here with each other, not with that table. Total work is flat (-1% to +4%); style recalculation is up
9-10% on Bomb, Huge Cut and Bloom (more `<image>` nodes: unclipped sprites, a rocks layer, a home
fringe layer), and Bloom's p95 moved up one frame bucket (17 -> 33 ms). Not yet reduced; recorded so it
is not accepted silently. Candidates: share one `<use>` per sprite variant, drop the per-tile territory
base path where the art is opaque.

Planet: `sphere-test` (all four sizes) passes "no idle rendering while the ground fills the window" and
"at rest only the slow star slide runs" with the levelling turn; the tile atlas (512x512, mipmapped) is
uploaded once, the first time the world view opens, never for the menu planet and never at rest. The
ground buffers grow by one 2-byte attribute per vertex (`renderer.bytes` reports it).

## Action latency: tap → grown tile, and throw → the bot (2026-11-15)

Owner report on `/test/` (`17dd1114`), compared with the live root (`f4ba65f5`): "after choosing card
to grow and taping tile it takes way longer to grow. after throwing it takes a long time for opp bot
to start". This is INPUT → RESULT latency, not frame rate: the earlier 60 fps/idle-cadence pass could
not see it, so it was measured again with a real gesture on a real move.

**Probe** (`probe/latency.ts`, kept out of the repo's suites): a 390x844 phone profile, real
pointer press/release on a hand card, then on a legal empty hex; the throw is the real drag onto the
Throw pile. Phases are read in the page: the pointer event, the engine state (`__severgrow.state()`),
the DOM node the board writes, the first frame after that write, plus `longtask`, CDP
`Performance.getMetrics` deltas and the page's own `renderCosts()`. Medians of 6 moves (8 for the
frame-cadence probe), 1x and 4x CPU throttle (`Emulation.setCPUThrottlingRate`).

Chromium 142 (bare Chromium, no service worker), ms, p50/p95:

| Phase | live `f4ba65f5` | `/test/` `17dd1114` | ratio |
| --- | --- | --- | --- |
| Grow: tap → state | 22.2 / 29.5 | 18.6 / 29.1 | 0.84 |
| Grow: tap → tile in the DOM | 19.2 / 26.7 | 15.2 / 25.6 | 0.79 |
| Grow: tap → first frame showing it | 29.4 / 30.0 | 28.5 / 30.1 | 0.97 |
| Grow: tap → input open again | 408 / 415 | 406 / 413 | 0.99 |
| Throw: release → state | 3.7 / 5.5 | 3.6 / 5.5 | 0.97 |
| Throw: release → "opponent's turn" pill | 744 / 746 | 747 / 748 | 1.00 |
| Throw: release → my reveal ends | 1,010 / 1,012 | 1,013 / 1,015 | 1.00 |
| Throw: release → bot's first tile | 1,572 / 1,574 | 1,575 / 1,580 | 1.00 |

At 4x CPU throttle the same rows read 114.8/106.9 (grow state), 118.2/108.8 (first frame),
761.7/771.1 (pill) and 1,611.6/1,633.7 (bot's first tile): the new build is 1-12% faster on the
move and identical on the bot's start. WebKit 26 (the owner's engine), iPhone DPR 3, tap → state:
**128 ms old, 113 ms new**; the old build also had a 722 ms outlier that the new one does not.

The bot's start after a Throw is dominated by INTENDED time and is unchanged: the throw animation
(320 ms x speed) plus the planned "think" beat (`USUAL.first` 550 ms, `logic/emptyturn.ts`), which
is the 562 ms gap measured between my reveal ending and the bot's first tile — identical on both
builds (561.5 vs 561.9 ms). No bot strength or pace was touched.

**Bisect** (`2fb65b48`, `4803b9db`, `bc5fdeec`, `6997120f`, `13096336`, `3b8e8459`, `cc072a20`,
`17dd1114`, each built and served on its own port): no commit shows a step. Hand-arrival, draw-tap
and render costs are flat across all eight.

**What the new board does cost.** It paints a per-cell ground picture, so a tile that grows onto a
cell whose variant the page has not rasterised yet pays a GPU image decode inside that move's raster:
62-68 ms measured in a Chrome trace (the old 14-picture board: 37-39 ms). That is the same extra
`<image>` work the Beta 0.86 table above already records as +9-10% style recalc. On this machine it
does not reach the tap→result numbers; on a slower phone it is the one thing in the move path that
grew, so `ui/art-warm.ts` now rasterises every picture the board can draw once, at its drawn device
size, when the board is set up (about 25 canvases, ~2 MB, once per page, off the move path).
Measured after it: WebKit render p95 38 → 29 ms and tap → state 113 → 79 ms in a local-served run
(a local server flatters both numbers, so only the direction is claimed), and the unit, build and
browser gates are unchanged. **It is not proven to be the owner's bug**: on this machine the reported
latency could not be reproduced at all, in either engine, with or without the service worker.

**Not measured:** a physical iPhone (iOS compositing, ProMotion pacing, thermal state), real touch
coalescing, and the owner's installed PWA cache. If the report stands, the shipped `?debug=timing`
trace from his phone after two moves names the slow segment directly.

## Beta 0.86 release pass: the new baseline (2026-11-16)

Live `f4ba65f5` (Beta 0.85) against `/test/` `69e69422` (Beta 0.86) before and after this pass
(`4800deac`..`1ed337d6`). All three built from source on one machine (4 cores, software GPU
SwiftShader), runs serial, never two measurements at once. **This table is the baseline future work
must not regress.** Medians unless stated.

| Measure | live 0.85 | 0.86 before | 0.86 after |
| --- | --- | --- | --- |
| perf-phone idle style recalcs (futa05, 390x844 DPR 3, 4x CPU, 3 runs) | 60 /s | 60 /s | **0.3 /s** |
| perf-phone idle recalc time | 266 ms/s | 419 ms/s | **2.7 ms/s** |
| perf-phone idle main-thread work | 421 ms/s | 576 ms/s | **10 ms/s** |
| perf-phone idle main frames | 182 /s | 181 /s | **1 /s** |
| perf-phone idle heat gates (4 gates) | 2 fail | 2 fail | **all pass** |
| performance-lifecycle board idle, 390 / 1440 (4 s window) | 355 / 157 ms, 44 / 14 recalcs | 344 / 174 ms, 43 / 14 | **10 / 11 ms, 0 / 0** |
| performance-lifecycle menu, planet, hidden, pagehide, 10 navigations | level | level | level |
| performance-offline-soak heap after game 1 / 6 (MiB) | 11.35 / 12.79 | 11.67 / 13.17 | 11.69 / 13.14 |
| motion-cost main-thread, Blast+Bomb+Huge Cut+Bloom (3 runs each) | 5,408 ms | 5,398 ms | -0.8% vs 0.86 before (same session) |
| Cold load to menu, 9 Mbps / 85 ms, 4x CPU (3 runs) | 3.40-3.48 s | 3.87-4.00 s | **3.45-3.53 s** |
| Requests / KB before the menu is ready | 105 / 2,593 | 105 / 3,141 | **84 / 2,407** |
| Total KB by 6 s after the menu (board art included) | 2,997 | 3,518 | 3,518 (same bytes, after the menu) |
| Tap Easy -> game dealt (same link) | 2.1-2.3 s | 2.5-2.6 s | 2.0-2.5 s |
| Board `<image>` nodes at start / game end | 13 / 60 | 49 / 103 | 49 / 103 |
| Planet drag: ground off the finger's direction / miss (8 directions, both engines) | 0-1 deg / 6-9% | **30 deg / 50%** | 0-1 deg / 6-9% |
| Legal-target outline visible, worst of 190 (5 games x 2 sizes) | 100% | 90% | 90% |

What changed (each commit carries its own measurement):

- **Idle heat** (`4800deac`): in game the near star canvas is `display:none`, yet its 20 s slide kept
  running. Chromium cannot composite an animation on a hidden element and ticked it on the main
  thread, a style recalculation every frame. Live had the same cost. `planet-matte` asserts it.
- **Move** (`15a34195`): the veil gate re-read every veil's boxes on every `hidden` toggle in the
  page, forcing a layout mid-move. It now reads only when a veil or its wrapper was toggled
  (-49 ms forced layout in a Draw at 4x CPU; part of it moves to the next reader, ~5% net).
- **Load** (`8b04e4e9`, `d45d70b8`, `1ed337d6`): the board's ~1 MB of pictures were requested at
  module load, competing with the menu's own files. They start on `severor-ready` (not at the next
  idle moment: a board drawn at once then measured ~5% more move work), or at once when a board or
  replay is drawn. `boardArtReady` still means decoded.
- **Shell** (`5d01d20e`): 0.86's worker announces a new build with `client.postMessage()`, which is
  delivered to `navigator.serviceWorker`, never to `window`; the page listened on `window` only. Real
  two-build upgrade (HTTPS, real worker, 404s like production): with the fix an app left on the menu
  moves onto the new build with exactly one reload, never over a game.
- **Planet drag** (`488e450a`, owner report): the flat-side-up roll was applied after the north-up
  drag, so the finger's movement was read in the unturned frame. `rolledDrag` reads it in the turned
  view; sphere-test asserts the ground follows the finger at four sizes, both engines.

Checked, no change needed:

- **"GPU stall due to ReadPixels"**: the page makes zero `readPixels` / `getImageData` /
  `toDataURL` / WebGL-to-canvas copies in normal play (instrumented). A bare WebGL canvas that only
  draws and is shown logs the identical warning on this machine: it is SwiftShader presenting WebGL,
  not the app. Chrome mutes it after four per GPU process.
- **`paint-wordmark.svg` (516 KB)**: never requested by any page (`PAINT_URL` has no reader) and the
  worker has no precache list, so no player downloads it. It is the brand build's source and pinned by
  branding tests. **`futasaku-stone-atlas` (515 KB)**: used (every tile's strength stone).
- **Upgrade 0.85 -> 0.86** (served 0.85, installed its worker, left a game unfinished, replaced the
  site with 0.86): first relaunch is still 0.85 (the old worker answers, as always), the second runs
  0.86; one navigation each, no loop; every saved key unchanged; the v4 cache dropped; the unfinished
  game resumes on 0.86 with the same turn, hand and board. Open mid-game: never reloaded.
- **Console errors** (menu, settings, campaign, tutorial, planet, online lobby, a practice game with
  fast taps, offline mid-game, hide/show, rotation, storage blocked, two tabs) in Chromium and WebKit:
  identical on live and 0.86; the only messages are the absent local game server of the fixture.
- **Visual**: before/after captures at 390x844 and 1440x900 (menu, play menu, game start, mid-game,
  card selected) are pixel-identical apart from capture noise and the LED's own score/prompt cycle.
- **WebKit** now runs here (the network allows `cdn.playwright.dev`): art-lab-ios, blast-input-ios,
  planet-login-ios, sphere-test-ios, territory-gestures-ios, living-territory-ios pass.

Still open (not small; see the release report):

- perf-phone's move gate (p95 of one Draw move <= 34 ms at 4x CPU) flips between 33 and 150 ms on
  every build, live included: each Draw has one 100-150 ms frame, the whole-page `render()` in
  `main.ts` (no partial path for a hand-only change) plus `feedCamera`'s layout read after writes.
- 25 infinite compositor-only pulses keep the compositor drawing at idle (~180 draws/s here, every
  build). Main-thread cost is ~0; GPU/battery cost on a phone is not measured.
- 0.86 holds ~0.35 MiB more heap than live at every game end (bigger art set); no growth per game.
- The painted ground is 37 `<image>`s (one per cell, each its own patch of the painting); one picture
  for the whole board would not be pixel-identical (outer cells reuse inner patches) and needs owner
  sign-off.

### Practice start against the live server (2026-11-16, evening)

Real taps on futasaku.com/test/ against the live game server (Chromium, 390x844, a fresh profile per
"new visitor"). Tap on a Practice difficulty -> game dealt:

| Case | before (`9ea27c2e`) | after (`212b476f`) |
| --- | --- | --- |
| Easy, new visitor, taps at once | 0.4-9.4 s | 0.36 s |
| Easy, returning, taps at once | 3.3 s | 0.37 s |
| Easy, returning, 3 s on the menu | 3.4 s | 0.38 s |
| Hard, new visitor, taps at once | 9.4 s | 0.35 s |
| Hard, returning (either way) | 3.3-3.4 s | 0.36 s |

Causes, each fixed: the live database refused Practice tickets for the rival bots 10-12 (migration 0027,
applied 2026-11-16 and recorded in schema_migrations); a fresh device minted two guests at once
(`bf8c3dca`); and the tap waited up to 3 s / 8 s for a ticket from a server whose write requests are at
times slow or hang. Now a tap with no ticket deals at once and its proof names the deal
(`513140b6`, `212b476f`): proved live, a dealt win paid 20 Seeds once and a resend answered
`replayed: true`. seeds-settle's 'no ticket' scenario holds the line (ticket requests that never answer:
old 3,334 ms and unpaid, new 431 ms and paid). Budget for future work: a Practice tap deals in under
1.5 s with no ticket to be had.

### Opening a match from Your matches, and the Seeds answer (2026-11-16, night)

Opening a match where it is my turn (local server, 390x844, 4x CPU, 250 ms added network delay, three
rounds each). Tap on the row -> board on screen with Draw legal and nothing busy:

| | before (`485bc963`) | after (`79c8e68a`) |
| --- | --- | --- |
| tap -> playable board | 790-890 ms | 570-610 ms |
| requests at the tap | 1 (`/view`, ~330 ms) | 0 |

The list now reads the matches waiting for my move while it is on screen (at most 3, once per new move,
`online/view-prefetch.ts`). What is left is building the board (`openDuel` ~435 ms of CPU at 4x, ~110 ms
unthrottled: the whole-page `render()`, board setup and layout reads). Not changed here.

The Seeds answer for a Practice win, live server, measured from the server's Europe region (the
database is in eu-west-1; from the US region every query crosses the Atlantic and a wallet read takes
1.1 s instead of 0.17 s):

| Bot | first answer | rounds |
| --- | --- | --- |
| 1 | 0.45 s | 1 |
| 6 | 0.90 s | 1 |
| 10 | 3.3-5.1 s | 2-3, one `546 WORKER_RESOURCE_LIMIT` |
| 12 | 4.3 s | 3, a resend hit 546 |

The server replays the whole game to verify it; the rival bots (10-12) need several 1.2 s slices and a
slice can overrun the Edge CPU limit (the page retries, so the payout still lands). Open, for the owner:
show the award at once and correct it only if the server disagrees, and/or smaller slices server side.

The ritual's emblem cover (`ef84de7f`) is four DOM nodes for one kanji rise (~0.6 s), transform and
opacity only, removed as the kanji leaves; `ritual-centering` measures the turned hex on the tile at six
screen sizes (fit within 0.3-0.9 px).

### Seeds on the card, and the rival-bot proof slices (2026-11-17, on the real /test)

A fresh visitor plays one Practice game to its end on futasaku.com/test against the live server
(`probe/real-finish.ts`, local only). Game end -> the finish card; -> "+N Seeds" on it:

| | before (`987b7034`) | after (`94d7494a`) |
| --- | --- | --- |
| Chromium 390x844: card / Seeds | card ~1.25 s, Seeds 1.36 s | 1.25 s / 1.25 s (same frame) |
| iPhone 13 (WebKit): card / Seeds | card ~1.25 s, Seeds 1.84 s | 1.26 s / 1.26 s (same frame) |

The ~1.25 s is the finish card's own entrance after the last move; the Seeds line now arrives with it
(`logic/seed-forecast.ts`), and on one iPhone run it was on the card while the server had not yet
answered. Both runs: the ritual's emblem cover ran, no page errors.

Rival-bot proofs after `c2d129c2` (700 ms slices), live server: 6 wins against bots 10 and 12, all
paid 20, 5-6 rounds, 5-7 s from this machine's region, no `546 WORKER_RESOURCE_LIMIT` (before: 2 of 8
hit it). Promoted live 2026-11-17 (`live` f4ba65f5 -> 94d7494a).

### Public Planet and global chat readiness (2026-11-17)

Baseline for this focused foundation pass: `bc855ad7` on `futa0.5-online` and `live`. The
client already paints a versioned cached world and shares public reads. The remaining critical
path was `WorldView.refresh()` awaiting the public map, wallet and challenges together before
painting fresh ownership. The chat's one-page prefetch was called after a null-world early return,
so a new visitor could not warm chat until the world arrived. These paths were changed without
altering the engine, public map protocol, read cadence, artwork or settled Planet renderer.

Controlled mobile Chromium probe (`web/e2e/foundation-loading.ts`, 390 × 844, local mocked API,
80 ms public map and 800 ms private wallet/challenges):

| Observation | Baseline | Candidate |
| --- | ---: | ---: |
| Fresh connected ownership visible in Planet ranking after the request gate opens | 899 ms | 184 ms |
| Chat GET starts relative to a 900 ms public world request | 961 ms after world start | 1 ms before world start |

Three further serial runs with the same build variables produced fresh-ownership times of
902/844/852 ms on the baseline and 190/187/184 ms on the candidate (medians 852 → 187 ms).
The chat request started 939/966 ms after the world started in two baseline runs; one baseline
run did not start chat within the probe's observation window. It started 1/7/6 ms before the
world request in all three candidate runs. Software-rendered boot/menu timings varied by
seconds in both builds, so this probe does not establish a general cold-start speedup.

The ranking is a visible UI proxy for public ownership paint, not a GPU frame timestamp. A
separate five-run unit-level deferred-read probe measured a median 802 → 80 ms to the public
paint callback with the same 80/800 ms delays. A cached world remains on screen before release
of the fresh response. The candidate's one warm chat GET still shares an open-panel read; no
extra polling was added. A failed cold chat read now leaves `LOADING` for a truthful offline
status; a 10-second read deadline aborts a stalled request and permits a retry. Closing chat
aborts its pending GET.

The real public world endpoint, read twice from this execution region without writes or load
testing, took 2.43 s and 1.39 s for 22,639 bytes. Those are network/server samples, not the
controlled client comparison. First visitors without a cached world still depend on that path;
its lazy challenge settlement and expiry preserve authoritative territory state. No database
latency breakdown or physical phone battery/thermal measurement was available in this pass.

The reported `online-soak-teardown` CI failure occurred at the app-level retry convergence
check on matches 8 and 15. A local 15-match baseline run passed those checks. An initial
fixture change pointed Realtime at its local HTTP server, but GitHub still failed at match 12:
Node left some unhandled WebSocket Upgrade connections pending until the product's 12-second
deadline. The socket trace showed retry gaps of up to 18 seconds. The fixture now explicitly
answers each Upgrade with HTTP 426 and closes it; a direct local handshake probe failed in
16 ms rather than waiting for the product's 12-second deadline. It retains the same
60-second convergence condition, zero-socket/interval/frame assertions and real product retry
logic. The pre-426 candidate passed all 15 matches locally, including 8 and 15; the final
post-426 GitHub result is the release check. Both local builds had zero
requests during each five-second hidden-tab sample and zero sockets/intervals/frame callbacks
after every exit route. The candidate's last-ten-match retained-heap slopes were 152 and
245 KiB/match for the two seats, versus 271 and 134 KiB/match on the baseline; all four are
below the existing 1,024 KiB/match guard. These short-run slopes are not proof of a permanent
plateau, and the change is not claimed as a general memory-speed improvement.

The first split-read candidate needlessly repainted wallet, panel, rings, swords and challenge
controls when an unchanged private response followed the public paint. A focused mobile drag
repeat exposed this extra work, and the final implementation only repaints private controls when
wallet balance or challenge state changes. It also refreshes the selected tile when a late wallet
read changes affordability. The regular public challenge paint remains in place so countdowns
still update on a normal poll. This was verified with a regression test and a repeat of the
same software-browser probe:

| 390 × 844, 4× CPU, Chromium SwiftShader | Baseline repeat | Split-read before cleanup | Final |
| --- | ---: | ---: | ---: |
| Planet drag main-thread task duration (ms/s) | 194 | 297 | 190 |
| Planet drag application frame callbacks | 77 | 77 | 77 |
| 3,000-tile drag main-thread task duration (ms/s) | 174 | 239 | 184 |
| 3,000-tile drag application frame callbacks | 26 | 26 | 26 |

These are single action windows, not battery or real display-frame measurements. The full
baseline and candidate lifecycle runs differed widely in short idle samples even before the
cleanup (for example the baseline 3,000-tile idle sample read 400 then 95 ms/s), so no general
frame-rate gain is inferred from the drag table. The two full runs had zero board rAF callbacks
in the sampled game-idle windows and zero menu callbacks after the 45-second rest. The candidate
desktop Planet drag and ten-navigation costs were 64 and 165 ms/s versus 87 and 186 ms/s on the
baseline. The final mobile repeat is the relevant guard for the code added in this pass.

Three complete offline games in one document, normal motion, 390 × 844, software WebGL, and the
real bot worker finished after 38, 34 and 35 automated player actions. There were no page errors,
and all three four-second postgame idle captures recorded zero application rAF callbacks. The
garbage-collected result-screen heap was 11.67, 12.35 and 12.63 MiB; this is consistent with the
earlier documented six-game pattern (11.69 to 13.14 MiB), although that earlier run was on a
different commit and is not an exact A/B comparison. The 15-match online soak is the stricter
teardown and request-rate check. No new images, packages, render loop or polling cadence were
introduced. Physical iPhone/Android battery draw and temperature remain unmeasured; these CDP
numbers only describe a throttled desktop software renderer.

### Cold start on the real server: Planet, Global chat, achievements (2026-11-18)

Owner report: on a fresh iPhone visit to /test (1852a15d), Global chat stayed loading and the
achievements never showed. Measured with a fresh phone context (Chromium 390 × 844 and WebKit
iPhone 13) on the real futasaku.com/test and futasaku.com, same server, 5 cold + 5 warm runs each,
interleaved, every API request marked as test traffic, 30 s watch after the Planet opened.

**The server answers in under 3 s, or not at all.** Health and auth-methods answered in 0.2–0.6 s
throughout. Requests that touch the database — guest creation, the map, wallet, challenges, chat,
presence — were sometimes left open with no answer for 30 s and more, on both sites. In the
Chromium runs live got no guest within 30 s in 7 of 10 loads, /test in 3 of 10 (/test retries the
guest every 12 s; live never does). A burst of 20 parallel map reads from one host hung 18 of them
for 25 s; the map answered in 0.4–2.7 s once single requests resumed. The database was not
inspected (no access from this pass); the cause of the silences is a server question
(docs/DEPLOY-ONLINE.md) and no server code was changed.

**What stalled on /test.** Achievements were only requested after the wallet read, and the wallet
read had no time limit: one silent wallet read left "Reading your progress…" for as long as the
page stayed open (reproduced on real /test, Chromium cold run 3 and 4; live showed the same stall
in its run 3 and warm 5). Fix: achievements are their own read (on identity, and on the next 12 s
poll while no list has arrived or a read failed); wallet, challenges, achievements and colour reads
end after 12 s like the map and guest creation (four times the slowest real answer seen); chat
shows the last page this account read (one slot, credential digest, 24 h) on the next visit.

`web/e2e/cold-start-slow.ts` (+ `-ios`), local API: first guest never answers then 7 s, first map
8 s, first two wallet reads never answer, first achievements 503, first chat 6 s; fresh visitor:

| | Planet | Chat messages | Achievements | Longest loading line |
| --- | ---: | ---: | ---: | ---: |
| 1852a15d, Chromium | 7.9 s | 24.9 s | never (stuck 34 s+) | 34 s (achievements) |
| 1852a15d, WebKit | 7.3 s | 24.3 s | never (stuck 34 s+) | 35 s (achievements) |
| fix, Chromium | 7.9 s | 24.9 s | 31.0 s | 7.4 s (map) |
| fix, WebKit | 7.2 s | 24.3 s | 30.3 s | 6.6 s (map) |

Chat and achievements wait on the guest (first creation silent for 12 s, then 7 s). No new
interval, frame callback or socket: each bound is one timer per request, cleared on answer.

**Second pass, same day (owner: "25 seconds to load the chat?").** The first fix finished, but
slowly: each silent request cost the full 12 s before a retry, and a failed achievements read
waited for the next 12 s poll. Now a request still silent after 3 s gets ONE second copy beside it
(first answer wins, the other is cancelled; the map, guest creation, wallet, challenges,
achievements, colour and the chat page), and a failed achievements read is asked again at 2, 4
and 8 s (one-shot timers, none while hidden). The slow-server check was rewritten to the measured
pattern (answers in under 3 s or never) and now fails on slow, not only on never:

| Same scenario, fresh visitor | Planet | Chat messages | Achievements |
| --- | ---: | ---: | ---: |
| 1852a15d, Chromium | 14.8 s | 32.8 s | never |
| 1852a15d, WebKit | 14.1 s | 32.1 s | never |
| fix, Chromium | 3.4 s | 7.7 s | 8.7 s |
| fix, WebKit | 3.7 s | 8.0 s | 9.0 s |

Chat and achievements still wait for the guest (the server serves chat only to an identity): a
silent first guest creation costs 3 s plus the second copy's answer. A guest creation answered twice
leaves one unused guest row on the server; only the first answer is kept on the device.

**Ready before the tap (owner, same day: "this should load as soon as player opens the game right?
even on main menu").** The menu already read the map; chat was warmed only if an identity existed
when the menu painted (a new visitor's guest arrives a moment later), and achievements were never
read before the Planet opened. Now the moment an identity is known on the main menu (a returning
player at once, a new visitor when the guest is created), the chat page and the achievements are
read once each (achievements again only when over a minute old). Same slow server, visitor first
spends 12 s on the menu, then taps the Planet:

| After 12 s on the menu | Planet | Chat messages | Achievements (incl. ~1 s of the check's own taps) |
| --- | ---: | ---: | ---: |
| Chromium | 0.35 s | 0.35 s | 1.3 s |
| WebKit | 0.35 s | 0.35 s | 1.3 s |

No poll, interval or socket was added: one read per identity, and nothing runs while hidden.

## Debug pass re-measure (2026-11-19)

Live `1776fe3d` against this branch (`c3e41cf3`: sound warm-up gated by the master switch, the
streak fold window, test-only fixes). Same machine, serial runs, futa05 builds, 4x CPU.

| Measure | live 1776fe3d | branch |
| --- | --- | --- |
| performance-lifecycle board idle, 390 / 1440 (median task ms, recalcs) | 12.7 / 6.1 ms, 0.25 / 0 | 4.0 / 6.4 ms, 0 / 0 |
| performance-lifecycle menu asleep, 390 / 1440 | 4.7 / 8.2 ms, 0 recalcs | 6.2 / 10.4 ms, 0 recalcs |
| performance-lifecycle 10 navigations, 390 / 1440 (task ms, `/v1/` requests) | 231 / 130 ms, 109 / 112 | 240 / 126 ms, 110 / 115 |
| performance-offline-soak heap after game 1 / 6 (MiB) | 11.69 / 13.22 | 11.74 / 13.24 |

Level with live and with the 0.86 baseline above. `hidden-synthetic` counted 2 requests on live and
3 on the branch: logged per URL, both builds make the same reads, all started by the synthetic
`pageshow` a moment before the page is hidden (wallet, challenges, matches, achievements, chat); which
of them land after the window opens is timing. Nothing new runs while hidden.

### Accounts pass re-measure (2026-11-19)

`44bfd948` (merge, settings sync, win ownership, sign-in warm-up) against `c3e41cf3` (before it),
same machine, serial, 5 samples each. performance-lifecycle board idle, median task ms (390 / 1440):
**10.9 / 10.1** vs 12.9 / 11.5 before; menu asleep 0 recalcs on both. Level. The settings sync runs
only for a signed-in account, on start-up, on return to the page (at most every 30 s), when Settings
opens and on the way out: no timer, no polling, nothing while hidden.

### Menu Planet skins and Profile (19 November)

Chromium at 390×844, same slow-server fixture on the live baseline `95494bb9` and the candidate.
From the immediate Planet tap, Planet/chat/achievements appeared at 1.61/6.03/7.11 s before and
0.40/4.21/5.31 s after. After 12 s on the menu, the same values were 0.46/0.46/1.48 s and
0.43/0.43/1.50 s. These are single runs against a simulated slow API. The Planet skin suite
also holds the atlas response while the menu paints, then checks the menu and Territory share
one atlas request. A menu with no skinned claims keeps the plain path.

Profile shares the menu's pending wallet read. Its achievements and Blitz requests only start
when Profile opens. The browser fixture exercises a transient public Profile failure and a
failed map and combined record response while all the individual Profile fields populate.
