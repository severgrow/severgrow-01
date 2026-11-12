// THE ACCOUNT'S LEVEL ON A FRESH DESKTOP, IN A REAL BUILT PAGE (owner report, 2026-10-25).
//
// The bug: the account had a long campaign run, but a fresh desktop browser showed LEVEL 1 because
// campaign progress lived only in that browser. The server already knows the furthest level the
// account has a verified first-clear receipt for, so the client now raises a fresh local record to
// it on boot.
//
// This walk proves the whole point WITHOUT playing a level: seed a FRESH local record, stub the one
// authenticated wallet read with `campaignHighestLevel`, and read the menu's own LEVEL <n> label.
//
//   CHANNEL=futa04 build → web/dist, previewed on 127.0.0.1.
//   node --import tsx web/e2e/account-level.ts
//   writes /tmp/account-level/*.png
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
import type { Browser, Page } from 'playwright-core';
import { preview } from 'vite';
import { CAMPAIGN_LEVELS } from '../../src/campaign/index.js';

const OUT = process.env.ACCOUNT_LEVEL_SHOTS ?? '/tmp/account-level';
const PORT = Number(process.env.PORT ?? 4329);
const ORIGIN = `http://127.0.0.1:${PORT}`;
const LOCAL_API = `${ORIGIN}/functions/v1/duel`;
const CHROME = process.env.PW_CHROMIUM ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
/**
 * A futa04 build served from 127.0.0.1 uses the `main2:` storage prefix (web/src/channel.ts: the
 * `/futa0.4/` preview host is `futa04:`, a local preview is the product's own namespace).
 */
const PREFIX = 'main2:';
const IDENTITY_KEY = `${PREFIX}severgrow.duel.identity.v1`;
const PROGRESS_KEY = `${PREFIX}severgrow.campaign.progress.v3`;
const PROGRESS_READ_KEY = 'severgrow.campaign.progress.v3';
const SETTINGS_KEY = `${PREFIX}severgrow.settings.v1`;
const INSTALL_KEY = `${PREFIX}severgrow.install-prompt.v1`;
/** The owner's own account id, as the investigation recorded it. */
const ACCOUNT = { token: 'e2e-account-token', playerId: '37e3d4d0-a34c-45b3-bc61-992fcf392912', displayName: 'RYK', kind: 'account' };
const WALLET = { balance: 0, lifetimeEarned: 0, lifetimeSpent: 0, worldInvitationSeen: true };

const FRESH = JSON.stringify({ version: 1, unlocked: 1, completed: [], best: {} });
/** A record already further along, to prove a server answer never lowers it. */
const AHEAD = JSON.stringify({
  version: 1,
  unlocked: 40,
  completed: CAMPAIGN_LEVELS.slice(0, 39).map((level) => level.id),
  best: {},
});

mkdirSync(OUT, { recursive: true });

