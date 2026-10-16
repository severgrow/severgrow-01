// Beta feedback — wiring for the Node entry (kept apart so the Edge bundle never pulls in `pg`).
import type { MatchService } from '../service.js';
import type { Storage } from '../storage/types.js';
import { MemoryFeedbackStore, createFeedbackRouter, postgresFeedbackStore } from './feedback.js';
import type { FeedbackRouter, FeedbackStore } from './feedback.js';

export const feedbackRouterNode = async (storage: Storage, service: MatchService, databaseUrl: string | null, injected?: FeedbackStore | null): Promise<FeedbackRouter> => {
  const { MemoryStorage } = await import('../storage/memory.js');
  let store;
  if (injected) store = injected;
  else if (storage instanceof MemoryStorage || !databaseUrl) store = new MemoryFeedbackStore();
  else {
    const { poolFromUrl } = await import('../storage/pg-pool.js');
    store = postgresFeedbackStore(poolFromUrl(databaseUrl));
  }
  return createFeedbackRouter({ store, storage, authenticate: (t) => service.authenticate(t), now: () => service.serverNow() });
};
