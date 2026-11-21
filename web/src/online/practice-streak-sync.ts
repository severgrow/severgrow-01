// The practice streaks' one instance on this page, and its quiet sync with the account (owner,
// 2026-11-18). The streaks themselves are logic/practice-streaks.ts; this only connects them to the
// identity already stored on the device (never minting one) and to the server.
import { browserStorage } from '../../../server/src/client.js';
import { createPracticeStreaks } from '../logic/practice-streaks.js';
import type { PracticeStreaksStore } from '../logic/practice-streaks.js';
import { seedPlayerId, storedConnection } from './seed-settle.js';
import { IDENTITY_STORAGE_KEY } from './identity.js';

let instance: PracticeStreaksStore | null = null;
export const practiceStreaks = (): PracticeStreaksStore =>
  (instance ??= createPracticeStreaks({ store: browserStorage(), playerId: () => seedPlayerId() }));

/**
 * True only for a SIGNED-IN account. A guest's identity is `kind: 'guest'`; the Practice keys keep
 * their numbers hidden for guests and reveal them for an account after three fully completed games
 * (owner, 2026-11-20). Reading the same stored identity the game writes avoids a second identity
 * path or a network request.
 */
export const practiceStreaksSignedIn = (): boolean => {
  try {
    const raw = browserStorage()?.get(IDENTITY_STORAGE_KEY);
    const identity = raw ? (JSON.parse(raw) as { kind?: unknown } | null) : null;
    return identity?.kind === 'account';
  } catch {
    return false;
  }
};

/** The record behind the reveal: three fully completed Practice games across the tiers. */
export const PRACTICE_STREAK_REVEAL_AT = 3;
export const practiceStreaksRevealed = (): boolean =>
  practiceStreaksSignedIn() && practiceStreaks().completedCount() >= PRACTICE_STREAK_REVEAL_AT;

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
    read: async () => {
      const answer = await client.streaks(token);
      return { practice: answer.practice, completed: answer.completed };
    },
  }).then(
    // More than one batch waiting (a long offline stretch): send the next at once.
    () => { running = null; if (streaks.pendingCount() > 0) void syncPracticeStreaks(); },
    () => { running = null; },
  );
  return running;
};

// A sign-in (or account switch) must refresh the account numbers at once: the sheet and the
// Practice keys read this device's cache, and a guest→account retag leaves pending games that
// still need to POST. Quiet on failure — the next menu paint or practice finish tries again.
if (typeof window !== 'undefined') {
  window.addEventListener('futasaku:identity', () => { void syncPracticeStreaks(); });
}
