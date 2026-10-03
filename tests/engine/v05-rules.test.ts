// v0.5 rules: Strengthen (a Sprout on my own weaker tile), Fruit back on by default with its
// options, and the removal of the old opening-combo guarantee. Written before the code.
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CONFIG,
  apply,
  coordKey,
  legalActions,
  newGame,
  resolveConfig,
  score,
  viewFor,
} from '../../src/engine/index.js';
import type { Action, Card, Player, RulesConfig, State, Suit } from '../../src/engine/index.js';
import { codeOf, fixture } from '../helpers.js';

/**
 * A game state at P1's ACT step with a hand-built board. The hand is made of real cards
 * (moved out of the deck and the other hand), so every card still exists exactly once.
 */
const stateWith = (o: {
  tiles: Record<string, [Player, number]>;
  hand: [Suit, number][];
  config?: Partial<RulesConfig>;
  rich?: string[];
  patch?: Partial<State>;
}): State => {
  const g = newGame(7, o.config);
  const f = fixture({ tiles: o.tiles, ...(o.config ? { config: o.config } : {}), ...(o.rich ? { rich: o.rich } : {}) });
  const pool = [...g.hands[0], ...g.hands[1], ...g.deck];
  const hand: Card[] = [];
  for (const [suit, rank] of o.hand) {
    const i = pool.findIndex((c) => c.suit === suit && c.rank === rank);
    if (i < 0) throw new Error('no such card left');
    hand.push(pool.splice(i, 1)[0]!);
  }
  const other = pool.splice(0, g.config.handSize);
  return { ...g, board: f.board, terrain: f.terrain, hands: [hand, other], deck: pool, phase: 'ACT', ...o.patch };
};
const idOf = (s: State, suit: Suit, rank: number) => s.hands[s.turnPlayer].find((c) => c.suit === suit && c.rank === rank)!.id;
const json = (x: unknown) => JSON.stringify(x);

// P1 (root -2,2): a chain (-1,1)=5, (0,1)=3, (0,0)=2. P2 (root 2,-2): (1,-1)=4, (1,0)=9.
const CHAIN: Record<string, [Player, number]> = { '-1,1': [0, 5], '0,1': [0, 3], '0,0': [0, 2], '1,-1': [1, 4], '1,0': [1, 9] };

describe('v0.5 config: Fruit on, Strengthen on, a fair deal, no opening guarantee', () => {
  it('has the new keys and no trace of the removed opening-combo guarantee', () => {
    expect(DEFAULT_CONFIG).toMatchObject({ fruitPerPlayer: 1, fruitSacrifice: 3, fruitOnlyWhenBehind: false });
    expect(typeof DEFAULT_CONFIG.allowStrengthen).toBe('boolean');
    expect(Number.isInteger(DEFAULT_CONFIG.strengthenLimitPerGame)).toBe(true);
    expect('guaranteeOpeningMeld' in DEFAULT_CONFIG).toBe(false);
    expect(codeOf(() => resolveConfig({ guaranteeOpeningMeld: true } as never))).toBe('UNKNOWN_KEY');
    const g = newGame(1);
    expect('dealAttempt' in g).toBe(false);
    expect(g.strengthenUsed).toEqual([0, 0]);
    expect(viewFor(g, 0).strengthenUsed).toEqual([0, 0]);
  });

  it('validates the new numbers: strengthenLimitPerGame >= -1, fruitSacrifice >= 1', () => {
    expect(codeOf(() => resolveConfig({ strengthenLimitPerGame: -2 }))).toBe('INVALID_NUMBER');
    expect(codeOf(() => resolveConfig({ fruitSacrifice: 0 }))).toBe('INVALID_NUMBER');
    expect(codeOf(() => resolveConfig({ allowStrengthen: 'yes' as never }))).toBe('INVALID_BOOLEAN');
    expect(resolveConfig({ strengthenLimitPerGame: -1, fruitSacrifice: 2 }).fruitSacrifice).toBe(2);
  });
});

