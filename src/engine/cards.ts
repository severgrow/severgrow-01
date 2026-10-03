import { FRUIT_CARD_RANK, MIN_RANK, SUITS } from './constants.js';
import type { Card, RulesConfig } from './types.js';

/** v0.6: a Fruit card has no suit and no number. */
export const isFruitCard = (c: Card): boolean => c.suit === null;

/**
 * All cards in a fixed order (suit, then rank, then copy) with ids 0..n-1, then the
 * fruitCardCount Fruit cards (v0.6).
 * Identical copies have consecutive ids, so "lowest id among copies" is well defined.
 * IDs never affect gameplay.
 */
export const createCards = (config: RulesConfig): Card[] => {
  const cards: Card[] = [];
  for (const suit of SUITS) {
    for (let rank = MIN_RANK; rank <= config.maxRank; rank++) {
      for (let copy = 0; copy < config.copiesPerCard; copy++) {
        cards.push({ id: cards.length, suit, rank });
      }
    }
  }
  for (let i = 0; i < config.fruitCardCount; i++) cards.push({ id: cards.length, suit: null, rank: FRUIT_CARD_RANK });
  return cards;
};
