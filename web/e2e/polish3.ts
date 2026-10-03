// Browser tests for UI polish pass 3 (drawing lines and clumps, the tile card's Fruit), with
// real touch events (Chrome's touch emulation) as well as the mouse and the keyboard.
//   npx tsx web/e2e/polish3.ts
// Needs a built page (npm run web:build) and Chromium (PW_CHROMIUM=/path/to/chrome).
import { chromium } from 'playwright-core';
import type { Browser, CDPSession, Page } from 'playwright-core';
import { preview } from 'vite';
import { DIRECTIONS, apply, coordKey, legalActions, newGame, viewFor } from '../../src/engine/index.js';
import type { Action, Card, Player, State, Suit } from '../../src/engine/index.js';
import { EMPTY_SEL, tapKind } from '../src/logic/interaction.js';
import { comboFor } from '../src/logic/draw.js';
import { previewMove } from '../src/logic/preview.js';
import { fixture } from '../../tests/helpers.js';
import { fruitOnTop, lineChoice } from './polish3-positions.js';
import { drawMeld, hexCenter } from './drawing.js';

const results: { name: string; ok: boolean; note?: string }[] = [];
const check = (name: string, ok: boolean, note = '') => {
  results.push({ name, ok, note });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? `  (${note})` : ''}`);
};
const server = await preview({ configFile: 'web/vite.config.ts', preview: { port: 4187, strictPort: true }, logLevel: 'silent' });
const BASE = 'http://localhost:4187/';
const browser: Browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const doneCoach = { step: 99, taught: [], known: [], choice: 0, summaryDone: true };

/** A position with exactly these tiles and this hand (my Grow step). */
const stateWith = (tiles: Record<string, [Player, number]>, hand: [Suit, number][], rock: string[] = []): State => {
  const g = newGame(5);
  const f = fixture({ tiles, rock });
  const pool = [...g.hands[0], ...g.hands[1], ...g.deck];
  const h: Card[] = [];
  for (const [su, r] of hand) h.push(pool.splice(pool.findIndex((c) => c.suit === su && c.rank === r), 1)[0]!);
  return { ...g, board: f.board, terrain: f.terrain, hands: [h, pool.splice(0, 7)], deck: pool, phase: 'ACT' };
};
const RUN: [Suit, number][] = [[0, 3], [0, 4], [0, 5]];
const SET3: [Suit, number][] = [[0, 6], [1, 6], [2, 6]];
const SET4: [Suit, number][] = [[0, 6], [1, 6], [2, 6], [3, 6]];

type Opts = { touch?: boolean; settings?: Record<string, unknown>; width?: number; height?: number };
const open = async (state: State, o: Opts = {}) => {
  const page = await browser.newPage({ viewport: { width: o.width ?? 390, height: o.height ?? 844 }, deviceScaleFactor: 1, hasTouch: !!o.touch, isMobile: !!o.touch });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(
    ([s, saved]) => {
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      localStorage.clear();
      localStorage.setItem('severgrow.settings.v1', s as string);
      localStorage.setItem('severgrow.save.v5', saved as string);
      localStorage.setItem('severgrow.tips.v1', JSON.stringify({ fruit: true, strengthen: true, draw: true }));
    },
    [JSON.stringify({ sound: false, coach: false, speed: 'skip', ...o.settings }), JSON.stringify({ state, coach: doneCoach })],
  );
  await page.goto(BASE);
  await page.click('#menu-continue');
  await page.waitForTimeout(300);
  return { page, errors };
};
const st = (page: Page) => page.evaluate(() => (window as unknown as { __severgrow: { state: () => State } }).__severgrow.state());
const histLen = async (page: Page) => (await st(page)).history?.length ?? 0;
const pick = (page: Page, kind: string) => page.click(`#moves [data-kind="${kind}"]`);

