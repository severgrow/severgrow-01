# Interface motion

Owner direction, 2026-10-22. The game's feel is one object on a table: the board is the object,
and the surfaces around it are parts of the same machine. This document covers only the **interface**
half of the motion language. The board's own choreography stays in
[`web/src/logic/motion.ts`](../web/src/logic/motion.ts) and [`docs/UX.md`](UX.md).

## The decision

Two directions were possible:

- **Instrument panel** — precise controls, analogue read-outs, parts that click into place.
- **Living board** — menus and results that emerge from the playing surface.

The pass uses a restrained blend of both, because that is what the codebase already is. The
cockpit, the display and the board are the instrument; a pause or a result is a *part of that
instrument moving*, not a new page arriving. Concretely:

- a surface **becomes present**: 4 px of travel from 99.6 % scale over 150 ms, easing a hair past
  rest (100.05 %, 1 px up) and settling — one breath, never a bounce (owner, 2026-10-23: "make opening
  the menus and closing a bit alive and organic");
- it **leaves** quicker than it arrived: 100 ms, sinking a little (to 99.8 %) as it fades;
- a **press** answers in 90 ms with a 1.5 % compress and a whisper of light change;
- the board is never animated by this layer, and a live game is never delayed by it.

No bounce, no zoom, no long fade, no slide across the screen, no constant glow.

## Tokens

The numbers live in one JavaScript object and one block of CSS custom properties. A unit test
(`web/tests/interface-motion.test.ts`) keeps them identical and inside the owner's ranges.

| Token | Value | Use |
| --- | --- | --- |
| `--ix-open` | `150ms` | a surface arrives |
| `--ix-close` | `100ms` | a surface leaves |
| `--ix-press` | `90ms` | press / hover acknowledgement |
| `--ix-travel` | `4px` | the distance a surface moves while arriving |
| `--ix-scale` | `0.996` | the scale it grows from |
| `--ix-settle` | `1.0005` | the hair past rest it eases through before settling |
| `--ix-ease-open` | `cubic-bezier(0.22, 1, 0.36, 1)` | decelerate into rest |
| `--ix-ease-close` | `cubic-bezier(0.4, 0, 1, 1)` | accelerate away |
| `--ix-screen` | `10px` | how far a WHOLE SCREEN travels while it arrives |
| `--ix-stagger` | `50ms` | the beat between a screen's body and its own head |
| `--ix-colour-in` | `1000ms` | the living map's tiles coming UP to their colours (menu → Territory) |
| `--ix-colour-out` | `300ms` | the living map's colour going back DOWN (Territory → menu) |

`--ix-screen` and `--ix-stagger` are the 2026-11-02 addition (owner: "if we have existing ones make
them more visible and smooth"). They are not a second vocabulary: the same duration, the same curve,
the same sign convention — a screen simply spends more of it than a card does.

`--ix-colour-in` / `--ix-colour-out` are the same evening's addition (owner: "for territory
transition, make it the color of tiles fade in in like 1 second or so, and 0.3s when going back to
main menu — so it's truly smooth and organic how you change screens"). They are NOT `open`/`close`
stretched: no surface's arrival changes, and only the living map's single opacity track reads them.

They are deliberately **not** `--dur-*` tokens. The board's vocabulary is closed at two tempo
tokens (`ack`, `consequence`); interface motion is a separate, quieter family.

## Which transition for what

| Moment | Transition |
| --- | --- |
| Sheet, pause face, finish plate, confirmation, install invitation, matched card | `enterSurface` / `exitSurface`. A full plate takes the strong arrival (screen travel, 98.5% scale) and its head follows one stagger later; a compact card keeps 4px / 99.6% |
| Pause confirmation chained over the pause face | same primitives; closing the confirmation returns to the pause face |
| Screen to screen (menu, PLAY, the picker, the campaign list, the online hub) | `enterSurface` with `screenArrival`: forward rises from below by `--ix-screen`, back drops from above; the screen's head follows one `--ix-stagger` later. The game screen never moves |
| Menu ↔ Territory (the map) | the camera's own handoff (`living-territory.ts`): the SAME SVG continues from the menu's pixels, the frame's skin fades in and the map's light comes up after the geometry has landed — see below |
| Backdrop / scrim | opacity only, 150ms, no travel |
| Buttons, keys, utilities, icon controls | CSS `:active` with `--ix-press`; `press()` only for custom controls |
| Result heading / hairline | one timed reveal on the first showing (`data-fresh="1"`) |
| Starter lottery, card ritual, gameplay effects | their own choreography — do not wrap them in this layer |

Opening and closing are the same motion in reverse. Closing hides the node only when the exit has
actually finished; an interrupted exit never hides a panel the player has just reopened.

### Which way is forward

`web/src/ui/screen-motion.ts` is the one place that decides it, from a depth ladder alone
(`menu 0 → play 1 → levels 2 → campaign 3 → game 4`). A deeper screen is a forward move, a shallower
one is a back move, two at the same depth do not travel, and the GAME never travels at all. The
decision is pure and unit-tested (`web/tests/screen-motion.test.ts`), so "which way does this
arrive" can never drift between two call sites.

## The menu ↔ Territory transition

Owner, 2026-11-02: *"make going into territory from main menu look intentional … right now it jumps,
slightly changing position."* The menu paints the map full-bleed and the Territory paints the same
SVG inside a framed panel, so the two windows differ in shape and position.

What already existed, and is still the foundation: the panel's map is the SAME item seen through the
panel's own box (see `anchoredView` in `web/src/online/world-view.ts`), so there is no travel to
animate — the owner's "tiles don't move at all". Measured: the player's own tile sits at the same
pixel on both frames (0.01px on a 390x844 phone). A transform is only ever added when the two views
genuinely differ (the world-fit cap on a very tall screen), and then it eases home in `--ix-open`.

The jump was not in the mapping. It was in everything around it:

- the map's paint box leads the panel's window by `(dx,dy)` while it slides home — measured 102px on
  a 390x844 phone, 66px at 1440x1000, 41px at 320x568, 72x41px in landscape — so for those frames
  the panel's own glass showed through at one edge and the map's opposite edge was clipped;
- the map was ALREADY at 26% and climbing to 100% over the same 150ms, so that difference was lit;
- the panel's frame (its vignette and its hairline) simply existed from the first frame;
- the way back had no animation at all: the geometry returned to the full-bleed framing in one frame.

So four things were added, all transform/opacity, none per-frame:

1. **the frame's skin arrives** — the panel's vignette (`::after`) and a 1px instrument hairline
   (`::before`, above the map) fade in over the same beat, instead of appearing;
2. **the map's light follows its geometry** — it dips inside the first third of the 150ms handoff
   (easeOpen has already spent ~87% of the travel by then), so the crop and the slide are never
   seen lit;
3. **the tiles' colour comes up over the owner's second** — after the dip, the one opacity track
   that multiplies every tile's fill climbs for the rest of `--ix-colour-in` (1000ms). It is one
   composited layer, never a per-tile loop and never a filter; the tiles themselves do not move;
4. **the panel's head arrives a beat later** — the back key, the title and the wallet line rise 4px
   over `--ix-open` after `--ix-stagger`.

The way back is the same motion in reverse: the map's colour goes down over `--ix-colour-out`
(300ms) while the skin leaves, and the framing returns to the menu's full-bleed view at the menu's
own backdrop light. Total: 150ms of geometry + a one-second colour climb in, 300ms out. A Back
pressed during the arrival continues from the colour that is actually on screen, and a Back at (or
below) the menu's light completes in one frame — no stuck half-faded map either way.

Rejected, and why: **a full-screen veil** (a second composited layer that does the same job the
frame's skin and the map's light already do, and reads as a flash); **a scale settle on the panel**
(it would scale the map with the frame and break the 1:1 handoff the camera rule depends on);
**animating the crop itself** (a clip-path or a per-frame `getBoundingClientRect` — a filter-like
cost on every frame, and the owner's rule here is transform + opacity only).

## Reduced motion

Motion is off when **either** is true:

- the OS asks for it (`prefers-reduced-motion: reduce`);
- the game's own Settings → Reduce motion is on (`.reduce-motion` on `<html>`).

In that state `enterSurface`/`exitSurface` call their `onDone` immediately and leave the surface in
its resting CSS state. CSS-only surfaces carry the same `@media` and `.reduce-motion` rules. The
game's Speed setting is **not** consulted: choosing Speed Off for the board does not stop a menu
from opening.

Reduce motion is INSTANT, not fast: `screenArrival(..., true)` returns a zero-length arrival, the
Territory's settle and its light are skipped whole (and the way back is a straight swap — the
`web/e2e/living-territory.ts` suite samples the return and asserts no animation survives it), and
the frame's skin has no transition. Nothing is left fainter or displaced because it did not animate.

## When to avoid animation

- Never animate the board, the hand, a card, a hex or a critical gameplay control with this layer.
- Never animate on a state the player is waiting for: a result must not be delayed by its entrance.
- Never animate a live clock, a timeout, or anything that implies a server match has paused.
- Do not animate an element that already has a stronger, local animation (the card ritual, the
  starter lottery's lanes, a lesson's own choreography).
- No animation for a re-render of a surface already on screen: use a state transition
  (`wasHidden`), never a timer.

## Performance

Only `opacity`, `translate` and `scale` animate, so the work stays on the compositor. `will-change`
is switched off again once a surface is closed. The board's dim on pause/result is a **static**
filter, never a filter transition (the scrim/plate entrance covers the change); animating a filter
over the whole board SVG was the one measurable cost this layer avoids.

## How to adopt it

1. Mark the surface in markup: `data-ix-surface`. It is inert until JS moves it; the attribute
   documents the intent and applies `pointer-events: none` while closing.
2. Show it: `hidden = false`, then `enterSurface(el)`. If it has a separate content card, animate
   the card and fade the backdrop with `{ travel: 0, scale: 1 }`.
3. Hide it: `exitSurface(el, { onDone })`; set `hidden = true` and restore focus **inside**
   `onDone`. If the exit may be interrupted, guard the callback with the surface still being the
   current one (see `openSheetNow` in `web/src/main.ts`).
4. For markup-only surfaces, add the `ix-arrive` class; it uses the same tokens with no JS.
5. For a control that cannot use `:active`, call `press(el)`. Prefer CSS where it works.

Do not add a new duration, curve or library for one surface. If the vocabulary genuinely cannot
express a movement, change this file, its CSS block, this document and the test together.

## Adoption status (2026-10-22, re-verified 2026-11-02)

Wired: the central `sheet()` path (so Settings, pause, How to play, What happened, the campaign
start confirmation and the new restart confirmation all share it), the profile read-out, the finish
plate, the install invitation, the starter lottery's exit, the online hub/waiting/join screens, the
matched card, and every screen-to-screen change — which is how PLAY arrives (`#menu-play` →
`openPlayMenu` → `arriveScreen`), how the picker and the campaign list arrive, and how any of them
returns (the opposite sign). The main menu stands down while PLAY is open and `openPlayMenu` keeps
`shownScreen === 'menu'` so a late boot show cannot tear it down; a separate `route` records that the
player is in a doorway so the way back is a BACK move, not a replay.

What changed on 2026-11-02, and why it was needed: a whole screen used to arrive with 6px of travel
and a 99.6% scale, and a full plate with 4px and 99.6% — the owner's "I cannot tell". A screen is now
`--ix-screen` (10px) with its own head one `--ix-stagger` later, a full plate is 10px / 98.5% with its
head staggered, PLAY's exit is a real exit (`exitSurface`, not a hard `hidden = true`), and the
finish card takes the plate's arrival. The pre-game card ritual and all gameplay animation are
untouched.

Read-outs are NOT animated. The chapter caption under `LEVEL <n>` in the PLAY submenu is text that
the menu's own layout pass repaints; it carries no entrance of its own, so a slow layout can never
make a read-out look like a control arriving.

### What the stills show (2026-10-23)

`docs/screens/interface/` is one PNG format in both sets (2x, captured from the built app with
Reduce motion on, after the pre-game ritual has handed the board over): `before/` is the 0.6 base,
`after/` is the shipped layout. The result
plate's vertical balance was measured, not eyeballed — at 390x844 the plate went 492 → 453px and
its lockup's centre 54% → 58% of the frame; at 1280x800, 489 → 450px and 51% → 56%. The two quiet
ways out now share one row, which is where the height came from, so the plate covers LESS board
than before and still never scrolls. The doorway itself is pinned by `web/e2e/play-menu.ts`, which
waits for `data-ix-state="open"` rather than for "not hidden".

## Files

- `web/src/ui/interface-motion.ts` — tokens and the primitives.
- `web/src/ui/screen-motion.ts` — the one pure decision a whole screen needs: which way it arrives.
- `web/src/style.css` — the `--ix-*` block and the interface refinement section at the end.
- `web/src/online/living-territory.ts` / `-css.ts` — the menu ↔ Territory handoff and its skin.
- `web/tests/interface-motion.test.ts`, `web/tests/screen-motion.test.ts` — the contract.
- `web/src/main.ts` — `arriveScreen`, `openSheetNow`, `openPlayMenu`, `showScreen`, `presentResult`.
- `web/e2e/play-menu.ts` — the doorway measured as a settled surface at 360x640 and 390x844.
- `web/e2e/screen-motion.ts` — every screen change, its direction, its stagger, and Reduce motion.
- `web/e2e/living-territory.ts` — the no-jump frame, the return, and the camera rule.
- `web/e2e/motion-strip.ts` — the filmstrip in `docs/screens/motion/`.
- `docs/screens/motion/` — the transition, held at four points of its beat.
