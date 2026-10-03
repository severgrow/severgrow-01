// The hand's order and its combo brackets (UI overhaul, item 3). Pure: the engine's own
// combo search decides which cards belong together; the order is only how they are shown.
import { bestMeldPartition } from '../../../src/engine/index.js';
import type { Card } from '../../../src/engine/index.js';

export type HandSort = 'suit' | 'number';
export const HAND_SORTS: readonly HandSort[] = ['suit', 'number'];

/** The hand as shown: by suit then number, or by number then suit (ties by card id). */
export const handOrder = (hand: readonly Card[], mode: HandSort): Card[] =>
  [...hand].sort((a, b) => (mode === 'suit' ? a.suit - b.suit || a.rank - b.rank : a.rank - b.rank || a.suit - b.suit) || a.id - b.id);

/** Which combo (0, 1, ...) each card belongs to in the best split of the hand; cards in none are absent. */
export const comboGroups = (hand: readonly Card[]): Map<number, number> => {
  const out = new Map<number, number>();
  bestMeldPartition(hand).melds.forEach((m, i) => {
    for (const c of m) out.set(c.id, i);
  });
  return out;
};

/** The other sort mode (the Sort button toggles between them). */
export const nextSort = (mode: HandSort): HandSort => (mode === 'suit' ? 'number' : 'suit');
