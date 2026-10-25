// FUTASAKU 0.5 — two-context proof that the OPPONENT's replayed turn reads as "not ours": the
// cockpit display dims while their turn is on the glass, and the dim is gone the moment it drains.
//
//   npx tsx web/e2e/online-opponent-replay-dim.ts
//
// Context B (watching seat) opens the duel; context A (acting seat) completes a whole turn through
// the API. While B replays it, the display carries `#smart-panel.led-theirs` (the dim) and a frame
// is captured to docs/screens/online/. Once the replay drains the class must be gone — a stuck dim
// would be worse than none.
import { spawn } from 'node:child_process';
import type { AddressInfo } from 'node:net';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
import type { Browser, BrowserContext, Page } from 'playwright-core';
import { preview } from 'vite';
import type { Action } from '../../src/engine/index.js';
import { DEFAULT_SERVER_CONFIG } from '../../server/src/config.js';
import { createHttpServer } from '../../server/src/http.js';
import { MatchService } from '../../server/src/service.js';
import { MemoryStorage } from '../../server/src/storage/memory.js';
import { DuelClient } from '../../server/src/client.js';
import { openMenuEntry } from './helpers/menu-nav.js';
import { expandYourMatches } from './helpers/lobby-matches.js';

const CHROME =
  process.env.PW_CHROMIUM ??
  '/Users/patryk/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const OUT = new URL('../../docs/screens/online/', import.meta.url).pathname;
const PORT = Number(process.env.PREVIEW_PORT ?? 4216);
const PREFIX = 'futa05:';

mkdirSync(OUT, { recursive: true });
let failed = 0;
const check = (name: string, ok: boolean, note = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? `  (${note})` : ''}`);
};

const buildWithApi = async (apiBase: string): Promise<void> =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['./node_modules/vite/bin/vite.js', 'build', '--config', 'web/vite.config.ts'], {
      env: {
        ...process.env,
        PATH: process.env.PATH,
        CHANNEL: 'futa05',
        VITE_DUEL_API_URL: apiBase,
        // The futa05 build guard only needs the public online config to be present.
        VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL || 'http://127.0.0.1:9',
        VITE_SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY || 'local-e2e-anon-key',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let err = '';
    child.stderr?.on('data', (b) => {
      err += String(b);
    });
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`web:build failed: ${err}`))));
  });

const service = new MatchService({
  storage: new MemoryStorage(),
  config: { ...DEFAULT_SERVER_CONFIG, corsOrigins: ['*'], turnTimeoutMs: 24 * 3_600_000 },
});
const apiServer = createHttpServer({ service, config: { ...DEFAULT_SERVER_CONFIG, corsOrigins: ['*'] } });
await new Promise<void>((resolve) => apiServer.listen(0, '127.0.0.1', resolve));
const apiPort = (apiServer.address() as AddressInfo).port;
const apiBase = `http://127.0.0.1:${apiPort}`;

await buildWithApi(apiBase);
const previewServer = await preview({
  configFile: 'web/vite.config.ts',
  preview: { host: '127.0.0.1', port: PORT, strictPort: true },
  logLevel: 'error',
});
const origin =
  previewServer.resolvedUrls?.local?.[0]?.replace(/\/$/, '') ??
  `http://127.0.0.1:${(previewServer.httpServer?.address() as AddressInfo | null)?.port ?? PORT}`;
for (let i = 0; i < 40; i++) {
  try {
    const res = await fetch(`${origin}/`);
    if (res.ok || res.status === 404) break;
  } catch {
    await new Promise((r) => setTimeout(r, 100));
  }
}

