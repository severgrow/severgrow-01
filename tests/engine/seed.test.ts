// The Seed ruleset (A/B test against Sprout). Written before the code.
// Seed: the Sprout move, but the new tile is always worth 1, whatever the card. Strengthen
// works as in Sprout (a strictly higher card on my own non-root tile, sharing the turn's one
// Sprout/Seed) with no per-game limit. Everything else is the same game.
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CONFIG,
  RULESETS,
  SEED_STRENGTH,
  apply,
  coordKey,
  createCards,
  legalActions,
  newGame,
  replay,
  resolveConfig,
  rulesConfig,
  rulesetOf,
  sproutStrength,
  viewFor,
} from '../../src/engine/index.js';
import type { Action, Card, Player, RulesConfig, State, Suit } from '../../src/engine/index.js';
import { GreedyBot } from '../../src/bots/GreedyBot.js';
import { LEVELS, chooseLevelAction } from '../../src/bots/levels.js';
import { checkState } from '../../src/sim/invariants.js';
import { codeOf, fixture, randomPlay } from '../helpers.js';

const SEED: Partial<RulesConfig> = RULESETS.seed;

/** P1 to act (Grow step) on a hand-built board, holding exactly these real cards. */
const stateWith = (o: { tiles?: Record<string, [Player, number]>; hand: [Suit, number][]; config?: Partial<RulesConfig>; rock?: string[]; patch?: Partial<State> }): State => {
  const g = newGame(7, o.config);
  const f = fixture({ tiles: o.tiles ?? {}, rock: o.rock ?? [], ...(o.config ? { config: o.config } : {}) });
  const pool = [...g.hands[0], ...g.hands[1], ...g.deck];
  const hand: Card[] = [];
  for (const [suit, rank] of o.hand) {
    const i = pool.findIndex((c) => c.suit === suit && c.rank === rank);
    if (i < 0) throw new Error('no such card left');
    hand.push(pool.splice(i, 1)[0]!);
  }
  return { ...g, board: f.board, terrain: f.terrain, hands: [hand, pool.splice(0, g.config.handSize)], deck: pool, phase: 'ACT', ...o.patch };
};
const idOf = (s: State, suit: Suit, rank: number) => s.hands[s.turnPlayer].find((c) => c.suit === suit && c.rank === rank)!.id;
const sprout = (card: number, key: string): Action => {
  const [q, r] = key.split(',').map(Number);
  return { t: 'Sprout', card, coord: { q: q!, r: r! } };
};
const legal = (s: State) => legalActions(viewFor(s, s.actor));
const json = (x: unknown) => JSON.stringify(x);
/** Cards no longer in a hand, the deck or the pile (played onto the board). */
const played = (s: State) => {
  const seen = new Set([...s.hands[0], ...s.hands[1], ...s.deck, ...s.discard].map((c) => c.id));
  return new Set(createCards(s.config).map((c) => c.id).filter((id) => !seen.has(id)));
};
/** Next turn for P1 again: same board, a new hand, the turn's Sprout/Seed unused. */
const nextTurn = (s: State, hand: [Suit, number][]): State => {
  const t = stateWith({ hand, config: s.config.ruleset ? SEED : {} });
  return { ...t, board: s.board, terrain: s.terrain, strengthenUsed: s.strengthenUsed, sproutsThisTurn: 0 };
};

// P1's root is (-2,2); its empty neighbours include (-1,1), (-2,1) and (-1,2).
const ROOT_NEIGHBOUR = '-1,1';

