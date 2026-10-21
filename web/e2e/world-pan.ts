// FUTASAKU 0.5 — the Territory map is LARGE, PANS IN BOTH AXES, and has ONE FIT toggle.
//
//   CHANNEL=futa04 VITE_DUEL_API_URL=https://duel-stub.invalid/v1 npm run web:build
//   tsx web/e2e/world-pan.ts [--dist=web/dist]
//
// Owner (2026-10-21): "Keep it large and pannable in both axes, with a 'fit' toggle." What this
// suite proves, at 390x844 and 360x640, with a REAL touch drag (CDP touch events, not mouse):
//   1. the large view draws a cell at >=44px, so every cell answers a tap on its own drawn surface;
//   2. a drag moves the view in BOTH axes and reaches every extreme — at each of the four ends the
//      outermost column/row is FULLY inside the panel (never clipped by its rounded corner) with the
//      map's own pad still visible;
//   3. the page behind never scrolls, during or after a drag (scrollY stays 0, no overflow);
//   4. ONE FIT toggle: keyboard reachable, spoken label, aria-pressed; ON shows the WHOLE 275-cell
//      silhouette inside the panel; OFF restores the exact large view (panning state untouched);
//   5. a tap selects the RIGHT cell — three cells including one at the extreme edge — and a tap that
//      lands between cells (or in FIT mode) still selects the nearest one, never nothing.
//
// A note on the pixel numbers: they are MEASURED from the rendered page, because the large view is
// derived at runtime from the panel's own aspect (world-view.ts `detailFor`). A change to the panel's
// chrome moves them, and that is what the assertions below are for.
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright-core';
import type { Page } from 'playwright-core';
import { serveStaticDist } from './helpers/preview-port.js';
import { WORLD_CELLS } from '../../server/src/world.js';

const opt = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const DIST = resolve(opt('dist') ?? 'web/dist');
const OUT = new URL('../../docs/screens/world/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const { server, url: BASE } = await serveStaticDist(DIST);
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});

const SAMPLE = {
  ok: true,
  world: { version: 2, revision: 5, cost: 100, cells: WORLD_CELLS,
    claims: ['0,0', '1,0', '0,1', '-1,1', '-1,0'].map((cellId, index) => ({
      cellId, ownerId: index % 2 ? 'b' : 'a', ownerName: index % 2 ? 'WillowBirch' : 'BloomHeron',
      ownerTag: index % 2 ? '1002' : '1001', colour: index % 2 ? 'hsl(220 34% 49%)' : 'hsl(80 34% 49%)',
      claimedAt: Date.now() - index * 60_000,
    })) },
};

