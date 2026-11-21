// The menu needs a matched wallet/map pair. Profile can show a known wallet even if its
// unrelated map or challenge reads fail. Both surfaces share the same wallet request.
import type { SeedWallet } from '../../../server/src/seeds/types.js';
import type { TerritoryCounts } from './menu-territory.js';

let remembered: (TerritoryCounts & { playerId: string }) | null = null;
let lastWallet: { playerId: string; wallet: SeedWallet } | null = null;
const pending = new Map<string, Promise<SeedWallet | null>>();

/**
 * Remember a pair that was actually read. A `null` (the wallet or the map failed, so
 * `territoryCounts` answered null) NEVER erases a pair this identity already had: the entry's two
 * read-outs are STICKY (owner report, 2026-11-20 — "after exiting the planet the planet button
 * loses the tiles and seeds count"). A failed returning read used to overwrite the cache with
 * null, so the numbers the player had just seen went blank. The pair stays keyed by the player it
 * was read for, so another account on this device still sees nothing of it.
 */
export const rememberTerritory = (playerId: string, counts: TerritoryCounts | null): void => {
  if (!counts) return;
  remembered = { ...counts, playerId };
};

export const cachedTerritory = (playerId: string | null | undefined): TerritoryCounts | null =>
  playerId && remembered?.playerId === playerId ? remembered : null;

/**
 * The pair a menu pass may paint once its read has settled: the fresh pair when the read worked,
 * otherwise the last good pair for THIS identity. Null only when this identity never had a known
 * pair, so the entry still shows its honest blank instead of inventing zeros.
 */
export const settledTerritory = (playerId: string | null | undefined, counts: TerritoryCounts | null): TerritoryCounts | null =>
  counts ?? cachedTerritory(playerId);

export const readTerritoryWallet = (
  playerId: string,
  read: () => Promise<SeedWallet | null>,
  refresh = false,
): Promise<SeedWallet | null> => {
  const active = pending.get(playerId);
  if (active) return active;
  if (!refresh && lastWallet?.playerId === playerId) return Promise.resolve(lastWallet.wallet);
  const request = read()
    .then((wallet) => {
      if (wallet) lastWallet = { playerId, wallet };
      return wallet;
    })
    .catch(() => null)
    .finally(() => pending.delete(playerId));
  pending.set(playerId, request);
  return request;
};
