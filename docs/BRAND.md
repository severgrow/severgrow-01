# FUTASAKU brand pack (owner, 2026-11-07)

Exact owner-supplied rasters. Do not recreate or redraw.

| Role | File | Where |
| --- | --- | --- |
| **FAVICON** | `web/src/assets/brand/favicon-tree-hex.png` | Favicon and tiny marks (tree in hex, no kanji) |
| **PLAIN** | `web/src/assets/brand/plain-wordmark.png` | All small logos in menus, in-game, HUD, finish, profile, replay |
| **HEX EMBLEM** | `web/src/assets/brand/hex-emblem.png` | App icon + back of cards |
| **PAINT** | `web/src/assets/brand/paint-wordmark.png` (+ `paint-wordmark-shadow.png`) | Owner 300×94 source (keep exact) |
| **PAINT 3×** | `paint-wordmark-3x.png` / `paint-wordmark-shadow-3x.png` | Home-screen menu **only** (Lanczos upsample of PAINT — no brush SVG exists) |

`web/src/player/branding.ts` owns the live URLs. The home menu mounts the **3×** PAINT shadow mark (with a
barely-noticeable almost-black drop shadow). Small marks use PLAIN via `createHudBrandMark` /
`createWordmarkMark`. Independent Besley “FUTASAKU” text headings stay typography — only their wordmark
tracking is tightened. PLAIN at HUD sizes (~22px tall) stays sharp from the 300×94 original; do not
swap PAINT for the retired primary SVG (different letterform).

## Regenerating derivatives

```sh
# Icons from HEX EMBLEM, favicon from tree-hex, card back stamp, PAINT shadow:
# (see the misc-polish brand scripts / the commit that introduced web/src/assets/brand/)
node scripts/build-app-icons.mjs   # still accepts emblem webp; prefer the hex-emblem PNG source
```

App icons live in `web/src/assets/futa04-icons/`. The Vite build copies them into `web/dist` for
product channels. Regenerate the social card with `node --import tsx web/e2e/og-image.ts --no-build`
and bump `og.jpg?v=` in `web/index.html` when the committed card changes.

Historical SVG masters under `web/src/assets/futasaku-primary-logo.svg` and
`/brand/futasaku-primary-logo.svg` are retained as construction records; the live game no longer
loads them.
