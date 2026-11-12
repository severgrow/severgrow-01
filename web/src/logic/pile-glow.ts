// THE THROW PILE'S GOLD LIGHT — the product's ONE rule for "this top card completes a Bloom".
//
// The light says it with the `futa04-bloom-draw` class (main.ts), and level 9's invariant test asks
// the same function, so the sentence and the light can never disagree. A card that merely repeats
// a face already in hand does not create a new Bloom: that is the rule the glow has always had.
import { bloomGroups } from '../../../src/engine/index.js';
import type { Card } from '../../../src/engine/index.js';

/** A group's identity as the glow compares it: suit and rank, never the hand's own card id. */
const faceKey = (cards: readonly Card[]): string =>
  cards.map((c) => `${c.suit}:${c.rank}`).sort().join('|');

/**
 * Would taking this Throw-pile top card make a Bloom the hand did not already have?
 * `expandedBloom` is the engine's own rule switch, passed through untouched.
 */
export const throwPileCompletesBloom = (
  hand: readonly Card[],
  top: Card | undefined,
  expandedBloom = true,
): boolean => {
  if (!top) return false;
  const before = new Set(bloomGroups(hand, expandedBloom).map((g) => faceKey(g.cards)));
  return bloomGroups([...hand, top], expandedBloom).some((g) => !before.has(faceKey(g.cards)));
};
