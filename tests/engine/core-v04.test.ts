import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  ConfigError,
  DEFAULT_CONFIG,
  IllegalActionError,
  apply,
  bestMeldPartition,
  createCards,
  legalActions,
  newGame,
  replay,
  resolveConfig,
  viewFor,
} from '../../src/engine/index.js';
import type { Action, Card, Phase, Player, RulesConfig, State, Suit } from '../../src/engine/index.js';
import { shuffleDeck } from '../../src/engine/deck.js';
import { clone, fixture, tilesOf } from '../helpers.js';
import { LEGACY_V03 } from '../legacy.js';
import { GreedyBot } from '../../src/bots/GreedyBot.js';

let nextId = 5000;
const c = (suit: Suit, rank: number): Card => ({ id: nextId++, suit, rank });
const junk = (n: number): Card[] => Array.from({ length: n }, (_, i) => c((i % 4) as Suit, 7 - (i % 3)));

const makeState = (o: {
  tiles?: Record<string, [Player, number]>;
  rock?: string[];
  rich?: string[];
  config?: Partial<RulesConfig>;
  hands?: [Card[], Card[]];
  deck?: Card[];
  discard?: Card[];
  phase?: Phase;
  turnPlayer?: Player;
  patch?: Partial<State>;
}): State => {
  const f = fixture({
    ...(o.tiles ? { tiles: o.tiles } : {}),
    ...(o.rock ? { rock: o.rock } : {}),
    ...(o.rich ? { rich: o.rich } : {}),
    ...(o.config ? { config: o.config } : {}),
  });
  const base = newGame(1, o.config ?? {});
  const tp = o.turnPlayer ?? 0;
  return {
    ...base,
    board: f.board,
    terrain: f.terrain,
    hands: o.hands ?? [junk(7), junk(7)],
    deck: o.deck ?? junk(20),
    discard: o.discard ?? [c(3, 6)],
    phase: o.phase ?? 'ACT',
    turnPlayer: tp,
    actor: tp,
    ...o.patch,
  };
};

const act = (s: State, a: Action): State => {
  const before = clone(s);
  try {
    return apply(s, a);
  } finally {
    expect(s).toEqual(before);
  }
};
const illegal = (s: State, a: Action, code: string) => {
  const before = clone(s);
  let err: unknown;
  try {
    apply(s, a);
  } catch (e) {
    err = e;
  }
  expect(err).toBeInstanceOf(IllegalActionError);
  expect((err as IllegalActionError).code).toBe(code);
  expect(s).toEqual(before);
};
const hasCombo = (h: Card[]) => bestMeldPartition(h).melds.length > 0;

describe('v0.4 config', () => {
  it('has the one-game defaults', () => {
    expect(DEFAULT_CONFIG).toMatchObject({
      maxRank: 9,
      copiesPerCard: 2,
      handSize: 7,
      sproutsPerTurn: 1,
      rotEnabled: false,
      knockEnabled: false,
      fruitPerPlayer: 1, // v0.5: Fruit is back
      maxTurnsPerPlayer: 30,
    });
  });

  const code = (p: Partial<RulesConfig>) => {
    try {
      resolveConfig(p);
    } catch (e) {
      return (e as ConfigError).code;
    }
    return null;
  };

  it('validates maxRank (5 to 9), sproutsPerTurn and the deck size', () => {
    expect(code({ maxRank: 4 })).toBe('INVALID_NUMBER');
    expect(code({ maxRank: 10 })).toBe('INVALID_NUMBER');
    expect(code({ maxRank: 6.5 })).toBe('INVALID_NUMBER');
    expect(code({ sproutsPerTurn: -1 })).toBe('INVALID_NUMBER');
    expect(code({ rotEnabled: 1 as never })).toBe('INVALID_BOOLEAN');
    // 4 x 5 x 1 = 20 cards: two hands of 9 + a discard leave only 1 card; need at least 1 to draw.
    expect(code({ maxRank: 5, copiesPerCard: 1, handSize: 9 })).toBe(null);
    expect(code({ maxRank: 5, copiesPerCard: 1, handSize: 10 })).toBe('DECK_TOO_SMALL');
    for (const m of [5, 6, 7, 8, 9]) expect(code({ maxRank: m })).toBe(null);
  });

  it.each([5, 6, 7, 9])('maxRank %i: the deck holds ranks 1..%i only', (m) => {
    const cards = createCards(resolveConfig({ maxRank: m }));
    expect(cards).toHaveLength(4 * m * 2);
    expect(Math.max(...cards.map((x) => x.rank))).toBe(m);
    expect(Math.min(...cards.map((x) => x.rank))).toBe(1);
    const g = newGame(3, { maxRank: m });
    const ids = [...g.hands[0], ...g.hands[1], ...g.deck, ...g.discard].map((x) => x.id).sort((a, b) => a - b);
    expect(ids).toEqual(cards.map((x) => x.id));
  });
});

