# FUTASAKU load performance — first game (offline, online, tutorial)

**Question answered:** does the first game suffer *visible* jank on first paint, or is it already
smooth? This document only measures. No product behaviour, no loading screen, no boot gate was
added. The one change from this task is this file.

**Short answer.** It is *mostly* already smooth. Measured on a phone-like profile (4× slower CPU,
Slow 4G), the first board paint costs **one long frame of about 0.2 s** (offline/online) and
**up to ~1.2 s in the worst tutorial run**, followed by a handful of frames over 50 ms and then a
clean 60 fps (16.7 ms) that stays clean. On a desktop with no throttling the same first game is
16.7–83 ms per frame (i.e. essentially smooth). A fonts-and-art loading gate would **not** fix the
stutter: fonts are ready ~4 s before the first board, and the card art is decoded before the first
board in every offline and online run. The visible "pop" on the tutorial is caused by the card
*presentation* mounting after the board, which awaiting art does not wait for. The one genuinely
unexplained wait is **online**: tapping Join leaves ~1.4 s of silence before the board (≈0.9 s of
it is the server round trip). See **Recommendation**.

---

## What was measured, how, and on what

| | |
| --- | --- |
| Machine | Apple silicon Mac (macOS `darwin 25.4.0`), desktop CPU. **Not a real phone** — phone behaviour is emulated with Chrome DevTools Protocol, not measured on a device. |
| Throttling | `Emulation.setCPUThrottlingRate` = 4× and `Network.emulateNetworkConditions` for **Slow 4G** (150 ms RTT, ~1.6 Mbit/s down / 750 kbit/s up). A separate **desktop control** used 1× CPU and no network throttling. |
| Browser | Headless Chromium 1248 via `playwright-core`. |
| Offline / tutorial build | Local `CHANNEL=futa04` build (`web/dist`) served by `vite preview` on `127.0.0.1`. |
| Online build | The live site, `https://severgrow.github.io/severgrow-01/futa0.5/`, against the live Supabase Edge function `duel`. |
| Settings | Defaults (`reduceMotion:false`, `eyeCandy:true`), fresh storage every run. |
| How | A Playwright init script (injected before any app code) recorded: `requestAnimationFrame` timestamps (for frame durations), DOM checkpoints (`#menu` visible, `#game` shown, first child of `#board`, first hand card, the `futa04-card-art-ready` / `futa04-cards` classes, `style#player-styles`, `#futa04-help-button`), `document.fonts.ready`, `PerformanceObserver` long tasks and LCP, and a wrapper around `fetch` for request/response timestamps. No product file was edited. |
| `severor-ready` | Verified: `web/src/main.ts` dispatches `severor-ready` and sets `appReady` at the same point; `__severgrow.ready()` returns that flag. |
| `preloadCardArt` | Verified: it is fire-and-forget (`void import('./player/cards.js').then(m => m.preloadCardArt())`); nothing waits on it. It adds `futa04-card-art-ready` when the six card images have decoded — that is the art-decode figure below. |
| Frame thresholds | "over 16 ms" = gap > 16.7 ms, "over 33" = > 33.4 ms, "over 50" = > 50 ms. |
| Runs | Offline 6, tutorial 5, online 5, plus desktop controls (3 + 3). One tutorial run failed against a local server hiccup and was re-run. |

### Honesty about the environment

- A desktop CPU slowed 4× is a rough stand-in for a mid-range phone, not the same thing. Tuning,
  thermals, GPU and Safari/Android differences are not represented.
- **The host was busy during the whole session** (load average 12–31 from other agents). That makes
  absolute times *pessimistic and noisy* (one offline boot run reached 17.9 s). It is worth trusting
  the **within-run comparisons** (first 3 s of the game vs the settled 4–6 s of the same run) and
  the desktop control far more than any single number.
- The app dispatches a one-time recovery reload if a lazy chunk fails to load. Under this load that
  fired once in an early run; it is a real slow-network behaviour but it also inflates a few worst
  cases.

---

## 1. Cold load (4× CPU + Slow 4G), milliseconds since navigation start

| Surface | `#menu` visible | LCP | fonts ready | card art decoded | **first board paint** | `severor-ready` |
| --- | --- | --- | --- | --- | --- | --- |
| **Offline** (6 runs) p50 / max | 1068 / 1113 | 1124 / 1180 | 1127 / 1189 | 4031 / 4403 | **5213 / 6416** | 8758 / 11693 |
| **Tutorial** (5 runs) p50 / max | 1070 / 1077 | 1112 / 1124 | 1111 / 1131 | 4031 / 4732 | **3486 / 4390** | 8131 / 9159 |
| **Online joiner B** (5 runs) p50 / max | 1915 / 2005 | 2130 / 2406 | 2140 / 2545 | 4558 / 4872 | **10685 / 13397** | 7283 / 9240 |
| Offline desktop control (3 runs) p50 | 214 | 400 | 233 | 430 | 3301 | 597 |

**Fonts and art vs the first board — the ordering that matters:**

