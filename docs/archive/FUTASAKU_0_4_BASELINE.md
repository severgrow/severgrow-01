# Futasaku 0.4 baseline audit

Source: Test2/Main2.0 commit `89d438c1b3fca253292d1b8a9eabffcf5e2da315`.
The branch was created from this commit before cleanup. Its working game is the
`CHANNEL=futa04` build. The original Test2 checkout had unfinished local UI
changes; those were preserved separately and were not included in this frozen
source or in Futasaku 0.4.

## Runtime inventory

| Family | Status and reason |
| --- | --- |
| `src/engine/`, `src/bots/`, `src/playtest/`, `src/strings.ts` | Active: rules, computer play, names and tutorial. |
| `web/src/main.ts`, `logic/`, `player/`, `ui/` | Active: Futa04 input, session, save, board, cards, effects, audio and layout. |
| `web/src/ui/skin/`, `skins/`, `public/design-v3/` | Active: optional V3 look in the current menu. Both resolution tiers and the manifest are used. |
| `web/src/fonts/v2/`, `web/src/assets/futasaku-white.png` | Active: current typography and logo. Font bytes and artwork were not changed. |
| `web/index.html`, `web/public/manifest.webmanifest`, `web/public/futa04-sw.js`, `web/vite.config.ts` | Active: boot, install, offline update and production build. |
| `tests/`, `web/tests/`, `web/e2e/`, `.github/workflows/` | Active verification and deployment configuration; workflow unchanged. |
| `src/sim/`, `src/cli/`, `src/server-core/` | Developer tools and future verification. Their scripts/tests still reference them; retained. |
| `web/src/lab-mode/`, `web/src/ui/designBoard.ts`, `web/public/design-v2/`, `web/src/fonts/bakeoff2/` | Legacy to Futasaku 0.4, but still referenced by the historical Test channel and its checks. Retained until those contracts can be retired safely. Not bundled in Futa04. |
| `docs/screens/` old images | Removed: generated review output, never loaded by the game or used as test fixtures. The exact files remain at the source commit. |
| `web/public/icon.svg` | Removed: no HTML, manifest, worker or source reference. |
| `web/public/icon-180.png`, `icon-192.png`, `icon-512.png`, `og.png` | Active: Home Screen/manifest, offline shell and link preview. |
| `MAIN2_PROGRESS.md` | Removed from this branch: frozen Test2 development log, retained at the source commit. |

Exact duplicates within the V3 art family were retained because the manifest
uses their distinct filenames for orientation, tier or strength lookups. All
six root `devDependencies` are used by build, TypeScript, tests or browser QA;
none were removed or upgraded.

The Design V2-only rules were moved from the shared stylesheet to
`web/src/ui/design-v2.css`, loaded only by the historical Test channel. Its
styles still build there, while the Futasaku/Futa04 stylesheet no longer carries
them. Existing engine, board, card, sound, save and optional V3 modules kept
their established homes. The repository's old agent/startup notes were replaced
with branch-specific instructions to prevent accidental work on frozen Test2.

## Naming and compatibility

The player-facing game title, page metadata, web manifest and package metadata
say Futasaku. The old Test2-only build-time title substitution was removed.
The numeral font was renamed without changing its bytes or appearance.

Several historical identifiers remain intentionally: `severgrow.*` save and
settings keys, the `main2:` storage prefix, `severor-ready` boot event,
`__severgrow` browser test hook and `PlayFruit`/`FRUIT` engine action names.
Changing any of these could lose saved progress, break cache recovery/tests or
change the rules interface. The visible card already says Bomb; its internal
action name is a compatibility detail. The old Lab/Design branch code is also
retained while its import and test contracts still exist.

## Build baseline

Before cleanup, `CHANNEL=futa04` produced 339 files totaling 11,776,898 bytes
with 81,522 bytes of CSS. After cleanup, it produces 338 files totaling
11,773,650 bytes with 78,987 bytes of CSS. The build lost the unreferenced
602-byte icon and Test-only Design V2 styles; the small remaining size change
comes from Futasaku naming. The 415 deleted review images occupied
276,719,105 bytes in the source working tree. V3 art remains the largest runtime
family (10,482,374 bytes in the current build).

## Verification

- `npm ci` completed from the unchanged dependency set; final `npm run typecheck` passed.
- Full `npm run check`: 108 test files passed, 1,135 passing tests and one existing expected failure.
- Current Futa04, historical Test and historical live builds passed their asset isolation checks. Design V2 CSS is present only in Test.
- Current-game browser checks: 2,206 board/turn checks and 207 critical checks across nine phone/tablet/desktop sizes; 184 information/help checks; 24 V3 checks; 329 quality, save and offline checks.
- A 390×844 production-build boot loaded 21 resources through menu and game start with zero console warnings or errors. Its Besley, Commissioner and Futasaku Numerals fonts loaded. The menu and opening board were visually reviewed. The CSS split removes styles with selectors that cannot match Futa04; no current artwork or gameplay style rules were altered.
- No obvious repeated startup asset request or listener registration loop was found. Browser and unit checks covered saved progress, corrupt/blocked storage, offline launch, bot turns, move legality, Undo, Bloom, Sprout, Draw, Throw, win flow, responsive layout and V3 rendering. Real Safari/Android hardware testing and a long-session memory profile remain outstanding.
- The figures above record the Futasaku 0.3 baseline build. The 0.4 rename is verified by `npm run typecheck`, the `CHANNEL=futa04` build and the futa04 browser suites.

This baseline deliberately does not change tile art, controls, game rules,
animations, save schema or dependency versions.
