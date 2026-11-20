// Wire the push service to the real server: the shared Postgres limiter, the authenticated player
// and the two authoritative readers. Both entries (Node and Deno Edge) call this, so the decision,
// the sender and the routes cannot drift between them.
import type { PlayerRecord } from '../storage/types.js';
import type { MatchService } from '../service.js';
import type { WorldEconomyService } from '../seeds/service.js';
import { createPushRouter } from './router.js';
import { createPushService } from './service.js';
import type { PushService } from './service.js';
import { createWebPushSender } from './webpush.js';
import type { PushConfig } from './config.js';
import type { PushSender, PushStore } from './types.js';

export type WirePushDeps = Readonly<{
  config: PushConfig;
  store: PushStore;
  service: MatchService;
  /** Only `challenges()` is read (the private incoming/outgoing lists). */
  economy: Pick<WorldEconomyService, 'challenges'>;
  authenticate: (token: string | null) => Promise<PlayerRecord>;
  now?: () => number;
  log?: (line: string) => void;
  /** Test seam: a fake sender. Production leaves this out and VAPID builds the real one. */
  sender?: PushSender | null;
}>;

export type PushRuntime = Readonly<{
  push: PushService;
  router: ReturnType<typeof createPushRouter>;
}>;

/** Build the sender from VAPID material, or null (dark) when the pair is incomplete. */
export const senderFromConfig = (config: PushConfig, now?: () => number): PushSender | null => {
  if (!config.enabled || !config.publicKey || !config.privateKey) return null;
  return createWebPushSender({
    vapid: {
      publicKey: config.publicKey,
      privateKey: config.privateKey,
      subject: config.subject,
      ttlSeconds: config.ttlSeconds,
    },
    ...(now ? { now } : {}),
  });
};

export const wirePush = (deps: WirePushDeps): PushRuntime => {
  const now = deps.now ?? (() => Date.now());
  const push = createPushService({
    config: deps.config,
    store: deps.store,
    sender: deps.sender === undefined ? senderFromConfig(deps.config, now) : deps.sender,
    source: {
      matchesOf: (playerId) => deps.service.matchRowsForPush(playerId),
      challengesOf: (player) => deps.economy.challenges(player),
    },
    now,
    ...(deps.log ? { log: deps.log } : {}),
  });
  const router = createPushRouter({
    push,
    authenticate: deps.authenticate,
    limit: (bucket, windowMs, max) => deps.service.limit(bucket, windowMs, max),
    dispatchToken: deps.config.dispatchToken,
    nudgePerPlayerPerHour: deps.config.nudgePerPlayerPerHour,
    dispatchPerIpPerHour: deps.config.dispatchPerIpPerHour,
  });
  return { push, router };
};
