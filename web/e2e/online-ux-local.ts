// Runs the Phase D UI walk against a LOCAL futa05 build + local duel API (no rate limits, fast
// iteration). Same two-browser script as the live run, just pointed at localhost.
//
//   npx tsx web/e2e/online-ux-local.ts
import { spawn } from 'node:child_process';
import { createHttpServer } from '../../server/src/http.js';
import { MatchService } from '../../server/src/service.js';
import { MemoryStorage } from '../../server/src/storage/memory.js';
import { DEFAULT_SERVER_CONFIG } from '../../server/src/config.js';
import { preview } from 'vite';

const API_PORT = 4300;
const PREVIEW_PORT = 4207;
const apiBase = `http://127.0.0.1:${API_PORT}`;

console.log(`building futa05 for ${apiBase} …`);
await new Promise<void>((resolve, reject) => {
  const child = spawn(process.execPath, ['./node_modules/vite/bin/vite.js', 'build', '--config', 'web/vite.config.ts'], {
    env: { ...process.env, CHANNEL: 'futa05', VITE_FIND_OPPONENT: '1', VITE_DUEL_API_URL: apiBase },
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`build failed (${code})`))));
});

const config = { ...DEFAULT_SERVER_CONFIG, corsOrigins: ['*'] };
const service = new MatchService({ storage: new MemoryStorage(), config });
const apiServer = createHttpServer({ service, config });
await new Promise<void>((resolve) => apiServer.listen(API_PORT, '127.0.0.1', resolve));
console.log(`local API on ${apiBase}`);

const previewServer = await preview({
  configFile: 'web/vite.config.ts',
  preview: { host: '127.0.0.1', port: PREVIEW_PORT, strictPort: true },
  logLevel: 'silent',
});
console.log(`preview on http://127.0.0.1:${PREVIEW_PORT}/`);
for (let i = 0; i < 40; i++) {
  try {
    const res = await fetch(`http://127.0.0.1:${PREVIEW_PORT}/`);
    if (res.ok || res.status === 404) break;
  } catch {
    await new Promise((r) => setTimeout(r, 100));
  }
}

process.env.BASE_URL = `http://127.0.0.1:${PREVIEW_PORT}/`;
try {
  await import('./online-ux-walk.js');
} finally {
  await previewServer.close();
  await new Promise<void>((resolve) => apiServer.close(() => resolve()));
}
