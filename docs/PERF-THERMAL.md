# PERF / THERMAL / SNAPPINESS — measured pass

Baseline: `futa0.5-online` @ **1b2f9b7a** (the release the owner compares against). Branch: `perf-thermal`.
Every number below was taken on this machine with the harness in `scripts/perf/` (shipped, so
anyone can re-take them). It drives the built product in Playwright at 390x844, DPR 3, with a 4x CPU
throttle, and reads frame cost from CDP `Tracing` plus `Performance.getMetrics`.

## How the numbers were taken

* Product build served as the product serves it:
  `CHANNEL=futa05 VITE_DUEL_API_URL=https://duel-stub.invalid/v1 VITE_SUPABASE_URL=https://stub.invalid VITE_SUPABASE_ANON_KEY=stub npm run web:build`
* Playwright (repo-pinned `playwright-core` 1.56.1 + Chromium 1248), **mobile emulation 390x844, DPR 3,
  `Emulation.setCPUThrottlingRate{rate:4}`**, iPhone UA, `prefers-reduced-motion: no-preference`,
  `prefers-color-scheme: dark`.
* Frame/main-thread data from CDP `Tracing` (`devtools.timeline`, `disabled-by-default-devtools.timeline`,
  `…timeline.frame`, `benchmark`, `blink.animations`, `cc`, `gpu`, `viz`) via `page.context().newCDPSession(page)`.
  Traces are summarised in memory and **never written to disk** (they are 50-200 MB each; the disk on this
  machine had ~200 MB free at one point and a persisted trace filled it).
* CPU-throttled runs are the comparison basis. Sampling window 5-6 s per stage after a 2-2.5 s settle.
* "main %" = sum of `RunTask` on the renderer main thread / wall time. "layout/paint" = counts of Blink
  `Layout` / `Paint` events in the window. "GPU %" = summed task time on the GPU-process threads / wall time
  — **this one is noisy** (the same unchanged state measured 19%, 28%, 107% and 122% across runs), so it is
  used only as a direction, never as a headline.
* Planet frame rate is read from the renderer's own `frames` counter (`__severgrow.planet()`), which is exact.

Reproduce: see **Commands** at the end.

---

## 1. rAF inventory (every loop in the codebase)

| Loop | Where | Trigger | Idle rate | Self-stops? |
|---|---|---|---|---|
| Planet (menu drift, world, finish card) | `web/src/sphere/planet.ts` `frame()` | `ask()`; drift timer | **30 fps forever** behind the menu, ~30 fps in the Territory window, ~30 fps on the finish card | Only on `document.hidden`, dispose, or the window filling with planet. **Did not stop behind a sheet, the finish card, or the PLAY submenu.** |
| Space backdrop | `web/src/player/space-backdrop.ts` | WAAPI slide + one redraw per `SLIDE_MS` (20 s) | 1 redraw / 20 s; compositor slides a cached bitmap | Yes — `halt()` on hidden/other screen. Did **not** stop behind a veil. |
| Turn pill | `web/src/ui/turnpill.ts` | turn state | 0 (no loop while hidden) | Yes |
| Drag layer | `web/src/ui/drag-layer.ts` | pointer drag | 0 | Yes |
| Replay player | `web/src/replay/player.ts` | replay playing | 48-60 fps while replaying | Yes |
| Score pop / glow / perf HUD | `web/src/main.ts` (`scoreRaf`, `glowNear`, `perfRaf`) | interactions | 0 | Yes (`busy()`/`enabled` gates) |
| Boot cover | `web/src/player/boot-cover.ts` | boot | stops after the reveal | Yes |
| Camera / live duel UI | `web/src/player/camera.ts`, `web/src/online/live/ui.ts` | flights, live matches | 0 | Yes |

**The single continuous idle rAF in the whole app is the planet.** Everything else is event-driven.

## 2. Frame cost per stage (baseline, 4x CPU)

