// Two interaction details the owner asked for on 2026-10-25, proved in a real browser with REAL
// pointer events (no synthetic action calls, no state hooks that play):
//
//  1. UNDO IS ONE PRESS. "undo shouldnt need 2 taps to confirm - undo button undoes the latest move
//     straight away". A Grow is played, then a Bloom paint is started (a pick, a painted first hex —
//     the state that used to swallow the first press). ONE press on #tool-undo must put the board
//     back where it was before the Grow, and clear the paint as part of it.
//
//  2. THE BLOOM'S LAST TILE FOLLOWS THE FINGER. "when you are at the last one and you move your
//     finger to different last tile of bloom - it follows. at the moment you have to 'drag back' to
//     the previous tile and then you can drag to another ending tile". A 3-tile run is painted by
//     dragging, then the finger moves from the third hex straight onto a different legal end: the
//     shape replaces it (no step back), the ghost's last tile changes, and the release commits
//     exactly what was painted.
//
//   CHANNEL=futa04 npm run web:build
//   PW_CHROMIUM=/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
//     node --import tsx web/e2e/undo-bloom-polish.ts
//
// Screenshots: /tmp/undo-bloom/
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
import type { CDPSession, Page } from 'playwright-core';
import { preview } from 'vite';
import { apply, newGame } from '../../src/engine/index.js';
import type { Action, Card, Player, RulesConfig, State, Suit } from '../../src/engine/index.js';
import { positionSave } from './position.js';
import { assertDistChannel } from './helpers/dist-channel.js';
import { resumeSavedGame } from './helpers/menu-nav.js';
import { hexCenter } from './drawing.js';
import { fixture } from '../../tests/helpers.js';

const OUT = '/tmp/undo-bloom';
mkdirSync(OUT, { recursive: true });
const port = Number(process.env.UNDO_BLOOM_PORT ?? 4199);
const base = `http://localhost:${port}/`;
const server = await preview({ configFile: 'web/vite.config.ts', preview: { port, strictPort: true }, logLevel: 'silent' });
const browser = await chromium.launch({
  ...(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}),
  args: ['--no-sandbox'],
});

let checks = 0;
const check = (value: unknown, label: string) => { assert(value, label); checks++; };
const equal = (actual: unknown, expected: unknown, label: string) => { assert.deepEqual(actual, expected, label); checks++; };

const state = (page: Page): Promise<State> => page.evaluate(() => (window as any).__severgrow.state());
const sel = (page: Page): Promise<{ card: number | null; hex: string | null; kind: string | null }> => page.evaluate(() => (window as any).__severgrow.sel());
const shape = (page: Page): Promise<string[]> => page.evaluate(() => (window as any).__severgrow.drawShape().shape as string[]);
const deskPhase = (page: Page): Promise<string> => page.evaluate(() => (window as any).__severgrow.drawShape().desk as string);
const undoDisabled = (page: Page): Promise<boolean> => page.evaluate(() => (document.getElementById('tool-undo') as HTMLButtonElement | null)?.disabled !== false);
const idle = (page: Page) => page.waitForFunction(() => {
  const h = (window as any).__severgrow;
  return h?.state() && !h.busy() && (h.state().actor === 0 || h.state().phase === 'GAME_OVER');
}, undefined, { timeout: 30_000 });
/** The ghost layer's hexes, in paint order, exactly as the board paints them. */
const ghostKeys = (page: Page): Promise<string[]> =>
  page.evaluate(() => [...document.querySelectorAll('#board .draw-ghost')].map((el) => el.getAttribute('data-key') ?? ''));

/** A real press on a control (touch where the viewport is a phone, a mouse click on a desktop). */
async function press(page: Page, selector: string, touch: boolean) {
  const box = await page.locator(selector).boundingBox();
  assert(box, `${selector} has a box`);
  const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  if (touch) await page.touchscreen.tap(point.x, point.y);
  else await page.mouse.click(point.x, point.y);
  await page.waitForTimeout(120);
}

/** A real tap on a card in the hand, at a point that is actually exposed (the fan overlaps). */
async function tapCard(page: Page, id: number, touch: boolean) {
  const card = page.locator(`#hand [data-card="${id}"]`);
  const point = await card.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const hits: { x: number; y: number }[] = [];
    for (let y = r.top + 1; y < r.bottom; y += 3) for (let x = r.left + 1; x < r.right; x += 3) {
      if (document.elementFromPoint(x, y)?.closest('[data-card]') === el) hits.push({ x, y });
    }
    if (!hits.length) return null;
    const cx = hits.reduce((sum, p) => sum + p.x, 0) / hits.length;
    const cy = hits.reduce((sum, p) => sum + p.y, 0) / hits.length;
    return hits.reduce((best, p) => (Math.hypot(p.x - cx, p.y - cy) < Math.hypot(best.x - cx, best.y - cy) ? p : best));
  });
  assert(point, `card ${id} keeps an exposed tap target`);
  if (touch) await page.touchscreen.tap(point.x, point.y);
  else await page.mouse.click(point.x, point.y);
  await page.waitForTimeout(160);
}

