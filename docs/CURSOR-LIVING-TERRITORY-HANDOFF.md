# Cursor handoff — Living Territory menu

Prepared 1 November 2026 for integration the following morning.

## What to fetch

Repository: `severgrow/severgrow-01`.
Feature branch: **`feature/living-territory-menu`**.
Base: **`a7d47e79` on `futa0.5-online`**.
Cloud worktree: `/workspace/futasaku-living-territory` (not a path on your machine).
Fetch the branch from GitHub; the cloud path is not needed to integrate it.

The latest integration check saw `futa0.5-online` at `c2ceaa53`. Its two newer commits change
lesson names/tests, with no overlap in this feature's shared files. Recheck before integrating;
other agents remain active. Do not reset or overwrite their changes.

No server deployment, Supabase migration, new dependency or secret is required. No engine rules,
economy/ownership rules, authentication or multiplayer protocol changed.

## Review before integration

Read [the design and verification guide](LIVING-TERRITORY-MENU.md). Its before/after screenshots
show the phone/desktop menu and the same map fully open. Preview locally with:

```sh
npm ci
npx tsx scripts/preview-living-territory.ts
```

Open `http://localhost:5187/` **on your machine**. For the cloud instance, forward port 5187 first.
The preview is a local in-memory world with real API behavior and the real renderer. It never
uses the production database. Stop with Ctrl+C. `PREVIEW_PORT` changes its port.

## Shared-file integration notes

| File | Change to preserve |
| --- | --- |
| `web/src/main.ts` | One `futasaku:screen` event after `hideLobbySurfaces()`. No new global state; do not call the late-initialized lobby controller from boot. |
| `web/index.html` | Territory starts natively disabled until its lazy-loaded click handler is bound. Preserve other agents' menu markup/labels. |
| `web/src/online/lobby-ui.ts` | Share the public-map source; begin it before identity/Seed settlement; pass the same promise to menu counts. Enable the entry after binding its handler. Mount the presentation controller and resume hooks. |
| `web/src/online/world-view.ts` | Retain the same SVG root/listeners/camera; render menu snapshots without active polling. Keep remembered-camera handling, current-coast clamping, empty-map cleanup and the guarded same-player menu wallet preparation. Do not reintroduce duplicate known-player metadata reads. |
| `.github/workflows/ci.yml` | Append the two living-Territory suites/artifact step; preserve the rest of the browser matrix and pinned runner. |
| `web/tests/menu-territory.test.ts` | Its one-map-read contract now checks the shared public-map promise. This is a wiring update; the single-read/no-poll guarantee remains. |

The new modules are `living-territory.ts`, `living-territory-css.ts`, `living-world-source.ts`,
and `living-camera.ts`, all under `web/src/online/`.

Important: the menu-mode CSS exception to `[hidden]` is intentional. That screen is logically
inactive and inaccessible; only its inert map artwork is visible. Removing the exception removes
the backdrop. Removing `inert`/`aria-hidden` exposes invisible map controls to keyboard users.
Normal screens, PLAY and duels must still hide the map. The existing Territory → duel exit fade
must finish; the game board itself must never receive a screen animation.

## Safe integration, after owner approval

Use your own worktree, starting from the latest target. This avoids touching any in-progress work:

```sh
git fetch origin futa0.5-online feature/living-territory-menu
git worktree add -b integration/living-territory ../futasaku-living-integration origin/futa0.5-online
cd ../futasaku-living-integration
git log --oneline a7d47e79..origin/feature/living-territory-menu
```

Apply the focused feature commit(s) shown by that last command, oldest first, using `git cherry-pick`.
Resolve only overlapping hunks. Preserve current lesson/profile/menu work and run the checks below.
Do not copy an entire old `main.ts`, `lobby-ui.ts`, `world-view.ts` or stylesheet over the target.
No force push, reset, or automated merge/deploy is part of this handoff.

## Checks that matter

```sh
npm run check
CHANNEL=futa04 npm run web:build
CHANNEL=futa04 node scripts/check-channel-assets.mjs
npx playwright-core install chromium webkit
npx tsx web/e2e/living-territory.ts
npx tsx web/e2e/living-territory-ios.ts
```

Also retain the existing Territory menu/challenge/gesture/iOS suites and the Territory → duel
regression. Some suites build themselves; `territory-challenges.ts` does not. Run its documented
futa05 build first, using the placeholder closed-port API, rather than reusing a different suite's
now-stopped API endpoint. Do not weaken its browser-error check to accommodate a wrong build.

The new suite explicitly checks a delayed controller import, no extra menu polling, the SAME SVG
and exact `viewBox` across sampled transition frames, rapid interruptions, focus restoration, PLAY
isolation, current new claims, saved zoom, scattered/no holdings, offline/slow/unavailable identity,
empty → valid recovery, obsolete cached-coast cameras, reduced motion, rotation, Large Text and
PWA-mode emulation. CI runs Chromium and WebKit and retains its screenshots.

After integration, use the repository's normal `/test/` release and owner-approved promote flow.
This feature branch has not been merged or deployed by this task.

## Remaining limits

Physical iPhone/PWA hardware has not been exercised here. PWA checks emulate standalone mode;
WebKit CI covers the engine, not a physical home-screen installation. The cloud chat lacks an
embedded-browser/port-publishing tool; port 5187 is workspace-local, not a public preview URL.
Production geography was not fetched in this environment; integration tests use a real local HTTP
world and production rendering code. Shipping uses the existing configured production endpoint.

## PR creation status

The feature branch is pushed to GitHub. This cloud environment rejected `gh pr create` with
`Post https://api.github.com/graphql: Forbidden`, so no PR number was created here.

[Open the PR creation form](https://github.com/severgrow/severgrow-01/compare/futa0.5-online...feature/living-territory-menu?expand=1)
or, from your normally authenticated Cursor terminal, run:

```sh
gh pr create --repo severgrow/severgrow-01 --base futa0.5-online \
  --head feature/living-territory-menu \
  --title "Living Territory menu with continuous map navigation" \
  --body-file docs/LIVING-TERRITORY-PR.md
```

The description is already committed. Creating a PR is not merging or deploying it; retain the
owner-approval step. Review CI on the latest feature-branch head before integrating.
