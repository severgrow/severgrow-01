// Live duels — one call that wires the live layer around a base Storage:
//   const live = createLiveRuntime({ storage, live: new MemoryLiveStore(storage), server: config });
//   const service = new MatchService({ storage: live.storage, config });
//   createFetchApp({ service, config, live: live.router(service) });
import type { MatchBroadcaster } from '../broadcast.js';
import type { ServerConfig } from '../config.js';
import type { MatchService } from '../service.js';
import type { Storage } from '../storage/types.js';
import type { LiveConfig } from './config.js';
import { DEFAULT_LIVE_CONFIG } from './config.js';
import type { LiveNotifier } from './notifier.js';
import { supabaseLiveNotifier } from './notifier.js';
import { postgresLiveStore } from './postgres.js';
import { createLiveRouter } from './router.js';
import type { LiveRouter } from './router.js';
import { LiveService } from './service.js';
import { liveAwareStorage } from './storage-wrapper.js';
import type { LiveStore } from './types.js';

export type LiveRuntime = {
  /** Give THIS to MatchService: the base storage with the live clock decision points added. */
  storage: Storage;
  service: LiveService;
  router: (match: MatchService) => LiveRouter;
};

export const createLiveRuntime = (options: {
  storage: Storage;
  live: LiveStore;
  server: ServerConfig;
  config?: LiveConfig;
  now?: () => number;
  broadcaster?: MatchBroadcaster;
  notifier?: LiveNotifier;
}): LiveRuntime => {
  const now = options.now ?? (() => Date.now());
  const service = new LiveService({
    storage: options.storage,
    live: options.live,
    config: options.config ?? DEFAULT_LIVE_CONFIG,
    server: options.server,
    now,
    ...(options.broadcaster ? { broadcaster: options.broadcaster } : {}),
    ...(options.notifier ? { notifier: options.notifier } : {}),
  });
  const storage = liveAwareStorage(options.storage, {
    tickMatch: (id, at) => service.tickMatch(id, at),
    tickDue: (at) => service.tickDue(at),
    needsTick: (id, at) => service.needsTick(id, at),
  });
  return {
    storage,
    service,
    router: (match) => createLiveRouter({ live: service, authenticate: (t) => match.authenticate(t), now }),
  };
};

/** Edge entry: the same pool, the match broadcaster, and per-player pings when the keys exist. */
export const wireLiveEdge = (options: {
  storage: Storage;
  pool: import('../storage/postgres.js').PgPool;
  server: ServerConfig;
  broadcaster?: MatchBroadcaster;
  env: (name: string) => string | undefined;
}): LiveRuntime => {
  const url = options.env('SUPABASE_URL') ?? '';
  const key = options.env('SUPABASE_ANON_KEY') ?? '';
  return createLiveRuntime({
    storage: options.storage,
    live: postgresLiveStore(options.pool),
    server: options.server,
    ...(options.broadcaster ? { broadcaster: options.broadcaster } : {}),
    ...(url && key ? { notifier: supabaseLiveNotifier({ url, key }) } : {}),
  });
};
