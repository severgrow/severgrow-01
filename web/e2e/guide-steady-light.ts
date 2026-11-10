// THE GUIDE'S STEADY LIGHT (owner, 2026-11-10: "once how to play is clicked, it'll show the windows
// first and then highlight always until it's toggled off"). A practice game with every window
// already seen and the switch on: the move to make carries the still gold outline on each step of the
// player's turn, a possible Bloom lights the Bloom key, and the switch turns it all off.
// Run: node --import tsx web/e2e/guide-steady-light.ts   (serves web/dist: CHANNEL=futa04 build)
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { servePreview } from './helpers/preview-port.js';

const out = process.env.SHOTS ?? '/tmp/guide-steady-light';
mkdirSync(out, { recursive: true });
const served = await servePreview(4197, { logLevel: 'silent' });
const browser = await chromium.launch({ ...(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}), args: ['--no-sandbox'] });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.addInitScript(() => { (window as any).__name = (f: unknown) => f; });
  await page.goto(served.url);
  await page.waitForFunction(() => !!(window as any).__severgrow);
  // Every window already seen, and the switch on (the page's own storage, so its channel prefix applies).
  await page.evaluate(() => {
    localStorage.setItem('severgrow.guide.v1', JSON.stringify({ seen: ['draw', 'grow', 'throw', 'draw-choice', 'strengthen', 'cut', 'bloom', 'bomb', 'blast', 'skip', 'win'], games: 5 }));
    localStorage.setItem('severgrow.guide.on.v1', '1');
  });
  await page.goto(`${served.url}?seed=219682080`);
  await page.waitForFunction(() => { const h = (window as any).__severgrow; return !!h?.state() && !h.busy(); }, undefined, { timeout: 30000 });
  await page.waitForFunction(() => { const h = (window as any).__severgrow; return h.state().actor === 0 && !h.busy(); }, undefined, { timeout: 30000 });
  // My Draw: the Draw pile is lit; no window (all seen).
  await page.waitForFunction(() => document.querySelectorAll('[data-guide-lit]').length > 0, undefined, { timeout: 8000 });
  const lit = await page.evaluate(() => [...document.querySelectorAll('[data-guide-lit]')].map((e) => (e as HTMLElement).id || (e as HTMLElement).dataset.card || e.tagName));
  console.log(`draw step lit: ${JSON.stringify(lit)}`);
  assert(lit.includes('deck'), 'the Draw pile is lit on Draw');
  const outline = await page.evaluate(() => getComputedStyle(document.querySelector('[data-guide-lit]')!).outlineStyle);
  assert.equal(outline, 'solid', 'a still outline (no animation)');
  assert.equal(await page.evaluate(() => { const g = document.getElementById('futasaku-glass'); return !g || g.hidden; }), true, 'no window: every kind of move was seen');
  const pressed = await page.evaluate(() => [document.getElementById('smart-context')?.getAttribute('aria-pressed'), document.getElementById('futasaku-guide-label')?.getAttribute('aria-pressed')]);
  assert(pressed.includes('true'), `the switch reads pressed (${pressed})`);
  await page.screenshot({ path: `${out}/draw-lit.png` });
  // Draw: the next step lights its own move (the playable cards, or the Bloom key).
  await page.locator('#deck').evaluate((el) => (el as HTMLButtonElement).click());
  await page.waitForFunction(() => document.documentElement.dataset.step !== 'draw' && [...document.querySelectorAll('[data-guide-lit]')].every((e) => e.id !== 'deck') && document.querySelectorAll('[data-guide-lit]').length > 0, undefined, { timeout: 8000 });
  const lit2 = await page.evaluate(() => [...document.querySelectorAll('[data-guide-lit]')].map((e) => (e as HTMLElement).id || (e as HTMLElement).dataset.card || e.tagName));
  console.log(`grow step lit: ${JSON.stringify(lit2)}`);
  await page.screenshot({ path: `${out}/grow-lit.png` });
  // Off: through whichever switch is showing; nothing stays lit.
  const label = page.locator('#futasaku-guide-label');
  if (await label.isVisible()) await label.click(); else await page.locator('#smart-context').click();
  await page.waitForFunction(() => document.querySelectorAll('[data-guide-lit]').length === 0, undefined, { timeout: 5000 });
  assert.deepEqual(errors, [], 'no page errors');
  console.log('PASS guide steady light');
} finally { await browser.close(); await served.server.close(); }
