import { DECK_STREAM } from './constants.js';

/** Lab: the reshuffles' own PRNG streams (RESHUFFLE_STREAM + n for the n-th). */
const RESHUFFLE_STREAM = 100;
import { deriveSeed, mulberry32, shuffle } from './prng.js';
import type { Card, State } from './types.js';

/** Seeded shuffle on the deck stream (once per game). Returns fresh card objects. */
export const shuffleDeck = (cards: readonly Card[], seed: number): Card[] =>
  shuffle(
    cards.map((c) => ({ ...c })),
    mulberry32(deriveSeed(seed, DECK_STREAM)),
  );

/**
 * Lab (reshuffleDiscard): the throw pile, all but its top card, shuffled into the bottom of the
 * deck. Seeded by the game seed and a running count, so a game replays exactly. Nothing to
 * shuffle: the state comes back unchanged (a hand may then stay short).
 */
export const reshuffleDiscard = (s: State): State => {
  if (!s.config.reshuffleDiscard || s.discard.length <= 1) return s;
  const n = (s.reshuffles ?? 0) + 1;
  const top = s.discard[s.discard.length - 1]!;
  const fresh = shuffle(
    s.discard.slice(0, -1).map((c) => ({ ...c })),
    mulberry32(deriveSeed(s.seed, RESHUFFLE_STREAM + n)),
  );
  return { ...s, deck: [...s.deck, ...fresh], discard: [top], reshuffles: n };
};

/** Draws up to `count` cards from the top (index 0). Draws what exists if short. */
export const drawFromDeck = (deck: readonly Card[], count: number): { drawn: Card[]; deck: Card[] } => {
  if (!Number.isInteger(count) || count < 0) throw new RangeError(`drawFromDeck: invalid count ${count}`);
  return { drawn: deck.slice(0, count), deck: deck.slice(count) };
};