| Stage | main % (busy/5 s) | layout | paint | style ms | rAF/s | frames >16.7 ms | frames >33 ms | notes |
|---|---|---|---|---|---|---|---|---|
| Menu idle | 9% (429 ms) | 0 | 0 | 56 | **30** | 0 | 0 | planet drift + space backdrop |
| Menu idle, planet canvas hidden | 3% (139 ms) | 0 | 0 | 17 | 24 | 0 | 0 | the planet is ~6 points of main thread |
| Menu idle, Reduce motion | 0% (0 ms) | 0 | 0 | 0 | **0** | 0 | 0 | proves the drift loop is the only idle work |
| Match idle (waiting for you) | 23-29% | 127 | 240 | 661-1310 | 0 | 0 | 0 | all of it is the board's ambient layer |
| Match idle, `.l-amb` animations off | 14% | **0** | **0** | 481 | 0 | 0 | 0 | ambient layer = ~9 points + every paint |
| Match + pause sheet | 27% | 601* | 602* | 229 | 0 | 0 | 0 | *sheet over the live board |
| Mid-turn animation (draw + bloom) | 14% | 30 | 141 | 790 | 0 | 2 | 1 | longest task 49 ms |
| Finish card (planet + final board behind it) | **27% (1353 ms)** | **601** | **602** | 229 | 0 | 4 | 0 | GPU ~90-105% |
| Replay playing | 22% avg, p95 12.9 ms | 851 | 2213 | 596 | 48-60 | 22 | 3 | legitimately animating |

\* The pause-sheet and finish-card rows are the *same* work: a `backdrop-filter` veil sitting over an
animating layer.

## 3. Long tasks

Boot (cold, 4x CPU), all >50 ms:

| at (ms) | duration | what |
|---|---|---|
| 126 | 110 | `index-*.js` parse + first execution |
| 256 | 76 | module evaluation, first dynamic import |
| 501 | 67 | `smart-cockpit` chunk + forced style and layout (15.4 ms) |
| 669 | **324** | `endgame-planet` chunk executing (`import.then`) — **the end-screen planet's code is parsed on every cold load, before it can be needed** |

First interaction: none over 50 ms in the measured path. Mid-turn and replay: one 88.8 ms LoAF during replay
(`FrameRequestCallback` with 60 ms of forced style/layout).

## 4. Layer / compositing inventory

