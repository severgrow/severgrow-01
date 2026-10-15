// Desktop main menu (owner, 2026-10-15): the whole menu is visible in an ordinary browser window
// (bookmarks bar, dock…) without scrolling, and a small icon-only button at the top right opens
// the game in its own window (Chrome/Edge install) or full screen. Phones never get the button.
//
//   PW_CHROMIUM=/opt/pw-browsers/chromium-1194/chrome-linux/chrome npx tsx web/e2e/desktop-menu-fit.ts
//   SHOTS=1 ... also writes docs/screens/desktop-menu/*.png
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { preview } from 'vite';
import { CHROME } from './helpers/local-duel.js';

const PORT = 4244;
const SHOTS = process.env.SHOTS === '1';
let failed = 0;
const check = (name: string, ok: boolean, note = '') => {
  if (!ok) failed += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? `  (${note})` : ''}`);
};

await new Promise<void>((resolve, reject) => {
  const child = spawn(process.execPath, ['./node_modules/vite/bin/vite.js', 'build', '--config', 'web/vite.config.ts'], {
    env: { ...process.env, CHANNEL: 'futa05', VITE_DUEL_API_URL: 'http://127.0.0.1:9', VITE_SUPABASE_URL: 'http://127.0.0.1:9', VITE_SUPABASE_ANON_KEY: 'local-e2e-anon-key' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let err = '';
  child.stderr?.on('data', (b) => (err += String(b)));
  child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(err))));
});
const server = await preview({ configFile: 'web/vite.config.ts', preview: { host: '127.0.0.1', port: PORT, strictPort: true }, logLevel: 'error' });
const browser = await chromium.launch({ executablePath: CHROME });
try {
  // Laptop windows with browser bars, from very short to a big monitor; with and without "Continue".
  for (const [w, h] of [[1000, 460], [1280, 600], [1366, 640], [1440, 720], [1920, 950]] as const) {
    for (const withSave of [false, true]) {
      const context = await browser.newContext({ viewport: { width: w, height: h } });
      const page = await context.newPage();
      await page.goto(`http://127.0.0.1:${PORT}/`);
      await page.waitForSelector('#menu-beta', { timeout: 20_000 });
      // The tallest menu a player can see: with a saved game, "Continue" sits above the rest.
      if (withSave) await page.evaluate("document.getElementById('menu-continue').hidden = false");
      await page.waitForTimeout(300);
      const label = `${w}x${h}${withSave ? '+continue' : ''}`;
      const m = (await page.evaluate(`(() => {
        const btns = [...document.querySelectorAll('#menu .menu-buttons .btn')].filter(b => b.offsetParent);
        const menu = document.getElementById('menu');
        return {
          n: btns.length,
          last: Math.round(Math.max(...btns.map(b => b.getBoundingClientRect().bottom))),
          first: Math.round(document.getElementById('logo').getBoundingClientRect().top),
          minH: Math.round(Math.min(...btns.map(b => b.getBoundingClientRect().height))),
          scrolls: menu.scrollHeight > menu.clientHeight + 1,
          wide: document.documentElement.scrollWidth <= innerWidth,
        };
      })()`)) as { n: number; last: number; first: number; minH: number; scrolls: boolean; wide: boolean };
      if (withSave) check(`${label}: Continue is showing (the tallest menu)`, m.n >= 5, `${m.n} buttons`);
      check(`${label}: the whole menu is on screen without scrolling`, m.last <= h && m.first >= 0 && !m.scrolls, JSON.stringify(m));
      check(`${label}: every button stays at least 44px tall`, m.minH >= 44, `${m.minH}px`);
      check(`${label}: nothing runs off the side`, m.wide);
      const win = page.locator('#app-window');
      const box = await win.boundingBox();
      check(`${label}: the window button sits in the top-right corner`, !!box && box.x + box.width <= w && box.x + box.width >= w - 30 && box.y <= 30, JSON.stringify(box));
      check(`${label}: it is icon-only, with a name for screen readers and a tooltip`, ((await win.innerText()).trim() === '') && !!(await win.getAttribute('aria-label')) && !!(await win.getAttribute('title')));
      if (SHOTS && !withSave) {
        mkdirSync('docs/screens/desktop-menu', { recursive: true });
        await page.screenshot({ path: `docs/screens/desktop-menu/menu-${w}x${h}.png` });
      }
      if (w === 1280 && !withSave) {
        // No Chrome install offer in a test browser, so this one is the full-screen face.
        check('without an install offer it means full screen', (await win.getAttribute('data-mode')) === 'fullscreen');
        await win.click();
        const full = await page.waitForFunction('document.fullscreenElement !== null', undefined, { timeout: 5_000 }).then(() => true).catch(() => false);
        check('pressing it goes full screen', full);
        if (full) {
          check('in full screen it offers the way back', await page.waitForFunction("document.getElementById('app-window').dataset.mode === 'exit' && document.getElementById('app-window').getAttribute('aria-label') === 'Leave full screen'", undefined, { timeout: 5_000 }).then(() => true).catch(() => false));
          await win.click();
          check('pressing again leaves full screen', await page.waitForFunction('document.fullscreenElement === null', undefined, { timeout: 5_000 }).then(() => true).catch(() => false));
        }
      }
      await context.close();
    }
  }
  // Phones: never the button, and the phone menu is unchanged.
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const p = await phone.newPage();
  await p.goto(`http://127.0.0.1:${PORT}/`);
  await p.waitForSelector('#menu-beta', { timeout: 20_000 });
  check('phone: no window button', (await p.locator('#app-window').count()) === 0);
  await phone.close();
} finally {
  await browser.close().catch(() => undefined);
  await server.close().catch(() => undefined);
}
console.log(`\n${failed === 0 ? 'ALL PASS' : `${failed} FAILED`}`);
process.exit(failed === 0 ? 0 : 1);