const api = new DuelClient({ baseUrl: apiBase, fetch: (url, init) => fetch(url, init) });
const guestA = await api.createGuest();
const guestB = await api.createGuest();
const created = await api.createMatch(guestA.token);
const joined = await api.joinMatch(guestB.token, created.match.inviteCode);
const matchId = created.match.matchId;
const starterIsCreator = created.player.startingPlayer === created.player.seat;
const starterSeat = starterIsCreator ? created.player.seat : joined.player.seat;
const starterToken = starterIsCreator ? guestA.token : guestB.token;
const waitSeat = starterSeat === 0 ? 1 : 0;
const waitGuest = waitSeat === 0 ? guestA : guestB;
console.log(`match ${matchId}: starter seat ${starterSeat}, watching seat ${waitSeat}`);

/** Play one whole turn for the starter through the API (Draw → Grow → EndAct → Discard). */
const playStarterTurn = async (): Promise<number> => {
  let view = (await api.getState(starterToken, matchId)).player;
  let seq = 0;
  let tilesPlaced = 0;
  const submit = async (actions: Action[]): Promise<void> => {
    seq += 1;
    const res = await api.submitAction(starterToken, matchId, {
      expectedRevision: view.revision,
      requestId: `dim-${seq}-${Date.now()}`,
      actions,
    });
    view = res.player;
  };
  const draw = view.legalActions.find((a) => a.t === 'Draw');
  if (draw) await submit([draw]);
  const grow = view.legalActions.find((a) => a.t === 'Bloom') ?? view.legalActions.find((a) => a.t === 'Sprout');
  if (grow) {
    tilesPlaced = grow.t === 'Bloom' ? grow.hexes.length : 1;
    await submit([grow]);
  }
  const end = view.legalActions.find((a) => a.t === 'EndAct');
  if (end) await submit([end]);
  const discard = view.legalActions.find((a) => a.t === 'Discard');
  if (discard) await submit([discard]);
  return tilesPlaced;
};

/** Samples the watching page: the turn word, whether the display is dimmed, the board size. */
const SAMPLER = `(() => {
  if (window.__dim) return;
  window.__dim = [];
  window.__dimTimer = setInterval(() => {
    const turn = (document.querySelector('[data-duel-turn]') || {}).textContent || '';
    window.__dim.push({
      t: Date.now(),
      turn: turn.trim(),
      dim: !!document.querySelector('#smart-panel.led-theirs'),
      tiles: document.querySelectorAll('.l-tiles .tile[data-key]').length,
    });
  }, 25);
})()`;

const newContext = async (browser: Browser, seat: 0 | 1): Promise<{ context: BrowserContext; page: Page }> => {
  const guest = seat === 0 ? guestA : guestB;
  const identity = { token: guest.token, playerId: guest.player.id, displayName: guest.player.displayName, kind: 'guest' };
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await context.addInitScript(
    ({ idKey, sessKey, identity, session }) => {
      localStorage.clear();
      localStorage.setItem(idKey, JSON.stringify(identity));
      localStorage.setItem(sessKey, JSON.stringify(session));
      localStorage.setItem('futa05:severgrow.duel.firstCard.v1', '1');
      localStorage.setItem(
        'futa05:severgrow.settings.v1',
        JSON.stringify({ sound: false, music: false, coach: false, speed: 'normal', reduceMotion: false, eyeCandy: false }),
      );
    },
    {
      idKey: `${PREFIX}severgrow.duel.identity.v1`,
      sessKey: `${PREFIX}severgrow.duel.session.v1`,
      identity,
      session: { token: guest.token, matchId, seat },
    },
  );
  const page = await context.newPage();
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  return { context, page };
};

const openDuel = async (page: Page): Promise<void> => {
  await openMenuEntry(page, 'menu-online', { timeout: 40_000 });
  await page.waitForSelector('#online-hub:not([hidden])', { timeout: 25_000 });
  if (await page.locator('#online-first-ok').isVisible().catch(() => false)) await page.click('#online-first-ok');
  await expandYourMatches(page);
  const row = page.locator(`#online-matches li[data-match-id="${matchId}"]`);
  await row.waitFor({ state: 'visible', timeout: 25_000 });
  await row.click();
  await page.waitForSelector('#game:not([hidden])', { timeout: 25_000 });
  await page.waitForSelector('#duel-hud:not([hidden])', { timeout: 25_000 });
};

