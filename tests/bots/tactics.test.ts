// v0.5 bot tactics: Strengthen and Fruit judgement by level, from public information only.
import { describe, expect, it } from 'vitest';
import { apply, coordKey, legalActions, newGame, viewFor } from '../../src/engine/index.js';
import type { Action, Card, Player, State, Suit, View } from '../../src/engine/index.js';
import { LEVELS, LEVEL_CONFIGS, botSeed, decideLevelAction } from '../../src/bots/levels.js';
import { chanceAbove, isStrengthen, judgeStrengthen, tacticsCtx, unseenByRank } from '../../src/bots/tactics.js';
import { fixture } from '../helpers.js';

const stateWith = (tiles: Record<string, [Player, number]>, hand: [Suit, number][], patch: Partial<State> = {}): State => {
  const g = newGame(3);
  const f = fixture({ tiles });
  const pool = [...g.hands[0], ...g.hands[1], ...g.deck];
  const h: Card[] = [];
  for (const [su, r] of hand) h.push(pool.splice(pool.findIndex((c) => c.suit === su && c.rank === r), 1)[0]!);
  return { ...g, board: f.board, terrain: f.terrain, hands: [h, pool.splice(0, 7)], deck: pool, phase: 'ACT', ...patch };
};

describe('levels and tiers', () => {
  it('1-2 ignore both (with a rare whim), 3-4 simple rules, 5-6 weigh exposure, 7-8 full, 9 also the opponent Fruit', () => {
    const tiers = LEVELS.map((l) => [LEVEL_CONFIGS[l].strengthenTier, LEVEL_CONFIGS[l].fruitTier]);
    expect(tiers).toEqual([[0, 0], [0, 0], [1, 1], [1, 1], [2, 2], [2, 2], [3, 3], [3, 3], [4, 4]]);
    for (const l of LEVELS) expect(LEVEL_CONFIGS[l].whimRate > 0).toBe(l <= 2);
  });

  it('every Strengthen and Fruit decision carries a short plain-words reason', () => {
    let seen = 0;
    for (let seed = 1; seed <= 12 && seen < 10; seed++) {
      let s = newGame(seed);
      while (s.phase !== 'GAME_OVER') {
        const lv = s.actor === 0 ? 7 : 9;
        const d = decideLevelAction(viewFor(s, s.actor), lv, botSeed(s.seed, lv, s.turnNumber, s.history!.length));
        if (d.action.t === 'PlayFruit' || isStrengthen(viewFor(s, s.actor), d.action)) {
          seen++;
          expect(d.reason, JSON.stringify(d.action)).toMatch(/\w/);
        }
        s = apply(s, d.action);
      }
    }
    expect(seen).toBeGreaterThan(0);
  });

  it('levels 1-2: a whim is seeded and rare; the same seed gives the same choice', () => {
    const s = stateWith({ '-1,1': [0, 2], '0,1': [0, 2], '0,0': [0, 2], '1,0': [1, 4], '1,-1': [1, 4] }, [[0, 9], [1, 1]]);
    const v = viewFor(s, 0);
    let odd = 0;
    for (let seed = 1; seed <= 400; seed++) {
      const a = decideLevelAction(v, 1, seed);
      expect(decideLevelAction(v, 1, seed)).toEqual(a);
      if (a.action.t === 'PlayFruit' || isStrengthen(v, a.action)) odd++;
    }
    expect(odd).toBeGreaterThan(0);
    expect(odd).toBeLessThan(60); // rare
  });
});

