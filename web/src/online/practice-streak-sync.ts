// The practice streaks' one instance on this page, and its quiet sync with the account (owner,
// 2026-11-18). The streaks themselves are logic/practice-streaks.ts; this only connects them to the
// identity already stored on the device (never minting one) and to the server.
import { browserStorage } from '../../../server/src/client.js';
import { createPracticeStreaks } from '../logic/practice-streaks.js';
import type { PracticeStreaksStore } from '../logic/practice-streaks.js';
import { seedPlayerId, storedConnection } from './seed-settle.js';

let instance: PracticeStreaksStore | null = null;
export const practiceStreaks = (): PracticeStreaksStore =>
  (instance ??= createPracticeStreaks({ store: browserStorage(), playerId: () => seedPlayerId() }));

let running: Promise<void> | null = null;
/**
 * Send queued games and take the account's numbers. One at a time; quiet on any failure (an old
 * server without the route, offline, no identity yet): the queue simply waits for the next one.
 */
export const syncPracticeStreaks = (): Promise<void> => {
  if (running) return running;
  const connection = storedConnection();
  if (!connection) return Promise.resolve();
  const { client, token } = connection;
  const streaks = practiceStreaks();
  running = streaks.sync({
    send: (games) => client.recordPracticeGames(token, games),
    read: async () => (await client.streaks(token)).practice,
  }).then(
    // More than one batch waiting (a long offline stretch): send the next at once.
    () => { running = null; if (streaks.pendingCount() > 0) void syncPracticeStreaks(); },
    () => { running = null; },
  );
  return running;
};
