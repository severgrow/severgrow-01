import { describe, expect, it } from 'vitest';
import {
  createCards,
  drawFromDeck,
  resolveConfig,
  shuffleDeck,
  SUIT_NAMES,
} from '../../src/engine/index.js';
import { LEGACY_V03 } from '../legacy.js';

describe('createCards', () => {
  it('builds 76 cards by default: 4 suits x ranks 1-9 x 2 copies, then 4 Fruit cards (v0.6)', () => {
    const cards = createCards(resolveConfig(LEGACY_V03));
    expect(cards).toHaveLength(76);
    expect(cards.slice(72)).toEqual([72, 73, 74, 75].map((id) => ({ id, suit: null, rank: 0 })));
    for (const suit of [0, 1, 2, 3] as const) {
      for (let rank = 1; rank <= 9; rank++) {
        expect(cards.filter((c) => c.suit === suit && c.rank === rank)).toHaveLength(2);
      }
    }
  });

  it('assigns unique, stable ids 0..n-1', () => {
    const a = createCards(resolveConfig(LEGACY_V03));
    expect(a.map((c) => c.id)).toEqual(Array.from({ length: 76 }, (_, i) => i));
    expect(createCards(resolveConfig(LEGACY_V03))).toEqual(a);
  });

  it('gives identical copies adjacent ids (lowest id first is well defined)', () => {
    const cards = createCards(resolveConfig(LEGACY_V03));
    expect(cards[0]).toEqual({ id: 0, suit: 0, rank: 1 });
    expect(cards[1]).toEqual({ id: 1, suit: 0, rank: 1 });
    expect(cards[2]).toEqual({ id: 2, suit: 0, rank: 2 });
    expect(cards[71]).toEqual({ id: 71, suit: 3, rank: 9 });
  });

  it('honours copiesPerCard', () => {
    expect(createCards(resolveConfig({ ...LEGACY_V03, copiesPerCard: 1 }))).toHaveLength(36 + 4);
    expect(createCards(resolveConfig({ ...LEGACY_V03, copiesPerCard: 3 }))).toHaveLength(108 + 4);
  });

  it('names the suits Moss, Ash, Dew, Ember', () => {
    expect(SUIT_NAMES).toEqual(['Moss', 'Ash', 'Dew', 'Ember']);
  });
});

describe('shuffleDeck', () => {
  const cards = createCards(resolveConfig(LEGACY_V03));

  it('is a deterministic permutation and does not mutate input', () => {
    const before = JSON.stringify(cards);
    const a = shuffleDeck(cards, 1234);
    expect(JSON.stringify(cards)).toBe(before);
    expect(a).toEqual(shuffleDeck(cards, 1234));
    expect([...a].sort((x, y) => x.id - y.id)).toEqual(cards);
    expect(a.map((c) => c.id)).not.toEqual(cards.map((c) => c.id));
  });

  it('differs across seeds', () => {
    expect(shuffleDeck(cards, 1).map((c) => c.id)).not.toEqual(
      shuffleDeck(cards, 2).map((c) => c.id),
    );
  });

  it('returns fresh card objects (no aliasing with the input)', () => {
    const a = shuffleDeck(cards, 5);
    const original = cards.find((c) => c.id === a[0]!.id);
    expect(a[0]).not.toBe(original);
  });
});

describe('drawFromDeck', () => {
  const deck = createCards(resolveConfig(LEGACY_V03)).slice(0, 5);

  it('draws from the top (index 0) without mutating', () => {
    const { drawn, deck: rest } = drawFromDeck(deck, 2);
    expect(drawn.map((c) => c.id)).toEqual([0, 1]);
    expect(rest.map((c) => c.id)).toEqual([2, 3, 4]);
    expect(deck).toHaveLength(5);
  });

  it('draws what exists when the deck runs short', () => {
    const { drawn, deck: rest } = drawFromDeck(deck, 9);
    expect(drawn).toHaveLength(5);
    expect(rest).toEqual([]);
  });

  it('drawing 0 is a no-op; negative counts throw', () => {
    expect(drawFromDeck(deck, 0)).toEqual({ drawn: [], deck });
    expect(() => drawFromDeck(deck, -1)).toThrow();
  });
});
