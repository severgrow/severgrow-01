# FUTASAKU brand pack (owner, 2026-11-07)

Exact owner-supplied **pure vector** SVGs. Do not recreate or redraw. Prefer SVG in the live UI;
rasterise only where a host still needs PNG/WebP (PWA icons, card back, email, OG).

| Role | File | Where |
| --- | --- | --- |
| **FAVICON** | `web/src/assets/brand/favicon-tree-hex.png` | Favicon and tiny marks (tree in hex, **no kanji** — HEX SVG includes kanji, so keep this tree-only cream mark) |
| **PLAIN** | `web/src/assets/brand/plain-wordmark.svg` | All small logos in menus, in-game, HUD, finish, profile, replay |
| **HEX EMBLEM** | `web/src/assets/brand/hex-emblem.svg` | App icon + back of cards (kanji-in-hex); PNG derivative for the icon pipeline |
| **PAINT** | `web/src/assets/brand/paint-wordmark.svg` | Home-screen menu **only** (98-path true vector; not the raster-in-SVG `FUTASAKU_03_PAINT` wrapper) |

`web/src/player/branding.ts` owns the live URLs. The home menu mounts the PAINT SVG (with a
barely-noticeable almost-black CSS `drop-shadow`). Small marks use PLAIN via `createHudBrandMark` /
`createWordmarkMark`. Independent Besley “FUTASAKU” text headings stay typography — only their wordmark
tracking is tightened.

PNG/WebP fallbacks under the same names (`plain-wordmark.png`, `hex-emblem.png`, `paint-wordmark.png`,
app icons, `cards/back.webp`) are **derivatives** of the SVGs, rebuilt by the script below — not soft
upsampled phone screenshots.

## Regenerating derivatives

```sh
PW_CHROMIUM=/path/to/chrome node scripts/build-brand-from-svg.mjs
# also runs scripts/build-app-icons.mjs against the refreshed HEX emblem
```

App icons live in `web/src/assets/futa04-icons/`. The Vite build copies them into `web/dist` for
product channels. Regenerate the social card with `node --import tsx web/e2e/og-image.ts --no-build`
and bump `og.jpg?v=` in `web/index.html` when the committed card changes.

Historical construction SVGs under `web/public/brand/futasaku-primary-logo*.svg` are retained as
records; the live game loads the owner pure-vector pack above.
