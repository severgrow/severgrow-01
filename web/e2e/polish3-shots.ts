// "After" screenshots for UI polish pass 3 (phone 390x844 with touch, desktop 1280x800 with a mouse).
//   npx tsx web/e2e/polish3-shots.ts --dir=docs/screens/polish3
// Needs a built page (npm run web:build) and Chromium (PW_CHROMIUM=/path/to/chrome).
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
import type { CDPSession, Page } from 'playwright-core';
import { preview } from 'vite';
import { legalActions, newGame, viewFor } from '../../src/engine/index.js';
import type { Card, Player, State, Suit } from '../../src/engine/index.js';
import { EMPTY_SEL, tapKind } from '../src/logic/interaction.js';
import { comboFor } from '../src/logic/draw.js';
import { fixture } from '../../tests/helpers.js';
import { clumpChoice, fruitNotYet, fruitOnTop, lineChoice } from './polish3-positions.js';
import { hexCenter } from './drawing.js';

const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const dir = arg('dir') ?? 'docs/screens/polish3';
mkdirSync(dir, { recursive: true });
const server = await preview({ configFile: 'web/vite.config.ts', preview: { port: 4188, strictPort: true }, logLevel: 'silent' });
const BASE = 'http://localhost:4188/';
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const doneCoach = { step: 99, taught: [], known: [], choice: 0, summaryDone: true };
const errors: string[] = [];
const VPS = { phone: { width: 390, height: 844, touch: true }, desktop: { width: 1280, height: 800, touch: false } } as const;
type Vp = (typeof VPS)[keyof typeof VPS];

const stateWith = (tiles: Record<string, [Player, number]>, hand: [Suit, number][]): State => {
  const g = newGame(5);
  const f = fixture({ tiles });
  const pool = [...g.hands[0], ...g.hands[1], ...g.deck];
  const h: Card[] = [];
  for (const [su, r] of hand) h.push(pool.splice(pool.findIndex((c) => c.suit === su && c.rank === r), 1)[0]!);
  return { ...g, board: f.board, terrain: f.terrain, hands: [h, pool.splice(0, 7)], deck: pool, phase: 'ACT' };
};

const open = async (vp: Vp, state: State, settings: Record<string, unknown> = {}) => {
  const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 2, hasTouch: vp.touch, isMobile: vp.touch });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(
    ([s, saved]) => {
      localStorage.clear();
      localStorage.setItem('severgrow.settings.v1', s as string);
      localStorage.setItem('severgrow.save.v5', saved as string);
      localStorage.setItem('severgrow.tips.v1', JSON.stringify({ fruit: true, strengthen: true, draw: true }));
    },
    [JSON.stringify({ sound: false, coach: false, speed: 'skip', ...settings }), JSON.stringify({ state, coach: doneCoach })],
  );
  await page.goto(BASE);
  await page.click('#menu-continue');
  await page.mouse.move(1, 1);
  await page.waitForFunction(() => document.querySelectorAll('.world-fill').length > 0, undefined, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(400);
  return page;
};
const shot = (page: Page, name: string) => page.screenshot({ path: `${dir}/after-${name}.jpg`, quality: 80 });
const cdps = new WeakMap<Page, CDPSession>();
const touch = async (page: Page, type: 'touchStart' | 'touchMove' | 'touchEnd', p?: { x: number; y: number }) => {
  if (!cdps.has(page)) cdps.set(page, await page.context().newCDPSession(page));
  await cdps.get(page)!.send('Input.dispatchTouchEvent', { type, touchPoints: p ? [{ x: p.x, y: p.y }] : [] });
};
/** Press on the first hex and move through the others; touch on the phone, the mouse on the desktop. Leaves the finger down. */
const press = async (page: Page, vp: Vp, keys: string[]) => {
  const pts = [];
  for (const k of keys) pts.push(await hexCenter(page, k));
  if (vp.touch) await touch(page, 'touchStart', pts[0]);
  else {
    await page.mouse.move(pts[0]!.x, pts[0]!.y);
    await page.mouse.down();
  }
  for (let i = 1; i < pts.length; i++)
    for (let t = 1; t <= 6; t++) {
      const q = { x: pts[i - 1]!.x + ((pts[i]!.x - pts[i - 1]!.x) * t) / 6, y: pts[i - 1]!.y + ((pts[i]!.y - pts[i - 1]!.y) * t) / 6 };
      if (vp.touch) await touch(page, 'touchMove', q);
      else await page.mouse.move(q.x, q.y);
    }
  await page.waitForTimeout(150);
};
const release = async (page: Page, vp: Vp) => {
  if (vp.touch) await touch(page, 'touchEnd');
  else await page.mouse.up();
  await page.waitForTimeout(250);
};
const tap = async (page: Page, key: string) => {
  const c = await hexCenter(page, key);
  await page.mouse.click(c.x, c.y);
  await page.waitForTimeout(250);
};

