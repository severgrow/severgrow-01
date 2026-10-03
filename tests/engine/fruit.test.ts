// v0.6 Fruit cards (spec: "Fruit cards"). Four joker-style cards with no suit and no number.
// In Grow, play one on an opponent non-root tile that touches one of mine (my root counts when
// fruitRootCountsAsTouch is on): the tile is removed whatever its strength, the card leaves the
// game, then the cut check (both players) and the Strangle check run. No limit per turn or game.
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CONFIG,
  FRUIT_CARD_RANK,
  allCoords,
  apply,
  coordKey,
  createCards,
  deadwood,
  isFruitCard,
  legalActions,
  newGame,
  resolveConfig,
  viewFor,
} from '../../src/engine/index.js';
import type { Action, Card, Coord, Player, RulesConfig, State } from '../../src/engine/index.js';
import { clone, codeOf } from '../helpers.js';

const fruitCard = (id: number): Card => ({ id, suit: null, rank: FRUIT_CARD_RANK });
const num = (id: number, suit: 0 | 1 | 2 | 3, rank: number): Card => ({ id, suit, rank });

/** P1 root (-2,2), P2 root (2,-2) on the default board, all terrain normal. */
const position = (o: { tiles?: Record<string, [Player, number]>; hand?: Card[]; oppHand?: Card[]; config?: Partial<RulesConfig>; phase?: State['phase'] } = {}): State => {
  const s = newGame(1, o.config ?? {});
  const board: State['board'] = {};
  const terrain: State['terrain'] = {};
  for (const k of Object.keys(s.board)) {
    board[k] = s.board[k]?.root ? s.board[k]! : null;
    terrain[k] = 'normal';
  }
  for (const [k, [owner, strength]] of Object.entries(o.tiles ?? {})) board[k] = { owner, strength };
  return {
    ...s,
    board,
    terrain,
    hands: [o.hand ?? [fruitCard(72), num(1, 0, 2)], o.oppHand ?? [num(2, 1, 3), num(3, 2, 4)]],
    deck: s.deck.filter((c) => !isFruitCard(c)),
    discard: [num(50, 3, 9)],
    phase: o.phase ?? 'ACT',
    turnPlayer: 0,
    actor: 0,
    history: [],
  };
};
const at = (k: string): Coord => {
  const [q, r] = k.split(',').map(Number) as [number, number];
  return { q, r };
};
const play = (card: number, target: string): Action => ({ t: 'PlayFruit', card, target: at(target) });

// My arm: root (-2,2) - (-1,1) - (0,0). Their arm: root (2,-2) - (1,-1) - (1,0) - (2,0).
const arms = { '-1,1': [0, 3], '0,0': [0, 3], '1,-1': [1, 9], '1,0': [1, 9], '2,0': [1, 4] } as Record<string, [Player, number]>;

describe('the deck: 72 numbered cards and 4 Fruit cards', () => {
  it('76 cards; every number 1-9 still 8 times; 4 Fruit cards with no suit and no number', () => {
    expect(DEFAULT_CONFIG.fruitCardCount).toBe(4);
    expect(DEFAULT_CONFIG.fruitRootCountsAsTouch).toBe(true);
    const cards = createCards(resolveConfig());
    expect(cards).toHaveLength(76);
    const fruit = cards.filter(isFruitCard);
    expect(fruit).toHaveLength(4);
    for (const c of fruit) expect(c).toEqual({ id: c.id, suit: null, rank: 0 });
    expect(new Set(cards.map((c) => c.id)).size).toBe(76);
    for (let r = 1; r <= 9; r++) expect(cards.filter((c) => c.rank === r)).toHaveLength(8);
  });

  it('the old 3-tile Fruit is gone: no Fruit action, no per-player uses, no sacrifice keys', () => {
    for (const k of ['fruitPerPlayer', 'fruitSacrifice', 'fruitOnlyWhenBehind', 'maxFruitPerTurn']) expect(DEFAULT_CONFIG).not.toHaveProperty(k);
    expect(newGame(3)).not.toHaveProperty('fruitUsed');
    expect(codeOf(() => apply(position(), { t: 'Fruit', sacrifice: [], target: at('1,0') } as unknown as Action))).toBe('MALFORMED_ACTION');
  });

  it('fruitCardCount is a config number (0 = none), and the deal is still a fair shuffle of all of them', () => {
    expect(createCards(resolveConfig({ fruitCardCount: 0 }))).toHaveLength(72);
    expect(createCards(resolveConfig({ fruitCardCount: 6 })).filter(isFruitCard)).toHaveLength(6);
    expect(codeOf(() => resolveConfig({ fruitCardCount: -1 }))).toBe('INVALID_NUMBER');
    // Fruit cards land everywhere: in hands and at every depth of the deck
    const places = new Set<string>();
    for (let seed = 1; seed <= 300; seed++) {
      const g = newGame(seed);
      if (g.hands[0].some(isFruitCard)) places.add('hand0');
      if (g.hands[1].some(isFruitCard)) places.add('hand1');
      if (g.discard.some(isFruitCard)) places.add('discard');
      g.deck.forEach((c, i) => isFruitCard(c) && places.add(`deck${Math.floor((i * 4) / g.deck.length)}`));
    }
    expect([...places].sort()).toEqual(['deck0', 'deck1', 'deck2', 'deck3', 'discard', 'hand0', 'hand1']);
  });
});

