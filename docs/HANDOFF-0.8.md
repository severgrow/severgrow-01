# Beta 0.8: the animation, consistency and charcoal pass (handoff)

**Read this first if you are picking this up.** It is the single source for this pass: what the owner
asked, their answers, the plan, and what is done (with commits). Update the "Status" table after
every green step and commit it in the same commit as the work.

## The ask (owner, 2026-11-06, verbatim essentials)

> "run a polish and tighten pass ... with the planet design we brought the visual level to 2028
> standards. we need to do the same with the rest. review all animations in game - some of them are
> not running smooth enough. build on what we have, but improve the animation for
> grow/cut/bloom/blast/bomb/ for both player and opponent. priorities: satisfaction, addictive
> gameplay, efficiency - always plays smoothly, interesting and breathtaking - all of that while being
> sort of low key. FUTASAKU x Nintendo x Apple like design. analyse all animation in duel game, but
> also around menus ... don't fix things that work well, but look for any gaps. sharpen animations,
> slow down big blasts or big cuts. always make bloom work from the connected tile, one by one. put
> some heaviness on bomb and blast etc. also color pass: wherever we have complete black color, change
> it to slightly charcoal black ... Consistency - find gaps in consistency of design and fix. ...
> always quick to load and run, doesn't drain CPU or battery."

## Owner's answers (2026-11-06)

1. **Release:** straight to live when done (push `futa0.5-online`, CI green, `npm run promote -- <sha>`,
   dispatch `futasaku04-preview.yml` with `{promote: ''}`, confirm ROOT_SHA in the build log).
2. **Big cuts / Blasts:** scale with size, max ~2 s (cut cap 1400 -> ~2000 ms for the biggest; small
   ones stay quick). PLUS: **animation never blocks input.** While a Bloom/cut/grow animation plays the
   player can already pick their next card (grow, throw). Play at any speed; the animation keeps
   playing but never gets in the way.
3. **Heaviness for Bomb/Blast:** "lowkey all of it" (hit-stop + board settle, tiny screen shake on
   Blast, light dims on impact, firmer haptic thud), if not expensive. Some already exist: tighten and
   make them work together. If something lags, keep the best and drop the rest. Must be smooth.
4. **Bloom pace:** slower, ~0.3 s apart, tile by tile, always growing out from the connected tile.
5. **Opponent:** same weight as the player's, about 10% slower so you can follow it.
6. **Charcoal:** between #0b0c0d and #121315 -> use **#0e0f10** for every pure black (#000, black,
   rgb(0,0,0) used as a fill/ground). Shadows with alpha may stay rgba(0,0,0,a) (they are darkening,
   not a colour), but solid black grounds change.
7. **Menus/screens:** fix gaps only; add Apple-style soft springs only where it is a good idea (sheets,
   small pop-ins), never a big restyle.
8. **Particles:** a few dust specks on Bomb/Blast, ONLY if it looks beautiful, not cheap 2D shapes.
   If it can't look premium, leave it out.
9. **Weak phones:** auto-lower extras quietly, only when REALLY necessary (sustained frame drops),
   never the moves themselves.
10. **Version:** Beta 0.8.

## Rules that still apply (AGENTS.md)

Tests first; never weaken a test (owner-directed changes rewrite the pinned tests and say so in the
commit). `PINNED` in `web/src/logic/motion.ts` + `web/tests/motion.test.ts` pin choreography: changes
here are owner-directed (this doc) and must update both. Engine (`src/engine/`) untouched: this pass is
presentation only. Reduced motion keeps working. No idle render loops. Phones first; check WebKit for
touch.

## Plan (in order)

