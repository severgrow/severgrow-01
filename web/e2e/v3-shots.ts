// V3 (skinned renderer) screenshots and checks (test copy only; not part of npm run e2e).
//   CHANNEL=test npm run web:build && npx tsx web/e2e/v3-shots.ts [filter]
import { chromium } from 'playwright-core';
import type { Page } from 'playwright-core';
import { preview } from 'vite';

const only = process.argv[2] ?? '';
const out = 'web/e2e/out-design';
const server = await preview({ configFile: 'web/vite.config.ts', preview: { port: 4185, strictPort: true }, logLevel: 'silent' });
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : { executablePath: '/opt/pw-browsers/chromium' });

const open = async (w: number, h: number, dpr: number, touch: boolean) => {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, hasTouch: touch, isMobile: touch });
  const page = await ctx.newPage();
  const bad: string[] = [];
  page.on('pageerror', (e) => bad.push(`pageerror ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && bad.push(`console ${m.text()}`));
  page.on('response', (r) => r.status() >= 400 && bad.push(`${r.status()} ${r.url()}`));
  await page.addInitScript(() => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.clear();
    localStorage.setItem('test:severgrow.settings.v1', JSON.stringify({ sound: false, coach: false, speed: 'fast' }));
  });
  await page.goto('http://localhost:4185/?design=v3');
  await page.waitForTimeout(3500);
  return { page, bad };
};

const watch = async (page: Page, preset: string) => {
  await page.evaluate(() => (document.querySelector('#menu-lab') as HTMLElement).click());
  await page.waitForTimeout(300);
  const idx = await page.evaluate((name) => [...document.querySelectorAll<HTMLOptionElement>('#sheet-lab select[data-sel="name"] option')].findIndex((o) => o.textContent === name) - 1, preset);
  await page.selectOption('#sheet-lab select[data-sel="name"]', String(idx));
  await page.waitForTimeout(100);
  await page.click('#sheet-lab [data-lab="watch"]');
};

const runs: [string, number, number, number, boolean, string, number][] = [
  ['v3-phone-classic', 390, 844, 3, true, 'Classic', 14000],
  ['v3-desk-bighex', 1440, 900, 2, false, 'Big hex', 18000],
  ['v3-desk1x-huge', 1440, 900, 1, false, 'Huge hex', 18000],
];
for (const [name, w, h, dpr, touch, preset, ms] of runs) {
  if (only && !name.includes(only)) continue;
  const { page, bad } = await open(w, h, dpr, touch);
  await watch(page, preset);
  await page.waitForTimeout(ms);
  const info = await page.evaluate(() => {
    const svg = document.querySelector('#board') as SVGSVGElement;
    const img = svg.querySelector('pattern[id$="skin-ground"] image');
    return { tier: svg.dataset.tier, skin: svg.dataset.skin, ground: !!img?.getAttribute('href'), links: svg.querySelectorAll('.skin-link').length, tiles: svg.querySelectorAll('.skin-tile').length };
  });
  await page.screenshot({ path: `${out}/${name}.png` });
  console.log(name, JSON.stringify(info), bad.length ? bad.join(' | ') : 'clean');
  await page.close();
}
await browser.close();
server.httpServer.close();
