// UI overhaul Part 3: the eye-candy decisions.
import { describe, expect, it } from 'vitest';
import { deckMoment, splashPlan, sporesHome } from '../src/logic/candy.js';

describe('B. splash', () => {
  it('once per visit, short, still with Reduce motion, never when switched off', () => {
    expect(splashPlan({ reduceMotion: false, on: true, shownThisVisit: false })).toEqual({ show: true, ms: 1600, animated: true });
    expect(splashPlan({ reduceMotion: true, on: true, shownThisVisit: false }).animated).toBe(false);
    expect(splashPlan({ reduceMotion: false, on: true, shownThisVisit: true }).show).toBe(false);
    expect(splashPlan({ reduceMotion: false, on: false, shownThisVisit: false }).show).toBe(false);
    expect(splashPlan({ reduceMotion: false, on: true, shownThisVisit: false }).ms).toBeLessThanOrEqual(2000);
  });
});

describe('C. last card', () => {
  it('marks the step to one card and the step to none, once each', () => {
    expect(deckMoment(2, 1)).toBe('last');
    expect(deckMoment(1, 0)).toBe('out');
    expect(deckMoment(5, 0)).toBe('out');
    expect(deckMoment(1, 1)).toBeNull();
    expect(deckMoment(9, 8)).toBeNull();
    expect(deckMoment(0, 0)).toBeNull();
  });
});

describe('D. spores going home', () => {
  it('at most 6, nearest the root first, one after another', () => {
    const s = sporesHome(['3,0', '1,0', '2,0', '0,3', '-1,2', '2,1', '3,-1', '1,1'], '0,0');
    expect(s.length).toBe(6);
    expect(s[0]!.from).toBe('1,0');
    for (let i = 1; i < s.length; i++) expect(s[i]!.delay).toBeGreaterThan(s[i - 1]!.delay);
    expect(sporesHome([], '0,0')).toEqual([]);
  });
});