async function tapHex(page: Page, key: string, touch: boolean) {
  const p = await hexCenter(page, key);
  if (touch) await page.touchscreen.tap(p.x, p.y);
  else await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(200);
}

/** One CDP touch move — the same primitive a finger produces. */
const touchMove = async (cdp: CDPSession, from: { x: number; y: number }, to: { x: number; y: number }, steps = 8) => {
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t, id: 1 }],
    });
    await new Promise((r) => setTimeout(r, 16));
  }
  await new Promise((r) => setTimeout(r, 90)); // let the ghost's rAF paint land
};

async function open(width: number, height: number, saveState: State) {
  const touch = width <= 600;
  const page = await browser.newPage({ viewport: { width, height }, hasTouch: touch, isMobile: touch });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.addInitScript((save) => {
    // esbuild names every callback it lifts into page.evaluate; the page needs the helper.
    (window as any).__name = (f: unknown) => f;
    sessionStorage.setItem('undo-bloom-seeded', '1');
    localStorage.setItem('main2:severgrow.save.v7', save);
    localStorage.setItem('main2:severgrow.settings.v1', JSON.stringify({
      level: 7, sound: false, music: false, vibration: false, coach: false,
      speed: 'skip', reduceMotion: true, autoSkip: false, confirmPolicy: 'always',
    }));
    localStorage.setItem('main2:severgrow.tips.v1', JSON.stringify({ fruit: true, strengthen: true, draw: true }));
  }, positionSave({ state: saveState }));
  await page.goto(base);
  await assertDistChannel(page);
  await resumeSavedGame(page);
  await idle(page);
  await page.locator('#game').waitFor({ state: 'visible' });
  await page.waitForFunction(() => document.querySelectorAll('#board .hex-cell').length > 0);
  await page.waitForSelector('#starter-lottery', { state: 'hidden', timeout: 20_000 });
  await page.waitForFunction(() => document.fonts.status === 'loaded');
  await page.waitForTimeout(200);
  return { page, touch, errors };
}

/** The Bloom group the hand offers: its cards by ascending rank (so the paint is not reversed). */
const bloomPlan = (page: Page) => page.evaluate(() => {
  const g = (window as any).__severgrow;
  const st = g.state();
  const blooms = (g.legal() as Action[]).filter((a) => a.t === 'Bloom');
  if (!blooms.length) return null;
  const first = blooms[0] as Extract<Action, { t: 'Bloom' }>;
  const rank = (id: number) => st.hands[0].find((c: Card) => c.id === id)?.rank ?? 0;
  const cards = [...first.cards].sort((a, b) => rank(a) - rank(b));
  const placements = blooms.filter((a) => a.t === 'Bloom' && [...a.cards].sort().join(',') === [...cards].sort().join(','));
  const starts = (placements[0] as Extract<Action, { t: 'Bloom' }>).hexes.map((h) => `${h.q},${h.r}`);
  return { cards, starts, rank: cards.map(rank) };
});

// ---------- 1. Undo is one press ----------