describe('the deal (the opening-combo guarantee was removed in v0.5)', () => {
  it('the default deal is a plain shuffle: a hand with no combo is possible (1,000 seeds)', () => {
    let noCombo = 0;
    for (let seed = 1; seed <= 1000; seed++) {
      const g = newGame(seed);
      const shuffled = shuffleDeck(createCards(g.config), seed);
      expect(g.hands[0]).toEqual(shuffled.slice(0, 7));
      expect(g.hands[1]).toEqual(shuffled.slice(7, 14));
      expect(g.discard).toEqual([shuffled[14]]);
      expect(g.deck).toEqual(shuffled.slice(15));
      if (!hasCombo(g.hands[0]) || !hasCombo(g.hands[1])) noCombo++;
    }
    // Nothing is fixed up: plenty of real deals start without a combo in one hand.
    expect(noCombo).toBeGreaterThan(100);
  });
});

describe('Sprout', () => {
  const sprout = (card: Card, q: number, r: number): Action => ({ t: 'Sprout', card: card.id, coord: { q, r } });

  it('places one tile with strength = the card number, next to my network', () => {
    const five = c(1, 5);
    const s = makeState({ hands: [[five, ...junk(4)], junk(7)] });
    const n = act(s, sprout(five, -1, 1));
    expect(n.board['-1,1']).toEqual({ owner: 0, strength: 5 });
    expect(n.hands[0]).toHaveLength(4);
    expect(n.hands[0].some((x) => x.id === five.id)).toBe(false);
    expect(n.sproutsThisTurn).toBe(1);
    expect(n.lastResolution).toMatchObject({ placed: [{ q: -1, r: 1 }], sprout: { q: -1, r: 1 } });
    expect(n.history!.at(-1)).toEqual({ t: 'Sprout', player: 0, card: five.id, coord: { q: -1, r: 1 } });
    expect(n.phase).toBe('ACT');
  });

  it('needs to touch my network (the root counts)', () => {
    const five = c(1, 5);
    illegal(makeState({ hands: [[five, ...junk(4)], junk(7)] }), sprout(five, 0, 0), 'NOT_ADJACENT');
    const g = makeState({ hands: [[five, ...junk(4)], junk(7)], tiles: { '-1,1': [0, 2] } });
    expect(act(g, sprout(five, 0, 0)).board['0,0']).toEqual({ owner: 0, strength: 5 });
  });

  it('rejects rock, off-board, roots and my own tiles', () => {
    const five = c(1, 5);
    const hand: [Card[], Card[]] = [[five, ...junk(4)], junk(7)];
    illegal(makeState({ hands: hand, rock: ['-1,1'] }), sprout(five, -1, 1), 'ROCK');
    illegal(makeState({ hands: hand, tiles: { '-2,3': [0, 1] } }), sprout(five, -2, 4), 'OFF_BOARD');
    illegal(makeState({ hands: hand, tiles: { '1,-1': [0, 1], '0,0': [0, 1], '-1,1': [0, 1] } }), sprout(five, 2, -2), 'ROOT_IMMUNE');
    // v0.5: my own tile is a Strengthen when the card is higher; equal is refused, and with
    // Strengthen switched off my own tile is never a target
    illegal(makeState({ hands: hand, tiles: { '-1,1': [0, 5] } }), sprout(five, -1, 1), 'NOT_STRONGER');
    illegal(makeState({ hands: hand, config: { allowStrengthen: false }, tiles: { '-1,1': [0, 1] } }), sprout(five, -1, 1), 'OWN_TILE');
  });

  it('replaces only a strictly weaker enemy tile', () => {
    const five = c(1, 5);
    const hand: [Card[], Card[]] = [[five, ...junk(4)], junk(7)];
    const weaker = act(makeState({ hands: hand, tiles: { '-1,1': [1, 4] } }), sprout(five, -1, 1));
    expect(weaker.board['-1,1']).toEqual({ owner: 0, strength: 5 });
    expect(weaker.history!.some((e) => e.t === 'Overgrow')).toBe(true);
    illegal(makeState({ hands: hand, tiles: { '-1,1': [1, 5] } }), sprout(five, -1, 1), 'NOT_STRONGER');
    illegal(makeState({ hands: hand, tiles: { '-1,1': [1, 6] } }), sprout(five, -1, 1), 'NOT_STRONGER');
  });

  it('at most sproutsPerTurn per turn; 0 turns it off; the count resets next turn', () => {
    const a = c(1, 5);
    const b = c(2, 3);
    const s = makeState({ hands: [[a, b, ...junk(4)], junk(7)] });
    const once = act(s, sprout(a, -1, 1));
    illegal(once, sprout(b, -1, 2), 'SPROUT_LIMIT');
    expect(legalActions(viewFor(once, 0)).some((x) => x.t === 'Sprout')).toBe(false);
    const two = act(makeState({ hands: [[a, b, ...junk(4)], junk(7)], config: { sproutsPerTurn: 2 } }), sprout(a, -1, 1));
    expect(act(two, sprout(b, -1, 2)).sproutsThisTurn).toBe(2);
    illegal(makeState({ hands: [[a, ...junk(4)], junk(7)], config: { sproutsPerTurn: 0 } }), sprout(a, -1, 1), 'SPROUT_LIMIT');
    // Next turn starts at 0.
    const ended = act(act(once, { t: 'EndAct' }), { t: 'Discard', card: once.hands[0][0]!.id });
    expect(ended.turnPlayer).toBe(1);
    expect(ended.sproutsThisTurn).toBe(0);
    expect(viewFor(ended, 1).sproutsThisTurn).toBe(0);
  });

  it('is legal only in ACT and only with a card in hand', () => {
    const a = c(1, 5);
    illegal(makeState({ phase: 'DRAW', hands: [[a, ...junk(4)], junk(7)] }), sprout(a, -1, 1), 'WRONG_PHASE');
    illegal(makeState({ hands: [junk(5), junk(7)] }), { t: 'Sprout', card: 424242, coord: { q: -1, r: 1 } }, 'CARD_NOT_IN_HAND');
    illegal(makeState({ hands: [[a], junk(7)] }), { t: 'Sprout', card: a.id, coord: { q: 'x' } } as never, 'INVALID_COORD');
  });

  it('a Sprout that replaces an enemy link is followed by Sever', () => {
    // Enemy arm from its root: (1,-1) - (0,0) - (-1,0). Sprout a 5 onto (0,0) (strength 1).
    const five = c(1, 5);
    const s = makeState({ hands: [[five, ...junk(4)], junk(7)], tiles: { '-1,1': [0, 1], '1,-1': [1, 1], '0,0': [1, 1], '-1,0': [1, 1] } });
    const n = act(s, sprout(five, 0, 0));
    expect(n.board['0,0']).toEqual({ owner: 0, strength: 5 });
    expect(n.board['-1,0']).toBeNull();
    expect(n.lastResolution!.severed).toEqual([{ player: 1, coords: [{ q: -1, r: 0 }] }]);
  });

  it('legalActions offers Sprout per distinct card and target, deduped for copies, never above maxRank', () => {
    const a1 = c(1, 5);
    const a2 = { ...a1, id: a1.id + 1000 };
    const s = makeState({ hands: [[a2, a1, c(2, 3)], junk(7)] });
    const sprouts = legalActions(viewFor(s, 0)).filter((x) => x.t === 'Sprout');
    const cards = new Set(sprouts.map((x) => (x.t === 'Sprout' ? x.card : -1)));
    expect(cards.has(a2.id)).toBe(false); // the lower id stands for both copies
    expect(cards.has(a1.id)).toBe(true);
    for (const x of sprouts) expect(() => apply(s, x)).not.toThrow();
    for (let seed = 1; seed <= 30; seed++) {
      const g = newGame(seed);
      for (const t of Object.values(apply(g, { t: 'Draw', from: 'deck' }).board)) if (t && !t.root) expect(t.strength).toBeLessThanOrEqual(7);
    }
  });

  it('(d) is not offered when it has no legal target', () => {
    // Every neighbour of my root is rock or a stronger enemy tile.
    const one = c(1, 1);
    const s = makeState({
      hands: [[one, c(2, 1)], junk(7)],
      rock: ['-1,2', '-1,1', '-2,1'],
      tiles: { '-3,2': [1, 7], '-3,3': [1, 7], '-2,3': [1, 7] },
    });
    expect(legalActions(viewFor(s, 0)).some((x) => x.t === 'Sprout')).toBe(false);
  });

  it('is deterministic', () => {
    const play = () => {
      let g = newGame(12);
      const log: Action[] = [];
      for (let i = 0; i < 80 && g.phase !== 'GAME_OVER'; i++) {
        const acts = legalActions(viewFor(g, g.actor));
        const a = acts.find((x) => x.t === 'Sprout') ?? acts[0]!;
        log.push(a);
        g = apply(g, a);
      }
      return { log, g };
    };
    const one = play();
    expect(JSON.stringify(play().g)).toBe(JSON.stringify(one.g));
    expect(JSON.stringify(replay(12, one.log))).toBe(JSON.stringify(one.g));
    expect(one.log.some((x) => x.t === 'Sprout')).toBe(true);
  });
});

