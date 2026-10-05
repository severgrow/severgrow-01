# AGENTS.md: working on Severor (for Codex and other coding agents)

Read this file, then `CODEX_START_HERE.md`, then `MAIN2_PROGRESS.md`. `CLAUDE.md` and
`docs/SPEC.md` also apply. The game's rules are defined by `docs/SPEC.md`: it is the source of truth.

The owner does not code. Report in short, plain English: what changed, what is verified, what is
not, and any decision needed (with your recommendation). Ask before anything that changes how the
game plays.

---

## 1. Branches: what you may touch

| Branch | What it is | You may |
| --- | --- | --- |
| `main` | **The live game and the owner's backup.** Deploys to the site root. | **Nothing.** Never commit, merge into, reset, rebase, force-push, open a PR into, or run a deploy for `main`. |
| `Main2.0` | **The active integration branch**: `main` + the test copy's work, being made release-ready. | Work here. Commit and push here. |
| `dev` | The test copy ("Lab version"), published at `/test/`. Quick experiments, built with the test channel. Other agents push to it. | Read and merge **from** it. Do not push to it unless the owner asks. |
| `claude/*` | Other agents' work branches. | Read only. |

- `Main2.0` was created from `main` at `4833bf0`. When this file was written, `dev` was at
  `fa674ff`, with 38 commits not on `main`. `main` had 1 commit not on `dev`: the merge commit
  `4833bf0`.
- Bring `dev` in with **merge commits** (`git merge --no-ff origin/dev`), never rebase or
  cherry-pick, and write the exact `dev` SHA in the commit message. `dev` keeps moving, so merge
  again later if needed.
- One logical change per commit, and commit after each green milestone. Clear messages, and no
  AI model names in commits.

## 2. Channels: Main, Test, Lab, DESIGN

The same code builds two **channels**. The build constant `__CHANNEL__` (set by
`web/vite.config.ts` from the `CHANNEL` environment variable) is exposed as `CHANNEL` / `IS_TEST`
in `web/src/channel.ts`.

| | Build command | Published at | What it shows |
| --- | --- | --- | --- |
| **Main (live)** | `npm run web:build` | site root, from `main` | The released game. No Lab, no experiments. |
| **Test** | `CHANNEL=test npm run web:build` | `/test/`, from `dev` | Everything in Main, plus the experiments on `docs/WAITLIST.md`, plus the Lab and DESIGN. |
| **Lab** | (test channel only) | menu: **Lab** | Custom boards (any shape, homes, rock/gold, reshuffle, turn limits), presets and share links, watch a bot-vs-bot game, the font toggle. Code: `web/src/lab-mode/`. Notes: `docs/LAB.md`. |
| **DESIGN** | (test channel only) | menu: **Design**, or `?design=1` | The same game drawn with an illustrated forest/volcano skin. Code: `web/src/ui/designBoard.ts`, `web/src/lab-mode/design/`, art in `web/public/design-v2/` (about 13 MB of PNG). |
| Material lab | either channel, `?lab=1` | | Every material in every palette. In the test channel it also has a font bake-off at the top. |

- **Test-only code must stay out of the live build.** Dynamic imports of test-only modules must
  sit inside the literal check `if (typeof __CHANNEL__ !== 'undefined' && __CHANNEL__ === 'test')`.
  Rollup does *not* fold `IS_TEST` across modules, so `if (IS_TEST) import(...)` still ships the
  chunk and its fonts and assets in the live build.
- After any change, build the live channel and check `web/dist/` for leaks: Lab chunks,
  `fontbake`, `design-v2`, test-only font files.
- On `Main2.0`, **promoting** a test feature to live means deliberately moving it out of these
  guards. A plain merge leaves the live build looking like `main`. Recommended approach: one
  `FEATURES` object next to `CHANNEL` in `channel.ts` that lists the promotable features. The test
  channel has them all on; live has only what the owner approved. Promote one feature per commit.
  Lab, Watch, DESIGN, the bake-off and the font toggle stay `IS_TEST` only.

