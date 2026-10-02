// UI polish pass 3, Part 1: the top-rank tile gets a slight glow only. No contour, no rim,
// no shimmer; a faint halo in the owner's colour family; Low effects or the setting turn
// it off; breathing only at High effects and never with Reduce motion.
import { describe, expect, it } from 'vitest';
import { GLOW_CAP, OLD_GLOW_OPACITY, WHISPER_FROM, topGlow } from '../src/logic/topglow.js';
import type { GlowOpts } from '../src/logic/topglow.js';
import { DEFAULT_SETTINGS, parseSettings } from '../src/logic/settings.js';

const on: GlowOpts = { setting: 'subtle', effects: 'normal', reduceMotion: false };
const hue = (c: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)) as [number, number, number];
  return (((Math.atan2(Math.sqrt(3) * (g - b), 2 * r - g - b) * 180) / Math.PI) + 360) % 360;
};

describe('the top-rank glow', () => {
  it('has no contour and no stroke of any kind, ever', () => {
    for (const mat of ['moss', 'lava'] as const)
      for (const effects of ['low', 'normal', 'high'] as const) {
        const g = topGlow(1, mat, { ...on, effects });
        if (g) {
          expect(g.contour).toBe(0);
          expect(g.stroke).toBe(0);
        }
      }
  });

  it('is capped at about a quarter of the old glow strength, with a small blur', () => {
    expect(GLOW_CAP).toBeLessThanOrEqual(OLD_GLOW_OPACITY * 0.25 + 1e-9);
    for (const mat of ['moss', 'lava'] as const) {
      const g = topGlow(1, mat, on)!;
      expect(g.opacity).toBeGreaterThan(0);
      expect(g.opacity).toBeLessThanOrEqual(GLOW_CAP);
      expect(g.blur).toBeGreaterThanOrEqual(0.06);
      expect(g.blur).toBeLessThanOrEqual(0.08);
    }
  });

  it('is zero below t = 0.9; just under the top it is a whisper, much fainter than the top', () => {
    expect(WHISPER_FROM).toBe(0.9);
    for (const t of [0, 0.3, 0.6, 0.85, 0.875, 0.8999]) expect(topGlow(t, 'moss', on), String(t)).toBeNull();
    const top = topGlow(1, 'lava', on)!.opacity;
    const near = topGlow(0.92, 'lava', on)!.opacity;
    expect(near).toBeGreaterThan(0);
    expect(near).toBeLessThanOrEqual(top * 0.35);
  });

  it('Effects Low turns it off; the setting Off turns it off', () => {
    expect(topGlow(1, 'moss', { ...on, effects: 'low' })).toBeNull();
    expect(topGlow(1, 'lava', { ...on, setting: 'off' })).toBeNull();
  });

  it('is still unless Effects is High, and never breathes with Reduce motion', () => {
    expect(topGlow(1, 'moss', on)!.breathe).toBeNull();
    const high = topGlow(1, 'moss', { ...on, effects: 'high' })!.breathe!;
    expect(high.amount).toBeGreaterThan(0);
    expect(high.amount).toBeLessThanOrEqual(0.06); // "a few percent"
    expect(high.periodMs).toBeGreaterThanOrEqual(5000);
    expect(topGlow(1, 'moss', { ...on, effects: 'high', reduceMotion: true })!.breathe).toBeNull();
  });

  it('colours: a pale mint for moss, a soft pink-orange for lava, never amber or yellow', () => {
    const moss = topGlow(1, 'moss', on)!.color;
    const lava = topGlow(1, 'lava', on)!.color;
    expect(hue(moss)).toBeGreaterThan(120);
    expect(hue(moss)).toBeLessThan(170);
    const h = hue(lava);
    expect(h < 25 || h > 340, `lava glow hue ${h}`).toBe(true);
  });

  it('the setting "Top-rank glow" defaults to Subtle and is saved', () => {
    expect(DEFAULT_SETTINGS.topGlow).toBe('subtle');
    expect(parseSettings(JSON.stringify({ topGlow: 'off' })).topGlow).toBe('off');
    expect(parseSettings(JSON.stringify({ topGlow: 'blinding' })).topGlow).toBe('subtle');
  });
});
