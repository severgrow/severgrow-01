# Working on Futasaku

The guide for every coding agent (Claude, Codex, others). The owner does not code: report in short,
plain English, say which checks actually ran and passed, and say what is still uncertain.

Read first: this file, then `docs/SPEC.md` (the rules: the source of truth), then `README.md`.

## Branches

| Branch | What it is | Published at |
| --- | --- | --- |
| `futa0.4` | **The game.** All normal work goes here. | `…/futa0.4/` |
| `futa-test` | The test copy for quick `TEST:` experiments (below). | `…/futa-test/` |
| `main` | The old game (Severor). Frozen backup: never change it. | site root |
| `dev`, `Main2.0`, `Futasaku0.3`, `futa0.3`, `archive/*` | History. Never change them. | (`dev` at `/test/`, `Main2.0` at `/test2/`) |

- Never push, merge, rebase or reset `main`, `dev`, `Main2.0`, `Futasaku0.3`, `futa0.3` or
  `archive/*`. A push to `main`, `dev` or `Main2.0` runs the old deploy, which republishes the site
  **without** the Futasaku routes.
- Never force-push. Never discard someone else's uncommitted work.
- A push to `futa0.4` runs the full checks and then publishes `…/futa0.4/`. A push to `futa-test`
  publishes `…/futa-test/` after a build. Both rebuild the old routes unchanged.

## Normal tasks (strict flow)

On `futa0.4`:

1. If the task touches the rules: read `docs/SPEC.md`. If the spec is unclear, **stop and ask** the
   owner. Never change a rule, the deck, scoring, balance, replay or `docs/SPEC.md` without the
   owner's direction.
2. Write the tests first. Never weaken a test or regenerate golden games to make a test pass.
3. A rule change gets a new rules version in `src/engine/versions.ts` (older versions keep
   replaying) and an update to `docs/SPEC.md`.
4. Run the checks (below). Commit each green milestone with a clear message, then push `futa0.4`.

## `TEST:` tasks (quick flow)

A task that starts with "TEST:" is a quick experiment in the test copy.

- Work only on `futa-test`; commit straight to it; push it. Never touch `futa0.4` in a `TEST:` task.
- Do every step in order without stopping to ask. If something is unclear, pick the quickest
  sensible option, write one line about it in `docs/DECISIONS.md`, and keep going.
- Skip unit tests, simulations, ladders, screenshot rounds and golden regeneration; do not run the
  full suite or `npm run check`.
- The only requirements: `npm run web:build` succeeds, and the quick browser check passes
  (`node --import tsx web/e2e/quick-smoke.ts`: the page loads with no console errors and a normal
  game against the opponent plays).
- Tests that break stay broken: list them in `docs/TEST-KNOWN-BREAKAGE.md`.
- Add every change to `docs/WAITLIST.md`: its name, date, commit, "in test only", and what must be
  checked before it is locked in.
- The test copy keeps its own saves and settings (storage prefix `futatest:`) and shows "TEST" in
  the browser tab, so it never mixes with the real game.

### "Lock it in"

1. Show the owner the waitlist and ask which items to include.
2. Bring only those items onto `futa0.4` (cherry-pick, or redo them cleanly), under the strict flow:
   tests first, the full `npm run check`, fix every failure (including those in
   `docs/TEST-KNOWN-BREAKAGE.md`), regenerate goldens only where a rule changed on purpose.
3. Ask the owner for the go-ahead before pushing `futa0.4`.
4. Tick each item off the waitlist when it lands, then merge `futa0.4` into `futa-test` so the
   test copy starts from the real game again.

## Checks

```sh
npm ci
npm run check                                   # strict types + every unit test (about 8-9 minutes)
npm run web:build                               # the game, into web/dist
node scripts/check-build-assets.mjs             # nothing archived leaks into the build
PW_CHROMIUM=/usr/bin/chromium node --import tsx web/e2e/futa04-critical.ts
```

For layout changes, check 360×640, 390×664, 390×844, 430×932, 768×1024, 1280×800, 1440×900,
1600×980 and 1920×1080, plus Reduce motion, large text and left-hand mode. Other browser checks live in
`web/e2e/` (`futa04-*.ts`, `mega-bomb.ts`, `monkey.ts`). Headless checks do not replace a real iPhone
and Android phone.

## Code map and boundaries

| Area | Home |
| --- | --- |
| Rules, state, replay (pure, deterministic) | `src/engine/` |
| The opponent's levels | `src/bots/` |
| Player words (one place) | `src/strings.ts` |
| Simulations, ladder, terminal tools | `src/sim/`, `src/cli/` |
| The page: wiring | `web/src/main.ts` |
| Input, layout, saves, settings, tutorial | `web/src/logic/` |
| Cockpit, help, cards, camera, starter draw | `web/src/player/` |
| Board drawing, effects, sound | `web/src/ui/` |
| Tests | `tests/` (engine, bots), `web/tests/` (page logic), `web/e2e/` (browser) |

- `src/engine/` stays pure: no `Math.random`, clocks, timers, I/O or browser APIs.
- Player-facing text never says "bot" (it says "opponent"), and uses the player words in
  `docs/SPEC.md` section 0: Grow, Bomb, Blast, Bloom, Strengthen, home.
- Some code names are older on purpose: `Sprout` (Grow), `PlayFruit`/`FRUIT` (Bomb), `MegaBomb`
  (Blast), `root` (home), the `severgrow.*` save keys, the `main2:`/`futa04:` storage prefixes, the
  `severor-ready` boot event and the `__severgrow` test hook. They protect saves, replays and tests.
  Do not rename them casually.
- Skins and new art come later: keep the board art in `web/src/ui/`; the old V3 skin is archived on
  `archive/futa0.4-before-cleanup`.

## Owner rules

- Never commit secrets. Anything that needs an account, a key or a paid plan: stop and tell the owner
  exactly what to click.
- If a permission is blocked, tell the owner; don't work around it.
- No AI model names in commits, code or docs.
- Keep old screenshots and generated output out of commits.
