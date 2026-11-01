// EXPERIMENTAL BLITZ — the offline practice mode that exists on the /test/ copy only.
//
// The rules here are DATA and pure functions: the tier's bot ladder (9, dropping to 8 after two
// losses in a row until a win), the 15-second turn clock, and which campaign boards it plays on.
// Nothing in this file touches the DOM, a clock or storage on its own: the page passes the store
// in, so every rule is unit-tested without a browser (web/tests/blitz.test.ts).
//
// WHY THIS IS NOT ONE OF THE TRAINING TIERS (`logic/difficulty.ts`): Easy / Medium / Hard carry one
// level between games (a win steps up, a loss steps down). Blitz does the opposite — the bot is 9
// until the player has lost twice in a row, then 8 until the player wins once. Giving it a fourth
// `DifficultyId` would put it inside `stepAfterGame` and inside the pinned three-tier menu. It is
// its own small ladder, and `DIFFICULTIES` is not touched.
import type { Level } from '../../../src/bots/levels.js';
import { CAMPAIGN_LEVELS } from '../../../src/campaign/levels.js';
import type { CampaignLevel } from '../../../src/campaign/levels.js';
import { scores } from '../../../src/engine/index.js';
import type { GameResult, Player, State } from '../../../src/engine/index.js';
import type { FinishResult } from './log.js';

/** One turn. The live duel's own clock is the same visual; Blitz just makes the limit 15 s. */
export const BLITZ_TURN_MS = 15_000;

/** `severgrow.*`: the ladder's own key, never shared with the training tiers' carry-over. */
export const BLITZ_KEY = 'severgrow.blitz.v1';

/** The bot Blitz starts at (and returns to after a win). */
export const BLITZ_BOT_LEVEL: Level = 9;
/** The bot after two losses in a row, until the player wins one. */
export const BLITZ_DROP_BOT_LEVEL: Level = 8;
/** Losses in a row that drop 9 to 8. */
export const BLITZ_LOSSES_TO_DROP = 2;

/** The campaign boards Blitz draws from (inclusive). */
export const BLITZ_FIRST_MAP = 30;
export const BLITZ_LAST_MAP = 70;

/** What a finished Blitz game counted as. `Draw` is not a loss (see `blitzAfterGame`). */
export type BlitzOutcome = 'win' | 'loss' | 'draw';

/** The small persisted ladder: the bot level the NEXT Blitz game uses, and the current losing run. */
export type BlitzState = { level: Level; losses: number };

/** The ladder before anything has been played. */
export const BLITZ_DEFAULT: BlitzState = Object.freeze({ level: BLITZ_BOT_LEVEL, losses: 0 });

/** The only storage the ladder needs (the page's `store`; a Map-backed fake in tests). */
export type BlitzStore = {
  get(key: string): string | null;
  set(key: string, value: string): void;
};

/**
 * A stored ladder, or the default. Junk is the default; a stored 8 survives a draw (losses are 0
 * and the level is still 8), and a stored 9 with two losses is read as 8 so the two fields can
 * never disagree in a way that keeps the bot at 9 after two losses.
 */
export const parseBlitzState = (raw: string | null): BlitzState => {
  let value: { level?: unknown; losses?: unknown } | null = null;
  try {
    value = JSON.parse(raw ?? 'null') as { level?: unknown; losses?: unknown } | null;
  } catch {
    return { ...BLITZ_DEFAULT };
  }
  if (!value || typeof value !== 'object') return { ...BLITZ_DEFAULT };
  const losses = typeof value.losses === 'number' && Number.isInteger(value.losses) && value.losses >= 0
    ? Math.min(value.losses, 99)
    : 0;
  const level: Level = value.level === BLITZ_DROP_BOT_LEVEL || losses >= BLITZ_LOSSES_TO_DROP
    ? BLITZ_DROP_BOT_LEVEL
    : BLITZ_BOT_LEVEL;
  return { level, losses };
};

