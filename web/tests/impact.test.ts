// HEAVINESS (owner, 2026-11-06: "put some heaviness on bomb and blast", answer: "lowkey all of it tbh,
// if it's not too expensive ... tighten up and make work together ... has to work smooooth"; dust: "add
// few dust specks, but only if it looks beautiful, not like cheap 2d shapes"). One shared impact for
// Bomb and Blast: a short freeze, the board settles, the light dips, a firmer buzz, a few specks of
// dust. Blast alone shakes. Everything scales gently with size and stays inside hard ceilings.
import { describe, expect, it } from 'vitest';
import { DUST_MAX, IMPACT_LIMITS, dustSpecks, impactPlan } from '../src/logic/impact.js';
import { PINNED } from '../src/logic/motion.js';

const on = { effects: 'normal' as const, reduceMotion: false, extras: true };

describe('one heavy impact for Bomb and Blast', () => {
  it('Blast: freeze, settle, shake, light dip, dust and a firm buzz; bigger Blasts a little more, never past the ceilings', () => {
    const small = impactPlan('blast', 3, on);
    const big = impactPlan('blast', 19, on);
    for (const p of [small, big]) {
      expect(p.hitStopMs).toBe(PINNED.hitStop);
      expect(p.settle).toBeGreaterThan(0);
      expect(p.shakePx).toBeGreaterThan(0);
      expect(p.dim).toBeGreaterThan(0);
      expect(p.dust).toBeGreaterThan(0);
      expect(p.buzzMs).toBeGreaterThan(22); // firmer than the old 22 ms
    }
    expect(big.shakePx).toBeGreaterThan(small.shakePx);
    expect(big.dust).toBeGreaterThan(small.dust);
    expect(big.shakePx).toBeLessThanOrEqual(IMPACT_LIMITS.shakePx);
    expect(big.settle).toBeLessThanOrEqual(IMPACT_LIMITS.settle);
    expect(big.dim).toBeLessThanOrEqual(IMPACT_LIMITS.dim);
    expect(big.dust).toBeLessThanOrEqual(DUST_MAX);
  });

  it('Bomb: the same weight family, lighter, and it never shakes the board', () => {
    const p = impactPlan('bomb', 1, on);
    expect(p.shakePx).toBe(0);
    expect(p.settle).toBeGreaterThan(0);
    expect(p.settle).toBeLessThan(impactPlan('blast', 3, on).settle);
    expect(p.dust).toBeGreaterThan(0);
    expect(p.dust).toBeLessThan(impactPlan('blast', 3, on).dust);
  });

  it('low key: the board never moves more than a few pixels or dims more than a shade', () => {
    expect(IMPACT_LIMITS.shakePx).toBeLessThanOrEqual(4);
    expect(IMPACT_LIMITS.settle).toBeLessThanOrEqual(0.012);
    expect(IMPACT_LIMITS.dim).toBeLessThanOrEqual(0.3);
    expect(DUST_MAX).toBeLessThanOrEqual(10);
  });

  it('Reduce motion: no movement, no dust; the freeze and the buzz stay (they are not motion)', () => {
    const p = impactPlan('blast', 10, { ...on, reduceMotion: true });
    expect([p.settle, p.shakePx, p.dust]).toEqual([0, 0, 0]);
    expect(p.hitStopMs).toBe(PINNED.hitStop);
  });

  it('Low effects, or a phone that really struggles (extras off): the move still lands, the extras go', () => {
    for (const o of [{ ...on, effects: 'low' as const }, { ...on, extras: false }]) {
      const p = impactPlan('blast', 10, o);
      expect([p.shakePx, p.dim, p.dust]).toEqual([0, 0, 0]);
      expect(p.settle).toBeGreaterThan(0); // the one cheap cue of weight stays
    }
  });
});

describe('dust specks look like dust, not shapes', () => {
  it('soft, varied, deterministic: different sizes, directions and timings, the same every time', () => {
    const a = dustSpecks(8, 3);
    expect(dustSpecks(8, 3)).toEqual(a);
    expect(new Set(a.map((s) => s.r.toFixed(2))).size).toBeGreaterThan(4);
    expect(new Set(a.map((s) => Math.round(Math.atan2(s.dy, s.dx) * 10))).size).toBe(8);
    expect(new Set(a.map((s) => s.delay)).size).toBeGreaterThan(4);
    for (const s of a) {
      expect(s.r).toBeGreaterThanOrEqual(0.04);
      expect(s.r).toBeLessThanOrEqual(0.12); // a speck, in hex units
      expect(s.peak).toBeLessThanOrEqual(0.7);
      expect(s.dur).toBeGreaterThanOrEqual(700);
      expect(s.dur).toBeLessThanOrEqual(1300);
      expect(s.fall).toBeGreaterThan(0); // they settle downward as they drift out
    }
  });
});
