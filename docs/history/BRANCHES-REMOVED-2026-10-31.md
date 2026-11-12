# Removed branches (2026-10-31)

Every branch below was **fully merged** into `futa0.5-online` (its last commit is in that history),
so no work was lost. The ref was deleted to keep the branch list readable. To bring one back:

```sh
git push origin <commit>:refs/heads/<branch>
```

| Branch | Last commit | Date | Subject |
| --- | --- | --- | --- |
| `bloom-no-room` | `f5784a0d5f0014daa8e924d999475846ec16cb15` | 2026-10-27 | fix(copy): a set is the same number in ANY suits, not different suits |
| `claude/charming-ride-1bqvog` | `8c33ff019eb107d1c228cbe30cdd2e57c1b26047` | 2026-10-24 | Seeds words beside the currency's name; lessons-3 reads the quiet draw |
| `claude/focused-fermat-kq2zyf` | `4a803fb180b8ffa83774d56b7419f3d3a7c632ef` | 2026-10-29 | Home tile: default skin only (the procedural growth tree is switched off) |
| `claude/typescript-vitest-setup-ximk44` | `cc96b2c19da508cec80d5d95aaf887398e7d4ac8` | 2026-10-04 | Release channels: the live game (main, site root) and the test copy (dev, /test/) |
| `feature/futasaku-match-chat` | `e7e3567022e077ca79ecce7a792f4dd0ea9b557c` | 2026-10-25 | Polish chat recovery and actions; reuse live opponent status |
| `feature/pregame-card-ritual` | `bf9c0557e94ec8d7d5438cd552f9c39d9d16d37d` | 2026-10-22 | feat(ritual): the pre-game card ritual |
| `fix/reward-and-visual-polish` | `e64ad26d949943b84e452ce937257331c88dc2a4` | 2026-10-24 | Avoid waiting for an absent cancel control after automatic moves |
| `futa0.5-backend-foundation` | `52dcb21e1eaa83c871b59a33b27f025c35f540ba` | 2026-10-12 | Backend: HTTP edge-case tests and a portable RLS revoke |
| `futa0.5-lessons-polish` | `16a0f22cb62071409d986fcc77802462c2e9747d` | 2026-10-19 | docs(lessons): the top row and the window under it |
| `futa0.5-levels-31-70` | `5daa8eaa8827f3fd690f865412fc7461ffa32043` | 2026-10-19 | test(e2e): keep the tutorial suite working now its menu entry is hidden |
| `futa0.5-live` | `de0a31441d1502afc0ce53fd8530b292f722a64a` | 2026-10-14 | Merge remote-tracking branch 'origin/futa0.5-online' into futa0.5-live |
| `futa0.5-menu-trim` | `431a3966c7380cd65ffd128ae81ec512ff750b92` | 2026-10-19 | test(e2e): wait for boot before the hidden Continue fixture click |
| `futa0.5-onboarding-3` | `f68ef974f264ee7bb18a402fecc8b9352bde7381` | 2026-10-20 | Merge commit 'acfa8df' into futa0.5-feel-int |
| `futa0.5-root-feel-integration` | `2fa86328527ba5593711a0ca0f88054cda373201` | 2026-10-20 | Merge /3 lesson feel into Futasaku 0.5 online |
| `futa0.5-supabase-verify` | `12c38660cb3fd45a0246bfb99775178ecf931378` | 2026-10-12 | Record verified Supabase database results and load .env for local DB tests. |
| `futa0.5-tutorial` | `555067bb7320b71a4fd0302ffdb95d7922e76f4e` | 2026-10-13 | Tutorial/menu: one "Tutorial" entry, no lesson list, and the moves reference moves into Match Intel |
| `futa0.5-tutorial-fix` | `6776ac24ed285e9a2d789350bcee311b6b88c9e6` | 2026-10-12 | Tutorial: tap anywhere for Next, Skip Bloom with a rewind, plainer Bloom words, KO |
| `futa0.5-world-seeds` | `812e2fcb63804030f95f8d24121c5258375662aa` | 2026-10-16 | build(edge): sync bundle with latest campaign source |
| `futa04-display-glow` | `e1ee9c7c63555b959e3fc1484567ee2aa8745cba` | 2026-10-13 | Correct two measured ranges in DISPLAY-GLOW.md |
| `futa05-ci-gate-2026-10-20` | `dfe8383358f8f58e89d51d188f2d3bf30a60fab3` | 2026-10-20 | fix(lessons): the longest explanation keeps four lines on 320 px phones |
| `futa05-logo-mask-load-2026-10-20` | `246ba20c6c0d139f6771f36b9443164e2116be4f` | 2026-10-20 | Trim browser branding payload with exact silhouettes |
| `futa05-polish-2026-10-20b` | `dd99849a9e78b091df184811ef21167c19d6bac3` | 2026-10-20 | feat(admin): Google sign-in on /admin, an All players screen, a calmer layout |
| `futa05-smooth-2026-10-20` | `1b519e589ad42431f1b74ecb04c1e7ea5a254f48` | 2026-10-20 | docs(feel): record the smoothness pass and the chain reaction |
| `online-fixes` | `490fc8cd95b53b9df7dc5ebbbe028a53d5378c52` | 2026-10-21 | Merge commit 'e618c6a' into online-fixes |
| `polish-2-perf-save` | `0b841b20e7e39a6d997372fd72007bc631d66064` | 2026-10-21 | perf(world): a pan writes the view, it does not re-measure it |
| `polish-3` | `adc7b5e0b48c557bb7b16809e57b97017721b2af` | 2026-10-21 | Merge commit 'fcc694d' into polish-3 |
| `polish/futasaku-replay-film-grain-20261030` | `efb47f7bf740cedc0b25e7e4c3cb126eb833472d` | 2026-10-30 | polish(replay): keep cached moving frames evenly grained |
| `refactor/futasaku-code-hygiene` | `8d4941230e6f9221c86a9c00333eb5ff0d94d1b9` | 2026-10-27 | docs(hygiene): the skin code is kept — skins return in the near future |
| `replay-polish` | `c1c4c07b37f890b4109a70cd4635ccf8e5a795d7` | 2026-10-26 | feat(replay): moment captions, the winner's moment, and a share image that matches the board |
| `territory-challenges` | `0e8e5a20fd8add194250e5dcb3336aceb7b13764` | 2026-10-22 | Merge the live line into territory-challenges: one server deploy carries everything |
| `territory-challenges-ready` | `972c44a8d0c795c4488dd8b4ce69527dcef26f0d` | 2026-10-24 | feat(territory): the challenge loop feels like the rest of the instrument |
| `territory-prep` | `b0495d2a5df40d3d9cafab1d69a1a595362ae2e8` | 2026-10-26 | chore: the plate's entrance test allows options; rebuild the edge bundle |
| `visual-polish` | `59ee8ebdb33e5dda057a5513701bf4e616e8e2c5` | 2026-10-27 | polish: five small visual fixes for legibility and consistency |

Kept on purpose: the release lines (`futa0.5-online`, `live`, `Main2.0`, `Futasaku0.3`, `futa0.4`, `main`, `dev`),
the snapshots (`archive/*`, `futasaku03-before-*`), `daily-puzzle`, and every branch that is NOT merged.
