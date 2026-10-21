// TEMPORARY live check — verifies the deployed Territory map on the real site.
//   PW_CHROMIUM=... npx tsx web/e2e/live-world-verify.ts [--base=https://www.futasaku.com/]
// Not a committed suite: the committed proof of the pan/fit behaviour is web/e2e/world-pan.ts.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import type { Page } from 'playwright-core';

const opt = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const BASE = opt('base') ?? 'https://www.futasaku.com/';
const OUT = '/Users/patryk/sg-polish2/docs/screens/0.6';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
let failed = 0;
const check = (name: string, ok: boolean, note = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? `  (${note})` : ''}`);
};
const n1 = (v: number) => Number(v.toFixed(1));

type Box = { left: number; top: number; right: number; bottom: number; width: number; height: number };
type Geometry = {
  panel: Box;
  viewBox: [number, number, number, number];
  hex: { width: number; height: number };
  cells: { id: string; left: number; top: number; right: number; bottom: number }[];
  scrollY: number;
  scrollHeight: number;
  innerHeight: number;
};

const geometry = (page: Page): Promise<Geometry> => page.evaluate(() => {
  const panel = document.getElementById('online-world-grid') as HTMLElement;
  const svg = panel.querySelector('svg') as SVGSVGElement;
  const rect = panel.getBoundingClientRect();
  const vb = (svg.getAttribute('viewBox') ?? '').split(/[\s,]+/).map(Number);
  const hexes = [...panel.querySelectorAll('.world-hex')] as SVGGraphicsElement[];
  const boxes = hexes.map((h) => {
    const r = h.getBoundingClientRect();
    return { id: h.getAttribute('data-cell-id') ?? '', left: r.left, top: r.top, right: r.right, bottom: r.bottom };
  });
  const one = hexes[0]!.getBoundingClientRect();
  return {
    panel: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height },
    viewBox: [vb[0]!, vb[1]!, vb[2]!, vb[3]!],
    hex: { width: one.width, height: one.height },
    cells: boxes,
    scrollY: window.scrollY,
    scrollHeight: document.scrollingElement?.scrollHeight ?? 0,
    innerHeight: window.innerHeight,
  };
});

const touchDrag = async (page: Page, from: { x: number; y: number }, to: { x: number; y: number }, steps = 12) => {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: from.x, y: from.y }] });
  for (let step = 1; step <= steps; step++) {
    const x = from.x + (to.x - from.x) * step / steps;
    const y = from.y + (to.y - from.y) * step / steps;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(40);
  await cdp.detach();
};

const panToEdge = async (page: Page, dx: number, dy: number, panel: Box) => {
  const center = { x: panel.left + panel.width / 2, y: panel.top + panel.height / 2 };
  const reach = Math.min(panel.width, panel.height) * 0.32;
  const unit = Math.hypot(dx, dy) || 1;
  const step = { x: dx / unit * reach, y: dy / unit * reach };
  for (let i = 0; i < 14; i++) {
    const before = (await geometry(page)).viewBox;
    await touchDrag(page, { x: center.x - step.x, y: center.y - step.y }, { x: center.x + step.x, y: center.y + step.y });
    const after = (await geometry(page)).viewBox;
    if (Math.abs(after[0] - before[0]) < 0.25 && Math.abs(after[1] - before[1]) < 0.25) return after;
  }
  return (await geometry(page)).viewBox;
};

const spans = (cell: { left: number; right: number; top: number; bottom: number }, panel: Box, axis: 'x' | 'y') =>
  axis === 'x' ? cell.top >= panel.top && cell.bottom <= panel.bottom
    : cell.left >= panel.left && cell.right <= panel.right;
const outermost = (cells: Geometry['cells'], panel: Box, axis: 'x' | 'y', dir: 1 | -1) => {
  const visible = cells.filter((c) => spans(c, panel, axis));
  const pool = visible.length ? visible : cells;
  return pool.reduce((best, c) => {
    const value = axis === 'x' ? (dir > 0 ? c.left : c.right) : (dir > 0 ? c.top : c.bottom);
    const bestValue = axis === 'x' ? (dir > 0 ? best.left : best.right) : (dir > 0 ? best.top : best.bottom);
    return dir > 0 ? (value < bestValue ? c : best) : (value > bestValue ? c : best);
  });
};

try {
  for (const size of [{ w: 390, h: 844 }, { w: 360, h: 640 }] as const) {
    const tag = `${size.w}x${size.h}`;
    console.log(`\n=== ${tag} ===`);
    const page = await browser.newPage({
      viewport: { width: size.w, height: size.h }, deviceScaleFactor: 2, hasTouch: true, isMobile: true,
    });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });

    await page.goto(BASE, { waitUntil: 'load' });
    await page.waitForFunction(() => !!(window as unknown as { __severgrow?: unknown }).__severgrow, undefined, { timeout: 30_000 });
    await page.waitForFunction(() => document.getElementById('online-world-fit')?.textContent === 'FIT', undefined, { timeout: 30_000 });
    const build = await page.evaluate(async () => {
      const r = await fetch('./BUILD_SHA', { cache: 'no-store' });
      return r.ok ? (await r.text()).trim() : '(none)';
    }).catch(() => '(none)');
    console.log(`live BUILD_SHA: ${build}`);
    await page.click('#menu-world');
    await page.waitForSelector('#online-world-screen:not([hidden])', { timeout: 30_000 });
    await page.locator('.world-hex').first().waitFor({ state: 'attached', timeout: 60_000 });
    await page.waitForTimeout(700);

    const large = await geometry(page);
    await page.screenshot({ path: join(OUT, `live-world-large-${tag}.png`) });
    check(`[${tag}] the large view draws a cell at >=44px (a real touch target)`,
      large.hex.width >= 44 && large.hex.height >= 44, `hex ${n1(large.hex.width)}x${n1(large.hex.height)}px`);
    check(`[${tag}] the large view is CROPPED in both axes (there is somewhere to pan)`,
      large.cells.some((c) => c.left < large.panel.left - 1) && large.cells.some((c) => c.right > large.panel.right + 1) &&
      large.cells.some((c) => c.top < large.panel.top - 1) && large.cells.some((c) => c.bottom > large.panel.bottom + 1),
      'cells extend past the panel on all four sides');

    const start = large.viewBox;
    const LEFT = await panToEdge(page, 1, 0, large.panel);
    const atLeft = await geometry(page);
    const leftCell = outermost(atLeft.cells, atLeft.panel, 'x', 1);
    check(`[${tag}] a REAL touch drag pans HORIZONTALLY to the left edge`, LEFT[0] < start[0] - 1,
      `viewBox x ${n1(start[0])} -> ${n1(LEFT[0])}`);
    check(`[${tag}] at the left extreme the outermost cell is FULLY inside the panel`,
      leftCell.left >= atLeft.panel.left + 6 && leftCell.right <= atLeft.panel.right &&
      leftCell.top >= atLeft.panel.top && leftCell.bottom <= atLeft.panel.bottom,
      `cell ${leftCell.id} at ${n1(leftCell.left - atLeft.panel.left)}px from the border`);

    const RIGHT = await panToEdge(page, -1, 0, large.panel);
    const atRight = await geometry(page);
    const rightCell = outermost(atRight.cells, atRight.panel, 'x', -1);
    check(`[${tag}] a REAL touch drag pans HORIZONTALLY to the right edge`, RIGHT[0] > LEFT[0] + 1,
      `viewBox x ${n1(LEFT[0])} -> ${n1(RIGHT[0])}`);
    check(`[${tag}] at the right extreme the outermost cell is FULLY inside the panel`,
      rightCell.right <= atRight.panel.right - 6 && rightCell.left >= atRight.panel.left,
      `cell ${rightCell.id} at ${n1(atRight.panel.right - rightCell.right)}px from the border`);

    const TOP = await panToEdge(page, 0, 1, large.panel);
    const atTop = await geometry(page);
    const topCell = outermost(atTop.cells, atTop.panel, 'y', 1);
    check(`[${tag}] a REAL touch drag pans VERTICALLY to the top edge`, TOP[1] < atRight.viewBox[1] - 1,
      `viewBox y ${n1(atRight.viewBox[1])} -> ${n1(TOP[1])}`);
    check(`[${tag}] at the top extreme the outermost row is FULLY inside the panel`,
      topCell.top >= atTop.panel.top + 6 && topCell.bottom <= atTop.panel.bottom,
      `cell ${topCell.id} at ${n1(topCell.top - atTop.panel.top)}px from the border`);

    const BOTTOM = await panToEdge(page, 0, -1, large.panel);
    const atBottom = await geometry(page);
    const bottomCell = outermost(atBottom.cells, atBottom.panel, 'y', -1);
    check(`[${tag}] a REAL touch drag pans VERTICALLY to the bottom edge`, BOTTOM[1] > TOP[1] + 1,
      `viewBox y ${n1(TOP[1])} -> ${n1(BOTTOM[1])}`);
    check(`[${tag}] at the bottom extreme the outermost row is FULLY inside the panel`,
      bottomCell.bottom <= atBottom.panel.bottom - 6 && bottomCell.top >= atBottom.panel.top,
      `cell ${bottomCell.id} at ${n1(atBottom.panel.bottom - bottomCell.bottom)}px from the border`);
    check(`[${tag}] both axes pan independently`,
      Math.abs(RIGHT[0] - LEFT[0]) > 1 && Math.abs(BOTTOM[1] - TOP[1]) > 1,
      `x span ${n1(RIGHT[0] - LEFT[0])} units, y span ${n1(BOTTOM[1] - TOP[1])} units`);

    check(`[${tag}] the page behind never scrolls (scrollY 0, no overflow)`,
      atBottom.scrollY === 0 && atBottom.scrollHeight <= atBottom.innerHeight + 1,
      `scrollY ${atBottom.scrollY}, scrollHeight ${atBottom.scrollHeight} vs ${atBottom.innerHeight}`);

    // ---- a tap selects the RIGHT edge cell, on a >=44px target --------------------------------
    const tapCell = bottomCell;
    const tapPoint = { x: (tapCell.left + tapCell.right) / 2, y: Math.max(tapCell.top + 6, (tapCell.top + tapCell.bottom) / 2) };
    await page.touchscreen.tap(tapPoint.x, tapPoint.y);
    await page.waitForTimeout(350);
    const selected = await page.evaluate(() => document.querySelector('.world-hex.selected')?.getAttribute('data-cell-id') ?? null);
    check(`[${tag}] a tap selects the RIGHT cell (an edge cell)`, selected === tapCell.id,
      `selected ${selected}, wanted ${tapCell.id}, target ${n1(tapCell.right - tapCell.left)}x${n1(tapCell.bottom - tapCell.top)}px`);

    // ---- FIT toggle shows the whole silhouette, then restores the large pannable view ----------
    const beforeFit = (await geometry(page)).viewBox;
    await page.click('#online-world-fit');
    await page.waitForTimeout(400);
    const fit = await geometry(page);
    await page.screenshot({ path: join(OUT, `live-world-fit-${tag}.png`) });
    const outside = fit.cells.filter((c) => c.left < fit.panel.left - 1 || c.right > fit.panel.right + 1 ||
      c.top < fit.panel.top - 1 || c.bottom > fit.panel.bottom + 1).length;
    check(`[${tag}] FIT shows the WHOLE silhouette inside the panel`, outside === 0, `${outside} of ${fit.cells.length} cells outside`);
    check(`[${tag}] FIT draws the whole map small (a preview)`, fit.hex.width < large.hex.width - 5,
      `hex ${n1(fit.hex.width)}px vs ${n1(large.hex.width)}px`);
    const pressed = await page.getAttribute('#online-world-fit', 'aria-pressed');
    check(`[${tag}] the FIT toggle reports aria-pressed=true`, pressed === 'true', String(pressed));
    await page.click('#online-world-fit');
    await page.waitForTimeout(400);
    const afterFit = (await geometry(page)).viewBox;
    check(`[${tag}] turning FIT off restores the exact large view`,
      JSON.stringify(afterFit) === JSON.stringify(beforeFit), `${JSON.stringify(beforeFit)} -> ${JSON.stringify(afterFit)}`);
    await page.screenshot({ path: join(OUT, `live-world-large-after-fit-${tag}.png`) });

    check(`[${tag}] no page errors`, errors.length === 0, errors.slice(0, 3).join(' | '));
    if (errors.length) console.log('  errors:', errors);
    await page.close();
  }
} finally {
  await browser.close();
}

console.log(`\n${failed === 0 ? 'ALL LIVE CHECKS PASSED' : `${failed} LIVE CHECKS FAILED`}`);
if (failed) process.exit(1);
