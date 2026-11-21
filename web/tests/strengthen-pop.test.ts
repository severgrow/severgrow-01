// A Strengthen moves the TILE, not just the number on it — and it costs the turn nothing.
// Owner, 2026-11-20: another animation "easily improved for max satisfaction joy dopamine".
// The contract this pins:
//   - the tile answers immediately (its peak is in the first half of the beat);
//   - it is tactile, not bouncy (a few percent, about a pixel and a half);
//   - it animates the compositor only (transform, never filter/box-shadow/layout);
//   - it fits inside the Strengthen step's existing hold, so no turn gets longer.
import { describe, expect, it } from 'vitest';
import { STRENGTHEN_POP, STRENGTHEN_POP_MS } from '../src/ui/feel.js';
import { MOTION } from '../src/logic/motion.js';

describe('a Strengthen makes the tile answer', () => {
  it('is transform only: nothing that repaints or reflows', () => {
    for (const frame of STRENGTHEN_POP) {
      expect(Object.keys(frame).filter((k) => k !== 'offset')).toEqual(['transform']);
      expect(String(frame.transform)).toMatch(/^translateY\([-\d.]+(?:px)?\) scale\([\d.]+\)/);
    }
  });

  it('is tactile, not a bounce: a few percent and about a pixel and a half', () => {
    const scales = STRENGTHEN_POP.map((f) => Number(/scale\(([\d.]+)\)/.exec(String(f.transform))![1]));
    const lifts = STRENGTHEN_POP.map((f) => Number(/translateY\(([-\d.]+)(?:px)?\)/.exec(String(f.transform))![1]));
    const peak = Math.max(...scales);
    const overshoot = Math.min(...scales);
    expect(peak).toBeGreaterThan(1);
    expect(peak).toBeLessThanOrEqual(1.05);
    expect(overshoot).toBeGreaterThan(0.99); // it does not shrink below rest on the way back
    expect(Math.max(...lifts.map(Math.abs))).toBeLessThanOrEqual(2);
  });

  it('answers at once: the peak sits in the first half of the beat', () => {
    const peak = STRENGTHEN_POP.find((f) => Number(/scale\(([\d.]+)\)/.exec(String(f.transform))![1]) > 1)!;
    expect(Number(peak.offset)).toBeLessThan(0.5);
    expect(STRENGTHEN_POP.at(-1)!.transform).toBe('translateY(0) scale(1)');
  });

  it('fits inside the Strengthen step that was already shipping (never a longer turn)', () => {
    // The step holds the number tick plus 230 ms; the pop must spend that time, not add to it.
    expect(STRENGTHEN_POP_MS).toBeLessThanOrEqual(MOTION.quick + 230);
    expect(STRENGTHEN_POP_MS).toBeGreaterThan(MOTION.quick);
  });
});
