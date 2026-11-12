// "NO ROOM" FOR A BLOOM (tester report, 2026-10-27): a player held three 2s — a valid set — and
// tapped them, but the board had no three connected hexes they could claim, so no Bloom was legal.
// The game treated each tap as an ordinary single card and said nothing; the tester read it as a
// bug. `bloomNoRoom` names that exact situation so the display can say "NO ROOM": the tapped card
// is part of a Bloom-shaped group in the hand, and no legal Bloom uses a card of its face.
import { describe, expect, it } from 'vitest';
import { coordKey, legalActions, newGame, viewFor } from '../../src/engine/index.js';
import type { Card, State } from '../../src/engine/index.js';
import { bloomNoRoom } from '../src/logic/bloom-room.js';

/** Every card in the game, from a fresh deal (deck plus both hands). */
const allCards = (s: State): Card[] => [...s.deck, ...s.hands[0], ...s.hands[1]];

/** Player 0 to act, holding exactly `hand`; the rest of the game as dealt. */
const withHand = (s: State, hand: Card[]): State => {
  const ids = new Set(hand.map((c) => c.id));
  return {
    ...s,
    hands: [hand, s.hands[1].filter((c) => !ids.has(c.id))],
    deck: s.deck.filter((c) => !ids.has(c.id)),
    phase: 'ACT',
    turnPlayer: 0,
    actor: 0,
    sproutsThisTurn: 0,
  };
};

/** Fill every empty hex with my own 9: a 2 can claim nothing anywhere (Bloom never lands on my
 *  own tiles, and a 2 cannot strengthen a 9). */
const boxedIn = (s: State): State => {
  const board = { ...s.board };
  for (const [key, tile] of Object.entries(board)) {
    if (tile === null && s.terrain?.[key] !== 'rock') board[key] = { owner: 0, strength: 9 };
  }
  return { ...s, board };
};

const setup = () => {
  const s = newGame(7);
  const cards = allCards(s);
  const twos = cards.filter((c) => c.suit !== null && c.rank === 2).slice(0, 3);
  const loner = cards.find((c) => c.suit !== null && c.rank === 8 && !twos.includes(c))!;
  expect(twos).toHaveLength(3);
  return { s, twos, loner, hand: [...twos, loner] };
};

describe('bloomNoRoom', () => {
  it('says there is no room when the cards make a Bloom but the board has nowhere to grow it', () => {
    const { s, twos, hand } = setup();
    const state = boxedIn(withHand(s, hand));
    const view = viewFor(state, 0);
    const legal = legalActions(view);
    expect(legal.some((a) => a.t === 'Bloom')).toBe(false);
    for (const two of twos) expect(bloomNoRoom(view, legal, two.id)).toBe(3);
  });

  it('says nothing when there is room — the Bloom is simply offered', () => {
    const { s, twos, hand } = setup();
    const view = viewFor(withHand(s, hand), 0);
    const legal = legalActions(view);
    expect(legal.some((a) => a.t === 'Bloom')).toBe(true);
    for (const two of twos) expect(bloomNoRoom(view, legal, two.id)).toBeNull();
  });

  it('says nothing for a card that is not part of any Bloom-shaped group', () => {
    const { s, loner, hand } = setup();
    const view = viewFor(boxedIn(withHand(s, hand)), 0);
    expect(bloomNoRoom(view, legalActions(view), loner.id)).toBeNull();
  });

  it('says nothing for a card that is not in the hand', () => {
    const { s, hand } = setup();
    const view = viewFor(boxedIn(withHand(s, hand)), 0);
    expect(bloomNoRoom(view, legalActions(view), -1)).toBeNull();
  });

  it('the boxed-in board really leaves my home with no open neighbour', () => {
    const { s, hand } = setup();
    const state = boxedIn(withHand(s, hand));
    expect(Object.entries(state.board).filter(([k, t]) => t === null && state.terrain?.[k] !== 'rock').map(([k]) => k)).toEqual([]);
    expect(coordKey).toBeTypeOf('function');
  });
});
