// FUTASAKU 0.5 online duels — exactly-once "who starts" lottery + the trimmed strip.
//
// Builds CHANNEL=futa05 with a local duel API baked in, serves it with Vite preview, then proves:
//   1. the friend joining LIVE plays the lottery at most once on each side;
//   2. a page RELOAD mid-match does not replay it, and neither does returning later;
//   3. the persistent who-starts HUD chip is GONE (the strip was trimmed after the playtest), so
//      who starts is said once, by the reveal, and never again;
//   4. the reveal stays silent in the async case (opponent joined while away / past turn 1);
//   5. the offline (Play offline) lottery is untouched.
//
//   npx tsx web/e2e/online-starter-chip.ts
//
// The old code path (`status === 'active' && turnNumber === 1`) replays on refresh, so check 2
// fails against it.
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { chromium } from 'playwright-core';
import type { Browser, BrowserContext, Page } from 'playwright-core';
import { preview } from 'vite';
import type { Action } from '../../src/engine/index.js';
import { DEFAULT_SERVER_CONFIG } from '../../server/src/config.js';
import { createHttpServer } from '../../server/src/http.js';
import { MatchService } from '../../server/src/service.js';
import { MemoryStorage } from '../../server/src/storage/memory.js';
import { DuelClient } from '../../server/src/client.js';
import type { FetchLike } from '../../server/src/client.js';

const CHROME =
  process.env.PW_CHROMIUM ??
  '/Users/patryk/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const OUT = new URL('../../docs/screens/online/', import.meta.url).pathname;
const PREFIX = 'futa05:';
const IDENTITY_KEY = 'severgrow.duel.identity.v1';
const SESSION_KEY = 'severgrow.duel.session.v1';

