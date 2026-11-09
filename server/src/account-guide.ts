// ACCOUNT GUIDE PROGRESS (owner, 2026-11-09: the in-game guide's "seen" windows "follow the account").
// One small row per player: the guide beats this player has opened (only ever grows) and how many
// real games they have started with the guide on (the HOW TO PLAY label shows for the first few).
// Nothing here touches the game, Seeds, Territory or campaign rows.
import { ApiError } from './errors.js';

/** Advertised on `/v1/health` so a page can skip the route on an older server. */
export const ACCOUNT_GUIDE_FEATURE = 'account-guide';

/** Caps so a corrupt or hostile body cannot allocate without bound. */
const MAX_BEATS = 32;
const MAX_GAMES = 1_000_000;
const BEAT = /^[a-z][a-z-]{0,23}$/;

export type AccountGuideWire = { seen: string[]; games: number };

/** Read a POST body defensively: unknown shapes are refused, odd entries dropped. */
export const parseAccountGuide = (body: Record<string, unknown>): AccountGuideWire => {
  const seen = body.seen;
  if (!Array.isArray(seen)) throw new ApiError('INVALID_REQUEST', 'seen must be a list.');
  const games = body.games;
  if (games !== undefined && (typeof games !== 'number' || !Number.isFinite(games) || games < 0)) {
    throw new ApiError('INVALID_REQUEST', 'games must be a non-negative number.');
  }
  const clean = [...new Set(seen.filter((b): b is string => typeof b === 'string' && BEAT.test(b)))].slice(0, MAX_BEATS);
  return { seen: clean.sort(), games: Math.min(MAX_GAMES, Math.floor((games as number | undefined) ?? 0)) };
};

/** Two copies join: everything either has seen, the higher game count. Never loses a beat. */
export const mergeAccountGuide = (a: AccountGuideWire, b: AccountGuideWire): AccountGuideWire => ({
  seen: [...new Set([...a.seen, ...b.seen])].sort().slice(0, MAX_BEATS),
  games: Math.max(a.games, b.games),
});

export const sameAccountGuide = (a: AccountGuideWire, b: AccountGuideWire): boolean =>
  a.games === b.games && a.seen.length === b.seen.length && a.seen.every((x, i) => x === b.seen[i]);