| Surface | fonts before first board | card art decoded before first board | card presentation (`futa04-cards`) mounted before first board |
| --- | --- | --- | --- |
| Offline (6) | 6 / 6 | **6 / 6** | **0 / 6** (lands 0.3–2.3 s *after*) |
| Tutorial (5) | 5 / 5 | **0 / 5** (art lands ~0.5 s *after*) | **0 / 5** (lands 2.1–3.9 s *after*) |
| Online (5) | 5 / 5 | 5 / 5 | 5 / 5 |
| Offline desktop | 3 / 3 | 3 / 3 | 3 / 3 |

So: fonts are never late. Card art loses the race only on the tutorial. But the thing that actually
turns the art on — the `futa04-cards` class + card CSS applied by `mountCards()` — arrives **after**
the first board on both offline and tutorial under Slow 4G. Because the first game can start before
`mountPlayerEnhancements()` finishes, the first hand renders plain and its art/face changes a moment
later.

---

## 2. First-game frame durations (rAF), 4× CPU + Slow 4G

### Offline first game

- **What covers the start:** on the product channels (`futa04`, `futa05`) the build removes the
  opening `#splash` element and `showSplash()` is not called, so the only cover for the first game is
  the who-starts lottery followed by the deal-in.
- **Starter lottery window** (tap difficulty → board appears, ~1.7 s): worst frame 50–83 ms, 0–1
  frames over 50 ms. The cover itself is cheap and smooth.
- **First 3 s after the board paints** (the real first game):

| metric | run1 | run2 | run3 | run4 | run5 | run6 | p50 | max |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| worst frame (ms) | 233 | 217 | 133 | 167 | 150 | 167 | 167 | 233 |
| frames > 16.7 ms | 54 | 36 | 39 | 13 | 32 | 36 | 36 | 54 |
| frames > 33.4 ms | 10 | 7 | 5 | 6 | 7 | 5 | 6 | 10 |
| frames > 50 ms | 5 | 6 | 3 | 5 | 3 | 2 | 4 | 6 |

- **First 1 s** is where the cost sits: worst frame 133–233 ms (p50 167), 1–4 frames over 50 ms.
- **Settled window (4–6 s)**: 16.8 ms in 5 of 6 runs (clean 60 fps), one 2700 ms outlier consistent
  with host descheduling rather than app work. Over-50-ms frames in the settled window: 0,2,0,3,0,0.
- Desktop control (1× CPU, no throttle): first 3 s worst 17–83 ms, settled 16.8 ms.

### Tutorial first game

| metric | run1 | run2 | run3 | run4 | run5 | p50 | max |
| --- | --- | --- | --- | --- | --- | --- | --- |
| worst frame (ms) | 1200 | 300 | 50 | 150 | 83 | 150 | 1200 |
| frames > 16.7 ms | 32 | 30 | 34 | 46 | 33 | 33 | 46 |
| frames > 33.4 ms | 7 | 3 | 1 | 1 | 2 | 2 | 7 |
| frames > 50 ms | 6 | 3 | 1 | 1 | 1 | 1 | 6 |
| settled 4–6 s worst (ms) | 217 | 167 | 17 | 117 | 183 | 167 | 217 |

The tutorial has no lottery, so its board paints sooner (~3.5 s vs ~5.2 s) and the late card
presentation lands *inside* the measured "settled" window, which is why the tutorial stays choppier
longer. Desktop control: first 3 s worst 33–617 ms (one load outlier), settled 16.8 ms.

### Online first game (joiner side, live site)

- First 3 s after the board: worst frame p50 **417 ms** (range 283–467); 1–3 frames over 50 ms;
  settled 4–6 s: p50 33 ms, max 50 ms. Same shape as offline (a brief hitch, then smooth), and here
  nothing is still mounting after the board.

### What the long frame is

Isolating the cause with a fixed starter (`?seed=`; player upgrades already mounted on that path):

| profile | first frame at board paint | later frames |
| --- | --- | --- |
| 4× CPU (phone-like) | 200–267 ms | 16.7 ms, one 33–50 ms follow-up |
| 1× CPU (desktop) | 50–67 ms | 16.7 ms |

So the first frame after the board appears is the board's own first render, and it happens **even
when fonts, art and all modules are already mounted**. It scales with CPU speed (≈4×). It is one
frame, not sustained jank. In the ungated menu flow, the additional >50 ms frames line up with
`mountCards` running after the board (the text-translation walk over the document plus the card-art
crossfade).

---

## 3. Online: tap → request → response → board (live `/futa0.5/`, joiner B)

| step | min | p50 | p95 | max |
| --- | --- | --- | --- | --- |
| tap **Join** → request sent | 53 | **106** | 494 | 494 |
| request sent → response received (`/v1/matches/join`) | 856 | **897** | 1026 | 1026 |
| response received → board painted | 273 | **386** | 436 | 436 |
| **tap → board** | 1181 | **1453** | 1714 | 1714 |

- The dominant cost is the **~0.9 s server round trip**, not rendering. During that time the player
  sees the Join screen with no "opening match" feedback.
