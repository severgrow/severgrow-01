// THE THROW STEP'S GESTURES (owner, 2026-10-25).
//
// A tap on a hand card PICKS it; the same card tapped again PUTS IT DOWN. A card tap never throws
// in the product copy: the old "tap again to throw" was the thing confusing testers. There are
// exactly three ways to throw now, and each one still plays only a Discard the session already
// listed as legal:
//   1. swipe up on a hand card (the drag layer's flick);
//   2. drag a hand card onto the Throw pile;
//   3. tap the Throw pile while a card is picked (this file).
// The pile never chooses a card on its own: with nothing picked it throws nothing, and outside
// the Throw step it keeps its old meaning (draw from it, or nothing).
import type { Action, Phase } from '../../../src/engine/index.js';
import { moveCards } from '../../../src/playtest/names.js';

/** The throw a tap on the Throw pile plays now, or null. Only ever a legal Discard already waiting. */
export const throwPileAction = (phase: Phase, pending: Action | null, legal: readonly Action[]): Action | null => {
  if (phase !== 'DISCARD' || pending?.t !== 'Discard') return null;
  const card = pending.card;
  return legal.find((a) => a.t === 'Discard' && a.card === card) ?? null;
};

/**
 * May a tap on a card of the waiting move PLAY it? This is the legacy "tap again to place it"
 * path. The product copy (Futa04) keeps it for board moves but never for a Discard: a second tap
 * on a picked card there deselects (the owner's rule above). The classic copies are unchanged.
 */
export const tapAgainPlays = (pending: Action | null, id: number, product: boolean): boolean =>
  !!pending &&
  (!product || (pending.t !== 'Bloom' && pending.t !== 'Sprout' && pending.t !== 'Discard')) &&
  moveCards(pending).includes(id);

/**
 * Which flight a committed throw gets. Presentation only, decided without the session: the throw
 * has already landed before this is read.
 *
 * OWNER, 2026-10-25: "is the boomerang thing in? dont see it at all". It was in — but only a
 * machine-fast swipe asked for it. A drop on the Throw pile and a tap on the pile threw with the
 * plain fly-to-pile, and those are the gestures a player actually uses, so the flourish was never
 * seen. To a player all three are "the throw", so all three now get it; the gesture no longer
 * reaches this decision at all.
 *
 * The gestures still differ in one thing: where the flight takes off. A swipe and a pile drop
 * continue from the released ghost (`dragThrowFrom`); a pile tap starts at the card's own box in
 * the hand. `none` is Reduce motion / Speed off — the card is simply on the pile, no lift, no spin.
 */
export type ThrowFlight = 'boomerang' | 'none';
export const throwFlight = (motionAllowed: boolean): ThrowFlight => (motionAllowed ? 'boomerang' : 'none');