type Sample = { t: number; turn: string; dim: boolean; tiles: number };

const browser = await chromium.launch({ executablePath: CHROME });
try {
  const { context: ctxWait, page: waitPage } = await newContext(browser, waitSeat);
  await openDuel(waitPage);
  await waitPage.waitForTimeout(1500); // settle on the waiting board
  await waitPage.evaluate(SAMPLER);
  // A full-brightness reference of the same cockpit, for the owner to compare against the dim.
  const brightBox = await waitPage.locator('#futa04-box').boundingBox().catch(() => null);
  if (brightBox) await waitPage.screenshot({ path: `${OUT}opponent-replay-bright-cockpit.png`, clip: brightBox });

  // The starter completes a whole turn; the watcher replays it with the display dimmed.
  const placed = await playStarterTurn();

  // Grab a real mid-replay frame: the first sample where the display is dimmed.
  let shot = false;
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline && !shot) {
    const now = (await waitPage.evaluate(`(() => ({
      turn: ((document.querySelector('[data-duel-turn]') || {}).textContent || '').trim(),
      dim: !!document.querySelector('#smart-panel.led-theirs'),
    }))()`)) as { turn: string; dim: boolean };
    if (now.dim) {
      await waitPage.screenshot({ path: `${OUT}opponent-replay-dim-1280x800.png` });
      const box = await waitPage.locator('#futa04-box').boundingBox().catch(() => null);
      if (box) await waitPage.screenshot({ path: `${OUT}opponent-replay-dim-cockpit.png`, clip: box });
      shot = true;
      console.log(`    dimmed replay frame captured (turn="${now.turn}")`);
    }
    await waitPage.waitForTimeout(25);
  }
  check('a mid-replay frame was captured with the display dimmed', shot);

  await waitPage
    .waitForFunction("document.querySelector('[data-duel-turn]')?.textContent?.includes('Your turn')", { timeout: 15_000 })
    .catch(() => undefined);
  await waitPage.waitForTimeout(2500);
  const samples = (await waitPage.evaluate('window.__dim')) as Sample[];
  await waitPage.evaluate('clearInterval(window.__dimTimer)');

  const dimming = samples.filter((s) => s.dim);
  const final = samples.at(-1)!;
  const dimAfter = (await waitPage.evaluate(`!!document.querySelector('#smart-panel.led-theirs')`)) as boolean;

  console.log(
    `    ${dimming.length} of ${samples.length} samples dimmed; dim over the replay: ${dimming.length > 0}; final turn="${final.turn}"`,
  );
  check('the display dims while the enemy turn replays', dimming.length > 0, `${dimming.length} samples`);
  check('the dim only ever appears on the enemy turn, never on a board you can act on', dimming.every((s) => s.turn !== 'Your turn'), JSON.stringify(dimming.slice(0, 3)));
  check('the dim lifts once the replay drains (no stuck dim)', !dimAfter);
  check('after the replay the watcher is on its own turn', final.turn === 'Your turn');
  check('the replay placed the tiles the opponent placed', placed === 0 || final.tiles > 0, `placed=${placed}`);

  // The board the watcher ends on matches the authoritative final board.
  const authoritative = (await api.getState(waitGuest.token, matchId)).player;
  const authoritativeTiles = Object.values(authoritative.view.board).filter((t) => t).length;
  check('the final board is the true one', final.tiles === authoritativeTiles, `seen=${final.tiles} server=${authoritativeTiles}`);

  await waitPage.screenshot({ path: `${OUT}opponent-replay-dim-after-1280x800.png` });
  await ctxWait.close();
} finally {
  await browser.close();
  await previewServer.close();
  await new Promise<void>((resolve) => apiServer.close(() => resolve()));
}

if (failed) {
  console.error(`\n${failed} opponent replay dim checks failed`);
  process.exit(1);
}
console.log('\nOnline opponent replay dim (two contexts) checks passed.');
