/**
 * ONE ROOM: the outcome light covers the whole visible page (owner, 2026-11-20).
 *
 * The opponent's Grow reaction used to show a vertical seam at the board edge on desktop and an
 * unlit strip at the bottom of an iPhone 15 Pro: four local light patches sat ABOVE the full-screen
 * wash and stopped at their own boxes. While a room beat runs, ui/room-light.ts holds
 * `futa04-room-lit` and those patches are hidden, so the SAME colour reaches under the board, the
 * cockpit and the hand through the phone's visible bottom edge.
 *
 * What this suite proves with pixels, not by eye:
 *   - a real move adds the room-light window and removes it when the beat ends;
 *   - at the beat's peak the wash reaches every corner, the board's right edge, the cockpit gap and
 *     the phone's bottom strip with the same colour (a small spread, never a seam or an unlit strip);
 *   - the local patches are hidden only DURING the beat: the resting board keeps them.
 *
 * Screenshots land in docs/screens/room-light/.
 */
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { chromium, webkit } from 'playwright-core';
import { servePreview } from './helpers/preview-port.js';
import { legalActions, viewFor } from '../../src/engine/index.js';

const ios = process.env.ROOM_WEBKIT === '1';
const served = await servePreview(4231, { logLevel: 'silent' });
const browser = await (ios ? webkit : chromium).launch(ios ? {} : {
  ...(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}),
  args: ['--no-sandbox', '--enable-unsafe-swiftshader'],
});
const DIR = 'docs/screens/room-light';
mkdirSync(DIR, { recursive: true });
const check = (ok: boolean, label: string, note = '') => {
  if (!ok) throw new Error(`${label}${note ? ` (${note})` : ''}`);
  console.log(`PASS  ${label}${note ? `  (${note})` : ''}`);
};

