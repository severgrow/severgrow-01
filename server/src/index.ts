// Server entry point.
//
//   npm run server:dev                          # in-memory storage (dev only)
//   DATABASE_URL=postgres://… npm run server:dev # Postgres/Supabase
//
// A `.env` file (git-ignored) is read automatically by the npm scripts. The rules version is
// pinned in server/src/config.ts.
import { pathToFileURL } from 'node:url';
import { DEFAULT_SERVER_CONFIG } from './config.js';
import { createHttpServer } from './http.js';
import { MatchService } from './service.js';
import { MemoryStorage } from './storage/memory.js';
import { databaseUrlFromEnv, poolFromUrl, redactUrl } from './storage/pg-pool.js';
import { postgresStorage } from './storage/postgres.js';
import type { Storage } from './storage/types.js';

const buildStorage = (): { storage: Storage; description: string } => {
  const url = databaseUrlFromEnv();
  if (!url) return { storage: new MemoryStorage(), description: 'in-memory (dev only: nothing is persisted)' };
  return { storage: postgresStorage(poolFromUrl(url)), description: `postgres (${redactUrl(url)})` };
};

export const startServer = async (): Promise<void> => {
  const config = {
    ...DEFAULT_SERVER_CONFIG,
    ...(process.env.CORS_ORIGIN ? { corsOrigin: process.env.CORS_ORIGIN } : {}),
  };
  const { storage, description } = buildStorage();
  const service = new MatchService({ storage, config });
  const server = createHttpServer({ service, config, logger: (line) => console.log(line) });

  const port = Number(process.env.PORT ?? 8787);
  server.listen(port, () => {
    console.log(`futasaku duel server listening on http://localhost:${port}`);
    console.log(`  rules version: ${service.rulesVersion}`);
    console.log(`  storage: ${description}`);
  });
  const shutdown = () => server.close(() => process.exit(0));
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
};

export { createHttpServer } from './http.js';
export { MatchService } from './service.js';
export type { Storage } from './storage/types.js';

/** True only when this file is the process entry point (never when imported by a test). */
const isEntryPoint = (): boolean => {
  const entry = process.argv[1];
  return entry !== undefined && import.meta.url === pathToFileURL(entry).href;
};

if (isEntryPoint()) {
  void startServer().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
