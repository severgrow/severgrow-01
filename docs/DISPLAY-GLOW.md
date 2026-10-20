# Display glow onto the keys

> **SUPERSEDED (2026-10-20).** The masked `#smart-led-spill` this document describes was
> **deleted** on `futa0.5-feel-light`. The display's light is now one baked sprite built from
> the actual lit dots, blurred along a 22° angle, padded past the bezel and normal-blended; its
> key-panel rims and seams are gone with the mask that painted them. See
> [`FEEL-LIGHT.md`](FEEL-LIGHT.md). Everything below is kept as the record of what the owner
> approved on 2026-10-13 and why — not as a description of the current build.

Futasaku 0.4 cockpit — branch `futa04-display-glow` (cut from `origin/futa0.4`).

This is a **product presentation** change in files shared with the locked futa0.4
build, so it is isolated on its own branch for owner review. It does **not** change
layout, geometry, hit targets, gameplay, engine, strings or colour meaning, and it is
**not** deployed to `/futa0.4/` — the owner reviews the screenshots in
[`docs/screens/glow/`](screens/glow) first.

---

## STATUS — OWNER-APPROVED (2026-10-13)

**Status: OWNER-APPROVED on 2026-10-13.** Owner decision: **"lock it in for now;
maybe we'll work on it further later, but good for now."**

- **Not merged, not deployed.** This change is **not** merged into `futa0.4` and is
  **not** in the live `/futa0.4/` build. It stays on `futa04-display-glow` until the
  owner chooses to merge and deploy it.
- **What it is.** The display→keys optics: light from the LED window now reads as light
  *falling on* the matte keys from above (a thin top-edge catch and faint seam light,
  decaying over about one key row), instead of each key brightening its own frame on the
  display's beat. CSS-only, in `web/src/player/smart-cockpit.ts`; no change to layout,
  geometry, hit targets, gameplay, engine, strings or colour meaning.
- **Evidence.** Raw before/after frames in
  [`docs/screens/glow/before/`](screens/glow/before) and
  [`docs/screens/glow/after/`](screens/glow/after), with side-by-side strips in
  [`docs/screens/glow/`](screens/glow) (`pair-*.png`).
- **Possible future work (to resume easily):** further tuning across the colour modes and
  a Safari/Firefox cross-browser pass — see §6 (honest notes) and §7 (cross-browser risk)
  below.

---

## 1. The problem

When the display blinked, the **buttons looked like they were emitting light too**.
The display is supposed to be a real display, and the keys under it real matte keys:
if the display emits, some of that light should *fall on* the keys, not make the keys
into little lamps.

Two mechanisms caused the "second lamp" read:

1. **The keys brightened their own frame art.** A "chrome" pulse ran the *same beat and
   colour as the LED* over `#smart-led`, `#smart-context` and every
   `#futa04-actions > .hand-slot`, via
   `filter: brightness() drop-shadow(0 0 Npx <LED ink>)` on each key's `::before`
   frame. A surface that animates its own glow reads as an **emitter**, not a
   **receiver**. The major-event `futa04-hardware-reflect` did the same to the keys.
2. **The spill was additive over the key faces.** `#smart-led-spill` used
   `mix-blend-mode: screen` with a broad mask, a `::after` radial wash, **and** a
   blurred, up-scaled copy of the LED glyphs (`#smart-led-spill-cells`,
   `blur(7px) brightness(1.12) scale(1.02 1.35)`). Screen *adds* light to whatever is
   beneath — including the key faces — so the keys read as self-lit.

---

## 2. The optic rule set

Light from the display now reads as light **falling on the keys from above**:

- **Falloff with distance.** Strongest immediately at the display's lower edge,
  decaying over roughly **one key row**. Vertical falloff dominates; only a little
  horizontal spread.
- **Modulated by surface.** Matte dark keys reflect very little. The only evidence is
  (a) a thin bright catch on each key's **top edge/bevel**, (b) faint light in the
  **gaps** between keys, (c) a whisper on the faces. A key's own mid-tone is never
  brightened.
- **No self-emission.** A key's resting or active look must never animate its own
  outer glow. The normal depth shadow is kept — that is a shadow, not a glow.
- **One bounce.** A very faint secondary gradient just below the top edge implies the
  reflected bounce.
- **Colour** keeps tracking the LED ink through the existing `--spill-ink` and the
  `data-led-mode` mapping (amber / ivory / green / red / pink / cyan), but is
  **desaturated and softer** than the LED itself.
- **Intensity is biased to the low end.** Idle is barely-there; a pulse is a faint
  brightening (the display **breathing**), never a flash.
- **Reduced motion** looks essentially identical, just static.

### Blend-mode choice (justification)

`mix-blend-mode: screen` is kept — reflection genuinely *adds* luminance, which is what
screen does; `soft-light`/`overlay` modulate the backdrop instead and on such a dark
matte face they either vanished or shifted the ink's hue. The defect was never the blend
mode by itself, it was that screen was applied **unmasked across the key faces**. The fix
is to keep screen but **confine it** with a mask and a background that only paints the
rims, the seams and a faint falloff — so the faces are effectively untouched. The element
also carries `filter: saturate(.78)` so the reflected ink is softer than the LED.

