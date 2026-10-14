// REGRESSION GUARD for the live "Something went wrong. Try again." dead end.
//
// The owner's exact symptom: a stale/invalid stored token makes every authenticated call 401, the
// lobby maps that to the generic error, and the player is permanently stuck. This walk proves the
// REAL fix end-to-end, in a real browser against a real (in-memory) duel API:
//
//   1. seed localStorage with a token the server will reject (it never issued it);
//   2. open the lobby and create a duel  -> it SUCCEEDS (the waiting screen opens);
//   3. in a second browser, seed the same dead token and tap Find opponent -> it SUCCEEDS;
//   4. assert the generic error text NEVER appears, the stored identity token CHANGED, and the one
//      honest "sign-in was reset" line is shown.
//
// It builds a local CHANNEL=futa05 app with VITE_DUEL_API_URL baked to a local MatchService, so it
// needs no network. Run: npx tsx web/e2e/online-stale-token-recovery.ts
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
import type { BrowserContext, Page } from 'playwright-core';
import { preview } from 'vite';
import { createHttpServer } from '../../server/src/http.js';
import { MatchService } from '../../server/src/service.js';
import { MemoryStorage } from '../../server/src/storage/memory.js';
import { DEFAULT_SERVER_CONFIG } from '../../server/src/config.js';

const API_PORT = 4311;
const PREVIEW_PORT = 4218;
const OUT = new URL('../../docs/screens/online/', import.meta.url).pathname;
const CHROME =
  process.env.PW_CHROMIUM ??
  '/Users/patryk/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';

/** futa05 stores everything under a `futa05:` prefix installed by the app (web/src/channel.ts). */
const IDENTITY_KEY = 'severgrow.duel.identity.v1';
const FIRST_CARD_KEY = 'severgrow.duel.firstCard.v1';
/** A token no server issued: >16 chars so it passes the shape check and fails authentication. */
const DEAD_TOKEN = `stale-not-a-real-token-${'x'.repeat(24)}`;
const GENERIC = 'Something went wrong. Try again.';
const RESET_LINE = 'Your sign-in was reset. Earlier matches are gone.';

mkdirSync(OUT, { recursive: true });
const apiBase = `http://127.0.0.1:${API_PORT}`;

let failed = 0;
const check = (name: string, ok: boolean, note = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? `  (${note})` : ''}`);
};

console.log(`building futa05 for ${apiBase} …`);
await new Promise<void>((resolve, reject) => {
  const child = spawn(process.execPath, ['./node_modules/vite/bin/vite.js', 'build', '--config', 'web/vite.config.ts'], {
    env: {
      ...process.env,
      CHANNEL: 'futa05',
      VITE_FIND_OPPONENT: '1',
      VITE_DUEL_API_URL: apiBase,
    },
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`build failed (${code})`))));
});

const apiConfig = { ...DEFAULT_SERVER_CONFIG, corsOrigins: ['*'] };
const service = new MatchService({ storage: new MemoryStorage(), config: apiConfig });
const apiServer = createHttpServer({ service, config: apiConfig });
await new Promise<void>((resolve) => apiServer.listen(API_PORT, '127.0.0.1', resolve));

const previewServer = await preview({
  configFile: 'web/vite.config.ts',
  preview: { host: '127.0.0.1', port: PREVIEW_PORT, strictPort: true },
  logLevel: 'silent',
});
const baseUrl = `http://127.0.0.1:${PREVIEW_PORT}/`;
for (let i = 0; i < 40; i++) {
  try {
    const res = await fetch(baseUrl);
    if (res.ok || res.status === 404) break;
  } catch {
    await new Promise((r) => setTimeout(r, 100));
  }
}

const visible = (page: Page, id: string) =>
  page.evaluate((sel) => {
    const el = document.getElementById(sel) as HTMLElement | null;
    return !!el && !el.hidden;
  }, id);

/** Read the stored identity exactly as the app does (the Storage prefix is already installed). */
const storedToken = (page: Page) =>
  page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as { token?: string }).token ?? null : null;
  }, IDENTITY_KEY);

