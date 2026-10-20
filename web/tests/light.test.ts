import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  LIGHT_ANGLE,
  LIGHT_CAPS,
  LIGHT_TONES,
  bloomProfile,
  lightTone,
  publishLight,
  resetLightForTests,
  toneFor,
} from '../src/player/light.js';
import { BLOOM_PAD, BLOOM_REACH, ledLayout } from '../src/player/led-cells.js';

/** Every display tone the cockpit can emit, plus the per-glyph score mode. */
const TONES = ['amber', 'red', 'green', 'ivory', 'pink', 'cyan', 'score'] as const;
const ROOM_TONES = ['amber', 'red', 'green', 'ivory', 'pink', 'cyan'] as const;

describe('the one LIGHT contract', () => {
  it('maps every tone the display can emit to a core, a low-alpha bloom and an angle', () => {
    expect(Object.keys(LIGHT_TONES).sort()).toEqual([...ROOM_TONES].sort());
    for (const tone of ROOM_TONES) {
      const spec = LIGHT_TONES[tone];
      expect(spec.core, `${tone} core`).toMatch(/^#[0-9a-f]{6}$/i);
      // Bloom is a tint, never a fill: its alpha is deliberately low.
      const alpha = Number(/rgba\([^)]*,\s*([\d.]+)\)/.exec(spec.bloom)?.[1]);
      expect(alpha, `${tone} bloom alpha`).toBeGreaterThan(0);
      expect(alpha, `${tone} bloom alpha`).toBeLessThanOrEqual(.4);
      expect(spec.angle, `${tone} angle`).toBe(LIGHT_ANGLE);
      expect(spec.angle).toBeGreaterThanOrEqual(15);
      expect(spec.angle).toBeLessThanOrEqual(30);
      expect(spec.peak).toBeLessThanOrEqual(LIGHT_CAPS.bloomPeak);
    }
  });

  it('never leaves a tone unknown: score borrows amber and anything else falls back to amber', () => {
    expect(lightTone('score')).toBe(LIGHT_TONES.amber);
    expect(toneFor('score')).toBe('amber');
    // The runtime guard for a tone that is not in the palette (the parameter accepts raw strings
    // because the display's mode comes from game copy).
    expect(lightTone('blurple')).toBe(LIGHT_TONES.amber);
    expect(toneFor('blurple')).toBe('amber');
    for (const tone of TONES) expect(lightTone(tone), tone).toBeDefined();
  });

  it('keeps the caps the owner set: flash, white, alarm and bloom', () => {
    expect(LIGHT_CAPS.flashMs).toBeLessThanOrEqual(60);
    expect(LIGHT_CAPS.flashWhite).toBeLessThanOrEqual(.35);
    expect(LIGHT_CAPS.alarmMs).toBe(1200);
    // A major event may catch the bezel, but the stepped opacity still lands under the cap.
    expect(LIGHT_CAPS.bloomPeak).toBeLessThanOrEqual(.55);
    for (const tone of ROOM_TONES) {
      expect(LIGHT_TONES[tone].peak * LIGHT_CAPS.reflect).toBeLessThanOrEqual(LIGHT_CAPS.bloomPeak + 1e-9);
    }
  });
});

describe('the baked bloom falloff', () => {
  it('starts at full strength on a lit dot and falls monotonically to nothing', () => {
    expect(bloomProfile(0)).toBe(1);
    expect(bloomProfile(1)).toBe(0);
    expect(bloomProfile(2)).toBe(0);
    let previous = bloomProfile(0);
    for (let i = 1; i <= 200; i++) {
      const value = bloomProfile(i / 200);
      expect(value).toBeLessThan(previous);
      previous = value;
    }
  });

  it('has no cliff at the edge and no negative or oversized alpha', () => {
    // Consecutive samples close to the edge differ by a small fraction, not a step.
    let worst = 0;
    for (let i = 0; i < 200; i++) {
      const a = bloomProfile(i / 200);
      const b = bloomProfile((i + 1) / 200);
      worst = Math.max(worst, Math.abs(a - b));
      expect(b).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThanOrEqual(1);
    }
    // A 1/200 step never loses more than one twentieth of the range (a hard edge would be 1).
    expect(worst).toBeLessThan(.05);
    // The tail lands on exactly zero rather than stopping at a visible ring.
    expect(bloomProfile(1)).toBe(0);
    expect(bloomProfile(1 - 1e-6)).toBeLessThan(1e-5);
  });
});

describe('the baked bloom geometry', () => {
  it('keeps every lit dot inside the strip, with an empty margin on every side', () => {
    // The sprite is the dot strip plus BLOOM_PAD of empty paper; the stamp may stretch along the
    // angle before it fades, so the pad has to cover that stretched reach or the glow is clipped.
    expect(BLOOM_PAD).toBeGreaterThanOrEqual(BLOOM_REACH);
    const layout = ledLayout('0:0', false, 'score', 1);
    expect(layout.dots.length).toBeGreaterThan(0);
    for (const dot of layout.dots) {
      expect(dot.x - dot.r).toBeGreaterThanOrEqual(0);
      expect(dot.x + dot.r).toBeLessThanOrEqual(layout.width);
      expect(dot.y - dot.r).toBeGreaterThanOrEqual(0);
      expect(dot.y + dot.r).toBeLessThanOrEqual(layout.height);
    }
  });

  it('bakes the same dots the glyphs are drawn from, in the tone they are drawn in', () => {
    const score = ledLayout('27:12', false, 'score', 1);
    expect(score.dots.some(dot => dot.tone === 'green')).toBe(true);
    expect(score.dots.some(dot => dot.tone === 'red')).toBe(true);
    const green = ledLayout('+3', false, 'green', 1);
    expect(green.dots.every(dot => dot.tone === 'green')).toBe(true);
  });
});

describe('publishing the tone on the root', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetLightForTests();
  });

  const fakeRoot = () => {
    const values = new Map<string, string>();
    const setProperty = vi.fn((name: string, value: string) => { values.set(name, value); });
    vi.stubGlobal('document', { documentElement: { style: { setProperty } } });
    return { setProperty, values };
  };

  it('writes core, bloom, angle and the capped rest opacity', () => {
    const root = fakeRoot();
    publishLight('green');
    expect(root.values.get('--light-core')).toBe(LIGHT_TONES.green.core);
    expect(root.values.get('--light-bloom')).toBe(LIGHT_TONES.green.bloom);
    expect(root.values.get('--light-angle')).toBe(`${LIGHT_ANGLE}deg`);
    expect(Number(root.values.get('--light-bloom-op'))).toBe(LIGHT_TONES.green.peak);
  });

  it('writes only when the tone changes, so the bloom cannot re-bake every frame', () => {
    const root = fakeRoot();
    publishLight('amber');
    publishLight('amber');
    publishLight('score'); // score is the same room colour as amber
    expect(root.setProperty).toHaveBeenCalledTimes(4);
    publishLight('red');
    expect(root.setProperty).toHaveBeenCalledTimes(8);
    expect(root.values.get('--light-core')).toBe(LIGHT_TONES.red.core);
  });
});
