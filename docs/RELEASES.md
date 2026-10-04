# Releases: the live game and the test copy

Two copies of the game are published together on GitHub Pages:

| Channel | Branch | Address | Built with | Checks |
| --- | --- | --- | --- | --- |
| **live** | `main` | https://severgrow.github.io/severgrow-01/ | `npm run web:build` | strict: `npm run check`, browser tests and CI on every pull request |
| **test** | `dev` | https://severgrow.github.io/severgrow-01/test/ | `CHANNEL=test npm run web:build` | lite: the build must succeed and the page must load (see CLAUDE.md, "TEST (lite) mode") |

- **One bundle:** GitHub Pages serves one bundle per site, so every deploy builds both branches (`.github/workflows/pages.yml`).
  - A push to `main` redeploys.
  - A push to `dev` announces itself (`test-copy.yml`), and the deploy then runs from `main`'s workflow, so Pages always accepts it.
  - No tests run in the deploy: install from the lockfile, build, publish. A `dev` push is live in a couple of minutes.
- **CI:** runs on every branch except `dev`, and on every pull request.
- **The `CHANNEL` build constant** (`web/src/channel.ts`): `'live'` or `'test'`. Anything test-only (the Lab, in `web/src/lab-mode/`) checks it, so the live game never shows or loads it.
- **Storage:** both copies share one web address, so the test copy prefixes every storage key with `test:`. Live saves and settings are never touched. The test copy has no offline worker, and the live worker ignores `/test/`.

## Locking in an experiment

To move something from `dev` to `main` (only when asked: "lock it in"), the strict flow applies:
1. `npm run check` passes and every failure is fixed (docs/LAB-KNOWN-BREAKAGE.md lists the known ones).
2. Golden tests are regenerated where the rules changed.
3. The browser tests and the usual guards pass.
4. A pull request into `main` with CI green, and the go-ahead from the owner.
