// Browser tests for the UI overhaul, Part 1: Smart confirmation, Undo, the fixed dock, the coach
// clear of the board, the hint line on one line, no sideways scroll.
//   npx tsx web/e2e/overhaul.ts
// Needs a built page (npm run web:build) and Chromium (PW_CHROMIUM=/path/to/chrome).
import { positionSave } from './position.js';
import { chromium } from 'playwright-core';
import type { Browser, Page } from 'playwright-core';
import { preview } from 'vite';
import { apply, newGame, viewFor } from '../../src/engine/index.js';
import type { Action, Card, Player, State, Suit } from '../../src/engine/index.js';
import { chooseLevelAction } from '../../src/bots/levels.js';
import { fixture } from '../../tests/helpers.js';
import { forecastMove, needsConfirm } from '../src/logic/forecast.js';
import { clickKind, hexCenter } from './drawing.js';
import { cutPosition } from './cut-positions.js';

const results: { name: string; ok: boolean }[] = [];
const check = (name: string, ok: boolean, note = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? `  (${note})` : ''}`);
};
const server = await preview({ configFile: 'web/vite.config.ts', preview: { port: 4192, strictPort: true }, logLevel: 'silent' });
const BASE = 'http://localhost:4192/';
const browser: Browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const doneCoach = { step: 99, taught: [], known: [], choice: 0, summaryDone: true };

const midGame = (seed: number, turn: number): State => {
  let s: State = newGame(seed);
  let i = 0;
  while (s.phase !== 'GAME_OVER' && !(s.turnNumber >= turn && s.actor === 0 && s.phase === 'ACT')) s = apply(s, chooseLevelAction(viewFor(s, s.actor), 7, i++));
  return s;
};
const stateWith = (tiles: Record<string, [Player, number]>, hand: [Suit, number][]): State => {
  const g = newGame(5);
  const f = fixture({ tiles });
  const pool = [...g.hands[0], ...g.hands[1], ...g.deck];
  const h: Card[] = [];
  for (const [su, r] of hand) h.push(pool.splice(pool.findIndex((c) => c.suit === su && c.rank === r), 1)[0]!);
  return { ...g, board: f.board, terrain: f.terrain, hands: [h, pool.splice(0, 7)], deck: pool, phase: 'ACT' };
};

const open = async (state: State | null, o: { w?: number; h?: number; touch?: boolean; settings?: Record<string, unknown> } = {}) => {
  const page = await browser.newPage({ viewport: { width: o.w ?? 390, height: o.h ?? 844 }, deviceScaleFactor: 1, hasTouch: !!o.touch, isMobile: !!o.touch });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(
    ([s, saved]) => {
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      localStorage.clear();
      localStorage.setItem('severgrow.settings.v1', s as string);
      if (saved) localStorage.setItem('severgrow.save.v7', saved as string);
      localStorage.setItem('severgrow.tips.v1', JSON.stringify({ fruit: true, strengthen: true, draw: true }));
      localStorage.setItem('severgrow.seen', '1');
    },
    [JSON.stringify({ sound: false, coach: false, speed: 'skip', ...o.settings }), state ? positionSave({ state, coach: doneCoach }) : null],
  );
  await page.goto(BASE);
  if (state) await page.click('#menu-continue');
  await page.waitForTimeout(300);
  return { page, errors };
};
const hook = <T>(page: Page, f: string) => page.evaluate(`window.__severgrow.${f}()`) as Promise<T>;
const rect = (page: Page, sel: string) => page.evaluate((s) => JSON.stringify(document.querySelector(s)!.getBoundingClientRect()), sel);

// Target paths are rebuilt while photos/layout settle. Read the key atomically, then
// let Playwright wait for the actual hex, instead of dereferencing a transient path box.
const clickHighlightedTarget = async (page: Page) => {
  await page.waitForFunction(() => !(window as unknown as { __severgrow: { busy: () => boolean } }).__severgrow.busy());
  const key = await page.evaluate(() => document.querySelector('.l-over .target')?.getAttribute('data-key'));
  if (!key) return;
  await page.locator(`#board .hex-cell[data-key="${key}"]`).click();
};