| Kind | Count | Where |
|---|---|---|
| `backdrop-filter` declarations | **26** | `--veil` (finish card, scrim, install scrim), `--dark-glass-blur` = `blur(9px) saturate(1.05)` (sheets, pause panel, lobby panels), `--invite-veil` = **`blur(44px) brightness(.34) saturate(.6)`** (install + keep-progress) |
| Heaviest blur | `blur(44px)` over a full-screen scrim | `#install-prompt > .install-prompt-scrim`, keep-progress |
| Permanent `will-change` | 9 | motes (7 tiny layers, deliberately measured and kept), ritual deck (only while the ritual's DOM exists), drag layer, `#tutorial-curtain` (full-screen `opacity` layer that exists even when idle) |
| `will-change` correctly dropped | `world-keys`, reduce-motion paths | already conditional |
| Layout-property transitions | 1 | `.world-standing-meter i { transition: width 600ms }` (a 4 px meter on the Territory panel) |

## 5. Animation inventory (`infinite`, and whether it is gated)

| Family | Count on screen | Gated by |
|---|---|---|
| `.l-amb` (`amb-glint`, `amb-bubble`, `amb-pulse`, `amb-ember`, `amb-sway`, `territory-heartbeat` x25) | up to ~25 SVG nodes | `ambientPlan()` returns none on Reduce motion / Effects Low / while a move animates. **Was not gated by a veil.** |
| `v075-dust` (7 motes) | 7 | `@media (prefers-reduced-motion)` only |
| `futasaku-warm-pass` (`#game::before`, 32 s) | 1 full-screen layer | nothing — **this is what kept the finish card's blur recompositing** |
| `hand-breath-*` | 1 per card | `.breathing`, Effect Low |
| `world-*` (Territory map: mist, glint, halo, border, spore) | 0 on the menu/game screens | only inside the Territory window |
| `smart-led-*` | 2 | turn state |

## 6. Canvas budget

| Canvas | Backing store | CSS size | Redraws when static? | Preserve/read-back |
|---|---|---|---|---|
| Planet (menu) | 780x1688 (DPR 2 cap) | 390x844 | **yes, 30 fps** | no |
| Planet (Territory window) | 740x1184 | 370x592 | yes, when stars are visible | no |
| Planet (finish card) | 740x1184 | 370x592 | **yes, 30 fps while the card just sits there** | no |
| Space backdrop (2) | screen + slide margin | offscreen | no — one redraw per 20 s | no |
| Smart cockpit LEDs (3) | 171x78 / 120x104 | 57x26 / 239x208 | no | no |

DPR cap is 2 everywhere (`Math.min(devicePixelRatio, 2)`). No `preserveDrawingBuffer`, no `readPixels`.

## 7. Asset weight and first-paint path (product build)

Cold load transferred **3.03 MB / ~50 requests** (including the stubbed DNS failures the online config makes).

Top 15 by bytes:

| bytes | asset |
|---|---|
| 528,140 | `paint-wordmark.svg` (also 211 kB gzipped — the largest single byte cost in the whole app) |
| 527,630 | `futasaku-stone-atlas.webp` |
| 517,150 | `index-*.js` (gzip 176 kB) |
| 235,900 | `futasaku-gold-frames.webp` |
| 171,120 | `lobby-ui-*.js` |
| 158,340 | `index-*.css` (gzip 33.8 kB) |
| 107,210 | `paint-wordmark-4x.webp` |
| 101,000 | `ash.webp` (card art) |
| 94,580 | `dew.webp` |
| 94,160 | `index.html` (inline CSS + markup, gzip 23 kB) |
| 92,390 | `online-css-*.js` (CSS strings) |
| 91,520 | `moss.webp` |
| 91,340 | `ember.webp` |
| 89,610 | `board-*.js` |
| 73,840 | `smart-cockpit-*.js` |

Critical path: `index.html` (inline first-ground style, so no white flash) → `index.css` → `index.js` →
dynamic imports (`lobby-ui` 171 kB → `online-css` 92 kB → `endgame-planet` 52 kB). Eagerly decoded on every
cold load: 6 card faces (~400 kB), 3 hardware frames, 2 wordmarks, 4 fonts.

## 8. Cold-start timeline

| | cold | warm | home-screen (standalone) |
|---|---|---|---|
| TTFB | 8 ms | 8 ms | same (no browser chrome; `100dvh`/`svh` already correct) |
| first paint | **108 ms** | ~40 ms | 108 ms + the iOS launch image (plain charcoal, `splash/*`) |
| DOMContentLoaded | 232 ms | — | — |
| load | 254 ms | 124 ms | — |
| app ready (`__severgrow.ready()`) | **586 ms** | ~330 ms | — |
| menu interactive | same as ready (the menu's keys are real DOM from the first frame) | — | — |
| first match playable | 5,396 ms end-to-end *including* a played-out bot turn in the probe; the starter ritual alone is ~1.2 s | — | — |
| planet's first frame | ~120 ms after ready | — | — |

---

## Ranked offenders (by measured cost)

1. **The finish card kept the entire match animating behind a `blur(7px)` veil.** 27% main-thread busy, 601
   layouts, 602 paints per five idle seconds, 90-105% of a GPU core. A backdrop blur over a moving layer is
   recomposited every frame; the card's own planet was also still running a 30 fps loop. — *fixed, see W1.*
2. **The menu's planet redrew a full-screen procedural sky + 104k ground vertices 30 times a second,
   forever, even behind a sheet.** 6 points of main thread and (directionally) most of a GPU core on a screen
   where the only motion is a 2.25°/s turn. — *fixed, see W2.*
3. **The board's ambient layer invalidated SVG geometry ~120 times a second** in the match, and kept doing it
   behind veils. 9 points of main thread and *all* paint work in an idle match. — *fixed behind veils; still
   costs ~10% while the board is actually visible (by design).*
4. **`#game::before` (the 32 s warm pass) animated under every veil.** A `*` selector never matches a
   pseudo-element, so the pause rule missed it. — *fixed, see W1.*
5. **`endgame-planet` (52 kB) is parsed and executed on every cold boot** — a 324 ms long task at 4x — long
   before a card can exist. — *not fixed; see "what we deliberately did not do".*
6. `blur(44px)` invitation veil. Only ever over a now-frozen background, so its cost collapsed with W1.
7. `#tutorial-curtain` holds a full-screen `will-change: opacity` layer at rest. Left alone (it buys a
   frame-one-clean transition into the curtain; measured cost is layer memory, not CPU).

---

## Changes, with before/after

Metrics are the same harness, same throttle, same windows. "main" = renderer main-thread busy %.

### W1 — nothing behind the glass moves (`web/src/ui/render-gate.ts`, `style.css`, `main.ts`)

One gate: a veil is up ⇒ every decorative animation behind it is paused, the planet's loop stops, the star
slide stops, and the board's ambient plan is set to none.

| Stage | before | after |
|---|---|---|
| Finish card — main | 27% | **1%** |
| Finish card — layouts / paints (5 s) | 601 / 602 | **0 / 0** |
| Finish card — GPU thread | 90-105% | **0%** |
| Match + pause sheet — main | 27% | **1%** |
| Match + pause sheet — layouts / paints | 601 / 602 | **0 / 0** |
| Menu + Settings sheet — planet frames/s | 30 | **0** |
| Menu + Settings sheet — main | 4% | **0%** |

Resuming is free: paused CSS animations continue from the same frame, and the planet restarts at the frame
that was already on its canvas (`lastFrame = 0` gives it a normal first `dt`).

### W2 — the planet's frame budget (`web/src/sphere/planet.ts`)

The menu's turn is 2.25°/s (one turn in 160 s) — about a pixel of limb travel per frame at 20 fps.

| | before | after |
|---|---|---|
| Menu planet frames/s | 30 (measured 30.5) | **20** (measured 20.5) |
| Menu main-thread busy | 9% | 3-4% |
| Menu planet behind a sheet | 30 fps | **0** |
| Reduce motion | 0 fps | 0 fps (unchanged) |

A flight, a drag, a pinch, a coast and the tap pulse all still run at full rate — only the drift-only case
is budgeted.

### W3 — ambient life stops with the match's own motion

`board.ambient()` is now planned as `null` while the gate is held, and the plan is recomputed when the gate's
edge changes. This is what removed the finish card's 120 SVG invalidations/s (the layer was invisible behind
the blur, so this is not a visual change).

---

## What we deliberately did not do, and why

* **Front-face culling / indexed geometry for the planet.** The planet is vertex-bound, not fill-bound —
  proven: forcing the canvas to DPR 1 (a quarter of the pixels) changed nothing (113% → 109% GPU), while
  hiding it entirely dropped to 21%. 104k vertices per frame at 30 fps is the cost. Halving it needs either
  32-bit indices with per-frame index compaction (a JS write of ~50k indices per frame) or a per-edge flag
  rework, because the per-edge border mask is currently carried per duplicated vertex. That is a real
  project with a real chance of a visual regression in the tile borders; W2 already takes a third of the
  frames and W1 takes all of them when nothing is visible. Left for a dedicated pass with a baseline diff.
* **`endgame-planet` split out of the boot path.** It is the largest single long task on a cold load
  (324 ms at 4x), but the finish card's mount is synchronous (`mountEndgamePlanet(host, …)` returns the
  handle the card paints through), so deferring it means turning that seam async across `lobby-ui` and
  `main.ts` — a refactor of the finish path on the night of a release, for a win that only shows on the
  cold boot. Documented as the next perf ticket.
