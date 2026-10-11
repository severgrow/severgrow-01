// Temporary live verification of the deployed futa0.4 route. Delete after use.
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const URL = process.env.FUTA04_URL ?? 'https://severgrow.github.io/severgrow-01/futa0.4/';
const browser = await chromium.launch({
  ...(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}),
  args: ['--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.addInitScript(() => { (window as any).__name = (f: unknown) => f; });

const idle = (timeout = 30000) =>
  page.waitForFunction(() => {
    const h = (window as any).__severgrow;
    return h && !h.busy() && h.state()?.actor === 0;
  }, undefined, { timeout });
const phase = () => page.evaluate(() => (window as any).__severgrow.state().phase as string);

try {
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForFunction(() => !!(window as any).__severgrow, undefined, { timeout: 30000 });
  await page.waitForTimeout(1000);

  const infoClass = await page.evaluate(() => document.documentElement.classList.contains('futa04-information'));
  assert(infoClass, 'html.futa04-information class is present');
  console.log('PASS futa04-information class');

  assert((await page.locator('#smart-panel').count()) > 0, '#smart-panel exists');
  console.log('PASS #smart-panel exists');

  assert(await page.evaluate(() => !!document.getElementById('drag-layer-style')), '#drag-layer-style injected');
  console.log('PASS #drag-layer-style injected');

  // Start a game: menu -> New game -> pick a level -> board renders.
  await page.locator('#menu-new').click();
  await page.locator('.level-tile').first().click();
  await page.locator('#board g.hex-cell').first().waitFor({ timeout: 30000 });
  await idle();
  console.log('board rendered, hex cells =', await page.locator('#board g.hex-cell').count());

  const before = await phase();
  await page.click('#deck');
  await idle();
  const after = await phase();
  assert(after === 'ACT', `draw enters ACT (saw ${before} -> ${after})`);
  console.log(`PASS New game -> draw from #deck -> ACT (${before} -> ${after})`);

  assert.equal(errors.length, 0, `no page errors: ${errors.join(' | ')}`);
  console.log('LIVE VERIFY OK');
} finally {
  await browser.close();
}
