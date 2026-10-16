// Main-menu structure shots for the FUTASAKU 0.5 menu restructure (2026-10-15): the main menu with
// its LOG IN button, the PLAY submenu, the three TRAINING tiers and the signed-in menu.
//
//   npx tsx web/e2e/menu-shots.ts
//   PW_CHROMIUM=/path/to/chrome npx tsx web/e2e/menu-shots.ts
//
// It builds `web/dist` for `CHANNEL=futa04` with the Google accounts module switched ON against a
// FAKE Supabase (every `/auth/v1/*` call is answered by the test, never a real project), serves it
// with `vite preview`, and writes docs/screens/menu/*.png at 360x640 and 390x844. It also asserts
// what each shot is supposed to show, so a shot cannot silently go stale.
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
import type { Browser, Page } from 'playwright-core';
import { preview } from 'vite';
import { CHROME } from './helpers/local-duel.js';

const OUT = new URL('../../docs/screens/menu/', import.meta.url).pathname;
const PORT = Number(process.env.PORT ?? 4288);
const SUPA = 'https://fake-supabase.example';
const API = 'https://fake-duel.example';
/** The storage prefix a `CHANNEL=futa04`, non-preview-path build installs (web/src/channel.ts). */
const PREFIX = 'main2:';

const VIEWPORTS = [
  { key: '360x640', width: 360, height: 640 },
  { key: '390x844', width: 390, height: 844 },
];

let failed = 0;
const check = (name: string, ok: boolean, note = '') => {
  if (!ok) failed += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? `  (${note})` : ''}`);
};

// ---- build the product channel with accounts on, against a fake Supabase ----
await new Promise<void>((resolve, reject) => {
  const child = spawn(process.execPath, ['./node_modules/vite/bin/vite.js', 'build', '--config', 'web/vite.config.ts'], {
    env: {
      ...process.env,
      CHANNEL: 'futa04',
      VITE_ACCOUNTS: 'on',
      VITE_SUPABASE_URL: SUPA,
      VITE_SUPABASE_ANON_KEY: 'fake-anon',
      VITE_DUEL_API_URL: API,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let err = '';
  child.stderr?.on('data', (b) => (err += String(b)));
  child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(err))));
});

mkdirSync(OUT, { recursive: true });
const server = await preview({ configFile: 'web/vite.config.ts', preview: { host: '127.0.0.1', port: PORT, strictPort: true }, logLevel: 'error' });
const origin = server.resolvedUrls?.local?.[0]?.replace(/\/$/, '') ?? `http://127.0.0.1:${PORT}`;
const browser: Browser = await chromium.launch({ executablePath: CHROME });

/** The fake Supabase answers the one question the account module asks: is Google switched on? */
const fakeSupabase = (page: Page) =>
  page.route('**/auth/v1/settings', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ external: { google: true } }) }));

const device = async (vp: { width: number; height: number }, signedIn: boolean, shot: string) => {
  const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1, hasTouch: vp.width < 800, isMobile: vp.width < 800 });
  const page = await context.newPage();
  await fakeSupabase(page);
  await page.addInitScript(
    ([prefix, on, guard]) => {
      if (sessionStorage.getItem(guard)) return;
      sessionStorage.setItem(guard, '1');
      localStorage.clear();
      if (!on) return;
      // A signed-in device: the identity and its Google account record (the same checks `signedIn`
      // makes). No token is used, because nothing in these shots talks to the API.
      localStorage.setItem(`${prefix}severgrow.duel.identity.v1`, JSON.stringify({ token: 't', playerId: 'p1', displayName: 'Ann', kind: 'account' }));
      localStorage.setItem(`${prefix}futasaku.account.v1`, JSON.stringify({ provider: 'google', email: 'ann@gmail.com', playerId: 'p1' }));
    },
    [PREFIX, signedIn, `menu-shots-${shot}`] as const,
  );
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#menu:not([hidden])', { timeout: 40_000 });
  // The account module is a late dynamic import: wait until it has finished probing, so LOG IN's
  // hidden state is final before the shot.
  await page.waitForFunction(() => document.body.classList.contains('acct-on'), undefined, { timeout: 40_000 }).catch(() => undefined);
  await page.waitForTimeout(600);
  return { context, page };
};

const shotName = async (page: Page, name: string) => {
  const path = `${OUT}${name}.png`;
  await page.screenshot({ path });
  console.log(`   ${path.split('/').pop()}`);
};

/**
 * The ONE action that leads on a screen: the buttons inside `scope` that are really on screen AND
 * carry the cream fill. The owner's rule is exactly one (PLAY on the menu, Play online in the
 * submenu); "all filled" and "all contour" are both failures.
 */
