# Working on Futasaku 0.3

Read `README.md`, `docs/FUTASAKU_0_3_BASELINE.md` and `docs/SPEC.md` before changing the game. `docs/SPEC.md` defines the rules. The owner does not code; report outcomes in short, plain English with the checks that actually passed.

## Branch safety

- Work only on `Futasaku0.3` for this version. Its starting commit is the frozen Test2/Main2.0 SHA `89d438c1b3fca253292d1b8a9eabffcf5e2da315`.
- Never modify, merge into, reset, rebase or deploy `main`, `dev` or `Main2.0`. Never discard uncommitted work from another checkout. Do not force push.
- This repository still has historical live and Test channels for verification. The current Futasaku game is built with `CHANNEL=test2`; do not accidentally validate a legacy channel as the current game.
- A push to `Futasaku0.3` runs CI. Publication of a new web route is separate work; do not change Pages workflows during routine development.

## Boundaries

- `src/engine/` is the deterministic rules and state layer. It must not use randomness, clocks or I/O. `src/bots/` decides computer moves. Changing either area, the deck, scoring, balance, replay, or `docs/SPEC.md` changes gameplay and needs explicit user direction.
- `web/src/main.ts` wires the UI to the engine; `web/src/logic/` holds input, layouts, save/settings and guidance; `web/src/player/` holds Test2 presentation; `web/src/ui/` draws board, cards, effects and sound.
- Optional V3 artwork is an active current menu choice. Its source is `web/src/ui/skin/`, `web/src/skins/` and `web/public/design-v3/`.
- `web/src/lab-mode/`, `web/src/ui/designBoard.ts`, `web/public/design-v2/` and the bake-off fonts are historical Test-channel material. They are excluded from the current Test2 build but remain referenced by tests/builds. Trace references before deletion.
- Do not regenerate golden games, weaken assertions or change rules to make a test pass. Do not introduce dependencies or new accounts without a concrete need.

## Required checks

```sh
npm ci
npm run check
CHANNEL=test2 npm run web:build
CHANNEL=test2 node scripts/check-channel-assets.mjs
PW_CHROMIUM=/usr/bin/chromium node --import tsx web/e2e/test2-critical.ts
```

`npm run check` covers strict types and the complete Vitest suite. For changes to visual information, V3, offline loading or fonts, run the corresponding `web/e2e/test2-information.ts`, `test2-v3.ts`, `test2-quality.ts` or `typography-audit.ts` checks. The CI workflow also builds and tests the historical channels; keep it green. Browser scripts use the current `web/dist/` and need Chromium.

Check at 360×640, 390×664, 390×844, 430×932, 768×1024, 1280×800, 1440×900, 1600×980 and 1920×1080 when layout changes. Also check reduced motion, large text and left-hand mode. Headless checks do not replace real iPhone Safari and Android Chrome testing.

## Compatibility

The `severgrow.*` save/settings keys, `main2:` storage prefix, `severor-ready` boot event, `__severgrow` test hook and `PlayFruit`/`FRUIT` engine action identifiers are retained deliberately. They protect existing saves, cache recovery, browser checks and rule interfaces. The visible product name is Futasaku and the visible special card is Bomb. Do not rename compatibility identifiers casually.

Commit a coherent green milestone on `Futasaku0.3` only. State what changed, what was checked, and what remains uncertain. Keep historical screenshots out of commits; old images live in Git history at the source SHA.
