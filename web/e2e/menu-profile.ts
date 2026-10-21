// THE MENU FOOTER + PLAYER PROFILE SKELETON in a real browser (owner brief, 2026-10-21).
//
//   PW_CHROMIUM="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" npx tsx web/e2e/menu-profile.ts
//   SHOTS=1 ... also writes docs/screens/menu-footer/*.png
//
// What it proves, against the built futa05 page (never a real Supabase project):
//   1. signed out, the bottom row is LOG IN (left) and Settings (right), both the owner's 50px key;
//   2. signed in (a local fixture: identity + Google account record), the SAME left key carries the
//      player's name, and its spoken label says whose profile it opens;
//   3. pressing that key opens the profile sheet with EXACTLY five rows, and — with no reachable
//      API in this build — Seeds, tiles and matches won are em dashes, never a fake 0;
//   4. the profile closes on Escape and hands focus back to the key, and it is reachable by
//      keyboard (focus the key, press Enter);
//   5. at 320x568 the profile fits without scrolling and the sheet traps nothing.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { chromium } from 'playwright-core';
import type { Browser, Page } from 'playwright-core';
import { PROFILE } from '../../src/strings.js';
import { SEEDS_WORD } from '../src/online/seed-icon.js';

const DIST = process.env.FUTA_DIST ?? 'web/dist';
const SHOTS = process.env.SHOTS === '1';
const SUPA = 'https://example.supabase.co';
const API = `${SUPA}/functions/v1/duel`;
let failed = 0;
const check = (name: string, ok: boolean, note = '') => {
  if (!ok) failed += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? `  (${note})` : ''}`);
};
const waitFor = async (cond: () => Promise<boolean> | boolean, timeout = 15_000): Promise<boolean> => {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      if (await cond()) return true;
    } catch {
      /* navigating */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  return false;
};

// ---- build the 0.5 product channel with accounts ON, against the placeholder project ----
await new Promise<void>((resolve, reject) => {
  const child = spawn(process.execPath, ['./node_modules/vite/bin/vite.js', 'build', '--config', 'web/vite.config.ts'], {
    env: {
      ...process.env,
      CHANNEL: 'futa05',
      VITE_ACCOUNTS: 'on',
      VITE_SUPABASE_URL: SUPA,
      VITE_SUPABASE_ANON_KEY: 'local',
      VITE_DUEL_API_URL: API,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let err = '';
  child.stderr?.on('data', (b) => (err += String(b)));
  child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(err))));
});

// ---- serve the built page ----
const types: Record<string, string> = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.webp': 'image/webp', '.webmanifest': 'application/manifest+json', '.json': 'application/json',
};
const server = createServer((req, res) => {
  const path = decodeURIComponent((req.url ?? '/').split('?')[0]!);
  let file = join(DIST, path || 'index.html');
  if (!existsSync(file) || file.endsWith('/')) file = join(DIST, 'index.html');
  res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' });
  res.end(readFileSync(file));
});
await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
if (SHOTS) mkdirSync('docs/screens/menu-footer', { recursive: true });

const browser: Browser = await chromium.launch({
  ...(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}),
  args: ['--no-sandbox'],
});

const shot = async (page: Page, name: string) => {
  if (!SHOTS) return;
  await page.screenshot({ path: `docs/screens/menu-footer/${name}.png` });
};

/** The fake Supabase answers the ONE probe the accounts module makes; every API call fails fast. */
const fakeNetwork = (page: Page) =>
  page.route('**/*', (route) => {
    const url = route.request().url();
    if (!url.startsWith(SUPA)) return route.continue();
    if (url.includes('/auth/v1/settings')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ external: { google: true } }) });
    }
    // No reachable duel API: the wallet/world reads fail, which is exactly the unknown-value case.
    return route.fulfill({ status: 503, contentType: 'application/json', body: '{}' });
  });

/** The storage prefix a futa05 build installs (web/src/channel.ts). */
const PREFIX = 'futa05:';
const device = async (opts: { w: number; h: number; signedIn: boolean }) => {
  const context = await browser.newContext({
    viewport: { width: opts.w, height: opts.h },
    hasTouch: opts.w < 800,
    isMobile: opts.w < 800,
  });
  const page = await context.newPage();
  await fakeNetwork(page);
  if (opts.signedIn) {
    await page.addInitScript(
      ([prefix]) => {
        localStorage.clear();
        localStorage.setItem(`${prefix}severgrow.duel.identity.v1`, JSON.stringify({ token: 'fixture-token', playerId: 'fixture-player', displayName: 'Ann', kind: 'account' }));
        localStorage.setItem(`${prefix}futasaku.account.v1`, JSON.stringify({ provider: 'google', email: 'ann@gmail.com', playerId: 'fixture-player' }));
      },
      [PREFIX] as const,
    );
  } else {
    await page.addInitScript(() => localStorage.clear());
  }
  await page.goto(`${origin}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#menu:not([hidden]) .menu-inner', { timeout: 40_000 });
  // The accounts module is a late dynamic import; its probe must finish before reading the key.
  await waitFor(() => page.evaluate("document.body.classList.contains('acct-on')") as Promise<boolean>, 40_000);
  await page.waitForTimeout(300);
  return { context, page };
};

