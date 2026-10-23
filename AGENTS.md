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

## Localisation (read before touching player-facing text)

Futasaku ships English, Polish, Spanish and Japanese on the 0.6 line (`futa0.5-online`). Read
`docs/LOCALISATION.md`; the terminology source of truth is `docs/LOCALISATION-GLOSSARY.md`.

- **Never change English copy as part of a translation task.** English is canonical; dictionaries
  follow it. Propose copy changes separately.
- **New player-facing text:** use `t('ui.area.key', 'English copy')` (or `tPlural` for counts) and add
  the same key to `src/i18n/pl.ts`, `es.ts` and `ja.ts`. Do not concatenate translated fragments.
- **Static markup:** add `data-i18n="key"` (or `data-i18n-aria`, `data-i18n-title`,
  `data-i18n-placeholder`, `data-i18n-html`) to `web/index.html`.
- **`src/strings.ts`:** keep the English object unchanged; export it through
  `localized('group', EN_GROUP)`. Existing groups already are. New groups follow the same pattern.
- **No language branches in UI code.** Use semantic keys, never `if (locale === 'ja')` for copy.
  Typography/layout branches are allowed in CSS, keyed off `html[data-script]` and `html[lang]`.
- **Locale dictionaries are lazy.** `src/i18n/index.ts` loads only the chosen language. Do not import
  `pl.ts` / `es.ts` / `ja.ts` into the main bundle.
- **Incomplete languages stay hidden.** Only `READY_LOCALES` appears in the picker.
- **Required check for any text change:** `npm test -- tests/i18n`. It fails on missing keys, empty
  values, placeholder drift, stale keys and untranslated English sentences.

## Localisation conventions for reviews

- Draw → Grow → Throw is the current turn. Never reintroduce old terminology; “Fruit” in player copy
  is the Bomb.
- Preserve `{placeholders}`, `<b>`/`<i>` markup and brand names (`FUTASAKU`, `双サク`).
- Japanese LED text is drawn as real type on the canvas; do not force it through the 5×7 Latin matrix.
