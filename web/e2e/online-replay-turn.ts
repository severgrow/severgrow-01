// REPLAY THE OPPONENT'S LAST TURN IN AN ONLINE DUEL (owner report, 2026-10-26:
// "the replay last round button was disabled all the time, so i wasnt able to rewatch opponents
// last turn").
//
// This suite runs a REAL duel against the real server, with one seat in Chromium and the other
// playing through the API, and proves the whole path in the product's own UI:
//
//   1. while the opponent is playing, the slot does NOT offer Replay (their turn is still open);
//   2. once their turn has finished, the slot IS Replay, enabled (`data-mode="replay"`);
//   3. tapping it plays THAT turn: the board is rewound to the turn's start (fewer tiles), the
//      steps run (a `grow`, from the pump's own log), and the display says REPLAY;
//   4. afterwards the board is back on the true live position — byte-identical to the board
//      before the tap, and the same tile count the server holds — with input open again.
//
//   PW_CHROMIUM="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" npx tsx web/e2e/online-replay-turn.ts
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
      requestId: `replay-turn-${seq}-${Date.now()}`,
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

/** Per-frame sampler: the board the page is SHOWING, the slot's state and the display's LED. */
const SAMPLER = `(() => {
  const hook = window.__severgrow;
  window.__replaySamples = [];
  let running = true;
  window.__stopReplaySamples = () => { running = false; };
  const tileCount = (board) => Object.values(board || {}).filter(Boolean).length;
  const read = () => {
    const slot = document.getElementById('tool-undo');
    const led = document.getElementById('smart-led');
    const panel = document.getElementById('smart-panel');
    return {
      t: performance.now(),
      tiles: tileCount(hook.shownBoard()),
      mode: slot ? slot.dataset.mode || '' : '',
      disabled: slot ? !!slot.disabled : true,
      text: led ? (led.textContent || '').trim() : '',
      dim: !!panel && panel.classList.contains('led-theirs'),
      busy: hook.busy(),
    };
  };
  const tick = () => {
    if (!running) return;
    window.__replaySamples.push(read());
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
})()`;

type Sample = {
  t: number;
  tiles: number;
  mode: string;
  disabled: boolean;
  text: string;
  dim: boolean;
  busy: boolean;
};

const slotState = async (page: Page): Promise<{ mode: string; disabled: boolean }> =>
  (await page.evaluate(`(() => { const s = document.getElementById('tool-undo');
    return { mode: s ? s.dataset.mode || '' : '', disabled: s ? !!s.disabled : true }; })()`)) as {
    mode: string;
    disabled: boolean;
  };

const boardNow = async (page: Page): Promise<{ board: unknown; tiles: number }> =>
  (await page.evaluate(`(() => { const b = window.__severgrow.state().board;
    return { board: b, tiles: Object.values(b).filter(Boolean).length }; })()`)) as { board: unknown; tiles: number };

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

