// EVERY GOLD FRAME LOOK, ON A REAL BOARD (owner, 2026-11-15: "before pushing test every gold tile
// rotation option - some of them are landing literally outside the board").
//
// A bonus hex's frame wears one of 24 looks — 2 designs x 6 turns x 2 mirrors — so "every" means all
// 24, not a sample, and it means measuring the RENDERED shape rather than re-checking the transform
// maths on paper: for each look this suite maps the frame's own painted outline (read out of the
// atlas's alpha channel, which is what actually gets painted) through the live CTM and holds it
// inside the cell's own hexagon, on real OUTER-RING bonus hexes (the only cells a frame sits on, so
// a frame that leaves its hex also leaves the board).
//
// Two shapes of board matter and both are covered by the geometry: the 0.4 product draws a flat
// lattice, and the 0.5 line (`CHANNEL=futa05`, what /test/ serves — `FEATURES.space`) bends every
// cell on the Territory globe's curve, which moves a cell's six corners by up to two degrees and two
// per cent. Point FUTA04_DIST at a `CHANNEL=futa05` build to run this guard against that board too.
//
// It also pins the guarantee itself: every frame is clipped to its own cell hexagon
// (`clip-path` = `hexPath(key, S)`), so nothing a frame paints — metal or its warm glow — can leave
// the cell, at any look, even if the art or the board changes later.
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
import type { Page } from 'playwright-core';
import { servePreview, closePreview } from './helpers/preview-port.js';

const DIR = process.env.SHOT_DIR ?? '/tmp/gold-frames';
mkdirSync(DIR, { recursive: true });
const served = process.env.FUTA04_URL ? null : await servePreview(0, { build: { outDir: process.env.FUTA04_DIST ?? 'dist' }, logLevel: 'silent' });
const BASE = process.env.FUTA04_URL ?? served!.url;
const browser = await chromium.launch({
  ...(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}),
  args: ['--no-sandbox'],
});
let checks = 0;
const check = (value: unknown, name: string) => { assert(value, name); checks++; };

/** One page's worth of frame measurements: where each framed hex's frame sits, and its cell. */
const measure = async (page: Page) => page.evaluate(() => {
  const frames = [...document.querySelectorAll<SVGGElement>('#board .l-rich-frames .gold-frame')];
  const cells: Record<string, number[][]> = {};
  for (const cell of [...document.querySelectorAll('#board .hex-cell')]) {
    const p = cell.querySelector('path')!;
    const m = p.getScreenCTM()!;
    cells[cell.getAttribute('data-key')!] = [...p.getAttribute('d')!.matchAll(/(-?[\d.]+),(-?[\d.]+)/g)]
      .map((mm) => { const q = new DOMPoint(+mm[1]!, +mm[2]!).matrixTransform(m); return [q.x, q.y]; });
  }
  return {
    href: frames[0]?.querySelector('image')?.getAttribute('href') ?? '',
    cells,
    frames: frames.map((f) => {
      const art = f.querySelector<SVGSVGElement>('.gold-frame-art')!;
      // the clip path is the cell's own hexagon (`hexPath(key, S)`), in BOARD units: map it through
      // the frame group's own CTM to screen px
      const clipEl = f.querySelector('clipPath path') as SVGPathElement | null;
      const cm = clipEl?.getScreenCTM() ?? null;
      const cellPts = clipEl && cm ? [...clipEl.getAttribute('d')!.matchAll(/(-?[\d.]+),(-?[\d.]+)/g)]
        .map((mm) => { const q = new DOMPoint(+mm[1]!, +mm[2]!).matrixTransform(cm); return [q.x, q.y]; }) : null;
      return {
        key: f.getAttribute('data-key')!, variant: Number(f.getAttribute('data-variant')),
        clip: f.getAttribute('clip-path'),
        clipPath: clipEl?.getAttribute('d') ?? null,
        cellPts,
        x: Number(art.getAttribute('x')), y: Number(art.getAttribute('y')),
        w: Number(art.getAttribute('width')), h: Number(art.getAttribute('height')),
        viewBox: art.getAttribute('viewBox'),
      };
    }),
  };
});

