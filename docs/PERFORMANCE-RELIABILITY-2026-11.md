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
