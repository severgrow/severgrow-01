// The dist a LIVE-CHANNEL suite verifies. Served from its OWN output directory, never `web/dist`.
//
// Why this exists (measured 2026-10-16): `web/dist` is shared mutable state between concurrent
// worktrees. The CI matrix builds `CHANNEL=live` for the legacy suites (smoke, painting, overhaul,
// monkey, emptyturn, fruitcards, propass) and `CHANNEL=futa04` for the `futa04-*` ones
// (.github/workflows/ci.yml). When a futa04 build was left in `web/dist` by another worker, a
// legacy suite silently verified THAT build instead:
//
//   * the module count is the tell: 210 modules = `live`, 233 modules = `futa04`;
//   * a `futa04` build installs the `main2:` storage prefix (web/src/channel.ts), so a legacy
//     suite's UNPREFIXED fixtures (`severgrow.settings.v1`, `severgrow.save.v7`) never reach the
//     app — verified with a probe;
//   * a `futa04` build also ships the modern dock (web/src/player/information.ts) whose
//     `.pile.ready` carries `animation: futa04-draw-pile-breathe … infinite`, so Playwright can
//     never see `#deck` as "stable" and the click times out (the app is fine: a human tap works).
//
// So a legacy suite got a different app than the one it asserts against, and the answer to "did
// smoke pass?" depended on who else was building. Building and serving our OWN dir makes the suite
// verify the same build in every worktree.
//
// The build is done once per process (memoised) and `CHANNEL=live` matches CI exactly.
import { spawn } from 'node:child_process';
import { servePreview, closePreview } from './preview-port.js';
import type { ServedPreview } from './preview-port.js';

/** The legacy suites' own output directory (a sibling of `web/dist`, like `web/dist-campaign`). */
export const LIVE_DIST = 'web/dist-live';
/** The same directory as vite names it: relative to the config root (`web/`). */
const LIVE_DIST_OUT_DIR = 'dist-live';

const buildLiveDist = (): Promise<void> =>
  new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ['./node_modules/vite/bin/vite.js', 'build', '--config', 'web/vite.config.ts', '--outDir', 'dist-live'],
      {
        env: { ...process.env, PATH: process.env.PATH, CHANNEL: 'live' },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    let err = '';
    child.stderr?.on('data', (b) => {
      err += String(b);
    });
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`live web:build failed: ${err}`))));
  });

let built: Promise<void> | null = null;

/** Build `web/dist-live` with `CHANNEL=live` once per process. */
export const ensureLiveDist = (): Promise<void> => {
  built ??= buildLiveDist();
  return built;
};

/**
 * Serve the legacy suites' own `CHANNEL=live` build on a FREE port. This is the drop-in replacement
 * for `servePreview(port, { logLevel: 'silent' })` in a suite that targets the historic live
 * channel: same return shape, but the page is the build the suite means to assert against.
 *
 * `dist` keeps the old `DIST` env escape hatch (a suite that prebuilt its own directory): when it
 * is given, that directory is served as-is and no build runs.
 */
export const serveLiveDist = async (
  legacyPort: number,
  options: { logLevel?: 'silent' | 'error' | 'info' | 'warn'; dist?: string } = {},
): Promise<ServedPreview> => {
  const outDir = options.dist ?? LIVE_DIST_OUT_DIR;
  if (!options.dist) await ensureLiveDist();
  return servePreview(legacyPort, {
    build: { outDir },
    logLevel: options.logLevel ?? 'silent',
  });
};

export { closePreview };
