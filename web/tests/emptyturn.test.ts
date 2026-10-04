// Step 2 (Fruit cards task): a Grow step with nothing to play skips itself. Auto-skip is a
// setting (default on); with it off the player sees why and a Continue button. The opponent's
// empty turn is quick: about 400ms at Normal speed.
import { describe, expect, it } from 'vitest';
import type { Action, Card } from '../../src/engine/index.js';
import { EMPTY_TURN_MS, NOTHING_TO_PLAY, QUICK_BEATS_MS, emptyReason, growIsEmpty, isEmptyTurn, opponentBeats, skipPlan } from '../src/logic/emptyturn.js';
import { DEFAULT_SETTINGS, parseSettings } from '../src/logic/settings.js';

const END: Action = { t: 'EndAct' };
const sprout: Action = { t: 'Sprout', card: 1, coord: { q: 0, r: 0 } };
const c = (id: number, suit: 0 | 1 | 2 | 3, rank: number): Card => ({ id, suit, rank });

describe('is there anything to play in Grow?', () => {
  it('only "end the Grow step" means empty; any board move means not', () => {
    expect(growIsEmpty([END])).toBe(true);
    expect(growIsEmpty([END, sprout])).toBe(false);
    expect(growIsEmpty([])).toBe(false); // not my Grow step at all
  });
});

describe('the auto-skip plan', () => {
  it('on (the default): skip at once and say so', () => {
    expect(DEFAULT_SETTINGS.autoSkip).toBe(true);
    expect(skipPlan([END], 5, true)).toEqual({ kind: 'auto', text: NOTHING_TO_PLAY });
    expect(NOTHING_TO_PLAY).toBe('Nothing to play this turn');
  });

  it('off: wait, show the reason and a Continue button', () => {
    expect(skipPlan([END], 5, false)).toEqual({ kind: 'ask', text: NOTHING_TO_PLAY });
  });

  it('nothing to skip when a move exists, or when the hand is empty (the turn just ends)', () => {
    expect(skipPlan([END, sprout], 5, true)).toEqual({ kind: 'none', text: null });
    expect(skipPlan([END], 0, true)).toEqual({ kind: 'none', text: null });
  });

  it('the setting is saved and read back; a bad value falls back to on', () => {
    expect(parseSettings(JSON.stringify({ autoSkip: false })).autoSkip).toBe(false);
    expect(parseSettings(JSON.stringify({ autoSkip: 'yes' })).autoSkip).toBe(true);
    expect(parseSettings(null).autoSkip).toBe(true);
  });
});

describe('the reason, in one short line', () => {
  it('says whether a combo exists at all, and that no card can sprout', () => {
    const noCombo = [c(1, 0, 1), c(2, 1, 3), c(3, 2, 5), c(4, 3, 7)];
    expect(emptyReason(noCombo)).toBe('No combo in your hand, and no card can sprout.');
    const set = [c(1, 0, 4), c(2, 1, 4), c(3, 2, 4)];
    expect(emptyReason(set)).toBe('Your combos have no room, and no card can sprout.');
    const run = [c(1, 0, 4), c(2, 0, 5), c(3, 0, 6)];
    expect(emptyReason(run)).toBe('Your combos have no room, and no card can sprout.');
    for (const h of [noCombo, set, run]) expect(emptyReason(h).length).toBeLessThanOrEqual(52);
  });
});

describe("the opponent's empty turn is quick", () => {
  const draw: Action = { t: 'Draw', from: 'deck' };
  const throwIt: Action = { t: 'Discard', card: 9 };
  it('a turn of draw, end, throw is empty; a turn with a board move is not', () => {
    expect(isEmptyTurn([draw, END, throwIt])).toBe(true);
    expect(isEmptyTurn([draw, sprout, END, throwIt])).toBe(false);
  });

  it(`its beats (think + show) leave room for drawing within about ${EMPTY_TURN_MS}ms at Normal speed, scaled by the speed`, () => {
    expect(EMPTY_TURN_MS).toBe(400);
    const b = opponentBeats([draw, END, throwIt], 1);
    expect(b.think.length).toBe(3);
    const total = b.think.reduce((x, y) => x + y, 0) + b.show.draw + b.show.discard + b.show.turn;
    expect(total).toBe(QUICK_BEATS_MS);
    expect(total).toBeLessThan(EMPTY_TURN_MS); // the browser test times the whole turn on screen
    const slow = opponentBeats([draw, END, throwIt], 1.6);
    expect(slow.think[0]).toBeCloseTo(b.think[0]! * 1.6);
    const off = opponentBeats([draw, END, throwIt], 0);
    expect(off.think.every((t) => t === 0)).toBe(true);
  });

  it('a normal turn keeps the usual beats (a longer think, a pause before each tile move)', () => {
    const b = opponentBeats([draw, sprout, END, throwIt], 1);
    expect(b.quick).toBe(false);
    expect(b.think).toEqual([550, 300, 90, 90]);
    expect(opponentBeats([draw, END, throwIt], 1).quick).toBe(true);
  });
});