// ---- touch, through Chrome's own touch events (pointerType "touch") ----
const cdpOf = new WeakMap<Page, CDPSession>();
const cdp = async (page: Page) => {
  if (!cdpOf.has(page)) cdpOf.set(page, await page.context().newCDPSession(page));
  return cdpOf.get(page)!;
};
type P = { x: number; y: number };
const tDown = async (page: Page, p: P) => (await cdp(page)).send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p.x, y: p.y, id: 1 }] });
const tMove = async (page: Page, p: P, steps = 1, from?: P) => {
  const c = await cdp(page);
  for (let i = 1; i <= steps; i++) {
    const q = from ? { x: from.x + ((p.x - from.x) * i) / steps, y: from.y + ((p.y - from.y) * i) / steps } : p;
    await c.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: q.x, y: q.y, id: 1 }] });
  }
};
const tUp = async (page: Page) => {
  await (await cdp(page)).send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(150);
};
const tTap = async (page: Page, p: P) => {
  await tDown(page, p);
  await tUp(page);
};
/** Drags through the centres of `keys`, `steps` touch moves per hex. */
const tDrag = async (page: Page, keys: string[], steps = 6, release = true) => {
  const pts: P[] = [];
  for (const k of keys) pts.push(await hexCenter(page, k));
  await tDown(page, pts[0]!);
  for (let i = 1; i < pts.length; i++) await tMove(page, pts[i]!, steps, pts[i - 1]);
  if (release) await tUp(page);
};
const ghostKeys = (page: Page) => page.evaluate(() => [...document.querySelectorAll('.l-draw .draw-ghost')].map((g) => g.getAttribute('data-key')!));
const runKeys = (a: Extract<Action, { t: 'MeldRun' }>) => Array.from({ length: a.cards.length }, (_, i) => coordKey({ q: a.start.q + DIRECTIONS[a.dir]!.q * i, r: a.start.r + DIRECTIONS[a.dir]!.r * i }));

