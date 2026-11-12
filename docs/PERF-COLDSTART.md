# PERF II — cold start, first beat, and the planet culling question

Baseline: `futa0.5-online` @ **6e0dad30** (the art-lab + harness release). Branch: `perf-coldstart`.
This pass answers the two things the owner picked from the first report: **(A) cold start / first-load
snappiness** and **(B) planet front-face culling**.

Read `docs/PERF-THERMAL.md` first — this file assumes its method and its numbers.

---

## Method, and one correction to the harness

Same rig as the thermal pass: product build (`CHANNEL=futa05`), 390x844, DPR 3, mobile emulation,
**4x CPU throttle**, CDP `Performance`/`Tracing`/`Profiler`.

**The probe server now gzips.** GitHub Pages serves brotli/gzip; a probe that serves raw bytes makes
this app's CSS look 4.7x heavier and its JS 2.9x heavier than they are, which flips every conclusion
about bytes on the critical path. `scripts/perf/serve.mjs` compresses (and `PERF_NO_GZIP=1` is there
deliberately for the uncompressed case). Its SPA fallback was also removed — it was returning 94 kB of
`index.html` for `/BUILD_SHA`, twice, and the byte accounting blamed the app.

**Network profiles** for byte questions: `PERF_NET=fast` (30 Mbps, 40 ms — home wifi / 5G),
`PERF_NET=4g` (9 Mbps, 85 ms — a good mobile link), `PERF_NET=3g` (1.6 Mbps, 150 ms).

**A caveat worth stating up front:** other agents were running vitest suites on this machine during
this pass (`sg-sharpen-*` worktrees, several at once). That is why some wall-clock numbers below move
by ±15% between identical runs, and it is why GPU percentages could not be used for the culling
question at all (see B). Every headline below is either a byte count (exact), a count of events
(exact), or a delta measured in alternating windows on the same page.

---

## A) Cold start: where the time actually goes

### Timeline (median of runs, cold browser, no cache)

| beat | localhost (4x CPU) | fast wifi | 4G |
|---|---|---|---|
| first paint (charcoal) | 144 ms | 236 ms | 420 ms |
| first **contentful** paint | — | — | 1,684 ms |
| app booted (`ready()`) | 563 ms | 1,179 ms | 2,016 ms |
| **menu revealed** (`futasaku:startup-visible`) | 878 ms | 1,907 ms | 1,634 ms |
| menu planet's first frame | 878 ms | 1,907 ms | 2,840 ms |
| first match playable (tap → board) | 679 ms after the tap | 1,305 ms | 783 ms |

Two things fall out of that table:

* **The reveal is timer-driven on a slow link.** `index.html` fails open at 1,500 ms, so at 4G the menu
  appears at ~1.6 s while its planet is still assembling (2.8 s). On a fast link the composed gate
  wins and the two coincide. Nothing needs changing here — it is working as designed — but it means
  **"menu revealed" is not the beat to optimise on a bad connection; bytes are.**
* **First contentful paint is late by design** (1.7 s at 4G): the page paints charcoal, then the body
  is `visibility:hidden` until the reveal. That is the owner's "dark until composed" rule, so FCP is
  not a useful target; radio time and the reveal are.

### What the boot spends its milliseconds on (CDP CPU profile, 4x CPU, samples attributed to functions)

| ms | where |
|---|---|
| 273-286 | `(program)` — parse/compile of the 67 script chunks the entry pulls in |
| 92-96 | `geometry :: p` — `buildSphere()`: 40 relaxation rounds over ~17k springs |
| 35-41 | `space :: O` — the space shader's program/quad setup |
| 29-32 | `engine :: (anonymous)` — module evaluation |
| 20-28 | `planet :: be/k`, `getAnimations`, GC |

**67 script chunks** are requested at boot for a game menu: `index.js` (517 kB raw / 175 kB gzip) plus
66 more (`lobby-ui` 172 kB, `online-css` 92 kB, `board` 90 kB, `smart-cockpit` 74 kB,
`glass-surface` 71 kB, `strings` 44 kB, `planet` 31 kB, …). That is the structural cold-start cost and
it is not fixable by asset work; it needs route-level splitting of `main.ts`, which is a project of its
own (see "what we refused").

### Change A1 — the first hand's art is no longer downloaded before the menu (SHIPPED)

