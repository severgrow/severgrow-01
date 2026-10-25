// THE SIX-CARD BLOOM MUST NOT FREEZE THE PAGE (owner report, 2026-10-25: "the game completely
// crashes and freeze when u trying to place a bloom longer then 4 cards").
//
// The cause was in `drawNext`: the five/six-card branch had no "shape is full" stop, so once the
// last tile was painted the completion search continued past the Bloom's size (rankAt(index)
// undefined, every empty neighbour still "claimable") and walked the whole board. Three/four-card
// Blooms were unaffected because their (action-based) branch already returned at `m >= n`.
//
// This suite paints a real six-card run on a full-size board by dragging at both viewports, moves
// the finger from the last tile to a different legal end WHILE the drag is still down (the retarget
// owner request), releases, and proves:
//   1. the page keeps ticking (a requestAnimationFrame heartbeat never stalls), and
//   2. the move commits exactly the retargeted shape (one tile per card, numbers in paint order).
//
//   CHANNEL=futa04 npm run web:build
//   PW_CHROMIUM=/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
//     node --import tsx web/e2e/bloom-six-responsive.ts
//
// Screenshots: /tmp/bloom-six/
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
import type { CDPSession, Page } from 'playwright-core';
import { preview } from 'vite';
import { hexDistance, legalActions, newGame, parseKey, viewFor } from '../../src/engine/index.js';
import type { Action, Card, State } from '../../src/engine/index.js';
import { positionSave } from './position.js';
import { assertDistChannel } from './helpers/dist-channel.js';
import { resumeSavedGame } from './helpers/menu-nav.js';
import { hexCenter } from './drawing.js';
import { comboFor, drawNext, drawStarts, paintMatch, paintRetarget } from '../src/logic/draw.js';
import { EMPTY_SEL, kindOf } from '../src/logic/interaction.js';

const OUT = '/tmp/bloom-six';
mkdirSync(OUT, { recursive: true });
const port = Number(process.env.BLOOM_SIX_PORT ?? 4223);
const base = `http://localhost:${port}/`;
const server = await preview({ configFile: 'web/vite.config.ts', preview: { port, strictPort: true }, logLevel: 'silent' });
const browser = await chromium.launch({
  ...(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}),
  args: ['--no-sandbox'],
});

let checks = 0;
const check = (value: unknown, label: string) => { assert(value, label); checks++; };
const equal = (actual: unknown, expected: unknown, label: string) => { assert.deepEqual(actual, expected, label); checks++; };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
void sleep;

/** The authored position: a six-card run 1-6, ACT for the player, a real full-size board. */
const position = (): State => {
  const start = newGame(11);
  const hand: Card[] = [1, 2, 3, 4, 5, 6].map((rank, id) => ({ id: 900 + id, suit: 0 as const, rank }));
  return { ...start, phase: 'ACT', actor: 0, turnPlayer: 0, hands: [hand, start.hands[1]] };
};

/**
 * A drag chain for that position: every next hex is ONE EDGE from the previous, so a real drag
 * paints exactly these tiles. `alt` is a different legal last tile, also one edge from the painted
 * end, so the retarget is the owner's own gesture and crosses nothing else.
 */
