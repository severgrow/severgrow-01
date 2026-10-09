// The Smart Cockpit changes the control surface; check its current responsive behavior
// before the engine-facing critical flows instead of the retired board-control geometry.
import './test2-smart-cockpit.js';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
import type { Page } from 'playwright-core';
import { preview } from 'vite';
import { apply, legalActions, viewFor } from '../../src/engine/index.js';
import type { State } from '../../src/engine/index.js';
// Run the focused sort/pile regression after the board-turn suite, before this
// script opens its own preview server on the same port.
await import('./test2-sort-layout.js');
await import('./foundation-restart.js');
const BASE = process.env.TEST2_URL ?? 'http://localhost:4192/';
const server = process.env.TEST2_URL ? null : await preview({ configFile: 'web/vite.config.ts', build: { outDir: process.env.TEST2_DIST ?? 'dist' }, preview: { port: 4192, strictPort: true }, logLevel: 'silent' });
const browser = await chromium.launch({ ...(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}), args: ['--no-sandbox'], ...(process.env.TEST2_URL && process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY } } : {}) });
let checks = 0;
const check = (value: unknown, name: string) => { assert(value, name); checks++; };
const state = (p: Page) => p.evaluate(() => (window as any).__severgrow.state() as State);
const idle = (p: Page) => p.waitForFunction(() => { const h = (window as any).__severgrow; return h && !h.busy() && h.state()?.actor === 0; }, undefined, { timeout: 30000 });
// Fanned cards intentionally overlap. Click a visible piece of the requested card,
// rather than Playwright's centre point, which can belong to the next card.
const clickVisibleCard = async (p: Page, id: number) => {
  const point = await p.locator(`#hand [data-card="${id}"]`).evaluate(el => {
    const r = el.getBoundingClientRect();
    for (const xf of [.08, .2, .35, .5, .7, .9]) for (const yf of [.2, .45, .7, .85]) {
      const x = r.left + r.width * xf, y = r.top + r.height * yf;
      if (document.elementFromPoint(x, y)?.closest('#hand .card') === el) return { x, y };
    }
    return null;
  });
  assert(point, `Card ${id} has an exposed clickable surface`);
  await p.mouse.click(point.x, point.y);
};
mkdirSync('/tmp/main2-shots', { recursive: true });
try {
for (const [w, h] of [[360,640],[390,664],[390,844],[430,932],[768,1024],[1280,800],[1440,900],[1600,980],[1920,1080]]) {
  const phone = w! <= 600;
  const page = await browser.newPage({ viewport: { width: w!, height: h! }, hasTouch: phone, isMobile: phone, ignoreHTTPSErrors: Boolean(process.env.TEST2_URL) });
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => {
    (window as any).__name = (f: unknown) => f;
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem('severgrow.save.v7', 'MAIN-SENTINEL');
    localStorage.setItem('test:severgrow.save.v7', 'TEST-SENTINEL');
    localStorage.setItem('main2:severgrow.settings.v1', JSON.stringify({ sound: false, music: false, coach: false, speed: 'fast', reduceMotion: true, autoSkip: false, confirmPolicy: 'always' }));
  });
  await page.goto(BASE+'?seed=219682080&lab=1&design=1&tools=1');
  await idle(page); await page.waitForTimeout(600);
  check(await page.locator('#board g.hex-cell').count() === 37, `${w}: Classic geometry`);
  check(await page.locator('#menu-lab,#menu-design,#sheet-lab,.design-v2-board').count() === 0, `${w}: tools cannot open`);
  check(await page.evaluate(() => document.documentElement.classList.contains('test-typography-v2')), `${w}: typography`);
  check(await page.evaluate(() => document.documentElement.dataset.guide === 'full'), `${w}: Full guidance`);
  check(await page.evaluate(p => Boolean(document.documentElement.dataset.thumb) === p, phone), `${w}: phone policy`);
  check(await page.locator('#tool-weak,#tool-targets').count() === 0, `${w}: weak buttons removed`);
  let before = await state(page);
  await page.click('#deck'); await idle(page);
  let grown = await state(page);
  check(grown.phase === 'ACT', `${w}: actual draw enters Grow`);
  check(JSON.stringify(grown) === JSON.stringify(apply(before, { t:'Draw', from:'deck' })), `${w}: draw matches engine`);
  const action = legalActions(viewFor(grown,0)).find(a=>a.t==='Sprout');
  assert(action?.t === 'Sprout');
  await clickVisibleCard(page, action.card);
  const key = `${action.coord.q},${action.coord.r}`;
  const target = page.locator(`#board g.hex-cell[data-key="${key}"]`);
  const box = await target.boundingBox(); assert(box);
  await page.screenshot({ path: `/tmp/main2-shots/${w}x${h}-grow.png` });
  const hit = await page.evaluate(([x,y]) => document.elementFromPoint(x!,y!)?.closest('g.hex-cell')?.getAttribute('data-key'), [box.x+box.width/2,box.y+box.height/2]);
  if (hit !== key) console.log(await page.evaluate(([x,y]) => ({hit: document.elementFromPoint(x!,y!)?.outerHTML.slice(0,200),vb: document.querySelector('#board')?.getAttribute('viewBox'),wrap: document.querySelector('#board-wrap')?.getBoundingClientRect().toJSON(),under:getComputedStyle(document.querySelector('#board-wrap')!).getPropertyValue('--cam-under')}), [box.x+box.width/2,box.y+box.height/2]));
  check(hit === key, `${w}: seed219682080 legal target receives hit (${hit})`);
  const legalKeys = legalActions(viewFor(grown,0)).flatMap(a => a.t==='Sprout' && a.card===action.card ? [`${a.coord.q},${a.coord.r}`] : []);
  const obscured = await page.evaluate(keys => {
    const tip=document.querySelector('#first-tip'); if(!tip || (tip as HTMLElement).hidden) return [];
    const r=tip.getBoundingClientRect();
    const overlaps=(el:Element)=>{const b=el.getBoundingClientRect();return b.width && r.left<b.right && r.right>b.left && r.top<b.bottom && r.bottom>b.top;};
    return [...keys.filter(k=>{const el=document.querySelector(`#board .hex-cell[data-key="${k}"]`);return el&&overlaps(el);}), ...[...document.querySelectorAll('#board .landmark')].filter(overlaps).map(e=>'home:'+e.getAttribute('data-key'))];
  },legalKeys);
  check(obscured.length===0,`${w}: tip leaves all playable hexes and both homes clear (${obscured})`);
  await target.click();
  await idle(page);
  check(JSON.stringify(await state(page)) === JSON.stringify(apply(grown, action)), `${w}: first valid target tap places exact action`);
  await target.click(); await idle(page);
  check(JSON.stringify(await state(page)) === JSON.stringify(apply(grown, action)), `${w}: repeated target tap cannot duplicate the action`);
  check(await page.locator('#board .mark-line,#board .mark-ink').count() === 0, `${w}: artwork communicates ownership without shapes`);
  await page.click('#tool-undo'); await idle(page);
  check(JSON.stringify(await state(page)) === JSON.stringify(grown), `${w}: Undo restores exact state`);
  await page.keyboard.press('Escape');
  await page.locator('#smart-context').click();
  if (await page.locator('#smart-selector').isVisible()) await page.locator('#smart-selector button[data-action^="skip:"]').first().click();
  await idle(page);
  check((await state(page)).phase === 'DISCARD', `${w}: end Grow enters Throw`);
  before = await state(page);
  const discard = legalActions(viewFor(before,0)).find(a=>a.t==='Discard'); assert(discard?.t==='Discard');
  const throwCard = page.locator(`#hand [data-card="${discard.card}"]`);
  await clickVisibleCard(page, discard.card);
  check(JSON.stringify(await state(page)) === JSON.stringify(before), `${w}: selecting Throw leaves engine state unchanged`);
  check(await throwCard.evaluate(el => el.classList.contains('test2-throw-picked') && getComputedStyle(el).filter === 'grayscale(1)'), `${w}: Throw selection is enlarged and colorless`);
  await clickVisibleCard(page, discard.card);
  await page.waitForTimeout(100);
  check((await state(page)).history!.some(e => e.t === 'Discard' && e.card === discard.card), `${w}: actual card throw`);
  await idle(page);
  const saved = await state(page);
  await page.evaluate(() => history.replaceState(null, '', location.pathname));
  await page.reload(); await page.waitForTimeout(500);
  await page.click('#menu-continue'); await idle(page);
  check(JSON.stringify(await state(page)) === JSON.stringify(saved), `${w}: resume after turn`);
  await page.click('#hud-menu');
  check(await page.locator('#gm-turn').textContent(), `${w}: Pause retains turn info`);
  check(await page.locator('#gm-score-you').textContent() !== null, `${w}: Pause retains scores`);
  await page.screenshot({ path: `/tmp/main2-shots/${w}x${h}-pause.png` });
  const sentinels = await page.evaluate(() => [localStorage.getItem('severgrow.save.v7'),localStorage.getItem('test:severgrow.save.v7')]);
  // getItem is prefixed after boot; inspect actual keys through enumeration.
  const raw = await page.evaluate(() => ({ ...localStorage }));
  check(raw['severgrow.save.v7'] === 'MAIN-SENTINEL' && raw['test:severgrow.save.v7'] === 'TEST-SENTINEL', `${w}: saves preserved`);
  void sentinels;
  check(errors.length === 0, `${w}: console ${errors.join(' | ')}`);
  console.log(`${w}x${h}: critical flow passed`);
  await page.close();
}
console.log(`${checks} candidate checks passed`);
} finally { await browser.close(); server?.httpServer.close(); }
