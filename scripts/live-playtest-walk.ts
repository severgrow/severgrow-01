// Walk the LIVE site as a first-time visitor, at a phone size. This is the closest thing to what a
// tester does at 9am: load the page for real, over the real CDN, and look at what appears.
//
//   npx tsx scripts/live-playtest-walk.ts
//
// Read-only: it never signs in and never creates a match. It watches for console errors, failed
// asset requests, and whether each screen the owner is about to hand to ten people actually renders.
import { chromium } from 'playwright-core';

const BASE = 'https://www.futasaku.com/';
const browser = await chromium.launch(
  process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {},
);
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });

const errors: string[] = [];
const failedRequests: string[] = [];
const dialogs: string[] = [];
// `menu-new` asks `window.confirm('Start a new game? …')` when a saved game exists, and Playwright
// auto-DISMISSES dialogs, so an unanswered confirm silently cancelled the click and the levels
// screen never opened. Accept it and record it: a native confirm is worth knowing about, because it
// is the one piece of UI in the whole app that does not look like the app.
page.on('dialog', (d) => { dialogs.push(`${d.type()}: ${d.message().slice(0, 70)}`); void d.accept(); });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text().slice(0, 160)}`); });
page.on('requestfailed', (r) => failedRequests.push(`${r.failure()?.errorText ?? '?'} ${r.url().slice(0, 110)}`));
page.on('response', (r) => { if (r.status() >= 400) failedRequests.push(`HTTP ${r.status()} ${r.url().slice(0, 110)}`); });

const results: { step: string; ok: boolean; detail: string }[] = [];
const check = (step: string, ok: boolean, detail = '') => results.push({ step, ok, detail });

// ---- 1. does it load at all -------------------------------------------------------------------
const t0 = Date.now();
await page.goto(BASE, { waitUntil: 'load', timeout: 45000 });
const loadMs = Date.now() - t0;
check('page loads', true, `${loadMs}ms`);

// ---- 2. HOW LONG until a tester can see a way to play ----------------------------------------
// Measured from the moment the page finishes loading, BEFORE any other wait: the product controls
// ship hidden and are revealed by JS after boot, so measuring after a delay measures nothing.
const revealMs = await (async () => {
  const started = Date.now();
  try {
    await page.waitForFunction(() => {
      const el = document.getElementById('menu-play');
      return !!el && !el.hidden;
    }, undefined, { timeout: 15000 });
    return Date.now() - started;
  } catch {
    return -1;
  }
})();
check('PLAY appears without a long wait', revealMs >= 0 && revealMs < 1000, revealMs < 0 ? 'never appeared' : `${revealMs}ms after load`);
await page.waitForTimeout(600);

const menu = await page.evaluate(() => {
  const ids = ['menu-login', 'menu-play', 'menu-world', 'menu-tutorial', 'menu-settings'];
  const out: Record<string, string> = {};
  for (const id of ids) {
    const el = document.getElementById(id) as HTMLElement | null;
    out[id] = !el ? 'MISSING' : el.hidden ? 'hidden' : `"${(el.textContent ?? '').trim().slice(0, 16)}"`;
  }
  const title = document.querySelector('#menu .title')?.textContent?.trim() ?? '';
  const beta = document.getElementById('menu-beta')?.textContent?.trim() ?? '';
  return { out, title, beta };
});
check('wordmark', menu.title.toUpperCase().includes('FUTASAKU'), menu.title);
check('beta line names the version', /0\.5\d/.test(menu.beta), menu.beta.slice(0, 60));
for (const [id, state] of Object.entries(menu.out)) {
  check(`menu entry ${id}`, state !== 'MISSING' && state !== 'hidden', state);
}

// ---- 3. the PLAY submenu, where three of the six things live ----------------------------------
await page.evaluate(() => (document.getElementById('menu-play') as HTMLButtonElement | null)?.click());
await page.waitForTimeout(500);
const play = await page.evaluate(() => {
  const ids = ['menu-online', 'menu-campaign', 'menu-levels', 'menu-new'];
  const out: Record<string, string> = {};
  for (const id of ids) {
    const el = document.getElementById(id) as HTMLElement | null;
    out[id] = !el ? 'MISSING' : el.hidden ? 'hidden' : `"${(el.textContent ?? '').trim().slice(0, 20)}"`;
  }
  return out;
});
for (const [id, state] of Object.entries(play)) {
  check(`PLAY entry ${id}`, state !== 'MISSING' && state !== 'hidden', state);
}

// ---- 4. the world map renders real hexes ------------------------------------------------------
await page.evaluate(() => (document.getElementById('play-back') as HTMLButtonElement | null)?.click());
await page.waitForTimeout(300);
await page.evaluate(() => (document.getElementById('menu-world') as HTMLButtonElement | null)?.click());
await page.waitForTimeout(2500);
const world = await page.evaluate(() => {
  const hexes = document.querySelectorAll('.world-hex').length;
  const summary = document.getElementById('online-world-summary')?.textContent ?? '';
  const notice = document.getElementById('online-world-notice')?.textContent ?? '';
  const svg = !!document.querySelector('.world-map-svg');
  return { hexes, summary, notice, svg };
});
check('world map renders hexes', world.hexes > 100, `${world.hexes} hexes, svg=${world.svg}`);
check('world summary reads', !world.notice, world.summary || world.notice);
await page.screenshot({ path: '/tmp/live-walk-world.png' });

// ---- 5. the tutorial is reachable (a first-time tester's on-ramp) -----------------------------
await page.goto(BASE, { waitUntil: 'load' });
await page.waitForTimeout(900);
await page.evaluate(() => (document.getElementById('menu-tutorial') as HTMLButtonElement | null)?.click());
await page.waitForTimeout(2200);
const tut = await page.evaluate(() => ({
  glass: !!document.querySelector('#futasaku-glass'),
  copy: document.querySelector('#futasaku-glass .glass-copy')?.textContent?.trim() ?? '',
  board: document.querySelectorAll('#board .hex-cell').length,
}));
check('tutorial opens with its board', tut.glass && tut.board > 0, `copy "${tut.copy}" tiles ${tut.board}`);
await page.screenshot({ path: '/tmp/live-walk-tutorial.png' });

// ---- 6. a real game starts (offline, from a clean profile) ------------------------------------
await page.goto(BASE, { waitUntil: 'load' });
await page.evaluate(() => {
  for (const k of Object.keys(localStorage)) if (k.includes('severgrow')) localStorage.removeItem(k);
});
await page.reload({ waitUntil: 'load' });
// Wait for the menu to actually REVEAL its product controls rather than guessing a delay: boot
// awaits a network probe before showing them (the defect this walk found), so a fixed short wait
// measured the delay instead of the game. Explicit waits keep this honest.
await page.waitForFunction(() => {
  const el = document.getElementById('menu-play');
  return !!el && !el.hidden;
}, undefined, { timeout: 20000 });
await page.evaluate(() => (document.getElementById('menu-play') as HTMLButtonElement | null)?.click());
await page.waitForSelector('#play-menu:not([hidden])', { timeout: 10000 });
await page.evaluate(() => (document.getElementById('menu-new') as HTMLButtonElement | null)?.click());
// Getting into a game by automation is the fragile part of this walk, so it is reported as a
// warning rather than a failure: the offline game is covered exhaustively by the e2e suites. The
// live-specific risks this walk exists for are the menu, the world map and the tutorial.
let gameOk = true;
let gameDetail = '';
try {
  await page.waitForSelector('#level-grid button', { state: 'visible', timeout: 10000 });
  await page.evaluate(() => {
    const easy = document.querySelector('#level-grid [data-difficulty="easy"]') as HTMLElement | null;
    (easy ?? (document.querySelector('#level-grid button') as HTMLElement | null))?.click();
  });
  await page.waitForSelector('#board .hex-cell', { timeout: 15000 });
  await page.waitForTimeout(1500);
  const game = await page.evaluate(() => ({
    tiles: document.querySelectorAll('#board .hex-cell').length,
    hand: document.querySelectorAll('#hand .card').length,
    turn: document.getElementById('turn')?.textContent?.trim() ?? '',
  }));
  gameOk = game.tiles > 0 && game.hand > 0;
  gameDetail = `${game.tiles} tiles, ${game.hand} cards, turn "${game.turn}"`;
  await page.screenshot({ path: '/tmp/live-walk-game.png' });
} catch (e) {
  gameOk = false;
  // Say WHAT was on screen instead of only that it failed - if the levels screen never opened, that
  // is a real defect and the dump names it.
  const seen = await page.evaluate(() => {
    const ids = ['menu', 'play-menu', 'levels', 'game', 'campaign'];
    return ids.map((id) => {
      const el = document.getElementById(id) as HTMLElement | null;
      return `${id}=${!el ? 'missing' : el.hidden ? 'hidden' : 'shown'}`;
    }).join(' ');
  }).catch(() => 'could not read screens');
  gameDetail = `could not drive into a game via automation (${String(e).slice(0, 50)}); screens: ${seen}`;
}
check('a game starts with a board and a hand', gameOk, gameDetail);

// ---- report -----------------------------------------------------------------------------------
console.log(`\nlive walk at 390x844  (${BASE})\n`);
for (const r of results) console.log(`  ${r.ok ? 'OK  ' : 'FAIL'}  ${r.step.padEnd(34)} ${r.detail}`);
const bad = results.filter((r) => !r.ok);
console.log(`\n  ${bad.length === 0 ? 'ALL STEPS OK' : `${bad.length} STEP(S) FAILED`}`);
console.log(`\n  console/page errors: ${errors.length}`);
for (const e of errors.slice(0, 8)) console.log(`    - ${e}`);
console.log(`  failed/4xx requests: ${failedRequests.length}`);
for (const f of [...new Set(failedRequests)].slice(0, 8)) console.log(`    - ${f}`);
if (dialogs.length) {
  console.log(`  native dialogs the app popped: ${dialogs.length}`);
  for (const d of [...new Set(dialogs)]) console.log(`    - ${d}`);
}
console.log('\n  screenshots: /tmp/live-walk-{world,tutorial,game}.png');

await browser.close();
process.exit(bad.length === 0 ? 0 : 1);
