# Phone heat, pass 2 — where a duel's heat actually is (2026-10-30)

**Owner report (2026-10-30):** "we worked on optimising, but phone is still getting warm while
playing duels — check for any obvious quick fixes."

**The short answer.** The 2026-10-29 pass fixed the *empty board's* idle bill and measured it there.
A duel does not happen on an empty board. Measured on a board the player has actually played on, the
idle cost is **10–17× the number that pass shipped**, and it does not stop when the duel does: with
the result plate up, the board behind it keeps animating. The remaining cost is decorative motion
that is running on the **main thread**, not on the compositor — including the hand's breath, which
the last write-up believed had been made composite. No zero-look-change fix was found for the
largest of them; the measurements that say so are below, with the two cheap fixes that did not
change the look (a hidden-tab/lobby poll gate, and the finished-plate assertion) shipped.

Everything here was measured; nothing was inferred from a property name.

## The measurement, per duel state

`web/e2e/perf-duel-states.ts` (new). Same phone profile as `perf-phone.ts` — 390×844, DPR 3, touch,
**4× CPU**, one run, 3 s windows, seed 219682080 — but it measures the states a duel is actually
spent in, on a real game played through the page's own hook:

1. **board idle** — the empty first turn (this is what the 2026-10-29 table measured).
2. **mid-game idle** — five real turns played, the player thinking.
3. **throw idle** — choosing a discard, with the display's idle re-prompt blinking.
4. **opponent catch-up** — the bot's turn, the phone still awake.
5. **the plate** — the duel is over.

`task`, `recalc` (and recalcs/s), `layout/s` are CDP `Performance.getMetrics`; `mainfr/s` and
`draw/s` are the CDP trace (`SendBeginMainFrame`, `MainFrame.Draw`); `anims` is
`document.getAnimations()`, split **comp** (transform/opacity/translate/scale) vs **paint** (any
property that repaints); `filt`/`bd`/`wc` are visible elements carrying `filter` /
`backdrop-filter` / `will-change`; `tiles` is the number of home-tile branches on the board.

| state, 4× CPU | task ms/s | recalc ms/s | recalcs/s | layouts/s | main frames/s | compositor draws/s | anims | comp | paint | filter elems |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| board idle (empty) | **54.9** | 33.9 | 8.7 | 0.7 | 26 | 182 | 25 | 25 | **0** | 38 |
| mid-game idle | **488.1** | 197.1 | 98.3 | 62.0 | 191 | 64 | 37 | 30 | **7** | 39 |
| throw idle (re-prompt on) | **599.0** | 317.0 | 83.0 | 64.0 | 208 | 69 | 35 | 19 | **16** | 41 |
| opponent catch-up | **702.0** | 361.4 | 55.7 | 42.0 | 98 | 135 | 39 | 30 | **9** | 39 |
| win/lose plate | **353.2** | 54.6 | 80.3 | 62.7 | 202 | 69 | 39 | 18 | **21** | 34 |

A real move still runs at full rate (median gap 16.7 ms; `p95` 33.4 ms at 4×; 6 frames over 33 ms in
45 — the same as the 2026-10-29 build).

For direct comparability with the 2026-10-29 table, the same probe (`perf-phone.ts`) on the same
build still reports an idle empty board at **task 20.6 ms/s, style recalc 8.0 ms/s at 0.3/s, 25
animations, 0 paint animations**, i.e. the state that pass fixed has stayed fixed (it reported 16.8 /
7.1). Nothing in this pass moved it, and nothing in this pass needed to: the heat is in the states
that pass did not sample.