---

## 3. What changed, rule by rule

All edits are in `web/src/player/smart-cockpit.ts` (the docket/panel CSS in the
`SMART_COCKPIT_CSS` template). `web/src/player/player-css.ts` was inspected and **left
unchanged** — its glow belongs to the board/step cue, not the display→keys path.

| Rule | Change | Why |
| --- | --- | --- |
| `#smart-panel.led-pulse / .led-alarm … ::before` (**chrome pulse**) + `@keyframes smart-chrome-pulse` / `smart-chrome-alarm` + the per-mode `--chrome-glow` / `--chrome-hot` blocks | **Removed** | This was the main defect: every key brightened its own frame art with a coloured drop-shadow on the LED's beat. |
| `futa04-hardware-reflect` keyframes + selector | **Narrowed to `#smart-led::before` only**; softened to `brightness(1.06)` / `brightness(1.02)`, drop-shadow removed | The **display's own bezel** is the emitter and may catch its own flash; the neighbouring **keys** must not. Keeps the animation name the e2e check asserts. |
| `#smart-led-spill` box | `left:2px`→`0`; `top:calc(var(--control-size) - 6px)`→`var(--control-size)`; width/height now `key pitch` sized | The light starts exactly at the display's lower edge and spans the key row + the two seams under the display. Footprint of the *keys* is unchanged. |
| `#smart-led-spill` paint | New `background`: (1) thin top-edge catch, (2) row-gap band, (3) periodic vertical seam gradient (one period = key pitch), (4) one faint bounce below the edge then a whisper | Physical cues only; no broad face wash. |
| `#smart-led-spill` mask | Two layers composited `intersect`: a **vertical falloff** (`#000` at the gap → `transparent` by 80%) and a gentle **horizontal fade** | Vertical falloff dominates; little horizontal spread. |
| `#smart-led-spill` opacity/ink | Lower: `--spill-opacity` `.14–.18`; new `--spill-rim` for the catch; `filter: saturate(.78)` | Barely-there; desaturated and softer than the LED. |
| `#smart-led-spill-cells` | `display:none` (retired) | The blurred, scaled glyph copy was the additive wash that made the key faces look self-lit. Reflected light is diffuse, and the LED ink still reaches the strip through `--spill-ink`. |
| `#smart-led-spill::after` (radial wash) | **Removed** | Same reason: a broad radial added light across the faces. |
| `@keyframes smart-spill-pulse` / `smart-spill-alarm` | Multipliers reduced `.14→.22` / `.28→.38` | The reflected wash **breathes** with the display; it must not flash with it. |
| `@keyframes idle-urgency-draw` | `0 0 12px 2px rgba(242,237,224,.42)` → `0 1px 4px rgba(242,237,224,.20)` | The board re-prompt was a wide outward halo; now a tight rim. Colours unchanged. |
| `@keyframes idle-urgency-grow` | `filter:brightness(1) → 1.22` **removed** (opacity only) | Brightening the whole surface is the "emitter" read. Also restores the bloom recipe's resting `drop-shadow` that the old keyframe was overwriting. |
| `@keyframes idle-urgency-throw` | `0 0 12px 2px rgba(220,70,45,.62)` → `0 1px 4px rgba(220,70,45,.34)`; scale `1.055→1.04` | Same: tight rim, not a halo. Colours and `0 5px 12px` depth shadow kept. |

**Not changed:** the LED window's own `smart-led-pulse` / `smart-led-alarm` /
`smart-led-flash-cut` / `smart-led-flash-bloom` brightness (the display *is* the light
source), the `data-led-mode` colour mapping, `--spill-*` custom properties,
`#smart-led-spill` geometry beyond the light footprint, and every
reduced-motion guard (the new animations inherit the existing
`html.futa04-information.reduce-motion` and `@media (prefers-reduced-motion:reduce)`
rules).

---

## 4. Measurements

Captured with `web/e2e/futa04-display-glow.ts` (Vite dev server, animations frozen
mid-frame, `deviceScaleFactor: 2`). Region luminance, panel-local, phone cockpit
(44 px keys). The important number is the **idle → alarm delta**: how much the keys
change when the display blinks.

**Keys during the alarm blink, before → after** (`390x844`, amber, freeze @ 240 ms):

| Region | BEFORE Δ | AFTER Δ |
| --- | --- | --- |
| LED window (the display) | **10.9** | 10.7 |
| key frame, full | 4.1–5.5 | **0.0–0.3** |
| key top band | 6.4–7.9 | 0.0–1.3 |
| key face | 1.4–1.6 | **0.0–0.1** |
| right-hand column (col 3) | 5.2 | **0.0** |

So the display still breathes (unchanged), while the keys now barely move at all.

**Where the light actually lands** (idle, luminance per 1 px row/column):

