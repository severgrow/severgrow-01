# Working on Futasaku 0.4

Read `README.md` and `docs/SPEC.md` before changing the game. `docs/SPEC.md` defines the rules.
The owner does not code; report outcomes in short, plain English with the checks that actually passed.

## Branch safety

- **Two product lines.** The locked **0.4** line lands on **`futa0.4`**; the **0.5 online** line
  (online duels + live duels, shipped as `/futa0.5/`) lands on **`futa0.5-online`** — start at
  [`docs/ONLINE.md`](docs/ONLINE.md). Do not modify, merge into, reset, rebase or deploy `main` or
  `dev` for this work.
- Never discard uncommitted work from another checkout. Do not force push unless explicitly required and safe.
- Pre-cleanup snapshot: `archive/futa0.4-before-cleanup`.
- Product channel is `CHANNEL=futa04` (`/futa0.4/`). The 0.5 preview is `CHANNEL=futa05`
  (`/futa0.5/`, online duels **and** live duels); quick experiments use `CHANNEL=futa-test` (`/futa-test/`).

## Boundaries

- `src/engine/` is deterministic rules/state. No randomness, clocks or I/O. Changing scoring, deck, Bloom/Bomb/Blast or `docs/SPEC.md` needs clear user direction.
- `web/src/main.ts` wires UI; `web/src/logic/` holds input, save, guidance; `web/src/player/` holds Futa04 presentation; `web/src/ui/` draws board, cards, effects and sound.
- V3 art is archived off this branch. Skins will return later; do not reintroduce `design-v3` casually.
- Keep compatibility identifiers: `severgrow.*` save keys, `PlayFruit` / `MegaBomb` action names, `__severgrow` test hook.

## Required checks

```sh
npm ci
npm run check
CHANNEL=futa04 npm run web:build
CHANNEL=futa04 node scripts/check-channel-assets.mjs
```

For UI changes also run the relevant `web/e2e/futa04-*.ts` suite with Chromium. Commit coherent green milestones on `futa0.4`.

## Code layout (read before adding a feature)

[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) maps the folders and the patterns to copy. In short:

- New features go in their own module with a `mountX(hooks)` function; `main.ts` only wires them in.
  Don't add module-level state or feature code to `main.ts` (it is ~10,800 lines and the most-edited file).
- A feature's CSS lives with the feature and is scoped under its root id. Beware `.x svg` selectors:
  the board nests small `<svg>` windows — use `> svg`.
- `channel.ts` prefixes every storage key per channel; load it once, keep save keys unchanged, and
  prefer `browserStorage()` (`KeyValue`) for new code. Contract: `web/tests/storage-prefix-contract.test.ts`.
- No runtime import cycles (`web/tests/import-cycles.test.ts`). The 2026-10-26 hygiene audit and the
  deferred plans (splitting `main.ts`, replacing the storage patch) are in `docs/HYGIENE-PASS-2026-10-26.md`.


## Visual consistency for future work

Read `docs/VISUAL-CONVENTIONS.md` before adding or changing game UI. Reuse `web/src/ui/instrument.css`,
the existing dark-glass tokens and `INTERFACE_MOTION`; extend the owning feature's scoped CSS rather
than creating another button/motion/palette system. Preserve focus indicators, 44px touch targets,
reduced-motion behavior and the existing gameplay motion budget. New interface effects must finish;
do not introduce idle render loops, extra blur layers, subscriptions or dependencies for decoration.