const leaders = (page: Page, scope: string) =>
  page.evaluate((s) => [...document.querySelectorAll(`${s} .btn`) as unknown as Iterable<HTMLElement>]
    .filter((b) => b.getClientRects().length > 0 && b.classList.contains('primary'))
    .map((b) => b.id), scope);

try {
  for (const vp of VIEWPORTS) {
    // ---- 1. the main menu, signed out: LOG IN at the top, PLAY (the one leader), then the world
    //         map, Tutorial and Settings ----
    {
      const { context, page } = await device(vp, false, `out-${vp.key}`);
      const loginBox = await page.locator('#menu-login').boundingBox();
      const playBox = await page.locator('#menu-play').boundingBox();
      check(`${vp.key}: LOG IN is visible on the signed-out menu`, await page.locator('#menu-login').isVisible());
      check(`${vp.key}: LOG IN sits above PLAY`, !!loginBox && !!playBox && loginBox.y < playBox.y);
      const order = await page.evaluate(() => [...document.querySelectorAll('#menu .menu-buttons > .btn')]
        .filter((b) => (b as HTMLElement).getClientRects().length > 0).map((b) => b.id));
      check(`${vp.key}: the menu reads LOG IN / PLAY / Territory / Tutorial / Settings`,
        JSON.stringify(order) === JSON.stringify(['menu-login', 'menu-play', 'menu-world', 'menu-tutorial', 'menu-settings']), order.join(' | '));
      check(`${vp.key}: exactly one filled button on the menu, and it is PLAY`,
        JSON.stringify(await leaders(page, '#menu')) === JSON.stringify(['menu-play']), (await leaders(page, '#menu')).join(' | '));
      // Five entries must fit a 360x640 phone without the column scrolling or the page widening.
      const fit = await page.evaluate(() => {
        const inner = document.querySelector('#menu .menu-inner')!;
        return { overflow: inner.scrollHeight - inner.clientHeight, wide: document.documentElement.scrollWidth > window.innerWidth };
      });
      check(`${vp.key}: the signed-out menu fits without scrolling or widening`, fit.overflow <= 0 && !fit.wide, `overflow ${fit.overflow}px`);
      await shotName(page, `menu-signed-out-${vp.key}`);
      await context.close();
    }

    // ---- 2. the PLAY submenu: Play online / LEVEL n / Training, and a way back ----
    {
      const { context, page } = await device(vp, false, `play-${vp.key}`);
      await page.click('#menu-play');
      await page.waitForSelector('#play-menu:not([hidden])', { timeout: 10_000 });
      await page.waitForTimeout(400);
      check(`${vp.key}: the submenu takes over the menu`, !(await page.locator('#menu').isVisible()));
      check(`${vp.key}: the PLAY heading reads Play`, (await page.textContent('#play-title'))?.trim() === 'Play');
      const entries = await page.locator('#play-actions button').allTextContents();
      check(`${vp.key}: PLAY holds Play online / LEVEL n / Training`, JSON.stringify(entries) === JSON.stringify(['Play online', 'LEVEL 1', 'Training']), entries.join(' | '));
      check(`${vp.key}: exactly one filled button in the submenu, and it is Play online`,
        JSON.stringify(await leaders(page, '#play-menu')) === JSON.stringify(['menu-online']), (await leaders(page, '#play-menu')).join(' | '));
      const fit = await page.evaluate(() => {
        const inner = document.querySelector('#play-menu .levels-inner')!;
        return inner.scrollHeight - inner.clientHeight;
      });
      check(`${vp.key}: the submenu column fits without scrolling`, fit <= 0, `overflow ${fit}px`);
      await shotName(page, `play-submenu-${vp.key}`);
      await context.close();
    }

    // ---- 3. the three TRAINING tiers (PLAY -> Training) ----
    {
      const { context, page } = await device(vp, false, `training-${vp.key}`);
      await page.click('#menu-play');
      await page.click('#menu-new');
      await page.waitForSelector('#levels:not([hidden])', { timeout: 10_000 });
      await page.waitForTimeout(400);
      check(`${vp.key}: the training heading reads Training`, (await page.textContent('#levels-heading'))?.trim() === 'Training');
      const tiers = await page.locator('#level-grid .difficulty-tile').allTextContents();
      check(`${vp.key}: three tiers EASY / MEDIUM / HARD`, JSON.stringify(tiers) === JSON.stringify(['EASY', 'MEDIUM', 'HARD']), tiers.join(' | '));
      await shotName(page, `training-tiers-${vp.key}`);
      await context.close();
    }

    // ---- 4. the main menu, signed in: no LOG IN ----
    {
      const { context, page } = await device(vp, true, `in-${vp.key}`);
      check(`${vp.key}: LOG IN is gone once signed in`, !(await page.locator('#menu-login').isVisible()));
      await shotName(page, `menu-signed-in-${vp.key}`);
      await context.close();
    }

    // ---- 5. the world map entry really opens the map, and its back returns HERE (not to the
    //         online hub) ----
    {
      const { context, page } = await device(vp, false, `world-${vp.key}`);
      await page.route('**/v1/world', (r) => r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true, world: { version: 1, revision: 2, cost: 100,
            cells: [{ id: '0,0', q: 0, r: 0 }, { id: '1,0', q: 1, r: 0 }],
            claims: [
              { cellId: '0,0', ownerId: 'a', ownerName: 'BloomHeron', ownerTag: '1001', colour: 'hsl(80 34% 49%)', claimedAt: Date.now() },
              { cellId: '1,0', ownerId: 'b', ownerName: 'WillowBirch', ownerTag: '1002', colour: 'hsl(220 34% 49%)', claimedAt: Date.now() },
            ] },
        }),
      }));
      await page.click('#menu-world');
      await page.waitForSelector('#online-world-screen:not([hidden])', { timeout: 10_000 });
      await page.waitForTimeout(500);
      const held = await page.locator('#online-world-grid .world-hex.held').count();
      check(`${vp.key}: the world map opens from the main menu with the map drawn`, held === 2, `${held} held cells`);
      await page.click('#online-world-back');
      await page.waitForTimeout(300);
      check(`${vp.key}: its back control returns to the main menu, never to the online hub`,
        (await page.locator('#menu').isVisible()) && !(await page.locator('#online-hub').isVisible()));
      await context.close();
    }

    // ---- 6. the saved-game resume survives a reload (the regression guard, 2026-10-15) ----
    // A player who reloads with a saved match MUST be offered Continue on the fresh menu: it is the
    // only way back into that match. The boot shows the menu while `shownScreen` may already say
    // 'menu' (returning from PLAY sets it back), so the reveal must not depend on "the screen
    // changed". Seeded from the URL: the game starts at once, is played one real turn, and the page
    // is then reloaded WITHOUT the query, exactly as a player who taps the browser's reload does.
    {
      const { context, page } = await device(vp, false, `resume-${vp.key}`);
      page.on('dialog', (d) => void d.accept());
      // Speed off and Reduce motion on, exactly as the other suites boot: the deck and the board must
      // be still enough to tap (and the state compared afterwards must be the settled one).
      await page.evaluate(([prefix, settings]) => localStorage.setItem(`${prefix}severgrow.settings.v1`, settings), [PREFIX, JSON.stringify({ sound: false, music: false, coach: false, speed: 'fast', reduceMotion: true, autoSkip: false, confirmPolicy: 'always' })] as const);
      await page.goto(`${origin}/?seed=219682080`, { waitUntil: 'domcontentloaded' });
      // String expressions (not arrow functions): tsx wraps named helpers the page does not have.
      const settled = `(() => { const h = window.__severgrow; const lottery = document.getElementById('starter-lottery');
        return !!h && !!h.state() && !h.busy() && h.state().actor === 0 && !!lottery && lottery.hidden; })()`;
      await page.waitForFunction(settled, undefined, { timeout: 40_000 });
      // A real tap on the deck: the pile carries its own idle animation, so click its centre with
      // the mouse rather than waiting for Playwright's "stable" gate.
      const deck = await page.locator('#deck').boundingBox();
      await page.mouse.click(deck!.x + deck!.width / 2, deck!.y + deck!.height / 2);
      await page.waitForFunction(settled, undefined, { timeout: 40_000 });
      const saved = await page.evaluate('JSON.stringify(window.__severgrow.state())');
      await page.evaluate(() => history.replaceState(null, '', location.pathname));
      await page.reload();
      await page.waitForSelector('#menu:not([hidden])', { timeout: 40_000 });
      // Poll for the reveal (the menu section is unhidden a beat before its buttons are styled).
      const offered = await page.locator('#menu-continue').waitFor({ state: 'visible', timeout: 20_000 }).then(() => true).catch(() => false);
      check(`${vp.key}: a reload with a saved game still offers Continue`, offered);
      await page.click('#menu-continue');
      await page.waitForFunction(settled, undefined, { timeout: 40_000 });
      const resumed = await page.evaluate('JSON.stringify(window.__severgrow.state())');
      check(`${vp.key}: Continue resumes the exact saved game`, resumed === saved);
      await context.close();
    }
  }
} finally {
  await browser.close().catch(() => undefined);
  await server.close().catch(() => undefined);
}

if (failed) {
  console.error(`\n${failed} menu shot check(s) failed`);
  process.exit(1);
}
console.log(`\nmenu shots written to docs/screens/menu/ (${VIEWPORTS.length} viewports)`);
