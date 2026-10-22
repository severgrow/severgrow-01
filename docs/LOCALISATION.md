# Futasaku localisation

Futasaku ships **four complete languages**: English, Polish, Spanish and Japanese. English is the
canonical source; the other three are written as native game copy, not as translations of English
word order. Portuguese (Brazil), French and German are reserved by the architecture but are **not**
selectable until their dictionaries are complete.

This document is the practical guide. `docs/LOCALISATION-GLOSSARY.md` is the terminology source of
truth. `docs/LOCALISATION-COVERAGE.md` lists every surface checked and the known exceptions.

## The one rule

**English is never changed by localisation work.** Every English value in `src/strings.ts` and every
English fallback passed to `t()` is the existing product copy, byte for byte. If English copy needs
improving, that is a separate, approved copy change; the dictionaries then follow it.

## Architecture

```
src/i18n/core.ts        pure runtime: locale registry, t(), tPlural(), detection, formatNumber()
src/i18n/index.ts       lazy locale loaders (English is built in)
src/i18n/pl.ts          Polish dictionary
src/i18n/es.ts          Spanish dictionary
src/i18n/ja.ts          Japanese dictionary
web/src/i18n/boot.ts    browser wiring: storage, <html lang>, data-i18n binding, corner picker
web/src/i18n/locale.css corner control + Japanese typography
src/strings.ts          canonical English game copy, wrapped by localized() read-through views
```

`src/i18n/core.ts` is pure: no DOM, no storage, no clock, no randomness, no network. The web layer
owns the browser.

### `src/strings.ts` groups

The existing English objects are unchanged; each exported group is now a read-through view:

```ts
const EN_MENU = Object.freeze({ play: 'Play', /* … */ });
export const MENU = localized('menu', EN_MENU);
```

`MENU.play` looks up `menu.play` in the active locale and returns the English value when the key is
missing. Call sites did not change, so every existing screen (`ONLINE`, `LESSON`, `CAMPAIGN`,
`RESULT`, `TUTORIAL`, …) follows the language automatically.

### Plain UI copy

For markup and for copy created in code, use a semantic key and the English source as the fallback:

```ts
import { t, tPlural } from '../../src/i18n/index.js';

t('ui.game.paused', 'Paused');
t('ui.game.level', 'Level {level}', { level: 7 });
tPlural('ui.count.tiles', { one: '{n} tile', other: '{n} tiles' }, count);
```

Plural entries use `Intl.PluralRules`, so Polish gets `one / few / many` and Japanese gets its own
form without English grammar leaking in.

### Static markup

```html
<h2 data-i18n="settings.title">Settings</h2>
<button data-i18n-aria="ui.aria.close" aria-label="Close">×</button>
<input data-i18n-placeholder="account.nicknamePlaceholder" placeholder="Your name" />
```

`applyStaticCopy()` captures the English ONCE (before translating) and then renders the active
locale. Supported attributes: `data-i18n`, `data-i18n-html`, `data-i18n-aria`, `data-i18n-title`,
`data-i18n-placeholder`.

## Adding a string

1. Add the call with a semantic key and the exact English copy:
   `t('ui.screen.thing', 'English copy')`.
2. Add the key to `src/i18n/pl.ts`, `es.ts` and `ja.ts`. Keep every `{placeholder}`.
3. Run `npm test -- tests/i18n` (or `npm run check`). The coverage test fails on a missing key, an
   empty value, a placeholder mismatch, a stale key, or an untranslated English sentence.
4. Check it in context at 360px, 390px and desktop, in all four languages.

For static markup, add the attribute and do step 2–4.

## Changing English copy

Do not silently change the English. If an approved copy change happens:

1. Change the English value in `src/strings.ts` or the fallback at the call site.
2. Update the three dictionaries for the same key.
3. If the meaning changes, update the glossary.
4. Run the i18n tests; the stale-key and placeholder checks will point at drift.

## Language detection and persistence

- First launch: `navigator.languages` in order. `pl*` → Polish, `es*` → Spanish, `ja*` → Japanese,
  `en*` → English; anything else → English.
- A manual choice is stored in `localStorage` under `severgrow.locale` (the historical Futasaku
  namespace) and always wins over the browser preference.
- Switching updates `<html lang>`, `<html data-script>`, static copy and the active screen's
  dynamic copy without a reload. Game state is not touched.
