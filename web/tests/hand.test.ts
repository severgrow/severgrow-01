import { describe, expect, it } from 'vitest';
import type { Card } from '../../src/engine/index.js';
import { comboGroups, handOrder, nextSort } from '../src/logic/hand.js';

const c = (id: number, suit: 0 | 1 | 2 | 3, rank: number): Card => ({ id, suit, rank });
const H = [c(1, 2, 7), c(2, 0, 9), c(3, 1, 3), c(4, 1, 4), c(5, 1, 5), c(6, 0, 3), c(7, 3, 3)];

describe('the hand (overhaul item 3)', () => {
  it('sorts by suit then number, or by number then suit', () => {
    expect(handOrder(H, 'suit').map((x) => x.id)).toEqual([6, 2, 3, 4, 5, 1, 7]);
    expect(handOrder(H, 'number').map((x) => x.id)).toEqual([6, 3, 7, 4, 5, 1, 2]);
    expect(nextSort('suit')).toBe('number');
    expect(nextSort('number')).toBe('suit');
  });
  it('never changes the hand it is given', () => {
    const copy = JSON.stringify(H);
    handOrder(H, 'number');
    comboGroups(H);
    expect(JSON.stringify(H)).toBe(copy);
  });
  it('brackets the cards of each combo, and only those', () => {
    const g = comboGroups(H);
    // 3-4-5 of suit 1 is a line; the three 3s could be a clump but share the 3 of suit 1
    expect(g.size).toBeGreaterThanOrEqual(3);
    const groups = new Set(g.values());
    for (const k of groups) expect([...g.values()].filter((x) => x === k).length).toBeGreaterThanOrEqual(3);
    expect(g.has(2)).toBe(false); // the lone 9
    expect(comboGroups([c(1, 0, 2), c(2, 1, 9)]).size).toBe(0);
  });
});
