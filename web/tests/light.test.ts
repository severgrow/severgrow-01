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
import {
  BLOOM_ALPHA_CAP, BLOOM_PAD, BLOOM_REACH, BLOOM_REACH_DOWN, BLOOM_REACH_UP,
  SCORE_INK, SCORE_SEPARATOR_INK, ledLayout,
} from '../src/player/led-cells.js';
import { SMART_COCKPIT_CSS } from '../src/player/smart-cockpit.js';

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

  it('rests at 65% of the previous strength (owner: intensity down by ~35%)', () => {
    // The values the brief was measured against. Pinning the ratio (not just a ceiling) is what
    // stops a later pass from quietly turning the glow back up.
    const before: Record<string, number> = { amber: .44, red: .46, green: .44, ivory: .42, pink: .42, cyan: .42 };
    for (const tone of ROOM_TONES) {
      expect(LIGHT_TONES[tone].peak, `${tone} peak`).toBeCloseTo(before[tone]! * .65, 3);
      expect(LIGHT_TONES[tone].peak, `${tone} is visibly weaker`).toBeLessThan(before[tone]! * .7);
      expect(LIGHT_TONES[tone].peak, `${tone} still reads`).toBeGreaterThan(.25);
    }
  });

  it('reaches a little further below than above, without moving the top of the light', () => {
    expect(LIGHT_CAPS.reachDown).toBeGreaterThan(1);
    expect(LIGHT_CAPS.reachDown).toBeLessThanOrEqual(1.35);
    expect(BLOOM_REACH_DOWN).toBeGreaterThan(BLOOM_REACH_UP);
    expect(BLOOM_REACH_DOWN / BLOOM_REACH_UP).toBeCloseTo(LIGHT_CAPS.reachDown, 6);
    // The longer tail still ends inside the sprite's empty margin, or it would be cut square.
    expect(BLOOM_REACH_DOWN).toBeLessThan(BLOOM_PAD);
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

describe('the light can never become a panel wash', () => {
  it('caps the sprite well below the old .5, so even a saturated marquee stays a halo', () => {
    expect(BLOOM_ALPHA_CAP).toBeLessThanOrEqual(.35);
    expect(BLOOM_ALPHA_CAP).toBeGreaterThanOrEqual(.28);
    // The strongest possible pixel on screen: the cap times the strongest rest opacity.
    const worst = BLOOM_ALPHA_CAP * Math.max(...Object.values(LIGHT_TONES).map(spec => spec.peak));
    expect(worst).toBeLessThanOrEqual(.12);
  });

  it('hugs the display: the bloom is clipped to a fixed band, whatever the message is', () => {
    // The clip is the hard bound. Without it, a marquee's whole-strip sprite paints the cockpit:
    // measured at 2678 x 182 CSS px over a 92 px display, adding up to 205/255 to the screen.
    expect(SMART_COCKPIT_CSS).toContain('#smart-led-bloom-clip');
    const rule = SMART_COCKPIT_CSS.slice(SMART_COCKPIT_CSS.indexOf('#smart-led-bloom-clip'));
    expect(rule).toMatch(/overflow:hidden/);
    // The band is the display plus one fixed wing on each side and one fixed lip above/below.
    expect(SMART_COCKPIT_CSS).toContain('--led-bloom-wing:26px');
    expect(rule).toContain('width:calc(100% + 2 * var(--led-bloom-wing,26px))');
    expect(rule).toContain('height:calc(100% + 2 * var(--led-bloom-lip,84px))');
    // A feathered end, so the fixed bound has no visible edge.
    expect(rule).toMatch(/mask-image:linear-gradient\(to right,transparent 0,#000 var\(--led-bloom-wing/);
    // The scrolling sprite stays aligned to the strip INSIDE the clip.
    expect(SMART_COCKPIT_CSS).toContain('left:calc(6px - var(--led-bloom-pad,0px) + var(--led-bloom-wing,26px))');
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
    const green = ledLayout('+3', false, 'green', 1);
    expect(green.dots.every(dot => dot.tone === 'green')).toBe(true);
    const red = ledLayout('-3', false, 'red', 1);
    expect(red.dots.every(dot => dot.tone === 'red')).toBe(true);
  });

  it('the score digits are ONE neutral cream: no green, no red, no team coding', () => {
    const score = ledLayout('27:12', false, 'score', 1);
    // Owner, 2026-10-20: green for you and red for them read as good/bad on the points.
    expect(score.dots.some(dot => dot.tone === 'green')).toBe(false);
    expect(score.dots.some(dot => dot.tone === 'red')).toBe(false);
    const digits = score.dots.filter(dot => dot.tone === SCORE_INK);
    expect(digits.length).toBeGreaterThan(20);
    // Both sides of the separator use that same cream. Only the punctuation may differ.
    const left = ledLayout('7', false, 'score', 1).dots.map(dot => dot.tone);
    const right = ledLayout('7', false, 'score', 1).dots.map(dot => dot.tone);
    expect(new Set(left)).toEqual(new Set([SCORE_INK]));
    expect(new Set(right)).toEqual(new Set([SCORE_INK]));
    // The one score layout with a separator: the ':' alone is the warm punctuation.
    const tones = new Set(score.dots.map(dot => dot.tone));
    expect([...tones].sort()).toEqual([SCORE_INK, SCORE_SEPARATOR_INK].sort());
    expect(SCORE_SEPARATOR_INK).not.toBe('red');
    expect(SCORE_SEPARATOR_INK).not.toBe('green');
    // Still the brightest quiet ink: the score must not be dimmed into the background.
    const luma = (hex: string) => {
      const n = Number.parseInt(hex.slice(1), 16);
      const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => v / 255);
      return .2126 * r! + .7152 * g! + .0722 * b!;
    };
    for (const other of ROOM_TONES) expect(luma(LIGHT_TONES[SCORE_INK].core)).toBeGreaterThanOrEqual(luma(LIGHT_TONES[other].core));
    // `score` still borrows amber as the ROOM tone (the bloom), which is warm and neutral too.
    expect(toneFor('score')).toBe('amber');
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
