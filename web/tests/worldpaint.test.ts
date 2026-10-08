// Material pass 2: the world-space painter. Deterministic, safe to redraw in parts, the look
// rises with strength, neighbours match, no bleed between the players, dead tiles keep their
// structure. (Small paints at scale 1 to keep the tests quick.)
import { describe, expect, it } from 'vitest';
import { paintRect, rectFor } from '../src/logic/worldpaint.js';
import type { PaintTile } from '../src/logic/worldpaint.js';
import { BLEND, S, centreOf, vigour } from '../src/logic/vigour.js';

/** Mirrors REACH in ui/worldlayer.ts (that file needs a browser canvas, so it is not imported). */
const REACH = BLEND / 2 + S * 0.4 + 1;

const board = (entries: [string, PaintTile][]) => new Map(entries);
const inp = (tiles: Map<string, PaintTile>) => ({ tiles, palette: 'soil' as const, detail: 'normal' as const });
const px = (data: Uint8ClampedArray, w: number, x: number, y: number) => {
  const k = (y * w + x) * 4;
  return [data[k]!, data[k + 1]!, data[k + 2]!, data[k + 3]!];
};
/** Share of a tile's pixels matching a test, painted on its own. */
const share = (tile: PaintTile, test: (r: number, g: number, b: number) => boolean) => {
  const tiles = board([['0,0', tile]]);
  const r = rectFor(['0,0'], 1, 0);
  const d = paintRect(inp(tiles), r);
  let n = 0;
  let hit = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    n++;
    if (test(d[i]!, d[i + 1]!, d[i + 2]!)) hit++;
  }
  return hit / n;
};
const soilish = (r: number, g: number, b: number) => r > g && r - b > 15 && g < 130;
const molten = (r: number, g: number, b: number) => r > 150 && r > g * 1.6 && r > b * 1.8;

