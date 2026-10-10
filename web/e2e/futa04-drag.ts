// Browser check for the drag layer (an extra path on top of the taps). Real pointer gestures
// verify: a tiny move stays a tap, a drag from the deck draws, a drag onto a legal hex grows
// the exact tile a tap would, a release over nothing commits nothing, and a drag onto the
// throw pile offers the same discard. Runs against the built Futa04 page.
//
// Even seeds are used so the human starts at turn 1 (odd seeds make the opponent go first).
//
//   PW_CHROMIUM="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
//     node --import tsx web/e2e/futa04-drag.ts
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import type { Page } from 'playwright-core';
import { preview } from 'vite';
import { coordKey, legalActions, viewFor } from '../../src/engine/index.js';
import type { Action, State } from '../../src/engine/index.js';

const BASE = process.env.FUTA04_URL ?? 'http://localhost:4194/';
const server = process.env.FUTA04_URL
  ? null
  : await preview({ configFile: 'web/vite.config.ts', build: { outDir: process.env.FUTA04_DIST ?? 'dist' }, preview: { port: 4194, strictPort: true }, logLevel: 'silent' });
const browser = await chromium.launch({
  ...(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}),
  args: ['--no-sandbox'],
});

let checks = 0;
const check = (value: unknown, name: string) => {
  assert(value, name);
  checks++;
  console.log(`  ok ${name}`);
};
const state = (p: Page) => p.evaluate(() => (window as any).__severgrow.state() as State);
const pending = (p: Page) => p.evaluate(() => (window as any).__severgrow.pending() as Action | null);
const idle = (p: Page) =>
  p.waitForFunction(() => {
    const h = (window as any).__severgrow;
    return h && !h.busy() && h.state()?.actor === 0;
  }, undefined, { timeout: 30000 });

/** The Draw entrance slides the dock and the hand into place. Wait until the deck's box is both
 *  hit-testable at its centre and no longer moving: a point measured while the dock is still
 *  sliding can be stale by the time the gesture runs, so the tap lands on whatever moved over
 *  it (busy() is already false and the deck already reads `ready`, so neither is a safe gate). */
const settle = (p: Page) =>
  p.waitForFunction(() => {
    const deck = document.getElementById('deck');
    if (!deck) return false;
    const r = deck.getBoundingClientRect();
    const w = window as unknown as { __settleRect?: { x: number; y: number } };
    const prev = w.__settleRect;
    w.__settleRect = { x: r.x, y: r.y };
    const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    const reachable = !!hit && (hit === deck || deck.contains(hit));
    return reachable && !!prev && Math.abs(prev.x - r.x) < 0.5 && Math.abs(prev.y - r.y) < 0.5;
  }, undefined, { timeout: 30000 });

/** A point that is sure to be inside a fanned hand card (its centre may be under the next card). */
const visiblePoint = async (p: Page, id: number) => {
  const point = await p.locator(`#hand [data-card="${id}"]`).evaluate((el) => {
    const r = el.getBoundingClientRect();
    for (const xf of [0.08, 0.2, 0.35, 0.5, 0.7, 0.9])
      for (const yf of [0.2, 0.45, 0.7, 0.85]) {
        const x = r.left + r.width * xf;
        const y = r.top + r.height * yf;
        if (document.elementFromPoint(x, y)?.closest('#hand .card') === el) return { x, y };
      }
    return null;
  });
  assert(point, `card ${id} has an exposed surface`);
  return point as { x: number; y: number };
};
/** A point actually inside the element (its centre can sit under the hand fan on a phone). */
const exposedPoint = async (p: Page, selector: string) => {
  const point = await p.locator(selector).first().evaluate((node) => {
    const r = node.getBoundingClientRect();
    // Centre first: a point too near an edge can fall outside the target if the layout shifts
    // by a pixel between measuring it and starting the gesture.
    for (const yf of [0.5, 0.42, 0.58, 0.34, 0.66, 0.26, 0.74, 0.2, 0.8])
      for (const xf of [0.5, 0.42, 0.58, 0.36, 0.64, 0.3, 0.7, 0.24, 0.76]) {
        const x = r.left + r.width * xf;
        const y = r.top + r.height * yf;
        if (document.elementFromPoint(x, y)?.closest('#deck,#discard') === node) return { x, y };
      }
    return null;
  });
  assert(point, `${selector} has an exposed surface`);
  return point as { x: number; y: number };
};
const hexCenter = async (p: Page, key: string) => {
  const b = (await p.locator(`.hex-cell[data-key="${key}"] > .hex`).boundingBox())!;
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
};

/** A mouse pointer gesture: down, move in steps, up. Drives the same Pointer Events a finger would. */
const drag = async (p: Page, from: { x: number; y: number }, to: { x: number; y: number }, steps = 10) => {
  await p.mouse.move(from.x, from.y);
  await p.mouse.down();
  for (let i = 1; i <= steps; i++)
    await p.mouse.move(from.x + ((to.x - from.x) * i) / steps, from.y + ((to.y - from.y) * i) / steps);
  await p.mouse.up();
};