let failed = 0;
const check = (name: string, ok: boolean, note = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? `  (${note})` : ''}`);
};
const n1 = (value: number) => Number(value.toFixed(1));

type Box = { left: number; top: number; right: number; bottom: number; width: number; height: number };
type Geometry = {
  panel: Box;
  viewBox: [number, number, number, number];
  hex: { width: number; height: number };
  /** Every cell's rendered box, in client coordinates. */
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

/** A REAL touch drag: CDP touch events, so the page sees pointerType 'touch' and pan handlers run. */
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

/**
 * Pan until the map stops moving in the direction asked for: each drag moves the CONTENTS with the
 * finger, so dragging right walks the view towards the map's LEFT edge. Repeated because one drag
 * may not cover the whole surplus (and the clamp is what we want to land on).
 */
const panToEdge = async (page: Page, dx: number, dy: number, panel: Box) => {
  const center = { x: panel.left + panel.width / 2, y: panel.top + panel.height / 2 };
  // Keep the finger inside the panel, so every gesture starts on the map itself.
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

try {
  for (const size of [{ w: 390, h: 844 }, { w: 360, h: 640 }] as const) {
    const tag = `${size.w}x${size.h}`;
    console.log(`\n=== ${tag} ===`);
    const page = await browser.newPage({
      viewport: { width: size.w, height: size.h }, deviceScaleFactor: 2, hasTouch: true, isMobile: true,
    });
    await page.addInitScript(() => localStorage.clear());
    // tsx/esbuild rewrites named inner functions with a `__name` helper that does not exist in the
    // page; define it up front so `page.evaluate` closures with inner arrow functions run.
    await page.addInitScript({ content: 'window.__name = (f) => f;' });
    await page.route('**/v1/world', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SAMPLE) }));
    await page.route('**/v1/seeds/wallet', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      ok: true, wallet: { balance: 150, lifetimeEarned: 150, lifetimeSpent: 0, worldInvitationSeen: true },
    }) }));
    await page.route('**/v1/guests*', (r) => r.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({
      ok: true, token: 'stub-token', player: { id: 'stub', kind: 'guest', displayName: 'StubGuest' }, serverNow: Date.now(),
    }) }));

    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });

    await page.goto(BASE, { waitUntil: 'load' });
    await page.waitForFunction(() => !!(window as unknown as { __severgrow?: unknown }).__severgrow, undefined, { timeout: 20_000 });
    await page.evaluate(() => document.fonts?.ready ?? Promise.resolve()).catch(() => undefined);
    // The lobby is a DYNAMIC import, and it owns the menu entry's click listener plus the map's own
    // copy. Waiting for its FIT label is the honest readiness signal: a click before it lands is not
    // a bug in the map, so the suite must not race it (it did once, at 360x640).
    await page.waitForFunction(() => document.getElementById('online-world-fit')?.textContent === 'FIT', undefined, { timeout: 20_000 });
    await page.click('#menu-world');
    await page.waitForSelector('#online-world-screen:not([hidden])', { timeout: 20_000 });
    await page.locator('.world-hex').first().waitFor({ state: 'attached', timeout: 45_000 });
    await page.waitForTimeout(500);

    // ---- 1. the large view, and the touch target it draws -------------------------------------
    const large = await geometry(page);
    await page.screenshot({ path: join(OUT, `world-pan-large-${tag}.png`) });
    check(`[${tag}] the large view draws a cell at >=44px (a real touch target)`,
      large.hex.width >= 44 && large.hex.height >= 44, `hex ${n1(large.hex.width)}x${n1(large.hex.height)}px`);
    check(`[${tag}] the large view is the window's own aspect (no letterbox, no stretch)`,
      Math.abs(large.viewBox[2] / large.viewBox[3] - large.panel.width / large.panel.height) <= 0.01,
      `viewBox ${(large.viewBox[2] / large.viewBox[3]).toFixed(4)} vs panel ${(large.panel.width / large.panel.height).toFixed(4)}`);
    check(`[${tag}] the large view is CROPPED in both axes (there is somewhere to pan)`,
      large.cells.some((c) => c.left < large.panel.left - 1) && large.cells.some((c) => c.right > large.panel.right + 1) &&
      large.cells.some((c) => c.top < large.panel.top - 1) && large.cells.some((c) => c.bottom > large.panel.bottom + 1),
      'cells extend past the panel on all four sides');

    // ---- 2. both axes pan, to all four extremes ------------------------------------------------
    const start = large.viewBox;
    /** Fully inside the panel on the axis this extreme is not about, so the cell is really on screen. */
    const spans = (cell: { left: number; right: number; top: number; bottom: number }, panel: Box, axis: 'x' | 'y') =>
      axis === 'x' ? cell.top >= panel.top && cell.bottom <= panel.bottom
        : cell.left >= panel.left && cell.right <= panel.right;
    /** The outermost cell that is complete on the other axis: the one a player can actually see. */
    const outermost = (cells: Geometry['cells'], panel: Box, axis: 'x' | 'y', dir: 1 | -1) => {
      const visible = cells.filter((c) => spans(c, panel, axis));
      const pool = visible.length ? visible : cells;
      return pool.reduce((best, c) => {
        const value = axis === 'x' ? (dir > 0 ? c.left : c.right) : (dir > 0 ? c.top : c.bottom);
        const bestValue = axis === 'x' ? (dir > 0 ? best.left : best.right) : (dir > 0 ? best.top : best.bottom);
        return dir > 0 ? (value < bestValue ? c : best) : (value > bestValue ? c : best);
      });
    };
    const LEFT = await panToEdge(page, 1, 0, large.panel);
    const atLeft = await geometry(page);
    check(`[${tag}] a touch drag pans HORIZONTALLY to the left edge`,
      LEFT[0] < start[0] - 1, `viewBox x ${n1(start[0])} -> ${n1(LEFT[0])}`);
    const leftCell = outermost(atLeft.cells, atLeft.panel, 'x', 1);
    check(`[${tag}] at the left extreme the outermost cell is FULLY inside the panel (not clipped)`,
      leftCell.left >= atLeft.panel.left + 6 && leftCell.right <= atLeft.panel.right && leftCell.top >= atLeft.panel.top && leftCell.bottom <= atLeft.panel.bottom,
      `cell ${leftCell.id} at ${n1(leftCell.left - atLeft.panel.left)}px from the border`);

    const RIGHT = await panToEdge(page, -1, 0, large.panel);
    const atRight = await geometry(page);
    check(`[${tag}] a touch drag pans HORIZONTALLY to the right edge`,
      RIGHT[0] > LEFT[0] + 1, `viewBox x ${n1(LEFT[0])} -> ${n1(RIGHT[0])}`);
    const rightCell = outermost(atRight.cells, atRight.panel, 'x', -1);
    check(`[${tag}] at the right extreme the outermost cell is FULLY inside the panel`,
      rightCell.right <= atRight.panel.right - 6 && rightCell.left >= atRight.panel.left,
      `cell ${rightCell.id} at ${n1(atRight.panel.right - rightCell.right)}px from the border`);

    const TOP = await panToEdge(page, 0, 1, large.panel);
    const atTop = await geometry(page);
    check(`[${tag}] a touch drag pans VERTICALLY to the top edge`,
      TOP[1] < atRight.viewBox[1] - 1, `viewBox y ${n1(atRight.viewBox[1])} -> ${n1(TOP[1])}`);
    const topCell = outermost(atTop.cells, atTop.panel, 'y', 1);
    check(`[${tag}] at the top extreme the outermost row is FULLY inside the panel`,
      topCell.top >= atTop.panel.top + 6 && topCell.bottom <= atTop.panel.bottom,
      `cell ${topCell.id} at ${n1(topCell.top - atTop.panel.top)}px from the border`);

    const BOTTOM = await panToEdge(page, 0, -1, large.panel);
    const atBottom = await geometry(page);
    check(`[${tag}] a touch drag pans VERTICALLY to the bottom edge`,
      BOTTOM[1] > TOP[1] + 1, `viewBox y ${n1(TOP[1])} -> ${n1(BOTTOM[1])}`);
    const bottomCell = outermost(atBottom.cells, atBottom.panel, 'y', -1);
    check(`[${tag}] at the bottom extreme the outermost row is FULLY inside the panel`,
      bottomCell.bottom <= atBottom.panel.bottom - 6 && bottomCell.top >= atBottom.panel.top,
      `cell ${bottomCell.id} at ${n1(atBottom.panel.bottom - bottomCell.bottom)}px from the border`);
    check(`[${tag}] both axes moved independently (a two-axis pan, not a diagonal band)`,
      Math.abs(RIGHT[0] - LEFT[0]) > 1 && Math.abs(BOTTOM[1] - TOP[1]) > 1,
      `x span ${n1(RIGHT[0] - LEFT[0])} units, y span ${n1(BOTTOM[1] - TOP[1])} units`);

    // ---- 3. the page behind never scrolls ------------------------------------------------------
    check(`[${tag}] the page never scrolls (scrollY 0, no vertical overflow)`,
      atBottom.scrollY === 0 && atBottom.scrollHeight <= atBottom.innerHeight + 1,
      `scrollY ${atBottom.scrollY}, scrollHeight ${atBottom.scrollHeight} vs ${atBottom.innerHeight}`);
    const overflow = await page.evaluate(() => {
      const panel = document.getElementById('online-world-grid') as HTMLElement;
      return {
        body: getComputedStyle(document.body).overflow,
        overscroll: getComputedStyle(panel).overscrollBehaviorY,
        touch: getComputedStyle(panel).touchAction,
      };
    });
    check(`[${tag}] the map's panel contains its gestures (overscroll-behavior, touch-action)`,
      overflow.overscroll === 'contain' && overflow.touch === 'none', JSON.stringify(overflow));

    // ---- 4. a tap selects the RIGHT cell, including one at the extreme edge -------------------
    // The tap point is read from the CELL's own rendered box, so this is a real finger position.
    const tapCell = async (id: string, label: string) => {
      const before = await geometry(page);
      const cell = before.cells.find((c) => c.id === id);
      if (!cell) return check(`[${tag}] tap ${label}`, false, `${id} is not rendered`);
      // A point 15px off the centre: still comfortably inside the cell's >=44px target.
      const x = (cell.left + cell.right) / 2 + 15;
      const y = (cell.top + cell.bottom) / 2 - 15;
      await page.touchscreen.tap(x, y);
      await page.waitForTimeout(120);
      const selected = await page.evaluate(() => document.querySelector('.world-hex.selected')?.getAttribute('data-cell-id') ?? '');
      check(`[${tag}] a tap 15px off-centre selects the intended cell (${label})`, selected === id, `selected ${selected || 'nothing'}, wanted ${id}`);
    };
    // An edge cell of the silhouette and two cells inside the visible band.
    const edgeCell = bottomCell.id;
    const visible = atBottom.cells
      .filter((c) => c.left > atBottom.panel.left + 8 && c.right < atBottom.panel.right - 8 &&
        c.top > atBottom.panel.top + 70 && c.bottom < atBottom.panel.bottom - 8)
      .map((c) => c.id);
    await tapCell(edgeCell, 'an outer edge cell');
    if (visible[0]) await tapCell(visible[0]!, 'a visible cell');
    if (visible[Math.floor(visible.length / 2)]) await tapCell(visible[Math.floor(visible.length / 2)]!, 'a centre cell');
    // A tap on the panel's own pad (no hex under the finger) still picks the nearest cell.
    const padPoint = { x: atBottom.panel.left + 3, y: atBottom.panel.top + atBottom.panel.height / 2 };
    await page.touchscreen.tap(padPoint.x, padPoint.y);
    await page.waitForTimeout(120);
    const padSelected = await page.evaluate(() => document.querySelector('.world-hex.selected')?.getAttribute('data-cell-id') ?? '');
    check(`[${tag}] a tap in the pad selects the NEAREST cell (never nothing)`, padSelected !== '', `selected ${padSelected || 'nothing'}`);

    // ---- 5. ONE FIT toggle --------------------------------------------------------------------
    const fitButton = page.locator('#online-world-fit');
    check(`[${tag}] the FIT toggle is a labelled, keyboard-reachable button`,
      (await fitButton.count()) === 1 &&
      (await fitButton.evaluate((el) => el.tagName === 'BUTTON' && el.getAttribute('aria-label') !== '' &&
        (el as HTMLButtonElement).tabIndex >= 0 && getComputedStyle(el).visibility === 'visible' &&
        (el as HTMLElement).getBoundingClientRect().height >= 44 &&
        el.getAttribute('aria-pressed') === 'false')),
      await fitButton.getAttribute('aria-label') ?? 'no button');

    // Keyboard first: Enter on the focused button toggles it.
    await fitButton.focus();
    await page.keyboard.press('Enter');
    await page.waitForTimeout(150);
    const fitted = await geometry(page);
    await page.screenshot({ path: join(OUT, `world-pan-fit-${tag}.png`) });
    check(`[${tag}] the keyboard toggles FIT and reports aria-pressed`, (await fitButton.getAttribute('aria-pressed')) === 'true');
    const outside = fitted.cells.filter((c) => c.left < fitted.panel.left || c.right > fitted.panel.right ||
      c.top < fitted.panel.top || c.bottom > fitted.panel.bottom);
    check(`[${tag}] FIT shows the WHOLE silhouette inside the panel`,
      outside.length === 0 && fitted.cells.length === WORLD_CELLS.length,
      `${outside.length} of ${fitted.cells.length} cells outside the panel`);
    check(`[${tag}] FIT draws the whole map small (a preview, as chosen)`,
      fitted.hex.width < large.hex.width * 0.8, `hex ${n1(fitted.hex.width)}px vs ${n1(large.hex.width)}px`);
    // OFF restores the EXACT large view: FIT is a view change, not a reset. Asserted SYNCHRONOUSLY
    // in the page — click, read, click, read — because a background refresh (the map re-reads the
    // world) can re-frame the view between two awaited steps, and that is the refresh's business.
    await fitButton.click();
    await page.waitForTimeout(150);
    const roundTrip = await page.evaluate(() => {
      const svg = document.querySelector('#online-world-grid svg') as SVGSVGElement;
      const button = document.getElementById('online-world-fit') as HTMLButtonElement;
      const before = svg.getAttribute('viewBox') ?? '';
      button.click();
      const fittedBox = svg.getAttribute('viewBox') ?? '';
      button.click();
      const after = svg.getAttribute('viewBox') ?? '';
      return { before, fittedBox, after, pressed: button.getAttribute('aria-pressed') };
    });
    check(`[${tag}] turning FIT off restores the exact large view (pan state untouched)`,
      roundTrip.after === roundTrip.before && roundTrip.fittedBox.split(/\s+/)[2] !== roundTrip.before.split(/\s+/)[2],
      `before ${roundTrip.before}, fit ${roundTrip.fittedBox}, after ${roundTrip.after}`);
    check(`[${tag}] the toggle is back to aria-pressed=false`, roundTrip.pressed === 'false');

    // A PRESSED FIT BUTTON MUST STAY IN THE CORNER (2026-10-21, live regression). The global press
    // feedback adds a `.press-shade` child on the first real click, and a generic
    // `:is(button, …):has(> .press-shade) { position: relative }` used to outrank `.world-fit` and
    // drop the control back into the panel's grid: it took a 44px row, the map lost that height and
    // the large view re-framed 7% wider. Measured after the click above, i.e. in exactly the state
    // that used to break.
    await page.waitForTimeout(250);
    const afterPress = await page.evaluate(() => {
      const panel = document.getElementById('online-world-grid') as HTMLElement;
      const svg = panel.querySelector('svg') as SVGSVGElement;
      const button = document.getElementById('online-world-fit') as HTMLButtonElement;
      const pr = panel.getBoundingClientRect();
      const sr = svg.getBoundingClientRect();
      const vb = (svg.getAttribute('viewBox') ?? '').split(/[\s,]+/).map(Number);
      const br = button.getBoundingClientRect();
      return {
        position: getComputedStyle(button).position,
        rows: getComputedStyle(panel).gridTemplateRows,
        shade: !!button.querySelector('.press-shade'),
        panel: { width: pr.width, height: pr.height, top: pr.top, right: pr.right },
        svg: { width: sr.width, height: sr.height },
        viewAspect: vb[2]! / vb[3]!,
        buttonInCorner: br.top - pr.top < 20 && pr.right - br.right < 20,
      };
    });
    check(`[${tag}] a pressed FIT control stays absolutely positioned in the map's corner`,
      afterPress.position === 'absolute' && afterPress.buttonInCorner,
      `position ${afterPress.position}, in the corner ${afterPress.buttonInCorner}, press-shade ${afterPress.shade}, rows ${afterPress.rows}`);
    check(`[${tag}] the map still fills the panel after a FIT round-trip (no stolen 44px)`,
      Math.abs(afterPress.svg.height - afterPress.panel.height) <= 1 && Math.abs(afterPress.svg.width - afterPress.panel.width) <= 1,
      `svg ${n1(afterPress.svg.width)}x${n1(afterPress.svg.height)} vs panel ${n1(afterPress.panel.width)}x${n1(afterPress.panel.height)}`);
    check(`[${tag}] the restored large view keeps the panel's own aspect`,
      Math.abs(afterPress.viewAspect - afterPress.panel.width / afterPress.panel.height) <= 0.01,
      `view ${afterPress.viewAspect.toFixed(4)} vs panel ${(afterPress.panel.width / afterPress.panel.height).toFixed(4)}`);

    // In FIT mode a tap still selects the nearest cell, never nothing (a preview, but never dead).
    await fitButton.click();
    await page.waitForTimeout(150);
    const fitTap = await page.evaluate(() => {
      const panel = document.getElementById('online-world-grid') as HTMLElement;
      const r = panel.getBoundingClientRect();
      return { x: r.left + r.width * 0.42, y: r.top + r.height * 0.55 };
    });
    await page.touchscreen.tap(fitTap.x, fitTap.y);
    await page.waitForTimeout(120);
    const fitSelected = await page.evaluate(() => document.querySelector('.world-hex.selected')?.getAttribute('data-cell-id') ?? '');
    check(`[${tag}] a tap in FIT mode selects the nearest cell (never nothing)`, fitSelected !== '', `selected ${fitSelected || 'nothing'}`);
    await fitButton.click();
    await page.waitForTimeout(120);

    if (errors.length) console.log('    page errors:', errors.slice(0, 4));
    await page.close();
  }
} finally {
  await browser.close();
  server.close();
}

if (failed) {
  console.error(`\n${failed} world pan/fit checks failed`);
  process.exit(1);
}
console.log('\nThe Territory is large, pans in both axes to every edge, and one FIT toggle shows it whole.');