mkdirSync(OUT, { recursive: true });
let failed = 0;
const check = (name: string, ok: boolean, note = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? `  (${note})` : ''}`);
};

// ---------------------------------------------------------------------------- page scripts

const identityLiteral = (id: { token: string; playerId: string; displayName: string | null }): string =>
  JSON.stringify(JSON.stringify({ ...id, kind: 'guest' }));

/**
 * Seeds storage once per tab (a `sessionStorage` guard keeps a reload's localStorage intact, so the
 * "no replay after refresh" case is real) and counts lottery reveals on every navigation (the
 * counter resets each load on purpose, so a replay after reload would show up as a fresh 1).
 */
const seedScript = (identity?: { token: string; playerId: string; displayName: string | null }): string =>
  [
    '(function () {',
    "  if (sessionStorage.getItem('__chipSeeded') === '1') return;",
    '  try {',
    '    localStorage.clear();',
    identity ? `    localStorage.setItem(${JSON.stringify(PREFIX + IDENTITY_KEY)}, ${identityLiteral(identity)});` : '',
    `    localStorage.setItem(${JSON.stringify(PREFIX + 'severgrow.duel.firstCard.v1')}, '1');`,
    `    localStorage.setItem(${JSON.stringify(PREFIX + 'severgrow.settings.v1')}, ${JSON.stringify(
      JSON.stringify({ sound: false, music: false, coach: false, speed: 'normal', reduceMotion: false, eyeCandy: false }),
    )});`,
    "    sessionStorage.setItem('__chipSeeded', '1');",
    '  } catch (e) {}',
    '})();',
    'window.__lotteryPlays = 0;',
    'window.__lotteryVisible = false;',
    "document.addEventListener('DOMContentLoaded', function () {",
    "  var el = document.getElementById('starter-lottery');",
    '  if (!el) return;',
    '  new MutationObserver(function () {',
    "    if (!el.hidden && !window.__lotteryVisible) { window.__lotteryVisible = true; window.__lotteryPlays++; }",
    '    if (el.hidden) window.__lotteryVisible = false;',
    "  }).observe(el, { attributes: true, attributeFilter: ['hidden'] });",
    '});',
  ]
    .filter(Boolean)
    .join('\n');

const buildWithApi = async (apiBase: string): Promise<void> =>
  new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ['./node_modules/vite/bin/vite.js', 'build', '--config', 'web/vite.config.ts'],
      {
        env: { ...process.env, PATH: process.env.PATH, CHANNEL: 'futa05', VITE_DUEL_API_URL: apiBase },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    let err = '';
    child.stderr?.on('data', (b) => {
      err += String(b);
    });
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`web:build failed: ${err}`))));
  });

// ---------------------------------------------------------------------------- helpers

const openApp = async (
  browser: Browser,
  origin: string,
  viewport: { width: number; height: number },
  identity?: { token: string; playerId: string; displayName: string | null },
): Promise<{ context: BrowserContext; page: Page }> => {
  const touch = viewport.width < 500;
  const context = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch, deviceScaleFactor: 1 });
  await context.addInitScript(seedScript(identity));
  await context.addInitScript({ content: "try { window.confirm = function () { return true; }; } catch (e) {}" });
  const page = await context.newPage();
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#menu-online:not([hidden])', { timeout: 40_000 });
  return { context, page };
};

const openHub = async (page: Page): Promise<void> => {
  await page.click('#menu-online');
  await page.waitForSelector('#online-hub:not([hidden])', { timeout: 25_000 });
  const firstOk = page.locator('#online-first-ok');
  if (await firstOk.isVisible().catch(() => false)) await firstOk.click();
};

const createDuel = async (page: Page): Promise<string> => {
  await page.click('#online-create');
  await page.waitForSelector('#online-waiting:not([hidden])', { timeout: 25_000 });
  return ((await page.locator('#online-invite-code').textContent()) ?? '').trim();
};

const joinDuel = async (page: Page, invite: string): Promise<void> => {
  await page.click('#online-join-open');
  await page.waitForSelector('#online-join:not([hidden])', { timeout: 15_000 });
  await page.fill('#online-join-code', invite);
  await page.click('#online-join-submit');
};

/** Enter an existing match from the lobby list (a return, never a live join). */
const reopenFromList = async (page: Page, matchId: string): Promise<void> => {
  await openHub(page);
  const row = page.locator(`#online-matches li[data-match-id="${matchId}"]`);
  await row.waitFor({ state: 'visible', timeout: 25_000 });
  await row.click();
  await page.waitForSelector('#game:not([hidden])', { timeout: 25_000 });
};

const plays = (page: Page): Promise<number> =>
  page.evaluate(() => (window as unknown as { __lotteryPlays?: number }).__lotteryPlays ?? 0);

/** Wait until the reveal count reaches `want`; returns the last value seen. */
const waitPlays = async (page: Page, want: number, timeout = 12_000): Promise<number> => {
  const start = Date.now();
  let last = -1;
  while (Date.now() - start < timeout) {
    last = await plays(page);
    if (last === want) return last;
    await page.waitForTimeout(120);
  }
  return last;
};

// After the two-phone playtest the persistent "who-starts" chip left the strip; who starts is
// said once, by the lottery reveal. These read the trimmed strip and the reveal count.
const readStrip = (page: Page) =>
  page.evaluate(() => ({
    chipPresent: !!document.querySelector('[data-duel-starter]:not([hidden])'),
    removed: !!document.querySelector(
      '#duel-hud [data-duel-starter], #duel-hud [data-duel-deadline], #duel-hud #duel-resign',
    ),
    turn: (document.querySelector('#duel-hud [data-duel-turn]')?.textContent ?? '').trim(),
  }));

const readStored = (page: Page) =>
  page.evaluate(
    (keys) => ({
      identity: localStorage.getItem(keys.identity),
      session: localStorage.getItem(keys.session),
    }),
    { identity: IDENTITY_KEY, session: SESSION_KEY },
  );

