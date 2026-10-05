// DESIGN (V2 illustrated skin) screenshots (test copy only; not part of npm run e2e).
//   CHANNEL=test npm run web:build && npx tsx web/e2e/design-shots.ts [out-dir]
// Opens the Lab, starts a preset with "Apply and play" (the current look) and with DESIGN, lets
// two opponents play a while ("Watch a game", fast), and saves screenshots in both orientations.
import { chromium } from 'playwright-core';
import type { Page } from 'playwright-core';
import { preview } from 'vite';

const out = process.argv[2] ?? 'web/e2e/out-design';
const only = process.argv[3] ?? '';
const server = await preview({ configFile: 'web/vite.config.ts', preview: { port: 4181, strictPort: true }, logLevel: 'silent' });
const BASE = 'http://localhost:4181/';
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : { executablePath: '/opt/pw-browsers/chromium' });
const errors: string[] = [];

const open = async (w: number, h: number, dpr = 2) => {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: dpr });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.addInitScript(() => {
    (window as unknown as { __name: unknown }).__name = (f: unknown) => f;
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.clear();
    localStorage.setItem('test:severgrow.settings.v1', JSON.stringify({ sound: false, coach: false, speed: 'fast' }));
  });
  await page.goto(BASE);
  await page.waitForTimeout(500);
  return page;
};

const start = async (page: Page, preset: string, how: 'play' | 'design' | 'watch' | 'design-watch') => {
  await page.evaluate(() => document.querySelectorAll<HTMLElement>('.sheet:not([hidden]) [data-close], .welcome button').forEach((b) => b.click()));
  await page.evaluate(() => (document.querySelector('#menu-lab') as HTMLElement | null)?.click() ?? (window as unknown as { __openMenu?: () => void }).__openMenu?.());
  await page.waitForTimeout(200);
  if (!(await page.locator('#sheet-lab').isVisible())) {
    // open the menu first
    await page.evaluate(() => (document.querySelector('[data-menu], #menu-btn, #open-menu') as HTMLElement | null)?.click());
    await page.waitForTimeout(200);
    await page.evaluate(() => (document.querySelector('#menu-lab') as HTMLElement).click());
    await page.waitForTimeout(200);
  }
  const idx = await page.evaluate((name) => [...document.querySelectorAll<HTMLOptionElement>('#sheet-lab select[data-sel="name"] option')].findIndex((o) => o.textContent === name) - 1, preset);
  await page.selectOption('#sheet-lab select[data-sel="name"]', String(idx));
  await page.waitForTimeout(100);
  if (how === 'design-watch' || how === 'design') {
    await page.click('#sheet-lab [data-lab="design"]');
    await page.waitForURL(/design=1/);
    await page.waitForTimeout(1200);
    if (how === 'design') return;
    await page.evaluate(() => (document.querySelector('#menu-lab') as HTMLElement).click());
    await page.waitForTimeout(200);
    await page.click('#sheet-lab [data-lab="watch"]');
  } else await page.click(`#sheet-lab [data-lab="${how}"]`);
  await page.waitForTimeout(800);
};

const shots: [string, number, number, string, 'play' | 'design' | 'watch' | 'design-watch', number][] = [
  ['phone-classic-lab', 390, 844, 'Classic', 'watch', 9000],
  ['phone-classic-design', 390, 844, 'Classic', 'design-watch', 9000],
  ['desk-bighex-lab', 1440, 900, 'Big hex', 'watch', 14000],
  ['desk-bighex-design', 1440, 900, 'Big hex', 'design-watch', 14000],
  ['phone-huge-design', 390, 844, 'Huge hex', 'design-watch', 12000],
  ['desk-huge-design', 1440, 900, 'Huge hex', 'design-watch', 20000],
  ['desk-start-design', 1440, 900, 'Classic', 'design', 0],
];
for (const [name, w, h, preset, how, ms] of shots) {
  if (only && !name.includes(only)) continue;
  const page = await open(w, h);
  try {
    await start(page, preset, how);
    if (ms) await page.waitForTimeout(ms);
    await page.screenshot({ path: `${out}/${name}.png` });
    const svg = page.locator('#board');
    await svg.screenshot({ path: `${out}/${name}-board.png` });
    console.log('shot', name);
  } catch (e) {
    console.log('FAIL', name, String(e).slice(0, 300));
  }
  await page.close();
}
console.log(errors.length ? `console errors:\n${[...new Set(errors)].join('\n')}` : 'no console errors');
await browser.close();
server.httpServer.close();