Six card faces (**424 kB** together) were `<link rel=preload>`ed at byte 0 and also warmed at module
evaluation by `player/cards.ts` — art the menu never shows, competing for the same radio as the chunks
the reveal waits on. They now start **after the app is ready** (idle callback, 1.5 s cap), which is
still seconds before a match can ask for a card; `startGame()` already awaits `preloadCardArt()`, so a
match can never deal art-less cards because of this.

| | before | after |
|---|---|---|
| bytes downloaded before the menu appears (4G) | **995 kB** | **711 kB** (−284 kB, **−28.5%**) |
| the same, fast wifi | 1,513 kB | 1,522 kB (nothing finishes later on a fast link) |
| total bytes per load | 1,582,892 | 1,591,542 (unchanged — they still load, just later) |
| menu revealed, 4G | 1,634 ms | 1,647 ms (no change: the 1.5 s fail-open decides) |
| first match playable, localhost | — | 679 ms after the tap, unchanged |

Honest summary: **this is a bytes/radio win, not a stopwatch win**, because the reveal on a constrained
link is a timer. It is kept because it is 28% less radio work before the product's first screen, it
changed no behaviour, and it costs nothing on a fast link (two alternating fast-wifi pairs: ready
1179/1313 baseline vs 1293/1509 — inside the ±15% noise of this machine).

---

## B) Planet front-face culling: measured, and **not shipped**

The plan from the first pass was to stop submitting the far hemisphere (103,680 vertices per frame,
about half of them invisible). Three instruments were built, and they disagree in a way that settles
the question.

### 1. The in-page GPU counter is unusable

Identical builds, identical stage, five consecutive runs: **gpuPct = 20, 23, 79, 88, 88.** The first
pass already noted 19→122%; that is not a signal, it is the machine's GPU process being shared with
other agents' suites.

### 2. SwiftShader (deterministic, but fill-dominated)

Two runs each, `--use-angle=swiftshader`: **baseline 684 / 686%, culled 677 / 674%** — a ~1% gain,
which is nothing.

### 3. OS-level CPU per second — the thermal metric

The number that becomes heat is the operating system's CPU time for the whole browser (renderer + GPU
helper + compositor). `ps -axo time,command` for this instance's `--user-data-dir`, alternating 12 s
windows on one page:

| configuration | CPU-seconds per second of idle menu |
|---|---|
| full geometry (cull off) | 0.167 / 0.160 / 0.140 / 0.170 / 0.150 / 0.120 |
| culled (index buffer, 55.8% of vertices) | 0.167 / 0.140 / 0.170 / 0.180 / 0.170 / 0.120 |
| **delta** | **0.0%** |
| control: planet loop stopped entirely | **−21%** (0.130 → 0.103) |

The control proves the instrument can see this app's work: removing the planet's loop entirely is
worth 21% of the idle menu's CPU. Culling half its vertices is worth **nothing measurable** at all.

### Why (and why the earlier "vertex-bound" read was wrong)

The first pass's evidence was a `?verts=0.5` experiment (GPU 88 → 72) taken with the counter above,
in single runs that we now know swing ±40%. Re-measured properly, with vsync off and frame throughput
as the metric:

| | frames/s (3 alternating windows) |
|---|---|
| full geometry | 610-649 |
| half the vertices (`drawArrays`, first half) | 513 (−21%) |
| culled, index buffer + per-frame upload | 337-368 (**−43%**) |
| culled, coalesced `drawArrays` runs (no upload) | 555 (**−11%**) |

Drawing *less* is slower in every configuration. The reason is structural: `gl.CULL_FACE` is already
enabled and the far hemisphere's triangles are discarded by the rasteriser essentially for free, so
the only saving would be vertex shading — and at 20 fps the planet shades ~2M vertices/s, which is
rounding error on an A18/M-series GPU. Meanwhile splitting the draw costs driver calls (or an index
upload) that exceed any saving.

**Conclusion: there is no vertex-level win available here.** The change was implemented twice
(dynamic index buffer, coalesced runs), measured three ways, and **reverted** — the working tree has
no renderer changes at all.

---

## C) What we refused to ship, and why