| # | Step | Status |
|---|------|--------|
| 0 | White-blink fix bee46ac3 promoted live (before this pass) | ships with 0.8 (its CI's iOS job hung in browser install twice) |
| 1 | Audit: map every duel + menu animation, durations, where input is blocked, jank sources | done (see Findings) |
| 2 | Input never blocked by animation (queue-free: next card pickable while effects play) | done (`logic/play-through.ts`, `blocking()` in main.ts, e2e `play-through`) |
| 3 | Bloom: tile by tile from the connected tile, 0.3 s apart | done (PINNED.bloomGap 1.14) |
| 4 | Big cuts/Blasts scale with size up to ~2 s; small stay quick | done (cut cap 2000, Big/Huge ripple 80/96 ms, Blast 64 ms/ring up to 1.5 s; 1-4 tile cuts unchanged) |
| 5 | Bomb/Blast heaviness: hit-stop, settle, shake (Blast), light dip, haptic thud — one shared impact | done (`logic/impact.ts`, `heavyImpact()` in main.ts) |
| 6 | Opponent moves ~10% slower, same weight | done (PINNED.opponentPace in playStep) |
| 7 | Dust specks on Bomb/Blast (premium or not at all) | done: soft gradient glow (`fx-dust`), ash motes now the same glow; film: `web/e2e/blast-film.ts` |
| 8 | Charcoal #0e0f10 for every solid black | done (`logic/charcoal.ts`, test `charcoal.test.ts`) |
| 9 | Menu/screen gaps; soft springs on sheets where good | audited: no gaps (see notes) |
| 10 | Consistency gaps (radii, focus, tokens, timing) | partial: one shared impact family, motes = dust glow, charcoal; frame-cost render work left (see notes) |
| 11 | Quiet auto-lower on sustained frame drops | done (`player/frame-guard.ts`: <30 fps for 4 s during moves turns off dust/dim/shake for the visit) |
| 12 | Beta 0.8 label | done |
| 13 | Full checks, film, push, promote live, confirm | checks green locally (4143 unit tests, all browser suites); pushed to futa0.5-online; next: CI green -> `npm run promote -- <head>` -> dispatch republish -> confirm ROOT_SHA |

## Findings / notes (append as you go)

- **Move animation lives in `web/src/main.ts` `playStep()`** (grow / sever / megaBomb (=Blast) / fruit (=Bomb) /
  strengthen / discard / draw), fed by `AnimQueue` (`web/src/logic/anim.ts`). Cuts are planned purely in
  `web/src/logic/cut.ts` (`cutPlan`, tiers small/severe/big/huge) and played by `playCut()` in main.ts.
- **Before 0.8 any tap during an animation called `fastForward()`** (instant finish). Now `blocking()` =
  `busy() && !playThrough()`; `playThrough()` is true when only MY steps are queued (offline, not tutorial,
  not lessons). Input gates switched to `blocking()`: card/hex/deck/discard taps, `humanPlay`, hand legal,
  board targets, piles, `maybeAutoPlay`, `drawCombo`, `autoAdvance`, `renderControls`. A card thrown
  mid-show is kept in the hand as `throwHeld` (`.throw-held`) until its flight starts.
- **Bloom order already walks out from the connected tile** (`web/src/logic/growth-order.ts`, BFS) and the
  futa04 path reveals tile by tile (`sequential` in the grow case). Only the pace changes (PINNED.bloomGap).
- Blast (`megaBomb` case): dark flash, heavyShake on futa04, ring-staggered punch-in (36 ms/ring), hold
  640-840 ms. Bomb (`fruit` case): card flight, pod swell 300 ms, burst, impact. `impact()` skips shake on
  futa04. `watchFrames()` auto-lower is OFF for futa04 (returns early).
- **Owner rule changes rewritten in tests (Beta 0.8):** `web/tests/motion.test.ts` (PINNED: cutCap 2000,
  bloomGap 1.14, rippleBig/Huge, blastRing/Max, opponentPace), `web/tests/cut.test.ts` (ripple per tier, cap),
  `web/tests/bloom-by-hand.test.ts` (blocking()), e2e `futa04-motion` + `cut-severe` ("a tap during my own cut
  no longer skips it").
- **Frame cost (measured, not fixed — next priority for smoothness):** `web/e2e/motion-cost.ts` plays a big
  Blast, a Bomb, a Huge cut and a Bloom at 4x CPU slowdown. Worst frame gaps 150-330 ms both BEFORE this pass
  (bee46ac3: blast 317, bomb 167, huge cut 217, bloom 217) and after (233 / 150 / 233 / 183): no regression.
  The stalls are the whole-page `render()` called by `show()` at each step's end (`__severgrow.renderCosts()`:
  40-240 ms at 4x) and a CPU profile shows they are mostly style/layout/paint ("(program)"), plus forced
  layouts (`getBoundingClientRect`). A real fix is a narrower render at step boundaries (board + scores only,
  like `renderRevealTile()` does for Bloom tiles) — a bigger refactor of main.ts, left for a dedicated pass.
- **Sheets/screens:** every sheet already opens and closes through `enterSurface`/`exitSurface`
  (interface-motion.ts, a soft settle that is already spring-like); no gaps found, nothing changed there.