function plan(state: State) {
  const v = viewFor(state, 0);
  const legal = legalActions(v);
  const six = legal.find((a) => a.t === 'Bloom' && a.cards.length === 6 && a.cards.every((id) => (state.hands[0] ?? []).some((c) => c.id === id))) as Extract<Action, { t: 'Bloom' }>;
  assert(six, 'the hand offers a six-card Bloom');
  const kind = kindOf(six)!;
  const combo = comboFor(v, legal, { ...EMPTY_SEL, kind })!;
  const adjacent = (a: string, b: string) => hexDistance(parseKey(a), parseKey(b)) === 1;
  let found: { chain: string[]; alt: string; moved: string[] } | null = null;
  const dfs = (chain: string[]): boolean => {
    if (chain.length === 6) {
      if (!paintMatch(combo, chain)) return false;
      for (const key of combo.hexes) {
        if (key === chain.at(-1) || !adjacent(key, chain.at(-1)!)) continue;
        const moved = paintRetarget(combo, chain, key);
        if (moved && paintMatch(combo, moved)) { found = { chain: [...chain], alt: key, moved }; return true; }
      }
      return false;
    }
    for (const key of drawNext(combo, chain)) if (adjacent(chain.at(-1)!, key)) if (dfs([...chain, key])) return true;
    return false;
  };
  for (const start of drawStarts(combo)) if (dfs([start])) break;
  assert(found, 'the position has a six-tile chain with a neighbouring alternative end');
  const best: { chain: string[]; alt: string; moved: string[] } = found!;
  return { kind, chain: best.chain, alt: best.alt, moved: best.moved };
}

const state = (page: Page) => page.evaluate(() => (window as unknown as { __severgrow: { state: () => State } }).__severgrow.state());
const shape = (page: Page) => page.evaluate(() => (window as unknown as { __severgrow: { drawShape: () => { shape: string[]; desk: string } } }).__severgrow.drawShape());
const ghost = (page: Page) => page.evaluate(() => [...document.querySelectorAll('#board .draw-ghost')].map((el) => el.getAttribute('data-key') ?? ''));

