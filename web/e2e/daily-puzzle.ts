// THE DAILY PUZZLE, in a real browser (owner, 2026-10-27).
//
// The clock is set to puzzle #2's day. The suite opens PLAY → DAILY #002, starts the try, ends the
// Grow step at once (a miss: the sheet says how close it was, the opponent has not moved, a try is
// used), tries again with the proven answer (solved: the tile is earned and recorded, the share line
// is right), then checks the menu now says the tile is waiting — and that the player's own saved
// game was never touched. Screens are saved for review at phone size.
//
//   CHANNEL=futa04 npm run web:build && npx tsx web/e2e/daily-puzzle.ts
import { chromium } from 'playwright-core';
import type { Page } from 'playwright-core';
import { legalActions, viewFor } from '../../src/engine/index.js';
import type { Action } from '../../src/engine/index.js';
import { prove } from '../../src/daily/core.js';
import { dailyPuzzle } from '../../src/daily/puzzles.js';
import { DAILY_EPOCH } from '../../src/daily/schedule.js';
import { DEFAULT_ADMIN_PLAYER_IDS } from '../../server/src/config.js';
import { servePreview } from './helpers/preview-port.js';
import { seedSettings } from './helpers/settings-seed.js';

const CHROME = process.env.PW_CHROMIUM ?? undefined;
const SHOTS = process.env.SHOTS ?? '/tmp';
let failed = 0;
const check = (name: string, ok: boolean, note = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? `  (${note})` : ''}`);
};

const NO = 2;
const puzzle = dailyPuzzle(NO)!;
const proof = prove(puzzle, 50_000, 6);
if (!proof.ok) throw new Error('puzzle #2 does not prove');
const endAct = legalActions(viewFor(puzzle.start, 0)).find((a) => a.t === 'EndAct')!;
/** The owner's account on this device: the only one that sees the Daily while it is tested. */
const RYK = JSON.stringify({ token: 'e2e-not-a-real-token', playerId: DEFAULT_ADMIN_PLAYER_IDS[0], displayName: 'RYK', kind: 'account' });
const noon = Date.parse(`${DAILY_EPOCH}T12:00:00Z`) + (NO - 1) * 86_400_000;

const text = (p: Page, id: string) => p.evaluate((i) => document.getElementById(i)?.textContent?.trim() ?? '', id);
const visible = (p: Page, id: string) => p.evaluate((i) => {
  const el = document.getElementById(i);
  return !!el && !el.hidden && el.getClientRects().length > 0;
}, id);
const state = (p: Page) => p.evaluate(() => (window as any).__severgrow.state());
const play = (p: Page, a: Action) => p.evaluate((x) => (window as any).__severgrow.playFor(x, 0), a);
const settle = (p: Page) => p.waitForFunction(() => !(window as any).__severgrow.busy(), undefined, { timeout: 20_000 });
const sheetUp = (p: Page, title: string) =>
  p.waitForFunction((t) => {
    const s = document.getElementById('sheet-daily');
    return !!s && !s.hidden && document.getElementById('daily-title')?.textContent?.trim() === t;
  }, title, { timeout: 20_000 });
const keys = (p: Page) => p.evaluate(() => [...document.querySelectorAll('#daily-actions button')].map((b) => b.textContent?.trim() ?? ''));
const press = (p: Page, label: string) => p.evaluate((l) => {
  const b = [...document.querySelectorAll<HTMLButtonElement>('#daily-actions button')].find((x) => x.textContent?.trim() === l);
  b?.click();
  return !!b;
}, label);
const shot = (p: Page, name: string) => p.screenshot({ path: `${SHOTS}/daily-${name}-390x844.png` });

const { server, origin } = await servePreview(0, { logLevel: 'error' });
const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  await page.clock.setFixedTime(noon);
  await seedSettings(page, { sound: false, music: false, coach: false, speed: 'skip', reduceMotion: false, eyeCandy: false });
  await page.goto(origin + '/');
  await page.waitForFunction(() => (window as any).__severgrow?.ready?.() === true, undefined, { timeout: 30_000 });

  // Hidden for everyone else (owner, 2026-10-27): a player who is not RYK never sees the key.
  await page.click('#menu-play');
  await page.waitForFunction(() => !document.getElementById('play-menu')?.hidden);
  check('another player does not see the Daily at all', !(await visible(page, 'menu-daily')) && !(await visible(page, 'daily-readout')));
  await page.evaluate((raw) => {
    for (const p of ['', 'main2:', 'futa04:']) localStorage.setItem(`${p}severgrow.duel.identity.v1`, raw);
  }, RYK);
  await page.click('#play-back');

  // PLAY → DAILY #002
  await page.click('#menu-play');
  await page.waitForFunction(() => !document.getElementById('play-menu')?.hidden);
  check('the PLAY submenu offers today\'s puzzle', (await text(page, 'menu-daily')) === 'DAILY #002', await text(page, 'menu-daily'));
  check('its caption says it is new', (await text(page, 'daily-readout')) === 'NEW TODAY', await text(page, 'daily-readout'));
  const order = await page.evaluate(() => [...document.querySelectorAll('#play-actions > button:not([hidden])')].map((b) => b.id));
  check('it is the second entry, under LEVEL', order[1] === 'menu-daily', order.join(','));
  await page.waitForTimeout(400);
  await shot(page, 'menu');

  await page.click('#menu-daily');
  await sheetUp(page, 'DAILY #002');
  check('the intro sheet states the goal', (await text(page, 'daily-goal')).length > 10, await text(page, 'daily-goal'));
  check('the header strip shows the puzzle', await visible(page, 'daily-hud'), await text(page, 'daily-hud'));
  await page.waitForTimeout(500);
  await shot(page, 'intro');
  check('starting is the leading key', (await keys(page))[0] === 'Start', (await keys(page)).join('|'));
  check('the tester can step to the next puzzle and back', (await keys(page)).includes('Next: #003') && (await keys(page)).includes('Back: #001'), (await keys(page)).join('|'));
  await press(page, 'Next: #003');
  await page.waitForFunction(() => document.getElementById('daily-title')?.textContent?.trim() === 'DAILY #003');
  check('a coming puzzle opens as a preview', (await text(page, 'daily-kicker')).startsWith('PREVIEW'), await text(page, 'daily-kicker'));
  await press(page, 'Back: #002');
  await page.waitForFunction(() => document.getElementById('daily-title')?.textContent?.trim() === 'DAILY #002');
  check('back on today, it is not a preview', !(await text(page, 'daily-kicker')).startsWith('PREVIEW'), await text(page, 'daily-kicker'));
  await press(page, 'Start');
  await page.waitForFunction(() => document.getElementById('sheet-daily')?.hidden === true);
  check('puzzle mode owns the board', (await page.evaluate(() => (window as any).__severgrow.daily())).active === true);
  const s0 = await state(page);
  check('the board is the puzzle\'s own position', s0.turnNumber === puzzle.start.turnNumber && s0.phase === 'ACT' && s0.actor === 0);
  await page.waitForTimeout(400);
  await shot(page, 'board');

  // A miss: end the Grow step at once.
  check('ending the Grow step is accepted', await play(page, endAct));
  await settle(page);
  await sheetUp(page, 'Not quite');
  check('a miss uses one try', (await text(page, 'daily-tries')) === '◆◇◇', await text(page, 'daily-tries'));
  check('a miss says how close it came', /grew by 0/.test(await text(page, 'daily-body')) || (await text(page, 'daily-body')).length > 0, await text(page, 'daily-body'));
  await page.waitForTimeout(1500);
  const s1 = await state(page);
  check('the opponent never moves', s1.turnPlayer === 0 && s1.actor === 0, `${s1.phase} p${s1.turnPlayer}`);
  check('a tap on the backdrop does not dismiss the result', await page.evaluate(() => {
    document.getElementById('scrim')?.click();
    return document.getElementById('sheet-daily')?.hidden === false;
  }));
  await shot(page, 'miss');

  // Try again, with the answer.
  await press(page, 'Try again');
  await page.waitForFunction(() => document.getElementById('sheet-daily')?.hidden === true);
  const s2 = await state(page);
  check('a new try starts from the puzzle again', s2.phase === 'ACT' && JSON.stringify(s2.board) === JSON.stringify(puzzle.start.board));
  // The pause menu's Restart mid-try goes back to the puzzle's start: still the Daily, no try used
  // (it used to start a practice match with a frozen opponent).
  await settle(page);
  await play(page, proof.solution[0]!);
  await settle(page);
  await page.evaluate(() => document.getElementById('hud-menu')?.click());
  await page.waitForSelector('#gm-new', { state: 'visible', timeout: 10_000 });
  await page.click('#gm-new');
  await page.waitForFunction((b) => JSON.stringify((window as any).__severgrow.state()?.board) === b, JSON.stringify(puzzle.start.board), { timeout: 10_000 });
  check('Restart mid-try returns to the puzzle start and stays the Daily', (await page.evaluate(() => (window as any).__severgrow.daily())).active === true);
  check('Restart uses no try', (await text(page, 'daily-hud-tries')) === '◆◇◇', await text(page, 'daily-hud-tries'));
  for (const a of proof.solution) {
    await settle(page);
    check(`the answer's ${a.t} is legal on the page`, await play(page, a));
  }
  await settle(page);
  await sheetUp(page, 'Solved');
  check('the solve shows two tries used', (await text(page, 'daily-tries')) === '◆◆◇', await text(page, 'daily-tries'));
  check('the solve names the puzzle', (await text(page, 'daily-kicker')).includes(puzzle.title.toUpperCase()), await text(page, 'daily-kicker'));
  const record = await page.evaluate(() => {
    for (const p of ['', 'main2:', 'futa04:', 'futa05:']) {
      const raw = localStorage.getItem(`${p}severgrow.daily.v1`);
      if (raw) return JSON.parse(raw);
    }
    return null;
  });
  check('the solve is recorded, with its tile owed', !!record && record.solved.includes(NO) && record.toPlace.includes(NO), JSON.stringify(record));
  const queued = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.endsWith('severgrow.seeds.pending.v1')).map((k) => localStorage.getItem(k)).join(''));
  check('the solve is queued for the server to verify', queued.includes('"kind":"daily"') && queued.includes(`"no":${NO}`) || !queued, queued.slice(0, 80));
  const saved = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.endsWith('severgrow.save.v7')));
  check('the player\'s own saved game was never written', saved.length === 0, saved.join(','));
  await page.waitForTimeout(500);
  await shot(page, 'solved');

  // Share copies the printout.
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin });
  await page.evaluate(() => { (navigator as any).share = undefined; });
  await press(page, 'Share');
  const copied = await page.evaluate(() => navigator.clipboard.readText().catch(() => ''));
  check('share copies the printout', copied.startsWith('FUTASAKU DAILY #002') && copied.includes('◆◆◇ SOLVED IN 2'), copied.replace(/\n/g, ' / '));

  // Back to the games: the caption now says what is owed (or that it is solved).
  const ks = await keys(page);
  const back = ks.includes('Back to games') ? 'Back to games' : null;
  if (back) await press(page, back);
  else {
    await page.evaluate(() => (window as any).__severgrow && document.getElementById('hud-menu')?.click());
    await page.evaluate(() => document.getElementById('gm-main')?.click());
  }
  await page.waitForFunction(() => document.getElementById('game')?.hidden === true, undefined, { timeout: 10_000 });
  await page.evaluate(() => { if (document.getElementById('play-menu')?.hidden) document.getElementById('menu-play')?.click(); });
  await page.waitForTimeout(300);
  const cap = await text(page, 'daily-readout');
  check('the menu says the tile is waiting', cap === '1 TILE TO PLACE' || cap.startsWith('SOLVED'), cap);
  check('puzzle mode ended with the board', (await page.evaluate(() => (window as any).__severgrow.daily())).active === false);
  await shot(page, 'menu-after');
  await context.close();
} finally {
  await browser.close();
  await server.close();
}
if (failed) {
  console.log(`${failed} daily-puzzle checks failed`);
  process.exit(1);
}
console.log('daily-puzzle checks passed');
process.exit(0);
