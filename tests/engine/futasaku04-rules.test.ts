// Futasaku 0.4 rules (owner decisions 2026-10-11):
// - who starts is a seeded 50/50 draw made by the engine, independent of anything else;
// - a tied score is decided by the total tile strength, and an equal strength is a real draw;
// - Blast (two Bombs, code name MegaBomb) is an extra move like Bloom: it neither needs nor
//   uses the turn's one Grow (code name Sprout), Strengthen or single Bomb.
import { describe, expect, it } from 'vitest';
import {
  CURRENT_RULES_VERSION, DEFAULT_CONFIG, RULES_VERSIONS, allNeighbors, apply, coordKey, deckExhaustionResult,
  homeCoord, legalActions, newGame, rulesConfig, viewFor,
} from '../../src/engine/index.js';
import type { Action, Card, Player, State, Tile } from '../../src/engine/index.js';

const bomb = (id: number): Card => ({ id, suit: null, rank: 0 });
const card = (id: number, rank = 3): Card => ({ id, suit: 0, rank });

describe('rules version', () => {
  it('is futasaku0.4, and every older version keeps P1 starting and ties to P2', () => {
    expect(CURRENT_RULES_VERSION).toBe('futasaku0.4');
    expect(DEFAULT_CONFIG.randomStarter).toBe(true);
    expect(DEFAULT_CONFIG.strengthTieBreak).toBe(true);
    for (const [version, config] of Object.entries(RULES_VERSIONS)) {
      if (version === CURRENT_RULES_VERSION) continue;
      expect(config.randomStarter, version).toBe(false);
      expect(config.strengthTieBreak, version).toBe(false);
    }
    expect(rulesConfig('futasaku0.3-six-card-bloom')?.expandedBloom).toBe(true);
  });
});

describe('who starts', () => {
  const seeds = Array.from({ length: 4000 }, (_, i) => i + 1);

  it('is decided by the engine from the seed, and the opening state belongs to the starter', () => {
    for (const seed of seeds.slice(0, 200)) {
      const s = newGame(seed);
      expect(newGame(seed).startingPlayer).toBe(s.startingPlayer);
      expect(s.turnPlayer).toBe(s.startingPlayer);
      expect(s.actor).toBe(s.startingPlayer);
      expect(s.phase).toBe('DRAW');
      expect(s.turnNumber).toBe(1);
    }
  });

  it('is close to 50/50 overall and independent of the seed parity and remainder', () => {
    const second = (list: number[]) => list.filter((seed) => newGame(seed).startingPlayer === 1).length / list.length;
    const near = (x: number) => expect(Math.abs(x - 0.5)).toBeLessThan(0.04);
    near(second(seeds));
    near(second(seeds.filter((s) => s % 2 === 0)));
    near(second(seeds.filter((s) => s % 2 === 1)));
    for (let r = 0; r < 3; r++) near(second(seeds.filter((s) => s % 3 === r)));
  });

  it('does not change the deal, terrain or deck', () => {
    for (const seed of seeds.slice(0, 50)) {
      const now = newGame(seed);
      const old = newGame(seed, { randomStarter: false });
      expect(old.startingPlayer).toBe(0);
      expect(now.hands).toEqual(old.hands);
      expect(now.deck).toEqual(old.deck);
      expect(now.discard).toEqual(old.discard);
      expect(now.terrain).toEqual(old.terrain);
    }
  });

  it('lets player 2 open with a draw when the draw says so, and turns alternate from there', () => {
    const seed = seeds.find((s) => newGame(s).startingPlayer === 1)!;
    const s = newGame(seed);
    expect(legalActions(viewFor(s, 1)).some((a) => a.t === 'Draw')).toBe(true);
    const drawn = apply(s, { t: 'Draw', from: 'deck' });
    expect(drawn.turnPlayer).toBe(1);
    expect(drawn.phase).toBe('ACT');
  });
});

