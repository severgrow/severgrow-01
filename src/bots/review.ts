// GAME REVIEW: the player's turning point (owner, 2026-10-23). Replays a finished game and, at
// every Grow-step choice the reviewed player made, compares what they played with the best move
// they had, judged by GreedyBot's full evaluation from THEIR view at that moment (so no hidden card
// is ever read). The turning point is the choice with the biggest gap. Pure and deterministic.
import { apply, coordKey, viewFor } from '../engine/index.js';
import type { Action, Player, State } from '../engine/index.js';
import { rankActions, scoreBoardMove } from './GreedyBot.js';
import { NEVER } from './tactics.js';

/** Below this gap (in points, as the evaluation counts them) a choice is not called a slip. */
export const REVIEW_MIN_GAIN = 2;

export type Gap = { index: number; turn: number; gain: number };
export type TurningPoint = {
  /** Index of the played action in the log; `before` is the state just before it. */
  index: number;
  turn: number;
  before: State;
  played: Action;
  better: Action;
  /** How much better the better move scores (the evaluation's points). */
  gain: number;
};

/** The kinds of move the review judges: the choices of the Grow step (ending it early included). */
const GROW_KINDS = new Set<Action['t']>(['Bloom', 'Sprout', 'PlayFruit', 'MegaBomb', 'EndAct']);

/** One spelling per move: a Bloom's tiles and cards are paired and ordered, so order never matters. */
const moveKey = (a: Action): string => {
  if (a.t === 'Bloom') return `Bloom|${a.hexes.map((h, i) => `${coordKey(h)}:${a.cards[i]}`).sort().join(',')}`;
  return JSON.stringify(a);
};

const scoreOf = (state: State, me: Player, a: Action, ranked: Map<string, number>): number => {
  const known = ranked.get(moveKey(a));
  if (known !== undefined && known > NEVER / 2) return known;
  if (a.t === 'EndAct') return 0;
  if (a.t === 'Bloom' || a.t === 'Sprout' || a.t === 'PlayFruit' || a.t === 'MegaBomb') return scoreBoardMove(viewFor(state, me), a).score;
  return 0;
};

/**
 * `end`: the game's real final state, when known. A log that replays to any other board (the wrong
 * starting position) gives no review rather than a review of a different game.
 */
export type ReviewOptions = { all?: boolean; end?: State };

export function findTurningPoint(start: State, log: readonly Action[], me: Player, opts?: ReviewOptions & { all?: false }): TurningPoint | null;
export function findTurningPoint(start: State, log: readonly Action[], me: Player, opts: ReviewOptions & { all: true }): (TurningPoint & { gaps: Gap[] }) | null;
export function findTurningPoint(start: State, log: readonly Action[], me: Player, opts: ReviewOptions = {}) {
  let s = start;
  let best: TurningPoint | null = null;
  const gaps: Gap[] = [];
  for (let i = 0; i < log.length; i++) {
    const a = log[i]!;
    if (s.phase !== 'GAME_OVER' && s.actor === me && GROW_KINDS.has(a.t)) {
      const view = viewFor(s, me);
      const ranked = rankActions(view).filter((x) => GROW_KINDS.has(x.action.t) && x.score > NEVER / 2);
      const top = ranked[0];
      if (top) {
        const scores = new Map(ranked.map((x) => [moveKey(x.action), x.score] as const));
        const gain = top.score - scoreOf(s, me, a, scores);
        if (moveKey(top.action) !== moveKey(a) && gain > 0) {
          gaps.push({ index: i, turn: s.turnNumber, gain });
          if (gain >= REVIEW_MIN_GAIN && (!best || gain > best.gain)) {
            best = { index: i, turn: s.turnNumber, before: s, played: a, better: top.action, gain };
          }
        }
      }
    }
    try {
      s = apply(s, a);
    } catch {
      // Not a replayable log (an online seat keeps only its own moves): no review at all.
      return null;
    }
  }
  if (opts.end && JSON.stringify(s.board) !== JSON.stringify(opts.end.board)) return null;
  if (!best) return null;
  return opts.all ? { ...best, gaps } : best;
}
