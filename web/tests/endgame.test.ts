import { describe, expect, it } from 'vitest';
import { newGame, viewFor } from '../../src/engine/index.js';
import type { View } from '../../src/engine/index.js';
import { endgameNote, scoreBreakdown } from '../src/logic/endgame.js';
import { score } from '../../src/engine/index.js';
import { playGame } from './ui-helpers.js';

const at = (turnNumber: number, deckCount: number): View => ({ ...viewFor(newGame(1), 0), turnNumber, deckCount });

describe('the end of the game is never a surprise', () => {
  it('warns about the last turns (30 each by default)', () => {
    expect(endgameNote(at(1, 40))).toBeNull();
    expect(endgameNote(at(55, 40))).toBe('3 turns left');
    expect(endgameNote(at(57, 40))).toBe('2 turns left');
    expect(endgameNote(at(59, 40))).toBe('Last turn!');
  });
  it('warns when the deck is nearly empty', () => {
    expect(endgameNote(at(9, 6))).toBe('Only 6 cards left');
    expect(endgameNote(at(9, 1))).toBe('Only 1 card left');
    expect(endgameNote(at(9, 0))).toBe('Deck empty: last turn!');
  });
});

describe('final score breakdown', () => {
  it('tiles + gold tiles add up to the engine score', () => {
    for (const seed of [1, 2, 3]) {
      const s = playGame(seed);
      for (const p of [0, 1] as const) {
        const b = scoreBreakdown(s, p);
        expect(b.tiles + b.gold).toBe(score(s, p)); // a gold tile counts twice
        expect(b.gold).toBeLessThanOrEqual(b.tiles);
      }
    }
  });
});
