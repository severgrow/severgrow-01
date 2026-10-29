// The idle re-prompt blink is stepped, not animated (2026-10-29). Measured on an idle game screen
// (390×844, 4× CPU throttle): the old 60 Hz CSS opacity animation on the two glyph canvases was the
// ENTIRE idle bill — ~105 ms of style recalculation and ~140 ms of main-thread task every second,
// for as long as the player was thinking. Two class writes a second paint the same blink.
//
// These tests pin the cadence itself, so a future change cannot quietly turn the beat into a strobe
// or drop the negative space the owner asked for.
import { describe, expect, it } from 'vitest';
import { LIGHT_CAPS } from '../src/player/light.js';
import { blinkOnMs, firstBlinkPhase, nextBlinkPhase } from '../src/player/led-blink.js';
import type { BlinkCaps, BlinkPhase } from '../src/player/led-blink.js';

const walk = (cycles: number, caps: BlinkCaps = LIGHT_CAPS): BlinkPhase[] => {
  const phases: BlinkPhase[] = [];
  let phase = firstBlinkPhase(caps);
  for (let i = 0; i < cycles * 2; i++) {
    phases.push(phase);
    phase = nextBlinkPhase(phase, caps);
  }
  return phases;
};

describe('the idle re-prompt blink', () => {
  it('opens with the dots ON and the rest of the beat as its hold', () => {
    const first = firstBlinkPhase();
    expect(first.off).toBe(false);
    expect(first.holdMs).toBe(LIGHT_CAPS.alarmMs - LIGHT_CAPS.alarmOffMs);
    expect(first.holdMs).toBe(800);
  });

  it('is dark for exactly alarmOffMs of every alarmMs', () => {
    const phases = walk(3);
    const off = phases.filter((p) => p.off);
    expect(off).toHaveLength(3);
    for (const phase of off) expect(phase.holdMs).toBe(LIGHT_CAPS.alarmOffMs);
    // ON + OFF is one whole beat, and three beats are three beats.
    const perBeat = phases[0]!.holdMs + phases[1]!.holdMs;
    expect(perBeat).toBe(LIGHT_CAPS.alarmMs);
    expect(phases.reduce((sum, p) => sum + p.holdMs, 0)).toBe(3 * LIGHT_CAPS.alarmMs);
  });

  it('alternates: no two ON or two OFF phases in a row', () => {
    const phases = walk(4);
    for (let i = 1; i < phases.length; i++) expect(phases[i]!.off).toBe(!phases[i - 1]!.off);
  });

  it('stays under the photosensitivity line (at most 3 dark windows a second)', () => {
    expect(1000 / LIGHT_CAPS.alarmMs).toBeLessThanOrEqual(3);
  });

  it('never schedules a zero-length hold, whatever the caps say', () => {
    const caps: BlinkCaps = { alarmMs: 1000, alarmOffMs: 0 };
    const phases = walk(2, caps);
    for (const phase of phases) expect(phase.holdMs).toBeGreaterThanOrEqual(0);
    expect(blinkOnMs(caps)).toBe(1000);
    // A zero OFF window collapses to ON-only holds; the runtime floors the timer at 1 ms.
    expect(phases.every((p) => !p.off || p.holdMs === 0)).toBe(true);
  });
});