- vertical, across a key's face (slot0, x12–34): `y48:59 → y49:51 → y50:41 →
  y52:19 → y66:24` — a thin catch at the key's top edge (y49–50) decaying to the
  face's resting level within ~3 px; further down the face stays at the frame art's
  own values (19–25), i.e. untouched.
- horizontal at the catch line (y49): key tops `50–66`, the **seams** at x44–48
  `32–35` and (fainter, at the display's right edge) x92–94 `20–17`, and the
  right-hand column essentially unlit — vertical falloff dominates, little horizontal
  spread.
- per-mode catch ink tracks the LED family: amber `(51.0, 49.2, 46.0)`, green
  `(47.4, 48.5, 45.1)`, red `(49.6, 44.1, 42.9)`, pink `(49.6, 46.9, 47.3)`, cyan
  `(46.6, 47.5, 47.0)`, ivory `(48.3, 47.9, 46.8)`.

**Reduced motion** — the `reduce-idle` and `reduce-alarm` captures are **byte-identical**
(sha1 match): the wash is static and a pulse adds nothing.

---

## 5. Before / after screenshots

All under `docs/screens/glow/`.

Side-by-side strips (BEFORE | AFTER), easiest to judge first:

- `pair-390x844-idle.png` — the state the owner judges first
- `pair-390x844-amber-pulse.png`, `pair-390x844-amber-alarm.png`
- `pair-390x844-green-flash-cut.png`, `pair-390x844-green-flash-bloom.png`
- `pair-1280x800-idle.png`, `pair-1280x800-amber-alarm.png`
- `pair-390x844-reduce.png`
- `pair-modes-390x844.png` — every `data-led-mode` at rest (amber, ivory, green, red, pink, cyan)

Raw frames: `before/<viewport>-<mode>-<state>.png` and `after/…`, at `390x844` and
`1280x800`, for `idle`, `pulse`, `alarm`, `flash-cut`, `flash-bloom`, each LED mode at
rest, and the two reduce-motion frames. Each PNG has a `.json` sidecar with the exact
element rectangles the measurements use. Regenerate with:

```sh
CHANNEL=futa04 GLOW_PHASE=before npx tsx web/e2e/futa04-display-glow.ts
CHANNEL=futa04 GLOW_PHASE=after  npx tsx web/e2e/futa04-display-glow.ts
```

---

## 6. Honest notes

- **Verification was quantitative.** The measured deltas and pixel profiles above are
  the evidence behind this branch; the owner's eye on the strips is still the final
  judge of "does it look like reflected light".
- **`ivory`, `pink`, `cyan` are not reachable in production.** No code path emits those
  LED modes (only `amber`, `score`, `red`, `green` are used). Their ink mapping and
  CSS are kept working, but those three frames were produced by re-importing the LED
  cell painter in the QA script — they are not gameplay states.
- **The display's own bezel still brightens slightly on major events.**
  `futa04-hardware-reflect` now touches `#smart-led::before` only — the emitter catching
  its own flash. If the owner wants *zero* change on the display frame too, that is a
  one-line removal (`futa04-micro-polish.ts` asserts this animation name, so the test
  would need updating in the same change).
- **The board's own attention cues remain** (deck/discard/hand/bloom re-prompt). They
  are the game's guidance system with semantic colours, not the display's reflection,
  so they were only *lightened* (tight rim instead of a halo) — deliberately not
  removed. If the owner wants them treated as part of the same optics pass, say so and
  they can be taken further.
- **The phone 1280×800 and 390×844 panel crops are near-identical** because the cockpit
  keys are 44 px on both until the 1500 px desktop breakpoint; the 1280×800 pair mainly
  confirms the wider board behind the strip.

---

## 7. Cross-browser risk

The change reuses patterns already present in this file, so it adds no *new* class of
risk, but the two sensitive areas are:

- **`mix-blend-mode` + `filter`.** `#smart-led-spill` carries both `mix-blend-mode:screen`
  and `filter:saturate(.78)`. Chromium and Firefox composite this as intended. Safari
  has historically forced a new compositing layer for `filter`; the blend still applies,
  but a Safari pass is worth doing before shipping to the locked build.
- **`mask-composite` / `-webkit-mask-composite`.** The two-layer mask uses
  `mask-composite:intersect` with the WebKit fallback `-webkit-mask-composite:source-in`
  — exactly the syntax the previous version already shipped, so Safari/Firefox behave as
  they did before. The new part is only the gradient *stops* (`repeating-linear-gradient`
  with `calc()` on `--control-size`/`--control-gap`), which is well supported.
- **Fallback if a browser ignores the mask:** the blend would spread a very faint wash
  over the key row instead of only the rims. Because the idle opacity is `.14–.18` and
  the ink is low-alpha, even the un-masked worst case stays far weaker than the old
  spill — it degrades softly rather than flashing.

---

## 8. Shipping recommendation

Safe to ship to the locked futa0.4 build **after the owner's visual sign-off** on
`docs/screens/glow/pair-*.png` and **one Safari spot-check** of the strip. The change is
CSS-only, touches no geometry or gameplay, keeps every existing reduced-motion guard,
and the two affected e2e suites are green (`futa04-smart-cockpit` 882 checks,
`futa04-micro-polish` passed).
