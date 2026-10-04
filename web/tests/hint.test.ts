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
    for (const kind of ['line', 'clump'] as const) for (const fine of [true, false]) out.push({ ...b, drawing: { kind, n: 4, fine } });
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
    expect(hintFor({ ...base, canSprout: false }).text).toMatch(/line or clump/);
  });

  it('the single-tile move is always called Sprout', () => {
    expect(hintFor(base).text).toBe(SPROUT.tapHint);
    expect(SPROUT.tapHint).toMatch(/sprout/i);
  });
});