describe('playing a Fruit card (PlayFruit)', () => {
  it('removes the target whatever its strength (a 9), the card leaves the game (not the throw pile)', () => {
    const s = position({ tiles: arms });
    const after = apply(s, play(72, '1,0'));
    expect(after.board['1,0']).toBeNull();
    expect(after.hands[0].map((c) => c.id)).toEqual([1]);
    expect(after.discard).toEqual(s.discard);
    expect(after.fruitPlayed).toBe(1);
    expect(after.lastResolution?.fruit).toEqual({ card: 72, target: at('1,0'), strength: 9 });
  });

  it('needs a Fruit card from my hand: a number card or a missing card is refused', () => {
    const s = position({ tiles: arms });
    expect(codeOf(() => apply(s, play(1, '1,0')))).toBe('NOT_A_FRUIT_CARD');
    expect(codeOf(() => apply(s, play(99, '1,0')))).toBe('CARD_NOT_IN_HAND');
    expect(codeOf(() => apply(position({ tiles: arms, hand: [num(1, 0, 2)] }), play(72, '1,0')))).toBe('CARD_NOT_IN_HAND');
  });

  it('Grow step only: refused while drawing or throwing', () => {
    for (const phase of ['DRAW', 'DISCARD'] as const) expect(codeOf(() => apply(position({ tiles: arms, phase }), play(72, '1,0')))).toBe('WRONG_PHASE');
  });

  it('never on a root, an empty hex, my own tile or a hex off the board', () => {
    const s = position({ tiles: { ...arms, '1,-2': [0, 2], '0,-1': [0, 2], '0,-2': [0, 2] } });
    expect(codeOf(() => apply(s, play(72, '2,-2')))).toBe('FRUIT_TARGET_ROOT');
    expect(codeOf(() => apply(s, play(72, '-1,0')))).toBe('FRUIT_TARGET_NOT_ENEMY');
    expect(codeOf(() => apply(s, play(72, '0,0')))).toBe('FRUIT_TARGET_NOT_ENEMY');
    expect(codeOf(() => apply(s, play(72, '9,9')))).toBe('OFF_BOARD');
  });

  it('the target must touch one of my tiles; my root counts (fruitRootCountsAsTouch), unless switched off', () => {
    expect(codeOf(() => apply(position({ tiles: arms }), play(72, '2,0')))).toBe('FRUIT_TARGET_NOT_TOUCHED');
    // (-1,2)... their tile right next to my root and nothing else of mine
    const nearRoot = { '-1,2': [1, 5], '0,1': [1, 5], '1,0': [1, 5], '1,-1': [1, 5] } as Record<string, [Player, number]>;
    expect(apply(position({ tiles: nearRoot }), play(72, '-1,2')).board['-1,2']).toBeNull();
    expect(codeOf(() => apply(position({ tiles: nearRoot, config: { fruitRootCountsAsTouch: false } }), play(72, '-1,2')))).toBe('FRUIT_TARGET_NOT_TOUCHED');
  });

  it('two Fruit cards in one turn (no limit), and Sprout still allowed after', () => {
    const s = position({ tiles: { ...arms, '0,-1': [1, 7] }, hand: [fruitCard(72), fruitCard(73), num(1, 0, 2)] });
    const a = apply(s, play(72, '1,0'));
    const b = apply(a, play(73, '0,-1'));
    expect(b.board['1,0']).toBeNull();
    expect(b.board['0,-1']).toBeNull();
    expect(b.fruitPlayed).toBe(2);
    expect(b.sproutsThisTurn).toBe(0);
    expect(legalActions(viewFor(b, 0)).some((x) => x.t === 'Sprout')).toBe(true);
  });

  it('a Fruit card can never sprout, strengthen or be melded, and is not wild', () => {
    const s = position({ tiles: arms, hand: [fruitCard(72), fruitCard(73), fruitCard(74), num(1, 0, 4), num(2, 0, 5)] });
    expect(codeOf(() => apply(s, { t: 'Sprout', card: 72, coord: at('-1,0') }))).toBe('NOT_A_NUMBER_CARD');
    expect(codeOf(() => apply(s, { t: 'Sprout', card: 72, coord: at('0,0') }))).toBe('NOT_A_NUMBER_CARD');
    expect(codeOf(() => apply(s, { t: 'MeldSet', cards: [72, 73, 74], hexes: [at('-1,0'), at('0,1'), at('-2,1')] }))).toBe('NOT_A_NUMBER_CARD');
    expect(codeOf(() => apply(s, { t: 'MeldRun', cards: [1, 2, 72], start: at('-1,0'), dir: 0 }))).toBe('NOT_A_NUMBER_CARD');
    for (const a of legalActions(viewFor(s, 0))) {
      if (a.t === 'Sprout') expect([72, 73, 74]).not.toContain(a.card);
      if (a.t === 'MeldRun' || a.t === 'MeldSet') for (const c of a.cards) expect([72, 73, 74]).not.toContain(c);
    }
  });

  it('then the cut check: tiles that hung only off the target are cut, events in order (FruitCard, then Sever)', () => {
    const s = position({ tiles: arms });
    const after = apply(s, play(72, '1,0'));
    expect(after.board['2,0']).toBeNull(); // hung off (1,0) only
    expect(after.board['1,-1']).toEqual({ owner: 1, strength: 9 });
    expect(after.history!.map((e) => e.t)).toEqual(['FruitCard', 'Sever']);
    expect(after.history![0]).toEqual({ t: 'FruitCard', player: 0, card: 72, target: at('1,0'), strength: 9 });
    expect(after.lastResolution?.severed).toEqual([{ player: 1, coords: [at('2,0')] }]);
  });

  it('the cut check runs for both players: a long chain falls with one Fruit', () => {
    const chain = { '-1,1': [0, 2], '0,0': [0, 2], '1,-1': [1, 9], '1,0': [1, 9], '0,1': [1, 2], '0,2': [1, 2], '1,1': [1, 2], '2,0': [1, 2] } as Record<string, [Player, number]>;
    const after = apply(position({ tiles: chain }), play(72, '1,0'));
    for (const k of ['1,0', '0,1', '0,2', '1,1', '2,0']) expect(after.board[k], k).toBeNull();
    expect(after.board['-1,1']).toEqual({ owner: 0, strength: 2 });
  });

  it('then the Strangle check (after each Fruit): a strangled root ends the game', () => {
    // all six neighbours of their root (2,-2) are mine, linked to my root; their stray 3 at (0,1)
    const ring = ['-1,1', '0,0', '1,-1', '1,-2', '2,-3', '3,-3', '3,-2', '2,-1'];
    const tiles: Record<string, [Player, number]> = { '0,1': [1, 3] };
    for (const k of ring) tiles[k] = [0, 2];
    const after = apply(position({ tiles }), play(72, '0,1'));
    expect(after.phase).toBe('GAME_OVER');
    expect(after.result).toMatchObject({ winner: 0, reason: 'strangle' });
    expect(after.history!.map((e) => e.t)).toEqual(['FruitCard', 'Strangle', 'GameEnd']);
  });

  it('atomic: a refused Fruit changes nothing; the input state is never changed', () => {
    const s = position({ tiles: arms });
    const before = clone(s);
    expect(() => apply(s, play(72, '2,0'))).toThrow();
    apply(s, play(72, '1,0'));
    expect(s).toEqual(before);
  });

  it('deterministic, and a state with Fruit cards survives a JSON round trip', () => {
    const s = position({ tiles: arms });
    expect(apply(s, play(72, '1,0'))).toEqual(apply(clone(s), play(72, '1,0')));
    const g = newGame(11);
    expect(JSON.parse(JSON.stringify(g))).toEqual(g);
    const a = apply(s, play(72, '1,0'));
    expect(JSON.parse(JSON.stringify(a))).toEqual(a);
  });

  it('a thrown Fruit card goes to the throw pile, and the opponent can take it', () => {
    let s = position({ tiles: arms, phase: 'DISCARD' });
    s = apply(s, { t: 'Discard', card: 72 });
    expect(s.discard.at(-1)).toEqual(fruitCard(72));
    expect(s.turnPlayer).toBe(1);
    s = apply(s, { t: 'Draw', from: 'discard' });
    expect(s.hands[1].some((c) => c.id === 72)).toBe(true);
    expect(legalActions(viewFor(s, 1)).some((a) => a.t === 'PlayFruit' && a.card === 72)).toBe(true);
  });

  it('legal moves: one PlayFruit per target (identical Fruit cards listed once, lowest id), in board order', () => {
    const s = position({ tiles: { ...arms, '0,-1': [1, 7] }, hand: [fruitCard(73), num(1, 0, 2), fruitCard(72)] });
    const fruit = legalActions(viewFor(s, 0)).filter((a) => a.t === 'PlayFruit');
    const keys = fruit.map((a) => JSON.stringify(a));
    expect(new Set(keys).size).toBe(keys.length);
    const order = allCoords(3).map(coordKey);
    const targets = ['0,-1', '1,-1', '1,0'].sort((a, b) => order.indexOf(a) - order.indexOf(b));
    expect(fruit).toEqual(targets.map((k) => play(72, k)));
    expect(legalActions(viewFor(s, 0))).toEqual(legalActions(viewFor(clone(s), 0)));
    // and card 73 is just as legal when played directly
    expect(apply(s, play(73, '1,0')).board['1,0']).toBeNull();
  });

  it('Rot and Knock (parked) still work: a Fruit card counts 0 and never melds', () => {
    expect(deadwood([fruitCard(72), fruitCard(73), fruitCard(74)])).toBe(0);
    expect(deadwood([fruitCard(72), num(1, 0, 5)])).toBe(5);
    const s = position({ tiles: arms, config: { rotEnabled: true, knockEnabled: true }, phase: 'DISCARD' });
    expect(apply(s, { t: 'Discard', card: 1 }).phase).toBe('KNOCK');
  });
});