describe('the ruleset setting', () => {
  it('Sprout is the default and leaves the config exactly as before (no new key)', () => {
    expect('ruleset' in DEFAULT_CONFIG).toBe(false);
    expect(rulesetOf(DEFAULT_CONFIG)).toBe('sprout');
    expect(rulesetOf(newGame(1).config)).toBe('sprout');
    expect(RULESETS.sprout).toEqual({});
  });

  it('Seed is explicit in the config: ruleset "seed", and Strengthen has no per-game limit', () => {
    expect(RULESETS.seed).toEqual({ ruleset: 'seed', strengthenLimitPerGame: -1 });
    const c = resolveConfig(SEED);
    expect(c.ruleset).toBe('seed');
    expect(rulesetOf(c)).toBe('seed');
    expect(newGame(1, SEED).config.ruleset).toBe('seed');
    expect(viewFor(newGame(1, SEED), 0).config.ruleset).toBe('seed');
    expect(resolveConfig({ ruleset: 'sprout' }).ruleset).toBe('sprout');
  });

  it('rejects an unknown ruleset', () => {
    expect(codeOf(() => resolveConfig({ ruleset: 'bloom' as never }))).toBe('INVALID_RULESET');
    expect(codeOf(() => resolveConfig({ ruleset: 1 as never }))).toBe('INVALID_RULESET');
  });

  it('has its own rules version, so a recorded Seed game replays as Seed', () => {
    expect(rulesConfig('v0.5-seed')).toEqual({ ...DEFAULT_CONFIG, ...RULESETS.seed });
    expect(rulesConfig('v0.5-fruit-strengthen')!.ruleset).toBeUndefined();
  });

  it('sproutStrength: the card number in Sprout, always 1 in Seed', () => {
    expect(SEED_STRENGTH).toBe(1);
    for (let r = 1; r <= 9; r++) {
      expect(sproutStrength(DEFAULT_CONFIG, r)).toBe(r);
      expect(sproutStrength(resolveConfig(SEED), r)).toBe(1);
    }
  });
});

