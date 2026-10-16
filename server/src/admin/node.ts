// Admin dashboard — wiring for the Node entry (kept apart so the Edge bundle never pulls in `pg`).
//
// The real store needs a Postgres connection; the in-memory one answers from the dev server's own
// in-memory stores, so `npm run server:dev` has a working dashboard with no database at all.
import type { ServerConfig } from '../config.js';
import type { MatchService } from '../service.js';
import type { Storage } from '../storage/types.js';
import type { MemoryStorage } from '../storage/memory.js';
import { createAdminRouter } from './router.js';
import type { AdminRouter } from './router.js';
import type { AdminStore } from './types.js';

export type AdminWiring = { router: AdminRouter; store: AdminStore; kind: 'postgres' | 'memory' };

export const adminRouterNode = async (
  deps: {
    storage: Storage;
    service: MatchService;
    config: ServerConfig;
    databaseUrl: string | null;
    /** The dev server's own stores, when it has them (the in-memory path). */
    memory?: { feedback?: unknown; economy?: unknown; links?: unknown } | null;
    note: string;
  },
): Promise<AdminWiring> => {
  const { MemoryStorage } = await import('../storage/memory.js');
  const { memoryAdminStore } = await import('./memory.js');
  const { MemoryFeedbackStore } = await import('../feedback/feedback.js');

  let store: AdminStore;
  let kind: 'postgres' | 'memory' = 'memory';
  if (deps.storage instanceof MemoryStorage && deps.databaseUrl) {
    // A real database with in-memory storage is a misconfiguration the rest of the server does not
    // have to care about: the dashboard follows the STORAGE, not the env var.
    kind = 'memory';
  }
  if (!(deps.storage instanceof MemoryStorage) && deps.databaseUrl) {
    const { poolFromUrl } = await import('../storage/pg-pool.js');
    const { postgresAdminStore } = await import('./postgres.js');
    store = postgresAdminStore(poolFromUrl(deps.databaseUrl));
    kind = 'postgres';
  } else {
    store = memoryAdminStore({
      storage: deps.storage as MemoryStorage,
      feedback: (deps.memory?.feedback as never) ?? new MemoryFeedbackStore(),
      economy: (deps.memory?.economy as never) ?? null,
      links: (deps.memory?.links as never) ?? null,
    });
  }

  const router = createAdminRouter({
    store,
    authenticate: (token) => deps.service.authenticate(token),
    config: deps.config,
    now: () => deps.service.serverNow(),
    rulesVersion: deps.service.rulesVersion,
    storage: deps.storage,
    pingDb: () => deps.service.pingStorage(),
    log: (line) => console.log(line),
  });
  return { router, store, kind };
};
