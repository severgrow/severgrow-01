// The home paint's viewBox is the brush. The lockup then makes that box as wide as the word,
// so the element edges the browser test measures are the painted edges.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { PAINT_BOX } from '../src/player/planet-lockup.js';

const svg = readFileSync(fileURLToPath(new URL('../src/assets/brand/paint-wordmark.svg', import.meta.url)), 'utf8');

describe('the menu paint fills its box', () => {
  it('the viewBox is the approved brush, with no empty margin', () => {
    expect(PAINT_BOX).toEqual({ x: 27, y: 59, w: 1995, h: 565 });
    expect(svg).toMatch(/viewBox="27 59 1995 565"/);
    const pub = readFileSync(fileURLToPath(new URL('../public/brand/paint-wordmark.svg', import.meta.url)), 'utf8');
    expect(pub).toMatch(/viewBox="27 59 1995 565"/);
    // The bristles are clipped to this geometry, so nothing visible sits outside it.
    const geom = svg.match(/<g id="approved-geometry"[^>]*>(.*?)<\/g>/s)?.[1] ?? '';
    const nums = [...geom.matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));
    const xs = nums.filter((_, i) => i % 2 === 0);
    const ys = nums.filter((_, i) => i % 2 === 1);
    expect(Math.min(...xs)).toBe(PAINT_BOX.x);
    expect(Math.max(...xs)).toBe(PAINT_BOX.x + PAINT_BOX.w);
    expect(Math.min(...ys)).toBe(PAINT_BOX.y);
    expect(Math.max(...ys)).toBe(PAINT_BOX.y + PAINT_BOX.h);
  });
});
