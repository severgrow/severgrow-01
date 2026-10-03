import { IllegalActionError } from './errors.js';
import type { Card } from './types.js';

const byRank = (cards: readonly Card[]): Card[] => [...cards].sort((a, b) => a.rank - b.rank || a.id - b.id);

/** v0.6: a Fruit card (no suit, no number) is never part of a combo, and never wild. */
const numbered = (cards: readonly Card[]): void => {
  if (cards.some((c) => c.suit === null)) throw new IllegalActionError('NOT_A_NUMBER_CARD', 'a Fruit card cannot be in a combo');
};

/**
 * Validates a run (spec 8.2): 3+ cards, one suit, consecutive ranks, no wraparound.
 * Returns the cards sorted by ascending rank. Throws IllegalActionError.
 */
export const validateRun = (cards: readonly Card[]): Card[] => {
  numbered(cards);
  if (cards.length < 3) throw new IllegalActionError('RUN_TOO_SHORT', 'a run needs 3+ cards');
  const sorted = byRank(cards);
  const suit = sorted[0]!.suit;
  if (sorted.some((c) => c.suit !== suit)) throw new IllegalActionError('RUN_MIXED_SUITS', 'a run is one suit');
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i]!.rank !== sorted[i - 1]!.rank + 1) {
      throw new IllegalActionError('RUN_NOT_CONSECUTIVE', 'run ranks must be consecutive (no wraparound)');
    }
  }
  return sorted;
};

/**
 * Validates a set (spec 8.3): 3 or 4 cards, identical rank, all different suits.
 * Returns the cards in input order. Throws IllegalActionError.
 */
export const validateSet = (cards: readonly Card[]): Card[] => {
  numbered(cards);
  if (cards.length < 3 || cards.length > 4) throw new IllegalActionError('SET_WRONG_SIZE', 'a set is 3 or 4 cards');
  const rank = cards[0]!.rank;
  if (cards.some((c) => c.rank !== rank)) throw new IllegalActionError('SET_MIXED_RANKS', 'a set is one rank');
  if (new Set(cards.map((c) => c.suit)).size !== cards.length) {
    throw new IllegalActionError('SET_DUPLICATE_SUIT', 'set cards must all be different suits');
  }
  return [...cards];
};

const passes = (fn: () => unknown): boolean => {
  try {
    fn();
    return true;
  } catch (e) {
    if (e instanceof IllegalActionError) return false;
    throw e;
  }
};

export const isValidRun = (cards: readonly Card[]): boolean => passes(() => validateRun(cards));
export const isValidSet = (cards: readonly Card[]): boolean => passes(() => validateSet(cards));

/** Looks up distinct card ids in a hand, in input order. Throws IllegalActionError. */
export const takeCards = (hand: readonly Card[], ids: readonly number[]): Card[] => {
  if (!Array.isArray(ids)) throw new IllegalActionError('MALFORMED_ACTION', 'cards must be an array of ids');
  if (new Set(ids).size !== ids.length) throw new IllegalActionError('DUPLICATE_CARD', 'card ids must be distinct');
  return ids.map((id) => {
    const c = hand.find((h) => h.id === id);
    if (!c) throw new IllegalActionError('CARD_NOT_IN_HAND', `card ${String(id)} is not in hand`);
    return c;
  });
};
