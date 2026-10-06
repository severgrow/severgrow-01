// Test2's V3 look: the critical flow in V3 at phone and desktop sizes (build with CHANNEL=test2).
//   CHANNEL=test2 npm run web:build && npx tsx web/e2e/test2-v3.ts
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import type { Page } from 'playwright-core';
import { preview } from 'vite';
import { apply, legalActions, viewFor } from '../../src/engine/index.js';
import type { State } from '../../src/engine/index.js';

const server = await preview({ configFile: 'web/vite.config.ts', preview: { port: 4193, strictPort: true }, logLevel: 'silent' });
const browser = await chromium.launch({ ...(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}), args: ['--no-sandbox'] });
let checks = 0;
const check = (v: unknown, name: string) => {
  assert(v, name);
  checks++;
};
const state = (p: Page) => p.evaluate(() => (window as any).__severgrow.state() as State);
const idle = (p: Page) => p.waitForFunction(() => { const h = (window as any).__severgrow; return h && !h.busy() && h.state()?.actor === 0; }, undefined, { timeout: 30000 });
try {
  for (const [w, h, dpr] of [[390, 844, 3], [1440, 900, 2]] as const) {
    const phone = w <= 600;
    const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, hasTouch: phone, isMobile: phone });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    page.on('response', (r) => r.status() >= 400 && errors.push(`${r.status()} ${r.url()}`));
    await page.addInitScript(() => {
      (window as any).__name = (f: unknown) => f;
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      localStorage.setItem('main2:severgrow.settings.v1', JSON.stringify({ sound: false, music: false, coach: false, speed: 'fast', reduceMotion: true, autoSkip: false, confirmPolicy: 'always' }));
    });
    await page.goto('http://localhost:4193/?seed=219682080&design=v3');
    await idle(page);
    // Ground painting and asset decoding are asynchronous, especially under CI load.
    await page.waitForFunction(() => !!document.querySelector('#board pattern[id$="skin-ground"] image')?.getAttribute('href'), undefined, { timeout: 30000 });
    await page.waitForFunction(() => document.querySelectorAll('#board .landmark.skin-has-art').length === 2, undefined, { timeout: 30000 });
    const info = await page.evaluate(() => {
      const svg = document.querySelector('#board') as SVGSVGElement;
      return { skin: svg.dataset.skin, tier: svg.dataset.tier, ground: !!svg.querySelector('pattern[id$="skin-ground"] image')?.getAttribute('href'), cells: svg.querySelectorAll('g.hex-cell').length, homes: svg.querySelectorAll('.landmark.skin-has-art').length };
    });
    check(info.skin === 'forest-volcano-v3', `${w}: V3 board`);
    check(info.cells === 37, `${w}: Classic geometry`);
    check(info.ground, `${w}: ground painted`);
    // freshness: every V3 picture on the board is drawn from memory (preloaded) or a content-addressed URL
    // (file?v=<hash>), so no browser or offline cache can show a stale or missing one
    const art = await page.evaluate(() => [...document.querySelectorAll('#board image')].map((i) => i.getAttribute('href') ?? '').filter((h) => h.startsWith('blob:') || h.includes('design-v3')));
    check(art.length > 0 && art.every((h) => h.startsWith('blob:') || /\?v=[0-9a-f]{10}$/.test(h)), `${w}: V3 art from memory or content-addressed (${art.length})`);
    check(info.homes === 2, `${w}: both V3 homes`);
    check(info.tier === (phone ? 'lo' : 'lo') || info.tier === 'hi', `${w}: a tier (${info.tier})`);
    const before = await state(page);
    await page.click('#deck');
    await idle(page);
    const grown = await state(page);
    check(JSON.stringify(grown) === JSON.stringify(apply(before, { t: 'Draw', from: 'deck' })), `${w}: draw matches engine`);
    const action = legalActions(viewFor(grown, 0)).find((a) => a.t === 'Sprout');
    assert(action?.t === 'Sprout');
    await page.locator(`#hand [data-card="${action.card}"]`).click();
    const target = page.locator(`#board g.hex-cell[data-key="${action.coord.q},${action.coord.r}"]`);
    await target.click();
    await idle(page);
    check(JSON.stringify(await state(page)) === JSON.stringify(apply(grown, action)), `${w}: first valid tap places the exact action in V3`);
    check((await page.locator('#board .skin-tile .mark-line, #board .skin-tile .mark-ink').count()) === 0, `${w}: V3 artwork carries ownership without shapes`);
    await page.click('#tool-undo');
    await idle(page);
    check(JSON.stringify(await state(page)) === JSON.stringify(grown), `${w}: Undo restores exact state`);
    await page.screenshot({ path: `/tmp/main2-shots/v3-${w}x${h}.png` });
    check(errors.length === 0, `${w}: no errors (${errors.join(' | ')})`);
    // the menu option leaves V3
    await page.evaluate(() => (document.querySelector('#menu-v3') as HTMLElement).click());
    await page.waitForLoadState('load');
    await page.waitForTimeout(1500);
    check(await page.evaluate(() => !(document.querySelector('#board') as SVGSVGElement).dataset.skin && !location.search.includes('design=v3')), `${w}: Leave V3 returns to the normal look`);
    await page.close();
  }
  console.log(`${checks} V3 checks passed`);
} finally {
  await browser.close();
  server.httpServer.close();
}
