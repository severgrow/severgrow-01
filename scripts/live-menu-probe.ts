// Focused check: is the main menu ACTUALLY usable on the live site, or did my walk check too early?
// Reports the real computed state of each control and screenshots the menu to look at.
import { chromium } from 'playwright-core';

const BASE = 'https://www.futasaku.com/';
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });

await page.goto(BASE, { waitUntil: 'load', timeout: 45000 });
// Capture what a tester ACTUALLY sees in the first moments, not just the final state.
await page.waitForTimeout(900);
await page.screenshot({ path: '/tmp/live-menu-at-900ms.png' });
console.log('screenshot at ~900ms: /tmp/live-menu-at-900ms.png');
for (const waitMs of [500, 1500, 3000, 6000]) {
  await page.waitForTimeout(waitMs === 500 ? 500 : waitMs - 1500);
  const state = await page.evaluate(() => {
    const ids = ['menu-login', 'menu-play', 'menu-world', 'menu-tutorial', 'menu-settings', 'menu-beta'];
    const out: Record<string, string> = {};
    for (const id of ids) {
      const el = document.getElementById(id) as HTMLElement | null;
      if (!el) { out[id] = 'MISSING'; continue; }
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      const visible = !el.hidden && cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 1 && r.height > 1;
      out[id] = `${visible ? 'VISIBLE' : 'not-visible'} hidden=${el.hidden} display=${cs.display} box=${Math.round(r.width)}x${Math.round(r.height)} "${(el.textContent ?? '').trim().slice(0, 18)}"`;
    }
    return out;
  });
  console.log(`\n=== after ~${waitMs}ms ===`);
  for (const [id, s] of Object.entries(state)) console.log(`  ${id.padEnd(15)} ${s}`);
}
await page.screenshot({ path: '/tmp/live-menu-390x844.png' });
console.log('\nscreenshot: /tmp/live-menu-390x844.png');
await browser.close();