describe('Seed', () => {
  it('is a legal move next to my network, on empty hexes only', () => {
    const s = stateWith({ hand: [[0, 7]], config: SEED });
    const seeds = legal(s).filter((a) => a.t === 'Sprout');
    expect(seeds.length).toBeGreaterThan(0);
    for (const a of seeds) {
      const k = coordKey((a as Extract<Action, { t: 'Sprout' }>).coord);
      expect(s.board[k]).toBeNull();
    }
    expect(seeds.map((a) => coordKey((a as Extract<Action, { t: 'Sprout' }>).coord))).toContain(ROOT_NEIGHBOUR);
  });

  it('a 7 seeds a tile worth exactly 1, joined to my network; the 7 is used up', () => {
    const s = stateWith({ hand: [[0, 7], [1, 2]], config: SEED });
    const id = idOf(s, 0, 7);
    const after = apply(s, sprout(id, ROOT_NEIGHBOUR));
    expect(after.board[ROOT_NEIGHBOUR]).toEqual({ owner: 0, strength: 1, seed: true });
    expect(after.hands[0].map((c) => c.id)).not.toContain(id);
    expect(after.discard.map((c) => c.id)).not.toContain(id);
    expect(after.deck.map((c) => c.id)).not.toContain(id);
    expect(after.hands[0]).toHaveLength(1);
    expect(after.sproutsThisTurn).toBe(1);
    expect(after.lastResolution?.sprout).toEqual({ q: -1, r: 1 });
    expect(after.lastResolution?.severed).toEqual([]);
  });

  it('the card number never matters: every rank 1-9 gives the same 1-tile', () => {
    const boards = new Set<string>();
    for (let r = 1; r <= 9; r++) {
      const s = stateWith({ hand: [[2, r]], config: SEED });
      const after = apply(s, sprout(idOf(s, 2, r), ROOT_NEIGHBOUR));
      expect(after.board[ROOT_NEIGHBOUR]!.strength).toBe(1);
      boards.add(json(after.board));
    }
    expect(boards.size).toBe(1);
  });

  it('a seed scores like any 1-tile (scoring is unchanged)', () => {
    const s = stateWith({ hand: [[0, 9]], config: SEED });
    const before = viewFor(s, 0).score;
    const after = apply(s, sprout(idOf(s, 0, 9), ROOT_NEIGHBOUR));
    expect(viewFor(after, 0).score - before).toBe(1);
  });

  it('cannot be disconnected, on rock, off the board, on a root or on my own tile', () => {
    const s = stateWith({ hand: [[0, 7]], config: SEED, rock: ['-2,1'] });
    const id = idOf(s, 0, 7);
    expect(codeOf(() => apply(s, sprout(id, '1,-1')))).toBe('NOT_ADJACENT');
    expect(codeOf(() => apply(s, sprout(id, '0,0')))).toBe('NOT_ADJACENT');
    expect(codeOf(() => apply(s, sprout(id, '-2,1')))).toBe('ROCK');
    expect(codeOf(() => apply(s, sprout(id, '-5,2')))).toBe('NOT_ADJACENT');
    expect(codeOf(() => apply(s, sprout(id, '2,-2')))).toBe('NOT_ADJACENT');
    expect(codeOf(() => apply(s, sprout(id, '-2,2')))).toBe('ROOT_IMMUNE');
    const offered = legal(s).filter((a) => a.t === 'Sprout').map((a) => coordKey((a as Extract<Action, { t: 'Sprout' }>).coord));
    expect(offered).not.toContain('-2,1');
    expect(offered).not.toContain('1,-1');
    expect(offered).not.toContain('-2,2');
  });

  it('extends from any of my connected tiles, not only the root', () => {
    const s = stateWith({ tiles: { '-1,1': [0, 4], '0,0': [0, 3] }, hand: [[0, 7]], config: SEED });
    const after = apply(s, sprout(idOf(s, 0, 7), '1,-1'));
    expect(after.board['1,-1']).toEqual({ owner: 0, strength: 1, seed: true });
  });

  it('never replaces an enemy tile (a 1 is never strictly stronger), even an enemy 1', () => {
    const s = stateWith({ tiles: { '-1,1': [1, 1], '-2,1': [1, 3] }, hand: [[0, 9]], config: SEED });
    const id = idOf(s, 0, 9);
    expect(codeOf(() => apply(s, sprout(id, '-1,1')))).toBe('NOT_STRONGER');
    expect(codeOf(() => apply(s, sprout(id, '-2,1')))).toBe('NOT_STRONGER');
    const offered = legal(s).filter((a) => a.t === 'Sprout').map((a) => coordKey((a as Extract<Action, { t: 'Sprout' }>).coord));
    expect(offered).not.toContain('-1,1');
    expect(offered).not.toContain('-2,1');
  });

  it('one Seed or Strengthen per turn (they share the turn, as Sprout and Strengthen do)', () => {
    const s = stateWith({ tiles: { '-2,1': [0, 2] }, hand: [[0, 7], [1, 8]], config: SEED });
    const after = apply(s, sprout(idOf(s, 0, 7), ROOT_NEIGHBOUR));
    expect(legal(after).some((a) => a.t === 'Sprout')).toBe(false);
    expect(codeOf(() => apply(after, sprout(idOf(after, 1, 8), '-1,2')))).toBe('SPROUT_LIMIT');
    expect(codeOf(() => apply(after, sprout(idOf(after, 1, 8), '-2,1')))).toBe('SPROUT_LIMIT');
  });

  it('a seed is cut like any tile when its link to the root is lost', () => {
    // my seed (0,0) hangs on my 2 at (-1,1). The opponent (network (1,-1)-(1,0)-(0,1)) grows a
    // line 3-4-5 from (-1,1) westwards: the 3 replaces my 2 and the seed is cut off.
    const s0 = stateWith({ tiles: { '-1,1': [0, 2], '0,1': [1, 4], '1,0': [1, 4], '1,-1': [1, 4] }, hand: [[1, 3], [1, 4], [1, 5]], config: SEED });
    const board = { ...s0.board, '0,0': { owner: 0 as Player, strength: 1, seed: true as const } };
    const s: State = { ...s0, board, turnPlayer: 1, actor: 1, hands: [s0.hands[1], s0.hands[0]] };
    const cards = s.hands[1].map((c) => c.id);
    const after = apply(s, { t: 'MeldRun', cards, start: { q: -1, r: 1 }, dir: 3 });
    expect(after.board['-1,1']).toEqual({ owner: 1, strength: 3 });
    expect(after.board['0,0']).toBeNull();
    expect(after.lastResolution?.severed).toContainEqual({ player: 0, coords: [{ q: 0, r: 0 }] });
  });
});