async function undoOnce(width: number, height: number) {
  const label = `${width}x${height} undo`;
  const { page, touch, errors } = await open(width, height, newGame(3));
  try {
    // The turn opens with a Draw: take it the way a player does, so the Grow step is reachable.
    if ((await state(page)).phase === 'DRAW') {
      await press(page, '#deck', touch);
      await idle(page);
    }
    check((await state(page)).phase === 'ACT', `${label}: the opening Draw reached the Grow step`);
    // A real Grow: a card that can sprout on a spot that is empty, then that spot.
    const plan = await page.evaluate(() => {
      const g = (window as any).__severgrow;
      const st = g.state();
      type Loose = { t: string; card?: number; coord?: { q: number; r: number }; cards?: number[] };
      const legal = g.legal() as Loose[];
      const bloomCards = new Set<number>();
      for (const a of legal) if (a.t === 'Bloom' && a.cards) for (const c of a.cards) bloomCards.add(c);
      for (const a of legal) {
        if (a.t !== 'Sprout' || a.coord === undefined || a.card === undefined) continue;
        const key = `${a.coord.q},${a.coord.r}`;
        if (st.board[key] || bloomCards.has(a.card)) continue;
        return { card: a.card, key, action: a as unknown as Action };
      }
      return null;
    });
    assert(plan, 'the opening position offers a plain Grow');
    const before = await state(page);
    await tapCard(page, plan.card, touch);
    await tapHex(page, plan.key, touch);
    await idle(page);
    equal(await state(page), apply(before, plan.action), `${label}: the Grow was really played`);
    check(await page.evaluate(() => (window as any).__severgrow.canUndo()), `${label}: Undo is available after the Grow`);
    check(!(await undoDisabled(page)), `${label}: the Undo button is lit`);

    // Now the state that used to swallow the first press: a Bloom picked by hand and its first
    // hex painted, so the page holds a selection AND a shape.
    const bloom = await bloomPlan(page);
    assert(bloom, `${label}: the hand offers a Bloom`);
    for (const id of bloom.cards) await tapCard(page, id, touch);
    const picked = await sel(page);
    check(!!picked.kind?.startsWith('bloom-'), `${label}: the Bloom recipe is picked (${picked.kind})`);
    // The lowest card was tapped first, so the recipe is not Reversed and the paint starts at the
    // first hex of the engine's own order — a legal start by definition. A finger paints the hex
    // into the shape; a mouse opens the two-click machine, which paints it as a live shape.
    await tapHex(page, bloom.starts[0]!, touch);
    if (touch) equal(await shape(page), [bloom.starts[0]!], `${label}: the first Bloom tile is painted`);
    else equal(await deskPhase(page), 'live', `${label}: the mouse opened a live Bloom shape`);
    check((await shape(page)).length === 1 || (await deskPhase(page)) === 'live', `${label}: a paint is in progress`);
    check(await page.locator('#board .draw-ghost').count() > 0, `${label}: the paint is on screen`);
    check(await page.evaluate(() => document.getElementById('tool-undo')!.getAttribute('aria-label') === 'Undo: take back your last move'),
      `${label}: the slot is the Undo, not Replay`);
    await page.screenshot({ path: `${OUT}/${width}x${height}-undo-before.png` });

    // ONE press. No confirm, no second tap.
    await press(page, '#tool-undo', touch);
    await idle(page);
    const after = await state(page);
    equal(after, before, `${label}: ONE press put the board back where it was before the Grow`);
    const cleared = await sel(page);
    check(cleared.card === null && cleared.hex === null && cleared.kind === null, `${label}: the pick went with the move`);
    equal(await shape(page), [], `${label}: the half-painted Bloom went with it`);
    equal(await page.locator('#board .draw-ghost').count(), 0, `${label}: no ghost is left behind`);
    check(await undoDisabled(page), `${label}: Undo is dark again (nothing left to take back)`);
    await page.screenshot({ path: `${OUT}/${width}x${height}-undo-after.png` });
    equal(errors, [], `${label}: no browser errors`);
  } finally { await page.close(); }
}

// ---------- 2. The retarget (a 3-tile run with narrow legal ends) ----------

const RUN: [Suit, number][] = [[0, 3], [0, 4], [0, 5]];
/** The same position the unit test uses: the run's 4 and 2 sit where the shape would want to go. */
const stateWith = (tiles: Record<string, [Player, number]>, hand: [Suit, number][], config: Partial<RulesConfig> = {}): State => {
  const g = newGame(5, config);
  const f = fixture({ tiles, rock: [], config });
  const pool = [...g.hands[0], ...g.hands[1], ...g.deck].filter((c) => c.suit !== null);
  const cards: Card[] = [];
  for (const [suit, rank] of hand) cards.push(pool.splice(pool.findIndex((c) => c.suit === suit && c.rank === rank), 1)[0]!);
  return { ...g, board: f.board, terrain: f.terrain, hands: [cards, pool.splice(0, 7)], deck: pool, phase: 'ACT', turnPlayer: 0, actor: 0 };
};