describe('the world painter', () => {
  const tiles = board([
    ['0,0', { owner: 0, t: 0 }],
    ['1,0', { owner: 0, t: 1 }],
    ['0,1', { owner: 1, t: 0.5 }],
    ['1,1', { owner: 1, t: 1 }],
  ]);

  it('the same board always gives the same pixels', () => {
    const r = rectFor(['0,0', '1,0', '0,1', '1,1'], 1);
    expect(Buffer.from(paintRect(inp(tiles), r)).equals(Buffer.from(paintRect(inp(tiles), r)))).toBe(true);
  });

  it('a partial redraw gives exactly the pixels of a full repaint (so redrawing only what changed is safe)', () => {
    const full = rectFor(['0,0', '1,0', '0,1', '1,1'], 1);
    const all = paintRect(inp(tiles), full);
    const part = rectFor(['1,0'], 1, 4);
    const sub = paintRect(inp(tiles), part);
    const ox = Math.round((part.x0 - full.x0) * full.scale);
    const oy = Math.round((part.y0 - full.y0) * full.scale);
    let checked = 0;
    for (let y = 0; y < part.h; y++)
      for (let x = 0; x < part.w; x++) {
        const fx = x + ox;
        const fy = y + oy;
        if (fx < 0 || fy < 0 || fx >= full.w || fy >= full.h) continue;
        expect(px(sub, part.w, x, y)).toEqual(px(all, full.w, fx, fy));
        checked++;
      }
    expect(checked).toBeGreaterThan(1000);
  });

  it('moss: even low strength reads as a lawn; lava: the molten share rises from about 3% to most of it', () => {
    const soil = [1, 5, 9].map((s) => share({ owner: 0, t: vigour(s, 9) }, soilish));
    const grass = [1, 5, 9].map((s) => share({ owner: 0, t: vigour(s, 9) }, (r, g, b) => g > r * 1.08 && g > b * 1.2));
    expect(soil[0]!).toBeGreaterThan(soil[1]!);
    expect(grass[0]!).toBeGreaterThan(0.8);
    expect(grass[1]!).toBeGreaterThan(0.8);
    expect(grass[2]!).toBeGreaterThan(0.8);
    expect(soil[0]!).toBeLessThan(0.2);
    expect(soil[2]!).toBeLessThan(0.08);
    const hot = [1, 5, 9].map((s) => share({ owner: 1, t: vigour(s, 9) }, molten));
    expect(hot[0]!).toBeLessThan(0.1);
    expect(hot[1]!).toBeGreaterThan(hot[0]!);
    expect(hot[2]!).toBeGreaterThan(hot[1]!);
    expect(hot[2]!).toBeGreaterThan(0.6);
  });

  it('ADVERSARIAL 3: top-rank lava next to moss: no lava colour on the moss side, no grass on the lava side', () => {
    const pair = board([['0,0', { owner: 0, t: 1 }], ['1,0', { owner: 1, t: 1 }]]);
    const r = rectFor(['0,0', '1,0'], 1, 0);
    const d = paintRect(inp(pair), r);
    const bx = (S * Math.sqrt(3)) / 2; // the shared border
    for (let y = 0; y < r.h; y++)
      for (let x = 0; x < r.w; x++) {
        const [R, G, B, A] = px(d, r.w, x, y);
        if (!A) continue;
        const wx = r.x0 + x + 0.5;
        if (wx < bx - 1.5) expect(molten(R!, G!, B!), `moss pixel ${x},${y}`).toBe(false);
        if (wx > bx + 1.5) expect(G! > R! && G! > 110, `lava pixel ${x},${y}`).toBe(false);
      }
  });

  it('ADVERSARIAL 1: a strength-1 tile beside a top-rank tile of the same owner: no seam at the border', () => {
    const pair = board([['0,0', { owner: 1, t: 0 }], ['1,0', { owner: 1, t: 1 }]]);
    const r = rectFor(['0,0', '1,0'], 1, 0);
    const d = paintRect(inp(pair), r);
    const bx = Math.round(centreOf(0, 0).x + (S * Math.sqrt(3)) / 2 - r.x0);
    // compare the average colour of thin strips just left and just right of the border, row by row
    let worst = 0;
    for (let y = Math.round(-S * 0.4 - r.y0); y < Math.round(S * 0.4 - r.y0); y++) {
      const a = px(d, r.w, bx - 2, y);
      const b = px(d, r.w, bx + 1, y);
      worst = Math.max(worst, Math.abs(a[0]! - b[0]!) + Math.abs(a[1]! - b[1]!) + Math.abs(a[2]! - b[2]!));
    }
    // neighbouring pixels across the border differ no more than the texture does anyway
    expect(worst).toBeLessThan(180);
  });

  it('ADVERSARIAL 6: a cut-off tile keeps its structure (a dead 9 is still denser than a dead 1) but reads as dead', () => {
    // structure = fine detail: how much each pixel differs from its right-hand neighbour
    const detail = (tile: PaintTile) => {
      const r = rectFor(['0,0'], 1, 0);
      const d = paintRect(inp(board([['0,0', tile]])), r);
      let sum = 0;
      let n = 0;
      for (let y = 0; y < r.h; y++)
        for (let x = 0; x + 1 < r.w; x++) {
          const a = px(d, r.w, x, y);
          const b = px(d, r.w, x + 1, y);
          if (!a[3] || !b[3]) continue;
          sum += Math.abs(a[0]! - b[0]!) + Math.abs(a[1]! - b[1]!) + Math.abs(a[2]! - b[2]!);
          n++;
        }
      return sum / n;
    };
    const dead9 = detail({ owner: 0, t: 1, dead: true });
    const dead1 = detail({ owner: 0, t: 0, dead: true });
    const alive9 = share({ owner: 0, t: 1 }, (r, g) => g > r + 20);
    const deadGreen = share({ owner: 0, t: 1, dead: true }, (r, g) => g > r + 20);
    expect(alive9).toBeGreaterThan(0.5);
    expect(deadGreen).toBeLessThan(0.05); // no living green left
    expect(dead9).toBeGreaterThan(dead1); // a dried 9 is still bushier than a dried 1
    const coolHot = share({ owner: 1, t: 1, dead: true }, molten);
    expect(coolHot).toBe(0); // cooled lava: no glow
  });

  it('ADVERSARIAL 4: maxRank 7 and 9 both give the fullest look at the top', () => {
    expect(vigour(7, 7)).toBe(1);
    expect(vigour(9, 9)).toBe(1);
    const a = paintRect(inp(board([['0,0', { owner: 1, t: vigour(7, 7) }]])), rectFor(['0,0'], 1, 0));
    const b = paintRect(inp(board([['0,0', { owner: 1, t: vigour(9, 9) }]])), rectFor(['0,0'], 1, 0));
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
  });

  it('ADVERSARIAL 5: after one tile changes, every pixel beyond REACH of it is exactly as before (repainting only that area leaves nothing stale)', () => {
    // a ring of full-strength moss (long roots and blades) around the centre, and lava beside it
    const ring = ['1,0', '1,-1', '0,-1', '-1,0', '-1,1', '0,1'];
    const before = board([...ring.map((k) => [k, { owner: 0, t: 1 }] as [string, PaintTile]), ['2,0', { owner: 1, t: 0.6 }], ['2,-1', { owner: 1, t: 1 }]]);
    const cases: [string, Map<string, PaintTile>][] = [
      ['a new tile in the middle', new Map([...before, ['0,0', { owner: 0, t: 1 }]])],
      ['a neighbour strengthened', new Map([...before, ['1,0', { owner: 0, t: 0.2 }]])],
      ['a lava tile cooled', new Map([...before, ['2,0', { owner: 1, t: 0.6, dead: true }]])],
      ['a tile removed', new Map([...before].filter(([k]) => k !== '0,1'))],
    ];
    const all = rectFor([...before.keys(), '0,0', '2,0', '2,-1'], 1, 0);
    const a = paintRect(inp(before), all);
    for (const [name, after] of cases) {
      const changedKey = [...new Set([...before.keys(), ...after.keys()])].find((k) => JSON.stringify(before.get(k)) !== JSON.stringify(after.get(k)))!;
      const zone = rectFor([changedKey], 1, REACH);
      const b = paintRect(inp(after), all);
      let differs = 0;
      let inside = 0;
      for (let y = 0; y < all.h; y++)
        for (let x = 0; x < all.w; x++) {
          const wx = all.x0 + x + 0.5;
          const wy = all.y0 + y + 0.5;
          const same = px(a, all.w, x, y).join() === px(b, all.w, x, y).join();
          if (wx >= zone.x0 && wx < zone.x0 + zone.w && wy >= zone.y0 && wy < zone.y0 + zone.h) inside += same ? 0 : 1;
          else if (!same) differs++;
        }
      expect(differs, name).toBe(0);
      expect(inside, `${name}: the change shows`).toBeGreaterThan(50);
    }
  });
});
