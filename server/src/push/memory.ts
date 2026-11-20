// In-memory push store (local dev and unit tests). Same contract as the Postgres adapter: one
// endpoint, one owner; one dedupe key, one claim. Never used by a real deployment.
import type {
  PendingChallenge,
  PushKind,
  PushStore,
  PushSubscriptionRecord,
} from './types.js';

export type MemoryPushStore = PushStore & {
  /** Test/dev seam: the rows a reminder sweep would find. */
  seedChallenges(rows: readonly PendingChallenge[]): void;
  /** Test seam: what is stored for one browser endpoint, or undefined. */
  peek(endpoint: string): PushSubscriptionRecord | undefined;
};

export const memoryPushStore = (): MemoryPushStore => {
  const endpoints = new Map<string, PushSubscriptionRecord>();
  const claims = new Set<string>();
  const claimKey = (playerId: string, dedupeKey: string): string => `${playerId}\u0000${dedupeKey}`;
  let challenges: readonly PendingChallenge[] = [];
  return {
    async save(record) {
      // `unique (endpoint)`: a second player enabling notifications on this browser takes the row.
      endpoints.set(record.endpoint, { ...record });
    },
    async remove(playerId, endpoint) {
      const existing = endpoints.get(endpoint);
      if (!existing || existing.playerId !== playerId) return false;
      endpoints.delete(endpoint);
      return true;
    },
    async forPlayer(playerId) {
      return [...endpoints.values()].filter((row) => row.playerId === playerId);
    },
    async countForPlayer(playerId) {
      return [...endpoints.values()].filter((row) => row.playerId === playerId).length;
    },
    async claim(playerId, dedupeKey, _kind: PushKind, _now) {
      const key = claimKey(playerId, dedupeKey);
      if (claims.has(key)) return false;
      claims.add(key);
      return true;
    },
    async revoke(playerId, endpoint) {
      const existing = endpoints.get(endpoint);
      if (existing && existing.playerId === playerId) endpoints.delete(endpoint);
    },
    async pendingChallenges(now, limit) {
      return challenges
        .filter((row) => row.expiresAt > now)
        .sort((a, b) => a.expiresAt - b.expiresAt)
        .slice(0, limit);
    },
    seedChallenges(rows) {
      challenges = rows.map((row) => ({ ...row }));
    },
    peek(endpoint) {
      const row = endpoints.get(endpoint);
      return row ? { ...row } : undefined;
    },
  };
};