describe('Strengthen', () => {
  const cfg = { allowStrengthen: true, strengthenLimitPerGame: -1 };

  it('a higher card on my own tile: the tile stays, takes the number, and it uses my Sprout', () => {
    const s = stateWith({ tiles: CHAIN, hand: [[0, 9], [1, 1]], config: cfg });
    const before = json(s);
    const after = apply(s, { t: 'Sprout', card: idOf(s, 0, 9), coord: { q: 0, r: 1 } });
    expect(json(s)).toBe(before); // the input is never changed
    expect(after.board['0,1']).toEqual({ owner: 0, strength: 9 });
    expect(after.sproutsThisTurn).toBe(1);
    expect(after.strengthenUsed).toEqual([1, 0]);
    expect(after.hands[0].map((c) => c.rank)).toEqual([1]);
    expect(after.lastResolution).toMatchObject({ strengthen: { coord: { q: 0, r: 1 }, from: 3, to: 9 }, placed: [], overgrown: [], severed: [] });
    const ev = after.history!.slice(s.history!.length);
    expect(ev[0]).toEqual({ t: 'Strengthen', player: 0, card: idOf(s, 0, 9), coord: { q: 0, r: 1 }, oldStrength: 3, newStrength: 9 });
    expect(ev.some((e) => e.t === 'Sprout' || e.t === 'Overgrow' || e.t === 'Sever')).toBe(false);
    // scoring and connections are unchanged
    expect(score(after, 0)).toBe(score(s, 0));
    expect(score(after, 1)).toBe(score(s, 1));
    for (const k of Object.keys(s.board)) expect(after.board[k]?.owner).toBe(s.board[k]?.owner);
  });

  it('equal or lower is illegal; so is my root; off means OWN_TILE; a limit gives STRENGTHEN_LIMIT', () => {
    const s = stateWith({ tiles: CHAIN, hand: [[0, 5], [0, 3], [0, 9]], config: cfg });
    expect(codeOf(() => apply(s, { t: 'Sprout', card: idOf(s, 0, 5), coord: { q: -1, r: 1 } }))).toBe('NOT_STRONGER');
    expect(codeOf(() => apply(s, { t: 'Sprout', card: idOf(s, 0, 3), coord: { q: -1, r: 1 } }))).toBe('NOT_STRONGER');
    expect(codeOf(() => apply(s, { t: 'Sprout', card: idOf(s, 0, 9), coord: { q: -2, r: 2 } }))).toBe('ROOT_IMMUNE');
    const off = stateWith({ tiles: CHAIN, hand: [[0, 9]], config: { allowStrengthen: false } });
    expect(codeOf(() => apply(off, { t: 'Sprout', card: idOf(off, 0, 9), coord: { q: 0, r: 1 } }))).toBe('OWN_TILE');
    const none = stateWith({ tiles: CHAIN, hand: [[0, 9]], config: { ...cfg, strengthenLimitPerGame: 0 } });
    expect(codeOf(() => apply(none, { t: 'Sprout', card: idOf(none, 0, 9), coord: { q: 0, r: 1 } }))).toBe('STRENGTHEN_LIMIT');
    const used = stateWith({ tiles: CHAIN, hand: [[0, 9]], config: { ...cfg, strengthenLimitPerGame: 2 }, patch: { strengthenUsed: [2, 0] } });
    expect(codeOf(() => apply(used, { t: 'Sprout', card: idOf(used, 0, 9), coord: { q: 0, r: 1 } }))).toBe('STRENGTHEN_LIMIT');
    const one = stateWith({ tiles: CHAIN, hand: [[0, 9]], config: { ...cfg, strengthenLimitPerGame: 2 }, patch: { strengthenUsed: [1, 0] } });
    expect(apply(one, { t: 'Sprout', card: idOf(one, 0, 9), coord: { q: 0, r: 1 } }).strengthenUsed).toEqual([2, 0]);
  });

  it('shares the per-turn Sprout limit with ordinary Sprouts, both ways', () => {
    const s = stateWith({ tiles: CHAIN, hand: [[0, 9], [1, 6]], config: cfg });
    const a = apply(s, { t: 'Sprout', card: idOf(s, 0, 9), coord: { q: 0, r: 1 } });
    expect(codeOf(() => apply(a, { t: 'Sprout', card: idOf(s, 1, 6), coord: { q: -2, r: 1 } }))).toBe('SPROUT_LIMIT');
    const b = apply(s, { t: 'Sprout', card: idOf(s, 1, 6), coord: { q: -2, r: 1 } });
    expect(codeOf(() => apply(b, { t: 'Sprout', card: idOf(s, 0, 9), coord: { q: 0, r: 1 } }))).toBe('SPROUT_LIMIT');
  });

  it('on a gold hex: still scores the same (gold counts double either way)', () => {
    const s = stateWith({ tiles: CHAIN, hand: [[0, 8]], config: cfg, rich: ['0,0'] });
    const after = apply(s, { t: 'Sprout', card: idOf(s, 0, 8), coord: { q: 0, r: 0 } });
    expect(after.board['0,0']).toEqual({ owner: 0, strength: 8 });
    expect(score(after, 0)).toBe(score(s, 0));
  });

  it('is a normal Sprout in legalActions: only higher cards, my non-root tiles, one per identical copy, board order', () => {
    const s = stateWith({ tiles: CHAIN, hand: [[0, 6], [0, 6], [2, 4]], config: cfg });
    const own = (a: Action) => a.t === 'Sprout' && s.board[coordKey(a.coord)]?.owner === 0;
    const acts = legalActions(viewFor(s, 0)).filter(own) as Extract<Action, { t: 'Sprout' }>[];
    const ids6 = s.hands[0].filter((c) => c.rank === 6).map((c) => c.id).sort((x, y) => x - y);
    const six = acts.filter((a) => s.hands[0].find((c) => c.id === a.card)!.rank === 6);
    expect(six.every((a) => a.card === ids6[0])).toBe(true); // deduped to the lowest id
    expect(six.map((a) => coordKey(a.coord))).toEqual(['0,0', '-1,1', '0,1'].sort((x, y) => order(x) - order(y)));
    const four = acts.filter((a) => s.hands[0].find((c) => c.id === a.card)!.rank === 4);
    expect(four.map((a) => coordKey(a.coord)).sort()).toEqual(['0,0', '0,1']);
    expect(legalActions(viewFor(s, 0)).every((a) => !(a.t === 'Sprout' && coordKey(a.coord) === '-2,2'))).toBe(true);
    for (const a of acts) expect(() => apply(s, a)).not.toThrow();
    const off = stateWith({ tiles: CHAIN, hand: [[0, 6]], config: { allowStrengthen: false } });
    expect(legalActions(viewFor(off, 0)).filter((a) => a.t === 'Sprout' && off.board[coordKey(a.coord)]?.owner === 0)).toEqual([]);
  });

  it('a JSON round trip of the state after a Strengthen continues identically', () => {
    const s = stateWith({ tiles: CHAIN, hand: [[0, 9], [1, 1]], config: cfg });
    const a = apply(s, { t: 'Sprout', card: idOf(s, 0, 9), coord: { q: 0, r: 1 } });
    const b = JSON.parse(JSON.stringify(a)) as State;
    expect(json(apply(b, { t: 'EndAct' }))).toBe(json(apply(a, { t: 'EndAct' })));
  });
});