describe('Seed then Strengthen', () => {
  it('Seed 1, next turn Strengthen with an 8: the tile becomes a normal 8', () => {
    const s = stateWith({ hand: [[0, 7]], config: SEED });
    const seeded = apply(s, sprout(idOf(s, 0, 7), ROOT_NEIGHBOUR));
    const t = nextTurn(seeded, [[1, 8]]);
    const id = idOf(t, 1, 8);
    expect(legal(t)).toContainEqual(sprout(id, ROOT_NEIGHBOUR));
    const grown = apply(t, sprout(id, ROOT_NEIGHBOUR));
    expect(grown.board[ROOT_NEIGHBOUR]).toEqual({ owner: 0, strength: 8 });
    expect(grown.lastResolution?.strengthen).toEqual({ coord: { q: -1, r: 1 }, from: 1, to: 8 });
    expect(grown.hands[0].map((c) => c.id)).not.toContain(id);
    expect(grown.strengthenUsed).toEqual([1, 0]);
  });

  it('upgrades go up only: 1->8, 5->8, 6->8 are legal; 8->8 and 9->8 are not', () => {
    for (const [from, ok] of [[1, true], [5, true], [6, true], [7, true], [8, false], [9, false]] as const) {
      const s = stateWith({ tiles: { [ROOT_NEIGHBOUR]: [0, from] }, hand: [[0, 8]], config: SEED });
      const a = sprout(idOf(s, 0, 8), ROOT_NEIGHBOUR);
      if (ok) {
        expect(apply(s, a).board[ROOT_NEIGHBOUR]).toEqual({ owner: 0, strength: 8 });
        expect(legal(s)).toContainEqual(a);
      } else {
        expect(codeOf(() => apply(s, a))).toBe('NOT_STRONGER');
        expect(legal(s)).not.toContainEqual(a);
      }
    }
  });

  it('a 1 cannot strengthen a seed (equal is not higher)', () => {
    const s = stateWith({ hand: [[0, 1], [1, 1]], config: SEED });
    const seeded = apply(s, sprout(idOf(s, 0, 1), ROOT_NEIGHBOUR));
    const t = nextTurn(seeded, [[2, 1]]);
    expect(codeOf(() => apply(t, sprout(idOf(t, 2, 1), ROOT_NEIGHBOUR)))).toBe('NOT_STRONGER');
  });

  it('the root can never be strengthened', () => {
    const s = stateWith({ hand: [[0, 9]], config: SEED });
    expect(codeOf(() => apply(s, sprout(idOf(s, 0, 9), '-2,2')))).toBe('ROOT_IMMUNE');
  });

  it('no per-game limit in Seed: a player can strengthen again after many uses', () => {
    const s = stateWith({ tiles: { [ROOT_NEIGHBOUR]: [0, 1] }, hand: [[0, 8]], config: SEED, patch: { strengthenUsed: [12, 0] } });
    const a = sprout(idOf(s, 0, 8), ROOT_NEIGHBOUR);
    expect(legal(s)).toContainEqual(a);
    expect(apply(s, a).strengthenUsed).toEqual([13, 0]);
  });

  it('Strengthen changes nothing else: no new hex, no cut, the network stays the same', () => {
    const s = stateWith({ tiles: { [ROOT_NEIGHBOUR]: [0, 1], '0,0': [0, 1] }, hand: [[0, 6]], config: SEED });
    const after = apply(s, sprout(idOf(s, 0, 6), '0,0'));
    const keys = (b: State['board']) => Object.entries(b).filter(([, t]) => t).map(([k, t]) => `${k}:${t!.owner}`).sort();
    expect(keys(after.board)).toEqual(keys(s.board));
    expect(after.lastResolution?.severed).toEqual([]);
  });
});

