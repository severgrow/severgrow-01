# Severor browser game

Vanilla TypeScript/SVG interface to the deterministic engine in `../src/engine`.
Node >=20.19; install with `npm ci`.

- `npm run web:dev`: local legacy live channel.
- `CHANNEL=test npm run web:dev`: experimental Lab, Watch, DESIGN and comparisons.
- `CHANNEL=test2 npm run web:dev`: approved Main2.0 candidate with independent `main2:` saves.
- `npm run web:build`: build live into `web/dist`.
- `CHANNEL=test npm run web:build` / `CHANNEL=test2 npm run web:build`: explicit channel builds.
- `npm run check`: strict types and full unit suite.
- `MAIN_REFERENCE=/path/to/protected-main node --import tsx scripts/classic-parity.ts`: per-action Classic parity at levels 1–9.
- `CHANNEL=test2 node scripts/check-channel-assets.mjs`: assert candidate asset isolation after build.
- `node --import tsx web/e2e/test2-critical.ts`: actual candidate critical browser flows at nine viewports.

Use `PW_CHROMIUM` for a provided Chromium executable. Channels share a browser origin but not
save/settings/stat keys. Main uses legacy keys; Test uses `test:`; Test2 uses `main2:`.
Do not merge candidate game code into Main or push to Dev. Current verification is recorded in
`../MAIN2_PROGRESS.md`; real-device Safari/Android checks are separate from headless coverage.
