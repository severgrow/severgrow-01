// The deck in the versions people play (Sprout and Seed): 72 cards, every number 1-9 exactly
// 8 times, every suit exactly 18 times, and a real deal keeps every card (hands + throw pile +
// deck = the whole deck, nothing lost, nothing doubled).
import { describe, expect, it } from 'vitest';
import { RULESETS, createCards, newGame, resolveConfig } from '../../src/engine/index.js';
import type { Card } from '../../src/engine/index.js';

const count = (cards: readonly Card[], key: 'rank' | 'suit') => {
  const out = new Map<number, number>();
  for (const c of cards) out.set(c[key], (out.get(c[key]) ?? 0) + 1);
  return out;
};

describe.each(Object.entries(RULESETS))('the %s version deck', (_name, rules) => {
  const cards = createCards(resolveConfig(rules));

  it('has 72 cards', () => {
    expect(cards).toHaveLength(72);
  });

  it('every number 1 to 9 appears exactly 8 times (the same for every number)', () => {
    const byNumber = count(cards, 'rank');
    expect([...byNumber.keys()].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    for (const n of byNumber.values()) expect(n).toBe(8);
  });

  it('every suit (Moss, Ash, Dew, Ember) appears exactly 18 times: 2 of each number', () => {
    const bySuit = count(cards, 'suit');
    expect([...bySuit.keys()].sort()).toEqual([0, 1, 2, 3]);
    for (const n of bySuit.values()) expect(n).toBe(18);
    for (const suit of [0, 1, 2, 3])
      for (let rank = 1; rank <= 9; rank++) expect(cards.filter((c) => c.suit === suit && c.rank === rank)).toHaveLength(2);
  });

  it('after a real deal (100 different games) no card is lost or doubled', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const g = newGame(seed, rules);
      const all = [...g.hands[0], ...g.hands[1], ...g.discard, ...g.deck];
      expect(all).toHaveLength(72);
      expect(new Set(all.map((c) => c.id)).size).toBe(72);
      for (const n of count(all, 'rank').values()) expect(n).toBe(8);
      for (const n of count(all, 'suit').values()) expect(n).toBe(18);
    }
  });
});