describe('tie-break', () => {
  it('higher score wins; a tied score goes to the higher total strength; equal strength is a draw', () => {
    expect(deckExhaustionResult([5, 4], null, 'deck_exhaustion', [1, 30]).winner).toBe(0);
    const p1 = deckExhaustionResult([6, 6], null, 'deck_exhaustion', [31, 30]);
    expect(p1.winner).toBe(0);
    expect(p1.strengths).toEqual([31, 30]);
    expect(deckExhaustionResult([6, 6], null, 'turn_limit', [20, 29]).winner).toBe(1);
    const draw = deckExhaustionResult([6, 6], null, 'deck_exhaustion', [25, 25]);
    expect(draw.winner).toBeNull();
    expect(draw.reason).toBe('deck_exhaustion');
  });

  it('keeps the archived rule (a tie goes to player 2) when no strengths are given', () => {
    expect(deckExhaustionResult([6, 6], null).winner).toBe(1);
    expect(deckExhaustionResult([6, 6], null).strengths).toBeUndefined();
  });

  // The last no-draw final turn of a deck-end game: P1 ends it with equal scores.
  const finalTurn = (config: Partial<State['config']>, mine: number, theirs: number): State => {
    const base = newGame(4301, config);
    const board: Record<string, Tile | null> = { ...base.board };
    const free = Object.keys(board).filter((k) => board[k] === null && base.terrain[k] === 'normal');
    // two plain tiles each, on hexes next to their own home so nothing is cut off
    const near = (p: Player) => allNeighbors(homeCoord(p, base.config)).map(coordKey).filter((k) => free.includes(k)).slice(0, 2);
    const [a, b] = [near(0), near(1)];
    board[a[0]!] = { owner: 0, strength: mine }; board[a[1]!] = { owner: 0, strength: 1 };
    board[b[0]!] = { owner: 1, strength: theirs }; board[b[1]!] = { owner: 1, strength: 1 };
    return {
      ...base, board, startingPlayer: 0, turnPlayer: 1, actor: 1, turnNumber: 4, phase: 'ACT', deck: [],
      hands: [[card(1100)], [card(1101)]], deckFinal: { first: 0, remaining: 1 },
    };
  };
  const end = (s: State) => {
    const act = apply(s, { t: 'EndAct' });
    return apply(act, { t: 'Discard', card: act.hands[act.turnPlayer][0]!.id });
  };

  it('decides a tied deck-end game by strength in play', () => {
    const won = end(finalTurn({}, 9, 4));
    expect(won.phase).toBe('GAME_OVER');
    expect(won.result?.scores[0]).toBe(won.result?.scores[1]);
    expect(won.result?.winner).toBe(0);
    expect(won.result?.strengths).toEqual([10, 5]);
    const drawn = end(finalTurn({}, 6, 6));
    expect(drawn.result?.winner).toBeNull();
  });

  it('still gives the tie to player 2 under the archived Futasaku 0.3 rules', () => {
    const old = end(finalTurn(rulesConfig('futasaku0.3-six-card-bloom')!, 9, 4));
    expect(old.result?.winner).toBe(1);
    expect(old.result?.strengths).toBeUndefined();
  });
});

describe('Blast is an extra move, like Bloom', () => {
  const position = (): { state: State; target: { q: number; r: number } } => {
    const base = newGame(3107, { randomStarter: false });
    const target = { q: -1, r: 2 };
    // an enemy chain from their home to the target, so no Grow elsewhere cuts it off
    const from = coordKey(homeCoord(1, base.config));
    const prev = new Map<string, string | null>([[from, null]]);
    const queue = [homeCoord(1, base.config)];
    while (queue.length && !prev.has(coordKey(target))) {
      const at = queue.shift()!;
      for (const n of allNeighbors(at)) {
        const k = coordKey(n);
        if (k in base.board && base.terrain[k] !== 'rock' && base.board[k] === null && !prev.has(k)) { prev.set(k, coordKey(at)); queue.push(n); }
      }
    }
    const board: Record<string, Tile | null> = { ...base.board };
    for (let k: string | null | undefined = coordKey(target); k && k !== from; k = prev.get(k)) board[k] = { owner: 1, strength: 4 };
    const hand = [bomb(1000), bomb(1001), bomb(1003), card(1002, 9)];
    return { state: { ...base, board, hands: [hand, base.hands[1]], phase: 'ACT' }, target };
  };
  const blast = (target: { q: number; r: number }): Action => ({ t: 'MegaBomb', cards: [1000, 1001], target });

  it('can follow the turn\'s one Grow, and the Grow stays used', () => {
    const { state, target } = position();
    const grow = legalActions(viewFor(state, 0)).find((a) => a.t === 'Sprout' && coordKey(a.coord) !== coordKey(target))!;
    const grown = apply(state, grow);
    expect(legalActions(viewFor(grown, 0)).some((a) => a.t === 'MegaBomb')).toBe(true);
    const after = apply(grown, blast(target));
    expect(after.board[coordKey(target)]).toBeNull();
    expect(after.sproutsThisTurn).toBe(1);
    expect(legalActions(viewFor(after, 0)).some((a) => a.t === 'PlayFruit' || a.t === 'Sprout')).toBe(false);
  });

  it('does not use up the Grow: a Grow or a single Bomb can still follow it', () => {
    const { state, target } = position();
    const after = apply(state, blast(target));
    expect(after.sproutsThisTurn).toBe(0);
    const legal = legalActions(viewFor(after, 0));
    expect(legal.some((a) => a.t === 'Sprout')).toBe(true);
  });
});
