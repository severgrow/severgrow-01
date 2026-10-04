// v0.7 Step 1: the card rules did not change. On random hands, "this hand holds a group that
// can bloom" must equal "this hand held a combo under the old rules (a set or a run)".
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, bloomGroups, createCards, mulberry32 } from '../../src/engine/index.js';
import type { Card } from '../../src/engine/index.js';

/** The old rules, written out independently: a run of 3+ in one suit, or 3-4 of a number in different suits. */
const oldCombo = (hand: readonly Card[]): boolean => {
  const num = hand.filter((c) => c.suit !== null);
  for (let r = 1; r <= 9; r++) if (new Set(num.filter((c) => c.rank === r).map((c) => c.suit)).size >= 3) return true;
  for (const suit of [0, 1, 2, 3]) {
    const ranks = new Set(num.filter((c) => c.suit === suit).map((c) => c.rank));
    for (let r = 1; r <= 7; r++) if (ranks.has(r) && ranks.has(r + 1) && ranks.has(r + 2)) return true;
  }
  return false;
};

const deal = (n: number, rng: () => number, deck: Card[]): Card[] => {
  const a = [...deck];
  for (let i = 0; i < n; i++) {
    const j = i + Math.floor(rng() * (a.length - i));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a.slice(0, n);
};

/** Shares found (reported in the final report and docs/DECISIONS.md). */
export const SHARES: Record<number, number> = {};

describe('Bloom card groups equal the old combos', () => {
  // numbers 1-9 only (the 72 numbered cards)
  const deck = createCards({ ...DEFAULT_CONFIG, fruitCardCount: 0 });
  for (const n of [7, 8]) {
    it(`on 10,000 random ${n}-card hands`, () => {
      const rng = mulberry32(2026 + n);
      let yes = 0;
      for (let i = 0; i < 10_000; i++) {
        const hand = deal(n, rng, deck);
        const now = bloomGroups(hand).length > 0;
        expect(now, JSON.stringify(hand)).toBe(oldCombo(hand));
        if (now) yes++;
      }
      SHARES[n] = yes / 10_000;
      console.log(`hands of ${n} with a Bloom: ${(SHARES[n] * 100).toFixed(1)}%`);
      // about 24% at 7 cards and 34% at 8 (the brief's estimate), within a few points
      expect(SHARES[n]).toBeGreaterThan(n === 7 ? 0.18 : 0.27);
      expect(SHARES[n]).toBeLessThan(n === 7 ? 0.3 : 0.41);
    });
  }
});