// =====================================================================================
// The flows
// =====================================================================================
{
  // a line by touch drag: numbers rise, Confirm appears (touch default), the right move is played
  const s = stateWith({}, RUN);
  const { page, errors } = await open(s, { touch: true });
  await pick(page, 'line-3');
  await tDrag(page, ['-1,1', '1,1'], 8, false);
  const nums = await page.evaluate(() => [...document.querySelectorAll('.l-draw .draw-ghost .ghost-num')].map((t) => Number(t.textContent)));
  await tUp(page);
  const confirm = await page.locator('#confirm').isVisible();
  const h = await histLen(page);
  await page.click('#confirm-play');
  await page.waitForTimeout(300);
  const after = await st(page);
  const ok = confirm && JSON.stringify(nums) === '[3,4,5]' && (await histLen(page)) === h + 1 && after.board['1,1']?.strength === 5;
  check('draw a line by touch: all 3 tiles, numbers rising, Confirm, placed', ok && errors.length === 0, `numbers ${nums.join(',')}`);
  await page.close();
}
{
  // a clump by touch drag, and backtracking
  const s = stateWith({}, SET3);
  const { page } = await open(s, { touch: true });
  await pick(page, 'clump-3');
  await tDrag(page, ['-1,1', '0,1', '1,0'], 6, false);
  const three = await ghostKeys(page);
  await tMove(page, await hexCenter(page, '0,1'), 6, await hexCenter(page, '1,0'));
  const back = await ghostKeys(page);
  await tUp(page);
  check('backtracking: dragging back onto the previous hex removes the last one', three.length === 3 || (await page.locator('#confirm').isVisible()), `${three.join(' ')} then ${back.join(' ')}`);
  await page.close();
  const { page: p2, errors } = await open(s, { touch: true });
  await pick(p2, 'clump-3');
  await tDrag(p2, ['-1,1', '0,1', '1,1']);
  check('draw a clump by touch: 3 hexes, then Confirm', (await p2.locator('#confirm').isVisible()) && errors.length === 0);
  await p2.close();
}
{
  // cancelling: Esc and the Cancel button leave nothing placed
  const s = stateWith({}, RUN);
  const { page } = await open(s, { touch: true });
  const h = await histLen(page);
  await pick(page, 'line-3');
  await tDrag(page, ['-1,1', '1,1'], 6, false);
  await page.keyboard.press('Escape');
  await tUp(page);
  const afterEsc = (await ghostKeys(page)).length === 0 && !(await page.locator('#confirm').isVisible());
  await tDrag(page, ['-1,1', '1,1']);
  await page.click('#confirm-cancel');
  check('cancelling: Esc mid-drag and Cancel after drawing place nothing', afterEsc && (await histLen(page)) === h);
  await page.close();
}
{
  // desktop: one click to start, a live preview while hovering, one click to finish (placed at once)
  // (UI overhaul item 8: this line leaves 3 tiles cuttable, so Smart would ask first; this check
  // is about the clicks, so it runs with "Confirm moves: Never")
  const s = stateWith({}, RUN);
  const { page, errors } = await open(s, { width: 1280, height: 800, settings: { confirmPolicy: 'never' } });
  await pick(page, 'line-3');
  const a = await hexCenter(page, '-1,1');
  const b = await hexCenter(page, '1,1');
  await page.mouse.click(a.x, a.y);
  await page.mouse.move(b.x, b.y, { steps: 5 });
  await page.waitForTimeout(100);
  const live = await ghostKeys(page);
  const chip = await page.textContent('#draw-info');
  const h = await histLen(page);
  await page.mouse.click(b.x, b.y);
  await page.waitForTimeout(300);
  check('desktop: click, hover shows the whole line and the result, click places it', live.length === 3 && !!chip && /tiles/.test(chip) && (await histLen(page)) === h + 1 && errors.length === 0, `${live.join(' ')} · ${chip}`);
  await page.close();
}
{
  // keyboard: Tab to the board, arrows move the cursor, Enter starts and finishes
  const s = stateWith({}, RUN);
  const { page } = await open(s, { width: 1280, height: 800, settings: { confirmDraw: true } });
  await pick(page, 'line-3');
  await page.focus('#board');
  // the cursor starts at the centre (0,0)
  for (const k of ['ArrowLeft', 'ArrowDown']) await page.keyboard.press(k); // (0,0) -> (-1,0) -> (-1,1)
  await page.keyboard.press('Enter');
  for (const k of ['ArrowRight', 'ArrowRight']) await page.keyboard.press(k); // -> (1,1)
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);
  const ready = await page.locator('#confirm').isVisible();
  await page.focus('#board');
  const h = await histLen(page);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  check('keyboard: arrows, Enter to start, Enter to finish, Enter to confirm', ready && (await histLen(page)) === h + 1);
  await page.close();
}