try {
  for (const [label, width, height, mobile] of [['desktop', 1440, 900, false], ['iphone-15-pro', 393, 852, true]] as const) {
    const page = await browser.newPage({
      viewport: { width, height }, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: mobile ? 3 : 1,
    });
    await page.addInitScript(() => {
      (window as any).__name = (fn: unknown) => fn;
      localStorage.setItem('main2:severgrow.settings.v1', JSON.stringify({
        sound: false, music: false, coach: false, reduceMotion: false, effects: 'high', speed: 'fast',
      }));
    });
    await page.goto(`${served.url}?seed=3`);
    await page.waitForSelector('#deck.ready');
    await page.locator('#deck').evaluate((el) => (el as HTMLButtonElement).click());
    await page.waitForFunction(() => (window as any).__severgrow.state().phase === 'ACT' && !(window as any).__severgrow.busy());

    // ---- a real move opens and closes the room-light window ----
    const before = await page.evaluate(() => (window as any).__severgrow.state());
    const bloom = legalActions(viewFor(before, 0)).find((action) => action.t === 'Bloom');
    assert(bloom, 'the first turn offers a Bloom to light the room');
    await page.evaluate((action) => (window as any).__severgrow.playFor(action, 0), bloom);
    await page.waitForFunction(() => document.documentElement.classList.contains('futa04-room-lit'), undefined, { timeout: 4000 });
    check(true, `${label}: a real outcome beat opens the room-light window`);
    await page.waitForFunction(() => !document.documentElement.classList.contains('futa04-room-lit'), undefined, { timeout: 4000 });
    check(true, `${label}: the window closes when the beat ends`);
    const resting = await page.evaluate(`(() => ({
      play: getComputedStyle(document.querySelector('#game .play'), '::before').opacity,
      wrap: getComputedStyle(document.querySelector('#game .board-wrap'), '::before').opacity,
      dock: getComputedStyle(document.querySelector('#game .dock'), '::before').opacity,
    }))()`) as { play: string; wrap: string; dock: string };
    check(resting.play !== '0' || resting.wrap !== '0' || resting.dock !== '0',
      `${label}: the resting board keeps its own light patches`, JSON.stringify(resting));

    // ---- the wash at its peak, measured ----
    await page.waitForTimeout(400);
    const plain = await page.screenshot({ path: `${DIR}/${label}-plain.png` });
    const geometry = await page.evaluate(() => {
      const box = (selector: string) => {
        const el = document.querySelector(selector);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height };
      };
      const light = document.getElementById('futa04-outcome-light')!;
      light.dataset.tone = 'bad';
      light.style.opacity = '0.3';
      document.documentElement.classList.add('futa04-room-lit');
      return {
        board: box('#board'), wrap: box('.board-wrap'), cockpit: box('#smart-panel'), hand: box('#hand'),
        bottom: box('.dock'), view: { w: innerWidth, h: innerHeight },
      };
    });
    await page.waitForTimeout(120);
    const lit = await page.screenshot({ path: `${DIR}/${label}-lit.png` });
    const result = await page.evaluate(async ({ plainData, litData, geometry }) => {
      const load = async (src: string) => {
        const image = new Image(); image.src = `data:image/png;base64,${src}`; await image.decode();
        const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
        const context = canvas.getContext('2d')!; context.drawImage(image, 0, 0);
        return { w: canvas.width, h: canvas.height, data: context.getImageData(0, 0, canvas.width, canvas.height).data };
      };
      const [a, b] = await Promise.all([load(plainData), load(litData)]);
      const delta = (x: number, y: number) => {
        const i = (Math.round(y) * a.w + Math.round(x)) * 4;
        return Math.abs(b.data[i]! - a.data[i]!) + Math.abs(b.data[i + 1]! - a.data[i + 1]!)
          + Math.abs(b.data[i + 2]! - a.data[i + 2]!);
      };
      const sx = a.w / geometry.view.w; const sy = a.h / geometry.view.h;
      const spot = (x: number, y: number) => delta(x * sx, y * sy);
      const W = geometry.view.w; const H = geometry.view.h;
      const boardMidY = geometry.board ? (geometry.board.t + geometry.board.b) / 2 : H / 2;
      const edgeX = geometry.wrap ? geometry.wrap.r + 4 : W / 2;
      // Only BACKGROUND points: an opaque hex, card or key paints over the wash by design and would
      // measure its own art, not a seam.
      const bottomStrip = [0.05, 0.25, 0.5, 0.75, 0.95].map((share) => spot(W * share, H - 6));
      const boardEdge = edgeX < W - 3 ? [spot(edgeX, boardMidY - 60), spot(edgeX, boardMidY), spot(edgeX, boardMidY + 60)] : [];
      // The desktop side layout leaves a real gutter between the board's right edge and the cockpit.
      const gutterX = geometry.wrap && geometry.cockpit && geometry.cockpit.l - geometry.wrap.r > 40
        ? (geometry.wrap.r + geometry.cockpit.l) / 2 : null;
      // TWO ROWS of pure background pixels. A seam is a STEP between adjacent pixels, so the test
      // walks each row and looks at the largest neighbour difference, never at a global min/max
      // (the page's own vignette makes a corner legitimately darker than the centre).
      const row = (xs: number[], y: number) => xs.map((x) => spot(x, y));
      const gutterRow = geometry.wrap && geometry.cockpit && geometry.cockpit.l - geometry.wrap.r > 40
        ? row(Array.from({ length: 24 }, (_, i) => geometry.wrap!.r + 3 + i * ((geometry.cockpit!.l - geometry.wrap!.r - 6) / 23)), boardMidY)
        : [];
      const bottomRow = row(Array.from({ length: 40 }, (_, i) => 3 + i * ((W - 6) / 39)), H - 6);
      return {
        size: `${a.w}x${a.h}`,
        corners: [spot(6, 6), spot(W - 7, 6), spot(6, H - 7), spot(W - 7, H - 7)],
        boardEdge, gutterRow, bottomRow,
        cockpitGap: gutterX === null ? [] : [spot(gutterX, 90), spot(gutterX, H / 2), spot(gutterX, H - 90)],
        bottomStrip,
        playOpacity: getComputedStyle(document.querySelector('#game .play')!, '::before').opacity,
        wrapOpacity: getComputedStyle(document.querySelector('#game .board-wrap')!, '::before').opacity,
        dockOpacity: getComputedStyle(document.querySelector('#game .dock')!, '::before').opacity,
        room: document.documentElement.classList.contains('futa04-room-lit'),
        light: (() => { const r = document.getElementById('futa04-outcome-light')!.getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; })(),
      };
    }, { plainData: plain.toString('base64'), litData: lit.toString('base64'), geometry });

    check(result.room && result.light[2]! >= width && result.light[3]! >= height,
      `${label}: the light is one layer over the whole viewport`, `${result.light.join(',')}`);
    const all = [...result.corners, ...result.boardEdge, ...result.cockpitGap, ...result.bottomStrip];
    console.log(`INFO  ${label} points`, JSON.stringify(result));
    const weakest = Math.min(...all);
    check(weakest > 8, `${label}: the colour reaches every measured point (weakest +${weakest})`);
    const step = (values: number[]) => values.length < 2 ? 0 : Math.max(...values.slice(1).map((value, i) => Math.abs(value - values[i]!)));
    for (const [name, values] of [['board-edge gutter', result.gutterRow], ['bottom strip', result.bottomRow]] as const) {
      if (values.length < 2) continue;
      const jump = step(values);
      // A seam was a step of ~8-10 units across a few pixels; one even wash has at most 6 summed
      // over the three channels (under 2 per channel) between neighbours.
      check(jump <= 6, `${label}: no seam along the ${name} (largest neighbour step ${jump})`, JSON.stringify(values));
      check(Math.min(...values) > 8, `${label}: the ${name} is never unlit (weakest +${Math.min(...values)})`);
    }
    check(result.playOpacity === '0' && result.wrapOpacity === '0' && result.dockOpacity === '0',
      `${label}: the local light patches are hidden for the beat`, JSON.stringify([result.playOpacity, result.wrapOpacity, result.dockOpacity]));
    console.log(`INFO  ${label} ${result.size} corners ${result.corners.join(',')} edge ${result.boardEdge.join(',')} bottom ${result.bottomStrip.join(',')}`);
    await page.close();
  }
  console.log('ALL PASS');
} finally {
  await browser.close();
  await served.server.httpServer.close();
}
