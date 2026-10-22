# Localisation coverage report

Baseline: branch `feature/futasaku-i18n`, from `futa0.5-levels-31-70` at `5daa8ea`.
Languages: **en**, **pl**, **es**, **ja**. Reserved, not exposed: pt-BR, fr, de.

## Covered player-facing surfaces

| Surface | Status | Notes |
|---|---|---|
| Main menu, PLAY submenu, Continue/Resume | ✅ | Static markup + `MENU` / `CAMPAIGN` keys |
| Corner language control | ✅ | Native names, low-opacity type, keyboard listbox |
| Settings sheet (all labels, groups, hints) | ✅ | `SETTINGS` group; segmented values localised |
| Settings: training difficulty labels | ✅ | Easy / Medium / Hard |
| First-run welcome card | ✅ | `WELCOME` group |
| Tutorial chapters (legacy Pro run) | ⚠️ not translated | Hidden on the product channel; levels 1–10 are the tutorial. See exceptions. |
| Campaign levels 1–10 (the tutorial) | ✅ | Every `LESSON` / `ONBOARD` title, line and wrong-tap answer |
| Campaign levels 11–70 | ✅ | Gameplay UI, record of moves, results |
| Level list, Resume/Continue dialog, progress | ✅ | `CAMPAIGN` group, chapter titles/subtitles |
| Gameplay HUD, turn pill, score bar | ✅ | `ONLINE`/`HEADER` groups and UI keys |
| Dock hints, why-a-tap-did-nothing answers | ✅ | `ui.hint.*`, `TAP_WHY` |
| Cockpit LED phase and result tokens | ✅ | Including Japanese canvas type |
| Cockpit flavour asides | ✅ | Three locale pools (fewer lines than English by design) |
| Move buttons (Grow, Bloom, Bomb, Blast, Skip, Clear, Reverse) | ✅ | `SPROUT` / `BLOOM` / `FRUIT` / `BLAST` + `ui.move.*` |
| Hand and pile accessible names | ✅ | Counts use plural rules |
| Tile card (rock, empty, gold, strength, risk, weak link) | ✅ | `HOME`, `FRUIT` + `ui.tooltip.*` |
| Match Intel: tabs, move verbs, meters, observation | ✅ | Uppercase instrument tokens per locale |
| Forecast / Confirm bar and risk lines | ✅ | `ui.forecast.*` |
| Coach tips, explanations and summary bullets | ✅ | `ui.coach.*`, including the glossary words it introduces |
| Finish card: title, reason, breakdown, actions, More/Less | ✅ | `RESULT`, `CAMPAIGN`, `ONLINE` |
| How to play reference | ✅ | Full rule sentences, HTML preserved |
| Install invitation (mobile and desktop) | ✅ | `INSTALL` group |
| Online hub, invite/join/waiting/cancel, errors | ✅ | `ONLINE` group + `ui.online.*` |
| Find-opponent states, matched-while-away card | ✅ | `ONLINE` group |
| Real-time duels: challenge, clock, end, leave warning | ✅ | `LIVE` group |
| Territory map, wallet, selection, claim, errors | ✅ | `ui.world.*`, `ONLINE` |
| Seeds reward line, daily limit, verification | ✅ | `ui.seeds.*` |
| Accounts: sign-in, guest, nickname, delete, errors | ✅ | `ACCOUNT` group |
| Problem report sheet | ✅ | `FEEDBACK` group |
| Tester guide | ✅ | `BETA_GUIDE` group |
| In-app privacy sheet | ✅ | `PRIVACY` group |
| Static `/privacy` page | ⚠️ English only | Generated at build from the English `PRIVACY` object; see exceptions |
| Document title | ✅ (brand) | “Futasaku”; the online lobby adds the translated “your turn” count |
| Accessibility names for main controls, board, score, piles | ✅ | `data-i18n-aria` + render-time keys |
| Browser meta description / Open Graph | ⚠️ English only | Crawler-facing, not in-game UI |
| Lab preset names, notes and readouts | ⚠️ English names | Experimental Lab inside Settings; control labels and status are localised |
| Test-only lab, font bake-off, design lab | — | Not shipped on the product channel |

## Automatic coverage

The coverage test walks every export of `src/strings.ts` (680 messages) plus every `t()` / `tPlural()`
key in shipped source and every `data-i18n*` attribute. At the time of writing that is **374
user-facing keys**. All 374 exist in Polish, Spanish and Japanese with matching placeholders.

Run:

```sh
npm test -- tests/i18n
```

## Known exceptions and honest limits

1. **Legacy Pro tutorial** (`web/src/logic/tutorial-script.ts`, `startTutorial`). The product menu
   hides this entry (`menu-tutorial` is hidden when the campaign exists). Levels 1–10 are the real
   tutorial and are fully localised. Translating the hidden legacy run would add ~240 strings for a
   screen no product player can reach; it was deliberately left for the onboarding owner.
2. **Static `/privacy` page** is generated from English at build time. The in-app privacy sheet is
   fully localised. A future release can generate `/privacy/pl/`, `/privacy/es/`, `/privacy/ja/`
   from the same dictionary; no architecture change is needed.
3. **Lab recipes** keep English names (`Night Garden`, `Velvet Silence`, …) and their one-line
   notes. The Lab is an explicitly experimental panel inside Settings; its controls and status line
   are localised. Preset names read as product names.
4. **Native-speaker review.** The Polish, Spanish and Japanese copy was written and checked in this
   branch by the implementing agent, not by independent native reviewers. It is internally
   consistent, glossary-checked and visually checked, but a native-speaker proofread is still
   recommended before a public launch, especially for Japanese tutorial phrasing and Polish case
   endings in generated sentences.
5. **One English source sentence is factually wrong and was translated faithfully rather than
   silently corrected:** Match Intel's observation “TWO BOMBS CAN BLOOM.” should describe the
   Blast. English copy is frozen by this task, so the dictionaries mirror the source; the fix belongs
   in a separate approved English copy change (and the same key in all four dictionaries).
6. **No live online match** was available in this environment, so the online and real-time surfaces
   were checked by reading the code and by the existing unit tests, not by a two-player browser
   session. The copy itself is in the same dictionaries and passed coverage/placeholder checks.

## Visual checks actually performed

Built with `CHANNEL=futa04`, served locally, driven by Playwright + Google Chrome:

- 360×640, 390×844 and 1280×800;
- English, Polish, Spanish, Japanese;
- main menu, language picker, PLAY submenu, Level 1 tutorial (intro and first draw beat);
- measured horizontal overflow, button scroll width vs client width, language control position and
  opacity, board/aria names, glass text, cockpit text, and LED canvas ink;
- reload persistence of the manual language choice.

Results are recorded in the PR/commit notes. No real-device Safari or Android test was performed.