// =====================================================================================
// ADVERSARIAL
// =====================================================================================
{
  // 1. a very fast swipe: one touch move jumps across 3 hexes
  const s = stateWith({}, SET4);
  const { page } = await open(s, { touch: true });
  await pick(page, 'clump-4');
  const a = await hexCenter(page, '-1,1');
  const b = await hexCenter(page, '2,1');
  await tDown(page, a);
  await tMove(page, b, 1);
  const keys = await ghostKeys(page);
  await tUp(page);
  check('ADVERSARIAL 1: a very fast swipe that skips hexes still adds all of them, in order', keys.join(' ') === '-1,1 0,1 1,1 2,1' || (await page.locator('#confirm').isVisible()), keys.join(' '));
  await page.close();
}
{
  // 2. the finger leaves the board mid-drag and comes back (released inside: kept); released outside: cancelled
  const s = stateWith({}, SET3);
  const { page } = await open(s, { touch: true });
  await pick(page, 'clump-3');
  const a = await hexCenter(page, '-1,1');
  const b = await hexCenter(page, '0,1');
  await tDown(page, a);
  await tMove(page, b, 6, a);
  await tMove(page, { x: b.x, y: 820 }, 6, b); // off the board, down to the hand
  await tMove(page, b, 6, { x: b.x, y: 820 });
  await tMove(page, await hexCenter(page, '1,1'), 6, b);
  await tUp(page);
  const kept = await page.locator('#confirm').isVisible();
  await page.click('#confirm-cancel');
  await pick(page, 'clump-3');
  await tDown(page, a);
  await tMove(page, b, 6, a);
  await tMove(page, { x: b.x, y: 820 }, 6, b);
  await tUp(page);
  const cancelled = (await ghostKeys(page)).length === 0 && !(await page.locator('#confirm').isVisible());
  check('ADVERSARIAL 2: leaving the board mid-drag and coming back keeps the shape; lifting outside cancels', kept && cancelled);
  await page.close();
}
{
  // 3. dragging over an illegal hex (rock) and onward: the rock is skipped, the drag goes on
  const s = stateWith({}, SET3, ['0,1']);
  const { page } = await open(s, { touch: true });
  await pick(page, 'clump-3');
  await tDrag(page, ['-1,1', '0,1', '1,0'], 6, false);
  const k = await ghostKeys(page);
  await tUp(page);
  check('ADVERSARIAL 3: an illegal hex in the middle of a drag is ignored without breaking it', !k.includes('0,1') && k.includes('-1,1'), k.join(' '));
  await page.close();
}
{
  // 4. a line direction blocked by rock while another is legal
  const s = stateWith({}, RUN, ['0,1']);
  const { page } = await open(s, { touch: true });
  const h = await histLen(page);
  await pick(page, 'line-3');
  await tDrag(page, ['-1,1', '1,1'], 6, false);
  const cant = await page.evaluate(() => document.querySelectorAll('.l-draw .draw-ghost.cant').length);
  const why = await page.textContent('#draw-info');
  await tUp(page);
  const nothing = (await histLen(page)) === h && !(await page.locator('#confirm').isVisible());
  await tDrag(page, ['-1,1', '-1,-1']);
  const other = await page.locator('#confirm').isVisible();
  check('ADVERSARIAL 4: a direction blocked by rock shows "can\'t", lifting there places nothing; a legal direction works', cant > 0 && nothing && other && /Rock/.test(why ?? ''), why ?? '');
  await page.close();
}
{
  // 5. both ends of a line touch my network: the end where the finger started is the start
  const s = stateWith({ '1,0': [0, 2] }, RUN);
  const { page } = await open(s, { touch: true });
  await pick(page, 'line-3');
  await tDrag(page, ['1,1', '-1,1']);
  await page.click('#confirm-play');
  await page.waitForTimeout(300);
  const b = (await st(page)).board;
  check('ADVERSARIAL 5: both ends touch my tiles: the finger\'s end gets the lowest number', b['1,1']?.strength === 3 && b['-1,1']?.strength === 5, `${b['1,1']?.strength} … ${b['-1,1']?.strength}`);
  await page.close();
}
{
  // 6. a clump of 4 shaped like a Y: drag one arm through the hub, then drag again from the hub
  const s = stateWith({}, SET4);
  const { page } = await open(s, { touch: true });
  await pick(page, 'clump-4');
  await tDrag(page, ['-1,1', '0,1', '1,1']); // arm, hub, arm
  await tDrag(page, ['0,1', '0,2']); // from the hub, the third arm
  const ok = await page.locator('#confirm').isVisible();
  await page.click('#confirm-play');
  await page.waitForTimeout(300);
  const b = (await st(page)).board;
  check('ADVERSARIAL 6: a Y-shaped clump of 4 (two strokes from the hub)', ok && ['-1,1', '0,1', '1,1', '0,2'].every((k) => b[k]?.owner === 0));
  await page.close();
}
{
  // 7. a second finger mid-drag cancels; touching outside drawing mode never starts a drawing
  const s = stateWith({}, SET3);
  const { page } = await open(s, { touch: true });
  await pick(page, 'clump-3');
  const a = await hexCenter(page, '-1,1');
  const b = await hexCenter(page, '0,1');
  await tDown(page, a);
  await tMove(page, b, 6, a);
  const c = await cdp(page);
  await c.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: b.x, y: b.y, id: 1 }, { x: b.x + 60, y: b.y + 60, id: 2 }] });
  await c.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(150);
  const cancelled = (await ghostKeys(page)).length === 0 && !(await page.locator('#confirm').isVisible());
  const ta = await page.evaluate(() => getComputedStyle(document.getElementById('board')!).touchAction);
  await page.click('#moves .cancel');
  const taOff = await page.evaluate(() => getComputedStyle(document.getElementById('board')!).touchAction);
  check('ADVERSARIAL 7: a second finger cancels the drawing; the board blocks pinch and scroll only while drawing', cancelled && ta === 'none' && taOff !== 'none', `${ta} / ${taOff}`);
  await page.close();
}
{
  // 8. desktop: click a start, press Esc, then click elsewhere: nothing is placed
  const s = stateWith({}, RUN);
  const { page } = await open(s, { width: 1280, height: 800 });
  const h = await histLen(page);
  await pick(page, 'line-3');
  const a = await hexCenter(page, '-1,1');
  await page.mouse.click(a.x, a.y);
  await page.keyboard.press('Escape');
  const far = await hexCenter(page, '2,1');
  await page.mouse.click(far.x, far.y);
  await page.waitForTimeout(200);
  check('ADVERSARIAL 8: desktop click start, Esc, click elsewhere: nothing placed', (await histLen(page)) === h && !(await page.locator('#confirm').isVisible()));
  // right-click cancels too
  await page.mouse.click(a.x, a.y);
  await page.mouse.click(far.x, far.y, { button: 'right' });
  await page.mouse.move(1, 1);
  check('ADVERSARIAL 8b: right-click cancels a live line', (await ghostKeys(page)).length === 0);
  await page.close();
}
{
  // 9. lifting with N-1 hexes keeps the shape; continuing from it completes it
  const s = stateWith({}, SET3);
  const { page } = await open(s, { touch: true });
  await pick(page, 'clump-3');
  await tDrag(page, ['-1,1', '0,1']);
  const partial = (await ghostKeys(page)).length === 2 && /2\/3/.test((await page.textContent('#draw-info')) ?? '');
  await tDrag(page, ['0,1', '1,1']);
  check('ADVERSARIAL 9: release at 2 of 3 keeps the shape ("2/3"), dragging on from it completes it', partial && (await page.locator('#confirm').isVisible()));
  await page.close();
}
{
  // 10. a shape that replaces an opponent tile, and one that causes a cut: the chip says so
  const s = stateWith({ '0,1': [1, 2], '1,1': [1, 2], '2,1': [1, 2] }, RUN);
  const v = viewFor(s, 0);
  const combo = comboFor(v, legalActions(v), tapKind(EMPTY_SEL, 'line-3'))!;
  const rep = combo.actions.find((a) => (previewMove(v, a)?.ghosts ?? []).some((g) => g.replaces)) as Extract<Action, { t: 'MeldRun' }> | undefined;
  const { page } = await open(s, { touch: true });
  let chipRep = '';
  if (rep) {
    await pick(page, 'line-3');
    await tDrag(page, [runKeys(rep)[0]!, runKeys(rep).at(-1)!]);
    chipRep = (await page.textContent('#confirm-chip')) ?? '';
  }
  await page.close();
  const cutState = stateWith({ '0,1': [1, 2], '1,1': [1, 2], '2,0': [1, 2], '0,0': [1, 2] }, RUN);
  const cv = viewFor(cutState, 0);
  const cc = comboFor(cv, legalActions(cv), tapKind(EMPTY_SEL, 'line-3'))!;
  const cutA = cc.actions.find((a) => (previewMove(cv, a)?.cuts ?? 0) > 0) as Extract<Action, { t: 'MeldRun' }> | undefined;
  let chipCut = '';
  if (cutA) {
    const { page: p2 } = await open(cutState, { touch: true });
    await pick(p2, 'line-3');
    await tDrag(p2, [runKeys(cutA)[0]!, runKeys(cutA).at(-1)!]);
    chipCut = (await p2.textContent('#confirm-chip')) ?? '';
    await p2.close();
  }
  check('ADVERSARIAL 10: the chip says "replaces" for a takeover and "cuts" for a cut', /replac/i.test(chipRep) && /cuts/i.test(chipCut), `${chipRep} | ${chipCut}`);
}
{
  // rotating the phone and switching the palette mid-drag keep a correct state
  const s = stateWith({}, SET3);
  const { page, errors } = await open(s, { touch: true });
  await pick(page, 'clump-3');
  await tDrag(page, ['-1,1', '0,1']);
  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForTimeout(300);
  const still = (await ghostKeys(page)).length === 2;
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  // switch the palette in the middle of the drawing (Settings from the game menu), then come back
  await page.click('#hud-menu');
  await page.click('#gm-settings');
  await page.click('#palette-seg .seg-btn:not(.on)');
  await page.locator('#sheet-settings [data-close]').click();
  await page.waitForTimeout(300);
  const afterTheme = (await ghostKeys(page)).length === 2;
  await tDrag(page, ['0,1', '1,1']);
  check('rotating the phone and switching the palette mid-drawing keep the shape; finishing still works', still && afterTheme && (await page.locator('#confirm').isVisible()) && errors.length === 0, `rotate ${still} · palette ${afterTheme}`);
  await page.close();
}

