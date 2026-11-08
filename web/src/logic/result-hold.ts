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
import { MOTION } from './motion.js';

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

/**
 * One beat on the last tile, after the board has settled and before the plate covers it.
 * A finish that never moved the board (a timeout, a resignation, a match already over) does not
 * wait. Reduced motion does not wait. The beat is the move tempo, not an extra delay on the plate.
 */
export const RESULT_BREATH_MS = MOTION.move;

export type ResultBreath = {
  /** A result is wanted. False resets the breath, so the next match starts clean. */
  wanted: boolean;
  /** A board-changing step is in flight or still queued. */
  moving: boolean;
  reducedMotion: boolean;
  /** This finish has already seen the board move. */
  sawMotion: boolean;
  /** When the settled board started its beat, or null if it has not. */
  breathFrom: number | null;
  now: number;
};

export type ResultBreathNext = {
  /** The plate may cover the board. */
  show: boolean;
  sawMotion: boolean;
  breathFrom: number | null;
  /** Wake the page this many ms from now, or null when nothing is waiting. */
  waitMs: number | null;
};

export const stepResultBreath = (s: ResultBreath): ResultBreathNext => {
  if (!s.wanted) return { show: false, sawMotion: false, breathFrom: null, waitMs: null };
  if (s.reducedMotion) return { show: !s.moving, sawMotion: false, breathFrom: null, waitMs: null };
  const sawMotion = s.sawMotion || s.moving;
  // Still moving, or nothing ever moved: no beat. A timeout shows at once.
  if (s.moving || !sawMotion) return { show: !s.moving, sawMotion, breathFrom: null, waitMs: null };
  const from = s.breathFrom ?? s.now;
  const left = RESULT_BREATH_MS - (s.now - from);
  if (left <= 0) return { show: true, sawMotion: true, breathFrom: from, waitMs: null };
  return { show: false, sawMotion: true, breathFrom: from, waitMs: left };
};