- The corner control on the main menu is plain, low-opacity type — not another menu button. It shows
  the language's own name (`English`, `Polski`, `Español`, `日本語`), never a country flag.

## Locale loading

Dictionaries are **lazy chunks**. English is built into the core; selecting Polish loads only the
Polish chunk (≈19 KB gzip), Spanish loads Spanish, Japanese loads Japanese. An English player
downloads no translation bundle. There is no runtime machine translation and no network request per
string.

## Validation

`tests/i18n/coverage.test.ts` and `tests/i18n/runtime.test.ts` enforce:

- every key in `src/strings.ts` exists in all three dictionaries;
- every `t()` / `tPlural()` key in shipped source and every `data-i18n*` key exists;
- no empty translations;
- no placeholder drift against the English source;
- no stale key whose English source disappeared;
- no obviously untranslated English sentence (with a small allowlist for brands);
- detection, manual switching, fallback, interpolation and plural rules.

Runtime missing keys are also recorded by `missingKeys()` and fall back to English in production, so
a missed string can never blank the screen.

## Typography

- Latin locales keep Besley / Fragment Mono.
- Japanese uses native system faces first: Hiragino Sans (Apple), Yu Gothic UI (Windows),
  Noto Sans JP (Android/Linux). No large Japanese font download, no missing-glyph fallback.
- The cockpit LED normally draws a 5×7 dot alphabet. Japanese is rendered as real type on the same
  canvas, with the same warm glow, so kana and kanji never appear as `?`. The marquee/message width
  calculation accounts for full-width characters.
- Japanese line breaking is `line-break: strict`; Western tracking is removed from short labels.

## Adding Portuguese (Brazil), French or German

1. Copy `src/i18n/pl.ts` to `src/i18n/ptBR.ts` (or `fr.ts`, `de.ts`) and translate every value.
2. Add the locale code and metadata to `LOCALE_META` and `READY_LOCALES` in `src/i18n/core.ts` **only
   when every key is translated**. Add the type to `Locale`.
3. Add a lazy loader in `src/i18n/index.ts`.
4. Add the native name to the picker automatically (`READY_LOCALES`); do not reorder the existing
   four.
5. Run the coverage tests. The picker must not show an incomplete language.

The reserved codes are already listed in `RESERVED_LOCALES` so tests can prove they are not exposed.

## Integration notes for other agents

- **New UI text:** wrap it in `t('ui.yourArea.key', 'English')` and add three dictionary entries.
  Do not concatenate translated fragments; use `{placeholders}` or a function message.
- **New strings in `src/strings.ts`:** keep the English object exactly as it is; wrap the export in
  `localized('groupName', EN_GROUP)`. The i18n coverage test will list every missing key.
- **Pre-game starting-player animation:** use the existing semantic keys
  `online.starterYou` (“You start”), `online.starterOpponent` (“Opponent starts”),
  `online.scoreYou` (“You”), `online.scoreOpponent` (“Opponent”), and their screen-reader variants.
  The animation implementation is untouched by this branch.
- **Tutorial/onboarding:** levels 1–10 are the tutorial and use `src/strings.ts` `LESSON`/`ONBOARD`
  keys, which are already localised. New level copy should be added as semantic keys, never as
  language-specific branches in UI code.
- **Files this branch touched:** `src/strings.ts` (localised views), `src/playtest/names.ts`,
  `web/index.html`, `web/src/main.ts`, `web/src/logic/{hint,log,endgame,race,emptyturn,tips,
  forecast,match-intel,howto-reference,interaction}.ts`, `web/src/player/*` and `web/src/online/*`
  copy surfaces. Merge conflicts are most likely in those files; take the other agent's gameplay
  change and re-apply the `t()` wrapper around the new English text.

## Release checklist

- [ ] `npm run check` green.
- [ ] `CHANNEL=futa04 npm run web:build` green.
- [ ] `CHANNEL=futa04 node scripts/check-channel-assets.mjs` green.
- [ ] `tests/i18n` green.
- [ ] Menu, Settings, Language picker, Level 1 tutorial, a normal match, finish card, Online hub and
      Territory checked at 360×640, 390×844 and desktop in all four languages.
- [ ] Japanese LED and tutorial copy render as glyphs, not fallback boxes or `?`.
- [ ] No unintended English text on a translated screen.
- [ ] Language choice persists across a reload.
- [ ] Switching language does not reset a saved match.
- [ ] English has not changed except for approved copy edits.
- [ ] Native-speaker review status recorded in the PR.
