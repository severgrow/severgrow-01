// v0.5 UI logic: three kinds of Sprout target, the Strengthen preview, the Fruit button and
// its three-step flow, first-time tips, and the animation steps. Written before the code.
import { describe, expect, it } from 'vitest';
import { apply, coordKey, legalActions, newGame, viewFor } from '../../src/engine/index.js';
import type { Action, Card, Player, RulesConfig, State, Suit } from '../../src/engine/index.js';
import { EMPTY_SEL, playNow, sproutKind, tapCard, tapHex, targetKinds, TARGET_LABEL, pendingAction } from '../src/logic/interaction.js';
import { previewMove } from '../src/logic/preview.js';
import { FRUIT_START, fruitAction, fruitButton, fruitPickable, fruitPreview, fruitUndo, tapFruit } from '../src/logic/fruitflow.js';
import { buildSteps } from '../src/logic/anim.js';
import { moveTier, tierBanner } from '../src/logic/juice.js';
import { TIPS, markTip, parseTips } from '../src/logic/tips.js';
import { fixture } from '../../tests/helpers.js';

const stateWith = (tiles: Record<string, [Player, number]>, hand: [Suit, number][], config: Partial<RulesConfig> = {}, patch: Partial<State> = {}): State => {
  const g = newGame(5, config);
  const f = fixture({ tiles, config });
  const pool = [...g.hands[0], ...g.hands[1], ...g.deck];
  const h: Card[] = [];
  for (const [su, r] of hand) h.push(pool.splice(pool.findIndex((c) => c.suit === su && c.rank === r), 1)[0]!);
  return { ...g, board: f.board, terrain: f.terrain, hands: [h, pool.splice(0, 7)], deck: pool, phase: 'ACT', ...patch };
};

describe('three kinds of Sprout target', () => {
  // my (-1,1)=5 (weaker than a 9), (0,0)=9 (not weaker); their (1,0)=4
  const s = stateWith({ '-1,1': [0, 5], '0,0': [0, 9], '1,0': [1, 4] }, [[0, 9]]);
  const v = viewFor(s, 0);
  const legal = legalActions(v);
  const id = v.hand[0]!.id;

  it('each target is a grow, a replace or a strengthen, shown with its own words (not colour alone)', () => {
    const sel = tapCard(v, legal, EMPTY_SEL, id);
    const kinds = targetKinds(v, legal, sel);
    expect(kinds.get('-1,1')).toBe('strengthen');
    expect(kinds.get('1,0')).toBe('replace');
    expect(kinds.get('-2,1')).toBe('grow');
    expect(kinds.has('0,0')).toBe(false); // equal strength: not a target
    expect(TARGET_LABEL).toEqual({ grow: 'Grow on an empty hex', replace: 'Replace an enemy tile', strengthen: 'Strengthen my tile' });
    expect(sproutKind(v, { t: 'Sprout', card: id, coord: { q: -1, r: 1 } })).toBe('strengthen');
  });

  it('ADVERSARIAL 7 (UI): one card, both a new Sprout and a Strengthen: the tapped spot decides; Strengthen waits for Confirm, growing plays at once', () => {
    let sel = tapCard(v, legal, EMPTY_SEL, id);
    sel = tapHex(v, legal, sel, '-1,1');
    expect(playNow(v, legal, sel)).toBeNull(); // a Strengthen is never played by a stray tap
    expect(pendingAction(v, legal, sel)).toEqual({ t: 'Sprout', card: id, coord: { q: -1, r: 1 } });
    const pv = previewMove(v, pendingAction(v, legal, sel)!)!;
    expect(pv.chip).toBe('Strengthen 5 → 9');
    expect(pv.note).toMatch(/no points/i);
    expect(pv.ghosts).toEqual([{ key: '-1,1', strength: 9, replaces: false }]);
    let grow = tapCard(v, legal, EMPTY_SEL, id);
    grow = tapHex(v, legal, grow, '-2,1');
    expect(playNow(v, legal, grow)).toEqual({ t: 'Sprout', card: id, coord: { q: -2, r: 1 } });
  });
});

describe('the Fruit button', () => {
  const ready = stateWith({ '-1,1': [0, 2], '0,1': [0, 2], '0,0': [0, 2], '1,0': [1, 9], '1,-1': [1, 9] }, [[0, 1]]);

  it('shows only when Fruit is on, with "1 left", and says why when it cannot be used', () => {
    const v = viewFor(ready, 0);
    expect(fruitButton(v, legalActions(v))).toEqual({ show: true, enabled: true, left: 1, reason: null, used: false });
    const off = viewFor(stateWith({}, [[0, 1]], { fruitPerPlayer: 0 }), 0);
    expect(fruitButton(off, legalActions(off)).show).toBe(false);
    const few = viewFor(stateWith({ '-1,1': [0, 2], '0,1': [0, 2] }, [[0, 1]]), 0);
    expect(fruitButton(few, legalActions(few))).toMatchObject({ show: true, enabled: false, reason: 'Needs 3 connected tiles' });
    const lonely = viewFor(stateWith({ '-1,1': [0, 2], '-2,1': [0, 2], '-3,1': [0, 2] }, [[0, 1]]), 0);
    expect(fruitButton(lonely, legalActions(lonely))).toMatchObject({ enabled: false, reason: 'No enemy tile next to them' });
    const used = viewFor({ ...ready, fruitUsed: [1, 0] }, 0);
    expect(fruitButton(used, legalActions(used))).toMatchObject({ show: true, enabled: false, reason: 'Already used', used: true, left: 0 });
  });
});