/**
 * The ladder after ONE finished Blitz game.
 *   win  -> 9 (and the losing run is over)
 *   draw -> the level stays put, the losing run is over (a draw is neither a win nor a loss)
 *   loss -> one more loss; the second in a row drops 9 to 8, and it stays 8 on further losses
 *           until a win. Only a WIN climbs back to 9.
 */
export const blitzAfterGame = (state: BlitzState, outcome: BlitzOutcome): BlitzState => {
  if (outcome === 'win') return { level: BLITZ_BOT_LEVEL, losses: 0 };
  if (outcome === 'draw') return { level: state.level, losses: 0 };
  const losses = state.losses + 1;
  return {
    level: state.level === BLITZ_DROP_BOT_LEVEL || losses >= BLITZ_LOSSES_TO_DROP ? BLITZ_DROP_BOT_LEVEL : BLITZ_BOT_LEVEL,
    losses,
  };
};

/** The ladder as stored. */
export const readBlitzState = (store: BlitzStore): BlitzState => parseBlitzState(store.get(BLITZ_KEY));

/**
 * Record one finished game — but ONLY when that game was a Blitz game. A normal Easy / Medium /
 * Hard game (or a campaign level, or anything online) passes `isBlitz = false` and this function
 * returns the stored ladder untouched: it never writes, and never clears, the Blitz key.
 */
export const recordBlitzOutcome = (store: BlitzStore, isBlitz: boolean, outcome: BlitzOutcome): BlitzState => {
  const before = readBlitzState(store);
  if (!isBlitz) return before;
  const after = blitzAfterGame(before, outcome);
  store.set(BLITZ_KEY, JSON.stringify(after));
  return after;
};

/** The campaign levels Blitz is allowed to play on: 30-70, all of which have authored boards. */
export const BLITZ_MAPS: readonly CampaignLevel[] = Object.freeze(
  CAMPAIGN_LEVELS.filter((level) => level.number >= BLITZ_FIRST_MAP && level.number <= BLITZ_LAST_MAP),
);

/**
 * One of those boards, chosen from a seed. The same seed always names the same board, so the pick
 * is reproducible in a test without pinning the player's random deal.
 */
export const pickBlitzMap = (seed: number): CampaignLevel => {
  if (BLITZ_MAPS.length === 0) throw new Error('Blitz needs at least one campaign board from 30-70');
  // A mix step (not `seed % n`): adjacent seeds should not walk the list in order.
  const mixed = Math.imul((seed >>> 0) ^ 0x9e3779b9, 0x85ebca6b) >>> 0;
  return BLITZ_MAPS[mixed % BLITZ_MAPS.length]!;
};

/** The human's clock for this turn: the shared 15 s limit from the moment the turn is playable. */
export const blitzDeadlineAt = (now: number): number => now + BLITZ_TURN_MS;

/** What is left of a turn, never negative. */
export const blitzRemainingMs = (deadline: number, now: number): number => Math.max(0, deadline - now);

/**
 * The finish of a Blitz game whose clock ran out. The ONLINE live duel loses the match on a real
 * timeout (server `reason: 'timeout'`, no auto-played move), and the finish screen already speaks
 * that reason for both modes (`logic/log.ts`). The engine's own result never carries a clock — the
 * rules have no clock — so the one cast below is the seam where a client-clock end becomes the
 * state the shared finish path reads. Nothing in `src/engine/` changes.
 */
export const blitzTimeoutResult = (state: State): FinishResult => ({
  winner: 1 as Player,
  reason: 'timeout',
  scores: scores(state),
});

/** The finished state a timed-out Blitz match continues as (same guards as the engine's own end). */
export const blitzTimeoutState = (state: State): State => ({
  ...state,
  phase: 'GAME_OVER',
  rotPick: null,
  result: blitzTimeoutResult(state) as unknown as GameResult,
});
