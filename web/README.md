# Futasaku browser game

Vanilla TypeScript/SVG interface to the deterministic engine in `../src/engine`.
Node >=20.19; install with `npm ci`.

- `CHANNEL=test2 npm run web:dev`: current Futasaku 0.3 game.
- `CHANNEL=test2 npm run web:build`: current production build into `web/dist/`.
- `npm run web:dev` / `npm run web:build`: historical live channel retained for compatibility checks.
- `CHANNEL=test npm run web:dev`: historical Lab/Watch/Design comparison channel.
- `npm run check`: strict types and full unit suite.
- `MAIN_REFERENCE=/path/to/protected-main node --import tsx scripts/classic-parity.ts`: per-action Classic parity at levels 1–9.
- `CHANNEL=test2 node scripts/check-channel-assets.mjs`: assert candidate asset isolation after build.
- `node --import tsx web/e2e/test2-critical.ts`: actual candidate critical browser flows at nine viewports.

Use `PW_CHROMIUM` for a provided Chromium executable. Channels share a browser origin but not
save/settings/stat keys. Main uses legacy keys; Test uses `test:`; Test2 uses `main2:`.
Do not merge this branch into Main or push to Dev. Baseline verification is recorded in
`../docs/FUTASAKU_0_3_BASELINE.md`; real-device Safari/Android checks are separate from headless coverage.
