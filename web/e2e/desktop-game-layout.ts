// The game on a computer (owner, 2026-10-15): the board has the same air above and below it, the
// hand keeps clear of the bottom edge, the cockpit sits centred in the empty space right of the
// board, and a full-screen icon stays under the wordmark during the game. Phones are untouched.
//
//   PW_CHROMIUM=/opt/pw-browsers/chromium-1194/chrome-linux/chrome npx tsx web/e2e/desktop-game-layout.ts
//   SHOTS=1 ... also writes docs/screens/desktop-game/*.png
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { preview } from 'vite';
import { CHROME } from './helpers/local-duel.js';

const PORT = 4247;
const SHOTS = process.env.SHOTS === '1';
let failed = 0;
const check = (name: string, ok: boolean, note = '') => {
  if (!ok) failed += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? `  (${note})` : ''}`);
};
await new Promise<void>((resolve, reject) => {
  const child = spawn(process.execPath, ['./node_modules/vite/bin/vite.js', 'build', '--config', 'web/vite.config.ts'], {
    env: { ...process.env, CHANNEL: 'futa05', VITE_DUEL_API_URL: 'http://127.0.0.1:9', VITE_SUPABASE_URL: 'http://127.0.0.1:9', VITE_SUPABASE_ANON_KEY: 'k' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let err = '';
  child.stderr?.on('data', (b) => (err += String(b)));
  child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(err))));
});
const server = await preview({ configFile: 'web/vite.config.ts', preview: { host: '127.0.0.1', port: PORT, strictPort: true }, logLevel: 'error' });
const browser = await chromium.launch({ executablePath: CHROME });
const MEASURE = `(() => {
  function R(el) { if (!el) return null; const r = el.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width }; }
  const cards = [...document.querySelectorAll('#hand .card')].map(e => e.getBoundingClientRect()).filter(r => r.width > 0);
  return { layout: document.documentElement.dataset.layout, board: R(document.querySelector('#board-wrap .l-base')), box: R(document.getElementById('futa04-box')),
    handBottom: cards.length ? Math.max(...cards.map(c => c.bottom)) : null, menu: R(document.getElementById('hud-menu')), brand: R(document.getElementById('hud-brand')),
    win: (() => { const b = document.getElementById('hud-window'); return b && !b.hidden && getComputedStyle(b).display !== 'none' ? R(b) : null; })() };
})()`;
type M = { layout: string; board: { l: number; t: number; r: number; b: number; w: number }; box: { l: number; r: number; w: number }; handBottom: number; menu: { r: number; b: number }; brand: { l: number; r: number; b: number }; win: { l: number; r: number; t: number; b: number } | null };
try {
  for (const [w, h] of [[1440, 900], [1920, 1080], [1280, 720], [1024, 768]] as const) {
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    await page.goto(`http://127.0.0.1:${PORT}/`);
    await page.waitForSelector('#menu-beta', { timeout: 20_000 });
    check(`${w}x${h}: no header full-screen icon on the menu (the menu has its own)`, ((await page.evaluate(MEASURE)) as M).win === null);
    await page.goto(`http://127.0.0.1:${PORT}/?seed=4242`);
    await page.waitForSelector('#game:not([hidden])');
    await page.waitForSelector('#starter-lottery', { state: 'hidden', timeout: 20_000 }).catch(() => undefined);
    await page.waitForTimeout(3500);
    const m = (await page.evaluate(MEASURE)) as M;
    const top = m.board.t, bottom = h - m.board.b;
    check(`${w}x${h}: the board has the same air above and below`, Math.abs(top - bottom) <= 4 && top >= 8 && top <= 32, `${Math.round(top)} / ${Math.round(bottom)}px`);
    check(`${w}x${h}: the hand keeps clear of the bottom edge`, h - m.handBottom >= 12, `${Math.round(h - m.handBottom)}px`);
    const roomL = m.box.l - m.board.r, roomR = w - m.box.r;
    if (m.board.r + 24 + m.box.w < w) check(`${w}x${h}: the cockpit is centred in the space right of the board`, Math.abs(roomL - roomR) <= 4, `${Math.round(roomL)} / ${Math.round(roomR)}px`);
    else check(`${w}x${h}: no room to centre: the cockpit stays where it was`, roomR <= 4, `${Math.round(roomR)}px`);
    // Owner, 2026-10-15: under the wordmark, right edges aligned (the real-time bolt, online only, goes to its right).
    check(`${w}x${h}: a full-screen icon sits under the wordmark, right edges aligned`, !!m.win && m.win.t >= m.brand.b - 1 && Math.abs(m.win.r - m.brand.r) <= 2, JSON.stringify({ win: m.win, brand: m.brand }));
    check(`${w}x${h}: it is icon-only with a name`, (await page.locator('#hud-window').innerText()).trim() === '' && (await page.getAttribute('#hud-window', 'aria-label')) === 'Full screen');
    if (SHOTS) {
      mkdirSync('docs/screens/desktop-game', { recursive: true });
      await page.screenshot({ path: `docs/screens/desktop-game/game-${w}x${h}.png` });
    }
    if (w === 1440) {
      await page.click('#hud-window');
      check('pressing it goes full screen', await page.waitForFunction('document.fullscreenElement !== null', undefined, { timeout: 5_000 }).then(() => true).catch(() => false));
      check('…and it offers the way back', await page.waitForFunction("document.getElementById('hud-window').getAttribute('aria-label') === 'Leave full screen'", undefined, { timeout: 5_000 }).then(() => true).catch(() => false));
      await page.click('#hud-window');
      check('pressing again leaves full screen', await page.waitForFunction('document.fullscreenElement === null', undefined, { timeout: 5_000 }).then(() => true).catch(() => false));
    }
    await page.close();
  }
  // Phones: no header icon, and the phone layout is not the side layout these rules touch.
  const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await phone.goto(`http://127.0.0.1:${PORT}/?seed=4242`);
  await phone.waitForSelector('#game:not([hidden])');
  await phone.waitForTimeout(1500);
  const pm = (await phone.evaluate(MEASURE)) as M;
  check('phone: no full-screen icon', pm.win === null && (await phone.locator('#hud-window').count()) === 0);
  check('phone: not the side layout (unchanged)', pm.layout !== 'side', pm.layout);
  await phone.close();
} finally {
  await browser.close();
  await server.close();
}
console.log(`\n${failed === 0 ? 'ALL PASS' : `${failed} FAILED`}`);
process.exit(failed === 0 ? 0 : 1);
