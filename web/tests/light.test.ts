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
  SCORE_INK_OPP, SCORE_INK_YOU, SCORE_SEPARATOR_INK, ledLayout,
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

  it('rests at 65% x 85% x 85% of the previous strength (three owner reductions)', () => {
    // The values the first brief was measured against. Three passes have since dimmed the bloom:
    // x0.65 (owner, 2026-10-20: "too strong, reduce by around 35%"), x0.85 (owner, 2026-10-21:
    // "decrease its glow strength by 15%") and x0.85 again (owner, 2026-10-21: "another 15% of
    // current strength"). Pinning the ratio, not just a ceiling, is what stops a later pass from
    // quietly turning the glow back up.
    const before: Record<string, number> = { amber: .44, red: .46, green: .44, ivory: .42, pink: .42, cyan: .42 };
    for (const tone of ROOM_TONES) {
      expect(LIGHT_TONES[tone].peak, `${tone} peak`).toBeCloseTo(before[tone]! * .65 * .85 * .85, 3);
      expect(LIGHT_TONES[tone].peak, `${tone} is visibly weaker`).toBeLessThan(before[tone]! * .6);
      // Still a visible halo, not a ghost. The floor moved down with the third pass (the smallest
      // peak is .197): it is not a percentage of the original but the point where the bloom still
      // reads as a halo against the dark window, while the flash and alarm caps stay untouched.
      expect(LIGHT_TONES[tone].peak, `${tone} still reads`).toBeGreaterThan(.19);
      expect(LIGHT_TONES[tone].peak, `${tone} stays under the photosensitivity cap`).toBeLessThanOrEqual(LIGHT_CAPS.bloomPeak);
    }
  });

  it('leans DOWN hard: less light above the dots, more onto the keys below', () => {
    // Owner (2026-10-21): "tilt it even more downwards, less above the screen more on the buttons
    // below". The lower tail is nearly twice the upper one, and the upper side is trimmed.
    expect(LIGHT_CAPS.reachDown).toBeGreaterThanOrEqual(1.8);
    expect(LIGHT_CAPS.reachDown).toBeLessThanOrEqual(2.1);
    expect(LIGHT_CAPS.reachUp).toBeLessThan(1);
    expect(LIGHT_CAPS.reachUp).toBeGreaterThan(.7);
    expect(BLOOM_REACH_DOWN).toBeGreaterThan(BLOOM_REACH_UP * 2);
    expect(BLOOM_REACH_UP).toBeLessThan(LIGHT_CAPS.reach * .9);
    // Both tails still end inside the sprite's empty margin, or they would be cut square.
    expect(BLOOM_REACH_DOWN).toBeLessThan(BLOOM_PAD);
    expect(BLOOM_REACH_UP).toBeLessThan(BLOOM_PAD);
  });

  it('keeps the caps the owner set: flash, white, alarm and bloom', () => {
    expect(LIGHT_CAPS.flashMs).toBeLessThanOrEqual(60);
    expect(LIGHT_CAPS.flashWhite).toBeLessThanOrEqual(.35);
    // Owner, 2026-10-22: the idle blink was barely visible, so it uses negative space - the dots
    // switch OFF for 0.2 s of every 1 s. At 1 Hz it stays far under the 3 flashes/s seizure line.
    expect(LIGHT_CAPS.alarmMs).toBe(1000);
    expect(LIGHT_CAPS.alarmOffMs).toBe(200);
    expect(1000 / LIGHT_CAPS.alarmMs).toBeLessThanOrEqual(3);
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

  it('the score digits are green for you and red for them, split at the separator', () => {
    const score = ledLayout('27:12', false, 'score', 1);
    // Owner (2026-10-21): the two players keep their own inks, as they read before the interim
    // neutral pass. Position still says whose is whose.
    expect(SCORE_INK_YOU).toBe('green');
    expect(SCORE_INK_OPP).toBe('red');
    const mine = ledLayout('7:', false, 'score', 1).dots;
    const theirs = ledLayout('7:1', false, 'score', 1).dots;
    expect(mine.some(dot => dot.tone === 'green'), 'your digits are green').toBe(true);
    expect(theirs.some(dot => dot.tone === 'red'), 'their digits are red').toBe(true);
    // Exactly three inks on the score face: mine, the punctuation, theirs.
    const tones = new Set(score.dots.map(dot => dot.tone));
    expect([...tones].sort()).toEqual([SCORE_INK_YOU, SCORE_SEPARATOR_INK, SCORE_INK_OPP].sort());
    expect(SCORE_SEPARATOR_INK).not.toBe('red');
    expect(SCORE_SEPARATOR_INK).not.toBe('green');
    // Both players' digits stay legible against the dark window.
    const luma = (hex: string) => {
      const n = Number.parseInt(hex.slice(1), 16);
      const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => v / 255);
      return .2126 * r! + .7152 * g! + .0722 * b!;
    };
    for (const tone of [SCORE_INK_YOU, SCORE_INK_OPP] as const) {
      expect(luma(LIGHT_TONES[tone].core), `${tone} reads on the dark window`).toBeGreaterThan(.25);
    }
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
