import type { Action } from '../../../src/engine/index.js';
import { kindOf } from './interaction.js';

/** Selecting two Bombs only chooses an already-legal recipe; it never plays a move. */
export const blastForPair = (legal: readonly Action[], first: number | null, second: number): string | null => {
  if (first === null || first === second) return null;
  const action = legal.find(a => a.t === 'MegaBomb' && a.cards.includes(first) && a.cards.includes(second));
  return action ? kindOf(action) : null;
};