describe('the Fruit flow: pick 3, pick a target, preview and confirm', () => {
  // my chain root - (-1,1) - (0,1) - (0,0) - (1,1) ; theirs (1,-1)=9 - (1,0)=9 - (2,0) - (3,-1)
  const tiles: Record<string, [Player, number]> = { '-1,1': [0, 2], '0,1': [0, 2], '0,0': [0, 2], '1,1': [0, 2], '1,-1': [1, 9], '1,0': [1, 9], '2,0': [1, 3], '3,-1': [1, 3] };
  const s = stateWith(tiles, [[0, 1]]);
  const v = viewFor(s, 0);
  const legal = legalActions(v);

  it('step 1: my tiles glow, the root and enemy tiles are gently refused, a counter shows n/3, Undo steps back', () => {
    let f = FRUIT_START;
    expect(fruitPickable(v, legal, f)).toEqual(new Set(['-1,1', '0,1', '0,0', '1,1']));
    let r = tapFruit(v, legal, f, '-2,2');
    expect(r.refused).toBe("Your root can't be given up");
    r = tapFruit(v, legal, f, '1,0');
    expect(r.refused).toBe('Pick 3 of your own tiles');
    r = tapFruit(v, legal, f, '-1,1');
    expect(r.refused).toBeNull();
    f = r.flow;
    expect(f.picks).toEqual(['-1,1']);
    expect(f.counter).toBe('1/3');
    // (1,1) can still join through (0,1), so it still glows
    expect(fruitPickable(v, legal, f).has('1,1')).toBe(true);
    const two = tapFruit(v, legal, f, '0,0').flow;
    expect(two.counter).toBe('2/3');
    // with (-1,1) and (0,0) picked, (1,1) cannot make one connected group of 3
    expect(fruitPickable(v, legal, two).has('1,1')).toBe(false);
    expect(tapFruit(v, legal, two, '1,1').refused).toBe('Pick tiles that touch each other');
    f = tapFruit(v, legal, f, '0,1').flow;
    expect(fruitUndo(f).picks).toEqual(['-1,1']);
    f = tapFruit(v, legal, f, '0,0').flow;
    expect(f.step).toBe(2);
  });

  it('step 2: the enemy tiles next to the 3 glow (9s included, with an "ignores strength" note); step 3 previews in plain words', () => {
    let f = FRUIT_START;
    for (const k of ['-1,1', '0,1', '0,0']) f = tapFruit(v, legal, f, k).flow;
    expect(fruitPickable(v, legal, f)).toEqual(new Set(['1,0', '1,-1']));
    expect(f.note).toBe('Fruit ignores strength: even a 9 can go.');
    f = tapFruit(v, legal, f, '1,0').flow;
    expect(f.step).toBe(3);
    const a = fruitAction(legal, f)!;
    expect(a.t).toBe('Fruit');
    expect(() => apply(s, a)).not.toThrow();
    const pv = fruitPreview(v, a);
    // I give up 3 and (1,1) is cut off; they lose (1,0) and the 2 tiles hanging off it
    expect(pv.chip).toBe('You lose 3, plus 1 cut off. They lose 1, plus 2 cut off. Net: -4 for you, -3 for them.');
    expect(pv.warnings).toContain('Careful: this cuts off 1 of your tiles');
    expect(fruitUndo(f).step).toBe(2);
  });
});

describe('first-time tips (remembered in the browser)', () => {
  it('a tip shows until dismissed, then never again; bad data reads as "nothing seen"', () => {
    expect(TIPS.fruit.title).toMatch(/Fruit/);
    expect(TIPS.strengthen.text).toMatch(/higher card/i);
    let seen = parseTips(null);
    expect(seen.fruit).toBe(false);
    seen = markTip(seen, 'fruit');
    expect(parseTips(JSON.stringify(seen))).toEqual({ fruit: true, strengthen: false });
    expect(parseTips('{oops')).toEqual({ fruit: false, strengthen: false });
  });
});

describe('animation steps from the engine events', () => {
  it('Strengthen becomes a level-up step; Fruit becomes a big moment with a banner, then the cuts; the board always syncs', () => {
    const s = stateWith({ '-1,1': [0, 5], '0,1': [0, 2], '0,0': [0, 2], '1,0': [1, 9], '1,-1': [1, 4], '2,0': [1, 3] }, [[0, 9], [1, 1]]);
    const st: Action = { t: 'Sprout', card: s.hands[0].find((c) => c.rank === 9)!.id, coord: { q: -1, r: 1 } };
    const after = apply(s, st);
    const steps = buildSteps(s, st, after, 0);
    expect(steps[0]).toEqual({ k: 'strengthen', player: 0, key: '-1,1', from: 5, to: 9 });
    expect(steps.at(-1)!.k).toBe('sync');
    const fr: Action = { t: 'Fruit', sacrifice: [{ q: -1, r: 1 }, { q: 0, r: 0 }, { q: 0, r: 1 }], target: { q: 1, r: 0 } };
    const a2 = apply(s, fr);
    const fs = buildSteps(s, fr, a2, 0);
    expect(fs[0]).toEqual({ k: 'fruit', player: 0, sacrifice: ['-1,1', '0,0', '0,1'], target: '1,0' });
    expect(fs.some((x) => x.k === 'sever')).toBe(true);
    expect(moveTier(fs, () => false)).toBe('big');
    expect(tierBanner(fs)).toBe('Fruited!');
    // a small Strengthen is a small moment; to the top rank it is a medium one (a bigger shine)
    expect(moveTier(steps, () => false)).toBe('medium');
    expect(coordKey({ q: 1, r: 0 })).toBe('1,0');
  });
});
