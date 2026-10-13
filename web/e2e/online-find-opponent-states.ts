// Phase 7.5 — Find opponent never leaves a player stuck, in a real browser against the real API.
//
// Builds a local futa05 app (VITE_FIND_OPPONENT=1) against an in-memory MatchService, then drives
// two independent browser contexts:
//   * A parks (nobody waiting) and sits on an honest "Finding an opponent" screen;
//   * after the parked window the three offers appear (Play the computer / Invite a friend /
//     Keep searching) — and "Keep searching" hides them again;
//   * B taps Find opponent: it joins A's parked search and BOTH open the live duel;
//   * A chooses "Play the computer" while searching: the offline game runs and the search keeps
//     going; when B arrives, A gets the dismissible "Opponent found" prompt and "Play now" opens
//     the duel. The offline game is never lost (Continue still exists).
//
//   npx tsx web/e2e/online-find-opponent-states.ts
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
import type { BrowserContext, Page } from 'playwright-core';
import { createHttpServer } from '../../server/src/http.js';
import { MatchService } from '../../server/src/service.js';
import { MemoryStorage } from '../../server/src/storage/memory.js';
import { DEFAULT_SERVER_CONFIG } from '../../server/src/config.js';
import { preview } from 'vite';

const API_PORT = 4301;
const PREVIEW_PORT = 4208;
const OUT = new URL('../../docs/screens/online/', import.meta.url).pathname;
const CHROME =
  process.env.PW_CHROMIUM ??
  '/Users/patryk/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';

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
      // The product window is three minutes; the walk shortens it so it never waits for real.
      VITE_PARKED_OFFER_MS: '1200',
    },
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`build failed (${code})`))));
});

const apiConfig = { ...DEFAULT_SERVER_CONFIG, corsOrigin: '*' };
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

/**
 * Taps Find opponent. The outcome is one of two honest states: parked (`#online-waiting`) or
 * matched immediately (`#game`) when somebody was already waiting — so wait for either.
 */
const openFind = async (page: Page) => {
  await page.waitForSelector('#menu-online:not([hidden])', { timeout: 40_000 });
  await page.click('#menu-online');
  await page.waitForSelector('#online-hub:not([hidden])', { timeout: 15_000 });
  await page.click('#online-find');
  await page.waitForFunction(
    () => {
      const w = document.getElementById('online-waiting') as HTMLElement | null;
      const g = document.getElementById('game') as HTMLElement | null;
      return (!!w && !w.hidden) || (!!g && !g.hidden);
    },
    { timeout: 15_000 },
  );
};

const browser = await chromium.launch({ executablePath: CHROME });
const contexts: BrowserContext[] = [];
const newPage = async (viewport: { width: number; height: number }) => {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2 });
  contexts.push(ctx);
  const page = await ctx.newPage();
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  return page;
};

try {
  // ---- A parks and sees an honest searching screen -------------------------------------------
  const vp = { width: 390, height: 844 };
  const a = await newPage(vp);
  await openFind(a);
  await a.waitForTimeout(1_200);
  const searchingTitle = await a.textContent('#online-waiting-title');
  check('parks on a searching screen', (await visible(a, 'online-waiting')) === true);
  check('searching title is honest', (searchingTitle ?? '').includes('Finding an opponent'), searchingTitle ?? '');
  check('the offer is hidden while searching', (await visible(a, 'online-search-options')) === false);
  check('cancel reads "Stop searching"', (await a.textContent('#online-cancel-match')) === 'Stop searching');
  await a.screenshot({ path: `${OUT}find-opponent-searching-390x844.png` });

  // The parked offer appears after the parked window (build-shortened in this walk).
  await a.waitForTimeout(2_500);
  check('parked title is honest', (await a.textContent('#online-waiting-title'))?.includes('Nobody yet') === true);
  check('three clear offers appear when parked', (await visible(a, 'online-search-options')) === true);
  const offers = await a.evaluate(() =>
    ['online-search-computer', 'online-search-invite', 'online-search-keep'].map((id) => document.getElementById(id)?.textContent ?? ''),
  );
  check('offer labels are punchy and exact', offers.join('|') === 'Play the computer|Invite a friend|Keep searching', offers.join('|'));
  await a.screenshot({ path: `${OUT}find-opponent-parked-390x844.png` });

  // Keep searching hides the offer again.
  await a.click('#online-search-keep');
  await a.waitForTimeout(300);
  check('keep searching hides the offer', (await visible(a, 'online-search-options')) === false);
  await a.waitForTimeout(2_000);
  check('the offer can come back', (await visible(a, 'online-search-options')) === true);

  // ---- B joins the parked search: both open the live duel -------------------------------------
  const b = await newPage(vp);
  await openFind(b);
  await b.waitForSelector('#game:not([hidden])', { timeout: 15_000 });
  check('the second searcher opens the duel', (await visible(b, 'game')) === true);
  await a.waitForSelector('#game:not([hidden])', { timeout: 15_000 });
  check('the parked searcher is pulled into the duel too', (await visible(a, 'game')) === true);
  check('the duel HUD is present for both', (await visible(a, 'duel-hud')) && (await visible(b, 'duel-hud')));

  // ---- A plays the computer while searching; B arrives -> "Opponent found" --------------------
  const c = await newPage(vp);
  await openFind(c);
  await c.waitForTimeout(2_500);
  await c.click('#online-search-computer');
  await c.waitForSelector('#game:not([hidden])', { timeout: 15_000 });
  check('play the computer opens the offline game', (await visible(c, 'game')) === true);
  // The computer game is the local game, never an online duel: the duel HUD is absent, and the
  // offer the player tapped said "Play the computer" (asserted exactly above).
  check('the computer game is the local game, not an online duel', (await visible(c, 'duel-hud')) === false);

  const d = await newPage(vp);
  await openFind(d);
  await c.waitForSelector('#online-matched:not([hidden])', { timeout: 15_000 });
  check('matched while playing shows the prompt', (await visible(c, 'online-matched')) === true);
  check('prompt is gentle and clear', (await c.textContent('#online-matched-title')) === 'Opponent found');
  await c.screenshot({ path: `${OUT}find-opponent-matched-390x844.png` });
  await c.click('#online-matched-now');
  await c.waitForSelector('#game:not([hidden])', { timeout: 15_000 });
  check('play now opens the duel', (await visible(c, 'duel-hud')) === true);
  check('the offline game is still resumable (Continue exists)', (await c.evaluate(() => !!document.getElementById('menu-continue'))) === true);
} finally {
  for (const ctx of contexts) await ctx.close().catch(() => undefined);
  await browser.close();
  await previewServer.close();
  await new Promise<void>((resolve) => apiServer.close(() => resolve()));
}

if (failed) {
  console.error(`\n${failed} find-opponent check(s) failed`);
  process.exit(1);
}
console.log('\nFind-opponent states passed.');
