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

- a surface **becomes present**: 12 px of travel from 96.5 % scale over 300 ms, easing a hair past
  rest (100.6 %, 1 px up) and settling — one breath, never a bounce (owner, 2026-10-23: "make opening
  the menus and closing a bit alive and organic");
- it **leaves** quicker than it arrived: 180 ms, sinking a little (to 98 %) as it fades;
- a **press** answers in 90 ms with a 1.5 % compress and a whisper of light change;
- the board is never animated by this layer, and a live game is never delayed by it.

No bounce, no zoom, no long fade, no slide across the screen, no constant glow.

## Tokens

The numbers live in one JavaScript object and one block of CSS custom properties. A unit test
(`web/tests/interface-motion.test.ts`) keeps them identical and inside the owner's ranges.

| Token | Value | Use |
| --- | --- | --- |
| `--ix-open` | `300ms` | a surface arrives |
| `--ix-close` | `180ms` | a surface leaves |
| `--ix-press` | `90ms` | press / hover acknowledgement |
| `--ix-travel` | `12px` | the distance a surface moves while arriving |
| `--ix-scale` | `0.965` | the scale it grows from |
| `--ix-settle` | `1.006` | the hair past rest it eases through before settling |
| `--ix-ease-open` | `cubic-bezier(0.2, 0.7, 0.2, 1)` | decelerate into rest |
| `--ix-ease-close` | `cubic-bezier(0.4, 0, 1, 1)` | accelerate away |

They are deliberately **not** `--dur-*` tokens. The board's vocabulary is closed at two tempo
tokens (`ack`, `consequence`); interface motion is a separate, quieter family.

## Which transition for what

| Moment | Transition |
| --- | --- |
| Sheet, pause face, finish plate, confirmation, install invitation, matched card | `enterSurface` / `exitSurface`, 300 / 180 ms |
| Pause confirmation chained over the pause face | same primitives; closing the confirmation returns to the pause face |
| Screen to screen (menu, PLAY, levels, campaign, online hub) | `enterSurface`, 6 px travel; the game screen never moves |
| Backdrop / scrim | opacity only, 150 ms, no travel |
| Buttons, keys, utilities, icon controls | CSS `:active` with `--ix-press`; `press()` only for custom controls |
| Result heading / hairline | one timed reveal on the first showing (`data-fresh="1"`) |
| Starter lottery, card ritual, gameplay effects | their own choreography — do not wrap them in this layer |

Opening and closing are the same motion in reverse. Closing hides the node only when the exit has
actually finished; an interrupted exit never hides a panel the player has just reopened.

## Reduced motion

Motion is off when **either** is true:

- the OS asks for it (`prefers-reduced-motion: reduce`);
- the game's own Settings → Reduce motion is on (`.reduce-motion` on `<html>`).

In that state `enterSurface`/`exitSurface` call their `onDone` immediately and leave the surface in
its resting CSS state. CSS-only surfaces carry the same `@media` and `.reduce-motion` rules. The
game's Speed setting is **not** consulted: choosing Speed Off for the board does not stop a menu
from opening.

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

## Adoption status (2026-10-22, verified 2026-10-23)

Wired: the central `sheet()` path (so Settings, pause, How to play, What happened, the campaign
start confirmation and the new restart confirmation all share it), the profile read-out, the finish
plate, the install invitation, the starter lottery's exit, the online hub/waiting/join screens, the
matched card, and the screen-to-screen changes between menu-like screens — which is how the PLAY
submenu arrives (`#menu-play` → `openPlayMenu` → `enterSurface`, 6px travel; the main menu stands
down while it is open and `openPlayMenu` keeps `shownScreen === 'menu'` so a late boot show cannot
tear it down). The pre-game card ritual and all gameplay animation are untouched.

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
- `web/src/style.css` — the `--ix-*` block and the interface refinement section at the end.
- `web/tests/interface-motion.test.ts` — the contract.
- `web/src/main.ts` — `openSheetNow`, `openPlayMenu`, `showScreen`, `presentResult`, `hideGameOver`.
- `web/e2e/play-menu.ts` — the doorway measured as a settled surface at 360x640 and 390x844.