- The creator (player A) reaches the board **831–1743 ms after** B's join is acknowledged, because A
  discovers it on a 2 s poll; A's first-game frames are the same mild shape (worst p50 333 ms).
- One tap→sent outlier (494 ms) was the join path creating a *second* guest identity while the hub's
  first one was still in flight (a race; two `/v1/guests` calls). Not jank, but dead time on the tap.
- **Cold start of the Edge function**: the first duel API call on a fresh page took 604–849 ms
  (p50 ≈ 655); the next calls on the same page took ~360–500 ms (createGuest) and ~600–750 ms
  (getState). So the cold penalty is real but modest (~0.2–0.3 s), and it lands on the hub-open path,
  not on the board.

---

## Verdict per surface

| Surface | Noticeable jank on first paint? | Number that justifies it |
| --- | --- | --- |
| **Offline first game** | **A little — mild.** | One ~167 ms frame (max 233 ms) as the board appears, and 2–6 frames over 50 ms in the first 3 s, then 16.8 ms sustained. Desktop: 17–83 ms worst. Art is already decoded before the board; the hand's face changes 0.3–2.3 s later when the card CSS mounts. |
| **Online first game** | **Mildly at paint; the real issue is the silence before it.** | Board frames 283–467 ms worst then 33 ms settled; but tap→board is **1453 ms (p95 1714)** with ~897 ms of it waiting on the server and no on-screen feedback. |
| **Tutorial first game** | **Yes, on a throttled phone.** | Worst frame up to **1200 ms** (p50 150 ms), 1–6 frames over 50 ms, and it stays choppy longer (settled p50 167 ms). Card art is decoded *after* the board in 5/5 runs and the card presentation mounts 2.1–3.9 s after it. Desktop: mostly smooth (one 617 ms load outlier). |

---

## Recommendation

**Do not add a boot/readiness loading gate — the data does not support it.** Concretely:

- Fonts are ready ~4 s (offline) to ~8 s (online) before the first board; card art is decoded before
  the first board in **6/6 offline** and **5/5 online** runs. Waiting on fonts + art would change
  nothing a player sees on those paths.
- The one long frame at first paint (~0.2 s at 4× CPU, ~50–67 ms at 1×) is the board's own first
  render and occurs even with everything preloaded. A loader cannot remove it.
- On the tutorial the art *does* lose the race, but the visible change is driven by the card
  **presentation** (`mountCards`) mounting later, which a fonts-and-art gate would not wait for.

So, of the offered options, the boot-level choices **(b) and (c) are not justified**. Where the data
*does* point is a small, action-scoped version of (c)'s online half:

1. **Recommended, small:** show an honest **pending state on the online Join / Create actions** —
   driven by the in-flight request, not by a timer — because there is a measured ~1.45 s of dead
   time after the tap with nothing on screen. This is a per-action busy state, not a loading screen.
2. **Optional, only if the owner wants the first hand to look final at first paint:** target the late
   `mountCards` timing on the offline/tutorial path (let the first game start after the card
   presentation has mounted, or move the presentation earlier). This is a precise timing fix, not a
   readiness loader, and it would address the tutorial's visible hand change.
3. **Otherwise: option (a)** — the offline desktop first game is already smooth, and the phone
   stutter is a single ~0.2 s frame.

### A timed loader is not a fix

A loader that spins for a fixed duration must **not** be added. It would not shorten the server
round trip, would not remove the board's first-render frame, and would only add artificial delay.
Any busy/opening state must be tied to the real work (the request or the render), and must disappear
the moment that work is done.

---

## What could not be measured

- **Real devices.** No iPhone/Android/Safari run; phone behaviour is 4× CPU + Slow 4G emulation on a
  desktop.
- **A quiet host.** Other work on the machine (load average 12–31) inflated worst-case boot times and
  a few frame outliers; the numbers above are conservative.
- **Non-default settings.** Only defaults were measured. With "Reduce motion" on (or the OS reduce-
  motion flag), the starter lottery collapses from ~1.6 s to ~0.2 s and the deal-in is skipped, so
  the board arrives sooner and any post-paint work is less covered — not measured.
- **The first tap latency** was not isolated; the menu is interactive at ~1.0–1.1 s (LCP) under
  throttling.
- **`preloadCardArt` completion** is inferred from the `futa04-card-art-ready` class it sets (it
  resolves inside a fire-and-forget promise), which is the user-visible "art is ready" moment.

## Raw data and harness

Measurements were taken with throwaway scripts outside the product tree, in the git-ignored
`scratch/load-perf/` (`instrument.ts`, `offline.ts`, `online.ts`, `firstgame-seed.ts`, `gaps.ts`,
`analyze.ts`, and the `out-*.json` results). This task changed no tracked file: `git status` lists
`docs/LOAD-PERFORMANCE.md` as the only new file from this work (the other modified files shown —
`server/**`, other `docs/**` — belong to work in progress elsewhere, plus the pre-existing untracked
`.cursor/`).
