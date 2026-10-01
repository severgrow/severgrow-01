// A simple opponent. It only reads its own View (never your hand) and only
// chooses from the moves the page offers in the current mode, so it always
// follows the rules (and never knocks in Lite).
import {
  applyFruit,
  applyPlacement,
  bestMeldPartition,
  coordKey,
  planFruit,
  planRun,
  planSet,
  removeTiles,
  score,
  sever,
  strangleOutcome,
} from '../../src/engine/index.js';
import type { Action, Tile, View } from '../../src/engine/index.js';
import { visibleMoves } from './presets.js';
import type { Mode } from './presets.js';

type Board = Record<string, Tile | null>;

/** How much better the board is for the bot after a move (points gained + points taken). */
const boardValue = (v: View, after: Board): number => {
  const me = v.player;
  const opp = me === 0 ? 1 : 0;
  const ctxBefore = { config: v.config, terrain: v.terrain, board: v.board };
  const ctxAfter = { config: v.config, terrain: v.terrain, board: after };
  const outcome = strangleOutcome(ctxAfter);
  if (outcome?.reason === 'strangle') return outcome.loser === opp ? 1000 : -1000;
  const mine = score(ctxAfter, me) - score(ctxBefore, me);
  const theirs = score(ctxBefore, opp) - score(ctxAfter, opp);
  return mine + theirs;
};

const actValue = (v: View, a: Action): number => {
  const p = v.player;
  if (a.t === 'MeldRun' || a.t === 'MeldSet') {
    const plan =
      a.t === 'MeldRun' ? planRun(v, p, v.hand, a.cards, a.start, a.dir) : planSet(v, p, v.hand, a.cards, a.hexes);
    const placed = applyPlacement(v.board, plan).board;
    // Small bonus for shedding card points (less Rot risk).
    return boardValue(v, sever(placed, v.config, p).board) + plan.cards.reduce((s, c) => s + c.rank, 0) * 0.05;
  }
  if (a.t === 'Fruit') {
    const fruited = applyFruit(v.board, planFruit(v, p, v.fruitUsed[p], a.sacrifice, a.target));
    return boardValue(v, sever(fruited, v.config, p).board) - 0.5;
  }
  return 0;
};

export const chooseAction = (v: View, mode: Mode = 'classic'): Action => {
  const acts = visibleMoves(v, mode);
  if (acts.length === 0) throw new Error('bot has no legal actions');
  switch (v.phase) {
    case 'DRAW': {
      const top = v.discard.at(-1);
      const take = acts.find((a) => a.t === 'Draw' && a.from === 'discard');
      const deck = acts.find((a) => a.t === 'Draw' && a.from === 'deck');
      if (take && top && (!deck || bestMeldPartition([...v.hand, top]).melds.some((m) => m.some((c) => c.id === top.id)))) {
        return take;
      }
      return deck ?? acts[0]!;
    }
    case 'ACT': {
      let best: Action = acts.find((a) => a.t === 'EndAct')!;
      let bestValue = 0.5;
      for (const a of acts) {
        const value = actValue(v, a);
        if (value > bestValue) {
          best = a;
          bestValue = value;
        }
      }
      return best;
    }
    case 'DISCARD': {
      const leftover = new Set(bestMeldPartition(v.hand).leftover.map((c) => c.id));
      const rank = (a: Action) => (a.t === 'Discard' ? (v.hand.find((c) => c.id === a.card)?.rank ?? 0) : 0);
      const pool = acts.filter((a) => a.t === 'Discard' && leftover.has(a.card));
      return [...(pool.length > 0 ? pool : acts)].sort((x, y) => rank(y) - rank(x))[0]!;
    }
    case 'KNOCK': {
      const knock = acts.find((a) => a.t === 'Knock');
      return knock && v.score > v.opponentScore + 1 ? knock : acts.find((a) => a.t === 'Continue')!;
    }
    case 'ROT_PICK': {
      // Pick the opponent tile whose loss cuts off the most of their network.
      const opp = v.turnPlayer;
      const cut = (a: Action) => {
        if (a.t !== 'RotPick') return 0;
        const b = sever(removeTiles(v.board, [a.coord]), v.config, v.player).board;
        return Object.entries(v.board).filter(([k, t]) => t?.owner === opp && !b[k] && k !== coordKey(a.coord)).length;
      };
      return [...acts].sort((x, y) => cut(y) - cut(x))[0]!;
    }
    default:
      return acts[0]!;
  }
};
