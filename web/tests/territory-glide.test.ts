// THE MAP'S GLIDE (owner, 2026-10-29: "the 'out of map' territory animation is too fast and too
// jumpy - a bit slower, way smoother, without costing much CPU at all").
//
// Two real causes, one of them not about duration at all:
//
//   1. 380 ms was too short for a move across the whole map.
//   2. The curve was `1 - (1 - t)^3`, an ease-OUT cubic. It has no ease-in at all: measured, it
//      covers ~87.5% of the distance in the first HALF of the time (it "snaps, then crawls"). A
//      longer duration on that curve would only make the crawl longer.
//
// The glide now uses a true SMOOTHSTEP, 3t² - 2t³, which leaves rest at zero speed, arrives at zero
// speed, and is exactly half-way at half-time. This file holds the curve itself (numbers, not a
// comment), so a future "optimisation" back to a snapping curve fails `npm run check`.
//
// The built page is measured by web/e2e/territory-prep.ts (duration, landing point, per-frame cost
// against a pan, a mid-flight re-target that must not jump).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { GLIDE_MS, glideProgress } from '../src/online/world-view.js';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const worldView = read('../src/online/world-view.ts');

/** The curve the glide used before this pass: `1 - (1 - t)^3`, kept only as the thing to beat. */
const oldEaseOutCubic = (t: number): number => 1 - (1 - t) ** 3;

describe('the glide curve', () => {
  it('starts at rest and arrives exactly on target', () => {
    expect(glideProgress(0)).toBe(0);
    expect(glideProgress(1)).toBe(1);
  });

  it('is half-way at half-time (the measured cause of "jumpy")', () => {
    const middle = glideProgress(0.5);
    expect(middle).toBeGreaterThanOrEqual(0.45);
    expect(middle).toBeLessThanOrEqual(0.55);
  });

  it('is nowhere near the old snap at the midpoint', () => {
    // The old curve travelled 87.5% of the way in the first half; this is the regression guard.
    expect(oldEaseOutCubic(0.5)).toBeCloseTo(0.875, 3);
    expect(glideProgress(0.5)).toBeLessThan(0.6);
  });

  it('leaves the start gently and arrives gently (ease-in AND ease-out)', () => {
    // Average speed over the first (last) tenth: the old ease-out started at 3x the average and
    // stopped dead (0.271 in the first tenth, 0.001 in the last).
    expect(glideProgress(0.1)).toBeLessThan(0.06);
    expect(1 - glideProgress(0.9)).toBeLessThan(0.06);
    expect(oldEaseOutCubic(0.1)).toBeGreaterThan(0.25);
    // The middle is the fastest part, but only 1.5x the average: no lurch.
    const middleSpeed = (glideProgress(0.51) - glideProgress(0.49)) / 0.02;
    expect(middleSpeed).toBeGreaterThan(1.2);
    expect(middleSpeed).toBeLessThan(1.6);
  });

  it('is symmetric about its midpoint and never goes backwards', () => {
    for (let step = 0; step <= 20; step++) {
      const t = step / 20;
      expect(glideProgress(t) + glideProgress(1 - t)).toBeCloseTo(1, 9);
      if (step > 0) expect(glideProgress(t)).toBeGreaterThan(glideProgress((step - 1) / 20));
    }
  });

  it('clamps outside 0..1 instead of overshooting the target', () => {
    expect(glideProgress(-0.5)).toBe(0);
    expect(glideProgress(1.5)).toBe(1);
  });
});

describe('the glide duration', () => {
  it('is one slower breath than before, inside the brief', () => {
    expect(GLIDE_MS).toBeGreaterThanOrEqual(520);
    expect(GLIDE_MS).toBeLessThanOrEqual(620);
  });

  it('has exactly one home in the source, and the glide is its only reader', () => {
    const code = worldView.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    const uses = [...code.matchAll(/GLIDE_MS/g)].length;
    // declaration + the one use inside `flyTo` (documented below it)
    expect(uses).toBe(2);
  });
});

describe('the glide frame cost', () => {
  it('writes the view without measuring it, once per frame, on the existing rAF', () => {
    const flyTo = worldView.slice(worldView.indexOf('private flyTo('), worldView.indexOf('private stopGlide()'));
    expect(flyTo).toContain('requestAnimationFrame(step)');
    expect(flyTo).toContain('applyView(false)');
    // no per-frame layout read inside the glide
    expect(flyTo).not.toMatch(/getBoundingClientRect/);
    expect(flyTo).not.toMatch(/getBBox/);
    // no extra clock: the only timing source is the rAF timestamp
    expect(flyTo).not.toMatch(/setTimeout|setInterval/);
    expect(flyTo).toContain('glideProgress');
  });

  it('still yields to a finger and to Reduce motion', () => {
    const flyTo = worldView.slice(worldView.indexOf('private flyTo('), worldView.indexOf('private stopGlide()'));
    expect(flyTo).toContain('this.stopGlide()');
    expect(flyTo).toContain('interfaceMotionAllowed()');
    const stop = worldView.slice(worldView.indexOf('private stopGlide()'), worldView.indexOf('private flyToOwner('));
    expect(stop).toContain('cancelAnimationFrame');
  });
});