/** The atlas outline, read in the page from the very picture the frames draw. */
const atlasOutlines = async (page: Page, href: string) => page.evaluate(async (src) => {
  const img = new Image();
  img.src = src;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = img.naturalWidth; c.height = img.naturalHeight;
  const g = c.getContext('2d')!;
  g.drawImage(img, 0, 0);
  const data = g.getImageData(0, 0, c.width, c.height).data;
  // the two atlas boxes (ui/forestAshData.ts `l`): a 600 px wide hexagon each
  const boxes = [[10.21, 10.28, 600, 519.62], [630.16, 10.1, 600, 519.62]];
  const out: Record<string, { cx: number; cy: number; radii: number[] }> = {};
  for (let b = 0; b < boxes.length; b++) {
    const [bx, by, bw, bh] = boxes[b] as [number, number, number, number];
    const cx = bx + bw / 2, cy = by + bh / 2;
    const radii = new Array(360).fill(0);
    for (let y = Math.floor(by); y < Math.ceil(by + bh); y++) {
      for (let x = Math.floor(bx); x < Math.ceil(bx + bw); x++) {
        if (data[(y * c.width + x) * 4 + 3]! <= 8) continue;
        const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
        const d = ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360;
        const r = Math.hypot(dx, dy);
        if (r > radii[Math.floor(d)]!) radii[Math.floor(d)] = r;
      }
    }
    // an empty degree bin (the art has no pixel in that exact degree) takes its neighbour's
    for (let i = 0; i < 360; i++) if (!(radii[i]! > 0)) radii[i] = radii[(i + 359) % 360]! || 300;
    out[String(b)] = { cx, cy, radii };
  }
  return out;
}, href);

/** Signed distance past a convex polygon, positive = outside. */
const outside = (x: number, y: number, poly: number[][]): number => {
  let area = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!, b = poly[(i + 1) % poly.length]!;
    area += a[0]! * b[1]! - b[0]! * a[1]!;
  }
  const flip = area > 0 ? 1 : -1;
  let worst = -Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!, b = poly[(i + 1) % poly.length]!;
    const nx = b[1]! - a[1]!, ny = -(b[0]! - a[0]!);
    worst = Math.max(worst, (((x - a[0]!) * nx + (y - a[1]!) * ny) / Math.hypot(nx, ny)) * flip);
  }
  return worst;
};

const LOOKS = Array.from({ length: 24 }, (_, id) => ({ id, design: id % 2, mirror: (Math.floor(id / 2) % 2) as 0 | 1, rotation: Math.floor(id / 4) }));
const n = (v: number) => Math.round(v * 1e6) / 1e6;
/** The shipped transform (`ui/goldframes.ts` `goldLookMatrix`), for one look about a centre. */
const lookMatrix = (look: { rotation: number; mirror: number }, x: number, y: number, pointy: boolean): string => {
  if (!pointy && look.rotation === 0 && look.mirror === 0) return '';
  const r = ((look.rotation * 60 + (pointy ? -30 : 0)) * Math.PI) / 180;
  const c = Math.cos(r), s = Math.sin(r);
  const a = look.mirror ? -c : c, b = look.mirror ? -s : s;
  return `matrix(${n(a)} ${n(b)} ${n(-s)} ${n(c)} ${n(x - (a * x - s * y))} ${n(y - (b * x + c * y))})`;
};
const BOXES = [[10.21, 10.28, 600, 519.62], [630.16, 10.1, 600, 519.62]] as const;

