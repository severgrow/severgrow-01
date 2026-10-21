// ONE remembered Territory pair, shared by the menu's Territory entry and the player's profile.
//
// Owner brief (2026-10-21): the profile's Seeds and tiles must come from the SAME reads the Territory
// entry already does — "REUSE that read, do not add a second request". The lobby's menu pass (one
// wallet + one world read) writes the pair here; the profile reads it back for the identity it was
// read for. When the cache is empty (the player opens the profile before a read ever landed) the
// profile asks the registered reader ONCE; the reader is the lobby's own pair read, and it paints
// the Territory entry with the same answer, so there is still only one request pair.
//
// A pair only ever belongs to the identity it was read for: a guest whose token was replaced, or a
// sign-out reload, must never inherit the previous player's numbers. Failure is remembered as
// "unknown" (null), never as 0.
import type { TerritoryCounts } from './menu-territory.js';

export type TerritoryRead = TerritoryCounts & { playerId: string };
type TerritoryReader = (playerId: string) => Promise<TerritoryCounts | null>;

let remembered: TerritoryRead | null = null;
let reader: TerritoryReader | null = null;
let pending: { playerId: string; promise: Promise<TerritoryCounts | null> } | null = null;

/** Remember (or, with null, forget) the pair that was just read for `playerId`. */
export const rememberTerritory = (playerId: string, counts: TerritoryCounts | null): void => {
  remembered = counts ? { ...counts, playerId } : null;
};

/** The pair for this identity, or null when it is unknown or belongs to someone else. Never fetches. */
export const cachedTerritory = (playerId: string | null | undefined): TerritoryCounts | null =>
  playerId && remembered?.playerId === playerId ? remembered : null;

/** The lobby registers its own pair read here, once, when it installs. */
export const registerTerritoryReader = (fn: TerritoryReader | null): void => {
  reader = fn;
};

/**
 * The pair for `playerId`: the cached one when it is already known, otherwise AT MOST one read
 * (single-flight, so a menu pass and a profile open in the same moment share the request pair).
 * Unknown stays unknown on failure — the caller renders an em dash.
 */
export const readTerritory = (playerId: string): Promise<TerritoryCounts | null> => {
  const hit = cachedTerritory(playerId);
  if (hit) return Promise.resolve(hit);
  if (pending?.playerId === playerId && reader) return pending.promise;
  if (!reader) return Promise.resolve(null);
  const promise = reader(playerId)
    .catch(() => null)
    .finally(() => {
      if (pending?.promise === promise) pending = null;
    });
  pending = { playerId, promise };
  return promise;
};
