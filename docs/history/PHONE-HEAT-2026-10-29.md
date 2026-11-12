# Phone heat and battery — optimisation pass (2026-10-29)

**Owner report:** "when playing game at the moment - phones are getting hot and battery goes down
quickly". This pass measured what a phone actually has to sustain, fixed the two things that
dominated it, and left the game's look and feel untouched. No rule, deck, scoring or animation
design changed.

**Headline, measured on an idle game screen** (390×844, DPR 3, touch, 4× CPU throttle — the
profile `docs/LOAD-PERFORMANCE.md` already uses): the game's idle main-thread work fell by **~95%**
and the engine's per-frame style recalculation stopped entirely.

| idle, 4× CPU, 390×844 | BEFORE | AFTER | change |
| --- | --- | --- | --- |
| style recalculations / s | 60.3 | **2.2** | −96% |
| style recalculation, ms/s | 266.4 | **7.1** | −97% |
| main-thread task, ms/s | 328.0 | **16.8** | −95% |
| main-thread frames/s (BeginMainFrame) | 181.7 | **6.7** | −96% |
| layouts / s | 19.7 | **2.0** | −90% |
| script, ms/s | 0.1 | 0.3 | noise (both ~0) |
| raster, ms/s | 5.4 | 5.2 | unchanged |
| frames the GAME requests | 0.0/s | 0.0/s | already 0 |
| animations running | 25 | 23 | see "what is left" |
| **hidden tab**: animations running | 19 | **0** | −100% |
| **hidden tab**: style recalc, ms/s | 96.2 | **9.2** | −90% |

The same probe at 1× CPU (no throttle):

| idle, 1× CPU | BEFORE | AFTER |
| --- | --- | --- |
| style recalculations / s | 60.0 | **2.3** |
| style recalc, ms/s | 101.5 | **1.7** |
| main-thread task, ms/s | 127.1 | **4.9** |
| main-thread frames/s | 181.0 | **7.5** |

A move is unchanged in both builds: 60 fps at 1× (`p95` 16.8 ms), and `p95` 16.8–27.8 ms at 4×.
Nothing about how a move looks, or how long it takes, moved.

## What was measured, and how

`web/e2e/perf-phone.ts` (new, repeatable). It plays a REAL offline game from a seed, on a phone
viewport at 4× CPU throttle (and 1×), and records:

- **idle**: the frames the GAME asks for (its own `requestAnimationFrame` calls), style recalc /
  layout / script / task per second and long tasks (CDP `Performance.getMetrics`), and compositor
  frames, main-thread frames and raster ms (a CDP trace: `MainFrame.Draw`, `SendBeginMainFrame`,
  `Raster*`).
- **a turn**: rAF frame gaps while a real move animates.
- **animation census**: every running animation, classified compositor-only
  (transform/opacity/scale/translate/rotate) vs a paint or layout property (box-shadow, filter,
  width, stroke-dashoffset, …), with its target.
- **layers**: visible elements with `filter` / `backdrop-filter` / `will-change`, biggest
  box-shadow blur.
- **hidden tab**: animations still running, game rAF, main-thread cost.

The probe never keeps a rAF loop running while idle: a probe that does that forces the browser to
produce a frame every 16 ms and measures its own heartbeat. Idle frames come from the trace.

**Honesty about the environment.** This is a desktop Chromium, not a phone; phone behaviour is
emulated with CPU throttling and a phone viewport. The host was shared and busy, so absolute
milliseconds are noisy — the BEFORE/AFTER columns above were taken with the same harness, same
seed, same viewport, minutes apart, and every number that moved is consistent across runs
(ranges are in the harness output). **Real device temperature cannot be measured here.** The
numbers that stand in for it are main-thread task ms/s, style recalculation ms/s, and the number of
perpetually running animations: they are what the CPU/GPU has to do for as long as the screen is on,
and they are the direct cause of both heat and battery drain.

Frames per second of *compositor* drawing stay at ~170/s in this headless browser (a phone is
capped at 60) in both builds: the decorative ambient animations are still running. That is the
remaining lever and it is a visible decision, not a bug — see "What is left".

## What changed (ranked by measured effect)

### 1. The idle re-prompt blink is stepped, not animated (−96% of idle main-thread work)

`web/src/player/smart-cockpit.ts` (CSS + `startBlink`), new `web/src/player/led-blink.ts`.

The display's sticky "it's your move" re-prompt blinked by animating `opacity` on the two glyph
canvases with a 1 s infinite CSS animation. A non-composited animation forces a **full style pass
every frame**, for as long as the player thinks — measured at 60 recalcs/s, ~266 ms of style work
and ~328 ms of main thread per second at 4× CPU. It was 100% of the idle bill: pausing every CSS
animation took idle to ~0.