const browser = await chromium.launch({ executablePath: CHROME });
try {
  const { context: ctxWait, page } = await newContext(browser, waitSeat);
  await openDuel(page);
  await page.waitForTimeout(1500); // settle on the waiting board

  // 1. Their turn: the slot must NOT offer Replay — their turn is still open.
  const waitingSlot = await slotState(page);
  const waitingDiag = (await page.evaluate('window.__severgrow.online()')) as { replayTurn: unknown; replayReason: string } | null;
  check(
    'while the opponent is moving, the slot does not offer Replay',
    waitingSlot.mode !== 'replay',
    `mode="${waitingSlot.mode}" reason=${waitingDiag?.replayReason ?? 'n/a'}`,
  );

  // 2. The starter completes a whole turn; the watcher's turn begins.
  const placed = await playStarterTurn();
  await page.waitForFunction("document.querySelector('[data-duel-turn]')?.textContent?.includes('Your turn')", { timeout: 30_000 });
  await page.waitForFunction('(() => !window.__severgrow.busy())()', undefined, { timeout: 30_000 });
  await page.waitForFunction(
    `(() => { const s = document.getElementById('tool-undo');
      return !!s && s.dataset.mode === 'replay' && !s.disabled && !window.__severgrow.busy(); })()`,
    undefined,
    { timeout: 30_000 },
  );
  const lit = await slotState(page);
  const diag = (await page.evaluate('window.__severgrow.online()')) as {
    replayTurn: { steps: number } | null;
    replayReason: string;
  };
  check('the Replay slot is offered and enabled once their turn has finished', lit.mode === 'replay' && !lit.disabled, JSON.stringify(lit));
  check('it is offered because the turn was verified against the live board', diag.replayReason === 'ok' && !!diag.replayTurn, `${diag.replayReason}, ${diag.replayTurn?.steps ?? 0} steps`);
  await page.screenshot({ path: `${OUT}replay-turn-offered-1280x800.png` });

  // 3. Tap it: the board must be REWOUND first, then replay that turn, with the display saying so.
  const before = await boardNow(page);
  await page.evaluate(SAMPLER);
  await page.evaluate('(() => window.__severgrow.clearAnimLog())()');
  const clickedAt = (await page.evaluate(`(() => { const t = performance.now();
    document.getElementById('tool-undo').click(); return t; })()`)) as number;
  await page.waitForFunction('(() => window.__severgrow.busy())()', undefined, { timeout: 5_000 });
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${OUT}replay-turn-playing-1280x800.png` });
  await page.waitForFunction('(() => !window.__severgrow.busy())()', undefined, { timeout: 60_000 });
  const samples = (await page.evaluate('window.__replaySamples')) as Sample[];
  await page.evaluate('window.__stopReplaySamples && window.__stopReplaySamples()');

  const log = (await page.evaluate('window.__severgrow.animLog()')) as { ev: string; t: number; ms?: number; k?: string }[];
  const enter = log.find((m) => m.ev === 'pump:enter');
  const leave = log.find((m) => m.ev === 'pump:leave');
  const steps = log.filter((m) => m.ev === 'step');
  const grew = steps.filter((s) => s.k === 'grow');
  const window0 = enter ? enter.t : clickedAt;
  const window1 = leave ? leave.t : Infinity;
  const during = samples.filter((s) => s.t >= window0 && s.t <= window1);
  const minTiles = during.length ? Math.min(...during.map((s) => s.tiles)) : -1;
  const replayHeld = during.filter((s) => s.text === 'REPLAY' && s.dim);

  check('tapping it starts a replay pump', !!enter && !!leave, `${during.length} frames sampled`);
  check('the replayed turn really contains their Grow', grew.length > 0, steps.map((s) => s.k).join(','));
  check(
    'the board is rewound to the turn start before it replays',
    minTiles >= 0 && minTiles < before.tiles,
    `min ${minTiles} tiles during, ${before.tiles} live, opponent placed ${placed}`,
  );
  check(
    'the display says REPLAY while it plays',
    replayHeld.length > 0,
    `${replayHeld.length} of ${during.length} frames`,
  );

  // 4. Back on the true live board, with input open.
  const after = await boardNow(page);
  const authoritative = (await api.getState(waitGuest.token, matchId)).player;
  const authoritativeTiles = Object.values(authoritative.view.board).filter((t) => t).length;
  check(
    'afterwards the board is the true live position (identical to before the tap)',
    JSON.stringify(after.board) === JSON.stringify(before.board),
    `${after.tiles} tiles after, ${before.tiles} before`,
  );
  check('and it is the position the server holds', after.tiles === authoritativeTiles, `seen=${after.tiles} server=${authoritativeTiles}`);
  const openAgain = (await page.evaluate(`(() => ({
    canAct: document.documentElement.dataset.futa04Waiting === 'true',
    slot: (() => { const s = document.getElementById('tool-undo'); return { mode: s ? s.dataset.mode || '' : '', disabled: s ? !!s.disabled : true }; })(),
    text: (document.getElementById('smart-led') || {}).textContent || '',
    dim: !!document.getElementById('smart-panel')?.classList.contains('led-theirs'),
  }))()`)) as { canAct: boolean; slot: { mode: string; disabled: boolean }; text: string; dim: boolean };
  check('input is open again on my turn, on the live board', openAgain.canAct, JSON.stringify(openAgain.slot));
  check('the REPLAY sign and its dim are cleared', openAgain.text.trim() !== 'REPLAY' && !openAgain.dim, openAgain.text.trim());
  check('the slot still offers the same turn (nothing was consumed)', openAgain.slot.mode === 'replay' && !openAgain.slot.disabled, JSON.stringify(openAgain.slot));
  await page.screenshot({ path: `${OUT}replay-turn-after-1280x800.png` });
  await ctxWait.close();
} finally {
  await browser.close();
  await previewServer.close();
  await new Promise<void>((resolve) => apiServer.close(() => resolve()));
}

if (failed) {
  console.error(`\n${failed} online replay-turn checks failed`);
  process.exit(1);
}
console.log('\nOnline replay of the opponent\'s last turn: all checks passed.');
