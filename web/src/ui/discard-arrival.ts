import type { Card } from '../../../src/engine/index.js';

/** Advance the visible pile on arrival, not to the last card of a multi-turn server snapshot. */
export const discardArrival = (pile: Card[], card: Card): Card[] =>
  pile.at(-1)?.id === card.id ? pile : [...pile.filter(c => c.id !== card.id), card];