* **Baking the `blur(44px)` invitation veil to an image.** After W1 the background under it is frozen, so the
  blur is composited once, not per frame. Baking would buy a single save of one composite and change the
  look on the one screen the owner has already reviewed twice.
* **DPR reduction for the menu planet.** Measured: no gain (see above). Not shipped.
* **Converting `world-standing-meter`'s `width` transition.** One 4 px meter inside the Territory panel,
  repainted only when a grow lands. Not worth a visual change.
* **OffscreenCanvas/worker rendering, WASM, `content-visibility` on the game behind the card.** The last one
  would remove the blurred board from behind the finish card — a visible design change — and W1 already got
  the work to zero without changing a pixel.

## What is still expensive, and why

* **The visible match: ~10-14% main thread with the board on screen.** That is the ambient layer by design
  (it is the "living board" the product asks for) plus the smart cockpit's LED canvases. It is bounded by
  `AMBIENT_CAP` (24 shapes) and dies on Reduce motion / Effects Low.
* **The planet while it is visible**: 20 fps × (full-screen procedural sky + 104k vertices). Culling is the
  next real win (above).
* **`paint-wordmark.svg` is 528 kB** (211 kB gzipped) on the boot path. It is a hand-drawn brush mark; it
  wants tracing/simplification or a small raster at menu sizes. Not touched here — it is an art decision.

