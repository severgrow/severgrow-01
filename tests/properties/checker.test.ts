import { describe, expect, it } from 'vitest';
import { newGame } from '../../src/engine/index.js';
import type { State } from '../../src/engine/index.js';
import { PropertyFailure, checkState } from '../../src/sim/invariants.js';

describe('the invariant checker catches broken states', () => {
  const base = newGame(2);
  const broken = (patch: (s: State) => void): State => {
    const s = JSON.parse(JSON.stringify(base)) as State;
    patch(s);
    return s;
  };
  const fails = (s: State, invariant: number) => {
    let err: unknown;
    try {
      checkState(s, new Set());
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(PropertyFailure);
    expect((err as PropertyFailure).invariant).toBe(invariant);
  };

  it('a clean new game passes', () => {
    expect(() => checkState(base, new Set())).not.toThrow();
  });
  it('1: a tile on rock', () => {
    const rock = Object.entries(base.terrain).find(([, t]) => t === 'rock')![0];
    fails(broken((s) => (s.board[rock] = { owner: 0, strength: 3 })), 1);
  });
  it('1: a tile off the board', () => {
    fails(broken((s) => (s.board['9,9'] = { owner: 0, strength: 3 })), 1);
  });
  it('2: a tile not connected to its root', () => {
    fails(broken((s) => (s.board['1,0'] = { owner: 0, strength: 3 })), 2);
  });
  it('3: a missing root', () => {
    fails(broken((s) => (s.board['-2,2'] = null)), 3);
  });
  it('4: a strength out of range', () => {
    fails(broken((s) => (s.board['-1,1'] = { owner: 0, strength: 10 })), 4);
  });
  it('5: a duplicated card', () => {
    fails(broken((s) => s.hands[1].push({ ...s.hands[0][0]! })), 5);
  });
  it('5: a vanished card', () => {
    fails(broken((s) => s.deck.pop()), 5);
  });
  it('9: too many turns', () => {
    fails(broken((s) => (s.turnNumber = 61)), 9);
  });

  it('a failure carries a replayable report', () => {
    const f = new PropertyFailure(2, 'detail', { seed: 5, actions: [{ t: 'Draw', from: 'deck' }] });
    expect(f.report.seed).toBe(5);
    expect(f.message).toMatch(/invariant 2/);
    expect(f.message).toMatch(/seed 5/);
  });
});