const parseJson = <T>(raw: string | null): T | null => {
  try {
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
};

const waitLotteryGone = async (page: Page, timeout = 12_000): Promise<void> => {
  await page.waitForSelector('#starter-lottery[hidden]', { timeout }).catch(() => undefined);
};

const shot = async (page: Page, name: string): Promise<void> => {
  await page.screenshot({ path: `${OUT}${name}.png` });
};

// ---------------------------------------------------------------------------- local duel API

const service = new MatchService({
  storage: new MemoryStorage(),
  config: { ...DEFAULT_SERVER_CONFIG, corsOrigin: '*', turnTimeoutMs: 24 * 3_600_000 },
});
const apiServer = createHttpServer({ service, config: { ...DEFAULT_SERVER_CONFIG, corsOrigin: '*' } });
await new Promise<void>((resolve) => apiServer.listen(0, '127.0.0.1', resolve));
const apiPort = (apiServer.address() as AddressInfo).port;
const apiBase = `http://127.0.0.1:${apiPort}`;
console.log(`local duel API on ${apiBase}`);

const nodeFetch: FetchLike = (url, init) => fetch(url, init);
const api = new DuelClient({ baseUrl: apiBase, fetch: nodeFetch });

/** Draw + end the Grow step + Discard, so the match moves past turn 1. */
const advanceOneTurn = async (matchId: string, token: string): Promise<number> => {
  let view = (await api.getState(token, matchId)).player;
  let seq = 0;
  const submit = async (actions: Action[]): Promise<void> => {
    seq += 1;
    const res = await api.submitAction(token, matchId, {
      expectedRevision: view.revision,
      requestId: `chip-${seq}-${Date.now()}`,
      actions,
    });
    view = res.player;
  };
  const draw = view.legalActions.find((a) => a.t === 'Draw');
  if (draw) await submit([draw]);
  const end = view.legalActions.find((a) => a.t === 'EndAct');
  if (end) await submit([end]);
  const discard = view.legalActions.find((a) => a.t === 'Discard');
  if (discard) await submit([discard]);
  return view.view.turnNumber;
};

await buildWithApi(apiBase);

const previewServer = await preview({
  configFile: 'web/vite.config.ts',
  preview: { host: '127.0.0.1', port: 4211, strictPort: true },
  logLevel: 'error',
});
const origin =
  previewServer.resolvedUrls?.local?.[0]?.replace(/\/$/, '') ??
  `http://127.0.0.1:${(previewServer.httpServer?.address() as AddressInfo | null)?.port ?? 4211}`;
console.log(`preview at ${origin}`);
for (let i = 0; i < 40; i++) {
  try {
    const res = await fetch(`${origin}/`);
    if (res.ok || res.status === 404) break;
  } catch {
    await new Promise((r) => setTimeout(r, 100));
  }
}

const browser = await chromium.launch({ executablePath: CHROME });
try {
  // ========================================================================== 1. LIVE JOIN
  const { context: ctxA, page: A } = await openApp(browser, origin, { width: 1280, height: 800 });
  await openHub(A);
  const invite = await createDuel(A);
  check('live: invite code shown', new RegExp(`^[0-9A-HJKMNP-TV-Z]{${DEFAULT_SERVER_CONFIG.inviteCodeLength}}$`).test(invite), invite);

  const { context: ctxB, page: B } = await openApp(browser, origin, { width: 390, height: 844 });
  await openHub(B);
  await joinDuel(B, invite);

  await B.waitForSelector('#game:not([hidden])', { timeout: 25_000 });
  check('live: joiner lands on the board', true);
  await A.waitForSelector('#game:not([hidden])', { timeout: 25_000 });
  check('live: creator opens the board when the friend joins', true);

  // The joiner reveals on joining; the creator reveals when the poll sees the match go active.
  await A.bringToFront().catch(() => undefined);
  const aPlays = await waitPlays(A, 1);
  const bPlays = await waitPlays(B, 1);
  check('live: creator plays the lottery exactly once', aPlays === 1, `plays=${aPlays}`);
  check('live: joiner plays the lottery exactly once', bPlays === 1, `plays=${bPlays}`);

  // Let the reveal finish, then the chip is what stays.
  await waitLotteryGone(A);
  await waitLotteryGone(B);

  const stateA = parseJson<{ token: string; matchId: string; seat: 0 | 1 }>((await readStored(A)).session);
  const stateB = parseJson<{ token: string; matchId: string; seat: 0 | 1 }>((await readStored(B)).session);
  check('live: both sides on the same match', !!stateA && !!stateB && stateA.matchId === stateB.matchId, `${stateA?.matchId}`);
  const payload = await api.getState(stateA!.token, stateA!.matchId);
  const startingPlayer = payload.player.startingPlayer;

  const stripA = await readStrip(A);
  const stripB = await readStrip(B);
  check('live: the persistent who-starts chip is gone (seat 0)', !stripA.chipPresent && !stripA.removed, JSON.stringify(stripA));
  check('live: the persistent who-starts chip is gone (seat 1)', !stripB.chipPresent && !stripB.removed, JSON.stringify(stripB));
  check(
    'live: the turn word is perspective-correct on both seats',
    stripA.turn === (startingPlayer === stateA!.seat ? 'Your turn' : "Opponent's turn") &&
      stripB.turn === (startingPlayer === stateB!.seat ? 'Your turn' : "Opponent's turn"),
    `start=${startingPlayer} A(seat ${stateA!.seat})="${stripA.turn}" B(seat ${stateB!.seat})="${stripB.turn}"`,
  );

  // Screenshots: the board with the chip, seat 0 and seat 1, at 390x844 and 1280x800.
  const seats: { seat: 0 | 1; identity: { token: string; playerId: string; displayName: string | null } }[] = [];
  for (const [side, state] of [
    ['A', stateA],
    ['B', stateB],
  ] as const) {
    if (!state) continue;
    const identity = parseJson<{ token: string; playerId: string; displayName: string | null }>(
      side === 'A' ? (await readStored(A)).identity : (await readStored(B)).identity,
    );
    if (identity) seats.push({ seat: state.seat, identity });
  }
  for (const { seat, identity } of seats) {
    for (const viewport of [
      { width: 390, height: 844 },
      { width: 360, height: 640 },
      { width: 1280, height: 800 },
    ]) {
      const { context, page } = await openApp(browser, origin, viewport, identity);
      await reopenFromList(page, stateA!.matchId);
      await page.waitForSelector('#duel-hud:not([hidden])', { timeout: 15_000 });
      const strip = await readStrip(page);
      check(
        `shot: seat ${seat} trimmed strip at ${viewport.width}x${viewport.height}`,
        !strip.chipPresent && !strip.removed && strip.turn.length > 0,
        JSON.stringify(strip),
      );
      await page.waitForTimeout(600);
      await shot(page, `starter-strip-seat${seat}-${viewport.width}x${viewport.height}`);
      check(`re-entry (seat ${seat} fresh page) never replays the lottery`, (await plays(page)) === 0);
      await context.close();
    }
  }

  // ========================================================================== 2. REFRESH / RETURN
  await A.reload({ waitUntil: 'domcontentloaded' });
  await A.waitForSelector('#menu-online:not([hidden])', { timeout: 30_000 });
  await reopenFromList(A, stateA!.matchId);
  await A.waitForSelector('#duel-hud:not([hidden])', { timeout: 15_000 });
  await A.waitForTimeout(1500); // give a replay a chance to happen before we judge
  check('refresh: the lottery does NOT replay after a reload', (await plays(A)) === 0, `plays=${await plays(A)}`);
  const stripAfterReload = await readStrip(A);
  check(
    'refresh: the strip is still trimmed (no who-starts chip)',
    !stripAfterReload.chipPresent && !stripAfterReload.removed,
    JSON.stringify(stripAfterReload),
  );

  await B.reload({ waitUntil: 'domcontentloaded' });
  await B.waitForSelector('#menu-online:not([hidden])', { timeout: 30_000 });
  await reopenFromList(B, stateB!.matchId);
  await B.waitForSelector('#duel-hud:not([hidden])', { timeout: 15_000 });
  await B.waitForTimeout(1500);
  check('refresh: the joiner sees no replay either', (await plays(B)) === 0, `plays=${await plays(B)}`);

  await ctxA.close();
  await ctxB.close();

  // ========================================================================== 3. ASYNC
  const cGuest = await api.createGuest();
  const dGuest = await api.createGuest();
  const created = await api.createMatch(cGuest.token);
  const joined = await api.joinMatch(dGuest.token, created.match.inviteCode);
  const starterToken = joined.player.startingPlayer === 0 ? cGuest.token : dGuest.token;
  const turnNumber = await advanceOneTurn(created.match.matchId, starterToken);
  check('async: match is past turn 1', turnNumber >= 2, `turn=${turnNumber}`);

  // The creator was away while the friend joined; now they return to the match from the list.
  const cIdentity = { token: cGuest.token, playerId: cGuest.player.id, displayName: cGuest.player.displayName };
  const dIdentity = { token: dGuest.token, playerId: dGuest.player.id, displayName: dGuest.player.displayName };
  const { context: ctxC, page: C } = await openApp(browser, origin, { width: 1280, height: 800 }, cIdentity);
  await reopenFromList(C, created.match.matchId);
  await C.waitForSelector('#duel-hud:not([hidden])', { timeout: 15_000 });
  await C.waitForTimeout(1500);
  const stripC = await readStrip(C);
  check('async: no who-starts chip for the returning creator', !stripC.chipPresent && !stripC.removed, JSON.stringify(stripC));
  check('async: no lottery plays when the opponent joined while away', (await plays(C)) === 0, `plays=${await plays(C)}`);
  await shot(C, 'starter-strip-async-1280x800');
  await ctxC.close();

  const { context: ctxD, page: D } = await openApp(browser, origin, { width: 390, height: 844 }, dIdentity);
  await reopenFromList(D, created.match.matchId);
  await D.waitForSelector('#duel-hud:not([hidden])', { timeout: 15_000 });
  await D.waitForTimeout(1200);
  const stripD = await readStrip(D);
  check('async: no who-starts chip for the other seat', !stripD.chipPresent && !stripD.removed, JSON.stringify(stripD));
  check('async: no lottery plays on the second seat either', (await plays(D)) === 0, `plays=${await plays(D)}`);
  await shot(D, 'starter-strip-async-390x844');
  await ctxD.close();

  // ========================================================================== 4. OFFLINE UNCHANGED
  const { context: ctxOff, page: off } = await openApp(browser, origin, { width: 1280, height: 800 });
  await off.click('#menu-new');
  await off.waitForSelector('#levels:not([hidden])', { timeout: 15_000 });
  await off.locator('.level-tile').first().click();
  await off.waitForSelector('#starter-lottery:not([hidden])', { timeout: 15_000 });
  check('offline: the lottery still plays when a game starts', (await plays(off)) >= 1, `plays=${await plays(off)}`);
  await off
    .waitForFunction(() => /start/i.test(document.getElementById('lottery-title')?.textContent ?? ''), { timeout: 8_000 })
    .catch(() => undefined);
  const offlineTitle = ((await off.locator('#lottery-title').textContent()) ?? '').trim();
  check('offline: the lottery resolves to You/Opponent start', /start/i.test(offlineTitle), offlineTitle);
  await waitLotteryGone(off);
  check('offline: the lottery closes on its own (unchanged)', await off.locator('#starter-lottery').isHidden());
  await ctxOff.close();
} finally {
  await browser.close();
  await previewServer.close();
  await new Promise<void>((resolve) => apiServer.close(() => resolve()));
}

if (failed) {
  console.error(`\n${failed} starter-chip checks failed`);
  process.exit(1);
}
console.log('\nOnline starter chip + exactly-once lottery checks passed.');
