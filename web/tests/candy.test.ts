// UI overhaul Part 3: the eye-candy decisions.
import { describe, expect, it } from 'vitest';
import { DECK_BEAT, SCORE_BEAT, deckMoment, scorePopDelay, scoreProgress, splashPlan, sporesHome } from '../src/logic/candy.js';
import { MOTION } from '../src/logic/motion.js';

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

describe('the deck and the score click instead of bouncing', () => {
  it('the last card and the empty pile are one short beat, with a small scale and no spring', () => {
    expect(DECK_BEAT.ms).toBe(MOTION.move);
    expect(DECK_BEAT.lastScale).toBeGreaterThan(1);
    expect(DECK_BEAT.lastScale).toBeLessThanOrEqual(1.08);
  });
  it('a score eases out over one move, and the digit clicks as it ARRIVES (not after)', () => {
    expect(SCORE_BEAT.countMs).toBe(MOTION.move);
    expect(SCORE_BEAT.popMs).toBe(MOTION.quick);
    expect(SCORE_BEAT.popScale).toBeGreaterThan(1);
    expect(SCORE_BEAT.popScale).toBeLessThanOrEqual(1.08);
    expect(scoreProgress(0)).toBe(0);
    expect(scoreProgress(1)).toBe(1);
    expect(scoreProgress(0.5)).toBeGreaterThan(0.5);
    expect(scoreProgress(-1)).toBe(0);
    expect(scoreProgress(2)).toBe(1);
  });
  // 2026-11-20: the click used to start on the very frame the count ended, so the payoff read as
  // two events (numbers stop, then a small pop). It now starts just before the digits land.
  it('the landing click overlaps the end of the count', () => {
    expect(SCORE_BEAT.popLead).toBeGreaterThan(0);
    expect(SCORE_BEAT.popLead).toBeLessThan(SCORE_BEAT.popMs);
    const delay = scorePopDelay(MOTION.move);
    expect(delay).toBeLessThan(MOTION.move);
    expect(delay).toBeGreaterThan(0);
    // and it never starts before the digits start moving
    expect(scorePopDelay(SCORE_BEAT.popLead / 2)).toBe(0);
    // it is still a click, not a bounce: a hair of lift
    expect(SCORE_BEAT.popRisePx).toBeGreaterThan(0);
    expect(SCORE_BEAT.popRisePx).toBeLessThanOrEqual(1.5);
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
