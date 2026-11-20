// NO THREE PLANETS IN A ROW (owner, 2026-11-20: "never show the planet view and the end of the game
// 3 times in a row --- if player keeps winning, show the winning board view result every 2 planet
// views to alternate and not bore"). Measured on the live (futa05) build in a REAL browser, playing
// REAL winning finishes:
//
//   CHANNEL=futa05 VITE_DUEL_API_URL=https://duel-stub.invalid/v1 \
//     VITE_SUPABASE_URL=https://stub.invalid VITE_SUPABASE_ANON_KEY=stub \
//     npm run web:build
//   PW_CHROMIUM="/path/to/chrome" npx tsx web/e2e/finish-altview.ts
//
// Four winning finishes in ONE browser context, each after a REAL page reload (the position is
// seeded before every load), so the run is proven to survive closing the tab between games:
//
//   win 1 -> PLANET (run 1)     win 2 -> PLANET (run 2)     win 3 -> winning BOARD (run 0)
//
// Then the control: the same third win with the run cleared — the stateless rule the game had before
// this change — shows the planet. That is the "before"; wins 1-2 are the same before. The board on
// win 3 is the "after".
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
import type { Page } from 'playwright-core';
import { preview } from 'vite';
import { apply, coordKey, legalActions, newGame, viewFor } from '../../src/engine/index.js';
import type { State } from '../../src/engine/index.js';
import { WORLD_CELLS } from '../../server/src/world.js';
import { seedSettings, SETTINGS_PREFIXES } from './helpers/settings-seed.js';
import { positionSave } from './position.js';
import { resumeSavedGame } from './helpers/menu-nav.js';

const OUT = process.env.ALT_VIEW_OUT ?? '/tmp/altview-final/';
const PORT = Number(process.env.PORT ?? 4337);

let failed = 0;
const check = (name: string, ok: boolean, note = '') => {
  if (!ok) failed += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? `  (${note})` : ''}`);
};

mkdirSync(OUT, { recursive: true });

/** The world read is stubbed empty; the wallet says a tile is affordable (the planet is due). */
const stub = async (page: Page): Promise<void> => {
  await page.route(/\/v1\/world(\?|$)/, (r) => r.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({
      ok: true,
      world: { version: 1, revision: 5, cost: 100, growAnywhere: true, cells: WORLD_CELLS, claims: [] },
    }),
  }));
  await page.route('**/v1/world/challenges*', (r) => r.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, incoming: [], outgoing: [], serverNow: Date.now() }),
  }));
  await page.route('**/v1/seeds/wallet', (r) => r.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ ok: true, wallet: { balance: 150, lifetimeEarned: 250, lifetimeSpent: 0, worldInvitationSeen: true } }),
  }));
  await page.route('**/v1/guests*', (r) => r.fulfill({
    status: 201, contentType: 'application/json',
    body: JSON.stringify({ ok: true, token: 'stub-token', player: { id: 'stub', kind: 'guest', displayName: 'StubGuest' }, serverNow: Date.now() }),
  }));
  await page.route('**/auth/v1/settings', (r) => r.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ external: { email: true, google: false } }),
  }));
  await page.route('**/v1/auth/methods', (r) => r.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, email: true }),
  }));
};

const waitStarterRitual = async (page: Page): Promise<void> => {
  await page.waitForFunction(() => {
    const r = document.getElementById('starter-lottery');
    return !r || r.hidden || !r.getClientRects().length;
  }, undefined, { timeout: 15_000 }).catch(() => undefined);
};

/** A legal winning Grow for the human seat, one move from the end. */
const winningPosition = (): State => {
  const base = newGame(23), board = { ...base.board }, terrain = { ...base.terrain };
  for (const [i, key] of ['-1,1', '0,0', '1,0', '2,0', '2,-1', '3,-2', '3,-3', '2,-3', '1,-2', '0,1', '0,2', '-1,2', '-2,1', '-2,0'].entries()) {
    if (key in board && !board[key]) { board[key] = { owner: 0, strength: 2 + i % 7 }; terrain[key] = 'normal'; }
  }
  board['1,-1'] = null; terrain['1,-1'] = 'normal';
  return {
    ...base, board, terrain, phase: 'ACT', actor: 0, turnPlayer: 0,
    hands: [[{ id: 1200, suit: 1, rank: 9 }], base.hands[1]], history: [],
  };
};

const toGameOver = async (page: Page): Promise<string> => {
  await waitStarterRitual(page);
  await page.waitForFunction(() => !(window as unknown as { __severgrow: { busy: () => boolean } }).__severgrow.busy());
  const state = await page.evaluate(() => (window as unknown as { __severgrow: { state: () => State } }).__severgrow.state());
  const action = legalActions(viewFor(state, 0)).find((a) => a.t === 'Sprout' && coordKey(a.coord) === '1,-1');
  if (!action || apply(state, action).result?.winner !== 0) throw Error('the fixture must finish through a legal win');
  const accepted = await page.evaluate((a) => (window as unknown as { __severgrow: { playFor: (a: unknown, p: number) => boolean } }).__severgrow.playFor(a, 0), action);
  if (!accepted) return 'the winning Grow was not accepted';
  await page.waitForFunction(() => (window as unknown as { __severgrow: { state: () => State } }).__severgrow.state().phase === 'GAME_OVER');
  return 'ended';
};

const dismissInstall = async (page: Page): Promise<void> => {
  for (const id of ['#install-close', '#install-later']) {
    const el = page.locator(id);
    if (await el.isVisible().catch(() => false)) {
      await el.click({ timeout: 2_000 }).catch(() => undefined);
      return;
    }
  }
};

const waitFinish = async (page: Page): Promise<void> => {
  await page.waitForSelector('#gameover:not([hidden])', { timeout: 30_000 });
  await page.waitForFunction('(() => { const h = window.__severgrow; return !h.busy(); })()', undefined, { timeout: 30_000 });
  await dismissInstall(page);
  // THE WINDOW'S OWN DECISION: the held place is `#go-boardview` visible but still `visibility:
  // hidden` while the balance is in flight, so wait for a REAL window.
  await page.waitForFunction(`(() => {
    const id = (x) => document.getElementById(x);
    const vis = (el) => !!el && !el.hidden && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
    return vis(id('go-boardview')) || vis(id('go-world'));
  })()`, undefined, { timeout: 20_000 });
  await page.waitForTimeout(900);
};