A blink is two instants a second. `led-blink.ts` gives the next phase and its hold from
`LIGHT_CAPS` (ON for 800 ms, OFF for 200 ms — the owner's negative-space blink, unchanged), and the
cockpit toggles one class for it. Same dots, same beat, same 1 Hz, two wake-ups a second instead of
sixty. It stops entirely when the tab is hidden or the alarm ends. Verified on the running page:
OFF at 891 ms, ON at 1095 ms (204 ms off), OFF at 1903 ms (808 ms on) — a 1000 ms beat with 200 ms
of dark.

### 2. Every animation pauses while the tab is hidden (−100% of hidden animations)

New `web/src/ui/hidden-pause.ts`, mounted in `main.ts`. A phone in a pocket with the game open kept
19 animations running (Chrome throttles a background tab but the animations keep their clocks).
The gate pauses exactly the animations that were playing and resumes exactly those, so an animation
that something else paused on purpose (the hand's breath under a finger, a frozen screenshot state)
stays paused.

### 3. The hand's idle breath composites (removes the last per-frame style work)

`web/src/logic/motion.ts` (`breathAmpStep`), `web/src/style.css` (`hand-breath-a8..a4`),
`web/src/main.ts`.

The breath's keyframes read `calc(1 + (var(--breath-scale) - 1) * 0.5)`. A keyframe value that
depends on a custom property cannot be handed to the compositor, so each breathing card forced a
style pass every frame. Five static amplitudes replace the per-card `var()`; the card picks one by
weight. The worst case differs from the old exact amplitude by 0.0005 of the card's size — 0.03 px
on a 60 px card. Period and phase stay per-card.

### 4. The blink's 20 ms cross-fade became a cut

Each edge of the blink used a 20 ms opacity ramp: 1.2 frames at 60 Hz, and still a style pass per
edge. A cut is what the dots themselves do. Idle went from 8.4 to 2.2 recalcs/s.

## What was tried and REVERTED (it did not measure)

- **`will-change`/`contain: paint` on the LED canvases** to make the old animation composite: no
  change (the main-thread tick stayed at ~180 frames/s). Reverted; the stepped blink is the fix.
- **Quantising the ambient animations with `steps()`** (spores, hand, warm pass, glints): frames and
  traced event time unchanged. Reverted.
- **Hiding the full-screen warm pass, the spores, the gold-frame shadows, the empty-hex
  brightness filter** to see what a move costs: the numbers moved in the wrong direction (host
  noise dominated), i.e. no measurable win. Left alone.

## What was deliberately not touched

- **Rules, deck, scoring, bots** (`src/engine/`, `src/bots/`): not read, not changed.
- **The game's look and motion**: no animation was removed, shortened or simplified except the
  blink's 20 ms edge; no effect was dropped; no blur, glow or shadow changed. The empty-hex
  `brightness(1.15)` filter, the gold-frame drop shadows and the two backdrop-filter panels stay.
- **The `will-change: transform` on the seven spore motes**: already compositor-only and measured
  in a previous pass (see the note in `style.css`).
- **`web/src/online/world-view.ts`, `challenge-*`, `world-growth.ts`, `swords-glyph.ts`,
  `server/src/seeds/*`**: owned by the marker/legend work in another worktree.

## What is left (needs an owner decision, because it is visible)

After the fixes, an idle game screen still produces 60 composited frames a second on a phone
(measured as ~170/s in this uncapped headless browser). Those are the *intentional* ambient
animations: seven drifting spores, four ambient glints, the hand's breath, the two piles' ready
pulse, and the full-screen warm light pass (`mix-blend-mode: screen`, 32 s loop). They are all
compositor-only now (main thread is idle), so the remaining cost is GPU/battery, not CPU heat.

The biggest single compositor cost is the full-screen warm pass: pinning it at the visible peak of
its cycle and tracing the same 2.5 s window with and without that layer measured **968 → 532 ms/s**
of composited event time — about 45% of the idle compositor budget. Making it cheaper means either
a different blend mode (a visible change to the wash) or stopping it, which is exactly the kind of
decision the owner asked to be told about rather than taken silently. A cheap version worth
proposing later: stop the *decorative* animations (spores, glints, warm pass) after N seconds of
no input, resume on touch — the screen keeps its light, the expensive loops stop.

## Checks run

| check | result |
| --- | --- |
| `npx tsc --noEmit`, `-p web`, `-p admin` | clean |
| `npm run check` (typecheck + every unit test) | 329 files passed, 3331 tests passed, 1 expected fail, 66 skipped |
| `CHANNEL=futa05 … npm run web:build` | built |
| `CHANNEL=futa05 … node scripts/check-channel-assets.mjs` | `futa05: asset isolation passed (103 files)` |
| `web/e2e/perf-phone.ts` | 6/6 budgets pass (AFTER); 3 fail on the base commit (BEFORE) |
| `web/e2e/smoke.ts` | 38/38 |
| `web/e2e/painting.ts` | 25/25 |
| `web/e2e/overhaul.ts` | 13/13 |
| `web/e2e/futa04-motion.ts` | passed (needs a `CHANNEL=futa04` build) |
| `web/e2e/futa04-living-display.ts` | 27/27 |
| `web/e2e/futa04-smart-cockpit.ts` | 883/883 |
| `web/e2e/futa04-critical.ts` | 225/225 |
| `web/e2e/hand-glow-urgency.ts` | all pass |
| `web/e2e/bloom-six-responsive.ts` | 45/45 |
| `web/e2e/cut-severe.ts` | passed |
| `web/e2e/motion-audit.ts` | ran, numbers printed, no failures |

**Known failures, proven pre-existing on this host** by running the same suites against a build of
the untouched base commit `30cc6d01`:
`web/e2e/light-source.ts` and `web/e2e/futa04-display-glow.ts` both stop at their "wait for the
display to rest on the score" step (8 s / 6 s). On this loaded host the display has already entered
its sticky idle re-prompt by then (`DRAW!` + `led-alarm`), in both the base and this build — the
same logged DOM state. The new blink's cadence and contract were verified directly instead (see
"1."). `web/e2e/futa04-board-turn-polish.ts` reports the same five failures (wordmark alignment at
360×640, card bottom margin at 1440×900, the LED pulse read) on the base commit.

## Harness

`web/e2e/perf-phone.ts` — `RUNS`, `CPU`, `IDLE_MS`, `SEED`, and `DIST` (serve an already-built
directory, which is how the BEFORE column was taken from `git archive 30cc6d01`).