**What this says plainly.** The empty board is quiet (it is the state the last pass tuned). As soon
as the board carries tiles, the phone is doing **~10× the main-thread work for a still screen**, and
the worst state is the one the player is not even acting in (the opponent's turn). The paint-property
animations are:

| state | paint animations |
| --- | --- |
| mid-game idle | `territory-heartbeat` ×7 |
| throw idle | `territory-heartbeat` ×8, `weak-pulse`, **`idle-urgency-throw` ×7** |
| opponent catch-up | `territory-heartbeat` ×8, `weak-pulse` |
| the plate | `territory-heartbeat` ×21 |

## The named cause from 2026-10-29: the piles' `box-shadow`

**It is already gone from the draw step, and the live one measures nothing.**

- `idle-urgency-draw` (the `box-shadow` keyframes on the piles) can no longer run: the Draw cockpit
  sets `animation: none !important` on exactly the elements it targets
  (`web/src/player/information.ts:206`, `html.futa04-information[data-step='draw'] … .pile.ready
  .pile-card`). The draw-step cue is now `futa04-draw-pile-breathe` (scale) plus
  `futa04-draw-pile-glow` (opacity on `::after`). Measured in the draw step: **0 paint animations**.
  The ~17 ms/s the write-up left on the table is not there.
- The hand's Throw cue is still a shadow animation — `idle-urgency-throw`
  (`web/src/player/smart-cockpit.ts:238-247`) animates `scale` **and** `box-shadow` on every
  playable card, which is 7 cards, 1.2 s, forever, in exactly the state a thinking player leaves the
  phone in. Paired A/B on that state (5 pairs, 6 s windows, 1× CPU, the two variants interleaved in
  one page so host drift hits both equally):

  | throw step, re-prompt on, 1× CPU | task ms/s | recalc ms/s | passes/s |
  | --- | --- | --- | --- |
  | as shipped (shadow + scale) | 284.8 | 146.2 | 79.8 |
  | same keyframes, `scale` only | 306.3 | 138.8 | 86.3 |

  **No measurable difference.** Animating a shadow on seven small cards is not what warms this phone
  at 1× CPU. Replacing it with a pre-baked rim would have been a look-changing rewrite for a number
  I cannot show, so it was left alone.

## The biggest idle cost is the hand's breath — and it is NOT composited

The 2026-10-29 pass replaced a `var()` inside the breath keyframes with five baked amplitudes and
recorded the hand's idle breath as composite. It is not: the five keyframes animate `scale` and
Chrome still updates them on the main thread on this page.

Paired A/B on mid-game idle (5 pairs, 6 s, 1× CPU, interleaved):

| mid-game idle, 1× CPU | task ms/s | recalc ms/s | style passes/s |
| --- | --- | --- | --- |
| as shipped (cards breathing) | **257.4** | **142.8** | 85.7 |
| `#hand.breathing .card { animation: none }` | **176.1** | **48.4** | 82.0 |

Removing the breath's animation alone removes **~2/3 of the style-recalc work and a third of the
main-thread task** of an idle mid-game screen. Every trick that would keep the look was measured and
**none of them moved it**:

| variant (paired A/B, 4–5 pairs, 6 s, 1× CPU) | effect on recalc |
| --- | --- |
| `#hand .card { will-change: scale }` | none (133.8 → 129.6) |
| `#hand .card { will-change: transform }` | none (74.1 → 72.0) |
| `#hand { will-change: transform }` | none (74.9 → 72.3) |
| `#hand .card { contain: layout paint }` | none (165.3 → 164.1) |
| `#hand .card { transform: … translateZ(0) }` | none |
| the same keyframes with literal `animation-duration`/`-delay` instead of `var()` | 141 → 114, i.e. not the cause |

A control page (`scratch/composite-micro.html`) proves a `scale` animation with the card's exact
dressing (filter, opacity, absolute position, fan transform, isolation, `box-shadow` var()) composites
with **0 recalcs/s** — so the block is specific to this page, not to the CSS in isolation. I could not
find it in the time available, and I will not claim a cause I have not proved.

**The cheapest honest options, for the owner** (all three are visible, so they are decisions, not
fixes):

1. Stop the idle breath after ~8 s without input, resume on the first touch (the same stepped-clock
   pattern the LED blink already uses). The card sits still instead of breathing — a look change.
2. Run the breath at 20 fps (quantised) instead of 60. At 0.2–0.8 % amplitude the difference is
   under a fifth of a pixel per step; cost falls ~3×. A perceptible change if you look for it.
3. Leave it. It is the single most "alive" thing on an idle board.

## The rest of the ambient board, measured one family at a time

Same page, same state (mid-game, human turn), 8 s windows at 1× CPU, everything paused except one
family (`scratch/heat-isolate.ts`). Floor with every animation paused: **12 ms/s** of style recalc.

| only this running | style ms/s | note |
| --- | --- | --- |
| the hand's breath | **220** | biggest single family (see above) |
| `territory-heartbeat` (2 per home tile) | **42** | `stroke-dashoffset` + `stroke-opacity` + `filter: blur(.8px)` → paint + SVG layout, scales with owned tiles |
| `futa04-draw-pile` (scale + rim opacity) | 28 | |
| `drift` (7 spores), `amb-bubble`, `amb-glint`, `joined-home-breathe` | 15–19 each | the SVG ones (`joined-home-breathe` is a `transform` on a `<g>`, the glints/bubbles are path/circle animations) are main-thread too |
| the LED alarm, the warm pass | 12 | already cheap |

`territory-heartbeat` is the one the last pass's budget ("no paint-property animation is running")
never saw, because that budget sampled the board before a single tile was owned: 0 branches, 0 paint
animations. On a played board it is 2 paint animations per home tile, forever (`web/src/style.css:5467`).
It is also the only paint animation still running on the podium/plate screen (21 of them).

The rest of the checklist, answered:

- **`transition: all`** — none in the source.
- **`backdrop-filter` over a moving board** — **0** visible in every duel state (the glass panels are
  sheets, not part of play).
- **permanently promoted layers** — **0** visible elements with `will-change` in every duel state.
- **per-frame JS in the pump during a turn** — script is **0.0 ms/s** in every idle state; the pump
  requests **0 frames/s** idle. Nothing to fix.
- **SVG blur under the board** — one: `filter: blur(.8px)` on `.territory-branch`, which is exactly
  the element that repaints 60 times a second for `territory-heartbeat`.
- **`filter` on screen** — 34–41 elements, unchanged from the last pass: 21–26 `brightness(1.15)`
  empty-hex cells, 5 gold-frame drop-shadows, the dimmed cards.

## The leak: the duel is over, the board is still working

`getAnimations()` on the plate, 6 s after it settled: **3 animations, 0 running** (`go-brand-in`,
`go-title-in`, `go-verdict-in`, all finished). The plate itself is clean — the check is now in the
suite.

The leak is behind it: on the result screen the board still runs **39 animations, 21 of them paint
(`territory-heartbeat`), at 353 ms/s of main-thread task at 4× CPU** — for a screen that is a still
picture with a card on it. They do not stop until the player leaves the result. The plate veils the
board at 46 % and dims it to 72 % brightness, but the spores, glints and tile hearts are still
visible through it, so pausing them is a **visible** saving and was left for the owner (the one-line
change: pause every `.amb-*`, `i` mote, `.territory-branch`, `.landmark.joined-pulse` and
`#game::before` animation while `body.result` is set).

One genuinely invisible leftover was found and is worth noting rather than fixing on its own: at the
plate a `futa04-card-breathe` keeps running inside a `visibility: hidden` moves region (1 animation).

## The poor-connection path (fixed)

- The lobby's invite/waiting poll and the parked "find opponent" search each fired a GET **every
  2 s** with no visibility check — the 2026-10-29 write-up named this and left it. They now ask one
  pure predicate, `web/src/online/poll-gate.ts` (`pollDue({ hidden, inFlight })`): a hidden tab asks
  nothing, and a request that is still out is never stacked on. That second half matters on a stalled
  connection: a 2 s interval behind an 8 s request used to keep four requests in flight, and this is
  exactly the "bad connection retries hot" shape. Returning to the tab polls once immediately, so the
  waiting screen is never a tick stale. The hub list poll now skips a hidden tab too.
- The duel's own sync poll already had both gates (`POLL_HIDDEN_MS` 30 s, and a single in-flight
  fetch), so the duel-while-waiting path was already correct — measured: 0 game frames/s and script
  0.0 ms/s while a turn is awaited.