const tag = (name: string) => name.replace(/[^a-z0-9]+/gi, '-').toLowerCase();

try {
  // ---- 1. signed out: LOG IN left, Settings right, one 50px row ----
  {
    const { context, page } = await device({ w: 360, h: 640, signedIn: false });
    const foot = await page.evaluate(`(() => {
      const el = document.getElementById('menu-foot');
      const login = document.getElementById('menu-login');
      const settings = document.getElementById('menu-settings');
      const b = (n) => { const r = n.getBoundingClientRect(); return { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1), right: +r.right.toFixed(1), bottom: +r.bottom.toFixed(1) }; };
      return {
        role: el.getAttribute('role'),
        label: el.getAttribute('aria-label'),
        loginHidden: login.hidden,
        loginText: (login.textContent || '').trim(),
        loginAria: login.getAttribute('aria-label'),
        login: b(login),
        settings: b(settings),
      };
    })()`) as {
      role: string; label: string; loginHidden: boolean; loginText: string; loginAria: string;
      login: { x: number; y: number; w: number; h: number; right: number; bottom: number };
      settings: { x: number; y: number; w: number; h: number; right: number; bottom: number };
    };
    check('signed out: the footer is one labelled group', foot.role === 'group' && foot.label === 'Account and settings', `${foot.role}/${foot.label}`);
    check('signed out: the left key reads LOG IN', !foot.loginHidden && foot.loginText === 'LOG IN', JSON.stringify(foot.loginText));
    check('signed out: its spoken name is LOG IN', foot.loginAria === 'LOG IN', foot.loginAria ?? '');
    check('signed out: LOG IN is the LEFT key', foot.login.right <= foot.settings.x + 0.5, `${foot.login.right} ≤ ${foot.settings.x}`);
    check('signed out: Settings is the RIGHT key', foot.settings.x > foot.login.x, `${foot.settings.x} > ${foot.login.x}`);
    check('signed out: both keys are on one row', Math.abs(foot.login.y - foot.settings.y) <= 0.5, `${foot.login.y}/${foot.settings.y}`);
    check('signed out: both keys are 50px', Math.abs(foot.login.h - 50) <= 0.5 && Math.abs(foot.settings.h - 50) <= 0.5, `${foot.login.h}/${foot.settings.h}`);
    // Every key on the menu is the same 50px instrument.
    const heights = (await page.evaluate(`[...document.querySelectorAll('#menu .menu-buttons .btn')].filter((b) => b.offsetParent !== null).map((b) => +b.getBoundingClientRect().height.toFixed(1))`)) as number[];
    check('signed out: every menu key is 50px', heights.length >= 3 && heights.every((h) => Math.abs(h - 50) <= 0.5), heights.join(','));
    // DOM order is tab order: the footer is last.
    const ids = (await page.evaluate(`[...document.querySelectorAll('#menu button')].filter((b) => b.offsetParent !== null).map((b) => b.id)`)) as string[];
    check('signed out: the tab order ends with the footer', JSON.stringify(ids.slice(-2)) === JSON.stringify(['menu-login', 'menu-settings']), ids.join(' → '));
    await shot(page, `menu-signed-out-${tag('360x640')}`);
    await context.close();
  }

  // ---- 2. signed in: the SAME key carries the name, and opens the five-line profile ----
  for (const size of [{ w: 360, h: 640 }, { w: 320, h: 568 }, { w: 844, h: 390 }] as const) {
    const label = `${size.w}x${size.h}`;
    const { context, page } = await device({ w: size.w, h: size.h, signedIn: true });
    const name = ((await page.locator('#menu-login').textContent()) ?? '').trim();
    check(`${label}: the left key shows the player's name`, name.startsWith('Ann #') && name.length > 5, name);
    const aria = (await page.locator('#menu-login').getAttribute('aria-label')) ?? '';
    check(`${label}: the key names the profile it opens`, aria === PROFILE.open(name), aria);

    await page.click('#menu-login');
    const open = await waitFor(() => page.locator('#sheet-profile').isVisible());
    check(`${label}: pressing it opens the profile`, open);
    // The sheet slides in on the acknowledgement beat; measure the settled sheet, not mid-slide.
    await page.waitForTimeout(400);
    const rows = (await page.evaluate(`(() => {
      const sheet = document.getElementById('sheet-profile');
      const ids = ['profile-name', 'profile-signin', 'profile-seeds', 'profile-tiles', 'profile-wins'];
      return {
        n: sheet.querySelectorAll('.sp-row').length,
        labels: [...sheet.querySelectorAll('.sp-row dt')].map((d) => d.textContent.trim()),
        values: ids.map((id) => (document.getElementById(id)?.textContent ?? '').trim()),
        role: sheet.getAttribute('role'),
        modal: sheet.getAttribute('aria-modal'),
        scroll: Math.max(0, sheet.scrollHeight - sheet.clientHeight),
        pageScroll: Math.max(0, document.documentElement.scrollHeight - innerHeight),
        bottom: +sheet.getBoundingClientRect().bottom.toFixed(1),
        vh: innerHeight,
      };
    })()`)) as { n: number; labels: string[]; values: string[]; role: string; modal: string | null; scroll: number; pageScroll: number; bottom: number; vh: number };
    check(`${label}: the profile has exactly five rows`, rows.n === 5, String(rows.n));
    check(`${label}: the five rows are name, sign-in, Seeds, tiles, matches won`,
      JSON.stringify(rows.labels) === JSON.stringify([PROFILE.name, PROFILE.signIn, SEEDS_WORD, PROFILE.tiles, PROFILE.matchesWon]), rows.labels.join(' | '));
    check(`${label}: the first row is the player's name`, rows.values[0] === name, rows.values[0] ?? '');
    check(`${label}: the sign-in row says signed in`, rows.values[1] === PROFILE.signedIn, rows.values[1] ?? '');
    // No API in this build: all three numbers are unknown, so all three are em dashes — never 0.
    check(`${label}: unknown Seeds are an em dash`, rows.values[2] === PROFILE.unknown, rows.values[2] ?? '');
    check(`${label}: unknown tiles are an em dash`, rows.values[3] === PROFILE.unknown, rows.values[3] ?? '');
    check(`${label}: an unknowable matches-won count is an em dash (never an invented 0)`, rows.values[4] === PROFILE.unknown, rows.values[4] ?? '');
    check(`${label}: the profile reads as a dialog that traps nothing`, rows.role === 'dialog' && rows.modal === null, `${rows.role}/${rows.modal}`);
    check(`${label}: the profile does not scroll`, rows.scroll <= 1 && rows.pageScroll <= 1, `${rows.scroll}/${rows.pageScroll}`);
    check(`${label}: the profile is fully inside the screen`, rows.bottom <= rows.vh + 0.5, `${rows.bottom} ≤ ${rows.vh}`);
    if (label === '360x640') await shot(page, 'profile-signed-in-360x640');
    if (label === '844x390') await shot(page, 'profile-landscape-844x390');

    // Escape closes it and hands focus back to the key that opened it.
    await page.keyboard.press('Escape');
    const closed = await waitFor(async () => !(await page.locator('#sheet-profile').isVisible()));
    const focus = (await page.evaluate('document.activeElement && document.activeElement.id')) as string;
    check(`${label}: Escape closes the profile`, closed);
    check(`${label}: closing returns focus to the account key`, focus === 'menu-login', focus);

    // It is reachable by keyboard, with no pointer at all.
    await page.locator('#menu-login').focus();
    await page.keyboard.press('Enter');
    check(`${label}: keyboard Enter opens the profile`, await waitFor(() => page.locator('#sheet-profile').isVisible()));
    await page.keyboard.press('Escape');
    await waitFor(async () => !(await page.locator('#sheet-profile').isVisible()));

    // The scrim is a way out too (a tap outside closes; nothing is trapped).
    if (size.w > 400) {
      await page.click('#menu-login');
      await waitFor(() => page.locator('#sheet-profile').isVisible());
      await page.locator('#profile-scrim').click({ position: { x: 5, y: 5 } });
      check(`${label}: a scrim tap closes the profile`, await waitFor(async () => !(await page.locator('#sheet-profile').isVisible())));
    }
    await shot(page, `menu-signed-in-${tag(label)}`);
    await context.close();
  }

  // ---- 3. no page errors on the way through ----
  {
    const { context, page } = await device({ w: 390, h: 844, signedIn: true });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.click('#menu-login');
    await waitFor(() => page.locator('#sheet-profile').isVisible());
    await page.keyboard.press('Escape');
    assert.deepEqual(errors, [], `no page errors: ${errors.join(' | ')}`);
    check('390x844: no page errors while opening and closing the profile', errors.length === 0);
    await context.close();
  }
} finally {
  await browser.close().catch(() => undefined);
  server.close();
}
console.log(`\n${failed === 0 ? 'ALL PASS' : `${failed} FAILED`}`);
process.exit(failed === 0 ? 0 : 1);