/** The card's window and the persisted run, in one read. The channel's storage patch prefixes every
 *  `getItem`, so the probe asks for the UNPREFIXED key and reports the raw (prefixed) key it found. */
const READ = `(() => {
  const id = (x) => document.getElementById(x);
  const vis = (el) => !!el && !el.hidden && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
  const RUN = 'severgrow.finish.planet-run.v1', IDENTITY = 'severgrow.duel.identity.v1';
  const runKey = Object.keys(localStorage).find((k) => k.endsWith(RUN)) || '';
  const raw = runKey ? localStorage.getItem(RUN) : null;
  let runBook = null;
  try { runBook = raw ? JSON.parse(raw) : null; } catch { runBook = 'unreadable'; }
  const identityKey = Object.keys(localStorage).find((k) => k.endsWith(IDENTITY)) || '';
  let identity = null;
  try { identity = identityKey ? JSON.parse(localStorage.getItem(IDENTITY) || 'null') : null; } catch { identity = null; }
  return {
    anatomy: id('gameover').dataset.anatomy,
    window: vis(id('go-boardview')) ? 'board' : vis(id('go-world')) ? 'planet' : 'none',
    worldHidden: !!id('go-world')?.hidden,
    boardHidden: !!id('go-boardview')?.hidden,
    boardHasBoard: !!document.querySelector('#go-boardview-board svg'),
    boardTitle: (id('go-boardview-title')?.textContent || '').trim(),
    title: (id('go-title')?.textContent || '').trim(),
    canvas: !!document.querySelector('#go-world-surface > .planet-canvas'),
    runKey, runBook,
    identity: identity ? { playerId: identity.playerId, kind: identity.kind } : null,
  };
})()`;

type Seen = {
  anatomy: string; window: 'planet' | 'board' | 'none'; worldHidden: boolean; boardHidden: boolean;
  boardHasBoard: boolean; boardTitle: string; title: string; canvas: boolean;
  runKey: string; runBook: { v?: number; players?: Record<string, number> } | null | 'unreadable';
  identity: { playerId: string; kind: string } | null;
};

