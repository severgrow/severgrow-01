// UI overhaul item 13: the hint line is short (one line on a small phone), points the way,
// explains unavailable moves, and keeps the version's word for the single-tile move.
import { describe, expect, it } from 'vitest';
import { HINT_MAX, hintFor } from '../src/logic/hint.js';
import type { HintCtx } from '../src/logic/hint.js';
import { SPROUT } from '../../src/strings.js';

const base: HintCtx = {
  phase: 'ACT',
  myTurn: true,
  busy: false,
  words: SPROUT,
  deckCount: 20,
  canTakeThrow: true,
  fruit: null,
  pending: null,
  drawing: null,
  card: null,
  kindPicked: false,
  hexWithNoMove: false,
  handEmpty: false,
  canSprout: true,
  canCombo: true,
  throwEndsTurn: false,
};

/** Every distinct moment the hint line can describe. */
const moments = (): HintCtx[] => {
  const out: HintCtx[] = [];
  for (const words of [SPROUT]) {
    const b = { ...base, words };
    for (const phase of ['DRAW', 'ACT', 'DISCARD', 'KNOCK', 'ROT_PICK', 'GAME_OVER'])
      for (const myTurn of [true, false]) for (const busy of [true, false]) out.push({ ...b, phase, myTurn, busy });
    for (const deckCount of [0, 1, 2, 3, 4, 40]) for (const canTakeThrow of [true, false]) out.push({ ...b, phase: 'DRAW', deckCount, canTakeThrow });
    for (const firstTime of [true, false]) out.push({ ...b, fruit: { firstTime } });
    for (const pending of ['strengthen', 'drawn', 'board'] as const) out.push({ ...b, pending });
    for (const n of [3, 4]) for (const fine of [true, false]) out.push({ ...b, drawing: { n, fine } });
    for (const single of [true, false]) for (const grow of [true, false]) for (const replace of [true, false]) for (const strengthen of [true, false]) out.push({ ...b, card: { single, grow, replace, strengthen } });
    out.push({ ...b, kindPicked: true }, { ...b, hexWithNoMove: true }, { ...b, handEmpty: true }, { ...b, canSprout: false }, { ...b, canSprout: false, canCombo: false });
    out.push({ ...b, phase: 'DISCARD', throwEndsTurn: true });
  }
  return out;
};

describe('the hint line', () => {
  it(`always fits one line (≤${HINT_MAX} characters) and never says "bot"`, () => {
    for (const c of moments()) {
      const { text } = hintFor(c);
      expect(text.length, text).toBeLessThanOrEqual(HINT_MAX);
      expect(text).not.toMatch(/\bbots?\b/i);
    }
  });

  it('on my turn there is always something to say', () => {
    for (const c of moments()) if (c.myTurn && !c.busy && c.phase !== 'GAME_OVER') expect(hintFor(c).text.length, JSON.stringify(c)).toBeGreaterThan(0);
  });

  it('the arrow points to the board when the next tap is there, down to the hand and piles otherwise', () => {
    expect(hintFor({ ...base, kindPicked: true }).arrow).toBe('up');
    expect(hintFor({ ...base, card: { single: true, grow: true, replace: false, strengthen: false } }).arrow).toBe('up');
    expect(hintFor({ ...base, phase: 'DRAW' }).arrow).toBe('down');
    expect(hintFor({ ...base, phase: 'DISCARD' }).arrow).toBe('down');
    expect(hintFor(base).arrow).toBe('down');
  });

  it('explains moves that are not available', () => {
    expect(hintFor({ ...base, card: { single: true, grow: false, replace: false, strengthen: false } }).text).toMatch(/can't grow/);
    expect(hintFor({ ...base, hexWithNoMove: true }).text).toMatch(/Nothing grows there/);
    expect(hintFor({ ...base, phase: 'DRAW', canTakeThrow: false }).text).not.toMatch(/throw pile/);
    expect(hintFor({ ...base, canSprout: false, canCombo: false }).text).toMatch(/Nothing can grow/);
    // the single-card move is once per turn: once used, the hint stops offering it
    expect(hintFor({ ...base, canSprout: false }).text).not.toBe(SPROUT.tapHint);
    expect(hintFor({ ...base, canSprout: false }).text).toMatch(/Bloom/);
  });

  it('the single-tile move is always called Sprout', () => {
    expect(hintFor(base).text).toBe(SPROUT.tapHint);
    expect(SPROUT.tapHint).toMatch(/sprout/i);
  });
});

describe('v0.7: a Bloom held but blocked by the board', () => {
  it('says so in the hint line (fits one line)', async () => {
    const { hintFor } = await import('../src/logic/hint.js');
    const { SPROUT, BLOOM } = await import('../../src/strings.js');
    const base = { phase: 'ACT', myTurn: true, busy: false, words: SPROUT, deckCount: 40, canTakeThrow: false, fruit: null, pending: null, drawing: null, card: null, kindPicked: false, hexWithNoMove: false, handEmpty: false, canSprout: true, canCombo: false, throwEndsTurn: false } as const;
    const t = hintFor({ ...base, bloomBlocked: 3 }).text;
    expect(t).toBe(BLOOM.tooFew(3));
    expect(t.length).toBeLessThanOrEqual(46);
    expect(hintFor({ ...base, canCombo: true, bloomBlocked: 3 }).text).not.toBe(BLOOM.tooFew(3));
  });
});

// v0.8 UI pass: with the step bar gone, the hint line carries the turn: what I can do after the
// draw (sprout, a Fruit card, a Bloom), what used the turn's sprout, and that Throw is next
describe('v0.8: the hint line carries the turn (no step bar)', () => {
  it('after the draw, a playable Fruit card is offered next to the sprout', () => {
    const t = hintFor({ ...base, fruitReady: true }).text;
    expect(t).toMatch(/sprout/i);
    expect(t).toMatch(/Fruit/);
    expect(t.length).toBeLessThanOrEqual(HINT_MAX);
  });
  it('once a Fruit card or a sprout used the turn, it says so, and points at the throw', () => {
    for (const grew of ['fruit', 'sprout'] as const) {
      for (const canCombo of [true, false]) {
        const t = hintFor({ ...base, canSprout: false, canCombo, grew }).text;
        expect(t).toMatch(grew === 'fruit' ? /Fruit used/ : /Sprouted/);
        expect(t).toMatch(/Throw/);
        if (canCombo) expect(t).toMatch(/Bloom/);
        expect(t).not.toMatch(/Nothing can grow/);
        expect(t.length).toBeLessThanOrEqual(HINT_MAX);
      }
    }
  });
});
