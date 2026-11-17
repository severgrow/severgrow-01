// THE DESKTOP LAYOUT SURVIVES A MINIMISE (owner, 2026-11-17: "on desktop if you minimise the window, and
// then open in full again - the whole layout breaks"). A window that passes through another size (a
// minimise, a fullscreen change, a narrow drag) must come back to exactly the layout a fresh page draws
// at the final size. Before the fix the board ended up to 215 px right and the cockpit 240 px high.
//
//   node --import tsx web/e2e/desktop-resize-restore.ts   (after a futa05 build in web/dist)
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import type { Page } from 'playwright-core';
import { productFixture } from './helpers/product-fixture.js';

const fixture = await productFixture();
const browser = await chromium.launch({ ...(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}), args: ['--no-sandbox'] });
const PATH = process.env.RESTORE_PATH ?? '/test/';
const PREFIX = PATH === '/test/' ? 'futa05-test:' : 'futa05:';
const geom = (p: Page) => p.evaluate(() => {
  const r = (s: string) => { const b = document.querySelector(s)?.getBoundingClientRect(); return b ? [b.x, b.y, b.width, b.height] : null; };
  return { layout: document.documentElement.dataset.layout ?? '', board: r('#board'), hand: r('#hand'), box: r('#futa04-box') };
});
const open = async (w: number, h: number) => {
  const p = await browser.newPage({ viewport: { width: w, height: h } });
  await p.addInitScript((prefix: string) => { (window as any).__name = (f: unknown) => f; localStorage.setItem(`${prefix}severgrow.seen`, '1'); }, PREFIX);
  await p.goto(`${fixture.origin}${PATH}?seed=4242`);
  await p.waitForFunction(() => !!(window as any).__severgrow?.state?.(), undefined, { timeout: 30000 });
  await p.waitForFunction(() => { const r = document.getElementById('starter-lottery'); return !r || r.hidden; }, undefined, { timeout: 20000 }).catch(() => undefined);
  await p.waitForTimeout(1500);
  return p;
};
let failed = 0;
try {
  for (const [W, H] of [[1440, 900], [1280, 800], [1920, 1080]] as const) {
    const fresh = await open(W, H);
    const ref = await geom(fresh);
    await fresh.close();
    const trips: [string, [number, number, number][]][] = [
      ['a minimise (tiny, then back)', [[W, H - 87, 30], [200, 100, 30], [W, H, 30]]],
      ['minimised for two seconds', [[1, 1, 2000], [W, H, 30]]],
      ['a narrow window, then full again', [[600, H, 200], [W, H, 40]]],
      ['fullscreen out and in', [[W, H - 87, 50], [W, H, 50]]],
    ];
    for (const [name, steps] of trips) {
      const p = await open(W, H);
      for (const [w, h, wait] of steps) { await p.setViewportSize({ width: w, height: h }); await p.waitForTimeout(wait); }
      await p.waitForTimeout(2000);
      const g = await geom(p);
      await p.close();
      const off = Math.max(...(['board', 'hand', 'box'] as const).flatMap((k) => (g[k] ?? [9e9]).map((v, i) => Math.abs(v - (ref[k]?.[i] ?? -9e9)))));
      const ok = g.layout === ref.layout && off <= 4;
      if (!ok) failed++;
      console.log(`${ok ? 'PASS' : 'FAIL'}  ${W}x${H}: after ${name} the layout matches a fresh page (${off.toFixed(1)} px off)`);
    }
  }
} finally { await browser.close(); await fixture.close(); }
assert.equal(failed, 0, `${failed} desktop restore checks failed`);