describe('the turn finishes by itself after Discard (Rot and Knock off)', () => {
  it('Discard refills and passes the turn; no Continue, no Knock, no KNOCK phase', () => {
    const s = makeState({ phase: 'DISCARD', hands: [junk(8), junk(7)] });
    const n = act(s, { t: 'Discard', card: s.hands[0][0]!.id });
    expect(n.phase).toBe('DRAW');
    expect(n.turnPlayer).toBe(1);
    expect(n.hands[0]).toHaveLength(7);
    expect(n.history!.some((e) => e.t === 'RotCount')).toBe(false);
    illegal(makeState({ phase: 'KNOCK' }), { t: 'Knock' }, 'KNOCK_DISABLED');
  });

  it('with Rot on but Knock off: KNOCK phase offers only Continue', () => {
    const s = makeState({ phase: 'KNOCK', config: { rotEnabled: true }, hands: [junk(4), junk(7)] });
    expect(legalActions(viewFor(s, 0))).toEqual([{ t: 'Continue' }]);
    illegal(s, { t: 'Knock' }, 'KNOCK_DISABLED');
  });

  it('with Knock on but Rot off: Continue never rots', () => {
    const high = [c(0, 9), c(1, 8), c(2, 9), c(3, 8)]; // 34 leftover points
    const s = makeState({ phase: 'KNOCK', config: { knockEnabled: true, maxRank: 9 }, hands: [high, junk(7)], tiles: { '-1,1': [0, 1] } });
    const n = act(s, { t: 'Continue' });
    expect(n.board['-1,1']).toEqual({ owner: 0, strength: 1 });
  });
});