describe('Strengthen judgement', () => {
  // my chain root(-2,2) - (-1,1)=5 - (0,0)=3 - (1,0)=2; their (2,-1)=4 touches (1,0) and (1,-1)=4 touches (0,0)
  const tiles: Record<string, [Player, number]> = { '-1,1': [0, 5], '0,0': [0, 3], '1,0': [0, 2], '2,-1': [1, 4], '1,-1': [1, 4] };

  it('tier 1 strengthens only with a top card that has no better use', () => {
    const s = stateWith(tiles, [[0, 8], [1, 9]]);
    const v = viewFor(s, 0);
    const t = tacticsCtx(v);
    const st = legalActions(v).filter((a): a is Extract<Action, { t: 'Sprout' }> => isStrengthen(v, a));
    const eight = st.find((a) => v.hand.find((c) => c.id === a.card)!.rank === 8)!;
    const nine = st.find((a) => v.hand.find((c) => c.id === a.card)!.rank === 9)!;
    expect(judgeStrengthen(t, eight, 1, 0).score).toBeLessThan(0);
    expect(judgeStrengthen(t, nine, 1, 0).score).toBeGreaterThan(0);
    expect(judgeStrengthen(t, nine, 1, 2).score).toBeLessThan(0); // the 9 has a better use
  });

  it('tiers 3-4: an exposed link tile is worth strengthening more than a safe one; 9 discounts a tile they can still Fruit', () => {
    const s = stateWith({ ...tiles, '-3,3': [0, 2] }, [[0, 9]]);
    const v = viewFor(s, 0);
    const t = tacticsCtx(v);
    const id = v.hand[0]!.id;
    const exposed = judgeStrengthen(t, { t: 'Sprout', card: id, coord: { q: 0, r: 0 } }, 3).score;
    const safe = judgeStrengthen(t, { t: 'Sprout', card: id, coord: { q: -3, r: 3 } }, 3).score;
    expect(exposed).toBeGreaterThan(safe);
    // their tiles touch (0,0) and Fruit cards are still unseen: level 9 values it less
    const s2 = stateWith({ ...tiles, '0,-1': [1, 2], '1,-2': [1, 2] }, [[0, 9]]);
    const v2 = viewFor(s2, 0);
    const t2 = tacticsCtx(v2);
    const a = { t: 'Sprout' as const, card: v2.hand[0]!.id, coord: { q: 0, r: 0 } };
    expect(judgeStrengthen(t2, a, 4).score).toBeLessThan(judgeStrengthen(t2, a, 3).score);
    const used = { ...viewFor(s2, 0), fruitUnseen: 0 }; // every Fruit card accounted for
    expect(judgeStrengthen(tacticsCtx(used), a, 4).score).toBeCloseTo(judgeStrengthen(tacticsCtx(used), a, 3).score, 5);
  });
});

describe('public information only', () => {
  it('unseen cards: every rank starts equal; my hand, the discard and board strengths are taken off', () => {
    const s = stateWith({ '0,0': [0, 9], '1,0': [1, 9] }, [[0, 9], [1, 9]]);
    const u = unseenByRank(viewFor(s, 0));
    expect(u[9]).toBe(8 - 2 - 2 - s.discard.filter((c) => c.rank === 9).length);
    expect(u[1]).toBe(8 - s.discard.filter((c) => c.rank === 1).length);
    expect(chanceAbove(viewFor(s, 0), u, 9)).toBe(0);
    expect(chanceAbove(viewFor(s, 0), u, 0)).toBe(1);
  });

  it('the bots decide the same whatever the hidden cards are (their hand and the deck order)', () => {
    const s = stateWith({ '-1,1': [0, 3], '0,1': [0, 3], '0,0': [0, 3], '1,0': [1, 9], '1,-1': [1, 4] }, [[0, 9], [1, 6], [2, 6]]);
    const hidden: State = { ...s, hands: [s.hands[0], [...s.deck.slice(0, 7)]], deck: [...s.hands[1], ...s.deck.slice(7)].reverse() };
    const strip = (v: View) => JSON.stringify({ ...v, opponentHandCount: 0 });
    expect(strip(viewFor(hidden, 0))).toBe(strip(viewFor(s, 0)));
    for (const lv of LEVELS) expect(decideLevelAction(viewFor(hidden, 0), lv, 5)).toEqual(decideLevelAction(viewFor(s, 0), lv, 5));
  });

  it('a Strengthen target is always my own non-root tile', () => {
    const s = stateWith({ '-1,1': [0, 3] }, [[0, 9]]);
    const v = viewFor(s, 0);
    for (const a of legalActions(v)) if (isStrengthen(v, a)) expect(coordKey(a.coord)).toBe('-1,1');
  });
});
