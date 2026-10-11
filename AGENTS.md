# Working on Futasaku 0.4

Read `README.md` and `docs/SPEC.md` before changing the game. `docs/SPEC.md` defines the rules.
The owner does not code; report outcomes in short, plain English with the checks that actually passed.

## Branch safety

- Work on **`futa0.4`**. Do not modify, merge into, reset, rebase or deploy `main` for Futasaku work.
- Never discard uncommitted work from another checkout. Do not force push unless explicitly required and safe.
- Pre-cleanup snapshot: `archive/futa0.4-before-cleanup`.
- Product channel is `CHANNEL=futa04` (`/futa0.4/`). Quick experiments use `CHANNEL=futa-test` (`/futa-test/`).

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
