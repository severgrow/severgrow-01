// REGRESSION — the board must never ship a picture that failed to load.
//
// iPhone Safari paints its OWN "broken image" placeholder over an `<image>` whose file did not
// load: a light-blue tile with a white question mark, drawn at the image's box and rotated with
// the tile it replaced. On 2026-10-14 the owner saw three of them on the board of a live online
// duel (top-left and two at the lower right). This suite makes the board's art requests FAIL, in
// a real online duel, from BOTH seats, and asserts that nothing a browser could paint a
// placeholder over is left on the board.
//
//   npx tsx web/e2e/online-art-fallback.ts
//   PW_CHROMIUM=/path/to/chrome npx tsx web/e2e/online-art-fallback.ts
//
// The blocked URLs are the ones the owner's device could not get (a dropped connection, a 404 or
// a stale cache). The board must fall back to the look it has before its art arrives — a flat
// territory tile — never a question mark. The art path is the same on every map size (the small
// map adds no board art of its own).
import { spawn } from 'node:child_process';
import type { AddressInfo } from 'node:net';
import { chromium } from 'playwright-core';
import type { Browser, BrowserContext, Page } from 'playwright-core';
import { preview } from 'vite';
import { DEFAULT_SERVER_CONFIG } from '../../server/src/config.js';
import { createHttpServer } from '../../server/src/http.js';
import { MatchService } from '../../server/src/service.js';
import { MemoryStorage } from '../../server/src/storage/memory.js';
import { DuelClient } from '../../server/src/client.js';
import type { FetchLike } from '../../server/src/client.js';
import { DEFAULT_LIVE_CONFIG } from '../../server/src/live/config.js';
import { MemoryLiveStore } from '../../server/src/live/memory.js';
import { createLiveRuntime } from '../../server/src/live/runtime.js';
import { CHROME } from './helpers/local-duel.js';

const PORT = 4396;
const PREFIX = 'futa05:';
/** Every board picture the duel draws: territory sprites, home art, rocks and the ground. */
const BLOCKED = /meadow|ashen|garden|fortress|rock_hex|empty_ground/;

let failed = 0;
const check = (name: string, ok: boolean, note = '') => {
  if (!ok) failed += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? `  (${note})` : ''}`);
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const tick = (ms = 100) => sleep(ms);
const waitFor = async (cond: () => Promise<boolean> | boolean, timeout = 30_000): Promise<boolean> => {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try { if (await cond()) return true; } catch { /* navigating */ }
    await tick(120);
  }
  return false;
};

// ---------------------------------------------------------------- local duel API + build + preview
const memory = new MemoryStorage();
const server = { ...DEFAULT_SERVER_CONFIG, corsOrigins: ['*'], turnTimeoutMs: 24 * 3_600_000 };
const live = createLiveRuntime({
  storage: memory,
  live: new MemoryLiveStore(memory),
  server,
  config: { ...DEFAULT_LIVE_CONFIG, challengesPerPlayerPerHour: 1000, presencePerPlayerPerMinute: 1000 },
});
const service = new MatchService({ storage: live.storage, config: server });
const apiServer = createHttpServer({ service, config: server, live: live.router(service) });
await new Promise<void>((resolve) => apiServer.listen(0, '127.0.0.1', resolve));
const apiBase = `http://127.0.0.1:${(apiServer.address() as AddressInfo).port}`;

await new Promise<void>((resolve, reject) => {
  const child = spawn(
    process.execPath,
    ['./node_modules/vite/bin/vite.js', 'build', '--config', 'web/vite.config.ts'],
    {
      env: {
        ...process.env,
        CHANNEL: 'futa05',
        VITE_LIVE_DUELS: '1',
        VITE_DUEL_API_URL: apiBase,
        VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL || 'http://127.0.0.1:9',
        VITE_SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY || 'local-e2e-anon-key',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  let err = '';
  child.stderr?.on('data', (b) => (err += String(b)));
  child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`web:build failed: ${err}`))));
});
const previewServer = await preview({
  configFile: 'web/vite.config.ts',
  preview: { host: '127.0.0.1', port: PORT, strictPort: true },
  logLevel: 'error',
});
const origin = previewServer.resolvedUrls?.local?.[0]?.replace(/\/$/, '') ?? `http://127.0.0.1:${PORT}`;

const nodeFetch: FetchLike = (url, init) => fetch(url, init);
const api = new DuelClient({ baseUrl: apiBase, fetch: nodeFetch });