describe('the View: "Fruit cards not yet seen" (public information only)', () => {
  it('starts at 4 minus my own Fruit cards and any in the throw pile', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const g = newGame(seed);
      for (const p of [0, 1] as const) {
        const v = viewFor(g, p);
        expect(v.fruitUnseen, `seed ${seed}`).toBe(4 - g.hands[p].filter(isFruitCard).length - g.discard.filter(isFruitCard).length);
      }
    }
  });

  it('a played Fruit card is seen by both; one taken from the throw pile is known to be in that hand', () => {
    const s = position({ tiles: arms, hand: [fruitCard(72), fruitCard(73), num(1, 0, 2)] });
    const a = apply(s, play(72, '1,0'));
    expect(viewFor(a, 1).fruitUnseen).toBe(4 - 1 - (a.hands[1].filter(isFruitCard).length));
    expect(viewFor(a, 0).fruitUnseen).toBe(4 - 1 - 1);
    // I throw my other Fruit card; the opponent takes it: I know where it is, they hold it
    let b = apply(apply(a, { t: 'EndAct' }), { t: 'Discard', card: 73 });
    expect(viewFor(b, 0).fruitUnseen).toBe(2);
    expect(viewFor(b, 1).fruitUnseen).toBe(2);
    b = apply(b, { t: 'Draw', from: 'discard' });
    expect(viewFor(b, 0).fruitUnseen).toBe(2); // known to be in their hand
    expect(viewFor(b, 1).fruitUnseen).toBe(2); // in my own hand
    expect(b.fruitKnown).toEqual([0, 1]);
  });

  it("the View never shows the opponent's hand or the deck order (unchanged)", () => {
    const v = viewFor(newGame(5), 0) as unknown as Record<string, unknown>;
    expect(v).not.toHaveProperty('deck');
    expect(v).not.toHaveProperty('hands');
  });
});