/** Seed a dead identity + hide the first-run card, before any app call can run. */
const seedDeadIdentity = (page: Page) =>
  page.evaluate(
    ([identityKey, cardKey, token]) => {
      // The app's Storage prefix is already installed, so write the plain keys the app reads.
      localStorage.setItem(
        identityKey,
        JSON.stringify({ token, playerId: 'p-stale', displayName: 'Ghost', kind: 'guest' }),
      );
      localStorage.setItem(cardKey, '1');
    },
    [IDENTITY_KEY, FIRST_CARD_KEY, DEAD_TOKEN] as const,
  );

const openHubAndDismissCard = async (page: Page) => {
  await page.waitForSelector('#menu-online:not([hidden])', { timeout: 40_000 });
  await page.click('#menu-online');
  await page.waitForSelector('#online-hub:not([hidden])', { timeout: 15_000 });
  if (await visible(page, 'online-first-card')) await page.click('#online-first-ok');
};

const bodyText = (page: Page) => page.evaluate(() => document.body.innerText);

const noticeText = (page: Page, id: string) =>
  page.evaluate((sel) => (document.getElementById(sel)?.textContent ?? '').trim(), id);

const browser = await chromium.launch({ executablePath: CHROME });
const contexts: BrowserContext[] = [];
const newPage = async (viewport: { width: number; height: number }) => {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2 });
  contexts.push(ctx);
  const page = await ctx.newPage();
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await seedDeadIdentity(page);
  return page;
};

try {
  const vp = { width: 390, height: 844 };

  // ---- 1. Create a duel with a dead token: it must succeed, not dead-end ----------------------
  const a = await newPage(vp);
  check('a dead token is actually stored before the call', (await storedToken(a)) === DEAD_TOKEN);
  await openHubAndDismissCard(a);
  // The hub's first authenticated call (the match list) is what triggers recovery, so the honest
  // one-line notice lands here — before the player ever taps Create.
  await a
    .waitForFunction(
      ([id, line]) => (document.getElementById(id)?.textContent ?? '').includes(line),
      ['online-hub-notice', RESET_LINE] as const,
      { timeout: 15_000 },
    )
    .catch(() => undefined);
  check('the one honest line is shown (hub)', (await noticeText(a, 'online-hub-notice')) === RESET_LINE);
  const aTokenBefore = await storedToken(a);
  check('the stored identity was replaced with a fresh guest (hub load)', !!aTokenBefore && aTokenBefore !== DEAD_TOKEN);

  await a.click('#online-create');
  await a.waitForSelector('#online-waiting:not([hidden])', { timeout: 15_000 });
  check('Create a duel succeeds with a stale token', await visible(a, 'online-waiting'));
  const aText = await bodyText(a);
  check('the generic error NEVER appears (create)', !aText.includes(GENERIC), aText.includes(GENERIC) ? 'FOUND generic' : '');
  await a.screenshot({ path: `${OUT}stale-token-create-duel-390x844.png` });

  // ---- 2. Tap Find opponent with a dead token: it must succeed, not dead-end -------------------
  const b = await newPage(vp);
  await openHubAndDismissCard(b);
  await b.click('#online-find');
  await b.waitForFunction(
    () => {
      const w = document.getElementById('online-waiting') as HTMLElement | null;
      const g = document.getElementById('game') as HTMLElement | null;
      return (!!w && !w.hidden) || (!!g && !g.hidden);
    },
    { timeout: 15_000 },
  );
  const bParked = (await visible(b, 'online-waiting')) || (await visible(b, 'game'));
  check('Find opponent succeeds with a stale token', bParked);
  const bText = await bodyText(b);
  check('the generic error NEVER appears (find)', !bText.includes(GENERIC), bText.includes(GENERIC) ? 'FOUND generic' : '');
  const bToken = await storedToken(b);
  check('the stored identity was replaced with a fresh guest (find)', !!bToken && bToken !== DEAD_TOKEN);
  await b.screenshot({ path: `${OUT}stale-token-find-opponent-390x844.png` });
} finally {
  for (const ctx of contexts) await ctx.close().catch(() => undefined);
  await browser.close();
  await previewServer.close();
  await new Promise<void>((resolve) => apiServer.close(() => resolve()));
}

if (failed) {
  console.error(`\n${failed} stale-token recovery check(s) failed`);
  process.exit(1);
}
console.log('\nStale-token recovery passed: the owner\'s exact dead end is gone.');
