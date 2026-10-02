// Phone screenshots (390 px wide) of the v0.5 Fruit and Strengthen UI, from hand-built
// positions: the three Sprout kinds, the Strengthen preview, the Fruit button states, the
// pick-3 and pick-target steps, the preview with a warning, the first-time tip, and
// mid-animation frames. Also checks nothing overflows the 390 px width.
//   npm run web:build && npx tsx web/e2e/fruit-shots.ts --dir=docs/screens/fruit-strengthen
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
import type { Page } from 'playwright-core';
import { preview } from 'vite';
import { newGame } from '../../src/engine/index.js';
import type { Card, Player, State, Suit } from '../../src/engine/index.js';
import { fixture } from '../../tests/helpers.js';

const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const dir = arg('dir') ?? 'docs/screens/fruit-strengthen';
mkdirSync(dir, { recursive: true });

const stateWith = (tiles: Record<string, [Player, number]>, hand: [Suit, number][]): State => {
  const g = newGame(31);
  const f = fixture({ tiles });
  const pool = [...g.hands[0], ...g.hands[1], ...g.deck];
  const h: Card[] = [];
  for (const [su, r] of hand) h.push(pool.splice(pool.findIndex((c) => c.suit === su && c.rank === r), 1)[0]!);
  return { ...g, terrain: { ...g.terrain, ...Object.fromEntries(Object.keys(tiles).map((k) => [k, 'normal'])) }, board: f.board, hands: [h, pool.splice(0, 7)], deck: pool, phase: 'ACT', turnNumber: 9 };
};
// my chain from the root: (-1,1)=5 (0,1)=3 (0,0)=2 (1,1)=2; the bot's (1,-1)=9 (1,0)=9 (2,0)=4 (3,-1)=3
const TILES: Record<string, [Player, number]> = { '-1,1': [0, 5], '0,1': [0, 3], '0,0': [0, 2], '1,1': [0, 2], '1,-1': [1, 9], '1,0': [1, 9], '2,0': [1, 4], '3,-1': [1, 3] };
const HAND: [Suit, number][] = [[0, 9], [1, 6], [2, 4], [3, 2], [0, 1], [1, 3], [2, 7]];
const MAIN = stateWith(TILES, HAND);
const NINE = MAIN.hands[0].find((c) => c.rank === 9)!.id;

const server = await preview({ configFile: 'web/vite.config.ts', preview: { port: 4179, strictPort: true }, logLevel: 'silent' });
const BASE = 'http://localhost:4179/';
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const doneCoach = { step: 99, taught: [], known: [], choice: 0, summaryDone: true };
const errors: string[] = [];
const overflow: string[] = [];

const open = async (state: State, opts: { speed?: string; tips?: boolean } = {}) => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(
    ([s, saved, tips]) => {
      localStorage.clear();
      localStorage.setItem('severgrow.settings.v1', s as string);
      localStorage.setItem('severgrow.save.v5', saved as string);
      if (tips) localStorage.setItem('severgrow.tips.v1', tips as string);
    },
    [
      JSON.stringify({ sound: false, coach: false, speed: opts.speed ?? 'skip' }),
      JSON.stringify({ state, coach: doneCoach, level: 7 }),
      opts.tips === false ? '' : JSON.stringify({ fruit: true, strengthen: true }),
    ],
  );
  await page.goto(BASE);
  await page.click('#menu-continue');
  await page.mouse.move(1, 1);
  await page.waitForTimeout(500);
  return page;
};
const shot = async (page: Page, name: string) => {
  const w = await page.evaluate(() => document.documentElement.scrollWidth);
  if (w > 390) overflow.push(`${name}: page is ${w}px wide`);
  await page.screenshot({ path: `${dir}/${name}.jpg`, quality: 82 });
};
const tapHex = async (page: Page, key: string) => {
  const b = (await page.locator(`.hex-cell[data-key="${key}"]`).boundingBox())!;
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.move(1, 1);
  await page.waitForTimeout(250);
};

{
  // 1-2: the three kinds of Sprout target, then the Strengthen preview
  const page = await open(MAIN);
  await page.click(`#hand [data-card="${NINE}"]`);
  await page.waitForTimeout(350);
  const kinds = await page.$$eval('.target[data-kind]', (els) => [...new Set(els.map((e) => e.getAttribute('data-kind')))].sort());
  if (kinds.join(',') !== 'grow,replace,strengthen') errors.push(`expected three target kinds, got ${kinds}`);
  await shot(page, '1-sprout-kinds');
  await tapHex(page, '-1,1');
  const chip = await page.textContent('#confirm-chip');
  if (chip !== 'Strengthen 5 → 9') errors.push(`strengthen chip: ${chip}`);
  await shot(page, '2-strengthen-preview');
  await page.close();
}
{
  // 3: the Fruit button states (ready, not possible, used)
  const ready = await open(MAIN);
  await shot(ready, '3a-fruit-button-ready');
  await ready.close();
  const few = await open(stateWith({ '-1,1': [0, 3], '0,1': [0, 3], '1,-1': [1, 9] }, HAND));
  await shot(few, '3b-fruit-button-needs-3');
  await few.close();
  const used = await open({ ...MAIN, fruitUsed: [1, 0] });
  await shot(used, '3c-fruit-button-used');
  await used.close();
}
{
  // 4-6: the guided flow: pick 3, pick the target, preview with a warning
  const page = await open(MAIN);
  await page.click('#moves [data-kind="fruit"]');
  await page.waitForTimeout(250);
  await tapHex(page, '-2,2'); // the root: gently refused
  await tapHex(page, '-1,1');
  await shot(page, '4-fruit-pick-3');
  await tapHex(page, '0,1');
  await tapHex(page, '0,0');
  await shot(page, '5-fruit-pick-target');
  await tapHex(page, '1,0');
  const warn = await page.textContent('#confirm-warn');
  if (!/cuts off 1 of your tiles/.test(warn ?? '')) errors.push(`fruit warning: ${warn}`);
  await shot(page, '6-fruit-preview-warning');
  await page.close();
}
{
  // 7: the first-time tip
  const page = await open(MAIN, { tips: false });
  await shot(page, '7-first-time-tip');
  await page.close();
}
{
  // 8: mid-animation frames (slow speed)
  const page = await open(MAIN, { speed: 'slow' });
  await page.click(`#hand [data-card="${NINE}"]`);
  await page.waitForTimeout(250);
  await tapHex(page, '-1,1');
  await page.click('#confirm-play');
  await page.waitForTimeout(260);
  await shot(page, '8a-strengthen-animating');
  await page.close();
  const p2 = await open(MAIN, { speed: 'slow' });
  await p2.click('#moves [data-kind="fruit"]');
  for (const k of ['-1,1', '0,1', '0,0', '1,0']) await tapHex(p2, k);
  await p2.click('#confirm-play');
  await p2.waitForTimeout(700);
  await shot(p2, '8b-fruit-animating');
  await p2.waitForTimeout(1600);
  await shot(p2, '8c-fruit-after');
  await p2.close();
}
await browser.close();
await server.close();
console.log(errors.length || overflow.length ? `problems: ${[...errors, ...overflow].join(' | ')}` : `saved to ${dir}, no overflow at 390px`);
