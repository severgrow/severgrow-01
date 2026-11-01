// RANDOM CAMPAIGN DEALS, END TO END (owner, 2026-11-01): a real built page against a stub server that
// verifies with the SERVER's own verifier.
//
//   off      the server does not list the feature (every server before this change): level 11 keeps
//            its fixed deal, so no win can be refused and no Seeds can be lost.
//   random   the server lists it: level 11 opens on a fresh shuffle, every Restart deals a new one,
//            and the fifth new deal in a row without a move shows the rest sheet and deals nothing.
//   pay      a WON random deal sends its seed with the proof; the real verifier accepts it and pays.
//
//   node --import tsx web/e2e/campaign-random-deals.ts     (PW_CHROMIUM=<chrome>; SKIP_BUILD=1 reuses web/dist)
import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';
import type { Browser, Page, Route } from 'playwright-core';
import { preview } from 'vite';
import { CAMPAIGN_LEVELS, RANDOM_DEALS_FEATURE } from '../../src/campaign/index.js';
import { legalActions, viewFor } from '../../src/engine/index.js';
import type { Action, State } from '../../src/engine/index.js';
import { botSeed, chooseLevelAction } from '../../src/bots/levels.js';
import { verifyCampaignProof } from '../../server/src/seeds/verify.js';

const PORT = Number(process.env.PORT ?? 4331);
const ORIGIN = `http://127.0.0.1:${PORT}`;
const LOCAL_API = `${ORIGIN}/functions/v1/duel`;
const CHROME = process.env.PW_CHROMIUM ?? '/usr/bin/google-chrome';
const LEVEL = CAMPAIGN_LEVELS.find((level) => level.number === 11)!;
const K = (key: string) => `futa05:${key}`;
const DEBUG = process.env.DEBUG_E2E === '1';
const BEFORE_11 = JSON.stringify({
  version: 1,
  unlocked: 11,
  completed: CAMPAIGN_LEVELS.filter((level) => level.number < 11).map((level) => level.id),
  best: {},
});
const WALLET = { balance: 0, lifetimeEarned: 0, lifetimeSpent: 0, worldInvitationSeen: true };

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
      CHANNEL: 'futa05',
      VITE_DUEL_API_URL: LOCAL_API,
      VITE_SUPABASE_URL: 'http://127.0.0.1:9',
      VITE_SUPABASE_ANON_KEY: 'local-e2e-anon-key',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let err = '';
  child.stderr?.on('data', (b) => { err += String(b); });
  child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`web:build failed: ${err}`))));
});

type Posted = { levelId: string; dealSeed?: number; paid: boolean };

const boot = async (browser: Browser, features: readonly string[]) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, serviceWorkers: 'block' });
  await context.addInitScript({
    content: `(() => {
      try {
        localStorage.clear();
        localStorage.setItem(${JSON.stringify(K('severgrow.duel.identity.v1'))}, ${JSON.stringify(JSON.stringify({ token: 'e2e-token', playerId: 'e2e-player', displayName: 'E2E', kind: 'guest' }))});
        localStorage.setItem(${JSON.stringify(K('severgrow.settings.v1'))}, JSON.stringify({ sound: false, music: false, coach: false, speed: 'normal', reduceMotion: true, eyeCandy: false, autoSkip: false }));
        localStorage.setItem('futa05:severgrow.install-prompt.v1', JSON.stringify({ games: 0, shown: true, never: true }));
        localStorage.setItem(${JSON.stringify(K('severgrow.campaign.progress.v3'))}, ${JSON.stringify(BEFORE_11)});
      } catch { /* storage blocked */ }
    })();`,
  });
  const page = await context.newPage();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  if (DEBUG) page.on('request', (r) => { if (r.url().includes('/duel/')) console.log('REQ', r.method(), r.url()); });
  const posts: Posted[] = [];
  await page.route('**/functions/v1/duel/**', async (route: Route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/v1/health')) {
      return route.fulfill({ json: { ok: true, rulesVersion: 'e2e', serverNow: Date.now(), ...(features.length ? { features } : {}) } });
    }
    if (path.endsWith('/v1/seeds/campaign')) {
      const body = JSON.parse(route.request().postData() ?? '{}') as { levelId: string; dealSeed?: number; actions: Action[]; botVersion: string };
      const verified = verifyCampaignProof(body.levelId, body.actions, body.botVersion, body.dealSeed);
      const paid = !!verified && verified.winner === 0;
      posts.push({ levelId: body.levelId, ...(body.dealSeed === undefined ? {} : { dealSeed: body.dealSeed }), paid });
      if (!paid) return route.fulfill({ status: 400, json: { ok: false, code: 'INVALID_REQUEST', message: 'That Campaign result could not be verified.' } });
      return route.fulfill({ json: { reward: { awarded: 10, reason: null, wallet: WALLET, replayed: false } } });
    }
    if (path.endsWith('/v1/seeds/wallet')) return route.fulfill({ json: { wallet: WALLET } });
    return route.fulfill({ status: 404, json: { ok: false, code: 'NOT_FOUND', message: 'no stub route' } });
  });
  return { context, page, errors, posts };
};

