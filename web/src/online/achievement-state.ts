// WHETHER THE TERRITORY ACHIEVEMENTS KEY EXISTS IS A STATE-MACHINE DECISION, NOT A SIDE EFFECT OF
// ONE NETWORK READ SUCCEEDING (owner report, 2026-10-31: "sometimes i see the achievements sometimes
// i dont").
//
// The old rule was `key.hidden = this.achievements === null`, and `achievements` started null and was
// only replaced by a successful GET. Any other outcome — a 500, an offline device, a timeout, a
// dropped answer — left it null, and no retry was remembered. The key therefore appeared only when
// the open-time read happened to win. This module makes the rule explicit and pure:
//
//   HIDDEN only for (a) no signed-in identity, or (b) the server DEFINITELY has no route (404 /
//   NOT_FOUND). Every other failure keeps the last good list and leaves the key exactly as it was.
//
// A transient failure with no list yet is REMEMBERED (`retry`) so the ordinary 12 s world poll asks
// again; a 404 stops that retry. Keeping the rule pure means the DOM apply in `world-view.ts` is a
// one-line `hidden = !achievementsVisible(...)`, and this file is what the tests pin.
import type { AchievementView } from '../../../server/src/seeds/achievements.js';
import type { KeyValue } from '../../../server/src/client.js';

/** The last good list, per player, on this device. Versioned: a shape change gets a new key. */
export const ACHIEVEMENTS_MEMORY_KEY = 'severgrow.territory.achievements.v1.';
const MEMORY_VERSION = 1;

export type AchievementsState = {
  /** The player these views belong to; null when nobody is signed in. */
  playerId: string | null;
  /** The last good list (fresh or remembered); null until one has ever been read. */
  views: readonly AchievementView[] | null;
  /** The server answered 404 / NOT_FOUND: it definitely has no achievements route. */
  routeMissing: boolean;
  /** The last read failed transiently; the next world poll should try once more. */
  retry: boolean;
};

export type AchievementsResult =
  | { kind: 'loaded'; playerId: string; views: AchievementView[] }
  | { kind: 'missing'; playerId: string }
  | { kind: 'transient'; playerId: string }
  /** The answer belonged to an identity that changed, or the map closed before it landed. */
  | { kind: 'discarded' };

export const noAchievements = (playerId: string | null = null): AchievementsState => ({
  playerId,
  views: null,
  routeMissing: false,
  retry: false,
});

/**
 * THE RULE: the key is on screen only when there is a signed-in player, the server has not said the
 * route is missing, and there is a list to show (fresh, or remembered from last time).
 */
export const achievementsVisible = (state: AchievementsState): boolean =>
  state.playerId !== null && !state.routeMissing && state.views !== null;

/** Rewards waiting to be claimed. Follows `achievementsVisible` so the badge cannot outlive the key. */
export const achievementsReady = (state: AchievementsState): number =>
  achievementsVisible(state) ? (state.views ?? []).filter((view) => view.done && !view.claimed).length : 0;

/** Apply one read's outcome. Pure: the caller owns the request, this owns the decision. */
export const afterAchievementsRead = (
  state: AchievementsState,
  result: AchievementsResult,
): AchievementsState => {
  switch (result.kind) {
    case 'loaded':
      return { playerId: result.playerId, views: result.views, routeMissing: false, retry: false };
    case 'missing':
      // A definite "no such route": hide, and stop asking on the poll.
      return { playerId: result.playerId, views: null, routeMissing: true, retry: false };
    case 'transient':
      // Never blank a list that is already on screen. If there is no list, flag the poll to retry.
      if (state.playerId !== result.playerId)
        return { playerId: result.playerId, views: null, routeMissing: false, retry: true };
      return { ...state, retry: !state.routeMissing };
    case 'discarded':
      // Keep what is on screen (the answer was not this player's, or the map closed). Flag a retry
      // so a dropped answer cannot leave the key hidden for ever.
      return { ...state, retry: !state.routeMissing };
  }
};

const GROUPS = new Set(['territory', 'duels', 'craft', 'company', 'campaign']);

const isView = (value: unknown): value is AchievementView => {
  const view = value as Partial<AchievementView> | null;
  return !!view &&
    typeof view.id === 'string' &&
    typeof view.group === 'string' && GROUPS.has(view.group) &&
    typeof view.seeds === 'number' && Number.isFinite(view.seeds) &&
    typeof view.goal === 'number' && Number.isFinite(view.goal) &&
    typeof view.progress === 'number' && Number.isFinite(view.progress) &&
    typeof view.done === 'boolean' &&
    typeof view.claimed === 'boolean';
};

/** Store the last good list for one player. A full/blocked device just keeps the old behaviour. */
export const rememberAchievements = (
  storage: KeyValue | null,
  playerId: string,
  views: readonly AchievementView[],
): void => {
  try {
    storage?.set(`${ACHIEVEMENTS_MEMORY_KEY}${playerId}`, JSON.stringify({ v: MEMORY_VERSION, views }));
  } catch {
    /* storage full or blocked: the next open waits for the network, as before */
  }
};

/** The last good list for one player, or null when absent/malformed. Never another player's list. */
export const lastAchievements = (storage: KeyValue | null, playerId: string): AchievementView[] | null => {
  try {
    const raw = storage?.get(`${ACHIEVEMENTS_MEMORY_KEY}${playerId}`);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    const cache = parsed as { v?: unknown; views?: unknown } | null;
    if (!cache || cache.v !== MEMORY_VERSION || !Array.isArray(cache.views)) return null;
    return cache.views.every(isView) ? cache.views : null;
  } catch {
    return null;
  }
};

/** The state to paint the moment the map opens, before the fresh read replaces it. */
export const restoreAchievements = (storage: KeyValue | null, playerId: string | null): AchievementsState => {
  if (!playerId) return noAchievements(null);
  return { playerId, views: lastAchievements(storage, playerId), routeMissing: false, retry: false };
};