describe('Sprout is unchanged (regression)', () => {
  it('a 7 still sprouts a 7, with no seed mark', () => {
    const s = stateWith({ hand: [[0, 7]] });
    const after = apply(s, sprout(idOf(s, 0, 7), ROOT_NEIGHBOUR));
    expect(after.board[ROOT_NEIGHBOUR]).toEqual({ owner: 0, strength: 7 });
    expect(json(after.board[ROOT_NEIGHBOUR])).toBe('{"owner":0,"strength":7}');
  });

  it('a Sprout still replaces a weaker enemy tile', () => {
    const s = stateWith({ tiles: { [ROOT_NEIGHBOUR]: [1, 4] }, hand: [[0, 7]] });
    expect(apply(s, sprout(idOf(s, 0, 7), ROOT_NEIGHBOUR)).board[ROOT_NEIGHBOUR]).toEqual({ owner: 0, strength: 7 });
  });

  it('Strengthen keeps its limit of 2 per game in Sprout', () => {
    const s = stateWith({ tiles: { [ROOT_NEIGHBOUR]: [0, 1] }, hand: [[0, 8]], patch: { strengthenUsed: [2, 0] } });
    expect(codeOf(() => apply(s, sprout(idOf(s, 0, 8), ROOT_NEIGHBOUR)))).toBe('STRENGTHEN_LIMIT');
  });

  it('random Sprout games never make a seed tile', () => {
    randomPlay(3, 400, (s) => {
      for (const t of Object.values(s.board)) expect(t && 'seed' in t).toBeFalsy();
    });
  });
});

describe('Seed games: determinism, replay, bots', () => {
  it('random legal Seed games keep every invariant; seed tiles are always worth 1', () => {
    for (const g of [1, 2, 3]) {
      let seeds = 0;
      randomPlay(
        g,
        600,
        (s) => {
          checkState(s, played(s), undefined, 10_000);
          for (const t of Object.values(s.board)) {
            if (t?.seed) {
              seeds++;
              expect(t.strength).toBe(1);
              expect(t.root).toBeFalsy();
            }
          }
        },
        SEED,
      );
      expect(seeds).toBeGreaterThan(0);
    }
  });

  it('same seed + same actions + same ruleset = the same game; replay keeps it a Seed game', () => {
    const actions: Action[] = [];
    let s = newGame(21, SEED);
    while (s.phase !== 'GAME_OVER') {
      const a = GreedyBot.chooseAction(viewFor(s, s.actor));
      actions.push(a);
      s = apply(s, a);
    }
    const again = replay(21, actions, SEED);
    expect(json(again)).toBe(json(s));
    expect(again.config.ruleset).toBe('seed');
    // through JSON (a save) and back: still the same game
    const mid = replay(21, actions.slice(0, 40), SEED);
    const restored = JSON.parse(json(mid)) as State;
    expect(json(actions.slice(40).reduce((x, a) => apply(x, a), restored))).toBe(json(s));
    // the same actions under Sprout rules are a different game (or illegal): the ruleset matters
    let differs = false;
    try {
      differs = json(replay(21, actions)) !== json(s);
    } catch {
      differs = true;
    }
    expect(differs).toBe(true);
  });

  it('GreedyBot and every level bot finish Seed games with legal moves only', () => {
    for (const level of LEVELS) {
      let s = newGame(100 + level, SEED);
      let n = 0;
      let seeded = 0;
      while (s.phase !== 'GAME_OVER' && n < 3000) {
        const v = viewFor(s, s.actor);
        const a = s.actor === 0 ? GreedyBot.chooseAction(v) : chooseLevelAction(v, level, n);
        expect(legalActions(v)).toContainEqual(a);
        s = apply(s, a);
        if (s.lastResolution?.sprout) seeded++;
        n++;
      }
      expect(s.phase).toBe('GAME_OVER');
      expect(seeded).toBeGreaterThan(0);
    }
  });
});
