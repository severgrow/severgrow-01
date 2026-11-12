// "NO ROOM" FOR A BLOOM, in a real browser (tester report, 2026-10-27).
//
// A tester held three 2s — a valid set — but every hex they could reach was taken, so no Bloom was
// legal. Tapping the 2s did nothing visible and it read as a bug. Now the display says NO ROOM.
//
// The suite plants the position as a saved game (the save format accepts a full `base` state),
// resumes it, taps a 2 and reads the LED display. A second position with an open board proves the
// message is not shown when the Bloom IS possible. Neither tap may change the game.
//
//   CHANNEL=futa04 npm run web:build && npx tsx web/e2e/bloom-no-room.ts
import { chromium } from 'playwright-core';
import type { Page } from 'playwright-core';
import { allNeighbors, coordKey, homeCoord, legalActions, newGame, parseKey, viewFor } from '../../src/engine/index.js';
import type { Card, State } from '../../src/engine/index.js';
import { encodeSave } from '../src/logic/persist.js';
import { servePreview } from './helpers/preview-port.js';
import { seedSettings } from './helpers/settings-seed.js';

const CHROME = process.env.PW_CHROMIUM ?? undefined;
let failed = 0;
const check = (name: string, ok: boolean, note = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? `  (${note})` : ''}`);
};

/**
 * Player 0 to act (Grow step), holding three 2s and an 8; optionally with only two open hexes left
 * by my home and every other open hex already MINE at strength 9 — a 2 can still Grow, but there
 * is no room for a Bloom of three. (An enemy ring would raise HOME IN DANGER, and a full board
 * would leave only THROW!, both of which rightly outrank a hint on the display.)
 */
const position = (boxed: boolean): { state: State; twos: Card[] } => {
  const s = newGame(7);
  const cards = [...s.deck, ...s.hands[0], ...s.hands[1]];
  const twos = cards.filter((c) => c.suit !== null && c.rank === 2).slice(0, 3);
  const eight = cards.find((c) => c.suit !== null && c.rank === 8)!;
  const hand = [...twos, eight];
  const ids = new Set(hand.map((c) => c.id));
  const board = { ...s.board };
  if (boxed) {
    // Like the tester's board: exactly TWO open hexes next to home — room for a single Grow, never
    // for a Bloom of three — and every other open hex already mine at 9.
    const open = (k: string) => k in board && board[k] === null && s.terrain[k] !== 'rock';
    const home = homeCoord(0, s.config);
    const first = allNeighbors(home).map(coordKey).find(open)!;
    const second = allNeighbors(parseKey(first)).map(coordKey).find((k) => k !== first && open(k))!;
    for (const key of Object.keys(board)) if (open(key) && key !== first && key !== second) board[key] = { owner: 0, strength: 9 };
  }
  const state: State = {
    ...s,
    board,
    hands: [hand, s.hands[1].filter((c) => !ids.has(c.id))],
    deck: s.deck.filter((c) => !ids.has(c.id)),
    phase: 'ACT',
    turnPlayer: 0,
    actor: 0,
    sproutsThisTurn: 0,
  };
  return { state, twos };
};

const engineState = (p: Page) => p.evaluate(() => JSON.stringify((window as any).__severgrow.state()));
const led = (p: Page) => p.evaluate(() => document.getElementById('smart-led-text')?.textContent?.trim() ?? '');

const run = async (page: Page, origin: string, boxed: boolean) => {
  const { state, twos } = position(boxed);
  const view = viewFor(state, 0);
  const legal = legalActions(view);
  check(`${boxed ? 'boxed' : 'open'} board: the engine ${boxed ? 'offers no' : 'offers a'} Bloom`, legal.some((a) => a.t === 'Bloom') === !boxed);
  if (boxed) check('boxed board: a single 2 can still Grow (like the tester\'s board)', legal.some((a) => a.t === 'Sprout'));
  const save = encodeSave({ seed: state.seed, actions: [], coach: null, level: 7, base: state });
  await page.addInitScript((raw) => {
    for (const prefix of ['', 'main2:', 'futa04:', 'futa05:', 'futa-test:', 'test:']) localStorage.setItem(`${prefix}severgrow.save.v7`, raw);
  }, save);
  await page.goto(origin + '/');
  await page.waitForFunction(() => (window as any).__severgrow?.ready?.() === true, undefined, { timeout: 30_000 });
  // The product menu has no Continue (owner, 2026-10-19); the saved position is a fixture, so the
  // hidden legacy control is invoked directly, as futa04-critical does.
  await page.evaluate(() => (document.getElementById('menu-continue') as HTMLButtonElement | null)?.click());
  await page.waitForFunction(() => { const h = (window as any).__severgrow; return h && !h.busy() && h.state()?.phase === 'ACT'; }, undefined, { timeout: 30_000 });
  await page.waitForTimeout(1200);
  const before = await engineState(page);
  const card = page.locator(`#hand [data-card="${twos[0]!.id}"]`);
  await card.click({ force: true, position: { x: 14, y: 20 } });
  let seen = '';
  try {
    await page.waitForFunction(() => document.getElementById('smart-led-text')?.textContent?.trim() === 'NO ROOM', undefined, { timeout: 2500 });
    seen = 'NO ROOM';
  } catch {
    seen = await led(page);
  }
  if (boxed) check('boxed board: tapping a 2 says NO ROOM on the display', seen === 'NO ROOM', seen);
  else check('open board: tapping a 2 does not say NO ROOM', seen !== 'NO ROOM', seen);
  check(`${boxed ? 'boxed' : 'open'} board: the tap changed nothing in the game`, (await engineState(page)) === before);
  await page.screenshot({ path: `${process.env.SHOTS ?? '/tmp'}/bloom-no-room-${boxed ? 'boxed' : 'open'}-390x844.png` });
};

const { server, origin } = await servePreview(0, { logLevel: 'error' });
const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
try {
  for (const boxed of [true, false]) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    await seedSettings(page, { sound: false, music: false, coach: false, speed: 'skip', reduceMotion: false, eyeCandy: false });
    await run(page, origin, boxed);
    await context.close();
  }
} finally {
  await browser.close();
  await server.close();
}
if (failed) {
  console.log(`${failed} bloom-no-room checks failed`);
  process.exit(1);
}
console.log('bloom-no-room checks passed');
process.exit(0);
