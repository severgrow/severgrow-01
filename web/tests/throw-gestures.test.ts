// The owner's Throw-step gestures (2026-10-25). A tap picks a card; the same card again puts it
// down. A tap on a hand card NEVER throws. Throwing is a swipe up, a drag onto the Throw pile, or
// a tap on the pile while a card is picked. Every commit is still the session's own legal Discard.
import { describe, expect, it } from 'vitest';
import { apply, legalActions, viewFor } from '../../src/engine/index.js';
import type { Action, State } from '../../src/engine/index.js';
import { Session } from '../src/logic/session.js';
import { tapAgainPlays, throwFlight, throwPileAction } from '../src/logic/throw-pile.js';
import { findState } from './ui-helpers.js';

const discardState = (seed: number): State => {
  for (let k = seed; k < seed + 50; k++) {
    const s = findState(k, (x) => x.actor === 0 && x.phase === 'DISCARD');
    if (s) return s;
  }
  throw new Error('no position found');
};

describe('a card tap never throws in the product Throw step', () => {
  it('one tap picks the card, the same tap puts it down, and the game is untouched', () => {
    const s = discardState(1);
    const session = new Session(s);
    const card = session.view.hand[0]!;

    session.tapCard(card.id);
    expect(session.sel.card).toBe(card.id);
    expect(session.pending).toEqual({ t: 'Discard', card: card.id } as Action);

    const before = session.state;
    const logLength = session.log.length;
    session.tapCard(card.id);

    expect(session.sel.card).toBeNull();
    expect(session.pending).toBeNull();
    expect(session.state).toBe(before);
    expect(session.log.length).toBe(logLength);
  });

  it('the old tap-again-to-place branch is off for Discard in the product, and only there', () => {
    const discard: Action = { t: 'Discard', card: 7 };
    expect(tapAgainPlays(discard, 7, true)).toBe(false);
    expect(tapAgainPlays(discard, 7, false)).toBe(true);

    // The legacy copies keep their old card-tap meaning for every waiting move.
    const sprout: Action = { t: 'Sprout', card: 7, coord: { q: 0, r: 0 } };
    expect(tapAgainPlays(sprout, 7, true)).toBe(false);
    expect(tapAgainPlays(sprout, 7, false)).toBe(true);

    // Another card is never part of the waiting move and answer.
    expect(tapAgainPlays(discard, 8, false)).toBe(false);
    expect(tapAgainPlays(null, 7, false)).toBe(false);
  });
});

describe('tap the Throw pile to throw', () => {
  it('with a card picked it plays exactly that legal Discard', () => {
    const s = discardState(4);
    const session = new Session(s);
    const card = session.view.hand[0]!;
    session.tapCard(card.id);

    const a = throwPileAction(session.view.phase, session.pending, session.legal);
    expect(a).toEqual(session.pending);
    expect(a?.t).toBe('Discard');
    expect(session.legal).toContainEqual(a);
    if (a?.t === 'Discard') {
      const thrown = apply(s, a).discard.at(-1)!;
      expect([thrown.suit, thrown.rank]).toEqual([card.suit, card.rank]);
    }
  });

  it('with nothing picked it does nothing', () => {
    const s = discardState(4);
    const session = new Session(s);
    expect(session.pending).toBeNull();
    expect(throwPileAction(session.view.phase, session.pending, session.legal)).toBeNull();
  });

  it('with a waiting move that is not a legal throw it refuses', () => {
    const s = discardState(9);
    const legal = legalActions(viewFor(s, 0));
    expect(throwPileAction(s.phase, { t: 'Discard', card: 99999 }, legal)).toBeNull();
    expect(throwPileAction(s.phase, { t: 'EndAct' }, legal)).toBeNull();
  });
});

describe('the swipe-up throw commits first; the flight is presentation only', () => {
  it('the session reaches the after-state before any animation is planned', () => {
    const s = discardState(7);
    const session = new Session(s);
    const card = session.view.hand[0]!;
    session.tapCard(card.id);
    const a = throwPileAction(session.view.phase, session.pending, session.legal)!;

    const played = session.play(a);
    expect(played).not.toBeNull();
    expect(session.state).toBe(played!.after);
    expect(session.log).toContainEqual(a);
    expect(played!.steps.some((step) => step.k === 'discard')).toBe(true);

    // Planning the boomerang is a pure function of rects and the motion gate; it never sees the
    // session, an action or the legal list, and cannot delay the move that already landed.
    expect(throwFlight('swipe', true)).toBe('boomerang');
    expect(throwFlight('tap', true)).toBe('ordinary');
    expect(throwFlight('swipe', false)).toBe('none');
    expect(throwFlight('tap', false)).toBe('none');
  });
});
