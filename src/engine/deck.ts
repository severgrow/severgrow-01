import { DECK_STREAM } from './constants.js';
import { deriveSeed, mulberry32, shuffle } from './prng.js';
import type { Card } from './types.js';

/** Seeded shuffle on the deck stream (once per game). Returns fresh card objects. */
export const shuffleDeck = (cards: readonly Card[], seed: number): Card[] =>
  shuffle(
    cards.map((c) => ({ ...c })),
    mulberry32(deriveSeed(seed, DECK_STREAM)),
  );

/** Draws up to `count` cards from the top (index 0). Draws what exists if short. */
export const drawFromDeck = (deck: readonly Card[], count: number): { drawn: Card[]; deck: Card[] } => {
  if (!Number.isInteger(count) || count < 0) throw new RangeError(`drawFromDeck: invalid count ${count}`);
  return { drawn: deck.slice(0, count), deck: deck.slice(count) };
};