type Guest = { token: string; playerId: string; displayName: string | null };
const toGuest = (r: { token: string; player: { id: string; displayName: string | null } }): Guest => ({
  token: r.token, playerId: r.player.id, displayName: r.player.displayName,
});

type Seat = { seat: 0 | 1; context: BrowserContext; page: Page; blocked: string[] };

/** One seat of the duel, with every board picture deliberately failing to load. */
const openSeat = async (browser: Browser, guests: [Guest, Guest], matchId: string, seat: 0 | 1): Promise<Seat> => {
  const guest = guests[seat];
  const blocked: string[] = [];
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await context.route(BLOCKED, (route) => {
    blocked.push(route.request().url());
    return route.fulfill({ status: 404, contentType: 'text/plain', body: 'gone' });
  });
  await context.addInitScript(
    ({ ik, sk, identity, session }) => {
      try {
        localStorage.clear();
        localStorage.setItem(ik, JSON.stringify(identity));
        localStorage.setItem(sk, JSON.stringify(session));
        localStorage.setItem('futa05:severgrow.duel.firstCard.v1', '1');
        localStorage.setItem(
          'futa05:severgrow.settings.v1',
          JSON.stringify({ sound: false, music: false, coach: false, speed: 'skip', reduceMotion: true, eyeCandy: false, autoSkip: false }),
        );
      } catch { /* storage blocked */ }
    },
    {
      ik: `${PREFIX}severgrow.duel.identity.v1`,
      sk: `${PREFIX}severgrow.duel.session.v1`,
      identity: { token: guest.token, playerId: guest.playerId, displayName: guest.displayName, kind: 'guest' },
      session: { token: guest.token, matchId, seat },
    },
  );
  const page = await context.newPage();
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  return { seat, context, page, blocked };
};

const openDuel = async (s: Seat, matchId: string): Promise<void> => {
  const { page } = s;
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.waitForSelector('#menu-online:not([hidden])', { timeout: 40_000 });
    await page.click('#menu-online');
    await page.waitForSelector('#online-hub:not([hidden])', { timeout: 25_000 });
    if (await page.locator('#online-first-ok').isVisible().catch(() => false)) await page.click('#online-first-ok');
    const row = page.locator(`#online-matches li[data-match-id="${matchId}"]`);
    if (await row.isVisible().catch(() => false)) {
      await row.click();
      await page.waitForSelector('#game:not([hidden])', { timeout: 25_000 });
      await page.waitForSelector('#duel-hud:not([hidden])', { timeout: 25_000 });
      return;
    }
    // The local lobby occasionally shows an empty list before its first fetch lands: ask again.
    await page.waitForTimeout(2_000);
    await page.reload({ waitUntil: 'domcontentloaded' });
  }
  throw new Error(`the match never appeared in the lobby for seat ${s.seat}`);
};

const phase = (s: Seat): Promise<string> =>
  s.page.evaluate(() => (window as unknown as { __severgrow: { state: () => { phase: string } | null } }).__severgrow.state()?.phase ?? '');
const myTurn = (s: Seat): Promise<boolean> =>
  s.page.evaluate(() => !!(window as unknown as { __severgrow: { online: () => { myTurn: boolean } | null } }).__severgrow.online()?.myTurn);

/** One whole turn through the page's own controls (Draw → skip Grow → throw a card). */
const playTurn = async (s: Seat): Promise<boolean> => {
  if (!(await waitFor(() => myTurn(s), 40_000))) return false;
  await waitFor(async () => (await phase(s)) === 'DRAW', 8_000);
  for (let i = 0; i < 6 && (await phase(s)) === 'DRAW'; i++) {
    await s.page.locator('#deck').click({ force: true }).catch(() => undefined);
    await waitFor(async () => (await phase(s)) !== 'DRAW', 4_000);
  }
  await waitFor(() => s.page.evaluate('!window.__severgrow.busy()') as Promise<boolean>, 10_000);
  for (let i = 0; i < 6 && (await phase(s)) === 'ACT'; i++) {
    await s.page.evaluate(`(() => { const b = document.querySelector('#moves .end, #moves .futa04-skip, .futa04-skip, .end'); if (b && !b.disabled) b.click(); })()`);
    await waitFor(async () => (await phase(s)) !== 'ACT', 4_000);
  }
  for (let i = 0; i < 6 && (await phase(s)) === 'DISCARD'; i++) {
    const card = (await s.page.evaluate(`(() => { const d = window.__severgrow.legal().filter(a => a.t === 'Discard')[0]; return d ? d.card : null; })()`)) as number | null;
    if (card === null) break;
    await s.page.locator(`#hand [data-card="${card}"]`).click({ force: true }).catch(() => undefined);
    await tick(250);
    await s.page.locator(`#hand [data-card="${card}"]`).click({ force: true }).catch(() => undefined);
    await waitFor(async () => (await phase(s)) !== 'DISCARD', 4_000);
  }
  return waitFor(async () => !(await myTurn(s)), 10_000);
};

