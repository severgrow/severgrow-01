import { describe, expect, it } from 'vitest';
import type { Card } from '../../src/engine/index.js';
import { discardArrival } from '../src/ui/discard-arrival.js';
describe('discard pile arrival order', () => {
  it('covers each previous card in sequence, even when several turns arrived together', () => {
    const a: Card = { id: 1, suit: 0, rank: 3 };
    const b: Card = { id: 2, suit: 1, rank: 4 };
    const c: Card = { id: 3, suit: 2, rank: 5 };
    const original = [a];
    const first = discardArrival(original, b);
    expect(first).toEqual([a, b]);
    expect(discardArrival(first, c)).toEqual([a, b, c]);
    expect(discardArrival(first, b)).toBe(first);
    expect(original).toEqual([a]);
  });
});
