// LEAVING THE TERRITORY FOR ITS DUEL (owner report, 2026-10-28).
//
// Owner, verbatim: "i accepted the territory challenge, but i had to pay 50 seeds too — only
// challenging player should be paying 50 — the defending one have to be saying 'respond to keep your
// tile in 23:59 (timer)' ... BIG BUG - accepting challenge in territory opens the duel screen under
// it - see screenshot, everything on top of eachother - can never happen. opening a duel from
// territory is taking you to that duel in a cool way, small animation or effect".
//
// Against a REAL local API (memory storage + the real economy service), on a 390x844 phone:
//   1. the defender's sheet shows a countdown, offers no price, and says defending is free;
//   2. accepting the challenge opens the duel — and the Territory map, its keys, its tile bar and
//      the challenge sheet are GONE (hidden, not covered), so nothing paints over the board;
//   3. the defender's wallet is byte-for-byte unchanged by accepting (the report's money claim);
//   4. the same holds with Reduce motion on, where the exit has no animation to wait for.
//
//   PW_CHROMIUM="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" npx tsx web/e2e/territory-duel-open.ts
//
// The suite builds its own `web/dist` (CHANNEL=futa05, duel API pointed at itself). Do NOT run it
// with SKIP_BUILD=1: the build is part of what it proves.
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { chromium } from 'playwright-core';
import type { Browser, Page } from 'playwright-core';
import { preview } from 'vite';
import { DEFAULT_SERVER_CONFIG } from '../../server/src/config.js';
import { chainRouters } from '../../server/src/feedback/feedback.js';
import { createHttpServer } from '../../server/src/http.js';
import { DEFAULT_LIVE_CONFIG } from '../../server/src/live/config.js';
import { MemoryLiveStore } from '../../server/src/live/memory.js';
import { createLiveRuntime } from '../../server/src/live/runtime.js';
import { createWorldEconomyRouter } from '../../server/src/seeds/router.js';
import { MemoryWorldEconomyStore } from '../../server/src/seeds/memory.js';
import { WorldEconomyService } from '../../server/src/seeds/service.js';
import { MatchService } from '../../server/src/service.js';
import { MemoryStorage } from '../../server/src/storage/memory.js';
import { seedSettings } from './helpers/settings-seed.js';

const CHROME = process.env.PW_CHROMIUM ?? undefined;
const OUT = new URL('../../docs/screens/territory-duel-open/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

let failed = 0;
const check = (name: string, ok: boolean, note = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? `  (${note})` : ''}`);
};

// ---- a real API: guests, wallets, tiles, challenges and the linked duel ----------------------
const storage = new MemoryStorage();
const config = { ...DEFAULT_SERVER_CONFIG, corsOrigins: ['*'] };
const store = new MemoryWorldEconomyStore();
const economy = new WorldEconomyService(store, storage);
const service = new MatchService({ storage, config, economy });
// The live router is mounted too: an online build polls presence and open challenges on the board,
// and a 404 for them is harness noise, not a page fault. This keeps "no page errors" strict.
const live = createLiveRuntime({ storage, live: new MemoryLiveStore(storage), server: config, config: DEFAULT_LIVE_CONFIG });
const api = createHttpServer({
  service,
  config,
  live: chainRouters(createWorldEconomyRouter({ economy, authenticate: (t) => service.authenticate(t) }), live.router(service)),
});
await new Promise<void>((resolve) => api.listen(0, '127.0.0.1', resolve));
const apiBase = `http://127.0.0.1:${(api.address() as AddressInfo).port}`;

type Guest = { token: string; player: { id: string; displayName: string | null; kind: string } };
const guestOf = async (): Promise<Guest> => (await (await fetch(`${apiBase}/v1/guests`, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
})).json()) as Guest;
const fund = (playerId: string, n: number, tag: string) =>
  store.adminAdjustSeeds({ playerId, delta: n, reason: 'e2e', actorId: 'e2e', requestId: `fund-${playerId}-${tag}`, now: Date.now() });
