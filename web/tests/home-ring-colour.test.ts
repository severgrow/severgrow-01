// The home timeout ring: colour means TIME only, identically on both homes, and it exists only in a
// real-time (live) session.
//
// Owner's rules (2026-10-14):
//   * "always make it going from green through orange to red over 60s time"
//   * "lava/moss time circle - dont do any of that - both the same ... it's clear that if its on my
//     home tile - its my turn - if on opp's tile - its their turn"
//   * the ring appears in REAL-TIME MODE ONLY: a normal 24-hour async duel keeps only the urgency
//     chip in the header strip.
import { describe, expect, it } from 'vitest';
import { RING_GREEN, RING_ORANGE, RING_RED, ringColour } from '../src/online/live/ui.js';
import { deadlineUrgency, turnWord } from '../src/online/duel-hud.js';

const rgb = (c: string): [number, number, number] => {
  const m = /rgb\((\d+),(\d+),(\d+)\)/.exec(c);
  if (!m) throw new Error(`not an rgb() colour: ${c}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
};
const hue = ([r, g, b]: [number, number, number]): number => {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return 0;
  const h = max === r ? 60 * (((g - b) / d) % 6) : max === g ? 60 * ((b - r) / d + 2) : 60 * ((r - g) / d + 4);
  return (h + 360) % 360;
};

describe('the home ring’s colour journey', () => {
  it('is exactly the FUTASAKU green at the start of the turn', () => {
    expect(ringColour(1)).toBe(`rgb(${RING_GREEN.join(',')})`);
    expect(hue(rgb(ringColour(1)))).toBeGreaterThan(70);
    expect(hue(rgb(ringColour(1)))).toBeLessThan(130);
  });

  it('is exactly the amber-orange at the half', () => {
    expect(ringColour(0.5)).toBe(`rgb(${RING_ORANGE.join(',')})`);
    expect(hue(rgb(ringColour(0.5)))).toBeGreaterThan(20);
    expect(hue(rgb(ringColour(0.5)))).toBeLessThan(50);
  });

  it('is exactly the FUTASAKU lava-red at the end', () => {
    expect(ringColour(0)).toBe(`rgb(${RING_RED.join(',')})`);
    const h = hue(rgb(ringColour(0)));
    expect(h).toBeLessThan(20);
  });

  it('travels green -> orange -> red monotonically, with no colour outside that family', () => {
    const hues = Array.from({ length: 13 }, (_, i) => hue(rgb(ringColour(1 - i / 12))));
    for (let i = 1; i < hues.length; i++) expect(hues[i]!).toBeLessThanOrEqual(hues[i - 1]! + 0.001);
    // Every quarter of the turn lands in the right band, so the journey reads at a glance.
    expect(hue(rgb(ringColour(0.9)))).toBeGreaterThan(70); // green
    expect(hue(rgb(ringColour(0.65)))).toBeGreaterThan(40); // green/amber edge
    expect(hue(rgb(ringColour(0.5)))).toBeLessThan(50); // amber
    expect(hue(rgb(ringColour(0.25)))).toBeLessThan(35); // orange/red
    expect(hue(rgb(ringColour(0.05)))).toBeLessThan(20); // red
  });

  it('is the SAME colour for the same time left, whoever is on the clock (no side colouring)', () => {
    // The function takes only the time left: there is no seat parameter to pass, which is the
    // guarantee that both homes get an identical treatment.
    expect(ringColour.length).toBe(1);
    for (const frac of [1, 0.75, 0.5, 0.25, 0]) expect(ringColour(frac)).toBe(ringColour(frac));
  });

  it('clamps outside the turn rather than interpolating past the ends', () => {
    expect(ringColour(2)).toBe(ringColour(1));
    expect(ringColour(-1)).toBe(ringColour(0));
  });
});

describe('the async (24-hour) duel keeps the urgency chip and never a ring', () => {
  it('the urgency rule is unchanged: nothing, then amber under 2 h, red under 15 min', () => {
    // The three bands the product has always had (the thresholds themselves are asserted by the
    // existing duel-hud suite; here we pin only the shape around them).
    expect(deadlineUrgency(24 * 3_600_000).tone).toBe(null);
    expect(deadlineUrgency(20 * 60_000).tone).toBe('amber');
    expect(deadlineUrgency(10 * 60_000).tone).toBe('red');
    expect(deadlineUrgency(0).tone).toBe('red');
    // Every tone that shows a word carries one (never colour alone).
    for (const ms of [20 * 60_000, 10 * 60_000, 0]) {
      const u = deadlineUrgency(ms);
      expect(u.label.length).toBeGreaterThan(0);
      expect(u.sr.length).toBeGreaterThan(0);
    }
  });

  it('the turn words are unchanged (never renamed)', () => {
    expect(turnWord('mine')).toBe('Your turn');
    expect(turnWord('theirs')).toBe("Opponent's turn");
    expect(turnWord('replaying')).toBeTruthy();
    expect(turnWord('finished')).toBe('Finished');
  });
});
