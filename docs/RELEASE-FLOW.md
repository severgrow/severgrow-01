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

## Timing trap: promote after the publish run has read the branches (2026-11-01)

The publish run reads the `live` and `futa0.5-online` heads in its first job (`resolve`), seconds
after a push. Promoting a commit straight after pushing it is usually too late for that run: it
publishes the NEW /test/ and the OLD live, and the run the `live` move starts is then rejected by
the environment policy below. Observed 2026-11-01 (runs 41331774012 and 41331828139). Fix: any later
push to `futa0.5-online` (or Run workflow → promote on it) publishes the already-moved `live`.

## Two traps found on 2026-11-12 (releasing the 0.84 polish + end screen)

**`npm run promote` is not usable in every checkout on a developer machine.** `scripts/promote.mjs`
hardcodes the remote `origin`. Several local worktrees on this machine have `origin` pointed at a
LOCAL directory (e.g. `/Users/patryk/sg-lesson-preview`), not GitHub, so the script reads the wrong
refs, prints wrong live/test SHAs, and then tries to push `live` into that folder. Release from a
checkout whose remote is GitHub, or do the two steps by hand with the GitHub remote:

```sh
git push gh <sha>:refs/heads/futa0.5-online    # reaches /test/ once CI on that commit is green
git push gh <sha>:refs/heads/live             # selects it for the root (fast-forward, never forced)
```

`git ls-remote <remote> live` is the cheap check before trusting either step.

**`extra-regressions` never runs on a feature branch.** Its triggers are `futa0.5-online`,
`fix/**`, `release/**` and a `pull_request` path filter for `admin/**` and `server/**`. A whole
suite (`online-opponent-discard`) was red on a feature branch at desk size and nobody could see it;
it surfaced the first time that work reached `futa0.5-online`. It does not gate the publish — the
publish's `ci-gate` reads `ci.yml` only for the pushed SHA — so it ships red and is discovered
later. Run the affected `extra-regressions` suite by hand before asking for a merge of a layout
change.

**A moved branch ref is not a deployed site.** The root sat three builds stale for hours on
2026-11-12 while `live` pointed at the right commit: the publication had failed at the environment
step and nothing reported it to a human. Always confirm the deployed number, not the ref:

```sh
curl -fsSL -H 'Cache-Control: no-cache' https://futasaku.com/BUILD_SHA
curl -fsSL -H 'Cache-Control: no-cache' https://futasaku.com/test/BUILD_SHA
```

## Production environment branch policy

Observed 31 October 2026: the `github-pages` environment accepts publications triggered from
`futa0.5-online`, but rejects a deploy job triggered directly from `live`. The root build and CI
can both pass before that final environment rejection. A moved `live` ref alone is therefore not
proof that the site deployed.

Use the documented manual **Run workflow → promote** on `futa0.5-online` for an approved-source
promotion. The publisher reads the `live` and `futa0.5-online` heads independently of the trigger:
a publication from the approved release branch also publishes an already-selected `live` SHA.
An ordinary release-branch update uses that same publication path. All exact-SHA CI gates, build
checks and the GitHub environment policy remain active. Leave `main` on its separate product line.

The combined `baa26bf1` release passed CI and staging. Its direct-live attempt
[41223279871](https://github.com/severgrow/severgrow-01/actions/runs/41223279871) passed resolve,
CI and build, then the environment rejected its trigger branch. The `live` ref already selects the
tested release; the approved release-branch publisher can complete publication without changing
that selection or the environment's allowed branches.

## What /test/ is

The same `futa05` channel, with a small **TEST · <sha>** badge, `noindex`, `TEST ·` in the tab title,
and its own service-worker cache (`futa05test-`), so it can never purge the live game's cache.

**3 November experiments:** `/test/` has separate `futa05-test:` local/session storage. It never
migrates or deletes live `futa05:` or `/3/`'s `futa05-3:` saves. Experimental campaign results do
not upload account progress or reward proofs. Normal online entries still use the same backend;
Sphere Test is a separate mock surface without economy/ownership calls. See
[FIRST-EXPERIENCE-TEST.md](FIRST-EXPERIENCE-TEST.md) and [SPHERE-TEST.md](history/SPHERE-TEST.md).
Do not promote these experiments.

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

## Checks that run on a push (and what was removed, 2026-10-29; preview speedup 2026-11-07)

- `ci.yml` `check`: typecheck + every unit test + the futa04 and futa-test builds.
- `ci.yml` shared builds: **one futa04** plus **three futa05 env variants** (sphere / lessons /
  challenges — different VITE stubs), downloaded by the browser suites (was: each matrix job
  rebuilt — ~2–4 min × ~18). Measured saving: on the order of **30–50 minutes** of redundant
  build time per CI run, without deleting any suite.
- `ci.yml` browser jobs — two tiers (owner, 2026-11-07: fast preview path + full promote/release
  gates; implemented as separate `browser` / `browser-release` jobs because GHA rejects `matrix` in
  a job-level `if`):
  - **`browser` (always):** futa04-critical, futa04-information, futa04-motion, lessons-3,
    territory-menu, territory-gestures, territory-gestures-ios, sphere-test, sphere-test-ios,
    planet-matte.
  - **`browser-release` (`futa0.5-online` push, PRs into it, or workflow_dispatch):** also
    futa04-tutorial-intel, futa04-tutorial-lock, futa04-lesson-9-free, cut-severe,
    territory-challenges, living-territory, living-territory-ios, territory-final-polish.
  The `-ios` suites use WebKit (the Safari engine), not physical-device automation. Promote still
  waits for CI on the `futa0.5-online` commit, which runs the **full** browser set.
- `extra-regressions.yml`: admin-dashboard, online-stale-token-recovery, online-soak-teardown,
  settings-visual, accounts-email, pwa-viewport-layout.

Removed as redundant: the seven suites that tested the old `live` (Main) channel this branch never
ships (smoke, painting, overhaul, monkey, emptyturn, fruitcards, propass), the `futa05-preview-build`
workflow (it re-checked and re-built the same commit and nobody used its artifact), and the full
`npm run check` of the locked `futa0.4` branch inside every deploy (~9 minutes, re-testing an unchanged
commit). Stale browser suites written for removed UI were deleted (territory-growth,
territory-resilience, territory-challenge-tap, world-pan); timing probes that are too noisy to gate a
deploy stay as hand-run tools (territory-fog, territory-keys, territory-prep, territory-smooth).