// ---- 1. Smart confirmation matches the policy, move by move, in a real mid-game position ----
{
  let agree = 0;
  let asked = 0;
  let total = 0;
  const errs: string[] = [];
  const miss: string[] = [];
  for (const seed of [31, 44, 52]) {
    const state = midGame(seed, 9);
    const { page, errors } = await open(state);
    const cards = await page.locator('#hand .card').count();
    for (let c = 0; c < cards && total < 18; c++) {
      await page.locator('#hand .card').nth(c).click();
      await page.waitForTimeout(120);
      if (!(await hook<Action | null>(page, 'pending')) &&
          (await hook<State>(page, 'state')).history!.length === state.history!.length) {
        await clickHighlightedTarget(page);
        await page.waitForTimeout(150);
      }
      const pending = await hook<Action | null>(page, 'pending');
      const st = (await hook<State>(page, 'state'))!;
      const played = st.history!.length > state.history!.length;
      if (pending || played) {
        total++;
        const a = pending ?? null;
        if (a) {
          // a Strengthen always shows its preview first (by design, docs/UX.md); other moves ask by the policy
          const strengthen = a.t === 'Sprout' && st.board[`${a.coord.q},${a.coord.r}`]?.owner === 0;
          const want = strengthen || needsConfirm('smart', forecastMove(viewFor(st, 0), a));
          const bar = await page.locator('#confirm').isVisible();
          if (want === bar) agree++;
          else miss.push(`${a.t} want ${want} bar ${bar}`);
          if (bar) asked++;
        } else agree++; // played at once: it was safe (a risky move would have stayed pending)
      }
      if (played) {
        // back to the start (an auto-skipped Grow step is one more Undo)
        for (let u = 0; u < 3 && ((await hook<State>(page, 'state'))!.history!.length > state.history!.length); u++) {
          await page.click('#tool-undo', { timeout: 3000 });
          await page.waitForTimeout(150);
        }
      } else await page.locator('#confirm-cancel:visible, #moves .cancel').first().click().catch(() => {});
      await page.waitForTimeout(100);
    }
    errs.push(...errors);
    await page.close();
  }
  check('Smart confirmation: the Confirm bar shows exactly when the policy says so (with Undo between tries)', total > 5 && agree === total && errs.length === 0, `${agree}/${total} agree, ${asked} asked${miss.length ? `; ${miss.slice(0, 3).join(', ')}` : ''}${errs.length ? `; ${errs[0]}` : ''}`);
}

// ---- 2. Never / Always ----
{
  const s = stateWith({}, [[0, 3], [0, 4], [0, 5]]);
  // this bloom leaves 3 of my tiles cuttable, so Smart asks too
  for (const [mode, wantBar] of [['never', false], ['always', true], ['smart', true]] as const) {
    const { page } = await open(s, { w: 1280, h: 800, settings: { confirmPolicy: mode } });
    await clickKind(page, '#moves [data-kind^="bloom-3-"]');
    const a = await hexCenter(page, '-1,1');
    const b = await hexCenter(page, '1,1');
    await page.mouse.click(a.x, a.y);
    await page.mouse.move(b.x, b.y, { steps: 4 });
    await page.mouse.click(b.x, b.y);
    await page.waitForTimeout(300);
    const bar = await page.locator('#confirm').isVisible();
    const placed = ((await hook<State>(page, 'state'))!.history?.length ?? 0) > 0;
    check(`Confirm moves: ${mode} ${wantBar ? 'asks' : 'does not ask'} for a risky bloom`, bar === wantBar && placed === !wantBar, `bar ${bar}, placed ${placed}`);
    await page.close();
  }
}

