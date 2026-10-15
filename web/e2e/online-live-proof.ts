// PHASE A live proof — two real browser contexts create guests and reach a lobby/duel on the
// LIVE site (or any BASE_URL). Catches CORS / baked-URL / guest-creation regressions that only
// show up in a browser (the preflight bug did not show up with curl).
//
//   npx tsx web/e2e/online-live-proof.ts
//   BASE_URL=https://severgrow.github.io/severgrow-01/futa0.5/ npx tsx web/e2e/online-live-proof.ts
import { chromium } from 'playwright-core';
import type { Browser, BrowserContext, ConsoleMessage, Page } from 'playwright-core';
import { DEFAULT_SERVER_CONFIG } from '../../server/src/config.js';
import { requireLocalOrRealProjectOptIn } from '../../server/scripts/real-project-guard.js';

const BASE_URL = (process.env.BASE_URL ?? 'https://severgrow.github.io/severgrow-01/futa0.5/').replace(/\/?$/, '/');
// The deployed site bakes the REAL Edge API into its bundle, so a non-loopback BASE_URL spends real
// quota: refuse (exit 3) unless FUTASAKU_REAL_PROJECT=1. A 127.0.0.1/localhost target is free.
requireLocalOrRealProjectOptIn('online-live-proof', BASE_URL);
const CHROME =
  process.env.PW_CHROMIUM ??
  '/Users/patryk/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';

let failed = 0;
const check = (name: string, ok: boolean, note = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? `  (${note})` : ''}`);
};

type Logged = { errors: string[]; forbidden: string[] };
const watch = (context: BrowserContext, page: Page, logged: Logged, label: string) => {
  page.on('console', (msg: ConsoleMessage) => {
    if (msg.type() === 'error') logged.errors.push(`[${label} console] ${msg.text()}`);
  });
  page.on('pageerror', (err) => logged.errors.push(`[${label} pageerror] ${err.message}`));
  context.on('response', (res) => {
    if (res.status() >= 400 && /supabase\.co|\/functions\/v1\/duel/.test(res.url())) {
      logged.errors.push(`[${label} http ${res.status()}] ${res.url()}`);
    }
  });
};

const openPlayer = async (browser: Browser, label: string, logged: Logged): Promise<Page> => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  watch(context, page, logged, label);
  await page.addInitScript(() => localStorage.clear());
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#menu:not([hidden])', { timeout: 20_000 });
  await page.waitForSelector('#menu-online:not([hidden])', { timeout: 20_000 });
  check(`${label}: Play online shown`, true);
  return page;
};

const dismissFirstCard = async (page: Page) => {
  const ok = page.locator('#online-first-ok');
  if (await ok.isVisible().catch(() => false)) await ok.click();
};

const identityPresent = (page: Page) =>
  page.evaluate(() => localStorage.getItem('severgrow.duel.identity.v1') !== null);

const seatOf = (page: Page) =>
  page.evaluate(() => {
    const raw = localStorage.getItem('severgrow.duel.session.v1');
    if (!raw) return -1;
    try {
      return (JSON.parse(raw) as { seat?: number }).seat ?? -1;
    } catch {
      return -1;
    }
  });

const browser = await chromium.launch({ executablePath: CHROME });
const loggedA: Logged = { errors: [], forbidden: [] };
const loggedB: Logged = { errors: [], forbidden: [] };

try {
  console.log(`LIVE proof against ${BASE_URL}`);

  // --- Player A: guest + create ---
  const pageA = await openPlayer(browser, 'A', loggedA);
  await pageA.click('#menu-online');
  await pageA.waitForSelector('#online-hub:not([hidden])', { timeout: 20_000 });
  check('A: online hub open', true);
  await dismissFirstCard(pageA);
  const hubNoticeA = (await pageA.locator('#online-hub-notice').textContent().catch(() => '')) ?? '';
  check('A: no guest error in hub', !/guest/i.test(hubNoticeA), hubNoticeA.trim());

  await pageA.click('#online-create');
  await pageA.waitForSelector('#online-waiting:not([hidden])', { timeout: 25_000 });
  check('A: guest identity stored', await identityPresent(pageA));
  const invite = ((await pageA.locator('#online-invite-code').textContent()) ?? '').trim();
  check('A: invite code shown', new RegExp(`^[0-9A-HJKMNP-TV-Z]{${DEFAULT_SERVER_CONFIG.inviteCodeLength}}$`).test(invite), invite);

  // --- Player B: guest + join ---
  const pageB = await openPlayer(browser, 'B', loggedB);
  await pageB.click('#menu-online');
  await pageB.waitForSelector('#online-hub:not([hidden])', { timeout: 20_000 });
  await dismissFirstCard(pageB);
  const hubNoticeB = (await pageB.locator('#online-hub-notice').textContent().catch(() => '')) ?? '';
  check('B: no guest error in hub', !/guest/i.test(hubNoticeB), hubNoticeB.trim());

  await pageB.click('#online-join-open');
  await pageB.waitForSelector('#online-join:not([hidden])', { timeout: 15_000 });
  await pageB.fill('#online-join-code', invite);
  await pageB.click('#online-join-submit');

  // Both enter the duel shell.
  await pageB.waitForSelector('#game:not([hidden])', { timeout: 30_000 });
  check('B: reached duel after join', true);
  await pageA.waitForSelector('#game:not([hidden])', { timeout: 30_000 });
  check('A: reached duel after join', true);
  check('B: guest identity stored', await identityPresent(pageB));

  // HUD + who-starts signal
  check('A: duel HUD visible', await pageA.locator('#duel-hud:not([hidden])').isVisible().catch(() => false));
  const seatA = await seatOf(pageA);
  const seatB = await seatOf(pageB);
  check('A/B seats differ', seatA !== seatB && seatA >= 0 && seatB >= 0, `A=${seatA} B=${seatB}`);

  check('A: no console/network errors', loggedA.errors.length === 0, loggedA.errors.slice(0, 3).join(' | '));
  check('B: no console/network errors', loggedB.errors.length === 0, loggedB.errors.slice(0, 3).join(' | '));
} catch (error) {
  check('live proof completed without throwing', false, error instanceof Error ? error.message : String(error));
} finally {
  await browser.close();
}

if (failed) {
  console.error(`${failed} live proof checks failed`);
  process.exit(1);
}
console.log('LIVE online proof passed');
