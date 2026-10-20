// Browser smoke for the progressive Levels flow. Run against a local futa05 build:
// CHANNEL=futa05 VITE_DUEL_API_URL=http://127.0.0.1:9 VITE_SUPABASE_URL=http://127.0.0.1:9 \
// VITE_SUPABASE_ANON_KEY=local-e2e-anon-key npm run web:build
// npx tsx web/e2e/campaign-onboarding.ts
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { preview } from 'vite';
import { CAMPAIGN_LEVELS } from '../../src/campaign/index.js';

const port = 4251;
const out = 'docs/screens/campaign-onboarding';
mkdirSync(out, { recursive: true });
const server = await preview({ configFile: 'web/vite.config.ts', preview: { port, strictPort: true }, logLevel: 'silent' });
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || '/usr/bin/chromium', args: ['--no-sandbox'] });
const errors: string[] = [];
try {
  const sizes = [{ width: 320, height: 568 }, { width: 360, height: 640 }, { width: 390, height: 844 }, { width: 430, height: 932 }, { width: 768, height: 1024 }, { width: 1280, height: 800 }];
  for (const size of sizes.filter(size => !process.env.ONBOARDING_WIDTHS || process.env.ONBOARDING_WIDTHS.split(',').includes(String(size.width)))) {
    const context = await browser.newContext({ viewport: size, isMobile: size.width < 768, hasTouch: size.width < 768 });
    const page = await context.newPage();
    page.on('pageerror', e => errors.push(`${size.width}x${size.height}: ${e.message}`));
    await page.addInitScript(() => {
      localStorage.setItem('futa05:severgrow.settings.v1', JSON.stringify({ sound: false, music: false, speed: 'skip', reduceMotion: true, guidedLevels: true }));
    });
    const levels = size.width === 390 ? Array.from({ length: 20 }, (_, i) => i + 1) : [1, 9, 11, 20];
    for (const number of levels.filter(number => !process.env.ONBOARDING_LEVELS || process.env.ONBOARDING_LEVELS.split(',').includes(String(number)))) {
      const completed = CAMPAIGN_LEVELS.slice(0, number - 1).map(l => l.id);
      await page.goto(`http://localhost:${port}/`);
      await page.evaluate(({ completed, number }) => {
        localStorage.setItem('severgrow.campaign.progress.v1', JSON.stringify({ version: 1, unlocked: number, completed, best: {} }));
        localStorage.removeItem('severgrow.campaign.save.v1');
      }, { completed, number });
      await page.reload();
      await page.waitForFunction(() => !!(window as any).__severgrow, undefined, { timeout: 20000 });
      await page.waitForTimeout(700); // let the menu's asynchronous startup paint settle
      try {
        for (let attempt = 0; attempt < 8 && !(await page.locator('#play-menu').isVisible()); attempt++) {
          await page.locator('#menu-play').click();
          await page.waitForTimeout(500);
        }
        await page.locator('#menu-campaign').click({ timeout: 6000 });
      }
      catch (error) {
        await page.screenshot({ path: `${out}/failed-menu-${number}-${size.width}.png` });
        console.error(await page.evaluate(() => ({ menu: document.getElementById('menu')?.hidden, play: document.getElementById('play-menu')?.hidden,
          button: document.getElementById('menu-play')?.outerHTML, text: document.body.innerText.slice(0, 700) })));
        throw error;
      }
      await page.waitForFunction(() => !!(window as any).__severgrow?.state(), undefined, { timeout: 20000 });
      await page.waitForFunction(() => (window as any).__severgrow.state()?.actor === 0 && !(window as any).__severgrow.busy(), undefined, { timeout: 20000 });
      const actual = await page.evaluate(() => {
        const s = (window as any).__severgrow.state();
        const note = document.getElementById('first-tip');
        return { cells: s.config.board?.cells.length, phase: s.phase, note: note?.textContent?.trim() || '', focus: document.documentElement.dataset.campaignFocus,
          overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
      });
      assert.equal(actual.cells, number <= 10 ? 19 : 37, `level ${number} board`);
      assert.ok(actual.overflow <= 2, `level ${number} ${size.width}px horizontal overflow ${actual.overflow}`);
      if (number === 1) {
        assert.equal(actual.phase, 'DRAW');
        assert.equal(actual.focus, 'deck');
        assert.equal(await page.locator('#campaign-guide').isVisible(), true);
        await page.screenshot({ path: `${out}/level-${number}-${size.width}x${size.height}.png` });
        await page.locator('#hand .card').first().click();
        await page.locator('#campaign-attempt.visible').waitFor({ state: 'visible' });
        assert.match((await page.locator('#campaign-attempt').textContent()) || '', /DRAW FIRST/);
        await page.waitForTimeout(950);
        await page.locator('#board .hex-cell').first().click({ force: true });
        await page.locator('#campaign-attempt.visible').waitFor({ state: 'visible' });
        assert.match((await page.locator('#campaign-attempt').textContent()) || '', /DRAW FIRST/);
        await page.locator('#deck').click();
        await page.waitForFunction(() => (window as any).__severgrow.state()?.phase === 'ACT', undefined, { timeout: 20000 });
        assert.equal(await page.evaluate(() => document.documentElement.dataset.campaignFocus), 'hand');
        await page.screenshot({ path: `${out}/level-1-grow-${size.width}x${size.height}.png` });
        await page.reload();
        await page.locator('#menu-continue:not([hidden])').click({ timeout: 20000 });
        await page.waitForFunction(() => (window as any).__severgrow.state()?.phase === 'ACT', undefined, { timeout: 20000 });
      }
      if ([8, 9, 10, 11, 12, 20].includes(number)) await page.screenshot({ path: `${out}/level-${number}-${size.width}x${size.height}.png` });
      if (number === 9) {
        await page.locator('#deck').click();
        await page.waitForFunction(() => (window as any).__severgrow.state()?.phase === 'ACT', undefined, { timeout: 20000 });
        assert.equal(await page.evaluate(() => document.documentElement.dataset.campaignFocus), 'bloom');
        await page.screenshot({ path: `${out}/level-9-bloom-${size.width}x${size.height}.png` });
      }
    }
    await context.close();
  }
  assert.deepEqual(errors, [], 'no uncaught browser errors');
  console.log('Levels 1-20 open; mobile/tablet/desktop layouts and early invalid taps passed.');
} finally {
  await browser.close();
  await server.httpServer.close();
}
