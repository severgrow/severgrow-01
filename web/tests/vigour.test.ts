// Material pass 2: strength shows in the material. Pure logic, written before the code.
import { describe, expect, it } from 'vitest';
import {
  fieldT,
  lavaLook,
  lavaPalette,
  mossLook,
  mossPalette,
  numberStyle,
  richness,
  vigour,
  wnoise,
} from '../src/logic/vigour.js';
import { contrast } from '../src/logic/themes.js';
import { THEME_IDS } from '../src/logic/themes.js';
import { CVD_KINDS, deltaE, simulate } from '../src/logic/colorcheck.js';

const T = Array.from({ length: 21 }, (_, i) => i / 20);

describe('vigour t: one value per tile from its strength', () => {
  it('strength 1 gives 0, the top rank gives 1, in between it rises steadily, for maxRank 7 and 9', () => {
    for (const max of [7, 9]) {
      expect(vigour(1, max)).toBe(0);
      expect(vigour(max, max)).toBe(1);
      for (let s = 2; s <= max; s++) expect(vigour(s, max)).toBeGreaterThan(vigour(s - 1, max));
    }
    expect(vigour(5, 9)).toBeCloseTo(0.5, 10);
  });
});

describe('every look parameter moves one way with t', () => {
  it('moss: taller, denser, less soil, more flowers, roots (mostly after 0.6), richer colour', () => {
    for (let i = 1; i < T.length; i++) {
      const a = mossLook(T[i - 1]!);
      const b = mossLook(T[i]!);
      expect(b.blade).toBeGreaterThanOrEqual(a.blade);
      expect(b.density).toBeGreaterThanOrEqual(a.density);
      expect(b.soil).toBeLessThanOrEqual(a.soil);
      expect(b.flowers).toBeGreaterThanOrEqual(a.flowers);
      expect(b.roots).toBeGreaterThanOrEqual(a.roots);
      expect(b.colour).toBeGreaterThanOrEqual(a.colour);
      expect(richness('moss', T[i]!)).toBeGreaterThan(richness('moss', T[i - 1]!));
    }
    expect(mossLook(0)).toMatchObject({ flowers: 0, roots: 0 });
    expect(mossLook(0).soil).toBeGreaterThan(0.4);
    expect(mossLook(0.5).flowers).toBeGreaterThan(0);
    expect(mossLook(0.5).soil).toBeLessThan(0.15);
    expect(mossLook(0.55).roots).toBe(0);
    expect(mossLook(1).roots).toBe(1);
  });

  it('lava: molten 3% to 95%, plates shrink, cracks widen, glow grows', () => {
    expect(lavaLook(0).molten).toBeCloseTo(0.03, 2);
    expect(lavaLook(1).molten).toBeCloseTo(0.95, 2);
    expect(lavaLook(0.5).molten).toBeGreaterThan(0.35);
    expect(lavaLook(0.5).molten).toBeLessThan(0.65);
    for (let i = 1; i < T.length; i++) {
      const a = lavaLook(T[i - 1]!);
      const b = lavaLook(T[i]!);
      expect(b.molten).toBeGreaterThan(a.molten);
      expect(b.plate).toBeLessThan(a.plate);
      expect(b.crack).toBeGreaterThan(a.crack);
      expect(b.glow).toBeGreaterThan(a.glow);
      expect(richness('lava', T[i]!)).toBeGreaterThan(richness('lava', T[i - 1]!));
    }
  });

  it('the same world position always gives the same value; nearby positions differ smoothly', () => {
    for (let i = 0; i < 200; i++) {
      const x = i * 7.31 - 300;
      const y = i * 3.17 - 120;
      expect(wnoise(x, y)).toBe(wnoise(x, y));
      expect(wnoise(x, y)).toBeGreaterThanOrEqual(0);
      expect(wnoise(x, y)).toBeLessThanOrEqual(1);
      expect(Math.abs(wnoise(x + 0.01, y) - wnoise(x, y))).toBeLessThan(0.02);
    }
  });

  // two same-owner tiles side by side, strengths 1 and 9 (t 0 and 1); pointy-top hexes, S = 30
  const tiles = new Map([
    ['0,0', { owner: 0, t: 0 }],
    ['1,0', { owner: 0, t: 1 }],
    ['0,1', { owner: 1, t: 1 }],
  ]);

  it('continuity: at a shared border both sides give the same t; across the border t has no jump', () => {
    // the border between (0,0) and (1,0) is at x = S*sqrt3/2 on y = 0
    const bx = (30 * Math.sqrt(3)) / 2;
    const left = fieldT(bx - 1e-6, 0, tiles);
    const right = fieldT(bx + 1e-6, 0, tiles);
    expect(Math.abs(left - right)).toBeLessThan(1e-3);
    expect(left).toBeCloseTo(0.5, 2);
    let prev = fieldT(0, 0, tiles);
    for (let x = 0; x <= 2 * bx; x += 0.5) {
      const t = fieldT(x, 0, tiles);
      expect(Math.abs(t - prev)).toBeLessThan(0.05);
      expect(t).toBeGreaterThanOrEqual(prev - 1e-9); // rises steadily from the 1 to the 9
      prev = t;
    }
    // far inside each tile its own t holds (the blend band is about a third of a tile)
    expect(fieldT(0, 0, tiles)).toBe(0);
    expect(fieldT(2 * bx, 0, tiles)).toBe(1);
  });

  it('no blending with the other player: moss never takes on a lava t or the other way round', () => {
    // (0,0) moss t=0 touches (0,1) lava t=1 along its lower-right edge
    const p = { x: 0.25 * 30 * Math.sqrt(3), y: 0.75 * 30 };
    expect(fieldT(p.x - 0.5, p.y - 0.5, tiles)).toBe(0);
  });
});