async function retarget(width: number, height: number) {
  const label = `${width}x${height} retarget`;
  const position = stateWith({ '-1,1': [1, 4], '0,0': [1, 2] }, RUN);
  const { page, touch, errors } = await open(width, height, position);
  const cdp = await page.context().newCDPSession(page);
  try {
    equal(await state(page), position, `${label}: the position is the authored one`);
    // Pick the whole recipe by hand: three taps on the three cards.
    const bloom = await bloomPlan(page);
    assert(bloom, `${label}: the hand offers the run`);
    for (const id of bloom.cards) await tapCard(page, id, touch);
    check(!!(await sel(page)).kind?.startsWith('bloom-'), `${label}: the recipe is picked`);
    equal(bloom.rank, [3, 4, 5], `${label}: the three cards are the run 3-4-5`);

    // A: the first hex, then a second (the tentative last tile). Every step below is one hex to the
    // next, so the finger never crosses a painted hex — the retarget is what moves the end.
    const START = '0,2';
    const SECOND = '1,1';
    const LAST = '0,1';
    const FINAL = '-1,1';
    const a = await hexCenter(page, START);
    const b = await hexCenter(page, SECOND);
    const c = await hexCenter(page, LAST);
    const before = await state(page);
    if (touch) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...a, id: 1 }] });
      await touchMove(cdp, a, b);
    } else {
      await page.mouse.move(a.x, a.y);
      await page.mouse.down();
      for (let i = 1; i <= 8; i++) await page.mouse.move(a.x + (b.x - a.x) * i / 8, a.y + (b.y - a.y) * i / 8);
      await page.waitForTimeout(120);
    }
    equal(await shape(page), [START, SECOND], `${label}: the finger painted ${START} then ${SECOND}`);
    equal(await ghostKeys(page), [START, SECOND], `${label}: the ghost shows the same two hexes`);
    equal(await state(page), before, `${label}: nothing is spent while the finger is down`);
    await page.screenshot({ path: `${OUT}/${width}x${height}-retarget-before.png` });

    // B: straight from the second hex onto a DIFFERENT legal end. No drag back to the first.
    if (touch) await touchMove(cdp, b, c);
    else {
      for (let i = 1; i <= 8; i++) await page.mouse.move(b.x + (c.x - b.x) * i / 8, b.y + (c.y - b.y) * i / 8);
      await page.waitForTimeout(120);
    }
    equal(await shape(page), [START, LAST], `${label}: the last tile followed the finger (${SECOND} replaced by ${LAST})`);
    equal(await ghostKeys(page), [START, LAST], `${label}: the ghost agrees — the painted last hex is the new one`);
    equal(await state(page), before, `${label}: the retarget spends nothing`);
    await page.screenshot({ path: `${OUT}/${width}x${height}-retarget-after.png` });

    // C: finish it — the third hex, then release. What was painted is what gets played.
    const d = await hexCenter(page, FINAL);
    if (touch) await touchMove(cdp, c, d);
    else {
      for (let i = 1; i <= 8; i++) await page.mouse.move(c.x + (d.x - c.x) * i / 8, c.y + (d.y - c.y) * i / 8);
      await page.waitForTimeout(120);
    }
    equal(await shape(page), [START, LAST, FINAL], `${label}: the shape completes on the retargeted path`);
    await page.screenshot({ path: `${OUT}/${width}x${height}-retarget-full.png` });
    // The engine's own action for exactly this painted shape (read, never played by a hook).
    const expected = await page.evaluate((hexes: string[]) => (window as any).__severgrow.legal()
      .find((a: Action) => a.t === 'Bloom' && a.hexes.map((h) => `${h.q},${h.r}`).join('|') === hexes.join('|')) ?? null,
    [START, LAST, FINAL]);
    assert(expected, `${label}: the painted shape is a legal Bloom`);
    if (touch) await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    else await page.mouse.up();
    await idle(page);
    equal(await state(page), apply(before, expected), `${label}: the release played exactly the painted shape`);
    // The three tiles are on the board in paint order 3-4-5 — the numbers the ghost promised.
    const numbers = await page.evaluate((hexes: string[]) => hexes.map((key) =>
      document.querySelector(`#board .tile[data-key="${key}"] .tile-num`)?.textContent?.trim() ?? null),
    [START, LAST, FINAL]);
    equal(numbers, ['3', '4', '5'], `${label}: the played Bloom takes the numbers in paint order`);
    const taken = await page.evaluate((key: string) => (window as any).__severgrow.state().board[key]?.owner ?? null, FINAL);
    equal(taken, 0, `${label}: the retargeted end really took their tile`);
    await page.screenshot({ path: `${OUT}/${width}x${height}-retarget-played.png` });
    equal(errors, [], `${label}: no browser errors`);
  } finally { await page.close(); }
}

try {
  for (const [w, h] of [[390, 844], [1280, 800]] as const) await undoOnce(w, h);
  for (const [w, h] of [[390, 844], [1280, 800]] as const) await retarget(w, h);
} finally {
  await browser.close();
  await server.close();
}

console.log(`\n${checks} undo/Bloom checks passed. Screenshots in ${OUT}/`);
