// The browser test's "stuck" position really is stuck: both sides' Grow steps are empty, the
// board never changes over whole turns, and nobody is strangled.
import { describe, expect, it } from 'vitest';
import { apply, legalActions, viewFor } from '../../src/engine/index.js';
import type { State } from '../../src/engine/index.js';
import { GreedyBot } from '../../src/bots/GreedyBot.js';
import { stuckBoard } from '../e2e/empty-positions.js';
import { growIsEmpty } from '../src/logic/emptyturn.js';

describe('the stuck position', () => {
  it('four turns in a row: each Grow step is empty and the board stays the same', () => {
    let s: State = stuckBoard();
    const board = JSON.stringify(s.board);
    let grows = 0;
    for (let i = 0; i < 40 && grows < 4; i++) {
      const v = viewFor(s, s.actor);
      if (s.phase === 'ACT') {
        expect(growIsEmpty(legalActions(v))).toBe(true);
        grows++;
      }
      s = apply(s, GreedyBot.chooseAction(v));
      expect(s.phase).not.toBe('GAME_OVER');
    }
    expect(grows).toBe(4);
    expect(JSON.stringify(s.board)).toBe(board);
  });
});
