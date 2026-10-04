// Step 5 (Fruit cards task): how each bot level uses Fruit cards. Written before the code.
// L1-3: a random legal target at a random (seeded) moment; L1-2 sometimes throw one away.
// L4-6: on a high tile or a big cut, or for a Strangle; never throw one while another card is there.
// L7-9: full evaluation (net swing, blockers, Strangle, thin links, hold or use, a second Fruit
// only if it pays); L9 also counts unseen Fruit cards and the opponent's reply.
// A Fruit card is never an ordinary throw. Every Fruit decision carries a short reason.
import { describe, expect, it } from 'vitest';
import { apply, isFruitCard, legalActions, newGame, viewFor } from '../../src/engine/index.js';
import type { Action, Card, Player, State, View } from '../../src/engine/index.js';
import { LEVELS, botSeed, decideLevelAction } from '../../src/bots/levels.js';
import type { Level } from '../../src/bots/levels.js';
import { fixture } from '../helpers.js';

const fruitCard = (id: number): Card => ({ id, suit: null, rank: 0 });
/** My (P1) Grow step on a hand-built board, with these cards in hand. */
const at = (tiles: Record<string, [Player, number]>, hand: Card[], phase: State['phase'] = 'ACT'): State => {
  const g = newGame(5);
  const f = fixture({ tiles });
  const others = [...g.hands[0], ...g.hands[1], ...g.deck].filter((c) => !isFruitCard(c) && !hand.some((h) => h.id === c.id));
  return { ...g, board: f.board, terrain: f.terrain, hands: [hand, others.slice(0, 7)], deck: others.slice(7), discard: [], phase, turnPlayer: 0, actor: 0, history: [] };
};
const num = (s: State, suit: 0 | 1 | 2 | 3, rank: number): Card => [...s.hands[0], ...s.hands[1], ...s.deck].find((c) => c.suit === suit && c.rank === rank)!;
const decide = (v: View, lv: Level, seed: number) => decideLevelAction(v, lv, seed);

// mine: root (-2,2) - (-1,1)=2 - (0,0)=2. Theirs: root (2,-2) - (1,-1)=9 - (1,0)=9 - (2,0)=5 - (3,-1)=4.
const NINE_CHAIN: Record<string, [Player, number]> = { '-1,1': [0, 2], '0,0': [0, 2], '1,-1': [1, 9], '1,0': [1, 9], '2,0': [1, 5], '3,-1': [1, 4] };
// a lone weak opponent tile touching mine, nothing behind it
const LONE_TWO: Record<string, [Player, number]> = { '-1,1': [0, 4], '0,0': [0, 4], '1,0': [1, 2], '1,-1': [1, 6], '2,-1': [1, 6] };

/** Real game positions: my Grow steps holding a Fruit card with a target (from bot-vs-bot games). */
const fruitSteps = (n: number): State[] => {
  const out: State[] = [];
  for (let seed = 1; out.length < n && seed < 400; seed++) {
    let s = newGame(seed);
    let i = 0;
    while (s.phase !== 'GAME_OVER' && out.length < n && i < 400) {
      const v = viewFor(s, s.actor);
      if (s.phase === 'ACT' && legalActions(v).some((a) => a.t === 'PlayFruit')) out.push(s);
      s = apply(s, decideLevelAction(v, 7, i++).action);
    }
  }
  return out;
};
/** Real game positions: my Throw step holding a Fruit card and at least one other card. */
const throwSteps = (n: number): State[] => {
  const out: State[] = [];
  for (let seed = 1; out.length < n && seed < 400; seed++) {
    let s = newGame(seed);
    let i = 0;
    while (s.phase !== 'GAME_OVER' && out.length < n && i < 400) {
      const v = viewFor(s, s.actor);
      if (s.phase === 'DISCARD' && v.hand.some(isFruitCard) && v.hand.some((c) => !isFruitCard(c))) out.push(s);
      s = apply(s, decideLevelAction(v, 7, i++).action);
    }
  }
  return out;
};

describe('levels 1-3: a random target at a random moment', () => {
  it('sometimes plays a Fruit card, on any legal target, and the seed decides (the same seed, the same choice)', () => {
    for (const lv of [1, 2, 3] as const) {
      const s = at(NINE_CHAIN, [fruitCard(72)]);
      const v = viewFor(s, 0);
      let used = 0;
      const targets = new Set<string>();
      for (let seed = 1; seed <= 300; seed++) {
        const d = decide(v, lv, seed);
        expect(decide(v, lv, seed)).toEqual(d);
        if (d.action.t === 'PlayFruit') {
          used++;
          targets.add(`${d.action.target.q},${d.action.target.r}`);
          expect(d.reason, `level ${lv}`).toMatch(/random/);
        }
      }
      expect(used, `level ${lv}`).toBeGreaterThan(20);
      expect(used, `level ${lv}`).toBeLessThan(280);
      expect(targets.size, `level ${lv}`).toBe(2); // both 9s get picked, not just the best one
    }
  });

  it('levels 1-2 sometimes throw a Fruit card away; level 3 never does while another card is there', () => {
    const steps = throwSteps(30);
    expect(steps.length).toBe(30);
    for (const lv of [1, 2] as const) {
      let thrown = 0;
      steps.forEach((s, i) => {
        const v = viewFor(s, s.actor);
        const d = decide(v, lv, botSeed(s.seed, lv, s.turnNumber, i));
        if (d.action.t === 'Discard' && isFruitCard(v.hand.find((c) => c.id === (d.action as { card: number }).card)!)) thrown++;
      });
      expect(thrown, `level ${lv}`).toBeGreaterThan(0);
    }
  });
});