## 3. Architecture

```
src/engine/       pure rules engine (TypeScript): state, legal actions, apply, scoring, sever,
                  strangle, rot, fruit, melds, deterministic PRNG, replay, versions
src/bots/         levels 1-9 (levels.ts), evaluation and tactics, bot versions
src/server-core/  pure functions for future win verification and rewards (tickets.ts). Not wired
                  to any server, no authentication. Account "tokens" are game rewards, not credentials.
src/sim/, src/cli/  simulations, ladder, calibration, CLI play and replay
src/strings.ts    player-facing words (OPPONENT_LABEL etc.). Players never see the word "bot".
tests/            vitest: engine, bots, determinism, golden games, properties, hygiene, server-core
web/              the browser game (Vite)
  src/main.ts       app wiring: screens, render loop, input, layout application
  src/logic/        UI logic: layout.ts (all layout maths), session, persist (saves), settings,
                    hints, interaction, themes and materials ...
  src/ui/           drawing: board.ts (SVG board), landmarks, effects, sound, cards
  src/lab-mode/     TEST CHANNEL ONLY: Lab panel, thumb layout settings, step guidance (guide.ts),
                    typography (fonts.ts), smart camera (camera.ts), their CSS (lab-css.ts),
                    board generator, font bake-off
  src/style.css     shared styles for both channels; test-only styles live in lab-mode/lab-css.ts
  e2e/              Playwright browser scripts (run with tsx)
  public/           static files, sw.js (offline worker, live channel only)
docs/             SPEC (rules), UX, ART (look and type), DECISIONS (log), WAITLIST (test features
                  waiting for release), LAB, RELEASES (channels), LAB-KNOWN-BREAKAGE, BOT-TACTICS, LADDER
```

**Engine vs UI boundary**
- `src/engine/` is pure and deterministic: no `Math.random`, no clocks (`Date`, `performance`), no
  timers, no I/O. `tests/hygiene-pure.test.ts` enforces this.
- The UI only reads engine state and sends actions. It never changes rules.
- Any change under `src/engine/`, `src/bots/` or `docs/SPEC.md` is a **gameplay change**.

## 4. What you must not do without asking the owner

- Change gameplay, rules, scoring, the deck, bot behaviour or balance, even "small" changes.
  This includes regenerating golden games or changing any engine or bot output.
- Decide which test features go live (see `MAIN2_PROGRESS.md` → DECISIONS NEEDED).
- Change `main`, push to `dev`, run the Pages deploy, or change GitHub workflows.
- Add tooling, dependencies, services or accounts. Anything needing an account, key or paid plan:
  stop and tell the owner exactly what to click.
- Weaken, skip or delete a test to get green. Never change a rule to make a test pass. If
  `docs/SPEC.md` is ambiguous, ask.

## 5. Look and feel

- **Goal:** a premium, high-budget indie strategy game. **Clarity first**: every state readable at
  a glance on a phone. Not a web app, a template, or fantasy or cartoon UI.
- **Typography (current direction): Besley + Commissioner.**
  - **Besley** (display, about a tenth of the type): the SEVEROR wordmark (800, uppercase, tight),
    page and sheet titles, the result title, "Pick a level".
  - **Commissioner** (UI): everything else.
  - **Severor Numerals**: Commissioner Bold with equal-width digits. Commissioner has no tabular
    figures, so this is used for every number, so numbers never shift as they change.
  - In the test channel this lives in `web/src/lab-mode/fonts.ts`, scoped under
    `<html class="test-typography-v2">`; files in `web/src/fonts/v2/` (SIL OFL, licences next to
    them).
  - Full roles, sizes and tokens: `docs/ART.md` → "Type in the test copy".
  - The live channel still uses Alegreya Sans until the owner approves promotion.
  - Older candidates (Fraunces + Plus Jakarta Sans, Bricolage + Figtree) are **superseded**.
    Their files in `web/src/fonts/bakeoff2/` are for the comparison page only.