describe('edge cases (v0.4)', () => {
  it('(a) an empty hand skips the discard: the turn still completes', () => {
    const r = [c(0, 3), c(0, 4), c(0, 5)];
    const s = makeState({ hands: [r, junk(7)] });
    const m = act(s, { t: 'MeldRun', cards: r.map((x) => x.id), start: { q: -1, r: 1 }, dir: 1 });
    expect(m.hands[0]).toEqual([]);
    expect(legalActions(viewFor(m, 0))).toEqual([{ t: 'EndAct' }]);
    const n = act(m, { t: 'EndAct' });
    expect(n.phase).toBe('DRAW');
    expect(n.turnPlayer).toBe(1);
    expect(n.hands[0]).toHaveLength(7);
    expect(n.history!.slice(m.history!.length).some((e) => e.t === 'Discard')).toBe(false);
  });

  it('(a) with Knock on, an empty hand goes straight to the Knock step', () => {
    const r = [c(0, 3), c(0, 4), c(0, 5)];
    const s = makeState({ hands: [r, junk(7)], config: { knockEnabled: true, maxRank: 9 } });
    const m = act(s, { t: 'MeldRun', cards: r.map((x) => x.id), start: { q: -1, r: 1 }, dir: 1 });
    expect(act(m, { t: 'EndAct' }).phase).toBe('KNOCK');
  });

  it('(b) the card just taken from the discard pile may be discarded when it is the only card', () => {
    const taken = c(3, 7);
    const r = [c(0, 3), c(0, 4), c(0, 5)];
    const s = makeState({ hands: [[...r, taken], junk(7)], patch: { drawnFromDiscard: taken.id } });
    const m = act(s, { t: 'MeldRun', cards: r.map((x) => x.id), start: { q: -1, r: 1 }, dir: 1 });
    const d = act(m, { t: 'EndAct' });
    expect(legalActions(viewFor(d, 0))).toEqual([{ t: 'Discard', card: taken.id }]);
    expect(act(d, { t: 'Discard', card: taken.id }).turnPlayer).toBe(1);
    // With another card still in hand, the old rule applies.
    const two = makeState({ phase: 'DISCARD', hands: [[taken, c(1, 2)], junk(7)], patch: { drawnFromDiscard: taken.id } });
    illegal(two, { t: 'Discard', card: taken.id }, 'REDUNDANT_DISCARD');
  });

  it('(c) the game ends right after the turn whose refill came up short; a tie goes to Player 2', () => {
    const s = makeState({ phase: 'DISCARD', hands: [[c(0, 1), c(1, 2), c(2, 3)], junk(7)], deck: [c(3, 4)] });
    const n = act(s, { t: 'Discard', card: s.hands[0][0]!.id });
    expect(n.phase).toBe('GAME_OVER');
    expect(n.hands[0]).toHaveLength(3); // 2 kept + the 1 card that existed
    expect(n.result).toEqual({ winner: 1, reason: 'deck_exhaustion', scores: [0, 0] });
  });

  it('(c) a refill that leaves the deck exactly empty also ends the game; higher score wins', () => {
    const s = makeState({ phase: 'DISCARD', hands: [junk(8), junk(7)], deck: [], tiles: { '-1,1': [0, 2] } });
    const n = act(s, { t: 'Discard', card: s.hands[0][0]!.id });
    expect(n.result).toEqual({ winner: 0, reason: 'deck_exhaustion', scores: [1, 0] });
  });
});

