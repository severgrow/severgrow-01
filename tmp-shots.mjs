import { mkdirSync } from 'node:fs';
import { productFixture } from './web/e2e/helpers/product-fixture.ts';
import { chromium } from 'playwright-core';
const out = process.env.SHOTS ?? '/tmp/streaks/futa04';
mkdirSync(out, { recursive: true });
const fixture = await productFixture();
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
for (const [name, width, height] of [['320', 320, 568], ['390', 390, 844], ['430', 430, 932], ['1440', 1440, 900]]) {
  const p = await browser.newPage({ viewport: { width, height }, hasTouch: width < 900 });
  await p.goto(fixture.origin + '/');
  await p.waitForFunction('(() => !!window.__severgrow?.ready?.())()', undefined, { timeout: 180_000 });
  if (!(await p.locator('#menu-new').isVisible().catch(() => false))) await p.click('#menu-play');
  await p.click('#menu-new');
  await p.waitForSelector('#level-grid .difficulty-tile');
  const info = await p.evaluate(`(() => {
    const keys = [...document.querySelectorAll('#level-grid .difficulty-tile')];
    const r = (id) => keys.find((k) => k.dataset.difficulty === id)?.getBoundingClientRect();
    const ids = keys.map((k) => k.dataset.difficulty);
    const easy = r('easy'), medium = r('medium'), hard = r('hard');
    return { ids, easyMedium: medium.top - easy.bottom, mediumHard: hard.top - medium.bottom,
      streakKeys: [...document.querySelectorAll('#level-grid .practice-streak-key')].map((k) => k.dataset.difficulty),
      legend: !!document.querySelector('#level-grid > .practice-streak-legend'),
      wash: ['hard', 'pro'].map((id) => getComputedStyle(keys.find((k) => k.dataset.difficulty === id), '::before').backgroundImage.slice(0, 40)) };
  })()`);
  console.log(name, JSON.stringify(info));
  await p.screenshot({ path: `${out}/keys-futa04-${name}.png` });
  await p.close();
}
await browser.close(); await fixture.close();