- Colours, artwork, animations and board geometry: change only when asked.
- Gameplay sizes (cards, tiles, buttons, dock) are fixed numbers from `web/src/logic/layout.ts`.
  Don't resize components to fix text; tune the text.

## 6. Commands (Node >= 20.19, npm)

```bash
npm ci                                  # install exactly from the lockfile
npm run typecheck                       # engine + web TypeScript
npm test                                # vitest, the whole suite (about 6-7 minutes)
npx vitest run tests/engine             # one folder or file, while iterating
npm run check                           # typecheck + tests: required before saying "done"
npm run web:build                       # live channel  -> web/dist
CHANNEL=test npm run web:build          # test channel  -> web/dist (same folder: rebuild before switching)
npm run web:dev                         # dev server (live channel); CHANNEL=test npm run web:dev for test
npm run web:preview                     # serve the last build
npm run e2e                             # browser suite (needs a LIVE build in web/dist + Chromium); slow (10+ min)
npx tsx web/e2e/smoke.ts                # one browser script
```

- **Chromium for the browser scripts:** they use `playwright-core`.
  - If no browser is found, set `PW_CHROMIUM=/path/to/chrome`, or `PLAYWRIGHT_BROWSERS_PATH`.
    Do not run `npx playwright install` if a browser is already provided.
- **Browser scripts for test-channel features (after a test-channel build):** `web/e2e/lab-smoke.ts`,
  `camera-check.ts`, `thumb-check.ts`, `pro-check.ts`, `guidance-font-check.ts`,
  `typography-audit.ts`. They are not in `npm run e2e`.
  - They assume the test channel: storage keys `test:...`, Lab buttons.
  - Promoted features need live-channel versions.
  - New scripts need the init script `window.__name = (f) => f` (a tsx/esbuild quirk inside
    `page.evaluate`).
- If vitest fails to spawn workers (EPERM in a sandbox), try `npx vitest run --pool=forks`. Report
  it as an environment limit, never as a pass.

## 7. Responsive sizes to check

| Size | Why it matters |
| --- | --- |
| 360x640 | Smallest phone |
| 390x664 | iPhone with Safari bars shown |
| 390x844 | iPhone |
| 430x932 | Large phone |
| 768x1024 | Tablet (touch, not the thumb layout) |
| 1280x800, 1440x900, 1600x980, 1920x1080 | Desktop |

- Also check: Large text, left-hand mode, Reduce motion, every palette (Soil, Moss night, Ink),
  and hands of 5, 8 and 10+ cards.
- The phone **thumb layout** switches on only with a coarse pointer, in portrait, at ≤ 600px wide
  (`isPhonePortrait` in `lab-mode/thumb.ts`). Tablet and desktop use the older dock.
- Real-device checks (iPhone Safari with bars shown and hidden, Android Chrome) can't be done
  headless. List them as outstanding.

## 8. High-risk areas

- **Engine parity:** the Lab work changed shared engine code (BoardSpec, `reshuffleDiscard`, the
  turn clock). Classic games must play exactly as on `main`: same deals, terrain, legal moves, bot
  choices, scores, Sever, Strangle and endings. Prove it with a seed-by-seed comparison against a
  worktree of `main`.
- **Golden tests and config defaults:** see `docs/LAB-KNOWN-BREAKAGE.md`. Show the diff before
  regenerating anything.
- **Tap-again placement** (the test copy has no Confirm box): Sprout, Strengthen, Fruit, Bloom,
  discard, Undo, changing selection. Old e2e scripts and coach text still expect
  `#confirm-play` / "Confirm".
- **Camera and the map behind the cards:** in the test thumb layout, the board's SVG box runs under
  the dock (`--cam-under`). The camera, step plate, idle tip and edge arrows all work in the window
  above it. Card taps must never reach the map.
- **Step guidance** (`lab-mode/guide.ts`): reads the step from the game state. The plate avoids
  tiles, homes and gold badges, and re-places itself on resize.
