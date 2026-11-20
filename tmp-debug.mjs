import { productFixture } from './web/e2e/helpers/product-fixture.ts';
import { chromium } from 'playwright-core';
const fixture = await productFixture({ offlineApiPort: 65532 });
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await browser.newPage({ viewport: { width: 320, height: 568 }, hasTouch: true });
await p.addInitScript(() => { localStorage.setItem('futa05-test:severgrow.settings.v1', JSON.stringify({ sound: false, music: false, reduceMotion: true, speed: 'skip' })); });
await p.goto(fixture.origin + '/test/', { waitUntil: 'domcontentloaded', timeout: 240000 });
await p.waitForFunction('(() => !!window.__severgrow?.ready?.())()', undefined, { timeout: 240000 });
for (let i = 0; i < 6; i++) {
  const info = await p.evaluate(`(() => { const b = document.getElementById('menu-play'); const r = b.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { box: [r.left, r.top, r.width, r.height].map((n) => Math.round(n)), visibility: getComputedStyle(b).visibility, opacity: getComputedStyle(b).opacity,
      hit: hit ? (hit.id || hit.className) : null, anims: b.getAnimations().length, splash: !!document.querySelector('#splash:not([hidden])'), busy: window.__severgrow.busy() }; })()`);
  console.log(i, JSON.stringify(info));
  await p.waitForTimeout(2000);
}
await p.screenshot({ path: '/tmp/streaks/debug-menu-320.png' });
await browser.close(); await fixture.close();