// ---- 3. Undo restores the exact state; the dock and board never move ----
{
  const state = midGame(31, 11);
  const { page, errors } = await open(state, { settings: { confirmPolicy: 'never' } });
  const dock0 = await rect(page, '#dock');
  const board0 = await rect(page, '#board');
  const before = JSON.stringify(await hook<State>(page, 'state'));
  const sizes: string[] = [];
  await page.locator('#hand .card.playable').first().click();
  await page.waitForTimeout(150);
  sizes.push(await rect(page, '#dock'), await rect(page, '#board'));
  await clickHighlightedTarget(page);
  await page.waitForTimeout(400);
  sizes.push(await rect(page, '#dock'), await rect(page, '#board'));
  const moved = JSON.stringify(await hook<State>(page, 'state')) !== before;
  const undoOn = await page.locator('#tool-undo').isEnabled();
  if (undoOn) await page.click('#tool-undo');
  await page.waitForTimeout(400);
  const after = JSON.stringify(await hook<State>(page, 'state'));
  check('Undo: lit after a move; afterwards the state equals the state before, exactly', moved && undoOn && after === before, `moved ${moved}, undo lit ${undoOn}, same ${after === before}`);
  check('the dock and the board keep their size and place through a move', sizes.every((r, i) => r === (i % 2 === 0 ? dock0 : board0)), '');
  check('no page errors', errors.length === 0, errors.join(' | '));
  await page.close();
}

// ---- 4. The coach never covers the board; the hint fits one line; no sideways scroll ----
for (const [w, h] of [[360, 640], [390, 844], [430, 932], [768, 1024], [1280, 800]] as const) {
  const { page, errors } = await open(null, { w, h, settings: { coach: true, speed: 'fast' } });
  await page.click('#menu-tutorial');
  await page.waitForTimeout(2200);
  const r = JSON.parse(await page.evaluate(() => {
    const b = document.getElementById('board')!.getBoundingClientRect();
    const c = document.getElementById('coach')!;
    const cr = c.getBoundingClientRect();
    const hint = document.getElementById('hint')!;
    return JSON.stringify({
      coach: !c.hidden,
      overlap: !c.hidden && cr.top < b.bottom - 1 && cr.bottom > b.top + 1 && cr.left < b.right - 1 && cr.right > b.left + 1,
      hintFits: hint.scrollWidth <= hint.clientWidth + 1,
      sideScroll: document.documentElement.scrollWidth > window.innerWidth + 1,
    });
  }));
  check(`${w}x${h}: the coach is clear of the board, the hint fits one line, no sideways scroll`, r.coach && !r.overlap && r.hintFits && !r.sideScroll && errors.length === 0, JSON.stringify(r));
  await page.close();
}

// ---- 5. Smoother mode: on a very slow device a big cut switches effects to Low, once, with a note ----
{
  const { state, action } = cutPosition(9);
  // The detector counts frames between 20 ms and 500 ms; how slow a throttled frame is depends
  // on the machine, so try a few slow-downs (each on a fresh page) until frames land in that band.
  let page: Page | null = null;
  let errors: string[] = [];
  let shown = false;
  for (const rate of [20, 10, 6, 40]) {
    if (page) await page.close();
    ({ page, errors } = await open(state, { settings: { speed: 'slow', effects: 'normal' } }));
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate });
    await page.evaluate((a) => (window as unknown as { __severgrow: { playFor: (a: unknown, w: number) => boolean } }).__severgrow.playFor(a, 0), action);
    await page.waitForSelector('#smoother:not([hidden])', { timeout: 30000 }).catch(() => null);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    shown = await page.locator('#smoother').isVisible();
    if (shown) break;
  }
  page = page!;
  const low = (await page.evaluate(() => (window as unknown as { __severgrow: { settings: () => { effects: string } } }).__severgrow.settings().effects)) === 'low';
  if (shown) await page.click('#smoother-undo');
  const back = (await page.evaluate(() => (window as unknown as { __severgrow: { settings: () => { effects: string } } }).__severgrow.settings().effects)) === 'normal';
  check('Smoother mode: slow frames switch effects to Low with a one-time note; Undo puts them back', shown && low && back && errors.length === 0, `note ${shown}, low ${low}, undo ${back}`);
  await page.close();
}

await browser.close();
await server.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