- This is **battery, not heat**: it cannot be measured by the state harness above, and it is not
  claimed as a heat win.

## What was tried and reverted (it did not measure, or it would have changed the look)

- **Replacing the hand's Throw `box-shadow` cue with a pre-baked rim** — measured no difference
  (table above), so the CSS was left exactly as it is.
- **Forcing the hand cards onto the compositor** (`will-change: scale/transform`, `translateZ(0)`,
  `contain: layout paint`) — no change on any of them.
- **Depending on fewer custom properties in the animation timing** — 141 → 114 ms/s of recalc, i.e.
  not the cause, and not worth a rewrite that touches every card's phase.
- **Pausing the ambient board behind the result plate** — would be the biggest single saving on the
  plate (~353 ms/s of task at 4×) but it is visible motion stopping, so it is an owner decision.
- **`steps()` on the ambient loops** — the same conclusion the 2026-10-29 pass reached: an infinite
  animation still ticks its clock every frame.

## What was deliberately not touched

- `src/engine/` (pure rules), the deck, scoring, bots.
- The **Territory fog and the key row** (`web/src/online/world-view.ts`, `online-css.ts`) — owned by
  another worktree.
- The **finish plate**, achievements, the Daily module, tile colours.
- The **piles'** cue, the warm pass, the spores/glints/bubbles, `territory-heartbeat` and
  `joined-home-breathe`: every one of them is either already cheap or a visible decision.

