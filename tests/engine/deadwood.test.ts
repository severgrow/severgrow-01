import { describe, expect, it } from 'vitest';
import {
  bestMeldPartition,
  createCards,
  deadwood,
  isValidRun,
  isValidSet,
  mulberry32,
  resolveConfig,
  shuffle,
} from '../../src/engine/index.js';
import type { Card, Suit } from '../../src/engine/index.js';
import { card, clone } from '../helpers.js';

const MOSS = 0;
const ASH = 1;
const DEW = 2;
const EMBER = 3;

let nextId = 100;
const h = (...specs: [Suit, number][]): Card[] => specs.map(([s, r]) => card(nextId++, s, r));
const sum = (cards: Card[]) => cards.reduce((a, c) => a + c.rank, 0);

/** Independent brute force: try every way to split the hand into melds + deadwood. */
const bruteDeadwood = (hand: Card[]): number => {
  if (hand.length === 0) return 0;
  const [first, ...rest] = hand as [Card, ...Card[]];
  let best = first.rank + bruteDeadwood(rest);
  const n = rest.length;
  for (let mask = 1; mask < 1 << n; mask++) {
    const group = [first];
    const others: Card[] = [];
    rest.forEach((c, i) => ((mask >> i) & 1 ? group : others).push(c));
    if (group.length < 3) continue;
    // Deadwood still uses the original 3–4 different-suit meld scoring.
    if (isValidRun(group) || isValidSet(group, false)) best = Math.min(best, bruteDeadwood(others));
  }
  return best;
};

describe('deadwood (spec 9.1)', () => {
  it('empty hand is 0', () => {
    expect(deadwood([])).toBe(0);
  });

  it('no melds: every card counts', () => {
    const hand = h([MOSS, 1], [ASH, 3], [DEW, 5], [EMBER, 7], [MOSS, 9]);
    expect(deadwood(hand)).toBe(25);
  });

  it('all cards used: 0', () => {
    const hand = h([MOSS, 3], [MOSS, 4], [MOSS, 5], [ASH, 7], [DEW, 7], [EMBER, 7], [MOSS, 7]);
    expect(deadwood(hand)).toBe(0);
  });

  it('a run of 3+ and a single leftover', () => {
    expect(deadwood(h([DEW, 4], [DEW, 5], [DEW, 6], [DEW, 7], [ASH, 2]))).toBe(2);
  });

  it('3- and 4-card sets', () => {
    expect(deadwood(h([MOSS, 8], [ASH, 8], [DEW, 8], [EMBER, 1]))).toBe(1);
    expect(deadwood(h([MOSS, 8], [ASH, 8], [DEW, 8], [EMBER, 8], [EMBER, 1]))).toBe(1);
  });

  it('run/set overlap: a card can serve only one meld, the better split wins', () => {
    // Moss 5-6-7 run and 7s set (Moss 7, Ash 7, Dew 7) share Moss 7.
    // Run + Ash7 + Dew7 deadwood = 14; set + Moss5 + Moss6 = 11.
    const hand = h([MOSS, 5], [MOSS, 6], [MOSS, 7], [ASH, 7], [DEW, 7]);
    expect(deadwood(hand)).toBe(11);
  });

  it('a 4-card set can give a card to a run (alternative partitions pick the minimum)', () => {
    // 4 of 9s + Moss 7-8: use Moss 9 in run 7-8-9 and keep a 3-card set of 9s -> 0.
    const hand = h([MOSS, 9], [ASH, 9], [DEW, 9], [EMBER, 9], [MOSS, 7], [MOSS, 8]);
    expect(deadwood(hand)).toBe(0);
  });

  it('a long run can be split around a set', () => {
    // Moss 2..7 run of 6 + Ash 5, Dew 5: either run 2..7 (dw 10) or run 2-3-4, set 5s, run? 6-7 left -> 13.
    // or run 2..4 + set of 5s + Moss 6,7 dead = 13; best is whole run = 10.
    const hand = h([MOSS, 2], [MOSS, 3], [MOSS, 4], [MOSS, 5], [MOSS, 6], [MOSS, 7], [ASH, 5], [DEW, 5]);
    expect(deadwood(hand)).toBe(10);
  });

  it('duplicate copies: two runs of the same suit or a pair of copies', () => {
    // Two copies each of Ash 3,4,5 -> two runs, 0.
    expect(deadwood(h([ASH, 3], [ASH, 3], [ASH, 4], [ASH, 4], [ASH, 5], [ASH, 5]))).toBe(0);
    // Copies do not make a set (same suit).
    expect(deadwood(h([ASH, 6], [ASH, 6], [ASH, 6]))).toBe(18);
    // Copies do not extend a run.
    expect(deadwood(h([ASH, 6], [ASH, 6], [ASH, 7]))).toBe(19);
  });

  it('wraparound is not a run', () => {
    expect(deadwood(h([EMBER, 8], [EMBER, 9], [EMBER, 1]))).toBe(18);
  });

  it('does not mutate the hand', () => {
    const hand = h([MOSS, 5], [MOSS, 6], [MOSS, 7], [ASH, 7], [DEW, 7]);
    const before = clone(hand);
    deadwood(hand);
    bestMeldPartition(hand);
    expect(hand).toEqual(before);
  });

  it('matches an independent brute force on 3000 random 8-card hands', () => {
    const all = createCards(resolveConfig());
    const rng = mulberry32(2024);
    for (let i = 0; i < 3000; i++) {
      const hand = shuffle(all, rng).slice(0, 8);
      expect(deadwood(hand)).toBe(bruteDeadwood(hand));
    }
  }, 60_000);

  it('matches brute force on dense same-suit hands (worst case for search)', () => {
    const all = createCards(resolveConfig()).filter((c) => c.suit !== null && c.suit <= 1);
    const rng = mulberry32(7);
    for (let i = 0; i < 1000; i++) {
      const hand = shuffle(all, rng).slice(0, 8);
      expect(deadwood(hand)).toBe(bruteDeadwood(hand));
    }
  }, 60_000);
});

describe('bestMeldPartition', () => {
  it('returns melds and leftovers that partition the hand and achieve the minimum', () => {
    const all = createCards(resolveConfig());
    const rng = mulberry32(99);
    for (let i = 0; i < 500; i++) {
      const hand = shuffle(all, rng).slice(0, 8);
      const p = bestMeldPartition(hand);
      expect(p.deadwood).toBe(deadwood(hand));
      expect(sum(p.leftover)).toBe(p.deadwood);
      for (const m of p.melds) expect(isValidRun(m) || isValidSet(m)).toBe(true);
      const ids = [...p.melds.flat(), ...p.leftover].map((c) => c.id).sort((a, b) => a - b);
      expect(ids).toEqual(hand.map((c) => c.id).sort((a, b) => a - b));
    }
  });

  it('is deterministic', () => {
    const hand = h([MOSS, 5], [MOSS, 6], [MOSS, 7], [ASH, 7], [DEW, 7], [EMBER, 7]);
    expect(bestMeldPartition(hand)).toEqual(bestMeldPartition(hand));
  });
});