* **`paint-wordmark.svg` — my first report was wrong about it.** It is **528 kB** in the build output
  but it is **never requested at runtime**: the menu shows `plain-wordmark-menu.svg` (2.6 kB) since the
  2026-11-09 experiment became the product, and `PAINT_URL` / `homePaintMark` have no consumers outside
  `branding.ts`. Measured request list, cold load: zero `paint-wordmark*` entries. So there is no
  boot-path cost to remove, and no reason to touch the owner's hand-drawn mark, to trace it, or to
  rasterise it. (The two unused files — 528 kB SVG and 107 kB WebP — are dead *build output*, worth
  deleting from the repo for tidiness, never for speed. Not touched here: it is an art decision.)
* **Splitting `endgame-planet` out of the boot path — reverted.** It was implemented (a lazy facade
  with an ordered call queue, `endgame-planet-lazy.ts`), and it produced **no measurable change**: boot
  CPU profile 273 → 286 ms `(program)`, identical long-task counts, identical `ready`/reveal. The
  280 ms long-animation-frame task that LoAF attributed to the `endgame-planet` chunk was **not that
  chunk's code** — the profiler shows the ms in `geometry :: p` (`buildSphere`) and in general parse.
  LoAF names the script that was executing when a task *started*, not what it spent the time on; that
  is the lesson from this pass. Per the rule (a change that does not measurably help is reverted), it
  is not in the tree.
* **The sky-cache idea** (render the procedural sky to a texture and blit it with a sub-pixel offset,
  to remove the full-screen fragment pass): the same OS probe says turning the sky pass **off**
  changes idle CPU by **+4%** (i.e. nothing). There is no fixed pass cost worth caching. Not started.
* **Route-level splitting of the 67-chunk boot graph.** This is the only remaining large cold-start
  win and it is a real refactor of `main.ts` (12k lines, one module wiring every surface). It needs
  its own pass with a visual regression budget, not a corner of this one.

## D) What is still expensive

* **175 kB of gzipped entry JS + 66 further chunks** before the menu is interactive. On a good mobile
  link that is ~2 s; on a bad one ~3 s.
* **`buildSphere` 92-96 ms at 4x CPU** (~24 ms native) inside the reveal on a fast link, because the
  menu's planet is mounted by the online lobby, so the lobby chunk is on the menu's visual path.
  Removing that dependency is the same route-splitting project.
* **First match playable on a fast link: 1.3 s after the tap**, of which ~0.8 s is the board art decode
  and the level's own setup.

## Repro

```sh
export PATH="/Users/patryk/.local/node22/bin:$PATH"
CHANNEL=futa05 VITE_DUEL_API_URL=https://duel-stub.invalid/v1 \
  VITE_SUPABASE_URL=https://stub.invalid VITE_SUPABASE_ANON_KEY=stub npm run web:build
node scripts/perf/serve.mjs web/dist 4310 &          # gzips, like the product

npx tsx scripts/perf/probe-coldstart.mjs /tmp/cold.json          # timeline + bytes + long tasks
PERF_NET=4g npx tsx scripts/perf/probe-coldstart.mjs /tmp/4g.json
npx tsx scripts/perf/probe-bootprofile.mjs /tmp/boot.json        # where the boot ms go
```

`probe-coldstart` reports `bytesAtReveal` (what the player waits for on the radio) and
`startupVisible`/`planetPainted` from the app's own events, not from polling a rect.

## Suite results on this branch

| suite | result |
|---|---|
| `npm run check` | **4502 passed**, 1 expected fail, 67 skipped |
| `web/e2e/finish-fit.ts` (MODES=classic, six viewports) | **184 checks, ALL PASS** |
| `web/e2e/futa04-critical.ts` (+ smart-cockpit, sort-layout, foundation-restart) | **225 checks passed** |
| `web/e2e/lessons-3.ts` (incl. the L10 planet block) | **539 checks, 0 failures** |
| `web/e2e/planet-matte.ts` | red, **pre-existing and identical on pristine 6e0dad30**: its first assertion needs the app ready inside the startup fail-open, and this box runs the suite through SwiftShader. Verified by running the same suite against an untouched baseline dist (`FUTA_DIST=/tmp/perf-base2/web/dist`) — same failure, same line, before and after this change. |

No visual baseline was re-blessed; the finish-card screenshots `finish-fit` regenerates were reverted
(they are unchanged in content).
