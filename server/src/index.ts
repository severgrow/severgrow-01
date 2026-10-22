// Server entry point.
//
//   npm run server:dev                          # in-memory storage (dev only)
//   DATABASE_URL=postgres://… npm run server:dev # Postgres/Supabase
//
// A `.env` file (git-ignored) is read automatically by the npm scripts. The rules version is
// pinned in server/src/config.ts.
import { pathToFileURL } from 'node:url';
import { DEFAULT_SERVER_CONFIG, corsOriginsFromEnv, adminPlayerIdsFromEnv } from './config.js';
import { createHttpServer } from './http.js';
import { MatchService } from './service.js';
import { MemoryStorage } from './storage/memory.js';
import { databaseUrlFromEnv, poolFromUrl, redactUrl } from './storage/pg-pool.js';
import { postgresStorage } from './storage/postgres.js';
import type { Storage } from './storage/types.js';
import { wireLiveNode } from './live/node.js';
import { chainRouters } from './feedback/feedback.js';
import { MemoryFeedbackStore } from './feedback/feedback.js';
import { feedbackRouterNode } from './feedback/node.js';
import { MemoryIdentityLinkStore } from './accounts/accounts.js';
import { accountsRouterNode } from './accounts/node.js';
import { WorldEconomyService } from './seeds/service.js';
import { createWorldEconomyRouter } from './seeds/router.js';
import { MemoryWorldEconomyStore } from './seeds/memory.js';
import { postgresWorldEconomyStore } from './seeds/postgres.js';
import { adminRouterNode } from './admin/node.js';

const buildStorage = (): { storage: Storage; description: string } => {
  const url = databaseUrlFromEnv();
  if (!url) return { storage: new MemoryStorage(), description: 'in-memory (dev only: nothing is persisted)' };
  return { storage: postgresStorage(poolFromUrl(url)), description: `postgres (${redactUrl(url)})` };
};

export const startServer = async (options: { port?: number } = {}): Promise<{ port: number; storage: string; close: () => Promise<void> }> => {
  const config = {
    ...DEFAULT_SERVER_CONFIG,
    ...corsOriginsFromEnv(),
    // The dev/prod Node server reads the same allow-list the Edge entry does, so a second admin
    // needs only the env var set (docs/ADMIN.md) — never a code change.
    adminPlayerIds: Object.freeze(adminPlayerIdsFromEnv()),
  };
  const { storage, description } = buildStorage();
  const live = await wireLiveNode(storage, config, databaseUrlFromEnv()); // live duels: docs/LIVE.md
  const isMemory = storage instanceof MemoryStorage;
  const memoryFeedback = isMemory ? new MemoryFeedbackStore() : null;
  const memoryLinks = isMemory ? new MemoryIdentityLinkStore((p, k, n) => (storage as MemoryStorage).revokeTokensOfPlayer(p, k, n)) : null;
  const economyStore = isMemory ? new MemoryWorldEconomyStore() : postgresWorldEconomyStore(poolFromUrl(databaseUrlFromEnv()!));
  const economy = new WorldEconomyService(economyStore, live.storage);
  const service = new MatchService({ storage: live.storage, config, economy });
  // The admin router (docs/ADMIN.md) shares the dev server's OWN in-memory stores, so the dashboard
  // shows the same reports/matches the running server serves. Postgres deployments get the SQL store.
  const admin = await adminRouterNode({
    storage,
    service,
    config,
    databaseUrl: databaseUrlFromEnv(),
    memory: { feedback: memoryFeedback, economy: economyStore instanceof MemoryWorldEconomyStore ? economyStore : null, links: memoryLinks },
    economyStore,
    note: description,
  });
  const server = createHttpServer({
    service,
    config,
    logger: (line) => console.log(line),
    live: chainRouters(
      live.router(service),
      createWorldEconomyRouter({ economy, authenticate: (t) => service.authenticate(t) }),
      await feedbackRouterNode(storage, service, databaseUrlFromEnv(), memoryFeedback),
      await accountsRouterNode(storage, service, databaseUrlFromEnv(), process.env, memoryLinks),
      admin.router,
    ),
  });

  const port = options.port ?? Number(process.env.PORT ?? 8787);
  await new Promise<void>((resolve) => server.listen(port, resolve));
  const address = server.address();
  const actualPort = address !== null && typeof address === 'object' ? address.port : port;
  console.log(`futasaku duel server listening on http://localhost:${actualPort}`);
  console.log(`  rules version: ${service.rulesVersion}`);
  console.log(`  storage: ${description}`);
  console.log(`  admin allow-list (ADMIN_PLAYER_IDS): ${config.adminPlayerIds.join(', ') || '(empty — all admin routes locked)'}`);
  console.log(`  admin data source: ${admin.kind}`);

  return {
    port: actualPort,
    storage: description,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
};

/** A convenience for the CLI entry point: start, then stop on SIGINT/SIGTERM. */
const startAndWait = async (): Promise<void> => {
  const started = await startServer();
  const shutdown = () => void started.close().then(() => process.exit(0));
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
  void startAndWait().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