## Commands

```sh
export PATH="/Users/patryk/.local/node22/bin:$PATH"
CHANNEL=futa05 VITE_DUEL_API_URL=https://duel-stub.invalid/v1 \
  VITE_SUPABASE_URL=https://stub.invalid VITE_SUPABASE_ANON_KEY=stub npm run web:build
node scripts/perf/serve.mjs web/dist 4310 &
npx tsx scripts/perf/probe-v3.mjs          # menu → match → pause → finish card
npx tsx scripts/perf/probe-gpu.mjs         # planet DPR / hidden / reduce-motion comparison
npx tsx scripts/perf/probe-inval2.mjs      # veil invalidation attribution (needs a played-out match)
```

`scratch/` is git-ignored: the probes are throwaway, the numbers in this file are the deliverable.

---

## Verification (this pass, on the deployed build)

`perf-thermal` → `futa0.5-online` @ **e9bfca8b**. The release is published from that branch; the root
(`www.futasaku.com`) is deliberately left at **1b2f9b7a** so the two can be compared side by side.

| check | result |
|---|---|
| root `/BUILD_SHA` | `1b2f9b7a340a4e3ca1c93dbe7283da206d2b74ea` (unchanged) |
| `/test/BUILD_SHA` | `e9bfca8b605d875084ac698431bcda1a6711827d` |
| CI on e9bfca8b | success |
| Pages preview (publish) on e9bfca8b | success |
| extra-regressions | **red, pre-existing**: `online-opponent-discard` → "draw starts at the actual deck pile" (it is red on the release tip too, and is not part of the publish gate) |

Live `/test` (real network, 390x844, DPR 3, no throttle):

| | measured |
|---|---|
| menu planet drift | **20.5 fps** (was 30) |
| planet with the Settings sheet open | **0 fps**, gate held |
| planet after closing it | **20.5 fps**, gate released, no jump |
| page errors | none |

### Suites run on this branch

| suite | result |
|---|---|
| `npm run check` | **4502 passed**, 1 expected fail, 67 skipped (458 files) |
| `web/e2e/finish-fit.ts` (MODES=classic, six viewports) | **184 checks, ALL PASS** |
| `web/e2e/futa04-critical.ts` (+ smart-cockpit, sort-layout, foundation-restart) | **225 checks passed** |
| `web/e2e/endgame-planet.ts` | **21 checks, all pass** (the card's planet still mounts, flies, fills its pane and answers taps) |
| `web/e2e/dynamic-globe.ts` | **18 checks, 0 fail** (menu/window framing, drag, zoom, seams) |
| `web/e2e/lessons-3.ts` (incl. the L10 planet block) | **539 checks, 0 failures** |
| `web/e2e/planet-matte.ts` | **red, pre-existing on this machine**: its first assertion needs the app ready inside the product's 1.5 s startup fallback, and this box runs the suite on SwiftShader (`--use-angle=swiftshader`), where boot takes longer. Proven pre-existing by running the suite against a pristine `1b2f9b7a` build: it fails identically, before and after this pass. |

Delivered screenshots for the finish card were regenerated by `finish-fit`; they were **not** committed
(byte size differed by 3 bytes — compression noise, same image), and no visual baseline was re-blessed.