const browser = await chromium.launch(process.env.PW_CHROMIUM
  ? { executablePath: process.env.PW_CHROMIUM }
  : { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const server = await preview({ configFile: 'web/vite.config.ts', preview: { host: '127.0.0.1', port: PORT, strictPort: true }, logLevel: 'error' });
const origin = server.resolvedUrls?.local?.[0]?.replace(/\/$/, '') ?? `http://127.0.0.1:${PORT}`;

const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
const page = await context.newPage();
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(e.message));
await seedSettings(page, { sound: false, music: false, coach: false, speed: 'skip', reduceMotion: true, autoSkip: false, confirmPolicy: 'always' });
await stub(page);
// The same one-move-away position and the same stored identity before EVERY load, so each round is
// a real "close the tab and come back" session on the SAME device and player.
await page.addInitScript(({ save, prefixes }) => {
  const w = window as unknown as { __name?: (f: unknown) => unknown };
  w.__name = (f: unknown) => f;
  for (const prefix of prefixes) {
    localStorage.setItem(prefix + 'severgrow.save.v7', save);
    localStorage.setItem(prefix + 'severgrow.install-prompt.v1', JSON.stringify({ games: 0, shown: true, never: true }));
    localStorage.setItem(prefix + 'severgrow.duel.identity.v1', JSON.stringify({ token: 'local-planet-token', playerId: 'stub', displayName: 'Cedar', kind: 'guest' }));
  }
}, { save: positionSave({ state: winningPosition(), coach: { step: 99, taught: [], known: [], choice: 0, summaryDone: true } }), prefixes: [...SETTINGS_PREFIXES] });

/** One whole round: boot, resume, win, and read the card + the stored run. */
const playOne = async (tag: string, clearRun = false): Promise<Seen> => {
  await page.goto(origin, { waitUntil: 'load' });
  await resumeSavedGame(page);
  await page.waitForFunction('(() => { const h = window.__severgrow; return !!h && !!h.state(); })()', undefined, { timeout: 40_000 });
  if (clearRun) {
    // Raw removal (the channel patch would prefix the key a second time).
    await page.evaluate(() => {
      for (const key of Object.keys(localStorage)) {
        if (key.endsWith('severgrow.finish.planet-run.v1')) Storage.prototype.removeItem.call(localStorage, key);
      }
    });
  }
  const ended = await toGameOver(page);
  check(`[${tag}] the practice game reached its end`, ended === 'ended', ended);
  await waitFinish(page);
  const seen = await page.evaluate(READ) as Seen;
  console.log(`  [${tag}] window ${seen.window} · anatomy ${seen.anatomy} · run ${JSON.stringify(seen.runBook)} · identity ${seen.identity?.playerId ?? '(none)'}`);
  await page.screenshot({ path: `${OUT}${tag}.png` });
  return seen;
};

try {
  const first = await playOne('win-1-planet');
  check('win 1 shows the PLANET', first.window === 'planet' && first.canvas, first.window);
  check('win 1 is the planet CARD', first.anatomy === 'planet', first.anatomy);
  check('win 1 records planet run 1 for this player', first.runBook !== null && first.runBook !== 'unreadable' && first.runBook.players?.stub === 1, JSON.stringify(first.runBook));
  check('the run key carries the channel prefix', first.runKey === 'futa05:severgrow.finish.planet-run.v1', first.runKey);
  check('the run is scoped to the stored player id', first.identity?.playerId === 'stub', JSON.stringify(first.identity));

  const second = await playOne('win-2-planet');
  check('win 2 (after a real reload) still shows the PLANET', second.window === 'planet' && second.canvas, second.window);
  check('win 2 records planet run 2 — the count survived the reload', second.runBook !== null && second.runBook !== 'unreadable' && second.runBook.players?.stub === 2, JSON.stringify(second.runBook));

  const third = await playOne('win-3-board');
  check('win 3 shows the winning BOARD, not a third planet', third.window === 'board', third.window);
  check('win 3 is still the planet CARD with the board in its window', third.anatomy === 'planet', third.anatomy);
  check('win 3\'s board window carries the final board', third.boardHasBoard, third.boardTitle);
  check('win 3 disposes the planet pane (no canvas behind the board)', !third.canvas);
  check('win 3 starts the run over (no entry = 0)', third.runBook === null || (typeof third.runBook === 'object' && !third.runBook.players?.stub), JSON.stringify(third.runBook));

  // THE BEFORE: with no remembered run (what every win had before this change, and what the cycle
  // resets to after its board) the same affordable win shows the planet.
  const control = await playOne('win-4-no-memory-planet', true);
  check('control: a win with no remembered run shows the planet (the old, stateless rule)', control.window === 'planet' && control.canvas, control.window);
  check('control: that win then records run 1', control.runBook !== null && control.runBook !== 'unreadable' && control.runBook.players?.stub === 1, JSON.stringify(control.runBook));

  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
} finally {
  await context.close();
  await browser.close();
  await server.close();
}
console.log(failed ? `\n${failed} check(s) FAILED` : '\nall checks PASSED');
console.log(`frames: ${OUT}`);
process.exit(failed ? 1 : 0);
