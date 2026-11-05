// UI overhaul items 9, 17, 18: every moment has its own vibration, settings are respected,
// sound variation is small and repeatable.
import { describe, expect, it } from 'vitest';
import { DUCK_DB, FEEDBACK_EVENTS, HAPTICS, HAPTIC_MAX_MS, dbToGain, hapticFor, pitchJitter, settleFor, undoPitches } from '../src/logic/feedback.js';

const total = (p: number | readonly number[]) => (typeof p === 'number' ? p : p.reduce((a, b) => a + b, 0));
const on = { vibration: true, sound: true, effects: 'normal' as const };

describe('haptics', () => {
  it('every moment has a pattern, and no two are the same', () => {
    const seen = new Set<string>();
    for (const e of FEEDBACK_EVENTS) {
      const k = JSON.stringify(HAPTICS[e]);
      expect(seen.has(k), e).toBe(false);
      seen.add(k);
    }
  });

  it('nothing buzzes for long', () => {
    for (const e of FEEDBACK_EVENTS) expect(total(HAPTICS[e]), e).toBeLessThanOrEqual(HAPTIC_MAX_MS);
  });

  it('bigger cuts feel bigger; being cut is calmer than cutting', () => {
    const tiers = ['cutSmall', 'cutMedium', 'cutBig', 'cutHuge'] as const;
    for (let i = 1; i < tiers.length; i++) expect(total(HAPTICS[tiers[i]!])).toBeGreaterThan(total(HAPTICS[tiers[i - 1]!]));
    const peak = (p: number | readonly number[]) => Math.max(...(typeof p === 'number' ? [p] : p.filter((_, i) => i % 2 === 0)));
    expect(peak(HAPTICS.cutMe)).toBeLessThan(peak(HAPTICS.cutMedium));
    expect(total(HAPTICS.placeTop)).toBeGreaterThan(total(HAPTICS.place));
  });

  // OWNER CHANGED THE RULE (2026-11-05, with the recorded sounds: vibration "light and rare", a tiny
  // buzz on your tile landing, a Bloom, a Cut and the win/lose). Was: every moment but press/draw
  // buzzed with Vibration on, undo and the cascade included.
  it('Vibration off: nothing; with it on, only the rare moments buzz; the rest need Effects High', () => {
    for (const e of FEEDBACK_EVENTS) expect(hapticFor(e, { ...on, vibration: false })).toBeNull();
    const rare = ['place', 'placeTop', 'cutSmall', 'cutMedium', 'cutBig', 'cutHuge', 'cutMe', 'win', 'lose'];
    for (const e of FEEDBACK_EVENTS) {
      if (rare.includes(e)) expect(hapticFor(e, on), e).toEqual(HAPTICS[e]);
      else {
        expect(hapticFor(e, on), e).toBeNull();
        expect(hapticFor(e, { ...on, effects: 'high' }), e).toEqual(HAPTICS[e]);
      }
    }
    expect(total(HAPTICS.cascade)).toBeLessThan(total(HAPTICS.place));
  });

  it('light: no buzz is longer than a quarter second, and the strongest pulse is 24 ms', () => {
    for (const e of FEEDBACK_EVENTS) {
      expect(total(HAPTICS[e]), e).toBeLessThanOrEqual(250);
      const pulses = typeof HAPTICS[e] === 'number' ? [HAPTICS[e] as number] : (HAPTICS[e] as readonly number[]).filter((_, i) => i % 2 === 0);
      expect(Math.max(...pulses), e).toBeLessThanOrEqual(24);
    }
  });
});

describe('sound', () => {
  it('pitch variation is small (±3%), varied and repeatable', () => {
    const xs = Array.from({ length: 200 }, (_, i) => pitchJitter(i));
    for (const x of xs) {
      expect(x).toBeGreaterThanOrEqual(0.97);
      expect(x).toBeLessThanOrEqual(1.03);
    }
    expect(new Set(xs.map((x) => x.toFixed(4))).size).toBeGreaterThan(100);
    expect(pitchJitter(17)).toBe(pitchJitter(17));
  });

  it('undo plays a falling ladder', () => {
    for (const n of [1, 2, 4, 9]) {
      const p = undoPitches(n);
      expect(p.length).toBe(Math.min(6, n));
      for (let i = 1; i < p.length; i++) expect(p[i]!).toBeLessThan(p[i - 1]!);
    }
  });

  it('the ambient bed ducks by 6 dB during a cut (about half the loudness)', () => {
    expect(DUCK_DB).toBe(-6);
    expect(dbToGain(DUCK_DB)).toBeCloseTo(0.501, 2);
  });
});

describe('placement settle (item 17): higher numbers land heavier', () => {
  it('drop, squash and time grow with the number; only the top rank is "heavy"', () => {
    const max = 9;
    let prev = settleFor(1, max);
    expect(prev.heavy).toBe(false);
    for (let s = 2; s <= max; s++) {
      const cur = settleFor(s, max);
      expect(cur.drop).toBeGreaterThanOrEqual(prev.drop);
      expect(cur.squash).toBeGreaterThanOrEqual(prev.squash);
      expect(cur.ms).toBeGreaterThanOrEqual(prev.ms);
      prev = cur;
    }
    expect(settleFor(max, max).heavy).toBe(true);
    expect(settleFor(max - 1, max).heavy).toBe(false);
    expect(settleFor(max, max).drop).toBeGreaterThan(settleFor(1, max).drop);
  });
  it('stays small: never more than 10px of drop or 20% squash, never longer than half a second', () => {
    for (let s = 1; s <= 13; s++) {
      const c = settleFor(s, 13);
      expect(c.drop).toBeLessThanOrEqual(10);
      expect(c.squash).toBeLessThanOrEqual(0.2);
      expect(c.ms).toBeLessThanOrEqual(500);
    }
  });
});
