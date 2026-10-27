// The Daily Puzzle's record on this device: tries used per puzzle (a reload cannot hand back a
// try), solved puzzles (the streak), and tiles earned but not yet placed (the "1 TO PLACE" badge).
import { describe, expect, it } from 'vitest';
import {
  EMPTY_RECORD,
  decodeRecord,
  dayOf,
  encodeRecord,
  goalLine,
  goalToken,
  hudGoal,
  menuCaption,
  recordPlaced,
  recordTry,
  shortfallLine,
} from '../src/daily/record.js';

describe('the daily record', () => {
  it('counts tries, and a solve ends the day', () => {
    let r = recordTry(EMPTY_RECORD, 5, false);
    expect(dayOf(r, 5)).toEqual({ tries: 1, solved: false, over: false });
    r = recordTry(r, 5, true);
    expect(dayOf(r, 5)).toEqual({ tries: 2, solved: true, over: true });
    expect(r.solved).toEqual([5]);
    expect(r.toPlace).toEqual([5]);
    // a day that is over takes no more tries
    expect(recordTry(r, 5, false)).toBe(r);
  });

  it('three misses end the day without a solve', () => {
    let r = EMPTY_RECORD;
    for (let i = 0; i < 3; i++) r = recordTry(r, 9, false);
    expect(dayOf(r, 9)).toEqual({ tries: 3, solved: false, over: true });
    expect(r.solved).toEqual([]);
    expect(r.toPlace).toEqual([]);
    expect(recordTry(r, 9, true)).toBe(r);
  });

  it('a placed tile leaves the to-place list', () => {
    const r = recordTry(EMPTY_RECORD, 3, true);
    expect(recordPlaced(r).toPlace).toEqual([]);
  });

  it('survives a round trip and refuses garbage', () => {
    const r = recordTry(recordTry(EMPTY_RECORD, 1, false), 1, true);
    expect(decodeRecord(encodeRecord(r))).toEqual(r);
    expect(decodeRecord(null)).toEqual(EMPTY_RECORD);
    expect(decodeRecord('{bad')).toEqual(EMPTY_RECORD);
    expect(decodeRecord('{"solved":"x","days":5}')).toEqual(EMPTY_RECORD);
  });
});

describe('the daily words', () => {
  it('the LED token fits the display (5 cells) for the usual goals', () => {
    expect(goalToken({ kind: 'win' })).toBe('WIN!');
    expect(goalToken({ kind: 'cut', n: 4 })).toBe('CUT 4');
    expect(goalToken({ kind: 'points', n: 8 })).toBe('+8PTS');
    for (const t of [goalToken({ kind: 'cut', n: 9 }), goalToken({ kind: 'points', n: 9 })]) expect(t.length).toBeLessThanOrEqual(5);
  });

  it('the goal line says exactly what the engine checks', () => {
    expect(goalLine({ kind: 'win' })).toBe('Surround their home this turn.');
    expect(goalLine({ kind: 'cut', n: 3 })).toBe('Cut off 3 of their tiles this turn.');
    expect(goalLine({ kind: 'points', n: 8 })).toBe('Grow your lead by 8 this turn.');
  });

  it('the header strip says the goal in a few words', () => {
    expect(hudGoal({ kind: 'win' })).toBe('WIN THIS TURN');
    expect(hudGoal({ kind: 'cut', n: 3 })).toBe('CUT OFF 3 TILES');
    expect(hudGoal({ kind: 'points', n: 8 })).toBe('LEAD +8');
  });

  it('a miss says how close it was', () => {
    expect(shortfallLine({ kind: 'points', n: 8 }, { gain: 5, cut: 0, won: false })).toBe('Your lead grew by 5. The best turn grows it by 8.');
    expect(shortfallLine({ kind: 'cut', n: 3 }, { gain: 2, cut: 1, won: false })).toBe('You cut off 1. The best turn cuts off 3.');
    expect(shortfallLine({ kind: 'win' }, { gain: 2, cut: 0, won: false })).toBe('Their home is still open. There is a way to close it.');
  });

  it('the menu caption: new, solved, to place, or over', () => {
    expect(menuCaption({ day: { tries: 0, solved: false, over: false }, streak: 0, toPlace: 0 })).toBe('NEW TODAY');
    expect(menuCaption({ day: { tries: 0, solved: false, over: false }, streak: 6, toPlace: 0 })).toBe('NEW TODAY · STREAK 6');
    expect(menuCaption({ day: { tries: 1, solved: false, over: false }, streak: 6, toPlace: 0 })).toBe('2 TRIES LEFT · STREAK 6');
    expect(menuCaption({ day: { tries: 2, solved: true, over: true }, streak: 7, toPlace: 0 })).toBe('SOLVED · STREAK 7');
    expect(menuCaption({ day: { tries: 2, solved: true, over: true }, streak: 7, toPlace: 1 })).toBe('1 TILE TO PLACE');
    expect(menuCaption({ day: { tries: 3, solved: false, over: true }, streak: 0, toPlace: 0 })).toBe('NEXT PUZZLE TOMORROW');
  });
});
