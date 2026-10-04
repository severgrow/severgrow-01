// v0.8: a Fruit card uses the turn's Sprout (like Strengthen): each Grow step allows one Sprout,
// one Strengthen or one Fruit card, not more. Blooms are unaffected.
import { describe, expect, it } from 'vitest';
import { apply, legalActions, newGame, viewFor } from '../../src/engine/index.js';
import type { Action, Card, Player, RulesConfig, State } from '../../src/engine/index.js';
import { codeOf } from '../helpers.js';

const c = (id: number, suit: 0 | 1 | 2 | 3, rank: number): Card => ({ id, suit, rank });
const fruit = (id: number): Card => ({ id, suit: null, rank: 0 });

/**
 * My Grow step: my home (-2,2) with my tiles (-2,1), (-1,0); the opponent's chain from their
 * home (1,-1)-(0,0)-(-1,1) touches mine twice, so after a Fruit card on (-1,1) the tile on
 * (0,0) is still theirs, still joined, and still a legal second target.
 */
const position = (hand: Card[], config: Partial<RulesConfig> = {}): State => {
  const s = newGame(1, config);
  const board: State['board'] = {};
  for (const k of Object.keys(s.board)) board[k] = s.board[k]?.root ? s.board[k]! : null;
  const tiles: Record<string, [Player, number]> = { '1,-1': [1, 5], '0,0': [1, 5], '-1,1': [1, 5], '-2,1': [0, 3], '-1,0': [0, 3] };
  for (const [k, [owner, strength]] of Object.entries(tiles)) board[k] = { owner, strength };
  const terrain: State['terrain'] = Object.fromEntries(Object.keys(s.board).map((k) => [k, 'normal' as const]));
  return { ...s, board, terrain, hands: [hand, [c(90, 1, 3), c(91, 2, 4)]], discard: [c(95, 3, 9)], phase: 'ACT', turnPlayer: 0, actor: 0, history: [], sproutsThisTurn: 0 };
};
const legal = (s: State) => legalActions(viewFor(s, 0));
const kinds = (s: State) => new Set(legal(s).map((a) => a.t));
const code = (s: State, a: Action) => codeOf(() => apply(s, a)) ?? null;

describe('a Fruit card uses the turn\'s Sprout (v0.8)', () => {
  const hand = [fruit(72), fruit(73), c(1, 0, 6), c(2, 1, 2)];

  it('is the default', () => {
    expect(newGame(1).config.fruitUsesSprout).toBe(true);
  });

  it('after a Fruit card: no Sprout, no Strengthen, no second Fruit card this turn', () => {
    const s = position(hand);
    const play = legal(s).find((a) => a.t === 'PlayFruit' && a.target.q === -1 && a.target.r === 1)!;
    const after = apply(s, play);
    expect(after.board['0,0']?.owner).toBe(1); // a second target is still there
    expect(after.phase).toBe('ACT');
    expect(after.sproutsThisTurn).toBe(1);
    const k = kinds(after);
    expect(k.has('Sprout')).toBe(false);
    expect(k.has('PlayFruit')).toBe(false);
    expect(k.has('EndAct')).toBe(true);
    // the engine refuses them too, with the same reason as a second Sprout
    expect(code(after, { t: 'Sprout', card: 1, coord: { q: -1, r: 1 } })).toBe('SPROUT_LIMIT');
    expect(code(after, { t: 'PlayFruit', card: 73, target: { q: 0, r: 0 } })).toBe('SPROUT_LIMIT');
  });

  it('after a Sprout: no Fruit card this turn', () => {
    const s = position(hand);
    const sp = legal(s).find((a) => a.t === 'Sprout' && a.card === 1)!;
    const after = apply(s, sp);
    expect(kinds(after).has('PlayFruit')).toBe(false);
    expect(code(after, { t: 'PlayFruit', card: 72, target: { q: -1, r: 1 } })).toBe('SPROUT_LIMIT');
  });

  it('Blooms still work after a Fruit card', () => {
    const s = position([fruit(72), c(1, 0, 6), c(2, 1, 6), c(3, 2, 6)]);
    const after = apply(s, legal(s).find((a) => a.t === 'PlayFruit')!);
    expect(kinds(after).has('Bloom')).toBe(true);
  });

  it('switched off, the old rule returns: Fruit cards do not use the Sprout', () => {
    const s = position(hand, { fruitUsesSprout: false });
    const after = apply(s, legal(s).find((a) => a.t === 'PlayFruit' && a.target.q === -1 && a.target.r === 1)!);
    expect(after.sproutsThisTurn).toBe(0);
    expect(kinds(after).has('PlayFruit')).toBe(true);
    expect(kinds(after).has('Sprout')).toBe(true);
  });
});