## Checks run

| check | result |
| --- | --- |
| `npx tsc --noEmit`, `-p web`, `-p admin` | clean (3/3) |
| `npx vitest run web/tests/poll-gate.test.ts` | 5/5 |
| `npm run check` | typecheck clean; **342 files / 3513 tests passed**, 1 expected fail, 66 skipped; **3 timeouts** (`tests/bots/bloom-bands`, `tests/daily/puzzles` #30, `tests/engine/core-adversarial` ADV-5) — re-run alone they still time out on this loaded host, and the **pristine base commit `c5411f50` fails `tests/daily/puzzles.test.ts` identically** (`git archive` of the base into `/tmp/base-heat`: 2 failed, 29 passed) |
| `CHANNEL=futa04 … npm run web:build` | built |
| `CHANNEL=futa04 node scripts/check-channel-assets.mjs` | `futa04: asset isolation passed (103 files)` |
| `web/e2e/perf-duel-states.ts` | 1/1 check (the plate check) — BEFORE and AFTER the change: identical within host noise |
| `web/e2e/perf-phone.ts` | 6/6 (run on the BEFORE build; the shipped change is lobby code and cannot reach it) |
| `web/e2e/futa04-smart-cockpit.ts` | **883/883, passed** |
| `web/e2e/futa04-information.ts` | **168/168, passed** (first run stopped at "live score rests in the LED" under load; clean alone) |
| `web/e2e/hand-glow-urgency.ts` | **ALL PASS** |
| `web/e2e/futa04-motion.ts` | **passed** — "Draw/Throw, Bloom, Small/Huge cut, Reduce motion and the Mega Bomb" (needs a `CHANNEL=futa04` build; the first run was refused by `dist-channel.ts` because another suite had left a futa05 dist) |
| `web/e2e/futa04-living-display.ts` | **27/27, passed** |
| `web/e2e/smoke.ts` | **38/38, passed** |
| `web/e2e/painting.ts` | **25/25, passed** |
| `web/e2e/overhaul.ts` | **13/13, passed** |

**BEFORE vs AFTER, same conditions.** The only shipped change that could touch these numbers is the
poll gate, and it cannot (it is lobby code). Measured anyway, back to back, same dist pair:

| state, 4× CPU | BEFORE task ms/s | AFTER task ms/s | BEFORE recalc | AFTER recalc |
| --- | --- | --- | --- | --- |
| board idle (empty) | 54.9 | 12.3 | 33.9 | 2.8 |
| mid-game idle | 488.1 | 449.5 | 197.1 | 180.2 |
| throw idle (re-prompt on) | 599.0 | 614.3 | 317.0 | 319.8 |
| opponent catch-up | 702.0 | 688.3 | 361.4 | 397.2 |
| win/lose plate | 353.2 | 391.2 | 54.6 | 58.1 |

The swings in both directions are the host (this machine was running other worktrees' suites); the
structural numbers — 25 / 37 / 35 / 39 / 39 animations and 0 / 7 / 16 / 9 / 21 paint animations —
are identical before and after, which is the honest result: **this pass did not change what a duel
costs.** The cost is known now, and it is in the two tables above.

**What cannot be measured here.** This is desktop Chromium at 4× CPU on a phone viewport, not a
phone. A real device's temperature is not measurable from this machine. The proxies — main-thread
task ms/s, style-recalc ms/s, and the number of animations that keep the main thread busy for as long
as the screen is on — are what the CPU/GPU must sustain, and they are what a warm phone is made of.

## Harness

- `web/e2e/perf-duel-states.ts` — the per-state table above. `RUNS`, `CPU`, `MS`, `SEED`, `TURNS`,
  `DIST` (serve an already-built directory; that is how BEFORE was taken from
  `/tmp/dist-before-heat2`), `SKIP_PLATE`. It asserts the finished plate runs no animation of its own.
- `scratch/heat-paired.ts` — the A/B instrument: two CSS variants alternated (A B A B …) inside one
  page so host drift hits both equally. Every "no change" claim above is a paired result.
- `scratch/heat-isolate.ts`, `scratch/heat-recalc.ts` — one animation family at a time.
- `scratch/heat-hidden-anims.ts` — animations running on things nobody can see.
- `scratch/heat-steps.ts` — the census of every step of a turn (draw / grow / throw / opponent).