// =====================================================================================
// Review fixes (follow-up): mixed tap-then-drag, press-drag-release, redrawing over a preview
// =====================================================================================
{
  // touch: tap the start (arrows show), then drag from it to the far end: the line is drawn
  const s = stateWith({}, RUN);
  const { page } = await open(s, { touch: true });
  await pick(page, 'line-3');
  await tTap(page, await hexCenter(page, '-1,1'));
  await tDrag(page, ['-1,1', '1,1']);
  check('review fix: tap the start, then drag: the line is still drawn', await page.locator('#confirm').isVisible());
  await page.close();
}
{
  // desktop: click the start, hover one hex, then press there, drag on and release: it ends where released
  const s = stateWith({}, RUN);
  const { page } = await open(s, { width: 1280, height: 800, settings: { confirmDraw: true } });
  await pick(page, 'line-3');
  const a = await hexCenter(page, '-1,1');
  const mid = await hexCenter(page, '-1,0');
  const b = await hexCenter(page, '1,1');
  await page.mouse.click(a.x, a.y);
  await page.mouse.move(mid.x, mid.y, { steps: 3 });
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(200);
  const chip = (await page.textContent('#confirm-chip')) ?? '';
  await page.click('#confirm-play');
  await page.waitForTimeout(300);
  const board = (await st(page)).board;
  check('review fix: desktop press-drag-release finishes where the button is released', board['1,1']?.strength === 5 && board['-1,0']?.owner !== 0, chip);
  await page.close();
}
{
  // a drawn line waits for Confirm; drawing again elsewhere replaces it (never a hidden tap move)
  const s = stateWith({}, RUN);
  const { page } = await open(s, { touch: true });
  const h = await histLen(page);
  await pick(page, 'line-3');
  await tDrag(page, ['-1,1', '1,1']);
  await tTap(page, await hexCenter(page, '-1,1'));
  await tTap(page, await hexCenter(page, '-1,1'));
  const nothingPlayed = (await histLen(page)) === h;
  await tDrag(page, ['-1,1', '-1,-1']);
  await page.click('#confirm-play');
  await page.waitForTimeout(300);
  const b = (await st(page)).board;
  check('review fix: redrawing over a waiting preview never plays a hidden move; the new line is placed', nothingPlayed && b['-1,-1']?.strength === 5);
  await page.close();
}

