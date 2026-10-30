# Release flow: futasaku.com/test, then promote

Owner decision, 2026-10-29: "let's do futasaku.com/test and use promote word".

| Address | Shows | Moves when |
| --- | --- | --- |
| **futasaku.com/test/** | the head of `futa0.5-online` | every push to `futa0.5-online`, once CI passed on it |
| **futasaku.com** (live) | the `live` branch | only when someone **promotes** |

Both are rebuilt by one workflow, `.github/workflows/futasaku04-preview.yml` ("Publish futasaku.com
(live + /test)"), on every push to either branch, so a push to one never moves the other.

## The words

- **"push"** (to `futa0.5-online`): the change goes to **/test/** in about 20 minutes (CI first; a red
  CI publishes nothing). The live site does not change.
- **"promote"**: what /test/ shows goes **live**. Run one of:
  - `npm run promote` — from any terminal or agent with push access (Claude, Codex, Cursor, DeepSeek…);
  - GitHub → Actions → "Publish futasaku.com (live + /test)" → **Run workflow** → type `promote`
    (works from a phone).

  Either way it promotes the exact commit /test/ is serving (read from `/test/release.json`), never a
  newer push nobody has looked at. The site updates in about 20 minutes.
- **"status"**: `npm run promote -- --status` shows what is live, what is on /test/, and whether a push is
  still on its way.
- **"roll back"**: `npm run promote -- <sha>` puts an older tested commit back live.

Agents: only promote when the owner says so. Pushing to `futa0.5-online` is the normal end of a task
(it reaches /test/ only); promoting is the owner's call.

## What /test/ is

The same game as the root (same channel, same API and database, same saves and account, so your own
Territory land is there), with a small **TEST · <sha>** badge, `noindex`, `TEST ·` in the tab title, and
its own service-worker cache (`futa05test-`), so it can never purge the live game's cache.

**It shares the live server.** /test/ is the web page only. Server code (`server/`, the Supabase `duel`
Edge Function) and database migrations still roll out on their own (docs/DEPLOY-ONLINE.md). A page
change that needs a new endpoint must cope with the old server until that rollout (see Achievements in
docs/WORLD-MAP.md: the key stays hidden until the endpoint answers).

## How it is wired

- `scripts/compose-test-route.mjs` places the test build at /test/ (badge, noindex, release.json); it runs
  last, after the parity guard. Test: `tests/compose-test-route.test.ts`.
- `scripts/check-pages-parity-root.mjs` no longer freezes /test/ (it used to hold the retired dev copy of
  Main); Main (/firststep/) and /test2/ are still byte-checked.
- `scripts/promote.mjs` moves the `live` branch: a fast-forward for a promote, `--force-with-lease` for a
  rollback. It refuses any commit that is not on `futa0.5-online`.
- The CI gate waits for CI on BOTH commits. `live` is excluded from `ci.yml` (it only ever points at a
  commit that already passed there).
- Only CI-tested commits can go live: a commit that was in the middle of a multi-commit push never had
  its own CI run, so the gate would refuse it. Promote what /test/ shows, or a previous /test/ commit.

## Checks that run on a push (and what was removed, 2026-10-29)

- `ci.yml` `check`: typecheck + every unit test + the futa04 and futa-test builds.
- `ci.yml` `browser`: futa04-critical, futa04-information, futa04-tutorial-intel, futa04-tutorial-lock,
  futa04-motion, cut-severe, lessons-3, territory-menu, territory-challenges,
  territory-gestures, and **territory-gestures-ios on WebKit** (the iPhone engine).
- `extra-regressions.yml`: admin-dashboard, online-stale-token-recovery, online-soak-teardown,
  settings-visual.

Removed as redundant: the seven suites that tested the old `live` (Main) channel this branch never
ships (smoke, painting, overhaul, monkey, emptyturn, fruitcards, propass), the `futa05-preview-build`
workflow (it re-checked and re-built the same commit and nobody used its artifact), and the full
`npm run check` of the locked `futa0.4` branch inside every deploy (~9 minutes, re-testing an unchanged
commit). Stale browser suites written for removed UI were deleted (territory-growth,
territory-resilience, territory-challenge-tap, world-pan); timing probes that are too noisy to gate a
deploy stay as hand-run tools (territory-fog, territory-keys, territory-prep, territory-smooth).
