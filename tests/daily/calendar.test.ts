// The Daily Puzzle's calendar: one puzzle per UTC day, worldwide; a streak of solved days; the
// share line. Pure functions of a date and a record — no clock is read here.
import { describe, expect, it } from 'vitest';
import { msToNextPuzzle, puzzleNoOn, shareLine, streakOf, utcDay } from '../../src/daily/calendar.js';

const EPOCH = '2026-11-02';
const at = (iso: string) => new Date(iso).getTime();

describe('the daily calendar', () => {
  it('numbers days from the first puzzle, by UTC date', () => {
    expect(puzzleNoOn(at('2026-11-02T00:00:00Z'), EPOCH)).toBe(1);
    expect(puzzleNoOn(at('2026-11-02T23:59:59Z'), EPOCH)).toBe(1);
    expect(puzzleNoOn(at('2026-11-03T00:00:00Z'), EPOCH)).toBe(2);
    expect(puzzleNoOn(at('2026-12-02T12:00:00Z'), EPOCH)).toBe(31);
  });

  it('is the same puzzle everywhere at the same moment, whatever the local time zone', () => {
    // 23:30 in New York on Nov 2 is already Nov 3 in UTC
    expect(puzzleNoOn(at('2026-11-02T23:30:00-05:00'), EPOCH)).toBe(2);
  });

  it('has no puzzle before the first day', () => {
    expect(puzzleNoOn(at('2026-11-01T23:59:59Z'), EPOCH)).toBeNull();
  });

  it('counts down to the next UTC midnight', () => {
    expect(msToNextPuzzle(at('2026-11-02T23:59:00Z'))).toBe(60_000);
    expect(msToNextPuzzle(at('2026-11-02T00:00:00Z'))).toBe(86_400_000);
  });

  it('names a UTC day', () => {
    expect(utcDay(at('2026-11-02T23:30:00-05:00'))).toBe('2026-11-03');
  });
});

describe('the streak', () => {
  it('counts consecutive solved puzzles ending today', () => {
    expect(streakOf([1, 2, 3, 4], 4)).toBe(4);
    expect(streakOf([1, 3, 4], 4)).toBe(2);
  });

  it('is still alive on a new day until it is played (ends yesterday)', () => {
    expect(streakOf([2, 3], 4)).toBe(2);
  });

  it('is broken by a missed day', () => {
    expect(streakOf([1, 2], 4)).toBe(0);
    expect(streakOf([], 4)).toBe(0);
  });

  it('ignores duplicates and future numbers', () => {
    expect(streakOf([3, 3, 4, 9], 4)).toBe(2);
  });
});

describe('the share line', () => {
  it('reads like a device printout: number, title, tries, streak, site', () => {
    expect(shareLine({ no: 42, title: 'The Long Root', tries: 2, solved: true, streak: 6 })).toBe(
      'FUTASAKU DAILY #042 · THE LONG ROOT\n◆◆◇ SOLVED IN 2 · STREAK 6\nfutasaku.com',
    );
  });

  it('a first-try solve fills one diamond; a miss shows three empty ones', () => {
    expect(shareLine({ no: 7, title: 'Cut', tries: 1, solved: true, streak: 1 })).toContain('◆◇◇ SOLVED IN 1');
    expect(shareLine({ no: 7, title: 'Cut', tries: 3, solved: false, streak: 0 })).toContain('◇◇◇ NOT TODAY');
  });

  it('leaves the streak out when there is none', () => {
    expect(shareLine({ no: 7, title: 'Cut', tries: 3, solved: false, streak: 0 })).not.toContain('STREAK');
  });
});
