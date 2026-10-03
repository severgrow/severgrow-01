// Bots v0.7: levels 8 and 9 throw the card that is worth least to keep, judged by its own
// number plus what it adds to a combo. A loose 9 is never thrown while a weaker card can go,
// and a low card is not kept just because it sits in a combo when a 9 is worth more.
// The previous bots stay available as bots-v0.6 (recorded games replay with them).
import { describe, expect, it } from 'vitest';
import { newGame, viewFor } from '../../src/engine/index.js';
import type { Action, Card, State, Suit } from '../../src/engine/index.js';
import { LEVEL_CONFIGS, chooseLevelAction, keepValue } from '../../src/bots/levels.js';
import { BOT_VERSIONS, CURRENT_BOT_VERSION, botFor } from '../../src/bots/versions.js';

/** P1 at the Throw step holding exactly these real cards. */
const atDiscard = (hand: [Suit, number][]): State => {
  const g = newGame(3);
  const pool = [...g.hands[0], ...g.hands[1], ...g.deck];
  const mine: Card[] = [];
  for (const [suit, rank] of hand) mine.push(pool.splice(pool.findIndex((c) => c.suit === suit && c.rank === rank), 1)[0]!);
  return { ...g, hands: [mine, pool.splice(0, 7)], deck: pool, phase: 'DISCARD', drawnFromDiscard: null };
};
const thrown = (s: State, choose: (s: State) => Action) => {
  const a = choose(s);
  expect(a.t).toBe('Discard');
  return s.hands[0].find((c) => c.id === (a as Extract<Action, { t: 'Discard' }>).card)!;
};
const level = (l: 8 | 9) => (s: State) => chooseLevelAction(viewFor(s, 0), l, 1);

describe('levels 8 and 9 keep their strong cards (bots-v0.7)', () => {
  for (const l of [8, 9] as const) {
    it(`level ${l}: with a loose 9, a 3-4-5 line and a loose 2, it throws the 2`, () => {
      const s = atDiscard([[0, 9], [1, 3], [1, 4], [1, 5], [2, 2]]);
      expect(thrown(s, level(l)).rank).toBe(2);
    });
    it(`level ${l}: a loose 9 against a 3-4-5 line and nothing else: it gives up the line's low end, not the 9`, () => {
      const s = atDiscard([[0, 9], [1, 3], [1, 4], [1, 5]]);
      const c = thrown(s, level(l));
      expect(c.rank).not.toBe(9);
    });
    it(`level ${l}: never throws a 9 or 8 while a loose card of 5 or less is in hand`, () => {
      for (const extra of [1, 3, 5]) {
        const s = atDiscard([[0, 9], [2, 8], [1, extra], [3, 6], [3, 7]]);
        expect(thrown(s, level(l)).rank).toBeLessThan(8);
      }
    });
  }

  it('keepValue: a card is worth its number, plus a bonus for each card of a combo it holds together', () => {
    const hand: Card[] = [
      { id: 1, suit: 0, rank: 9 },
      { id: 2, suit: 1, rank: 3 },
      { id: 3, suit: 1, rank: 4 },
      { id: 4, suit: 1, rank: 5 },
    ];
    const b = LEVEL_CONFIGS[8].comboBonus;
    expect(b).toBeGreaterThan(0);
    expect(keepValue(hand, 1, b)).toBe(9);
    // throwing the 3 breaks the whole 3-4-5 line
    expect(keepValue(hand, 2, b)).toBe(3 + 3 * b);
    expect(keepValue(hand, 2, b)).toBeLessThan(9);
  });

  it('the previous bots stay as bots-v0.6 (old recordings replay); the page uses bots-v0.7', () => {
    expect(CURRENT_BOT_VERSION).toBe('bots-v0.7');
    expect(Object.keys(BOT_VERSIONS)).toEqual(['bots-v0.5', 'bots-v0.6', 'bots-v0.7']);
    // the old level 8 kept the combo and threw the loose 9
    const s = atDiscard([[0, 9], [1, 3], [1, 4], [1, 5]]);
    expect(thrown(s, (x) => botFor('bots-v0.6')!(viewFor(x, 0), 8, 1)).rank).toBe(9);
  });
});
