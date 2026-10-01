import { DECK_STREAM } from './constants.js';
import { deriveSeed, mulberry32, shuffle } from './prng.js';
import type { Card } from './types.js';

/**
 * Seeded shuffle on the deck stream. Returns fresh card objects. Attempt 0 is the
 * original deal; later attempts (the opening-combo redeal, v0.4) use derived seeds.
 */
export const shuffleDeck = (cards: readonly Card[], seed: number, attempt = 0): Card[] => {
  const base = deriveSeed(seed, DECK_STREAM);
  return shuffle(
    cards.map((c) => ({ ...c })),
    mulberry32(attempt === 0 ? base : deriveSeed(base, attempt)),
  );
};

/** Draws up to `count` cards from the top (index 0). Draws what exists if short. */
export const drawFromDeck = (deck: readonly Card[], count: number): { drawn: Card[]; deck: Card[] } => {
  if (!Number.isInteger(count) || count < 0) throw new RangeError(`drawFromDeck: invalid count ${count}`);
  return { drawn: deck.slice(0, count), deck: deck.slice(count) };
};