const post = async (path: string, token: string, body: unknown) => {
  const res = await fetch(`${apiBase}${path}`, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
};
const walletOf = async (token: string): Promise<number> => {
  const res = await fetch(`${apiBase}/v1/seeds/wallet`, { headers: { authorization: `Bearer ${token}` } });
  const body = (await res.json()) as { wallet?: { balance?: number } };
  return body.wallet?.balance ?? NaN;
};

// ---- the build the suite serves ---------------------------------------------------------------
await new Promise<void>((resolve, reject) => {
  const child = spawn(process.execPath, ['./node_modules/vite/bin/vite.js', 'build', '--config', 'web/vite.config.ts'], {
    env: {
      ...process.env,
      CHANNEL: 'futa05',
      VITE_DUEL_API_URL: apiBase,
      VITE_SUPABASE_URL: 'http://127.0.0.1:9',
      VITE_SUPABASE_ANON_KEY: 'local-e2e-anon-key',
    },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  let err = '';
  child.stderr?.on('data', (d) => (err += String(d)));
  child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`build failed: ${err.slice(0, 800)}`))));
});
const web = await preview({ configFile: 'web/vite.config.ts', preview: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
const origin = web.resolvedUrls?.local?.[0]?.replace(/\/$/, '') ?? '';

const centre = (page: Page, cellId: string) => page.$eval(`.world-hex[data-cell-id="${cellId}"]`, (el) => {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
});

/** Every `.screen` that is NOT hidden. After a duel opens this must be exactly ['game']. */
const visibleScreens = (page: Page) => page.evaluate(() =>
  [...document.querySelectorAll<HTMLElement>('.screen')].filter((el) => !el.hidden).map((el) => el.id));

/** Is the map, its hardware keys, its tile bar or the challenge sheet still painting anything? */
const leftovers = (page: Page) => page.evaluate(() => {
  const rects = (id: string) => document.getElementById(id)?.getClientRects().length ?? 0;
  const sheet = document.querySelector<HTMLElement>('.world-challenge-sheet');
  return {
    map: rects('online-world-screen'),
    keys: rects('online-world-keys'),
    menu: rects('online-world-menu'),
    tileBar: rects('online-world-selection'),
    sheet: sheet ? (sheet.hidden ? 0 : sheet.getClientRects().length) : 0,
    hidden: Object.fromEntries(['online-hub', 'online-waiting', 'online-join', 'online-world-screen']
      .map((id) => [id, document.getElementById(id)?.hidden ?? null])),
  };
});

/** What the finger would hit at three points deep inside the visible board. */
const boardHits = (page: Page) => page.evaluate(() => {
  const game = document.getElementById('game')!;
  const r = game.getBoundingClientRect();
  const points: [number, number][] = [
    [r.left + r.width / 2, r.top + r.height / 2],
    [r.left + 24, r.top + 24],
    [r.left + r.width - 24, r.bottom - 24],
  ];
  return points.map(([x, y]) => {
    const el = document.elementFromPoint(x, y);
    return { inside: !!el && game.contains(el), at: `${el?.tagName ?? 'none'}${el?.id ? `#${el.id}` : ''}` };
  });
});

type Scenario = { reducedMotion: boolean; mine: string; rivalCells: string[]; tag: string };

const run = async (browser: Browser, scenario: Scenario): Promise<void> => {
  const { tag, mine, rivalCells } = scenario;
  console.log(`\n=== ${tag} ===`);
  const rival = await guestOf();
  await fund(rival.player.id, 600, 'r');
  for (const [j, cell] of rivalCells.entries()) await store.claim(rival.player.id, cell, `rival-${tag}-${j}`, Date.now() - 60_000);
  const me = await guestOf();
  await fund(me.player.id, 600, 'm');
  await store.acknowledgeInvitation(me.player.id);
  await store.claim(me.player.id, mine, `mine-${tag}`, Date.now() - 30_000);

  // The rival challenges MY tile through the REAL endpoint (this is what escrows their 50 Seeds).
  const sent = await post('/v1/world/challenges', rival.token, { cellId: mine, requestId: `challenge-${tag}-0001` });
  check(`[${tag}] the rival's challenge is accepted by the server`, sent.status === 200 || sent.status === 201,
    `${sent.status} ${JSON.stringify(sent.json).slice(0, 120)}`);
  const challengeId = (sent.json.challenge as { id?: string } | undefined)?.id ?? '';
  const rivalAfterSend = await walletOf(rival.token);
  const mineBeforeAccept = await walletOf(me.token);

  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const page = await context.newPage();
  // tsx/esbuild wraps named callbacks with a `__name` helper; the page needs the same stand-in the
  // other suites install so `page.evaluate` bodies can run there.
  await page.addInitScript({ content: 'window.__name = (f) => f;' });
  if (scenario.reducedMotion) await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript((raw) => {
    for (const p of ['', 'main2:', 'futa04:', 'futa05:', 'futa05-3:']) localStorage.setItem(`${p}severgrow.duel.identity.v1`, raw);
  }, JSON.stringify({ token: me.token, playerId: me.player.id, displayName: me.player.displayName, kind: me.player.kind }));
  await seedSettings(page, {
    sound: false, music: false, coach: false, speed: 'skip',
    reduceMotion: scenario.reducedMotion, eyeCandy: false,
  });
  // PAGE errors are strict. Console errors are collected separately because this harness does not
  // mount the match-chat route (`/v1/matches/:id/chat`), which an online build always asks for; the
  // check below only tolerates a "Failed to load resource" when EVERY 404 is that known route.
  const errors: string[] = [];
  const consoleErrors: string[] = [];
  const missing: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('response', (response) => { if (response.status() === 404) missing.push(response.url()); });
  page.on('console', (message) => {
    // The local build points realtime at the deliberately closed port 9; Chromium refuses it with
    // ERR_UNSAFE_PORT. That is the harness, not the page, so it is not a page error.
    if (message.type() === 'error' && !message.text().includes('ERR_UNSAFE_PORT')) consoleErrors.push(message.text());
  });

  await page.goto(origin + '/', { waitUntil: 'load' });
  await page.waitForFunction(() => (window as unknown as { __severgrow?: { ready?: () => boolean } }).__severgrow?.ready?.() === true,
    undefined, { timeout: 30_000 });
  await page.click('#menu-world');
  await page.waitForSelector('.world-hex', { timeout: 30_000 });
  await page.waitForTimeout(900);

  // ---- 0. the phone layout the owner's screenshot was taken on -------------------------------
  // The keys float over the MAP by design (they are part of it); they must never sit over the
  // Seeds line or off the screen. This is the layout half of "everything on top of eachother".
  await page.click('#online-world-menu');
  await page.waitForTimeout(450); // the row slides out over 180 ms with 28 ms per-key delays
  const layout = await page.evaluate(() => {
    const rect = (selector: string) => {
      const el = document.querySelector<HTMLElement>(selector);
      const r = el?.getBoundingClientRect();
      return r ? { top: r.top, bottom: r.bottom, left: r.left, right: r.right } : null;
    };
    return { wallet: rect('#online-world-wallet'), menu: rect('#online-world-menu'), keys: rect('#online-world-keys'), vw: innerWidth, vh: innerHeight };
  });
  check(`[${tag}] the key row sits below the Seeds line, never on it`,
    !!layout.wallet && !!layout.keys && !!layout.menu &&
      layout.keys.top >= layout.wallet.bottom - 0.5 && layout.menu.top >= layout.wallet.bottom - 0.5,
    `wallet ${layout.wallet?.bottom}, keys ${layout.keys?.top}, menu ${layout.menu?.top}`);
  check(`[${tag}] the key row is fully on screen`,
    !!layout.keys && layout.keys.left >= 0 && layout.keys.right <= layout.vw && layout.keys.top >= 0 && layout.keys.bottom <= layout.vh,
    `x ${layout.keys?.left}–${layout.keys?.right} of ${layout.vw}`);
  await page.click('#online-world-menu');
  await page.waitForTimeout(250);

  // ---- 1. the defender's sheet says ANSWER, not PAY ----------------------------------------
  // Wait for the crossed swords themselves before touching the tile: they are the tile's own
  // "someone challenged this" target, and tapping a tile before the challenge list lands would only
  // select it. If the tap lands on the bare hex instead, the tile bar's VIEW CHALLENGE key is the
  // same door into the same sheet.
  await page.waitForSelector(`.world-swords[data-cell-id="${mine}"] .world-swords-hit`, { timeout: 20_000 });
  const at = await centre(page, mine);
  await page.touchscreen.tap(at.x, at.y);
  const opened = await page.waitForSelector('.world-challenge-sheet:not([hidden])', { timeout: 4000 })
    .then(() => true).catch(() => false);
  if (!opened) {
    await page.click('#online-world-selection .world-claim-button');
    await page.waitForSelector('.world-challenge-sheet:not([hidden])', { timeout: 10_000 });
  }
  await page.waitForTimeout(600); // the sheet ignores presses for its first 450 ms (the opening tap is spent)
  const before = await page.evaluate(() => {
    const sheet = document.querySelector<HTMLElement>('.world-challenge-sheet:not([hidden])')!;
    const primary = sheet.querySelector<HTMLButtonElement>('.world-challenge-primary')!;
    return {
      line: sheet.querySelector<HTMLElement>('.world-challenge-line')?.textContent ?? '',
      meta: sheet.querySelector<HTMLElement>('.world-challenge-meta')?.textContent ?? '',
      primary: primary.textContent ?? '',
      secondary: sheet.querySelector<HTMLButtonElement>('.world-challenge-secondary')?.textContent ?? '',
      state: (sheet.querySelector<HTMLElement>('.world-challenge-card') as HTMLElement | null)?.dataset.ixState ?? '',
    };
  });
  check(`[${tag}] the defender is asked to answer on a countdown`,
    /challenged your tile\. Answer within .+ to keep it\./.test(before.line), before.line);
  check(`[${tag}] the defender is told defending costs no Seeds`, before.meta === 'NO SEEDS TO PAY', before.meta);
  check(`[${tag}] no price is shown to the defender`, !/\d+\s*seeds|50/i.test(`${before.line} ${before.meta}`),
    `${before.line} | ${before.meta}`);
  check(`[${tag}] the defender still gets ACCEPT / DECLINE`, before.primary === 'ACCEPT' && before.secondary === 'DECLINE',
    `${before.primary} / ${before.secondary}`);
  await page.screenshot({ path: join(OUT, `defender-sheet-${tag}.png`) });

  // ---- 2. accepting hands over to the duel, and nothing stacks ------------------------------
  await page.locator('.world-challenge-sheet:not([hidden]) .world-challenge-primary').focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => {
    const game = document.getElementById('game');
    const world = document.getElementById('online-world-screen');
    return !!game && !game.hidden && !!world && world.hidden;
  }, undefined, { timeout: 30_000 });

  const screens = await visibleScreens(page);
  check(`[${tag}] the duel is the ONLY full screen left`, JSON.stringify(screens) === JSON.stringify(['game']), screens.join(', '));
  const gone = await leftovers(page);
  check(`[${tag}] the Territory screen is hidden, not covered`, gone.hidden['online-world-screen'] === true, JSON.stringify(gone.hidden));
  check(`[${tag}] hub, waiting and join are hidden too`,
    gone.hidden['online-hub'] === true && gone.hidden['online-waiting'] === true && gone.hidden['online-join'] === true,
    JSON.stringify(gone.hidden));
  check(`[${tag}] the map, its keys, MENU and the tile bar paint nothing`,
    gone.map === 0 && gone.keys === 0 && gone.menu === 0 && gone.tileBar === 0,
    `map ${gone.map}, keys ${gone.keys}, menu ${gone.menu}, bar ${gone.tileBar}`);
  check(`[${tag}] the challenge sheet is torn down, not floating over the board`, gone.sheet === 0, `${gone.sheet} rect(s)`);
  const hits = await boardHits(page);
  check(`[${tag}] the board is what the finger hits, everywhere`,
    hits.every((hit) => hit.inside), hits.map((hit) => `${hit.inside ? 'game' : hit.at}`).join(', '));

  // ---- 3. the money the owner reported: the defender was NOT charged ------------------------
  const mineAfterAccept = await walletOf(me.token);
  check(`[${tag}] the defender's Seeds are untouched by accepting`,
    Number.isFinite(mineBeforeAccept) && mineAfterAccept === mineBeforeAccept,
    `${mineBeforeAccept} → ${mineAfterAccept}`);
  check(`[${tag}] the challenger's 50 Seeds are the only escrow (and are not refunded by accepting)`,
    Number.isFinite(rivalAfterSend) && rivalAfterSend === (await walletOf(rival.token)),
    `${rivalAfterSend} → ${await walletOf(rival.token)}`);

  check(`[${tag}] no page errors`, errors.length === 0, errors.slice(0, 2).join(' | '));
  const unexpectedMissing = missing.filter((url) => !/\/v1\/matches\/[^/]+\/chat$/.test(url));
  const otherConsole = consoleErrors.filter((text) => !text.includes('Failed to load resource'));
  check(`[${tag}] no unexpected console errors`, otherConsole.length === 0 && unexpectedMissing.length === 0,
    [...otherConsole.slice(0, 2), ...unexpectedMissing.slice(0, 2)].join(' | ') ||
      `${consoleErrors.length} console error(s), all the harness's missing match-chat route`);
  await page.screenshot({ path: join(OUT, `after-accept-${tag}.png`) });
  // The duel opened from the challenge id, not by accident: the server accepted THAT challenge.
  const list = await (await fetch(`${apiBase}/v1/world/challenges`, { headers: { authorization: `Bearer ${me.token}` } })).json() as {
    incoming?: { id: string; status: string; matchId: string | null }[];
  };
  const accepted = (list.incoming ?? []).find((row) => row.id === challengeId);
  check(`[${tag}] the challenge is accepted and carries its linked duel`, accepted?.status === 'accepted' && !!accepted.matchId,
    JSON.stringify(accepted ?? {}));

  await context.close();
};

const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
try {
  await run(browser, { tag: '390x844', reducedMotion: false, mine: '0,0', rivalCells: ['1,0', '0,1'] });
  // Reduce motion: the same hand-over, with the exit beat settling synchronously.
  await run(browser, { tag: '390x844-reduced-motion', reducedMotion: true, mine: '2,0', rivalCells: ['3,0', '3,-1'] });
} finally {
  await browser.close();
  await web.close();
  api.close();
}
console.log(`\n${failed === 0 ? 'ALL PASS' : `${failed} FAILURE(S)`}`);
process.exit(failed === 0 ? 0 : 1);
