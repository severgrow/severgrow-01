import { describe, expect, it } from 'vitest';
import { apply, legalActions, newGame, viewFor } from '../../src/engine/index.js';
import type { Action, Card, State, View } from '../../src/engine/index.js';
import { chooseAction } from '../src/bot.js';
import { hexName, moveSentence } from '../src/names.js';
import { chain, fixture } from '../../tests/helpers.js';

const viewWith = (hand: Card[], opts: Parameters<typeof fixture>[0] = {}, patch: Partial<State> = {}): View => {
  const f = fixture(opts);
  const base = newGame(1);
  return viewFor({ ...base, board: f.board, terrain: f.terrain, hands: [hand, base.hands[1]], phase: 'ACT', ...patch }, 0);
};
const run = [
  { id: 1, suit: 0 as const, rank: 3 },
  { id: 2, suit: 0 as const, rank: 4 },
  { id: 3, suit: 0 as const, rank: 5 },
  { id: 4, suit: 2 as const, rank: 8 },
];

describe('moveSentence: one plain sentence per move', () => {
  it('names hexes by row letter and position', () => {
    expect(hexName({ q: 0, r: -3 }, 3)).toBe('A1');
    expect(hexName({ q: -1, r: 1 }, 3)).toBe('E3');
  });

  it('a Bloom from a run, with points', () => {
    const v = viewWith(run, { rich: ['0,0'] });
    expect(moveSentence(v, { t: 'Bloom', cards: [1, 2, 3], hexes: chain({ q: -1, r: 1 }, 1, 3) })).toBe('Bloom 3 tiles at C4, D4, E3 (+4 points)');
  });

  it('a Bloom from a set, with takeovers and cut-offs spelled out', () => {
    const set = [
      { id: 1, suit: 0 as const, rank: 6 },
      { id: 2, suit: 1 as const, rank: 6 },
      { id: 3, suit: 2 as const, rank: 6 },
      { id: 4, suit: 3 as const, rank: 1 },
    ];
    // Bot arm root-(1,-1)-(1,0)-(0,1), with (0,2) hanging only off (0,1).
    const v = viewWith(set, { tiles: { '0,1': [1, 2], '0,2': [1, 2], '1,0': [1, 2], '1,-1': [1, 2] } });
    expect(
      moveSentence(v, { t: 'Bloom', cards: [1, 2, 3], hexes: [{ q: -1, r: 1 }, { q: 0, r: 1 }, { q: -1, r: 2 }] }),
    ).toBe('Bloom 3 tiles at E3, E4, F3, taking 1 opponent tile and cutting off 1 more (+3 points)');
  });

  it('simple moves', () => {
    const v = viewWith(run, {}, { phase: 'DRAW' });
    expect(moveSentence(v, { t: 'Draw', from: 'deck' })).toBe('Draw a card from the deck');
    expect(moveSentence(v, { t: 'Draw', from: 'discard' })).toMatch(/^Take the .+ from the throw pile$/);
    expect(moveSentence(v, { t: 'EndAct' })).toBe("I'm done playing cards");
    expect(moveSentence(v, { t: 'Discard', card: 4 })).toBe('Throw Dew 8');
    expect(moveSentence(v, { t: 'Continue' })).toBe('End my turn');
  });

  it('every legal move in real games gets a sentence', () => {
    for (let seed = 1; seed <= 8; seed++) {
      let s: State = newGame(seed);
      for (let i = 0; i < 250 && s.phase !== 'GAME_OVER'; i++) {
        const v = viewFor(s, s.actor);
        for (const a of legalActions(v)) expect(moveSentence(v, a as Action).length).toBeGreaterThan(8);
        s = apply(s, chooseAction(v));
      }
    }
  }, 120_000);
});