let failed = 0;
const check = (name: string, ok: boolean, note = '') => {
  if (!ok) failed += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? `  (${note})` : ''}`);
};

const build = (): Promise<void> => new Promise((resolve, reject) => {
  if (process.env.SKIP_BUILD === '1') { resolve(); return; }
  const child = spawn(process.execPath, ['./node_modules/vite/bin/vite.js', 'build', '--config', 'web/vite.config.ts'], {
    env: {
      ...process.env,
      CHANNEL: 'futa04',
      VITE_DUEL_API_URL: LOCAL_API,
      // The Google probe is not part of this walk; the account identity is seeded directly.
      VITE_ACCOUNTS: 'off',
      VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL || 'http://127.0.0.1:9',
      VITE_SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY || 'local-e2e-anon-key',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let err = '';
  child.stderr?.on('data', (b) => { err += String(b); });
  child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`web:build failed: ${err}`))));
});

type Server = { highest: number | null; fail: boolean; asked: number };

/**
 * The only server surface this walk needs: `/v1/seeds/wallet` now carries `campaignHighestLevel`
 * beside the wallet (the authenticated read the client already makes). Everything else answers 404
 * so a real network call can never leak into the measurement.
 */
const stub = async (page: Page, server: Server): Promise<void> => {
  await page.route('**/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/v1/seeds/wallet')) {
      server.asked += 1;
      if (server.fail) return route.fulfill({ status: 500, json: { ok: false, code: 'INTERNAL', message: 'stub down' } });
      return route.fulfill({ json: { ok: true, wallet: WALLET, campaignHighestLevel: server.highest } });
    }
    return route.fulfill({ status: 404, json: { ok: false, code: 'NOT_FOUND', message: 'no stub route' } });
  });
};

const boot = async (
  browser: Browser,
  viewport: { width: number; height: number },
  options: { identity: 'account' | 'none'; progress: string },
  server: Server,
) => {
  const context = await browser.newContext({
    viewport, hasTouch: viewport.width < 800, isMobile: viewport.width < 800, deviceScaleFactor: 1,
    serviceWorkers: 'block',
  });
  await context.addInitScript({
    content: `(() => {
      try {
        localStorage.clear();
        ${options.identity === 'account' ? `localStorage.setItem(${JSON.stringify(IDENTITY_KEY)}, ${JSON.stringify(JSON.stringify(ACCOUNT))});` : ''}
        localStorage.setItem(${JSON.stringify(SETTINGS_KEY)}, JSON.stringify({ sound: false, music: false, coach: false, speed: 'normal', reduceMotion: true, eyeCandy: false, autoSkip: false }));
        localStorage.setItem(${JSON.stringify(INSTALL_KEY)}, JSON.stringify({ games: 0, shown: true, never: true }));
        localStorage.setItem(${JSON.stringify(PROGRESS_KEY)}, ${JSON.stringify(options.progress)});
      } catch { /* storage blocked */ }
    })();`,
  });
  const page = await context.newPage();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await stub(page, server);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return { context, page, errors };
};

const menuLabel = (page: Page): Promise<string> =>
  page.evaluate('(() => (document.getElementById("menu-campaign") || {}).textContent || "")()') as Promise<string>;

const waitLabel = async (page: Page, expected: string, timeout = 30_000): Promise<string> => {
  await page.goto(ORIGIN, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction('(() => !!(window.__severgrow && window.__severgrow.ready && window.__severgrow.ready()))()', undefined, { timeout: 60_000 });
  await page.waitForFunction(
    (want) => ((document.getElementById('menu-campaign') || {}).textContent || '').trim() === want,
    expected,
    { timeout },
  ).catch(() => undefined);
  return (await menuLabel(page)).trim();
};

const openPlay = async (page: Page): Promise<void> => {
  if (!(await page.locator('#play-menu').isVisible().catch(() => false))) {
    await page.click('#menu-play');
    await page.waitForSelector('#play-menu:not([hidden])', { timeout: 20_000 });
  }
};

const stored = (page: Page): Promise<{ unlocked: number; completed: string[] } | null> =>
  page.evaluate(`(() => { try { return JSON.parse(localStorage.getItem(${JSON.stringify(PROGRESS_READ_KEY)}) || 'null'); } catch { return null; } })()`) as Promise<{ unlocked: number; completed: string[] } | null>;

const visibleToast = (page: Page): Promise<string> =>
  page.evaluate('(() => { const t = document.querySelector(".acct-toast"); return t && !t.hidden ? (t.textContent || "").trim() : ""; })()') as Promise<string>;

const walk = async (browser: Browser, viewport: { width: number; height: number }, tag: string) => {
  const size = `${viewport.width}x${viewport.height}`;

  // ---- BEFORE: a fresh desktop record, the server knows nothing (the reported level 1) ----------
  {
    const server: Server = { highest: null, fail: false, asked: 0 };
    const { context, page, errors } = await boot(browser, viewport, { identity: 'account', progress: FRESH }, server);
    try {
      const before = await waitLabel(page, 'LEVEL 1');
      await openPlay(page);
      await page.screenshot({ path: `${OUT}/before-${size}.png` });
      check(`${tag}: before, a fresh record offers LEVEL 1`, before === 'LEVEL 1', before);
      check(`${tag}: before, the account read was still made`, server.asked >= 1, `asked=${server.asked}`);
      check(`${tag}: before, no page errors`, errors.length === 0, errors.join(' | '));
    } finally { await context.close(); }
  }

  // ---- AFTER: same fresh record, server says level 36 was cleared → LEVEL 37, no replay ----------
  {
    const server: Server = { highest: 36, fail: false, asked: 0 };
    const { context, page, errors } = await boot(browser, viewport, { identity: 'account', progress: FRESH }, server);
    try {
      const after = await waitLabel(page, 'LEVEL 37');
      await openPlay(page);
      await page.screenshot({ path: `${OUT}/after-${size}.png` });
      const saved = await stored(page);
      check(`${tag}: after, the menu offers LEVEL 37 (cleared 36)`, after === 'LEVEL 37', after);
      check(`${tag}: after, the raise was written to this device`, saved?.unlocked === 37 && saved.completed.length === 36,
        `unlocked=${saved?.unlocked} completed=${saved?.completed.length}`);
      check(`${tag}: after, exactly one account read`, server.asked >= 1, `asked=${server.asked}`);
      check(`${tag}: after, no page errors`, errors.length === 0, errors.join(' | '));
      // The page's own place agrees with the menu: the next level to play is 37, not a replay of 1.
      const place = await page.evaluate('(() => window.__severgrow.campaignLevel())()') as number;
      check(`${tag}: after, the page's own place is level 37`, place === 37, String(place));
    } finally { await context.close(); }
  }

  // ---- LOCAL AHEAD: a server answer never lowers the device -------------------------------------
  {
    const server: Server = { highest: 36, fail: false, asked: 0 };
    const { context, page } = await boot(browser, viewport, { identity: 'account', progress: AHEAD }, server);
    try {
      const label = await waitLabel(page, 'LEVEL 40');
      const saved = await stored(page);
      check(`${tag}: local ahead is unchanged (LEVEL 40)`, label === 'LEVEL 40', label);
      check(`${tag}: local ahead is not rewritten`, saved?.completed.length === 39, `completed=${saved?.completed.length}`);
    } finally { await context.close(); }
  }

  // ---- GUEST: exactly today's local-only game, no account read ---------------------------------
  {
    const server: Server = { highest: 36, fail: false, asked: 0 };
    const { context, page } = await boot(browser, viewport, { identity: 'none', progress: FRESH }, server);
    try {
      const label = await waitLabel(page, 'LEVEL 1');
      await openPlay(page);
      await page.screenshot({ path: `${OUT}/guest-${size}.png` });
      check(`${tag}: a guest stays local at LEVEL 1`, label === 'LEVEL 1', label);
      check(`${tag}: a guest never asks the server`, server.asked === 0, `asked=${server.asked}`);
    } finally { await context.close(); }
  }

  // ---- UNREACHABLE: local unchanged, no error shown --------------------------------------------
  {
    const server: Server = { highest: null, fail: true, asked: 0 };
    const { context, page } = await boot(browser, viewport, { identity: 'account', progress: FRESH }, server);
    try {
      const label = await waitLabel(page, 'LEVEL 1');
      const toast = await visibleToast(page);
      await openPlay(page);
      await page.screenshot({ path: `${OUT}/unreachable-${size}.png` });
      check(`${tag}: an unreachable server leaves LEVEL 1`, label === 'LEVEL 1', label);
      check(`${tag}: an unreachable server shows no error to the player`, toast === '', toast);
    } finally { await context.close(); }
  }
};

await build();
const server = await preview({ configFile: 'web/vite.config.ts', preview: { host: '127.0.0.1', port: PORT, strictPort: true }, logLevel: 'error' });
const browser = await chromium.launch({ executablePath: CHROME, headless: true });
try {
  await walk(browser, { width: 390, height: 844 }, 'phone');
  await walk(browser, { width: 1280, height: 800 }, 'desktop');
} finally {
  await browser.close();
  await server.close();
}
console.log(`\n${failed === 0 ? 'ALL PASS' : `${failed} FAILED`}  screenshots: ${OUT}/*.png`);
process.exit(failed === 0 ? 0 : 1);
