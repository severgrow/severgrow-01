// Server entry point.
//
//   DATABASE_URL=postgres://... npm run server:dev
//
// With DATABASE_URL set it uses the Postgres/Supabase adapter (requires the `pg` package); without
// it, it uses the in-memory adapter — fine for local development and tests, but nothing survives a
// restart. The rules version is pinned in server/src/config.ts.
import { pathToFileURL } from 'node:url';
import { DEFAULT_SERVER_CONFIG } from './config.js';
import { createHttpServer } from './http.js';
import { MatchService } from './service.js';
import { MemoryStorage } from './storage/memory.js';
import { postgresStorage } from './storage/postgres.js';
import type { PgPool } from './storage/postgres.js';
import type { Storage } from './storage/types.js';

type PgPoolFactory = new (options: { connectionString: string }) => PgPool;

const buildStorage = async (): Promise<{ storage: Storage; description: string }> => {
  const url = process.env.DATABASE_URL;
  if (!url) return { storage: new MemoryStorage(), description: 'in-memory (dev only: nothing is persisted)' };
  // The specifier is computed so the project type-checks without `pg` installed.
  const moduleName = process.env.PG_MODULE ?? 'pg';
  const imported = (await import(moduleName)) as { default?: { Pool?: PgPoolFactory }; Pool?: PgPoolFactory };
  const Pool = imported.default?.Pool ?? imported.Pool;
  if (!Pool) throw new Error(`Could not find Pool in module "${moduleName}". Run: npm install pg`);
  return { storage: postgresStorage(new Pool({ connectionString: url })), description: 'postgres' };
};

export const startServer = async (): Promise<void> => {
  const config = {
    ...DEFAULT_SERVER_CONFIG,
    ...(process.env.CORS_ORIGIN ? { corsOrigin: process.env.CORS_ORIGIN } : {}),
  };
  const { storage, description } = await buildStorage();
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
