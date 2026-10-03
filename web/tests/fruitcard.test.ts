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

describe("a Fruit card's targets on the board", () => {
  it('are their own calm kind ("Remove with a Fruit card"), never "replace"', async () => {
    const { targetKinds, TARGET_LABEL } = await import('../src/logic/interaction.js');
    const v = viewFor(at(tiles, [fruitCard(72), num(1, 0, 3)]), 0);
    const l = legalActions(v);
    const kinds = targetKinds(v, l, tapCard(v, l, EMPTY_SEL, 72));
    expect([...kinds.values()]).toEqual(['fruit', 'fruit']);
    expect(TARGET_LABEL.fruit).toBe('Remove with a Fruit card');
  });
});

describe('the opponent and Fruit cards: calm captions', () => {
  it('"Opponent used a Fruit card on your 9" and "Opponent took the Fruit card"', async () => {
    const { buildSteps, captionFor } = await import('../src/logic/anim.js');
    // the opponent (P2) holds a Fruit card next to my 9
    const g = newGame(5);
    const f = fixture({ tiles: { '-1,1': [0, 9], '1,-1': [1, 3], '0,0': [1, 3] } });
    const s: State = { ...g, board: f.board, terrain: f.terrain, hands: [g.hands[0], [fruitCard(72), num(1, 0, 3)]], phase: 'ACT', turnPlayer: 1, actor: 1, history: [] };
    const a = { t: 'PlayFruit' as const, card: 72, target: { q: -1, r: 1 } };
    const steps = buildSteps(s, a, apply(s, a), 0);
    expect(captionFor(steps[0]!, 0)).toBe('Opponent used a Fruit card on your 9');
    // they take a Fruit card from the throw pile
    const t: State = { ...g, discard: [fruitCard(73)], phase: 'DRAW', turnPlayer: 1, actor: 1, history: [] };
    const d = { t: 'Draw' as const, from: 'discard' as const };
    expect(captionFor(buildSteps(t, d, apply(t, d), 0)[0]!, 0)).toBe('Opponent took the Fruit card');
  });
});

describe('state equivalence with Fruit cards (Step 7)', () => {
  it('the shown board after the animation steps (played, or all skipped at once) equals the engine; Undo restores the exact state', async () => {
    const { AnimQueue, buildSteps } = await import('../src/logic/anim.js');
    const { Session } = await import('../src/logic/session.js');
    // their 9 at (1,0) holds (2,0)=5 and (3,-1)=4; (1,-1)=9 stays joined
    const s0 = at({ '-1,1': [0, 2], '0,0': [0, 2], '1,-1': [1, 9], '1,0': [1, 9], '2,0': [1, 5], '3,-1': [1, 4] }, [fruitCard(72), fruitCard(73), num(1, 0, 3)]);
    const s = { ...s0, history: [] } as State;
    const session = new Session(s);
    for (const target of [{ q: 1, r: 0 }, { q: 1, r: -1 }]) {
      const before = session.state;
      const played = session.play({ t: 'PlayFruit', card: session.view.hand.find((c) => c.suit === null)!.id, target }, 0)!;
      expect(played).toBeTruthy();
      // animations on: step by step; off or skipped: all at once
      const one = new AnimQueue(before.board);
      one.push(played.steps);
      while (one.next());
      const all = new AnimQueue(before.board);
      all.push(buildSteps(before, played.action, played.after, 0));
      all.skipAll();
      expect(one.board).toEqual(played.after.board);
      expect(all.board).toEqual(played.after.board);
    }
    expect(session.state.fruitPlayed).toBe(2);
    const after2 = JSON.stringify(session.state);
    session.undo();
    session.undo();
    expect(JSON.stringify(session.state)).toBe(JSON.stringify(s));
    expect(after2).not.toBe(JSON.stringify(s));
  });
});

describe('the hint line with a picked Fruit card (self-review fix)', () => {
  it('never says "grow": the note, the tap hint, or why it has nothing to do', async () => {
    const { hintFor } = await import('../src/logic/hint.js');
    const { SPROUT } = await import('../../src/strings.js');
    const base = { phase: 'ACT', myTurn: true, busy: false, words: SPROUT, deckCount: 40, canTakeThrow: false, pending: null, drawing: null, card: { single: false, grow: false, replace: false, strengthen: false }, kindPicked: false, hexWithNoMove: false, handEmpty: false, canSprout: true, canCombo: false, throwEndsTurn: false } as const;
    expect(hintFor({ ...base, fruit: { firstTime: true } }).text).toBe(FRUIT.anyStrength);
    expect(hintFor({ ...base, fruit: { firstTime: false } }).text).toBe(FRUIT.tapTarget);
    expect(hintFor({ ...base, fruit: { firstTime: false, reason: FRUIT.noTarget } }).text).toBe(FRUIT.noTarget);
    expect(hintFor({ ...base, fruit: null }).text).toBe("That card can't grow anywhere now");
  });
});