/** What the board is actually holding: every <image> still pointing at a file that 404'd. */
type BoardArt = { images: number; failed: string[]; tiles: number; hexes: number; paths: number; homeGroups: number; homeArt: number; homeFills: number };
const boardArt = (s: Seat): Promise<BoardArt> => s.page.evaluate(`(() => {
  const blocked = ${String(BLOCKED)};
  const svgs = Array.from(document.querySelectorAll('#board-wrap svg, #board'));
  const all = svgs.flatMap((svg) => Array.from(svg.querySelectorAll('image')));
  const failedArt = all.filter((i) => blocked.test(i.getAttribute('href') || ''));
  const homes = Array.from(document.querySelectorAll('#board-wrap .default-home-art'));
  return {
    images: all.length,
    failed: failedArt.map((i) => (i.getAttribute('href') || '').split('/').pop() || ''),
    tiles: document.querySelectorAll('#board-wrap .default-art-tile').length,
    hexes: document.querySelectorAll('#board-wrap .hex-cell').length,
    paths: document.querySelectorAll('#board-wrap path').length,
    homeGroups: homes.length,
    homeArt: homes.reduce((n, h) => n + h.querySelectorAll('image').length, 0),
    homeFills: homes.reduce((n, h) => n + h.querySelectorAll('path').length, 0),
  };
})()`);

// ---------------------------------------------------------------- both seats
const browser: Browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM ?? CHROME });
try {
  {
    const creator = toGuest(await api.createGuest());
    const joiner = toGuest(await api.createGuest());
    const created = await api.createMatch(creator.token);
    await api.joinMatch(joiner.token, created.match.inviteCode);
    const matchId = created.match.matchId;
    const guests: [Guest, Guest] = [creator, joiner];
    const a = await openSeat(browser, guests, matchId, 0);
    const b = await openSeat(browser, guests, matchId, 1);
    await openDuel(a, matchId);
    await openDuel(b, matchId);
    // Play a little so the board carries claimed tiles and terrain, not just the homes.
    for (const s of [a, b]) {
      for (let i = 0; i < 3; i++) {
        if (!(await myTurn(s))) break;
        await playTurn(s);
        await tick(600);
      }
    }
    for (const s of [a, b]) {
      const tag = `seat ${s.seat}`;
      await waitFor(async () => !(await myTurn(s)), 40_000);
      await tick(1_000);
      const art = await boardArt(s);
      check(`${tag}: the duel really is running with its art blocked`, s.blocked.length > 10 && art.hexes >= 19, `${s.blocked.length} art requests blocked, ${art.hexes} hexes`);
      check(`${tag}: no <image> points at a file that failed to load (nothing to paint a "?" with)`, art.failed.length === 0, art.failed.length ? art.failed.join(', ') : 'none');
      check(`${tag}: the blocked home art falls back to its flat fill, never an <image>`, art.homeGroups >= 2 && art.homeArt === 0 && art.homeFills >= art.homeGroups, `${art.homeGroups} homes, ${art.homeArt} images, ${art.homeFills} fills`);
      check(`${tag}: the board is still drawn (a painted board, not a blank one)`, art.paths >= 20 && art.hexes >= 19, `${art.paths} paths, ${art.hexes} hexes`);
      check(`${tag}: the page is not in an error state`, (await phase(s)) !== 'GAME_OVER', `phase ${await phase(s)}`);
    }
    await a.context.close();
    await b.context.close();
  }
} finally {
  await browser.close().catch(() => undefined);
  await previewServer.close().catch(() => undefined);
  await new Promise<void>((resolve) => apiServer.close(() => resolve()));
}

console.log(failed === 0 ? '\nart fallback: all checks passed' : `\nart fallback: ${failed} check(s) failed`);
process.exit(failed === 0 ? 0 : 1);
