// THE CAMERA'S LIMITS AND ITS FEEL (owner brief, 2026-11-03): "Players must be able to drag beyond
// EVERY edge of the discovered map ... even outermost tiles must be able to reach the centre of the
// visible Territory viewport", with "soft and elastic" overscroll and a flick that carries.
import { describe, expect, it } from 'vitest';
import {
  PAN_OVERSCAN,
  focusLimits,
  focusOf,
  hardPan,
  isOutside,
  momentumStep,
  releaseVelocity,
  rubber,
  softPan,
} from '../src/online/world-pan.js';

const LIMITS = { minX: -100, minY: -80, maxX: 120, maxY: 90 };
const CENTRE = { fx: 0.5, fy: 0.5 };
// the Territory panel sits below the header: its centre is lower than the canvas centre
const PANEL = { fx: 0.5, fy: 0.58 };
const box = (cx: number, cy: number, w = 100, h = 200): [number, number, number, number] => [cx - w / 2, cy - h / 2, w, h];

describe('the focus (the middle of the VISIBLE panel) may visit every cell', () => {
  it('limits the focus to the cell-centre extent plus one cell of overscan', () => {
    const cells = [{ q: 0, r: 0 }, { q: 4, r: -2 }, { q: -3, r: 5 }];
    const limits = focusLimits(cells);
    const xs = cells.map((c) => Math.sqrt(3) * (c.q + c.r / 2) * 10);
    const ys = cells.map((c) => 15 * c.r);
    expect(limits.minX).toBeCloseTo(Math.min(...xs) - PAN_OVERSCAN, 9);
    expect(limits.maxX).toBeCloseTo(Math.max(...xs) + PAN_OVERSCAN, 9);
    expect(limits.minY).toBeCloseTo(Math.min(...ys) - PAN_OVERSCAN, 9);
    expect(limits.maxY).toBeCloseTo(Math.max(...ys) + PAN_OVERSCAN, 9);
    expect(PAN_OVERSCAN).toBeGreaterThan(10); // past the outermost centre: its fog shows beyond
  });

  it('lets the focus reach each of the four extremes, whatever the zoom', () => {
    for (const w of [60, 140, 400]) {
      for (const [x, y] of [[LIMITS.minX, 0], [LIMITS.maxX, 0], [0, LIMITS.minY], [0, LIMITS.maxY]] as const) {
        // ask for far beyond, get exactly the extreme
        const asked = box(x * 9, y * 9, w, w * 2);
        const placed = hardPan(asked, LIMITS, PANEL);
        const f = focusOf(placed, PANEL);
        if (x) expect(f.x).toBeCloseTo(x, 9); else expect(f.y).toBeCloseTo(y, 9);
        expect(isOutside(placed, LIMITS, PANEL)).toBe(false);
      }
    }
  });

  it('measures the focus at the PANEL centre, not the canvas centre', () => {
    const placed = hardPan(box(0, -500), LIMITS, PANEL);
    // the panel centre sits at the top limit; the canvas centre is above it by 8% of the height
    expect(focusOf(placed, PANEL).y).toBeCloseTo(LIMITS.minY, 9);
    expect(focusOf(placed, CENTRE).y).toBeCloseTo(LIMITS.minY - 0.08 * 200, 9);
  });

  it('leaves a camera that is already legal exactly where it was (no recentering)', () => {
    const legal = box(10, 5);
    expect(hardPan(legal, LIMITS, PANEL)).toEqual(legal);
    expect(softPan(legal, LIMITS, PANEL)).toEqual(legal);
  });

  it('never returns a non-finite view', () => {
    const placed = hardPan([NaN, Infinity, 100, 200], LIMITS, PANEL);
    expect(placed.every(Number.isFinite)).toBe(true);
  });
});

describe('the edge gives way softly (rubber band), and only so far', () => {
  it('is continuous at the limit, and resists more the further it is pulled', () => {
    expect(rubber(0, 200)).toBe(0);
    const a = rubber(10, 200), b = rubber(40, 200), c = rubber(400, 200);
    expect(a).toBeGreaterThan(0);
    expect(a).toBeLessThan(10);            // resistance: less than the finger travelled
    expect((b - a) / 30).toBeLessThan(a / 10); // each further unit pulled gives less
    expect(c).toBeLessThan(0.15 * 200);    // never more than 15% of the view
    expect(rubber(-10, 200)).toBe(-rubber(10, 200));
  });

  it('shows a raw camera past the edge a little past the edge, and a legal one untouched', () => {
    const raw = box(0, LIMITS.minY - 60 + 200 * (0.5 - 0.58)); // focus 60 past the top
    const shown = softPan(raw, LIMITS, PANEL);
    const over = LIMITS.minY - focusOf(shown, PANEL).y;
    expect(over).toBeGreaterThan(0);
    expect(over).toBeLessThan(60);
    expect(isOutside(shown, LIMITS, PANEL)).toBe(true);
    expect(isOutside(hardPan(shown, LIMITS, PANEL), LIMITS, PANEL)).toBe(false);
  });
});

describe('a flick carries; a pause stops', () => {
  const now = 1000;
  it('reads the finger velocity from the last ~100ms of samples', () => {
    const samples = [0, 16, 32, 48, 64, 80].map((t, i) => ({ t: now - 80 + t, x: i * 12, y: 0 }));
    const v = releaseVelocity(samples, now);
    expect(v.x).toBeCloseTo(0.75, 2); // 12px per 16ms
    expect(v.y).toBe(0);
  });
  it('reports NO velocity when the finger rested before lifting', () => {
    const samples = [0, 16, 32].map((t, i) => ({ t: now - 300 + t, x: i * 12, y: 0 }));
    expect(releaseVelocity(samples, now)).toEqual({ x: 0, y: 0 });
  });
  it('decelerates smoothly and stops', () => {
    let v = { x: 1.2, y: -0.6 };
    let travelled = 0, steps = 0;
    for (; steps < 400; steps++) {
      const s = momentumStep(v, 16);
      travelled += Math.hypot(s.dx, s.dy);
      v = s.v;
      if (s.done) break;
    }
    expect(steps).toBeLessThan(120);           // under ~2s
    expect(travelled).toBeGreaterThan(50);     // it carried
    expect(travelled).toBeLessThan(600);       // but restrained
    expect(Math.hypot(v.x, v.y)).toBeLessThan(0.05);
  });
});

describe('a finger landing on a giving edge picks it up where it is', () => {
  it('rawFor is the inverse of softPan', async () => {
    const { rawFor } = await import('../src/online/world-pan.js');
    const raw = box(0, LIMITS.minY - 50);
    const shown = softPan(raw, LIMITS, PANEL);
    const back = softPan(rawFor(shown, LIMITS, PANEL), LIMITS, PANEL);
    for (let i = 0; i < 4; i++) expect(back[i]!).toBeCloseTo(shown[i]!, 9);
  });
});
