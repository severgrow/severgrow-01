import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { preview } from 'vite';
import { legalActions, viewFor } from '../../src/engine/index.js';
import type { State } from '../../src/engine/index.js';

const server = await preview({ configFile: 'web/vite.config.ts', preview: { port: 4201, strictPort: true }, logLevel: 'silent' });
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM ?? '/usr/bin/chromium', args: ['--no-sandbox'] });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    (window as any).__name = (f: unknown) => f;
    window.confirm = () => true;
    localStorage.setItem('main2:severgrow.settings.v1', JSON.stringify({ sound: false, music: false, coach: false, speed: 'normal', reduceMotion: false, autoSkip: false, confirmPolicy: 'always' }));
  });
  await page.goto('http://localhost:4201/?seed=219682080');
  const click = (selector: string) => page.locator(selector).evaluate((element: Element) => element.dispatchEvent(new MouseEvent('click', { bubbles: true })));
  const idle = () => page.waitForFunction(() => {
    const game = (window as any).__severgrow;
    return game?.state()?.actor === 0 && !game.busy();
  });
  await click('#menu-new');
  await page.locator('#level-grid [data-difficulty="beginner"]').waitFor({ state: 'attached' });
  await click('#level-grid [data-difficulty="beginner"]');
  await idle();
  // DOM click exercises the real handler without Playwright waiting for the
  // deliberately pulsing deck/card to stop moving.
  await click('#deck');
  await page.waitForFunction(() => (window as any).__severgrow.state()?.phase === 'ACT' && !(window as any).__severgrow.busy());
  const grown = await page.evaluate(() => (window as any).__severgrow.state() as State);
  const action = legalActions(viewFor(grown, 0)).find(a => a.t === 'Sprout');
  assert(action?.t === 'Sprout');
  await click(`#hand [data-card="${action.card}"]`);
  await page.locator(`#board g.hex-cell[data-key="${action.coord.q},${action.coord.r}"]`).evaluate((hex: Element) => {
    hex.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'mouse' }));
    hex.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerType: 'mouse' }));
  });
  await page.waitForFunction(() => Number(document.querySelector('#score-you')?.textContent) > 0);
  await click('#hud-menu');
  await click('#gm-new');
  await page.locator('#level-grid [data-difficulty="beginner"]').waitFor({ state: 'attached' });
  await click('#level-grid [data-difficulty="beginner"]');
  await page.waitForTimeout(850);
  const restarted = await page.evaluate(() => (window as any).__severgrow.state() as State);
  assert.equal(restarted.phase, 'DRAW');
  assert.equal(await page.locator('#score-you').textContent(), '0', 'old score animation cannot overwrite new game');
  assert.deepEqual(errors, []);
  console.log('Fresh match cancels previous score count: passed');
  await page.close();
} finally {
  await browser.close();
  server.httpServer.close();
}