- **Fonts:** subsets keep hinting (without it, small text spaces unevenly on phones). Tile digits
  are nudged down by 0.087em (measured). Watch for layout shift while fonts load.
- **Service worker:** live only; `/test/` is excluded. A test-channel fix reloads once when cached
  HTML names removed assets. Test the upgrade from `main`'s cached version, check there is no
  reload loop, and test offline launch.
- **Accessibility:** tile owner marks were removed in the test copy, so colour alone shows
  ownership. Check colour-blind readability and Low detail.

## 9. Saves and storage

- **Live keys** (unprefixed localStorage):
  - `severgrow.save.v7`: the game in progress (seed + action log, replayed on load)
  - `severgrow.settings.v1`, `severgrow.stats.v1`
  - small UI flags: `severgrow.seen`, `severgrow.splash`, `severgrow.coach.enabled`,
    `severgrow.ctools.seen`, `severgrow.smoother`, `severgrow.align`
- **The test channel prefixes every key with `test:`**: `web/src/channel.ts` patches
  `Storage.prototype` in the test build. Both channels share one web address, so this prefix is
  the only thing keeping test progress away from live progress. It is a separation, not a security
  boundary.
- **Test-only keys:** `severgrow-thumb`, `severgrow-guide`, `severgrow-font`,
  `severgrow-lab-active`, `severgrow-lab-presets`, `severgrow-design-play`. If a feature is
  promoted, its key becomes a new **unprefixed** live key. Missing keys need sensible defaults,
  and existing live saves and settings must still load. Test corrupt and obsolete saves, and
  blocked storage.
- **Never preview a live-channel build of `Main2.0` on the real site address**: it would read and
  write the owner's real saves. Use `localhost` (`web:dev` / `web:preview`).

## 10. Deployment cautions

- `.github/workflows/pages.yml` deploys **one** Pages bundle that builds `main` (site root) and
  `dev` (`/test/`) together. It runs on a push to `main`, after `test-copy.yml` (any push to
  `dev`), or by manual dispatch.
- **Pushing `Main2.0` deploys nothing.** Keep it that way: don't run the Pages workflow, and don't
  edit workflows on any branch.
- `.github/workflows/ci.yml` runs on every branch except `dev`, so each `Main2.0` push gets CI.
- Getting `Main2.0` onto the site is the owner's call, later, through a reviewed pull request into
  `main`.

## 11. Known issues (verify; this list may be out of date)

- On `dev`: `tests/engine/config.test.ts` (2 new config keys) and the 8 golden games fail, as
  documented in `docs/LAB-KNOWN-BREAKAGE.md`. Test-channel work ran only a few test files ("lite"
  mode), so the full suite on the merged code may show more.
- No unit tests were added for the Lab, camera, layout v4 or guidance work. Their coverage is the
  browser scripts in section 6.
- `web/README.md` still describes the obsolete Lite/Classic modes. Some comments promise
  old-version verification that `docs/SPEC.md` says was retired.
- In the test copy, the slim header moves scores, turn and turns-left into the pause menu, on
  desktop too. Whether that ships is an open decision.
- Test-copy step plate: on very busy small boards it can partly cover rock hexes, and on tall
  phones there is spare height above the board.
- The first-time "Fruit cards" coach tip covers part of the board at the start of a game.
- DESIGN art: white strips on some volcano bases, soft upscaling, about 13 MB of PNG (should be
  WebP).

## 12. Discipline

- Keep `MAIN2_PROGRESS.md` current after every milestone: DONE, IN PROGRESS, DECISIONS NEEDED,
  KNOWN ISSUES, TEST RESULTS, NOT YET VERIFIED.
- Mark `docs/WAITLIST.md` items as they land in `Main2.0`, and note dropped ones. Add notable
  choices to `docs/DECISIONS.md`.
- Never say "done" without `npm run check` passing, and the relevant browser scripts passing on
  the channel you changed. Say which ones you ran.
- Report what failed with its output. Never call an environment limit a pass.
