// Step 4 (Fruit cards task): the Fruit card in the hand and on the board. Pure decisions:
// glow when it has a legal target, dim with a one-line reason when not; the tile card's
// shortcut "Use Fruit card" (with a note on a top-rank tile); the "Fruit cards unseen" chip;
// tapping the card lights its targets; Sort puts Fruit cards at the right.
import { describe, expect, it } from 'vitest';
import { apply, legalActions, newGame, viewFor } from '../../src/engine/index.js';
import type { Card, Player, State } from '../../src/engine/index.js';
import { FRUIT } from '../../src/strings.js';
import { fixture } from '../../tests/helpers.js';
import { EMPTY_SEL, onlyChoice, tapCard, tapHex, targetHexes } from '../src/logic/interaction.js';
import { fruitCardState, fruitOffer, hexTapIntent, unseenChip } from '../src/logic/fruitcard.js';
import { handOrder } from '../src/logic/hand.js';

const fruitCard = (id: number): Card => ({ id, suit: null, rank: 0 });
const num = (id: number, suit: 0 | 1 | 2 | 3, rank: number): Card => ({ id, suit, rank });
const at = (tiles: Record<string, [Player, number]>, hand: Card[], phase: State['phase'] = 'ACT'): State => {
  const g = newGame(5);
  const f = fixture({ tiles });
  return { ...g, board: f.board, terrain: f.terrain, hands: [hand, g.hands[1]], phase, turnPlayer: 0, actor: 0 };
};
// mine: root (-2,2) - (-1,1) - (0,0); theirs: (1,-1)=9 - (1,0)=4; far away (2,0)=3 (no touch)
const tiles: Record<string, [Player, number]> = { '-1,1': [0, 2], '0,0': [0, 2], '1,-1': [1, 9], '1,0': [1, 4], '2,0': [1, 3] };

describe('the Fruit card in my hand', () => {
  it('glows when it has a legal target; dims with a one-line reason when not', () => {
    const s = at(tiles, [fruitCard(72), num(1, 0, 3)]);
    const v = viewFor(s, 0);
    expect(fruitCardState(v, legalActions(v), 72)).toEqual({ ready: true, reason: null });
    const far = at({ '-1,1': [0, 2], '2,0': [1, 3] }, [fruitCard(72), num(1, 0, 3)]);
    const fv = viewFor(far, 0);
    expect(fruitCardState(fv, legalActions(fv), 72)).toEqual({ ready: false, reason: FRUIT.noTarget });
    const draw = viewFor(at(tiles, [fruitCard(72)], 'DRAW'), 0);
    expect(fruitCardState(draw, legalActions(draw), 72)).toEqual({ ready: false, reason: FRUIT.notNow });
    // in the Throw step it is a normal card to throw: no reason shown
    const thr = viewFor(at(tiles, [fruitCard(72), num(1, 0, 3)], 'DISCARD'), 0);
    expect(fruitCardState(thr, legalActions(thr), 72)).toEqual({ ready: false, reason: null });
    for (const r of [FRUIT.noTarget, FRUIT.notNow]) expect(r.length).toBeLessThanOrEqual(40);
  });

  it('tapping it lights only its targets (opponent non-root tiles touching mine), any strength', () => {
    const s = at(tiles, [fruitCard(72), num(1, 0, 3)]);
    const v = viewFor(s, 0);
    const sel = tapCard(v, legalActions(v), EMPTY_SEL, 72);
    expect([...targetHexes(v, legalActions(v), sel)].sort()).toEqual(['1,-1', '1,0']);
    // then the target: exactly one move, the Fruit card
    const both = tapHex(v, legalActions(v), sel, '1,-1');
    expect(onlyChoice(v, legalActions(v), both)).toEqual({ t: 'PlayFruit', card: 72, target: { q: 1, r: -1 } });
  });

  it('Sort puts Fruit cards at the right, by suit or by number', () => {
    const hand = [fruitCard(72), num(5, 2, 9), num(1, 0, 3), fruitCard(73), num(3, 1, 1)];
    expect(handOrder(hand, 'suit').map((c) => c.id)).toEqual([1, 3, 5, 72, 73]);
    expect(handOrder(hand, 'number').map((c) => c.id)).toEqual([3, 1, 5, 72, 73]);
  });
});

describe('the tile card shortcut: "Use Fruit card"', () => {
  it('shows on an opponent tile a Fruit card can remove, with a note on a top-rank tile', () => {
    const v = viewFor(at(tiles, [fruitCard(72)]), 0);
    const l = legalActions(v);
    expect(fruitOffer(v, l, '1,-1')).toEqual({ label: FRUIT.use, note: FRUIT.topRank, action: { t: 'PlayFruit', card: 72, target: { q: 1, r: -1 } } });
    expect(fruitOffer(v, l, '1,0')).toEqual({ label: FRUIT.use, note: null, action: { t: 'PlayFruit', card: 72, target: { q: 1, r: 0 } } });
    expect(FRUIT.use).toBe('Use Fruit card');
    expect(FRUIT.topRank).toBe('No combo can replace this. A Fruit card can.');
  });

  it('not on a tile it cannot reach, my own tile, a root, or without a Fruit card', () => {
    const v = viewFor(at(tiles, [fruitCard(72)]), 0);
    const l = legalActions(v);
    for (const k of ['2,0', '0,0', '2,-2', '-2,2']) expect(fruitOffer(v, l, k), k).toBeNull();
    const none = viewFor(at(tiles, [num(1, 0, 3)]), 0);
    expect(fruitOffer(none, legalActions(none), '1,-1')).toBeNull();
  });
});

describe('a tap on an opponent tile', () => {
  it('opens its tile card unless the picked card can play there', () => {
    const v = viewFor(at(tiles, [fruitCard(72), num(1, 0, 3)]), 0);
    const l = legalActions(v);
    expect(hexTapIntent(v, l, EMPTY_SEL, '1,0')).toBe('tilecard');
    expect(hexTapIntent(v, l, EMPTY_SEL, '-1,0')).toBe('pick'); // empty hex
    expect(hexTapIntent(v, l, tapCard(v, l, EMPTY_SEL, 72), '1,0')).toBe('pick');
    expect(hexTapIntent(v, l, tapCard(v, l, EMPTY_SEL, 72), '2,0')).toBe('tilecard');
  });
});

describe('the chip near the deck: "Fruit cards unseen: n"', () => {
  it('counts from public information only, and hides with no Fruit cards in the game', () => {
    const g = newGame(9);
    expect(unseenChip(viewFor(g, 0))).toBe(FRUIT.unseen(viewFor(g, 0).fruitUnseen));
    expect(FRUIT.unseen(2)).toBe('Fruit cards unseen: 2');
    expect(unseenChip(viewFor(newGame(9, { fruitCardCount: 0 }), 0))).toBeNull();
  });

  it('drops when a Fruit card is played', () => {
    const s = at(tiles, [fruitCard(72), num(1, 0, 3)]);
    const before = viewFor(s, 1).fruitUnseen;
    const after = apply(s, { t: 'PlayFruit', card: 72, target: { q: 1, r: 0 } });
    expect(viewFor(after, 1).fruitUnseen).toBe(before - 1);
  });
});