describe('levels 4-6: simple rules', () => {
  it('use it on a 9 with a chain behind it', () => {
    for (const lv of [4, 5, 6] as const) {
      const s = at(NINE_CHAIN, [fruitCard(72)]);
      const plays = [1, 2, 3, 4, 5, 6, 7, 8].map((seed) => decide(viewFor(s, 0), lv, seed)).filter((d) => d.action.t === 'PlayFruit');
      expect(plays.length, `level ${lv}`).toBeGreaterThanOrEqual(4); // mistakes aside
      for (const d of plays) expect(d.reason).toMatch(/\w/);
    }
  });

  it('keep it for a lone low tile with nothing behind it', () => {
    for (const lv of [4, 5, 6] as const) {
      const s = at(LONE_TWO, [fruitCard(72)]);
      const plays = [1, 2, 3, 4, 5, 6, 7, 8].map((seed) => decide(viewFor(s, 0), lv, seed)).filter((d) => d.action.t === 'PlayFruit');
      expect(plays.length, `level ${lv}`).toBeLessThanOrEqual(2); // only by a mistake
    }
  });
});

describe('levels 7-9: full evaluation', () => {
  it('take the 9 that holds the chain (the bigger swing), not the lone one', () => {
    for (const lv of [7, 8, 9] as const) {
      const s = at(NINE_CHAIN, [fruitCard(72)]);
      const d = decide(viewFor(s, 0), lv, 1);
      expect(d.action, `level ${lv}`).toEqual({ t: 'PlayFruit', card: 72, target: { q: 1, r: -1 } });
      expect(d.reason).toMatch(/\w/);
    }
  });

  it('hold it for a lone low tile early in the game', () => {
    for (const lv of [7, 8, 9] as const) {
      const s = at(LONE_TWO, [fruitCard(72)]);
      expect(decide(viewFor(s, 0), lv, 1).action.t, `level ${lv}`).not.toBe('PlayFruit');
    }
  });

  it('a Fruit card that opens a Strangle (then a Sprout surrounds their root this turn) is taken from level 4 up', () => {
    // five of their root's six neighbours are mine; the sixth, (2,-1), holds their 3
    const ring = ['-1,1', '0,0', '1,-1', '1,-2', '2,-3', '3,-3', '3,-2'];
    const tiles: Record<string, [Player, number]> = { '2,-1': [1, 3] };
    for (const k of ring) tiles[k] = [0, 2];
    const g = at(tiles, [fruitCard(72)]);
    const s: State = { ...g, hands: [[fruitCard(72), num(g, 2, 2)], g.hands[1]] };
    for (const lv of [4, 5, 6, 7, 8, 9] as const) {
      const d = decide(viewFor(s, 0), lv, 3);
      expect(d.action, `level ${lv}`).toEqual({ t: 'PlayFruit', card: 72, target: { q: 2, r: -1 } });
      expect(d.reason).toMatch(/Strangle/);
    }
    // and then the Sprout on the emptied hex wins
    const after = apply(s, { t: 'PlayFruit', card: 72, target: { q: 2, r: -1 } });
    const win = apply(after, decide(viewFor(after, 0), 7, 1).action);
    expect(win.result).toMatchObject({ winner: 0, reason: 'strangle' });
  });

});

describe('a Fruit card is never an ordinary throw', () => {
  it('levels 3-9 never throw a Fruit card while another card is in hand (real game positions)', () => {
    const steps = throwSteps(40);
    for (const lv of [3, 4, 5, 6, 7, 8, 9] as const) {
      steps.forEach((s, i) => {
        const v = viewFor(s, s.actor);
        const d = decide(v, lv, botSeed(s.seed, lv, s.turnNumber, i));
        expect(d.action.t).toBe('Discard');
        expect(isFruitCard(v.hand.find((c) => c.id === (d.action as { card: number }).card)!), `level ${lv}`).toBe(false);
      });
    }
  });

  it('with only Fruit cards left in hand, a throw is still a legal Fruit card', () => {
    const s = at(NINE_CHAIN, [fruitCard(72), fruitCard(73)], 'DISCARD');
    for (const lv of LEVELS) {
      const d = decide(viewFor(s, 0), lv, 1);
      expect(d.action.t).toBe('Discard');
    }
  });
});

describe('every level, in real games', () => {
  it('Fruit decisions are legal, deterministic and carry a reason; no level reads hidden cards', () => {
    const steps = fruitSteps(25);
    expect(steps.length).toBe(25);
    for (const lv of LEVELS) {
      steps.forEach((s, i) => {
        const v = viewFor(s, s.actor);
        const d = decide(v, lv, botSeed(s.seed, lv, s.turnNumber, i));
        expect(legalActions(v)).toContainEqual(d.action);
        expect(decide(viewFor(s, s.actor), lv, botSeed(s.seed, lv, s.turnNumber, i))).toEqual(d);
        if (d.action.t === 'PlayFruit') expect(d.reason, `level ${lv}`).toMatch(/\w/);
      });
    }
  }, 120_000);

  it('the View is all a bot gets: changing the opponent hand or the deck order never changes its move', () => {
    const steps = fruitSteps(10);
    for (const lv of [4, 7, 9] as const) {
      for (const s of steps) {
        const opp = s.actor === 0 ? 1 : 0;
        const mixed: State = { ...s, deck: [...s.deck].reverse(), hands: s.actor === 0 ? [s.hands[0], [...s.hands[1]].reverse()] : [[...s.hands[0]].reverse(), s.hands[1]] };
        void opp;
        expect(decide(viewFor(mixed, s.actor), lv, 7)).toEqual(decide(viewFor(s, s.actor), lv, 7));
      }
    }
  });
});

void (null as unknown as Action);