const state = (page: Page) => page.evaluate('(() => window.__severgrow.state())()') as Promise<State | null>;
const idle = (page: Page) => page.waitForFunction('(() => !!window.__severgrow.state() && !window.__severgrow.busy())()', undefined, { timeout: 60_000 });
const waitStarter = (page: Page) => page.waitForFunction(`(() => {
  const r = document.getElementById('starter-lottery');
  return !r || r.hidden || !r.getClientRects().length;
})()`, undefined, { timeout: 15_000 }).catch(() => undefined);

/** Boot the page; with `expectRandom`, wait until the device has remembered the server's answer. */
const openCampaign = async (page: Page, expectRandom: boolean): Promise<State> => {
  await page.goto(ORIGIN, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction('(() => !!(window.__severgrow && window.__severgrow.ready && window.__severgrow.ready()))()', undefined, { timeout: 60_000 });
  if (expectRandom) {
    // After boot the page's own storage wrapper adds the channel prefix itself, so the plain key is read.
    await page.waitForFunction(`(() => localStorage.getItem('severgrow.campaign.randomDeals.v1') === '1')()`, undefined, { timeout: 15_000 });
  } else {
    await page.waitForTimeout(1_500);
  }
  if (!(await page.locator('#play-menu').isVisible().catch(() => false))) {
    await page.click('#menu-play');
    await page.waitForSelector('#play-menu:not([hidden])', { timeout: 20_000 });
  }
  await page.click('#menu-campaign');
  await page.waitForFunction('(() => !!window.__severgrow.state() || !document.getElementById("campaign").hidden)()', undefined, { timeout: 30_000 });
  if (await page.locator('#campaign-continue').isVisible().catch(() => false)) await page.click('#campaign-continue');
  await idle(page);
  await waitStarter(page);
  return (await state(page))!;
};

/** Pause → Restart (confirming when the sheet asks). Resolves to the rest sheet, or the new deal. */
const restart = async (page: Page, previousSeed: number): Promise<'rest' | State> => {
  await idle(page);
  await page.click('#hud-menu');
  await page.click('#gm-new');
  const sheetOrDeal = await Promise.race([
    page.locator('#sheet-restart:not([hidden])').waitFor({ state: 'visible', timeout: 8_000 }).then(() => 'confirm' as const),
    page.locator('#sheet-rest:not([hidden])').waitFor({ state: 'visible', timeout: 8_000 }).then(() => 'rest' as const),
    page.waitForFunction((prev: number) => (window as any).__severgrow.state()?.seed !== prev, previousSeed, { timeout: 8_000 }).then(() => 'dealt' as const),
  ]).catch(() => 'timeout' as const);
  if (sheetOrDeal === 'rest') return 'rest';
  if (sheetOrDeal === 'confirm') {
    await page.click('#restart-confirm');
    const after = await Promise.race([
      page.locator('#sheet-rest:not([hidden])').waitFor({ state: 'visible', timeout: 8_000 }).then(() => 'rest' as const),
      page.waitForFunction((prev: number) => (window as any).__severgrow.state()?.seed !== prev, previousSeed, { timeout: 8_000 }).then(() => 'dealt' as const),
    ]).catch(() => 'timeout' as const);
    if (after === 'rest') return 'rest';
  }
  await idle(page);
  await waitStarter(page);
  return (await state(page))!;
};

/** Play to the end with the strongest bot choosing on the page's own live state. */
const playOut = async (page: Page, salt: number): Promise<number | null> => {
  let waited = 0;
  for (let guard = 0; guard < 4000; guard++) {
    await idle(page);
    const now = (await state(page))!;
    if (now.phase === 'GAME_OVER') return now.result?.winner ?? null;
    if (now.actor !== 0) {
      if (++waited > 600) return null;
      await page.waitForTimeout(60);
      continue;
    }
    waited = 0;
    const legal = legalActions(viewFor(now, 0));
    const wanted = chooseLevelAction(viewFor(now, 0), 9, botSeed(now.seed ^ salt, 9, now.turnNumber, now.history?.length ?? 0));
    const action = legal.some((m) => JSON.stringify(m) === JSON.stringify(wanted)) ? wanted : legal[0];
    if (!action) return null;
    const ok = await page.evaluate(`(() => window.__severgrow.playFor(${JSON.stringify(action)}, 0))()`) as boolean;
    if (!ok) await page.waitForTimeout(120);
  }
  return null;
};

await build();
const server = await preview({ configFile: 'web/vite.config.ts', preview: { host: '127.0.0.1', port: PORT, strictPort: true }, logLevel: 'error' });
const browser = await chromium.launch({ executablePath: CHROME, args: ['--disable-dev-shm-usage', '--disable-gpu'] });

try {
  // ---- off: an older server keeps the fixed deal ----
  {
    const { context, page, errors } = await boot(browser, []);
    const opened = await openCampaign(page, false);
    check('off: level 11 keeps its fixed deal while the server cannot check random ones', opened.seed === LEVEL.seed, `seed ${opened.seed}`);
    check('off: no page errors', errors.length === 0, errors.slice(0, 2).join(' | '));
    await context.close();
  }

  // ---- random: fresh deals, and the rest on the fifth new deal in a row without a move ----
  {
    const { context, page, errors } = await boot(browser, [RANDOM_DEALS_FEATURE]);
    const first = await openCampaign(page, true);
    check('random: level 11 opens on a fresh shuffle', first.seed !== LEVEL.seed, `seed ${first.seed}`);
    check('random: the level\'s own board is kept', JSON.stringify(first.terrain) === JSON.stringify(
      (await import('../../src/campaign/index.js')).campaignOpening(LEVEL).terrain));
    const seeds = [first.seed];
    let current = first;
    for (let i = 1; i <= 4; i++) {
      const next = await restart(page, current.seed);
      if (next === 'rest') { check(`random: restart ${i} deals a new hand`, false, 'rested too early'); break; }
      seeds.push(next.seed);
      current = next;
    }
    check('random: four restarts without a move each dealt a different deal', new Set(seeds).size === 5, seeds.join(', '));
    const fifth = await restart(page, current.seed);
    check('random: the fifth restart without a move rests the campaign', fifth === 'rest');
    const restText = (await page.locator('#rest-body').textContent().catch(() => '')) ?? '';
    if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/rest-sheet.png` });
    check('random: the rest sheet says how long', /Back in 60 min\./.test(restText), restText);
    check('random: no new deal was dealt while resting', (await state(page))?.seed === current.seed);
    await page.click('#rest-ok');
    check('random: the rest sheet closes', !(await page.locator('#sheet-rest').isVisible()));
    check('random: no page errors', errors.length === 0, errors.slice(0, 2).join(' | '));
    await context.close();
  }

  // ---- pay: a won random deal sends its seed and is paid by the real verifier ----
  {
    const { context, page, errors, posts } = await boot(browser, [RANDOM_DEALS_FEATURE]);
    let won: State | null = null;
    await openCampaign(page, true);
    for (const salt of [0x1234567, 0x9e3779b9, 0x7f4a7c15, 0x2545f491]) {
      const winner = await playOut(page, salt);
      if (winner === 0) { won = (await state(page))!; break; }
      // A loss: back to a fresh deal (a played game is never an abandon).
      await openCampaign(page, true);
    }
    check('pay: a random level-11 deal was won', !!won);
    if (won) {
      await page.waitForFunction(() => (document.getElementById('go-seeds')?.textContent ?? '').trim() !== '', undefined, { timeout: 20_000 })
        .catch(() => undefined);
      const post = posts.find((p) => p.levelId === LEVEL.id);
      check('pay: the proof was sent', !!post, JSON.stringify(posts));
      check('pay: it names the deal it was won on', post?.dealSeed === won.seed && won.seed !== LEVEL.seed, `${post?.dealSeed} vs ${won.seed}`);
      check('pay: the server\'s own verifier accepted and paid it', post?.paid === true);
    }
    check('pay: no page errors', errors.length === 0, errors.slice(0, 2).join(' | '));
    await context.close();
  }
} finally {
  await browser.close();
  await new Promise<void>((resolve) => server.httpServer.close(() => resolve()));
}

if (failed) {
  console.log(`\n${failed} check(s) FAILED`);
  process.exit(1);
}
console.log('\nall checks passed');