describe('turn limit (v0.4)', () => {
  it('the game ends right after turn 2 x maxTurnsPerPlayer, scored like the deck running out', () => {
    // Player 2 finishes turn 60 (30 each): the game ends with reason turn_limit; a tie goes to Player 2.
    const s = makeState({ phase: 'DISCARD', turnPlayer: 1, hands: [junk(7), junk(8)], patch: { turnNumber: 60 } });
    const n = act(s, { t: 'Discard', card: s.hands[1][0]!.id });
    expect(n.phase).toBe('GAME_OVER');
    expect(n.result).toEqual({ winner: 1, reason: 'turn_limit', scores: [0, 0] });
    // Turn 59 still passes to the next player.
    const t59 = makeState({ phase: 'DISCARD', hands: [junk(8), junk(7)], patch: { turnNumber: 59 } });
    expect(act(t59, { t: 'Discard', card: t59.hands[0][0]!.id }).phase).toBe('DRAW');
  });

  it('a short limit is respected; 0 means no limit; the limit is validated', () => {
    let g = newGame(4, { maxTurnsPerPlayer: 2 });
    for (let i = 0; i < 500 && g.phase !== 'GAME_OVER'; i++) g = apply(g, legalActions(viewFor(g, g.actor))[0]!);
    expect(g.phase).toBe('GAME_OVER');
    expect(g.turnNumber).toBeLessThanOrEqual(4);
    const free = makeState({ phase: 'DISCARD', config: { maxTurnsPerPlayer: 0 }, hands: [junk(8), junk(7)], patch: { turnNumber: 500 } });
    expect(act(free, { t: 'Discard', card: free.hands[0][0]!.id }).phase).toBe('DRAW');
    expect(() => resolveConfig({ maxTurnsPerPlayer: -1 })).toThrow(ConfigError);
  });

  it('the recorded stall (seed 122, both players swapping discards) now ends', () => {
    let g = newGame(122, { maxRank: 9, sproutsPerTurn: 0, copiesPerCard: 3, fruitPerPlayer: 0, allowStrengthen: false });
    for (let i = 0; i < 5000 && g.phase !== 'GAME_OVER'; i++) g = apply(g, GreedyBot.chooseAction(viewFor(g, g.actor)));
    expect(g.phase).toBe('GAME_OVER');
    expect(g.result!.reason).toBe('turn_limit');
  });
});

