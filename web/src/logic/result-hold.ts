// THE FINAL MOVE IS SEEN BEFORE THE RESULT (owner, 2026-10-25).
//
//   "when playing game online - if i have the last move of the game and do it and win -- opponent
//    doesn't get to see my final move because they get the 'you lost' end of game screen straight
//    away -- it should always show the final move first and then show the end of game screen"
//
// The finishing plate covers the board, so it may only go up once the board has applied and
// SETTLED the move that decided the match. `boardHasSettled` is that one decision, pure and
// browser-free, so a unit test can pin every way a duel finishes (KO, deck exhaustion, timeout,
// resignation, reduced motion) without driving two phones.
import type { Step } from './anim.js';

/**
 * Steps that change nothing the player is watching, so none of them may hold the plate:
 *  - `end`  the outcome's own sound/haptic/flourish (the board is already final);
 *  - `turn` the next turn's hand-over (there is no next turn in a decided match);
 *  - `sync` the closing truth the move's own steps have already applied.
 * EVERY other kind can change the board, a hand, a pile or a landmark, so it holds.
 */
const SETTLED: ReadonlySet<Step['k']> = new Set<Step['k']>(['end', 'turn', 'sync']);

/** True for a step that cannot change what the player is looking at. */
export const isSettledStep = (k: Step['k']): boolean => SETTLED.has(k);

export type SettleState = {
  /** The steps still waiting in the queue, in play order (see `AnimQueue.kinds()`). */
  waiting: readonly Step['k'][];
  /** The step the pump is playing right now, or null when nothing is in flight. */
  playing: Step['k'] | null;
  /** Reduce motion: no flight will play, so there is nothing that could be missed. */
  reducedMotion: boolean;
};

/**
 * MAY THE RESULT PLATE COVER THE BOARD?
 *
 * Both the queue AND the step in flight are read: a single-tile grow takes its queue slot at the
 * start of its 336 ms pop, so `waiting` can look empty while the tile is still landing.
 */
export const boardHasSettled = ({ waiting, playing, reducedMotion }: SettleState): boolean => {
  if (reducedMotion) return true; // nothing moves, so there is no move to miss
  if (playing !== null && !SETTLED.has(playing)) return false;
  return waiting.every((k) => SETTLED.has(k));
};

/**
 * THE ONLY FALLBACK, and it is a STALL — never a delay. It fires only when a held board has made
 * no progress at all (no step landed, no tile revealed, the queue unchanged) for this long, which
 * is the signature of a lost step, not of a slow one. The slowest real finish beat (the KO's
 * landmark at Slow speed: ~2.9 s of beats plus its 0.6 s tail, ~3.5 s) sits well under it, so it
 * can never cut a legitimate animation short.
 */
export const RESULT_HOLD_STALL_MS = 6_000;

/** True once a held board has been silent for the whole stall window. */
export const resultHoldStalled = (quietMs: number): boolean => quietMs >= RESULT_HOLD_STALL_MS;
