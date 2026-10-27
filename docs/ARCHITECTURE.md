# Architecture — where things live and how to add to them

A short map for anyone (human or agent) adding to Futasaku. Rules of play are in `docs/SPEC.md`;
branch and deploy rules are in `AGENTS.md` and `CLAUDE.md`. This file is about **code layout**.
Measured on `futa0.5-online` at `c1c4c07` (2026-10-26).

## The map

| Layer | Folder | What belongs there |
| --- | --- | --- |
| **Engine** | `src/engine/` | The rules: legal actions, `apply`, score, results, Sever/Strangle, deal. Pure and deterministic — no `Math.random`, clocks, DOM or I/O. Anything a player can be rewarded or punished for is decided here (see `docs/ENGINE-UI-BOUNDARY.md`). |
| Bots, campaign | `src/bots/`, `src/campaign/` | Computer opponents; the campaign's levels and openings. |
| Shared server logic | `src/server-core/`, `server/src/` | Match service, storage adapters, the duel client the web app also imports (`server/src/client.ts`). |
| Edge deploy | `supabase/` | The bundled Edge function (`supabase/functions/duel/bundle.ts` is generated — rebuild, don't hand-edit). |
| Tools | `src/cli/`, `src/sim/`, `src/playtest/` | Command-line tools and simulations (npm scripts). Not part of the web app. |
| **App wiring** | `web/src/main.ts` | Boots the page, owns the match's session state, wires screens and features together. See "main.ts" below. |
| Release channel | `web/src/channel.ts` | Which build this is (`futa04`, `futa05`, `futa-test`, `live`, `test`), its feature flags, and the storage prefix (see "Storage"). |
| App logic | `web/src/logic/` | Non-visual app behaviour: session, input, saves, settings, guidance, layout maths, motion values (`PINNED` in `motion.ts`). |
| **Presentation** | `web/src/ui/` | Drawing the board, cards, effects, sound. |
| | `web/src/player/` | The Futa04 product look: cockpit, glass surfaces, information, cards, branding. |
| Features | `web/src/replay/`, `web/src/online/` (+ `chat/`, `live/`), `web/src/accounts/`, `web/src/lessons/`, `web/src/feedback/`, `web/src/lab-mode/` | Each is a self-contained feature with its own state, markup and styles. |
| Player-facing words | `src/strings.ts` | Every sentence a player reads. Change copy here, not inline. |

## Adding a feature: the mount pattern

Most features already follow one shape — copy it:

```ts
// web/src/<feature>/mount.ts
export const mountThing = (hooks: { onDone: () => void; reduceMotion: () => boolean }) => {
  // inject this feature's styles once, build its markup, own its state
  return { open, close, isOpen };          // the handle main.ts keeps
};
```

`main.ts` imports `mountThing`, calls it once (lazily if the feature is rarely used), and passes
**callbacks** for whatever it needs from the app. The feature never imports `main.ts`, so there is
no cycle and no hidden coupling. Good examples: `replay/player.ts` (`mountReplay`),
`online/chat/view.ts` (`mountMatchChat`), `online/live/mount.ts` (`mountLive`),
`logic/tutorial-gate.ts` (`mountTutorialGate`).

Put new code in the feature's module, not in `main.ts`. Add to `main.ts` only the lines that wire
the feature in.

## main.ts

`main.ts` is ~10,800 lines with ~330 top-level functions and ~200 module-level `let` variables that
those functions share. Measured: almost all of its code reaches that shared state, directly or
through helpers, so it cannot be split by moving code around — each piece would take state with it.
It is also the most-edited file (100+ commits in the week to 2026-10-26), so a split collides with
parallel work.

So, for now:

- **Don't add new module-level state to `main.ts`.** Keep a feature's state inside its own module.
- **Don't grow `main.ts` with feature code** — use the mount pattern above.
- The plan to split it safely is in `docs/HYGIENE-PASS-2026-10-26.md` ("Deferred").

## Styles

- `web/src/style.css` holds the global and legacy styles; `fonts-futa04.css` the product type.
- A feature's styles live **with the feature**, as a CSS string the feature injects once when it
  mounts (e.g. `replay/replay-css.ts`, `online/online-css.ts`, `player/player-css.ts`). Scope every
  rule under the feature's own root id (`#replay …`) so it cannot leak to other screens.
- The order styles are injected decides which rule wins a tie. Don't move rules between files, or
  merge two rules for the same selector, without checking the result on screen.
- Beware descendant selectors on SVG: the board nests small `<svg>` windows (strength stones, gold
  frames) inside its own `<svg>`. `.board svg { width: 100% }` reaches those too and breaks them —
  target the outer one with `> svg` (this exact bug shipped in the replay on 2026-10-26).
- Feel and motion values that must not drift are in `PINNED` (`web/src/logic/motion.ts`).

## Storage

`channel.ts` patches `Storage.prototype` when it loads: every `getItem`/`setItem`/`removeItem` on
`localStorage` and `sessionStorage` gets the channel's prefix (`futa05:`, `main2:`, `futa-test:` …).
That is how the live game, its previews and test copies keep separate saves on one domain — every
player's progress is stored under those names.

- Keep save keys as they are (`severgrow.*` and the rest); the prefix is added for you.
- `channel.ts` must be loaded **once**: a second copy would prefix twice and "lose" every save.
- Only the three item methods are prefixed; `key()`, `length` and `clear()` see raw names. Nothing
  uses them today — don't start without reading the contract tests.
- For new code, prefer the `KeyValue` interface (`browserStorage()` from `server/src/client.ts`) over
  calling `localStorage` directly; it makes a later move away from the global patch possible.
- The full contract is pinned by `web/tests/channel-policy.test.ts` and
  `web/tests/storage-prefix-contract.test.ts`.

## Working in parallel

- One branch per piece of work, ideally in its own `git worktree`; never work in another agent's
  checkout or discard its uncommitted changes.
- Keep diffs small and focused; avoid reformatting or renaming as a side effect.
- No runtime import cycles: `web/tests/import-cycles.test.ts` fails if two modules import each
  other (type-only imports are fine).
- `main.ts`, `src/strings.ts` and `style.css` are the shared hot spots — touch them as little as
  possible and mention it in your commit message.

## Tests to run

- Always: `npm run check` (typecheck + every unit test).
- Product build: `CHANNEL=futa04 npm run web:build && node scripts/check-channel-assets.mjs`.
- UI changes: the matching `web/e2e/*.ts` browser suite(s). CI runs the browser matrix in
  `.github/workflows/ci.yml` (including `lessons-3`, `cut-severe`, `futa04-motion`); the live deploy
  waits for it.
- Engine changes: `tests/engine/`, `tests/determinism/` and the bot/campaign simulations in `tests/`
  must give identical results for the same seeds — never regenerate an expected result to make a
  test pass.