describe('legacyV03 reproduces v0.3.1 byte-for-byte', () => {
  const canonical = (x: unknown): string =>
    JSON.stringify(x, (_, v: unknown) =>
      v && typeof v === 'object' && !Array.isArray(v)
        ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)))
        : v,
    );
  const hash = (x: unknown) => createHash('sha256').update(canonical(x)).digest('hex');
  const NEW_STATE_KEYS = ['sproutsThisTurn', 'dealAttempt', 'strengthenUsed'];
  const NEW_CONFIG_KEYS = ['maxRank', 'sproutsPerTurn', 'rotEnabled', 'knockEnabled', 'maxTurnsPerPlayer', 'allowStrengthen', 'strengthenLimitPerGame', 'fruitSacrifice', 'fruitOnlyWhenBehind'];
  const toV03 = (s: State) => {
    const { history: _h, ...rest } = s;
    const out: Record<string, unknown> = { ...rest };
    for (const k of NEW_STATE_KEYS) delete out[k];
    const config: Record<string, unknown> = { ...s.config };
    for (const k of NEW_CONFIG_KEYS) delete config[k];
    out.config = config;
    return out;
  };
  const fixtureFile = JSON.parse(readFileSync(new URL('../fixtures/legacy-v03.json', import.meta.url), 'utf8')) as {
    games: { seed: number; bot: string; actions: Action[]; stateHash: string; historyHash: string }[];
  };

  it.each(fixtureFile.games.map((g) => [g.bot, g.seed, g] as const))('%s game, seed %i', (_bot, seed, g) => {
    const s = replay(seed, g.actions, LEGACY_V03);
    expect(hash(toV03(s))).toBe(g.stateHash);
    expect(hash(s.history)).toBe(g.historyHash);
  });

  it('every legacy game is a finished game', () => {
    for (const g of fixtureFile.games) expect(replay(g.seed, g.actions, LEGACY_V03).phase).toBe('GAME_OVER');
  });
});

void tilesOf;