const start = async (p: Page, seed: number) => {
  await p.goto(`${BASE}?seed=${seed}`);
  await idle(p);
  await settle(p);
};
const playFor = (p: Page, a: Action) => p.evaluate((action) => (window as any).__severgrow.playFor(action, 0), a);
const find = (s: State, t: Action['t']): Action => {
  const a = legalActions(viewFor(s, 0)).find((x) => x.t === t);
  assert(a, `a legal ${t} exists`);
  return a!;
};

try {
for (const [w, h, touch] of [[390, 844, true], [1440, 900, false]] as const) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, hasTouch: touch, isMobile: touch });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => {
    // Each check starts from its own seed: drop any autosaved game so `?seed=` is taken.
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k && k.includes('save')) localStorage.removeItem(k);
      }
    } catch { /* storage blocked */ }
    const settings = JSON.stringify({ sound: false, music: false, coach: false, speed: 'fast', reduceMotion: true, autoSkip: false, confirmPolicy: 'never' });
    for (const k of ['severgrow.settings.v1', 'main2:severgrow.settings.v1', 'futa04:severgrow.settings.v1', 'test:severgrow.settings.v1'])
      localStorage.setItem(k, settings);
  });

  // 1. A move under 10px stays a tap: the deck is drawn exactly as a click would.
  await start(page, 710000);
  let before = await state(page);
  check(before.phase === 'DRAW', `${w}: opens on Draw`);
  const deck = await exposedPoint(page, '#deck');
  await drag(page, deck, { x: deck.x, y: deck.y + 8 }, 4);
  await idle(page);
  let after = await state(page);
  check(after.phase !== 'DRAW' && after.hands[0].length === before.hands[0].length + 1, `${w}: a 9px move is still a tap (drew)`);

  // 2. A drag past the threshold from the deck draws.
  await start(page, 710002);
  before = await state(page);
  const deck2 = await exposedPoint(page, '#deck');
  await drag(page, deck2, { x: deck2.x, y: deck2.y - 90 }, 8);
  await idle(page);
  after = await state(page);
  check(after.phase !== 'DRAW' && after.hands[0].length === before.hands[0].length + 1, `${w}: a drag from the deck draws`);

  // 3. A drag onto a legal hex grows exactly the tile a tap would.
  await start(page, 710004);
  await playFor(page, find(await state(page), 'Draw'));
  await idle(page);
  const act = await state(page);
  const sprout = find(act, 'Sprout');
  assert(sprout.t === 'Sprout', 'sprout shape');
  const key = coordKey(sprout.coord);
  const card = await visiblePoint(page, sprout.card);
  const hex = await hexCenter(page, key);
  await drag(page, card, hex, 12);
  await idle(page);
  const grown = await state(page);
  check(grown.board[key]?.owner === 0 && grown.board[key]?.strength === act.hands[0].find((c) => c.id === sprout.card)?.rank, `${w}: a drag onto a legal hex grows my tile`);

  // 4. Release over nothing commits nothing.
  const beforeCard = JSON.stringify((await state(page)).board);
  const idleCard = await visiblePoint(page, (await state(page)).hands[0][0]!.id);
  await drag(page, idleCard, { x: Math.round(w / 2), y: 8 }, 10);
  await idle(page);
  const still = await state(page);
  check(JSON.stringify(still.board) === beforeCard, `${w}: release over nothing commits nothing`);

  // 5. A drag onto the throw pile offers the discard, and Confirm commits it.
  await start(page, 710006);
  await playFor(page, find(await state(page), 'Draw'));
  await idle(page);
  await playFor(page, find(await state(page), 'EndAct'));
  await idle(page);
  const disc = await state(page);
  check(disc.phase === 'DISCARD', `${w}: reached the throw step`);
  const discardAction = find(disc, 'Discard');
  assert(discardAction.t === 'Discard', 'discard shape');
  const dcard = await visiblePoint(page, discardAction.card);
  const pile = await exposedPoint(page, '#discard');
  await drag(page, dcard, pile, 12);
  await idle(page);
  const offered = await pending(page);
  const threw = (await state(page)).discard.length > disc.discard.length;
  check(threw || (offered && offered.t === 'Discard'), `${w}: a drag onto the pile offers the discard`);
  if (!threw && offered) {
    await page.evaluate(() => (document.getElementById('confirm-play') as HTMLButtonElement | null)?.click());
    await idle(page);
    check((await state(page)).discard.length > disc.discard.length, `${w}: confirming the drag throws the card`);
  }

  check(errors.length === 0, `${w}: no page errors (${errors[0] ?? ''})`);
  await page.close();
}
console.log(`\nDRAG E2E: ${checks} checks passed`);
} finally {
  await browser.close();
  await server?.close();
}
