// Fruit cards in the browser (Steps 4 and 7 of the Fruit cards task): the card in the hand
// (at the right, glowing), the chip near the deck, picking it lights calm targets with the
// "any strength" note, a Fruit card on a 9 (forecast, Confirm, burst, cut), Undo, two Fruit
// cards in one turn, the tile card shortcut, and no sideways scroll at 360px with a full hand.
// Saves screenshots (390x844) to docs/screens/fruit-cards/ with --shots.
//   npx tsx web/e2e/fruitcards.ts [--shots]
import { chromium } from 'playwright-core';
import type { Page } from 'playwright-core';
import { preview } from 'vite';
import { isFruitCard } from '../../src/engine/index.js';
import type { State } from '../../src/engine/index.js';
import { NINE_CHAIN, NINE_PAIR, fruitPosition } from './fruitcards-pos.js';
import { hexCenter } from './drawing.js';

const SHOTS = process.argv.includes('--shots') ? 'docs/screens/fruit-cards' : null;
const results: { name: string; ok: boolean }[] = [];
const check = (name: string, ok: boolean, note = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? `  (${note})` : ''}`);
};
// DIST=/other/dir serves another build
const server = await preview({ configFile: 'web/vite.config.ts', ...(process.env.DIST ? { build: { outDir: process.env.DIST } } : {}), preview: { port: 4194, strictPort: true }, logLevel: 'silent' });
const BASE = 'http://localhost:4194/';
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const doneCoach = { step: 99, taught: [], known: [], choice: 0, summaryDone: true };

const idle = (page: Page) => page.waitForFunction(`!window.__severgrow.busy()`, undefined, { timeout: 15000 }).catch(() => {});
const open = async (state: State, o: { w?: number; settings?: Record<string, unknown>; tips?: Record<string, boolean> } = {}) => {
  const page = await browser.newPage({ viewport: { width: o.w ?? 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(
    ([s, saved, tips]) => {
      if (sessionStorage.getItem('ready')) return;
      sessionStorage.setItem('ready', '1');
      localStorage.clear();
      localStorage.setItem('severgrow.settings.v1', s as string);
      localStorage.setItem('severgrow.save.v5', saved as string);
      localStorage.setItem('severgrow.tips.v1', tips as string);
      localStorage.setItem('severgrow.seen', '1');
    },
    [
      JSON.stringify({ sound: false, coach: false, speed: 'fast', ...o.settings }),
      JSON.stringify({ state, coach: doneCoach, level: 7 }),
      JSON.stringify({ fruit: true, strengthen: true, draw: true, ...o.tips }),
    ] as const,
  );
  await page.goto(BASE);
  await page.click('#menu-continue');
  // let the board's deal-in finish (screenshots), then wait until nothing animates
  await page.waitForTimeout(SHOTS ? 1600 : 400);
  await idle(page);
  return { page, errors };
};
const st = (page: Page) => page.evaluate(`window.__severgrow.state()`) as Promise<State>;
const shot = async (page: Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` });
};
const tap = async (page: Page, key: string) => {
  const c = await hexCenter(page, key);
  await page.touchscreen.tap(c.x, c.y);
  await page.waitForTimeout(200);
};

