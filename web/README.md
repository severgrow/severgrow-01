# Futasaku browser game

Vanilla TypeScript/SVG interface to the deterministic engine in `../src/engine`.
Node >=20.19; install with `npm ci`.

- `npm run web:dev`: play locally.
- `npm run web:build`: production build into `web/dist/` (relative paths, works at any Pages address).
- `node scripts/check-build-assets.mjs`: check the build (all Futasaku parts present, nothing archived).
- `node --import tsx web/e2e/quick-smoke.ts`: the quick browser check (page loads, a game plays).
- `node --import tsx web/e2e/futa04-critical.ts`: the critical browser flows at nine screen sizes.

Use `PW_CHROMIUM` for a provided Chromium executable. Saves and settings use a storage prefix
(`web/src/channel.ts`): `futa04:` at `/futa0.4/`, `futatest:` at the test copy `/futa-test/`,
`main2:` elsewhere (local previews). Headless checks do not replace real iPhone Safari and
Android Chrome testing.