try {
  for (const [w, h] of [[320, 568], [390, 844], [430, 932], [1280, 800]] as const) {
    for (const seed of [1, 5]) {
      const phone = w <= 600;
      const page = await browser.newPage({ viewport: { width: w, height: h }, hasTouch: phone, isMobile: phone });
      try {
        await page.addInitScript(() => {
          (window as any).__name = (f: unknown) => f;
          localStorage.setItem('main2:severgrow.settings.v1', JSON.stringify({ coach: false, sound: false, music: false, reduceMotion: true, speed: 'skip' }));
        });
        await page.goto(`${BASE}?seed=${seed}`, { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => document.querySelectorAll('#board .l-rich-frames .gold-frame').length >= 2, undefined, { timeout: 60_000 });
        await page.waitForTimeout(900);
        const world = await measure(page) as any;
        check(world.frames.length >= 2, `${w}x${h} seed ${seed}: outer-ring bonus hexes wear frames`);
        const outlines = await atlasOutlines(page, world.href);
        const cellOf = world.cells as Record<string, number[][]>;
        const firstCell = cellOf[world.frames[0]!.key]!;
        const c0 = [firstCell.reduce((a, p) => a + p[0]!, 0) / 6, firstCell.reduce((a, p) => a + p[1]!, 0) / 6];
        const pointy = firstCell.some(([x, y]) => {
          const a = ((Math.atan2(y! - c0[1]!, x! - c0[0]!) * 180) / Math.PI + 360) % 360;
          return Math.abs(a - 90) < 1 || Math.abs(a - 270) < 1;
        });

        let worstLook = -Infinity;
        for (const frame of world.frames) {
          // THE GUARANTEE: the frame is clipped to its own cell hexagon, so nothing it paints can
          // leave it — not the metal, not the glow.
          check(/^url\(#.+\)$/.test(frame.clip ?? ''), `${w}x${h} ${frame.key}: the frame is clipped to a cell hexagon`);
          check(typeof frame.clipPath === 'string' && frame.clipPath.length > 20, `${w}x${h} ${frame.key}: the clip is the cell's own hexagon`);
          // The clip IS the cell: the board draws the cell's inner path at S - 1.2 (`hexPath`), so the
          // clip's hexagon must be that path grown to S (30/28.8), corner for corner.
          const cell = frame.cellPts as number[][];
          check(cell?.length === 6, `${w}x${h} ${frame.key}: the clip is a hexagon`);
          const inset = cellOf[frame.key]!;
          const centre = [cell.reduce((a, p) => a + p[0]!, 0) / 6, cell.reduce((a, p) => a + p[1]!, 0) / 6];
          const ic = [inset.reduce((a, p) => a + p[0]!, 0) / 6, inset.reduce((a, p) => a + p[1]!, 0) / 6];
          for (let i = 0; i < 6; i++) {
            const rClip = Math.hypot(cell[i]![0]! - centre[0]!, cell[i]![1]! - centre[1]!);
            const rInset = Math.hypot(inset[i]![0]! - ic[0]!, inset[i]![1]! - ic[1]!);
            check(Math.abs(rClip / rInset - 30 / 28.8) < 0.01, `${w}x${h} ${frame.key}: the clip is the cell (corner ${i})`);
          }
          const radius = Math.max(...cell.map(([x, y]) => Math.hypot(x! - centre[0]!, y! - centre[1]!)));

          for (const look of LOOKS) {
            const cx = frame.x + frame.w / 2, cy = frame.y + frame.h / 2;
            const box = BOXES[look.design]!;
            const pts = await page.evaluate(({ key, transform, viewBox, atlasCx, atlasCy, radii }) => {
              const art = document.querySelector<SVGSVGElement>(`#board .l-rich-frames .gold-frame[data-key="${key}"] .gold-frame-art`)!;
              const turned = art.parentElement as unknown as SVGGElement;
              if (transform) turned.setAttribute('transform', transform); else turned.removeAttribute('transform');
              art.setAttribute('viewBox', viewBox);
              void turned.getBoundingClientRect();
              const m = art.querySelector('image')!.getScreenCTM()!;
              const out: number[][] = [];
              for (let d = 0; d < 360; d += 3) {
                const a = (d * Math.PI) / 180;
                const p = new DOMPoint(atlasCx + radii[d]! * Math.cos(a), atlasCy + radii[d]! * Math.sin(a)).matrixTransform(m);
                out.push([p.x, p.y]);
              }
              return out;
            }, {
              key: frame.key,
              transform: lookMatrix(look, cx, cy, pointy),
              viewBox: `${box[0]! - 6} ${box[1]! - 6} ${box[2]! + 12} ${box[3]! + 12}`,
              atlasCx: box[0]! + box[2]! / 2, atlasCy: box[1]! + box[3]! / 2,
              radii: outlines[String(look.design)]!.radii,
            });
            const worst = Math.max(...pts.map(([x, y]) => outside(x!, y!, cell)));
            worstLook = Math.max(worstLook, worst / radius);
            check(worst <= 1e-6,
              `${w}x${h} ${frame.key} look ${look.id} (design ${look.design}, turn ${look.rotation}, mirror ${look.mirror}) paints ${(worst / radius * 100).toFixed(2)}% past its own hex`);
          }
        }
        console.log(`${w}x${h} seed ${seed}: ${world.frames.length} framed hexes, 24 looks each, worst ${(worstLook * 100).toFixed(2)}% (negative = inside the hex)`);
        await page.screenshot({ path: `${DIR}/${w}x${h}-seed${seed}.png` });
      } finally {
        await page.close();
      }
    }
  }
  console.log(`${checks} gold-frame checks passed (24 looks x ${4} viewports x 2 seeds, every framed hex)`);
} finally {
  await browser.close();
  if (served) await closePreview(served.server);
}