// ---- 1. the card in the hand, the chip, picking it, a Fruit card on a 9, Undo ----
{
  const state = fruitPosition(NINE_CHAIN, [[0, 2], [1, 5], [2, 7]], 1);
  const { page, errors } = await open(state, { tips: { fruit: false } });
  await shot(page, '01-hand-and-tip');
  const tip = (await page.locator('#first-tip:visible').textContent().catch(() => '')) ?? '';
  check('the one-time tip: "Fruit cards: play one on an opponent tile that touches yours to remove it, even a 9."', tip.includes('play one on an opponent tile that touches yours to remove it, even a 9.'), tip.slice(0, 90));
  await page.click('#first-tip-ok').catch(() => {});
  const last = page.locator('#hand .card').last();
  check('Sort puts the Fruit card at the right, glowing (it has a target)', ((await last.getAttribute('class')) ?? '').includes('fruit') && ((await last.getAttribute('class')) ?? '').includes('fruit-ready'));
  const chip = (await page.textContent('#fruit-chip')) ?? '';
  check('the chip near the deck: "Fruit cards unseen: n"', /^Fruit cards unseen: \d$/.test(chip), chip);
  await last.click();
  await page.waitForTimeout(250);
  const targets = await page.locator('.l-over .target.kind-fruit').count();
  const hint = (await page.textContent('#hint').catch(() => '')) ?? '';
  check('picking it lights its targets only (calm rings), with the "any strength" note', targets === 2 && hint.includes('Any strength'), `${targets} targets · ${hint}`);
  await shot(page, '02-targets-any-strength');
  await tap(page, '1,0');
  const asks = await page.locator('#confirm-play').isVisible();
  await shot(page, '03-forecast-confirm');
  check('a target shows the forecast and waits for Confirm (Confirm moves: Smart)', asks);
  await page.click('#confirm-play');
  await page.waitForTimeout(500);
  await shot(page, '04-burst');
  await idle(page);
  const after = await st(page);
  check('the 9 is removed, and the tiles that hung on it are cut', after.board['1,0'] === null && after.board['2,0'] === null && after.board['3,-1'] === null && after.board['1,-1']?.strength === 9);
  check('the card left the game (not in the throw pile)', !after.discard.some(isFruitCard) && after.fruitPlayed === 1);
  await shot(page, '05-after-cut');
  await page.click('#tool-undo');
  await page.waitForTimeout(300);
  const undone = await st(page);
  check('Undo takes it back (until the throw)', undone.board['1,0']?.strength === 9 && undone.hands[0].some(isFruitCard));
  check('no page errors (1)', errors.length === 0, errors[0]);
  await page.close();
}

// ---- 2. two Fruit cards in one turn; the next one stays picked; the tile card shortcut ----
{
  const state = fruitPosition(NINE_PAIR, [[0, 2], [1, 5]], 2);
  const { page, errors } = await open(state, { settings: { confirmPolicy: 'never' } });
  await tap(page, '1,-1');
  const card = (await page.textContent('#tooltip')) ?? '';
  check('the tile card on a 9: "No combo can replace this. A Fruit card can." and "Use Fruit card"', card.includes('No combo can replace this. A Fruit card can.') && card.includes('Use Fruit card'));
  await shot(page, '06-tile-card-shortcut');
  await page.click('#tooltip .tc-fruit');
  await idle(page);
  const one = await st(page);
  check('Confirm moves "Never": the shortcut plays at once', one.board['1,-1'] === null && one.fruitPlayed === 1);
  const stillPicked = await page.locator('.l-over .target.kind-fruit').count();
  check('another Fruit card in hand: its targets stay lit', stillPicked >= 1, `${stillPicked}`);
  await shot(page, '07-second-fruit-ready');
  const next = (await st(page)).board['1,0'] ? '1,0' : null;
  if (next) await tap(page, next);
  await idle(page);
  const two = await st(page);
  check('two Fruit cards in one turn', two.fruitPlayed === 2 && two.board['1,0'] === null);
  check('no page errors (2)', errors.length === 0, errors[0]);
  await page.close();
}

// ---- 3. a full hand at 360px: everything visible, no sideways scroll ----
{
  const state = fruitPosition(NINE_CHAIN, [[0, 2], [0, 3], [1, 5], [2, 7], [3, 9], [1, 1]], 2);
  const { page, errors } = await open(state, { w: 360 });
  const fit = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('#hand .card')].map((c) => c.getBoundingClientRect());
    return { n: cards.length, inside: cards.every((r) => r.left >= 0 && r.right <= innerWidth + 0.5), scroll: document.documentElement.scrollWidth - innerWidth };
  });
  check('360px wide, 8 cards with 2 Fruit cards: all visible, no sideways scroll', fit.n === 8 && fit.inside && fit.scroll <= 0, JSON.stringify(fit));
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/08-360px-full-hand.png` });
  check('no page errors (3)', errors.length === 0, errors[0]);
  await page.close();
}

await browser.close();
server.httpServer.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
