import { describe, expect, it } from 'vitest';
import { CLEAR_ZONE, inClearZone, materialsOf } from '../src/logic/materials.js';
import { GRASS_LEVELS, GRASS_VARIANTS, LAVA_LEVELS, LAVA_VARIANTS, PHOTO_SPAN, grassImage, hexDist, lavaImage, lavaLevel } from '../src/logic/photo.js';
import { THEMES, THEME_IDS, contrast, resolveColors } from '../src/logic/themes.js';

const SIZE = 96; // smaller than the game's images, so the tests stay quick
const m = materialsOf('soil').colors;

/** Tile units (radius 1, y down) of pixel (i, j). */
const at = (i: number, j: number) => ({ x: ((i + 0.5) / SIZE) * 2 * PHOTO_SPAN - PHOTO_SPAN, y: ((j + 0.5) / SIZE) * 2 * PHOTO_SPAN - PHOTO_SPAN });
const hex = (r: number, g: number, b: number) => '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
const each = (px: Uint8ClampedArray, fn: (p: { x: number; y: number }, c: string, a: number, rgb: [number, number, number]) => void) => {
  for (let j = 0; j < SIZE; j++)
    for (let i = 0; i < SIZE; i++) {
      const k = (j * SIZE + i) * 4;
      fn(at(i, j), hex(px[k]!, px[k + 1]!, px[k + 2]!), px[k + 3]!, [px[k]!, px[k + 1]!, px[k + 2]!]);
    }
};
const sum = (px: Uint8ClampedArray) => px.reduce((s, v, i) => (s + v * ((i % 7) + 1)) % 1000000007, 0);
const lum = ([r, g, b]: [number, number, number]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
/** Molten: clearly red-orange and bright (crust is dark and grey). */
const molten = ([r, g, b]: [number, number, number]) => r > 150 && r > g * 1.35 && r > b * 2;

describe('photo-like materials, painted in code', () => {
  it('the same variant always paints the same pixels; variants differ', () => {
    expect(sum(lavaImage(SIZE, 0, 1, m))).toBe(sum(lavaImage(SIZE, 0, 1, m)));
    expect(sum(grassImage(SIZE, 0, 1, m))).toBe(sum(grassImage(SIZE, 0, 1, m)));
    const lavas = new Set(Array.from({ length: LAVA_VARIANTS }, (_, v) => sum(lavaImage(SIZE, v, 1, m))));
    const grasses = new Set(Array.from({ length: GRASS_VARIANTS }, (_, v) => sum(grassImage(SIZE, v, 1, m))));
    expect(lavas.size).toBe(LAVA_VARIANTS);
    expect(grasses.size).toBe(GRASS_VARIANTS);
  });

  it('strength picks the glow level: 1-3 low, 4-6 middle, 7-9 high', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9].map(lavaLevel)).toEqual([0, 0, 0, 1, 1, 1, 2, 2, 2]);
    expect(LAVA_LEVELS).toBe(3);
  });

  it('ADVERSARIAL: no molten glow under the number or the marker, at any level, in any variant; the light number stays readable on every pixel there', () => {
    for (let v = 0; v < LAVA_VARIANTS; v++)
      for (let lv = 0; lv < LAVA_LEVELS; lv++)
        each(lavaImage(SIZE, v, lv, m), (p, c, a, rgb) => {
          if (!inClearZone(p.x, p.y)) return;
          expect(a).toBe(255);
          expect(molten(rgb), `v${v} l${lv} ${c}`).toBe(false);
          expect(contrast(m.fireInk, c), `v${v} l${lv} ${c}`).toBeGreaterThanOrEqual(4.5);
        });
  });

  it('lava: dried at 1-3, glowing at 4-6, burning at 7-9', () => {
    for (let v = 0; v < LAVA_VARIANTS; v++) {
      const glow = (lv: number) => {
        let n = 0;
        each(lavaImage(SIZE, v, lv, m), (_p, _c, a, rgb) => (n += a > 200 && molten(rgb) ? 1 : 0));
        return n;
      };
      const [g0, g1, g2] = [glow(0), glow(1), glow(2)];
      // 1-3: mostly dried, cooled lava (hardly anything bright), 4-6 glowing cracks, 7-9 lots
      expect(g0).toBeLessThan(SIZE * SIZE * 0.01);
      expect(g1).toBeGreaterThan(SIZE * SIZE * 0.02);
      expect(g2).toBeGreaterThan(g1 * 1.5);
      // even dried lava keeps faint embers (deep, dim red) in its cracks
      let embers = 0;
      each(lavaImage(SIZE, v, 0, m), (_p, _c, a, [r, g, b]) => (embers += a > 200 && r > 70 && r > g * 1.7 && r > b * 1.7 && r < 190 ? 1 : 0));
      expect(embers).toBeGreaterThan(SIZE * SIZE * 0.01);
    }
  });

  it('lava: lumpy 3D crust lit from the top-left, nothing outside the hex', () => {
    const px = lavaImage(SIZE, 1, 0, m);
    const crust: number[] = [];
    let tl = 0;
    let tln = 0;
    let br = 0;
    let brn = 0;
    each(px, (p, _c, a, rgb) => {
      if (hexDist(p.x, p.y) > 1.02) expect(a, 'outside the hex').toBe(0);
      if (hexDist(p.x, p.y) > 0.8 || molten(rgb)) return;
      const l = lum(rgb);
      crust.push(l);
      if (p.x < -0.15 && p.y < -0.15) (tl += l), tln++;
      if (p.x > 0.15 && p.y > 0.15) (br += l), brn++;
    });
    const mean = crust.reduce((s, v) => s + v, 0) / crust.length;
    const sd = Math.sqrt(crust.reduce((s, v) => s + (v - mean) ** 2, 0) / crust.length);
    expect(sd, 'texture, not a flat fill').toBeGreaterThan(6);
    expect(tl / tln, 'lit from the top-left').toBeGreaterThan(br / brn);
  });

  it('grass: dense (no holes inside), a fluffy fringe past the edge but not far, textured', () => {
    for (let v = 0; v < GRASS_VARIANTS; v++) {
      let inside = 0;
      let solid = 0;
      let fringe = 0;
      const ls: number[] = [];
      each(grassImage(SIZE, v, 1, m), (p, _c, a, rgb) => {
        const d = hexDist(p.x, p.y);
        if (d < 0.95) {
          inside++;
          if (a === 255) solid++;
          ls.push(lum(rgb));
        }
        if (d > 1.02 && a > 60) fringe++;
        if (d > 1.16) expect(a, `v${v} too far out`).toBe(0);
      });
      expect(solid / inside).toBeGreaterThan(0.98);
      // plenty of blades spill past the edge, so neighbouring tiles overlap into one lawn
      expect(fringe, 'blades spill past the edge').toBeGreaterThan(SIZE * 1.2);
      const mean = ls.reduce((s, x) => s + x, 0) / ls.length;
      const sd = Math.sqrt(ls.reduce((s, x) => s + (x - mean) ** 2, 0) / ls.length);
      expect(sd, 'blades, not a flat fill').toBeGreaterThan(10);
    }
  });

  it('ADVERSARIAL: the dark number on grass stays readable in every palette: a light halo, and calm grass under it', () => {
    for (const id of THEME_IDS) {
      const mc = materialsOf(id).colors;
      const yi = resolveColors(THEMES[id]).youInk;
      // the halo drawn round the number and the marker
      expect(contrast(yi, mc.mossTop), `${id} halo`).toBeGreaterThanOrEqual(4.5);
      for (let v = 0; v < GRASS_VARIANTS; v++)
      for (let lv = 0; lv < GRASS_LEVELS; lv++) {
        const cs: number[] = [];
        each(grassImage(SIZE, v, lv, mc), (p, c) => {
          // where the number itself sits (the marker below it has its own halo)
          if (Math.abs(p.x) <= 0.3 && p.y >= -0.4 && p.y <= 0.25) cs.push(contrast(yi, c));
        });
        cs.sort((a, b) => a - b);
        const avg = cs.reduce((s, x) => s + x, 0) / cs.length;
        expect(avg, `${id} v${v} l${lv} average`).toBeGreaterThanOrEqual(4.5);
        // even the darkest shadows between blades are clearly lighter than the ink
        expect(cs[Math.floor(cs.length * 0.02)]!, `${id} v${v} l${lv} darkest 2%`).toBeGreaterThanOrEqual(2.5);
      }
    }
    expect(CLEAR_ZONE.top).toBeLessThan(0);
  });

  it('stronger grass is bushier, with more flowers and other small plants', () => {
    for (let v = 0; v < GRASS_VARIANTS; v++) {
      const stats = [0, 1, 2].map((lv) => {
        let fringe = 0;
        let bloom = 0;
        let leafy = 0;
        each(grassImage(SIZE, v, lv, m), (p, _c, a, [r, g, b]) => {
          if (hexDist(p.x, p.y) > 1.02 && a > 60) fringe++;
          if (a > 200 && ((r > 200 && g > 160 && b < 110) || (r > 160 && g < 90 && b < 90) || (r > 225 && g > 225 && b > 215))) bloom++;
          // clover and broad leaves: a cooler, bluer green than the blades
          if (a > 200 && b > r * 2 && g > 80) leafy++;
        });
        return { fringe, bloom, leafy };
      });
      expect(stats[2]!.fringe, `v${v} bushier`).toBeGreaterThan(stats[0]!.fringe);
      expect(stats[2]!.bloom, `v${v} more flowers`).toBeGreaterThan(stats[0]!.bloom);
      expect(stats[2]!.leafy, `v${v} more plants`).toBeGreaterThan(stats[0]!.leafy);
    }
  });

  it('grass is a flat lawn, not a bump: the middle, the edge and every side are about as bright', () => {
    for (let v = 0; v < GRASS_VARIANTS; v++) {
      const zones: Record<string, number[]> = { mid: [], ring: [], tl: [], br: [] };
      each(grassImage(SIZE, v, 1, m), (p, _c, a, rgb) => {
        const d = hexDist(p.x, p.y);
        if (a < 255 || d > 0.9) return;
        const l = lum(rgb);
        if (d < 0.35) zones.mid!.push(l);
        if (d > 0.6) zones.ring!.push(l);
        if (d > 0.4 && p.x < 0 && p.y < 0) zones.tl!.push(l);
        if (d > 0.4 && p.x > 0 && p.y > 0) zones.br!.push(l);
      });
      const avg = (k: string) => zones[k]!.reduce((s, x) => s + x, 0) / zones[k]!.length;
      expect(Math.abs(avg('mid') - avg('ring')) / avg('mid'), `v${v} middle vs edge`).toBeLessThan(0.12);
      expect(Math.abs(avg('tl') - avg('br')) / avg('tl'), `v${v} top-left vs bottom-right`).toBeLessThan(0.12);
    }
  });

  it('small yellow and red flowers once in a while: some tiles have them, some have none, never many', () => {
    let withYellow = 0;
    let withRed = 0;
    let bare = 0;
    for (let v = 0; v < GRASS_VARIANTS; v++) {
      let yellow = 0;
      let red = 0;
      each(grassImage(SIZE, v, 1, m), (p, _c, a, [r, g, b]) => {
        if (a < 200) return;
        if (r > 200 && g > 160 && b < 110) yellow++;
        if (r > 160 && g < 90 && b < 90) {
          red++;
          expect(inClearZone(p.x, p.y), 'no flower on the number').toBe(false);
        }
      });
      expect(red).toBeLessThan(SIZE * SIZE * 0.006);
      if (yellow > 0) withYellow++;
      if (red > 0) withRed++;
      if (yellow === 0 && red === 0) bare++;
    }
    expect(withYellow).toBeGreaterThan(0);
    expect(withRed).toBeGreaterThan(0);
    expect(bare).toBeGreaterThan(0);
  });

  it('flowers stay small and rare: no amber patches that could read as gold', () => {
    for (let v = 0; v < GRASS_VARIANTS; v++) {
      let yellow = 0;
      each(grassImage(SIZE, v, 1, m), (_p, _c, a, [r, g, b]) => (yellow += a > 0 && r > 200 && g > 170 && b < 120 ? 1 : 0));
      expect(yellow).toBeLessThan(SIZE * SIZE * 0.01);
    }
  });
});
