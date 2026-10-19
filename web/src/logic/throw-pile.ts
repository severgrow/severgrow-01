// TAP THE THROW PILE TO THROW — an extra way to finish a throw, in every mode.
//
// The player picks the card first (the lifted card is the waiting move); a tap on the Throw pile
// then throws that card, the same as tapping it again. The pile never chooses a card on its own:
// with nothing picked it throws nothing, and outside the Throw step it keeps its old meaning
// (draw from it, or nothing).
import type { Action, Phase } from '../../../src/engine/index.js';

/** The throw a tap on the Throw pile plays now, or null. Only ever a legal Discard already waiting. */
export const throwPileAction = (phase: Phase, pending: Action | null, legal: readonly Action[]): Action | null => {
  if (phase !== 'DISCARD' || pending?.t !== 'Discard') return null;
  const card = pending.card;
  return legal.find((a) => a.t === 'Discard' && a.card === card) ?? null;
};
