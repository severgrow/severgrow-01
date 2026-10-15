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

try {
  for (const vp of VIEWPORTS) {
    // ---- 1. the main menu, signed out: LOG IN at the top, PLAY below it ----
    {
      const { context, page } = await device(vp, false, `out-${vp.key}`);
      const loginBox = await page.locator('#menu-login').boundingBox();
      const playBox = await page.locator('#menu-play').boundingBox();
      check(`${vp.key}: LOG IN is visible on the signed-out menu`, await page.locator('#menu-login').isVisible());
      check(`${vp.key}: LOG IN sits above PLAY`, !!loginBox && !!playBox && loginBox.y < playBox.y);
      check(`${vp.key}: PLAY is visible`, await page.locator('#menu-play').isVisible());
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