for (const [name, vp] of Object.entries(VPS)) {
  // top-rank tiles (the slight glow), the action row with no Fruit button, "Opponent" in the score bar
  const top = fruitOnTop();
  let page = await open(vp, top.state);
  await shot(page, `${name}-top-rank-and-action-row`);
  await tap(page, top.target);
  await shot(page, `${name}-tile-card-fruit`);
  await page.click('#tooltip .tc-fruit');
  await page.waitForTimeout(250);
  await shot(page, `${name}-fruit-suggested`);
  await page.click('#moves .fruit-change');
  await page.waitForTimeout(250);
  await shot(page, `${name}-fruit-change`);
  await page.close();

  // the tile card when Fruit is not possible yet
  const ny = fruitNotYet();
  page = await open(vp, ny.state);
  await tap(page, ny.target);
  await shot(page, `${name}-tile-card-need-3`);
  await page.close();

  // a Fruit preview with a warning (the chosen set cuts off one of my own tiles)
  const warnState = stateWith({ '-1,1': [0, 2], '0,1': [0, 2], '0,0': [0, 2], '1,1': [0, 2], '1,-1': [1, 9], '1,0': [1, 9], '2,0': [1, 3], '3,-1': [1, 3] }, [[0, 1], [0, 5]]);
  page = await open(vp, warnState);
  await tap(page, '1,0');
  await page.click('#tooltip .tc-fruit');
  await page.click('#moves .fruit-change');
  for (const k of ['-1,1', '0,0', '0,1']) await tap(page, k);
  await page.click('#moves .fruit-next');
  await page.waitForTimeout(250);
  await shot(page, `${name}-fruit-preview-warning`);
  await page.close();

  // a line mid-drag: numbers rising; then a blocked direction
  const line = lineChoice();
  const lv = viewFor(line.state, 0);
  const lc = comboFor(lv, legalActions(lv), tapKind(EMPTY_SEL, 'line-3'))!;
  const la = lc.actions[0]! as Extract<(typeof lc.actions)[number], { t: 'MeldRun' }>;
  const end = (d: number) => `${la.start.q + [1, 1, 0, -1, -1, 0][d]! * 2},${la.start.r + [0, -1, -1, 0, 1, 1][d]! * 2}`;
  const start = `${la.start.q},${la.start.r}`;
  page = await open(vp, line.state);
  await page.click('#moves [data-kind="line-3"]');
  await page.waitForTimeout(200);
  await shot(page, `${name}-line-drawing-mode`);
  await press(page, vp, [start, end(la.dir)]);
  await shot(page, `${name}-line-mid-drag`);
  await release(page, vp);
  await shot(page, `${name}-line-done-chip`);
  await page.click('#confirm-cancel').catch(() => {});
  await page.click('#moves [data-kind="line-3"]').catch(() => {});
  const blocked = [0, 1, 2, 3, 4, 5].find((d) => !lc.actions.some((a) => a.t === 'MeldRun' && `${a.start.q},${a.start.r}` === start && a.dir === d) && end(d) in line.state.board);
  if (blocked !== undefined) {
    await press(page, vp, [start, end(blocked)]);
    await shot(page, `${name}-line-blocked`);
    await release(page, vp);
  }
  await page.close();

  // a clump mid-drag at 2/3
  const clump = clumpChoice();
  const cv = viewFor(clump.state, 0);
  const cc = comboFor(cv, legalActions(cv), tapKind(EMPTY_SEL, 'clump-3'))!;
  const hexes = (cc.actions[0] as Extract<(typeof cc.actions)[number], { t: 'MeldSet' }>).hexes.map((c) => `${c.q},${c.r}`);
  page = await open(vp, clump.state);
  await page.click('#moves [data-kind="clump-3"]');
  await press(page, vp, hexes.slice(0, 2));
  await shot(page, `${name}-clump-mid-drag-2of3`);
  await release(page, vp);
  await page.close();

  // the desktop live preview (mouse): click the start, hover the far end
  if (!vp.touch) {
    page = await open(vp, line.state);
    await page.click('#moves [data-kind="line-3"]');
    const a = await hexCenter(page, start);
    const b = await hexCenter(page, end(la.dir));
    await page.mouse.click(a.x, a.y);
    await page.mouse.move(b.x, b.y, { steps: 5 });
    await page.waitForTimeout(200);
    await shot(page, `${name}-live-preview`);
    await page.close();
  }

  // the opponent's turn: the pill and the score bar say "Opponent"
  page = await open(vp, newGame(4242) as State, { speed: 'normal' });
  await page.click('#deck');
  await page.waitForTimeout(500);
  await page.locator('#moves .end').click({ timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(400);
  await page.locator('#hand .card.playable').first().click().catch(() => {});
  await page.waitForFunction(() => document.querySelector('#turn-pill.bot:not([hidden])') !== null, undefined, { timeout: 8000 }).catch(() => errors.push('no opponent pill'));
  await page.waitForTimeout(330);
  await shot(page, `${name}-opponent-turn`);
  await page.close();
}

// the lab: old glow strength, the new one, none; and the mixed board
{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await page.goto(`${BASE}?lab=1`);
  await page.waitForFunction(() => document.querySelectorAll('.lab-glow-row .world-fill').length >= 30, undefined, { timeout: 60000 }).catch(() => errors.push('lab not ready'));
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${dir}/after-lab.jpg`, quality: 80, fullPage: true });
  await page.locator('.lab-glow-row').first().screenshot({ path: `${dir}/after-lab-glow-row.jpg`, quality: 85 });
  await page.close();
}
await browser.close();
await server.close();
console.log(errors.length ? `errors: ${errors.join(' | ')}` : `saved to ${dir}`);
