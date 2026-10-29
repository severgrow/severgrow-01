# Working on FUTASAKU — read this first (every tool)

This file is THE instructions for any coding agent: Claude Code, Codex, Cursor, DeepSeek, Copilot or
a person. `CLAUDE.md`, `.cursor/rules/futasaku.mdc` and `CODEX_START_HERE.md` only point here, so the
rules live in one place. Change them HERE.

The owner does not code. Report outcomes in short, plain English: what changed, what was checked and
passed, what was not checked. Never claim a check you did not run.

## Releasing: push = /test/, promote = live

Full guide: [`docs/RELEASE-FLOW.md`](docs/RELEASE-FLOW.md).

- **Push to `futa0.5-online`** → futasaku.com/**test/** in ~20 min (only after CI passes). This is the
  normal end of a task. The live site does not change.
- **"promote"** (only when the owner says it) → `npm run promote` → what /test/ shows goes live at
  futasaku.com in ~20 min. `npm run promote -- --status` shows both; `npm run promote -- <sha>` rolls back.
- Work on a feature branch and fast-forward `futa0.5-online` when green, or push to it directly when the
  owner asks. Never push to `main`, `dev` or `Main2.0` (`main`'s `pages.yml` would overwrite the site
  root with the old Main build). Never force-push `futa0.5-online`.
- `/test/` shares the LIVE server and database. Server code (`server/`, Supabase function `duel`,
  bundle at `supabase/functions/duel/bundle.ts` — rebuild with `npm run server:build-edge`) and
  migrations (`server/migrations/`) roll out separately (docs/DEPLOY-ONLINE.md). Page code must keep
  working against the server that is live until then.

## Branches and lines

- **0.5 online** (the live game: online + live duels, Territory, campaign, Daily) lands on
  **`futa0.5-online`**; start at [`docs/ONLINE.md`](docs/ONLINE.md). `live` is moved only by promote.
- The locked **0.4** line lands on **`futa0.4`** (`/futa0.4/`). Pre-cleanup snapshot:
  `archive/futa0.4-before-cleanup`.
- Channels: `CHANNEL=futa04` (default build), `CHANNEL=futa05` (the live game; needs its three
  `VITE_*` online variables), `CHANNEL=futa-test` (experiments).
- Never discard uncommitted work from another checkout.

## Rules of the game and code

- [`docs/SPEC.md`](docs/SPEC.md) is the source of truth for the rules. If it is ambiguous, stop and ask.
- `src/engine/` is pure and deterministic: no `Math.random`, no clocks, no I/O. Changing scoring, deck,
  Bloom/Bomb/Blast or SPEC needs clear owner direction.
- Player names: Grow / Bomb / Blast / FUTASAKU. Keep compatibility ids: `Sprout` / `PlayFruit` /
  `MegaBomb`, `severgrow.*` save keys, the `__severgrow` test hook.
- Write tests first. Never change a rule or weaken a test to make it pass. When the OWNER changes a rule,
  rewrite the tests that pinned the old rule and say so in the commit.
- TypeScript strict, Vitest, Node 20.19+.
- Feel and motion values that must not drift live in `PINNED` (`web/src/logic/motion.ts`), asserted by
  `web/tests/motion.test.ts`.

## Required checks

```sh
npm ci
npm run check                                   # typecheck + all unit tests (~10 min)
CHANNEL=futa04 npm run web:build && CHANNEL=futa04 node scripts/check-channel-assets.mjs
```

For UI changes also run the relevant browser suite (`node --import tsx web/e2e/<suite>.ts`; set
`PW_CHROMIUM` to a Chromium binary if Playwright's own is missing). CI runs the list in
`docs/RELEASE-FLOW.md`; a change that breaks one must be fixed, never skipped. Territory UI:
`territory-menu` (keys, tile bar, achievements), `territory-challenges`, `territory-gestures`
(+ `-ios` on WebKit), and by hand `territory-smooth` for frame times. Commit after each green milestone.

## Code layout (read before adding a feature)

[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) maps the folders and the patterns to copy. In short:

- `web/src/main.ts` wires UI; `web/src/logic/` holds input, save, guidance; `web/src/player/` holds
  presentation; `web/src/ui/` draws board, cards, effects and sound; `web/src/online/` is the online
  layer (Territory is `world-view.ts`); `server/src/` is the API (Seeds economy in `server/src/seeds/`).
- New features go in their own module with a `mountX(hooks)` function; `main.ts` only wires them in.
  Don't add module-level state or feature code to `main.ts`.
- A feature's CSS lives with the feature, scoped under its root id. Beware `.x svg` selectors: the board
  nests small `<svg>` windows — use `> svg`.
- `channel.ts` prefixes every storage key per channel; prefer `browserStorage()` for new code.
- No runtime import cycles (`web/tests/import-cycles.test.ts`).
- V3 art is archived off this branch; do not reintroduce `design-v3` casually.

## Visual consistency

Read [`docs/VISUAL-CONVENTIONS.md`](docs/VISUAL-CONVENTIONS.md) before changing game UI. Reuse
`web/src/ui/instrument.css`, the dark-glass tokens and `INTERFACE_MOTION`. Keep focus indicators, 44px
touch targets and reduced-motion behaviour. New effects must finish: no idle render loops, extra blur
layers, subscriptions or dependencies for decoration. Phones first; check the iPhone engine (WebKit) for
anything touch-related.
