// Step 7 (Fruit cards task): the 6 adversarial tests from the brief. Each sets a trap.
import { describe, expect, it } from 'vitest';
import { apply, isFruitCard, legalActions, newGame, viewFor } from '../../src/engine/index.js';
import type { Card, Player, State } from '../../src/engine/index.js';
import { fixture } from '../helpers.js';

const fruitCard = (id: number): Card => ({ id, suit: null, rank: 0 });
/** P1's Grow step on a hand-built board; the hands and deck are real cards (each once). */
const at = (tiles: Record<string, [Player, number]>, hand: Card[], o: Partial<State> = {}): State => {
  const g = newGame(9);
  const f = fixture({ tiles });
  const pool = [...g.hands[0], ...g.hands[1], ...g.deck, ...g.discard].filter((c) => !hand.some((h) => h.id === c.id));
  const numbered = pool.filter((c) => !isFruitCard(c));
  return { ...g, board: f.board, terrain: f.terrain, hands: [hand, numbered.slice(0, 7)], deck: numbered.slice(8), discard: [numbered[7]!], phase: 'ACT', turnPlayer: 0, actor: 0, history: [], ...o };
};
const arms: Record<string, [Player, number]> = { '-1,1': [0, 3], '0,0': [0, 3], '1,-1': [1, 9], '1,0': [1, 9], '2,0': [1, 5], '2,-1': [1, 6] };

describe('Fruit cards: 6 adversarial tests', () => {
  it('ADVERSARIAL 1: a Fruit card as the only card in hand: played, the hand is empty, the Throw step is skipped and the turn ends with a refill', () => {
    let s = at(arms, [fruitCard(72)]);
    s = apply(s, { t: 'PlayFruit', card: 72, target: { q: 1, r: 0 } });
    expect(s.hands[0]).toHaveLength(0);
    expect(legalActions(viewFor(s, 0))).toEqual([{ t: 'EndAct' }]);
    s = apply(s, { t: 'EndAct' });
    expect(s.turnPlayer).toBe(1);
    expect(s.hands[0]).toHaveLength(7); // refilled
    // and held alone in the Throw step it is a legal throw
    const t = at(arms, [fruitCard(72)], { phase: 'DISCARD' });
    expect(legalActions(viewFor(t, 0))).toEqual([{ t: 'Discard', card: 72 }]);
  });

  it('ADVERSARIAL 2: two Fruit cards in hand, both played in one turn (no limit), each with its own cut check', () => {
    let s = at(arms, [fruitCard(72), fruitCard(73)]);
    s = apply(s, { t: 'PlayFruit', card: 72, target: { q: 1, r: 0 } });
    s = apply(s, { t: 'PlayFruit', card: 73, target: { q: 1, r: -1 } });
    expect(s.fruitPlayed).toBe(2);
    expect(s.board['1,0']).toBeNull();
    expect(s.board['1,-1']).toBeNull();
    expect(s.history!.filter((e) => e.t === 'FruitCard')).toHaveLength(2);
    expect(s.phase).toBe('ACT');
  });

  it('ADVERSARIAL 3: a removal and the Strangle: a Fruit card only empties a hex, so it cannot strangle by itself; it can open a Strangle that a Sprout then completes', () => {
    // five of their root's six neighbours are mine; the sixth holds their 3
    const ring = ['-1,1', '0,0', '1,-1', '1,-2', '2,-3', '3,-3', '3,-2'];
    const tiles: Record<string, [Player, number]> = { '2,-1': [1, 3] };
    for (const k of ring) tiles[k] = [0, 2];
    const g = at(tiles, [fruitCard(72)]);
    const two = g.hands[1].find((c) => c.rank <= 3) ?? g.deck.find((c) => c.rank <= 3)!;
    const s: State = { ...g, hands: [[fruitCard(72), two], g.hands[1].filter((c) => c.id !== two.id)], deck: g.deck.filter((c) => c.id !== two.id) };
    const after = apply(s, { t: 'PlayFruit', card: 72, target: { q: 2, r: -1 } });
    expect(after.phase).toBe('ACT'); // no Strangle from the removal alone
    const win = apply(after, { t: 'Sprout', card: two.id, coord: { q: 2, r: -1 } });
    expect(win.result).toMatchObject({ winner: 0, reason: 'strangle' });
  });

  it('ADVERSARIAL 4: throwing a Fruit card and the opponent taking it: it moves hand to throw pile to their hand, and is then theirs to play', () => {
    let s = at(arms, [fruitCard(72), ...[]], { phase: 'DISCARD' });
    s = { ...s, hands: [[fruitCard(72), s.hands[1][0]!], s.hands[1].slice(1)] };
    s = apply(s, { t: 'Discard', card: 72 });
    expect(s.discard.at(-1)).toEqual(fruitCard(72));
    s = apply(s, { t: 'Draw', from: 'discard' });
    expect(s.hands[1].some((c) => c.id === 72)).toBe(true);
    expect(s.fruitKnown).toEqual([0, 1]);
    const theirs = legalActions(viewFor(s, 1)).filter((a) => a.t === 'PlayFruit');
    expect(theirs.length).toBeGreaterThan(0); // my (0,0) and (-1,1) touch their tiles
  });

  it('ADVERSARIAL 5: Strengthen on a tile, then a Fruit card on that same tile: the 9 still falls (Strengthen is no protection)', () => {
    // the opponent strengthens its 5 at (1,0) to a 9 ...
    const g = at({ '-1,1': [0, 3], '0,0': [0, 3], '1,-1': [1, 6], '1,0': [1, 5] }, [fruitCard(72)]);
    const nine = g.hands[1].find((c) => c.rank === 9) ?? g.deck.find((c) => c.rank === 9)!;
    let s: State = { ...g, hands: [g.hands[0], [nine, ...g.hands[1].filter((c) => c.id !== nine.id)]], deck: g.deck.filter((c) => c.id !== nine.id), turnPlayer: 1, actor: 1 };
    s = apply(s, { t: 'Sprout', card: nine.id, coord: { q: 1, r: 0 } });
    expect(s.board['1,0']).toEqual({ owner: 1, strength: 9 });
    // ... and on my turn my Fruit card removes it
    s = { ...s, turnPlayer: 0, actor: 0, phase: 'ACT', sproutsThisTurn: 0 };
    s = apply(s, { t: 'PlayFruit', card: 72, target: { q: 1, r: 0 } });
    expect(s.board['1,0']).toBeNull();
  });

  it('ADVERSARIAL 6: a Fruit card drawn on the last turn before the deck runs out: drawn, played, then the game ends on the refill, its result counted', () => {
    const g = at(arms, [], { phase: 'DRAW' });
    const numbers = g.hands[1];
    const s: State = { ...g, hands: [numbers.slice(0, 6), g.hands[1]], deck: [fruitCard(72)], discard: [...g.discard, ...g.deck] };
    let t = apply(s, { t: 'Draw', from: 'deck' });
    expect(t.deck).toHaveLength(0);
    expect(t.hands[0].some((c) => c.id === 72)).toBe(true);
    t = apply(t, { t: 'PlayFruit', card: 72, target: { q: 1, r: 0 } });
    expect(t.board['1,0']).toBeNull();
    t = apply(t, { t: 'EndAct' });
    t = apply(t, { t: 'Discard', card: t.hands[0][0]!.id });
    expect(t.phase).toBe('GAME_OVER');
    expect(t.result!.reason).toBe('deck_exhaustion');
    expect(t.result!.scores[1]).toBe(Object.values(t.board).filter((x) => x && x.owner === 1 && !x.root).length);
  });
});
