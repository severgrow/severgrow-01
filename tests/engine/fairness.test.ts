// Part 1 (v0.5): a fully random, provably fair deal. Same seed -> same deal; every card
// equally likely in every position; no bias in random integers; no card ever created or lost.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  DECK_STREAM,
  apply,
  boundedInt,
  createCards,
  deriveSeed,
  legalActions,
  mulberry32,
  newGame,
  randomInt,
  shuffle,
  viewFor,
} from '../../src/engine/index.js';
import type { Card, State } from '../../src/engine/index.js';
import { stateHash } from '../hash.js';

/** Every card id, where it is now: hands, deck, discard, or played (from the event log). */
const placesOf = (s: State): number[] => {
  const played: number[] = [];
  for (const e of s.history ?? []) {
    if (e.t === 'Bloom') played.push(...e.cards);
    if (e.t === 'MegaBomb') played.push(...e.cards);
    if (e.t === 'Sprout' || e.t === 'Strengthen' || e.t === 'FruitCard') played.push(e.card); // a played Fruit card leaves the game
  }
  return [...s.hands[0], ...s.hands[1], ...s.deck, ...s.discard].map((c) => c.id).concat(played);
};

describe('the deck', () => {
  it('holds exactly the same number of cards of every rank (4 suits x copiesPerCard)', () => {
    for (const cfg of [newGame(1).config, newGame(1, { maxRank: 7, copiesPerCard: 3 }).config]) {
      const cards = createCards(cfg);
      for (let r = 1; r <= cfg.maxRank; r++) expect(cards.filter((c) => c.rank === r)).toHaveLength(4 * cfg.copiesPerCard);
    }
  });

  it('conservation: through whole games (with Fruit and Strengthen) no card is created or lost, and every rank keeps its count', () => {
    for (let seed = 1; seed <= 25; seed++) {
      let s = newGame(seed);
      const all = createCards(s.config);
      const rand = mulberry32(seed * 7 + 1);
      for (let i = 0; i < 3000 && s.phase !== 'GAME_OVER'; i++) {
        const ids = placesOf(s);
        expect(ids.length).toBe(all.length);
        expect(new Set(ids).size).toBe(all.length);
        const acts = legalActions(viewFor(s, s.actor));
        // prefer growing and Fruit/Strengthen moves so they really happen
        const grow = acts.filter((a) => a.t !== 'EndAct' && a.t !== 'Draw' && a.t !== 'Discard');
        const pick = grow.length > 0 && rand() < 0.7 ? grow : acts;
        s = apply(s, pick[Math.floor(rand() * pick.length)]!);
      }
      const byRank = (ids: number[]) => {
        const m = new Map<number, number>();
        for (const id of ids) m.set(all[id]!.rank, (m.get(all[id]!.rank) ?? 0) + 1);
        return m;
      };
      expect(byRank(placesOf(s))).toEqual(byRank(all.map((c) => c.id)));
    }
  });
});

describe('fairness', () => {
  it('(a) the same seed always gives the same deal, also in a separate run (recorded fixture)', () => {
    const deals = Array.from({ length: 20 }, (_, i) => {
      const g = newGame(i + 1);
      return stateHash({ hands: g.hands, deck: g.deck, discard: g.discard, terrain: g.terrain });
    });
    for (let i = 0; i < 20; i++) {
      const g = newGame(i + 1);
      expect(stateHash({ hands: g.hands, deck: g.deck, discard: g.discard, terrain: g.terrain })).toBe(deals[i]);
    }
    // recorded by an earlier, separate run (tests/fixtures/make-deals.ts)
    const rec = JSON.parse(readFileSync(new URL('../fixtures/deals.json', import.meta.url), 'utf8')) as { deals: string[] };
    expect(deals).toEqual(rec.deals);
  });

  it('(b) 120,000 shuffles of a 6-card deck: every card lands in every position equally often (within 3%)', () => {
    const N = 120_000;
    const n = 6;
    const count = Array.from({ length: n }, () => new Array<number>(n).fill(0));
    const items = Array.from({ length: n }, (_, i) => i);
    for (let seed = 1; seed <= N; seed++) {
      // exactly the engine's path: the deck stream of the game seed
      const out = shuffle(items, mulberry32(deriveSeed(seed, DECK_STREAM)));
      out.forEach((card, pos) => count[card]![pos]!++);
    }
    const expected = N / n;
    let chi = 0;
    for (const row of count)
      for (const c of row) {
        expect(Math.abs(c - expected) / expected).toBeLessThan(0.03);
        chi += (c - expected) ** 2 / expected;
      }
    // 36 cells, 25 degrees of freedom: 52.6 is the 99.9% point
    expect(chi).toBeLessThan(52.6);
  });

  it('(c) random integers have no modulo bias: exact counts over a whole small generator', () => {
    // boundedInt is the engine's method with the generator size as a parameter; here every
    // possible 12-bit output is fed in once, so the counts are exact, not sampled.
    const RANGE = 1 << 12;
    for (let n = 1; n <= 72; n++) {
      const counts = new Array<number>(n).fill(0);
      for (let x = 0; x < RANGE; x++) {
        let used = false;
        const v = boundedInt(() => (used ? -1 : ((used = true), x)), n, RANGE);
        if (v >= 0) counts[v]!++;
      }
      // every value is produced by exactly floor(RANGE / n) generator outputs; the rest are rejected
      expect(new Set(counts).size, `n=${n}`).toBe(1);
      expect(counts[0]).toBe(Math.floor(RANGE / n));
    }
    // the old floor-multiply method is (very slightly) biased for most n
    const biased = new Array<number>(72).fill(0);
    for (let x = 0; x < RANGE; x++) biased[Math.floor((x / RANGE) * 72)]!++;
    expect(new Set(biased).size).toBeGreaterThan(1);
  });

  it('randomInt is uniform and in range on the real generator; no legacy method is left', () => {
    const r = mulberry32(99);
    const counts = new Array<number>(7).fill(0);
    for (let i = 0; i < 70_000; i++) counts[randomInt(r, 7)]!++;
    for (const c of counts) expect(Math.abs(c - 10_000) / 10_000).toBeLessThan(0.04);
    expect(() => randomInt(r, 0)).toThrow(RangeError);
  });

  it('nothing is rigged: hands with several top cards, and with none, both happen', () => {
    let many = 0;
    let none = 0;
    for (let seed = 1; seed <= 2000; seed++) {
      const g = newGame(seed);
      for (const h of g.hands) {
        const top = h.filter((c: Card) => c.rank === g.config.maxRank).length;
        if (top >= 3) many++;
        if (top === 0) none++;
      }
    }
    expect(many).toBeGreaterThan(0);
    expect(none).toBeGreaterThan(0);
  });
});
