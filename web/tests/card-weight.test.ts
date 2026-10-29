// Phase 1 + 4: a card's weight is one number, and the breath is deterministic.
import { describe, expect, it } from 'vitest';
import {
  CARD_LIFT, MAX_RANK, liftOf, settleOvershootOf, shadowOf, weightOf,
} from '../src/logic/card-weight.js';
import { BREATH, breathAmpOf, breathAmpStep, breathPeriodOf, breathPhaseOf } from '../src/logic/motion.js';

describe('card weight', () => {
  it('is 0 for the lightest rank and 1 for the heaviest', () => {
    expect(weightOf(1)).toBe(0);
    expect(weightOf(MAX_RANK)).toBe(1);
    expect(weightOf(0)).toBe(0); // a Bomb's face reads light
    expect(weightOf(99)).toBe(1);
  });

  it('rises monotonically with rank and stays inside 0..1', () => {
    let previous = -1;
    for (let rank = 0; rank <= MAX_RANK + 2; rank++) {
      const w = weightOf(rank);
      expect(w).toBeGreaterThanOrEqual(0);
      expect(w).toBeLessThanOrEqual(1);
      expect(w).toBeGreaterThanOrEqual(previous);
      previous = w;
    }
    // The top rank is heavier than the rank below it, so a fan never reads flat.
    expect(weightOf(8)).toBeLessThan(weightOf(9));
  });

  it('honours another max rank without escaping the range', () => {
    expect(weightOf(6, 6)).toBe(1);
    expect(weightOf(3, 6)).toBeCloseTo(0.4, 6);
    expect(weightOf(1, 1)).toBe(0);
  });

  it('lift is 22 px light to 16 px heavy, never outside', () => {
    expect(liftOf(0)).toBe(CARD_LIFT.light);
    expect(liftOf(1)).toBe(CARD_LIFT.heavy);
    expect(liftOf(-1)).toBe(CARD_LIFT.light);
    expect(liftOf(2)).toBe(CARD_LIFT.heavy);
    for (let i = 0; i <= 10; i++) expect(liftOf(i / 10)).toBeLessThanOrEqual(22);
  });

  it('settle and shadow grow with weight but stay small', () => {
    expect(settleOvershootOf(0)).toBe(1);
    expect(settleOvershootOf(1)).toBe(3);
    const light = shadowOf(0);
    const heavy = shadowOf(1);
    expect(heavy.y).toBeGreaterThan(light.y);
    expect(heavy.blur).toBeGreaterThan(light.blur);
    expect(heavy.alpha).toBeGreaterThan(light.alpha);
  });
});

describe('the hand breath', () => {
  it('is 4.5-6 s and 0.4-0.8%, with lighter cards swaying more', () => {
    expect(BREATH.minPeriod).toBe(4500);
    expect(BREATH.maxPeriod).toBe(6000);
    expect(breathAmpOf(0)).toBeCloseTo(BREATH.maxAmp, 6);
    expect(breathAmpOf(1)).toBeCloseTo(BREATH.minAmp, 6);
    expect(breathAmpOf(0.5)).toBeGreaterThan(breathAmpOf(1));
    expect(breathAmpOf(2)).toBeCloseTo(BREATH.minAmp, 6);
  });

  it('bakes the amplitude in five compositor-safe steps, within a display resolution of exact', () => {
    // The keyframes must be static values (a var() in a keyframe keeps the breath on the main
    // thread); the step may differ from the exact amplitude by 0.0005 of the card's size at most
    // (0.03 px on a 60 px card).
    for (let rank = 1; rank <= 9; rank++) {
      const weight = (rank - 1) / 8;
      const step = breathAmpStep(weight);
      expect([4, 5, 6, 7, 8]).toContain(step);
      expect(Math.abs(step / 1000 - breathAmpOf(weight))).toBeLessThanOrEqual(0.00051); // one thousandth of a pixel of float slop
    }
    // Heavier still means less sway, never more.
    expect(breathAmpStep(0)).toBe(8);
    expect(breathAmpStep(1)).toBe(4);
    for (let w = 0; w < 1; w += 0.125) expect(breathAmpStep(w + 0.125)).toBeLessThanOrEqual(breathAmpStep(w));
  });

  it('gives every card a deterministic period and phase inside the range', () => {
    const ids = [0, 1, 2, 7, 42, 99, 1234, -5];
    for (const id of ids) {
      expect(breathPeriodOf(id)).toBe(breathPeriodOf(id));
      expect(breathPeriodOf(id)).toBeGreaterThanOrEqual(BREATH.minPeriod);
      expect(breathPeriodOf(id)).toBeLessThanOrEqual(BREATH.maxPeriod);
      expect(breathPhaseOf(id)).toBeLessThanOrEqual(0);
      expect(breathPhaseOf(id)).toBeGreaterThanOrEqual(-BREATH.maxPeriod);
    }
    // Different cards do not all breathe in step.
    expect(new Set(ids.map(breathPeriodOf)).size).toBeGreaterThan(1);
  });

  it('caps the number of concurrent breaths at seven', () => {
    expect(BREATH.maxCards).toBe(7);
  });
});
