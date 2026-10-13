// Live duels — wiring for the Node entry (server/src/index.ts). Kept apart from runtime.ts so the
// Edge bundle never pulls in the Node-only `pg` pool.
import type { ServerConfig } from '../config.js';
import type { Storage } from '../storage/types.js';
import { createLiveRuntime } from './runtime.js';
import type { LiveRuntime } from './runtime.js';

/** Node entry (server/src/index.ts): memory storage gets the memory live store, Postgres its own. */
export const wireLiveNode = async (storage: Storage, server: ServerConfig, databaseUrl: string | null): Promise<LiveRuntime> => {
  const { MemoryStorage } = await import('../storage/memory.js');
  if (storage instanceof MemoryStorage) {
    const { MemoryLiveStore } = await import('./memory.js');
    return createLiveRuntime({ storage, live: new MemoryLiveStore(storage), server });
  }
  const { poolFromUrl } = await import('../storage/pg-pool.js');
  const { postgresLiveStore } = await import('./postgres.js');
  return createLiveRuntime({ storage, live: postgresLiveStore(poolFromUrl(databaseUrl ?? '')), server });
};
