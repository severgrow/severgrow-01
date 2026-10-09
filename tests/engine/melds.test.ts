import { describe, expect, it } from 'vitest';
import {
  IllegalActionError,
  isValidRun,
  isValidSet,
  takeCards,
  validateRun,
  validateSet,
} from '../../src/engine/index.js';
import { card, codeOf } from '../helpers.js';

const MOSS = 0;
const ASH = 1;
const DEW = 2;
const EMBER = 3;

describe('runs (numbers in a row, one suit)', () => {
  it('accepts 3+ consecutive ranks of one suit', () => {
    expect(isValidRun([card(1, MOSS, 3), card(2, MOSS, 4), card(3, MOSS, 5)])).toBe(true);
    expect(isValidRun([1, 2, 3, 4, 5, 6, 7, 8, 9].map((r) => card(r, ASH, r)))).toBe(true);
  });

  it('ignores input order and returns cards sorted by ascending rank', () => {
    const cards = [card(3, DEW, 7), card(1, DEW, 5), card(2, DEW, 6)];
    expect(isValidRun(cards)).toBe(true);
    expect(validateRun(cards).map((c) => c.rank)).toEqual([5, 6, 7]);
    expect(cards.map((c) => c.rank)).toEqual([7, 5, 6]); // input untouched
  });

  it('rejects 2-card runs', () => {
    expect(isValidRun([card(1, MOSS, 3), card(2, MOSS, 4)])).toBe(false);
    expect(codeOf(() => validateRun([card(1, MOSS, 3), card(2, MOSS, 4)]))).toBe('RUN_TOO_SHORT');
  });

  it('rejects gaps', () => {
    const cards = [card(1, MOSS, 3), card(2, MOSS, 5), card(3, MOSS, 6)];
    expect(isValidRun(cards)).toBe(false);
    expect(codeOf(() => validateRun(cards))).toBe('RUN_NOT_CONSECUTIVE');
  });

  it('rejects mixed suits', () => {
    const cards = [card(1, MOSS, 3), card(2, ASH, 4), card(3, MOSS, 5)];
    expect(isValidRun(cards)).toBe(false);
    expect(codeOf(() => validateRun(cards))).toBe('RUN_MIXED_SUITS');
  });

  it('rejects wraparound (8-9-1)', () => {
    const cards = [card(1, EMBER, 8), card(2, EMBER, 9), card(3, EMBER, 1)];
    expect(isValidRun(cards)).toBe(false);
    expect(codeOf(() => validateRun(cards))).toBe('RUN_NOT_CONSECUTIVE');
  });

  it('rejects duplicate ranks (both copies of one card)', () => {
    const cards = [card(1, MOSS, 3), card(2, MOSS, 3), card(3, MOSS, 4)];
    expect(isValidRun(cards)).toBe(false);
    expect(codeOf(() => validateRun(cards))).toBe('RUN_NOT_CONSECUTIVE');
  });
});

describe('sets (Bloom cards)', () => {
  it('accepts 3 and 4 cards of one rank in different suits', () => {
    expect(isValidSet([card(1, MOSS, 6), card(2, ASH, 6), card(3, DEW, 6)])).toBe(true);
    expect(
      isValidSet([card(1, MOSS, 6), card(2, ASH, 6), card(3, DEW, 6), card(4, EMBER, 6)]),
    ).toBe(true);
    expect(validateSet([card(1, MOSS, 6), card(2, ASH, 6), card(3, DEW, 6)])).toHaveLength(3);
  });

  it('rejects 2-card and 7-card sets, while allowing duplicate suits through 6', () => {
    expect(isValidSet([card(1, MOSS, 6), card(2, ASH, 6)])).toBe(false);
    expect(codeOf(() => validateSet([card(1, MOSS, 6), card(2, ASH, 6)]))).toBe('SET_WRONG_SIZE');
    const five = [card(1, MOSS, 6), card(2, ASH, 6), card(3, DEW, 6), card(4, EMBER, 6), card(5, MOSS, 6)];
    expect(validateSet(five)).toHaveLength(5);
    expect(codeOf(() => validateSet([...five,card(6, ASH, 6),card(7, DEW, 6)]))).toBe('SET_WRONG_SIZE');
  });

  it('rejects mixed ranks', () => {
    const cards = [card(1, MOSS, 6), card(2, ASH, 6), card(3, DEW, 7)];
    expect(isValidSet(cards)).toBe(false);
    expect(codeOf(() => validateSet(cards))).toBe('SET_MIXED_RANKS');
  });

  it('allows duplicate suits when cards are distinct copies of the same rank', () => {
    const cards = [card(1, MOSS, 6), card(2, MOSS, 6), card(3, DEW, 6)];
    expect(isValidSet(cards)).toBe(true);
    expect(validateSet(cards)).toHaveLength(3);
  });
});

describe('takeCards', () => {
  const hand = [card(10, MOSS, 3), card(11, MOSS, 4), card(12, MOSS, 5)];

  it('returns the cards for the given ids in input order', () => {
    expect(takeCards(hand, [12, 10]).map((c) => c.id)).toEqual([12, 10]);
  });

  it('rejects ids not in hand', () => {
    expect(codeOf(() => takeCards(hand, [10, 99]))).toBe('CARD_NOT_IN_HAND');
  });

  it('rejects the same id twice', () => {
    expect(codeOf(() => takeCards(hand, [10, 10, 11]))).toBe('DUPLICATE_CARD');
  });

  it('rejects malformed ids', () => {
    expect(codeOf(() => takeCards(hand, [1.5]))).toBe('CARD_NOT_IN_HAND');
    expect(codeOf(() => takeCards(hand, 'x' as never))).toBe('MALFORMED_ACTION');
  });

  it('throws IllegalActionError', () => {
    expect(() => takeCards(hand, [99])).toThrow(IllegalActionError);
  });
});
