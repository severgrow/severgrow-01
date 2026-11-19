// The menu needs a matched wallet/map pair. Profile can show a known wallet even if its
// unrelated map or challenge reads fail. Both surfaces share the same wallet request.
import type { SeedWallet } from '../../../server/src/seeds/types.js';
import type { TerritoryCounts } from './menu-territory.js';

let remembered: (TerritoryCounts & { playerId: string }) | null = null;
let lastWallet: { playerId: string; wallet: SeedWallet } | null = null;
const pending = new Map<string, Promise<SeedWallet | null>>();

export const rememberTerritory = (playerId: string, counts: TerritoryCounts | null): void => {
  remembered = counts ? { ...counts, playerId } : null;
};

export const cachedTerritory = (playerId: string | null | undefined): TerritoryCounts | null =>
  playerId && remembered?.playerId === playerId ? remembered : null;

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
