# Main2.0 progress

The integration of the test copy (`dev`) into a release candidate. `main` stays untouched. Update
this file after every milestone. Newest entries go at the top of each section.

Branch bases when this file was created (2026-10-05):

| Branch | Commit |
| --- | --- |
| `main` | `4833bf0` |
| `dev` | `fa674ff`, 38 commits ahead of `main`; `main` has 1 commit `dev` lacks (`4833bf0`) |
| `Main2.0` | created from `main` at `4833bf0`; `dev` not merged yet |

## DONE

- 2026-10-05: `Main2.0` created from `main` (`4833bf0`). Added `AGENTS.md`,
  `CODEX_START_HERE.md` and this file. Baseline verified (see TEST RESULTS).

## IN PROGRESS

Work top to bottom. Items marked *(after decisions)* wait for DECISIONS NEEDED.

1. **Merge `dev` into `Main2.0`**
   - `git merge --no-ff origin/dev`, with the pinned SHA in the message.
   - Resolve conflicts keeping `main`'s fixes.
   - Build both channels.
   - Confirm the live build still matches `main`: no Lab, DESIGN, bake-off or test fonts in
     `web/dist`.
2. **Engine parity harness**
   - Compare `main` (worktree at `4833bf0`) with `Main2.0` on the Classic setup.
   - Many seeds; levels 1-9 bot vs bot.
   - Hash state + events after every action.
   - Expected: identical. Report any difference before changing anything.
3. **Known breakage** (`docs/LAB-KNOWN-BREAKAGE.md`)
   - Add `board: null` and `reshuffleDiscard: false` to the expected defaults, and to SPEC.
   - Diff the 8 golden games; regenerate only if the config keys are the only difference.
   - Show the owner the diff.
4. **Full suite and browser suite on the merged code**
   - `npm run check`, then `npm run e2e` on the live build.
   - Then the test-channel scripts (`lab-smoke`, `camera-check`, `thumb-check`, `pro-check`,
     `guidance-font-check`, `typography-audit`).
   - Fix e2e scripts that expect the Confirm box (`#confirm-play`), without weakening them.
5. **Feature switchboard** *(after decisions)*
   - One `FEATURES` object next to `CHANNEL` in `web/src/channel.ts`.
   - Test channel: all on. Live: approved items only.
6. **Promote approved features one per commit** *(after decisions)*
   - Each with live-channel browser checks.
   - Check `web/dist` for leaks after each.
7. **Saves and settings**
   - Resume real `main` saves in the candidate; reload in each phase.
   - Test corrupt/obsolete saves and blocked storage.
   - Defaults for any newly promoted settings keys.
8. **Service worker:** upgrade from `main`'s cached build, the reload-once fix (no loop), offline
   launch.
9. **Docs:** fix `web/README.md` (obsolete Lite/Classic), stale verification comments, and SPEC for
   the new config keys.

## DECISIONS NEEDED

Ask the owner in one message, with a recommendation each. Don't decide these yourself.

| # | Question | Notes / suggested default |
| --- | --- | --- |
| 1 | Which `docs/WAITLIST.md` items go live? | 14 entries, newest first. Superseded chains: Typography v2 replaces both earlier font entries; "Step plate redesign" replaces the first step-guidance look; "Pro phone layout" builds on Thumb layout v3; "Zoomed map behind the cards" needs the Camera item. |
| 2 | Typography: Besley + Commissioner in live? | The current direction. Live still uses Alegreya Sans. |
| 3 | Slim header in live (scores, turn and turns-left move into the pause menu)? | Big UX change, desktop too. Option: phones only. |
| 4 | Hide the replay button and remove the weak-spot icons in live? | Test copy: both done. |
| 5 | Smart camera in live? | Only matters on Lab maps (Classic always fits). Could stay test-only. |
| 6 | Thumb layout on by default for phones? Step guidance default Full / Subtle / Off? | Test copy: on, Full. |
| 7 | Tap-again placement (no Confirm box) and no owner marks on tiles in live? | Both change interaction and accessibility; test them carefully. |
| 8 | Lab, Watch a game, DESIGN: keep test-only? | Recommend keeping all three test-only. DESIGN is about 13 MB of PNG. |
| 9 | How will the owner preview `Main2.0`? | Pushes don't deploy. Options: local preview only, or a separate preview path (needs a workflow change, so the owner decides). |

## KNOWN ISSUES

- `dev`: `tests/engine/config.test.ts` defaults (2 new keys) and 8 golden games fail
  (`docs/LAB-KNOWN-BREAKAGE.md`). Test-channel work ran only a few test files, so the merged full
  suite may show more.
- No unit tests cover the Lab, camera, layout v4 or guidance work; only browser scripts do.
- `npm run e2e` doesn't include the test-channel scripts, and some old scripts expect the Confirm
  box.
- `web/README.md` describes obsolete Lite/Classic modes. Some comments promise old-version
  verification that SPEC retired.
- Test copy UI:
  - the step plate can partly cover rock hexes on crowded small boards;
  - spare height above the board on tall phones;
  - the first "Fruit cards" coach tip covers part of the board;
  - the slim header also applies on desktop.
- DESIGN art: white strips on some volcano bases, soft upscaling, about 13 MB of PNG.
- `src/server-core` is pure functions only: no server, no authentication, unsigned tickets. Not in
  scope unless asked.

## TEST RESULTS

| Date | Commit | Check | Result |
| --- | --- | --- | --- |
| 2026-10-05 | `4833bf0` (Main2.0 base = main) | `npm ci` | OK (Node 22.22, npm 10.9) |
| 2026-10-05 | `4833bf0` | `npm run typecheck` | Pass |
| 2026-10-05 | `4833bf0` | `npm test` | Pass: 106 files, 1128 tests + 1 expected fail, about 6.5 min |
| 2026-10-05 | `4833bf0` | `npm run web:build` / `CHANNEL=test npm run web:build` | Pass / Pass |
| 2026-10-05 | `4833bf0` | `npx tsx web/e2e/smoke.ts` (live build) | Pass: 4/4, about 10 min |
| 2026-10-05 | `dev` `fa674ff` | test-channel scripts (`lab-smoke`, `pro-check`, `guidance-font-check`, `typography-audit`, `camera-check`) | Pass on `dev` (run by the test-copy work; not yet on `Main2.0`) |

## NOT YET VERIFIED

- Anything on the merged code: `dev` is not merged into `Main2.0` yet.
- Classic engine parity between `main` and the merged code.
- The full `npm run e2e` on the merged live build.
- Old `main` saves resuming in the candidate; blocked or corrupt storage.
- Service worker upgrade from `main`'s cached build; offline launch.
- Real devices: iPhone Safari (bars shown/hidden), Android Chrome; rotation and safe areas.
- Accessibility without owner marks (colour-blind), keyboard and focus on the new controls.
- Font loading on a slow connection (layout shift, fallback metrics).
