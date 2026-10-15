// FUTASAKU 0.5 — two-context proof that the opponent's finished turn is REPLAYED and the acting
// player's controls stay closed until that replay drains.
//
//   npx tsx web/e2e/online-replay-gating.ts
//
// Context A (creator) and context B (joiner) open the same duel. The seat that is NOT to move
// samples its own page while the other seat completes a whole turn through the API; the samples
// must show the enemy turn still playing with no usable controls, then "Your turn" once the shared
// AnimQueue has drained onto the true final board.
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
import type { FetchLike } from '../../server/src/client.js';
import { openMenuEntry } from './helpers/menu-nav.js';

const CHROME =
  process.env.PW_CHROMIUM ??
  '/Users/patryk/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const OUT = new URL('../../docs/screens/online/', import.meta.url).pathname;
const PORT = Number(process.env.PREVIEW_PORT ?? 4214);
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
        // The futa05 build guard requires the public online config to be present; this suite only
        // needs the page to boot and poll, so placeholders keep it runnable without secrets.
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

const nodeFetch: FetchLike = (url, init) => fetch(url, init);
const api = new DuelClient({ baseUrl: apiBase, fetch: nodeFetch });
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
      requestId: `replay-${seq}-${Date.now()}`,
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

/** Samples the watching page: the turn word, whether the page says it can act, and the board size. */
const SAMPLER = `(() => {
  if (window.__gate) return;
  window.__gate = [];
  window.__gateTimer = setInterval(() => {
    const turn = (document.querySelector('[data-duel-turn]') || {}).textContent || '';
    window.__gate.push({
      t: Date.now(),
      turn: turn.trim(),
      canAct: document.documentElement.dataset.futa04Waiting === 'true',
      tiles: document.querySelectorAll('.l-tiles .tile[data-key]').length,
      pending: document.documentElement.dataset.futa04MoveActive === 'true' ? 1 : 0,
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
  const row = page.locator(`#online-matches li[data-match-id="${matchId}"]`);
  await row.waitFor({ state: 'visible', timeout: 25_000 });
  await row.click();
  await page.waitForSelector('#game:not([hidden])', { timeout: 25_000 });
  await page.waitForSelector('#duel-hud:not([hidden])', { timeout: 25_000 });
};

type Sample = { t: number; turn: string; canAct: boolean; tiles: number; pending: number };

const browser = await chromium.launch({ executablePath: CHROME });
try {
  const { context: ctxWait, page: waitPage } = await newContext(browser, waitSeat);
  await openDuel(waitPage);
  await waitPage.waitForTimeout(1500); // settle on the waiting board
  const before = (await waitPage.evaluate(`(() => ({
    turn: (document.querySelector('[data-duel-turn]') || {}).textContent || '',
    canAct: document.documentElement.dataset.futa04Waiting === 'true',
    tiles: document.querySelectorAll('.l-tiles .tile[data-key]').length,
  }))()`)) as { turn: string; canAct: boolean; tiles: number };
  await waitPage.evaluate(SAMPLER);

  // The starter completes a whole turn; the watcher must see it replayed before it can act.
  const placed = await playStarterTurn();

  // A real mid-replay frame: poll while the enemy turn animates and grab the first changed board.
  let midShot = false;
  let lastTiles = -1;
  const deadline = Date.now() + 8_000;
  while (Date.now() < deadline && !midShot) {
    const now = (await waitPage.evaluate(`(() => ({
      turn: ((document.querySelector('[data-duel-turn]') || {}).textContent || '').trim(),
      tiles: document.querySelectorAll('.l-tiles .tile[data-key]').length,
    }))()`)) as { turn: string; tiles: number };
    if (now.turn === "Opponent's turn" && lastTiles >= 0 && now.tiles !== lastTiles) {
      await waitPage.screenshot({ path: `${OUT}replay-mid-turn-1280x800.png` });
      midShot = true;
      console.log(`    mid-replay frame captured (tiles ${lastTiles} -> ${now.tiles})`);
    }
    lastTiles = now.tiles;
    await waitPage.waitForTimeout(40);
  }
  check('a mid-replay frame was captured', midShot);

  await waitPage.waitForFunction("document.querySelector('[data-duel-turn]')?.textContent?.includes('Your turn')", { timeout: 15_000 }).catch(() => undefined);
  await waitPage.waitForTimeout(2500);
  const samples = (await waitPage.evaluate('window.__gate')) as Sample[];
  await waitPage.evaluate('clearInterval(window.__gateTimer)');

  const gated = samples.filter((s) => s.turn === "Opponent's turn" && !s.canAct);
  const unlocked = samples.filter((s) => s.canAct && s.turn === 'Your turn');
  const animating = samples.some((s, i) => i > 0 && s.turn === "Opponent's turn" && s.tiles !== samples[i - 1]!.tiles);
  const final = samples.at(-1)!;

  // Compact timeline: only where turn / canAct / tiles change (diagnostics for the report).
  const timeline: string[] = [];
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i]!;
    const p = samples[i - 1];
    if (!p || p.turn !== s.turn || p.canAct !== s.canAct || p.tiles !== s.tiles) {
      timeline.push(`${s.t - samples[0]!.t}ms turn="${s.turn}" canAct=${s.canAct} tiles=${s.tiles}`);
    }
  }
  console.log(`    timeline:\n      ${timeline.join('\n      ')}`);

  check('the watcher starts on the opponent turn and cannot act', before.turn === "Opponent's turn" && !before.canAct, JSON.stringify(before));
  check('there is a window where the enemy turn is playing and controls are closed', gated.length > 0, `${gated.length} of ${samples.length} samples`);
  check('the board is actually animating during that window', animating, `${samples.filter((s) => s.turn === "Opponent's turn").length} enemy-turn samples`);
  check('once it drains the watcher can act, on their own turn', unlocked.length > 0 && final.canAct && final.turn === 'Your turn', JSON.stringify(final));
  check('the replay places the tiles the opponent placed', placed === 0 || final.tiles > before.tiles, `placed=${placed} before=${before.tiles} after=${final.tiles}`);

  // The board the watcher ends on matches the authoritative final board.
  const authoritative = (await api.getState(waitGuest.token, matchId)).player;
  const authoritativeTiles = Object.values(authoritative.view.board).filter((t) => t).length;
  check('the final board is the true one, not a stale one', final.tiles === authoritativeTiles, `seen=${final.tiles} server=${authoritativeTiles}`);

  await waitPage.screenshot({ path: `${OUT}replay-gating-after-1280x800.png` });
  await ctxWait.close();
} finally {
  await browser.close();
  await previewServer.close();
  await new Promise<void>((resolve) => apiServer.close(() => resolve()));
}

if (failed) {
  console.error(`\n${failed} replay gating checks failed`);
  process.exit(1);
}
console.log('\nOnline replay gating (two contexts) checks passed.');