// board order of a key (allCoords order: by q, then r)
const order = (k: string) => {
  const [q, r] = k.split(',').map(Number) as [number, number];
  return (q + 10) * 100 + (r + 10);
};

describe('Fruit (back, on by default)', () => {
  // P1: (-1,1) (0,1) (0,0) (1,1) chain from the root; P2: (1,-1)=4, (1,0)=9, (2,0)=4 hanging off (1,0).
  const tiles: Record<string, [Player, number]> = { '-1,1': [0, 3], '0,1': [0, 3], '0,0': [0, 3], '1,1': [0, 2], '1,-1': [1, 4], '1,0': [1, 9], '2,0': [1, 4] };
  const trio = [{ q: -1, r: 1 }, { q: 0, r: 1 }, { q: 0, r: 0 }];
  const fruit = (s: State, sacrifice = trio, target = { q: 1, r: 0 }) => apply(s, { t: 'Fruit', sacrifice, target });

  it('is on by default: once per player, removes a 9, then cuts both sides and lists it all in order', () => {
    const s = stateWith({ tiles, hand: [[0, 1]] });
    const before = json(s);
    const after = fruit(s);
    expect(json(s)).toBe(before);
    for (const k of ['-1,1', '0,1', '0,0', '1,0']) expect(after.board[k]).toBeNull();
    expect(after.board['2,0']).toBeNull(); // cut off from P2's root
    expect(after.board['1,1']).toBeNull(); // my own tile, cut off by my own sacrifice
    expect(after.fruitUsed).toEqual([1, 0]);
    const ev = after.history!.slice(s.history!.length).map((e) => e.t);
    expect(ev).toEqual(['Fruit', 'Sever', 'Sever']);
    expect(after.lastResolution!.fruit).toEqual({ sacrifice: trio, target: { q: 1, r: 0 } });
    expect(codeOf(() => fruit({ ...after, board: s.board }))).toBe('FRUIT_EXHAUSTED');
  });

  it('fruitSacrifice sets how many tiles are given up', () => {
    const two = stateWith({ tiles, hand: [[0, 1]], config: { fruitSacrifice: 2 } });
    expect(codeOf(() => fruit(two))).toBe('FRUIT_SACRIFICE_COUNT');
    expect(fruit(two, [{ q: 0, r: 1 }, { q: 0, r: 0 }]).board['1,0']).toBeNull();
    const four = stateWith({ tiles, hand: [[0, 1]], config: { fruitSacrifice: 4 } });
    expect(codeOf(() => fruit(four))).toBe('FRUIT_SACRIFICE_COUNT');
    expect(fruit(four, [...trio, { q: 1, r: 1 }]).board['1,0']).toBeNull();
    expect(legalActions(viewFor(four, 0)).filter((a) => a.t === 'Fruit').every((a) => (a as { sacrifice: unknown[] }).sacrifice.length === 4)).toBe(true);
  });

  it('fruitOnlyWhenBehind: refused while level or ahead, allowed when behind', () => {
    const level = stateWith({ tiles, hand: [[0, 1]], config: { fruitOnlyWhenBehind: true } });
    expect(score(level, 0)).toBeGreaterThan(score(level, 1));
    expect(codeOf(() => fruit(level))).toBe('FRUIT_NOT_BEHIND');
    expect(legalActions(viewFor(level, 0)).some((a) => a.t === 'Fruit')).toBe(false);
    const behind = stateWith({ tiles: { ...tiles, '2,-1': [1, 2], '3,-1': [1, 2], '2,-3': [1, 2] }, hand: [[0, 1]], config: { fruitOnlyWhenBehind: true } });
    expect(score(behind, 0)).toBeLessThan(score(behind, 1));
    expect(fruit(behind).fruitUsed).toEqual([1, 0]);
  });

  it('only in the Grow step; off with fruitPerPlayer 0', () => {
    const s = stateWith({ tiles, hand: [[0, 1]], patch: { phase: 'DISCARD' } });
    expect(codeOf(() => fruit(s))).toBe('WRONG_PHASE');
    const off = stateWith({ tiles, hand: [[0, 1]], config: { fruitPerPlayer: 0 } });
    expect(codeOf(() => fruit(off))).toBe('FRUIT_EXHAUSTED');
    expect(legalActions(viewFor(off, 0)).some((a) => a.t === 'Fruit')).toBe(false);
  });

  it('a failed Fruit changes nothing (atomic)', () => {
    const s = stateWith({ tiles, hand: [[0, 1]] });
    const before = json(s);
    expect(codeOf(() => fruit(s, [{ q: -1, r: 1 }, { q: 0, r: 0 }, { q: 1, r: 1 }]))).toBe('FRUIT_SACRIFICE_NOT_CONNECTED');
    expect(codeOf(() => fruit(s, trio, { q: 2, r: -2 }))).toBe('FRUIT_TARGET_ROOT');
    expect(codeOf(() => fruit(s, [{ q: -2, r: 2 }, { q: -1, r: 1 }, { q: 0, r: 1 }]))).toBe('FRUIT_SACRIFICE_ROOT');
    expect(json(s)).toBe(before);
  });

  it('Strengthen then Fruit on that tile: Fruit ignores strength', () => {
    const s = stateWith({ tiles: { ...tiles, '1,0': [1, 5] }, hand: [[0, 1]] });
    // the bot strengthens its 5 to a 9 ...
    const bot: State = { ...s, board: { ...s.board, '1,0': { owner: 1, strength: 9 } } };
    // ... and the 9 still falls to my Fruit
    expect(fruit(bot).board['1,0']).toBeNull();
  });
});
