// Verifies the TERRITORY rename on the LIVE site: the menu entry, the online-hub entry, the screen
// title and its accessibility label. The rename routed the text into src/strings.ts, so the static
// HTML ships EMPTY elements filled at runtime - which means the only meaningful check is what the
// browser actually renders.
//
//   npx tsx scripts/live-territory-check.ts
import { chromium } from 'playwright-core';

const BASE = process.env.BASE ?? 'https://www.futasaku.com/';
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
page.on('pageerror', (e) => console.log('  pageerror:', e.message.slice(0, 100)));

await page.goto(BASE, { waitUntil: 'load', timeout: 45000 });
await page.waitForFunction(() => { const el = document.getElementById('menu-play'); return !!el && !el.hidden; }, undefined, { timeout: 20000 });
await page.waitForTimeout(800);

const menu = await page.evaluate(() => {
  const el = document.getElementById('menu-world') as HTMLElement | null;
  return { text: (el?.textContent ?? '').trim(), aria: el?.getAttribute('aria-label') ?? '', hidden: !!el?.hidden };
});

// Open the screen from the main menu, then read the title and label it renders with.
let title = '', screenAria = '';
for (let i = 0; i < 6; i++) {
  await page.evaluate(() => (document.getElementById('menu-world') as HTMLButtonElement | null)?.click());
  await page.waitForTimeout(1000);
  const s = await page.evaluate(() => {
    const el = document.getElementById('online-world-screen') as HTMLElement | null;
    if (!el || el.hidden) return null;
    return {
      title: (document.getElementById('online-world-title')?.textContent ?? '').trim(),
      aria: el.getAttribute('aria-label') ?? '',
    };
  });
  if (s) { title = s.title; screenAria = s.aria; break; }
}

console.log(`\nterritory rename on live (${BASE})\n`);
console.log(`  menu entry text      : "${menu.text}"`);
console.log(`  menu entry aria-label: "${menu.aria}"`);
console.log(`  screen title         : "${title}"`);
console.log(`  screen aria-label    : "${screenAria}"`);

const all = `${menu.text} ${menu.aria} ${title} ${screenAria}`.toLowerCase();
const stale = all.includes('world map') ? 'YES - still says "world map"' : 'no';
const named = [menu.text, menu.aria, title, screenAria].every((v) => v.toLowerCase().includes('territory'));
console.log(`\n  still says "world map": ${stale}`);
console.log(`  every surface says Territory: ${named ? 'YES' : 'NO'}`);
await page.screenshot({ path: '/tmp/live-territory.png' });
await browser.close();
process.exit(named && stale === 'no' ? 0 : 1);
