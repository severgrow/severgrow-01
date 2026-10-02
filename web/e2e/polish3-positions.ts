// Positions for the UI polish pass 3 screenshots and browser tests (deterministic: found by
// letting GreedyBot play itself from fixed seeds).
import { coordKey, legalActions, viewFor } from '../../src/engine/index.js';
import type { Action, State } from '../../src/engine/index.js';
import { playGame } from '../tests/ui-helpers.js';

const count = (s: State, p: number) => Object.values(s.board).filter((t) => t && t.owner === p).length;
const firstAct = (want: (s: State, legal: Action[]) => boolean, from = 1, to = 400): State => {
  for (let seed = from; seed <= to; seed++) {
    let found: State | null = null;
    playGame(seed, ({ after }) => {
      if (found || after.actor !== 0 || after.phase !== 'ACT' || after.fruitUsed[0] > 0) return;
      if (want(after, legalActions(viewFor(after, 0)))) found = after;
    });
    if (found) return found;
  }
  throw new Error('no such position');
};

/** My Grow step, Fruit unused, and a Fruit can remove one of the opponent's top-rank tiles. */
export const fruitOnTop = (): { state: State; target: string } => {
  const s = firstAct((st, legal) =>
    count(st, 0) >= 6 && count(st, 1) >= 8 && legal.some((a) => a.t === 'Fruit' && st.board[coordKey(a.target)]?.strength === st.config.maxRank),
  );
  const a = legalActions(viewFor(s, 0)).find((x) => x.t === 'Fruit' && s.board[coordKey(x.target)]?.strength === s.config.maxRank) as Extract<Action, { t: 'Fruit' }>;
  return { state: s, target: coordKey(a.target) };
};

/** My Grow step, Fruit unused, but no Fruit is possible yet, with an opponent tile on the board. */
export const fruitNotYet = (): { state: State; target: string } => {
  const s = firstAct((st, legal) => count(st, 1) >= 4 && !legal.some((a) => a.t === 'Fruit'));
  const target = Object.keys(s.board).find((k) => s.board[k]?.owner === 1 && !s.board[k]?.root)!;
  return { state: s, target };
};

/** My Grow step with a line of 3 that can be placed in several ways. */
export const lineChoice = (): { state: State } => ({
  state: firstAct((st, legal) => count(st, 0) >= 4 && legal.filter((a) => a.t === 'MeldRun' && a.cards.length === 3).length >= 3),
});

/** My Grow step with a clump of 3 that can be placed in several ways. */
export const clumpChoice = (): { state: State } => ({
  state: firstAct((st, legal) => count(st, 0) >= 4 && legal.filter((a) => a.t === 'MeldSet' && a.cards.length === 3).length >= 3),
});
