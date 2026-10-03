// v0.5 UI logic: three kinds of Sprout target, the Strengthen preview, the Fruit button and
// its three-step flow, first-time tips, and the animation steps. Written before the code.
import { describe, expect, it } from 'vitest';
import { apply, coordKey, legalActions, newGame, viewFor } from '../../src/engine/index.js';
import type { Action, Card, Player, RulesConfig, State, Suit } from '../../src/engine/index.js';
import { EMPTY_SEL, onlyChoice, playNow, sproutKind, tapCard, tapHex, targetKinds, TARGET_LABEL, pendingAction } from '../src/logic/interaction.js';
import { previewMove } from '../src/logic/preview.js';
import { buildSteps } from '../src/logic/anim.js';
import { moveTier, tierBanner } from '../src/logic/juice.js';
import { TIPS, markTip, parseTips } from '../src/logic/tips.js';
import { fixture } from '../../tests/helpers.js';

const stateWith = (tiles: Record<string, [Player, number]>, hand: [Suit | null, number][], config: Partial<RulesConfig> = {}, patch: Partial<State> = {}): State => {
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

// (The Fruit button and the pick-3-first flow were replaced in polish pass 3: see fruit-contextual.test.ts.)

describe('first-time tips (remembered in the browser)', () => {
  it('a tip shows until dismissed, then never again; bad data reads as "nothing seen"', () => {
    expect(TIPS.fruit.title).toMatch(/Fruit/);
    expect(TIPS.strengthen.text).toMatch(/higher card/i);
    let seen = parseTips(null);
    expect(seen.fruit).toBe(false);
    seen = markTip(seen, 'fruit');
    expect(parseTips(JSON.stringify(seen))).toEqual({ fruit: true, strengthen: false, draw: false, fruitAny: false });
    expect(parseTips('{oops')).toEqual({ fruit: false, strengthen: false, draw: false, fruitAny: false });
    // v0.6: the one-time Fruit card tip, in the strings file's words
    expect(TIPS.fruit.text).toBe('Fruit cards: play one on an opponent tile that touches yours to remove it, even a 9.');
    // polish pass 3: the drawing tip, in the words the How to play sheet uses too
    expect(TIPS.draw.text).toBe('Drag over hexes to draw your clump or line. On a computer, click to start and click to finish.');
  });
});

describe('animation steps from the engine events', () => {
  it('Strengthen becomes a level-up step; a Fruit card becomes a big moment with a banner, then the cuts; the board always syncs', () => {
    const s = stateWith({ '-1,1': [0, 5], '0,1': [0, 2], '0,0': [0, 2], '1,0': [1, 9], '1,-1': [1, 4], '2,0': [1, 3] }, [[0, 9], [1, 1], [null, 0]]);
    const st: Action = { t: 'Sprout', card: s.hands[0].find((c) => c.rank === 9)!.id, coord: { q: -1, r: 1 } };
    const after = apply(s, st);
    const steps = buildSteps(s, st, after, 0);
    expect(steps[0]).toEqual({ k: 'strengthen', player: 0, key: '-1,1', from: 5, to: 9 });
    expect(steps.at(-1)!.k).toBe('sync');
    const fruitId = s.hands[0].find((c) => c.suit === null)!.id;
    const fr: Action = { t: 'PlayFruit', card: fruitId, target: { q: 1, r: 0 } };
    const a2 = apply(s, fr);
    const fs = buildSteps(s, fr, a2, 0);
    expect(fs[0]).toEqual({ k: 'fruit', player: 0, card: { id: fruitId, suit: null, rank: 0 }, target: '1,0', strength: 9 });
    expect(fs.some((x) => x.k === 'sever')).toBe(true);
    expect(moveTier(fs, () => false)).toBe('big');
    expect(tierBanner(fs)).toBe('Fruited!');
    // a small Strengthen is a small moment; to the top rank it is a medium one (a bigger shine)
    expect(moveTier(steps, () => false)).toBe('medium');
    expect(coordKey({ q: 1, r: 0 })).toBe('1,0');
  });
});

describe('UI overhaul item 8: "Confirm moves: Never" and Strengthen', () => {
  it('the only choice on the picked spot is known, Strengthen included (Never plays it at once; Smart and Always keep it waiting)', () => {
    const s = stateWith({ '-1,1': [0, 5], '0,0': [0, 9], '1,0': [1, 4] }, [[0, 9]]);
    const v = viewFor(s, 0);
    const legal = legalActions(v);
    const id = v.hand[0]!.id;
    let sel = tapCard(v, legal, EMPTY_SEL, id);
    sel = tapHex(v, legal, sel, '-1,1');
    expect(playNow(v, legal, sel)).toBeNull();
    expect(onlyChoice(v, legal, sel)).toEqual({ t: 'Sprout', card: id, coord: { q: -1, r: 1 } });
    expect(onlyChoice(v, legal, tapCard(v, legal, EMPTY_SEL, id))).toBeNull(); // no spot yet
  });
});
