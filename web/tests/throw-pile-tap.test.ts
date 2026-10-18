// Tap-to-throw on the Throw pile: an extra way to finish a throw the player has already chosen.
// It never picks a card by itself: with no card waiting, a tap on the pile throws nothing.
import { describe, expect, it } from 'vitest';
import { apply, legalActions, viewFor } from '../../src/engine/index.js';
import type { Action, State } from '../../src/engine/index.js';
import { Session } from '../src/logic/session.js';
import { throwPileAction } from '../src/logic/throw-pile.js';
import { findState } from './ui-helpers.js';

const discardState = (seed: number): State => {
  for (let k = seed; k < seed + 50; k++) {
    const s = findState(k, (x) => x.actor === 0 && x.phase === 'DISCARD');
    if (s) return s;
  }
  throw new Error('no position found');
};

describe('tap the Throw pile to throw', () => {
  it('throws the card already picked (the same move as tapping it again), and nothing else', () => {
    for (const seed of [1, 7, 21, 40]) {
      const s = discardState(seed);
      const session = new Session(s);
      const hand = session.view.hand;
      for (const card of hand) {
        session.sel = { card: null, kind: null, hex: null, option: 0 };
        session.tapCard(card.id);
        const a = throwPileAction(session.view.phase, session.pending, session.legal);
        // Exactly the waiting move a second tap on the card would play.
        expect(a).toEqual(session.pending);
        expect(a?.t).toBe('Discard');
        // The engine takes it: it is one of the legal moves.
        expect(legalActions(viewFor(s, 0))).toContainEqual(a);
        // The card on the pile is the picked card (or, when that exact card may not be thrown, its
        // identical twin: same suit, same number, which the game already treats as the same throw).
        const thrown = apply(s, a!).discard.at(-1)!;
        expect([thrown.suit, thrown.rank]).toEqual([card.suit, card.rank]);
      }
    }
  });

  it('with no card picked, a tap on the pile does nothing', () => {
    const s = discardState(3);
    const session = new Session(s);
    session.sel = { card: null, kind: null, hex: null, option: 0 };
    expect(session.pending).toBeNull();
    expect(throwPileAction(session.view.phase, session.pending, session.legal)).toBeNull();
  });

  it('a card picked and then put back down throws nothing', () => {
    const s = discardState(5);
    const session = new Session(s);
    const id = session.view.hand[0]!.id;
    session.tapCard(id);
    session.tapCard(id); // the same card again lifts the pick
    expect(throwPileAction(session.view.phase, session.pending, session.legal)).toBeNull();
  });

  it('outside the Throw step it never throws (Draw and Grow keep their own meaning)', () => {
    const draw = findState(2, (x) => x.actor === 0 && x.phase === 'DRAW')!;
    const act = findState(2, (x) => x.actor === 0 && x.phase === 'ACT')!;
    const fake: Action = { t: 'Discard', card: draw.hands[0][0]!.id };
    expect(throwPileAction(draw.phase, fake, legalActions(viewFor(draw, 0)))).toBeNull();
    expect(throwPileAction(act.phase, fake, legalActions(viewFor(act, 0)))).toBeNull();
  });

  it('a waiting move that is not a legal throw is never played', () => {
    const s = discardState(9);
    const legal = legalActions(viewFor(s, 0));
    const notInHand: Action = { t: 'Discard', card: 99999 };
    expect(throwPileAction(s.phase, notInHand, legal)).toBeNull();
    expect(throwPileAction(s.phase, { t: 'EndAct' }, legal)).toBeNull();
  });
});
