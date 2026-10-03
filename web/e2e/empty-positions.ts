// A position where nobody can grow: every playable hex holds a 9 (mine near my root, theirs near
// theirs), so there is no empty hex, nothing weaker to grow over and nothing to strengthen.
// Every Grow step is then empty: used by the Step 2 browser test (taps and time of an empty turn).
import { hexDistance, newGame, rootCoord } from '../../src/engine/index.js';
import type { State } from '../../src/engine/index.js';

/** My Draw step on turn 5, with every hex full of 9s. */
export const stuckBoard = (seed = 21): State => {
  const s = newGame(seed);
  const { boardRadius: R, rootStyle } = s.config;
  const roots = [rootCoord(0, rootStyle, R), rootCoord(1, rootStyle, R)] as const;
  const board: State['board'] = { ...s.board };
  for (const k of Object.keys(board)) {
    if (board[k]?.root || s.terrain[k] === 'rock') continue;
    const [q, r] = k.split(',').map(Number) as [number, number];
    const d0 = hexDistance({ q, r }, roots[0]);
    const d1 = hexDistance({ q, r }, roots[1]);
    // ties go by the column, so each side's area stays one connected piece
    const owner = d0 < d1 || (d0 === d1 && q < 0) ? 0 : 1;
    board[k] = { owner, strength: 9 };
  }
  return { ...s, board, turnNumber: 5, fruitUsed: [s.config.fruitPerPlayer, s.config.fruitPerPlayer] };
};
