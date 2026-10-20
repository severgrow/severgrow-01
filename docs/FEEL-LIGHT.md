# The LIGHT pass — the display's bloom comes from its lit dots

`futa0.5-feel-light`, built on `futa0.5-onboarding-3` @ `8586750`. Presentation only: no engine,
no save format, no new preference.

## What was wrong

The cockpit's light was two things pretending to be one:

1. `#smart-led-spill` — a **rectangular** panel of hard CSS gradients, cut with a two-layer
   intersected mask, sitting over the key row. Its edges were the panel's edges: the glow could
   only ever be a lit stripe under the display, clipped at 80% height and 86% width.
2. `hardware-reflect` and the LED pulse/alarm — **animated `filter: brightness()`** on the LED
   window. A live filter re-rasterises the LED on every frame, and the spill it lit was the most
   expensive composited layer in the app, so it had to be switched **off entirely while tiles
   moved** (`futa04-move-active`).

## What it is now

### One tone contract (`web/src/player/light.ts`)

Six tones (`amber`, `red`, `green`, `ivory`, `pink`, `cyan`; `score` borrows amber), each
`{ core, bloom, angle }`, published on the root as `--light-core`, `--light-bloom`,
`--light-angle` and a capped `--light-bloom-op`. Written **only when the tone changes**.

Consumers, all at low alpha so ownership colours are never replaced:

| Surface | How it uses the contract |
| --- | --- |
| Smart-display bloom | baked from the lit dots, in the dot's own ink |
| Top-rank tile halo | a `--light-core` tint **under** the owner's moss/lava sprite |
| Legal-target rim | stroke mixed 24% toward `--light-core` |
| Hover / context key | shadow uses `--light-bloom` |
| Lesson pointer + glow | fill and drop-shadow use `--light-core` / `--light-bloom` |
| Outcome light | the display's bloom colour, borrowed for one beat, then handed back |

**One halo per target:** `#tutorial-focus[data-light-target]` drops the lesson's halo when the
target is the display (its bloom *is* the highlight) or a tile the board already lights.

### The baked bloom

After an LED paint, the same `ledLayout()` the glyphs are drawn from produces the lit dots; each
dot stamps a radial gradient stretched 1.45× along the tone's 22° angle into a small offscreen
canvas, padded by `BLOOM_PAD` (43 px) so the falloff ends **inside** the bitmap. The strip is drawn
on a layer **outside** `#smart-led-window`, so the window's `overflow:hidden` cannot cut it into a
rectangle.

- **Never per-frame readback, never a live blur.** One bake per message.
- **Marquee:** the strip is baked once and the bloom *layer* translates with the same
  `--led-travel` and `--led-duration` as the glyphs.
- **Motifs:** the whole 4–5 frame set is baked once and the existing ~11 fps loop only swaps
  finished pictures.
- Movement and light live on **separate elements** (layer travels, canvas carries opacity), because
  `animation` is a shorthand and a scroll rule would otherwise silently drop the alarm.

### Caps, and what replaced the filters

| Old | New |
| --- | --- |
| `smart-led-flash-*`: 320/380 ms `filter:brightness(1.9)` | one 60 ms white veil, **≤ 35%** opacity (`#smart-led-flash`) |
| `smart-led-pulse/alarm`: animated `filter` | `#smart-led-hot`, a pre-baked copy of the lit dots, **opacity-only**; alarm keeps its 1.2 s beat |
| `hardware-reflect`: `filter:brightness()` on the bezel | an opacity step (×1.18) on the already-baked bloom, still under the cap |
| `#smart-led-spill` (mask + `mix-blend-mode:screen` + `filter:saturate`) | deleted; normal-blended alpha sprite |

Normal blending is used instead of `mix-blend-mode:screen` because on this near-black cockpit the
result is visually the same and old phones composite it far more cheaply.

## Verified

- `npm run check` equivalent: `tsc --noEmit` (root, web, admin) + `vitest run` — see the branch
  commit message for the exact numbers.
- `web/tests/light.test.ts` — tone map, unknown-tone fallback, caps, monotonic falloff, sprite
  padding, dots-in-their-tone.
- `web/e2e/light-source.ts` — 63 pixel checks: origin within 4 px of a lit dot, soft falloff ≥ 24 px
  along the angle **and** on every side, empty sprite edge, no corner wash, light still falling on
  each bezel edge, flash 60 ms/35%/once, alarm 1.2 s, no bloom re-bake while the message holds,
  4× CPU grow keeps the bloom lit and adds no frame gap the app does not already have.
- Green: `futa04-display-glow`, `futa04-smart-cockpit` (882), `futa04-tutorial-lock`,
  `futa04-tutorial-flow`, `lessons-3` (L1–L10, 0 wrong taps, plus robustness/layout/tiers/redesign).

Screenshots: [`screens/light/`](screens/light) at 360×640 and 390×844, each with a reduce-motion
variant, plus every palette.