/** A requestAnimationFrame heartbeat: if the main thread stalls, frames stop and the max gap grows. */
const heartbeatOn = (page: Page) => page.evaluate(() => {
  const w = window as unknown as { __hb: { n: number; last: number; max: number } };
  w.__hb = { n: 0, last: performance.now(), max: 0 };
  const tick = () => {
    const now = performance.now();
    w.__hb.max = Math.max(w.__hb.max, now - w.__hb.last);
    w.__hb.last = now;
    w.__hb.n++;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});
const heartbeat = (page: Page) => page.evaluate(() => {
  const w = window as unknown as { __hb: { n: number; max: number } };
  return { frames: w.__hb.n, maxGap: Math.round(w.__hb.max) };
});

async function open(width: number, height: number, saveState: State) {
  const touch = width <= 600;
  const page = await browser.newPage({ viewport: { width, height }, hasTouch: touch, isMobile: touch });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.addInitScript((save) => {
    (window as any).__name = (f: unknown) => f;
    localStorage.setItem('main2:severgrow.save.v7', save);
    localStorage.setItem('main2:severgrow.settings.v1', JSON.stringify({
      level: 7, sound: false, music: false, vibration: false, coach: false,
      speed: 'skip', reduceMotion: true, autoSkip: false, confirmPolicy: 'always',
    }));
  }, positionSave({ state: saveState }));
  await page.goto(base);
  await assertDistChannel(page);
  await resumeSavedGame(page);
  await page.waitForFunction(() => document.querySelectorAll('#board .hex-cell').length > 0);
  await page.waitForSelector('#starter-lottery', { state: 'hidden', timeout: 20_000 });
  await page.waitForFunction(() => document.fonts.status === 'loaded');
  await page.waitForTimeout(250);
  return { page, touch, errors };
}

async function paintSix(width: number, height: number) {
  const label = `${width}x${height} six-card drag`;
  const state0 = position();
  const { kind, chain, alt, moved } = plan(state0);
  const { page, touch, errors } = await open(width, height, state0);
  const cdp: CDPSession | null = touch ? await page.context().newCDPSession(page) : null;
  try {
    const before = await state(page);
    equal(before, state0, `${label}: the authored six-card position is live`);

    // Select the six-card recipe through the same entry the recipe button uses. (The card-tap
    // route is covered by undo-bloom-polish; here the subject is painting six tiles.)
    await page.evaluate((k) => (window as unknown as { __severgrow: { pickKind: (kind: string) => void } }).__severgrow.pickKind(k), kind);
    const picked = await page.evaluate(() => (window as unknown as { __severgrow: { sel: () => { kind: string | null } } }).__severgrow.sel());
    equal(picked.kind, kind, `${label}: the six-card recipe is selected`);

    const pts: Record<string, { x: number; y: number }> = {};
    for (const key of [...chain, alt]) pts[key] = await hexCenter(page, key);

    await heartbeatOn(page);
    const t0 = Date.now();
    if (touch) {
      await cdp!.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...pts[chain[0]!]!, id: 1 }] });
      for (let n = 1; n < chain.length; n++) {
        const from = pts[chain[n - 1]!]!, to = pts[chain[n]!]!;
        for (let i = 1; i <= 3; i++) {
          const t = i / 3;
          await cdp!.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t, id: 1 }] });
        }
      }
      equal((await shape(page)).shape, chain, `${label}: every painted tile is on the six-tile shape`);
    } else {
      await page.mouse.move(pts[chain[0]!]!.x, pts[chain[0]!]!.y);
      await page.mouse.down();
      await page.mouse.up();
      for (const key of chain.slice(1)) await page.mouse.move(pts[key]!.x, pts[key]!.y, { steps: 3 });
      equal((await ghost(page)).sort(), [...chain].sort(), `${label}: the mouse preview draws the six tiles`);
    }

    // The owner's retarget: keep the drag down, move from the last tile to another legal end.
    if (touch) {
      const from = pts[chain.at(-1)!]!, to = pts[alt]!;
      for (let i = 1; i <= 3; i++) {
        const t = i / 3;
        await cdp!.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t, id: 1 }] });
      }
      equal((await shape(page)).shape, moved, `${label}: the tentative last tile followed the finger`);
    } else {
      await page.mouse.move(pts[alt]!.x, pts[alt]!.y, { steps: 3 });
    }
    equal((await ghost(page)).sort(), [...moved].sort(), `${label}: the ghost's last tile is the retargeted one`);
    await page.screenshot({ path: `${OUT}/${width}x${height}-retarget.png` });

    const paintMs = Date.now() - t0;
    const beat = await heartbeat(page);
    check(beat.frames >= 20, `${label}: the page kept ticking while painting (${beat.frames} frames)`);
    check(beat.maxGap < 500, `${label}: no frame gap over 500ms while painting (max ${beat.maxGap}ms)`);

    // Release / second click: the move commits exactly the retargeted shape.
    if (touch) await cdp!.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    else await page.mouse.click(pts[alt]!.x, pts[alt]!.y);
    await page.waitForFunction((key) => {
      const s = (window as unknown as { __severgrow: { state: () => State } }).__severgrow.state();
      return s.hands[0].length === 0 && s.board[key]?.owner === 0;
    }, moved[0]!, { timeout: 20_000 });
    const after = await state(page);
    equal(after.hands[0].length, 0, `${label}: the move spent all six cards`);
    moved.forEach((key, i) => {
      check(after.board[key]?.owner === 0, `${label}: painted tile ${key} is mine`);
      equal(after.board[key]?.strength, i + 1, `${label}: ${key} took the ${i + 1} in paint order`);
    });
    equal((await shape(page)).shape, [], `${label}: the paint cleared after the commit`);
    equal(await page.locator('#board .draw-ghost').count(), 0, `${label}: the ghost cleared too`);
    equal(errors, [], `${label}: no browser errors`);
    await page.screenshot({ path: `${OUT}/${width}x${height}-committed.png` });
    console.log(`${label}: paced ${paintMs}ms, heartbeat ${beat.frames} frames, max gap ${beat.maxGap}ms, ${checks} checks so far`);
  } finally {
    await page.close();
  }
}

try {
  await paintSix(390, 844);
  await paintSix(1280, 800);
  console.log(`bloom-six-responsive: ${checks} checks passed`);
} finally {
  await browser.close();
  await server.close();
}