describe('numbers stay readable', () => {
  it('ADVERSARIAL 2: the number meets WCAG AA over the worst texture colour, every material, every t, every palette', () => {
    for (const id of THEME_IDS) {
      for (const t of T) {
        for (const [mat, pal] of [['moss', mossPalette], ['lava', lavaPalette]] as const) {
          const st = numberStyle(mat, t, id);
          for (const px of pal(t, id)) {
            // the plate sits on the texture; the digit sits on the plate
            const under = blend(st.plate, px, st.plateAlpha);
            expect(contrast(st.ink, under), `${id} ${mat} t=${t} over ${px}`).toBeGreaterThanOrEqual(4.5);
          }
        }
      }
    }
  });

  it('the two players stay apart under colour-blind simulation (main material colours)', () => {
    for (const id of THEME_IDS) {
      for (const t of [0, 0.5, 1]) {
        const moss = mossPalette(t, id)[2]!; // the grass body
        const lava = lavaPalette(t, id)[3]!; // the molten lava
        for (const k of ['normal', ...CVD_KINDS] as const) {
          const sim = (c: string) => (k === 'normal' ? c : simulate(c, k));
          expect(deltaE(sim(moss), sim(lava)), `${id} t=${t} ${k}`).toBeGreaterThan(12);
        }
      }
    }
  });

  it('lava never turns yellow or amber (amber is gold)', () => {
    for (const t of T) {
      for (const c of lavaPalette(t, 'soil')) {
        const [r, g, b] = [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)) as [number, number, number];
        if (r - Math.min(g, b) < 40) continue; // greys and near-greys (crust) are fine
        const hue = (Math.atan2(Math.sqrt(3) * (g - b), 2 * r - g - b) * 180) / Math.PI;
        expect(hue, c).toBeLessThan(28);
      }
    }
  });
});

const blend = (top: string, bottom: string, a: number) => {
  const p = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
  const x = p(top);
  const y = p(bottom);
  return '#' + x.map((v, i) => Math.round(v * a + y[i]! * (1 - a)).toString(16).padStart(2, '0')).join('');
};