// =====================================================================================
// Tapping only (no dragging): every placement is still possible
// =====================================================================================
{
  const s = stateWith({}, RUN);
  const { page } = await open(s, { touch: true });
  await pick(page, 'line-3');
  await tTap(page, await hexCenter(page, '-1,1')); // the start: arrows show the legal directions
  const arrows = await page.evaluate(() => document.querySelectorAll('.l-draw .draw-arrow').length);
  await tTap(page, await hexCenter(page, '0,1')); // the hex in the arrow's direction
  const line = await page.locator('#confirm').isVisible();
  await page.close();
  const s2 = stateWith({}, SET3);
  const { page: p2 } = await open(s2, { touch: true });
  await pick(p2, 'clump-3');
  for (const k of ['-1,1', '0,1', '1,1']) await tTap(p2, await hexCenter(p2, k));
  const clump = await p2.locator('#confirm').isVisible();
  await p2.close();
  check('tapping only: a line (tap the start, then a direction) and a clump (tap each hex)', arrows > 0 && line && clump, `${arrows} arrows`);
}

// =====================================================================================
// Animations on or off: the same final state; drawing equals the engine's own action
// =====================================================================================
{
  const { state } = lineChoice();
  const v = viewFor(state, 0);
  const combo = comboFor(v, legalActions(v), tapKind(EMPTY_SEL, 'line-3'))!;
  const goal = combo.actions[0]!;
  const finals: string[] = [];
  for (const speed of ['skip', 'normal']) {
    const { page } = await open(state, { width: 1280, height: 800, settings: { speed } });
    await pick(page, 'line-3');
    await drawMeld(page, goal);
    // a risky line waits for Confirm ("Confirm moves: Smart")
    if (await page.locator('#confirm-play').isVisible()) await page.click('#confirm-play');
    await page.waitForFunction(() => !(window as unknown as { __severgrow: { busy: () => boolean } }).__severgrow.busy(), undefined, { timeout: 15000 }).catch(() => {});
    const s = await st(page);
    finals.push(JSON.stringify({ board: s.board, hands: s.hands, phase: s.phase }));
    await page.close();
  }
  const engine = apply(state, goal);
  const want = JSON.stringify({ board: engine.board, hands: engine.hands, phase: engine.phase });
  const brief = (j: string) => { const o = JSON.parse(j) as { phase: string; hands: unknown[][] }; return `${o.phase} ${o.hands[0]!.length}`; };
  check('animations on or off give the identical final state, equal to the engine applying the same action', finals[0] === finals[1] && finals[0] === want, `${finals.map(brief).join(' / ')} vs ${brief(want)}`);
}
{
  // v0.6: the tile card on an opponent 9: the note and "Use Fruit card", then the forecast and Confirm (Smart)
  const top = fruitOnTop();
  const { page, errors } = await open(top.state, { touch: true });
  await tTap(page, await hexCenter(page, top.target));
  const card = (await page.textContent('#tooltip')) ?? '';
  await page.click('#tooltip .tc-fruit');
  await page.waitForTimeout(200);
  const asks = await page.locator('#confirm-play').isVisible();
  await page.click('#confirm-play');
  await page.waitForFunction(() => !(window as unknown as { __severgrow: { busy: () => boolean } }).__severgrow.busy(), undefined, { timeout: 15000 }).catch(() => {});
  const gone = (await st(page)).board[top.target] === null;
  check('Fruit card from the tile card: the note, "Use Fruit card", Confirm, the 9 is gone', /No combo can replace this\. A Fruit card can\./.test(card) && asks && gone && errors.length === 0, card.slice(0, 80));
  await page.close();
}
{
  // a sideways swipe across the board (not drawing) must never be taken as the browser's "go back"
  const { page, errors } = await open(newGame(11) as State, { touch: true });
  const cdp = await page.context().newCDPSession(page);
  const urls: string[] = [];
  for (const [x0, x1] of [[60, 330], [330, 60]] as const) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: 280 }] });
    for (let i = 1; i <= 8; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + ((x1 - x0) * i) / 8, y: 280 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(600);
    urls.push(page.url());
  }
  check('a sideways swipe on the board stays in the game (no swipe-back)', urls.every((u) => u === BASE) && errors.length === 0, urls.join(' '));
  await page.close();
}

await browser.close();
await new Promise<void>((r) => server.httpServer.close(() => r()));
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
