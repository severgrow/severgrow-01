// Test copy, lite: the thumb layout on phones. Loads the test build at 390x844 and 360x640 (touch,
// portrait) with 5, 8 and 10 cards in hand and checks: every card's visible slice hits that card,
// no card leaves the screen, the fan never covers the piles, Undo or Sort, no console errors.
// Saves screenshots in docs/screens/thumb2/ (thumb layout v2: map first, gentle fan, smart overlap).  Run: CHANNEL=test npm run web:build && npx tsx web/e2e/thumb-check.ts
import { chromium } from 'playwright-core';
import type { Page } from 'playwright-core';
import { preview } from 'vite';
import { CLASSIC, PRESETS, encodeSetup } from '../src/lab-mode/setup.js';
import type { LabSetup } from '../src/lab-mode/setup.js';
import { viewFor } from '../../src/engine/index.js';
import type { Action, State } from '../../src/engine/index.js';
import { chooseLevelAction } from '../../src/bots/levels.js';

const server = await preview({ configFile: 'web/vite.config.ts', preview: { port: 4185, strictPort: true }, logLevel: 'silent' });
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
let failed = 0;
const check = (name: string, ok: boolean, note = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? `  (${note})` : ''}`);
};

const open = async (w: number, h: number, handSize: number, side: 'right' | 'left' = 'right', map: LabSetup = CLASSIC) => {
  const page = await browser.newPage({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  const active = handSize === CLASSIC.handSize && map === CLASSIC ? null : encodeSetup({ ...map, name: `${map.name}, hand ${handSize}`, handSize });
  await page.addInitScript(
    ([a, s]) => {
      (window as unknown as { __name: unknown }).__name = (f: unknown) => f;
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      localStorage.clear();
      localStorage.setItem('test:severgrow.settings.v1', JSON.stringify({ sound: false, coach: false }));
      localStorage.setItem('test:severgrow-thumb', JSON.stringify({ thumb: true, side: s, idleTip: true }));
      if (a) localStorage.setItem('test:severgrow-lab-active', a);
    },
    [active, side] as const,
  );
  await page.goto('http://localhost:4185/');
  await page.waitForTimeout(500);
  await page.click('#menu-new');
  await page.click('#level-grid [data-level="7"]');
  await page.waitForTimeout(1500);
  // draw a card: the full hand
  await page.click('#deck');
  await page.waitForTimeout(1500);
  return { page, errors };
};

/** Every card: the middle of its visible slice (between its start edge and the next card's) hits it. */
const sliceReport = (page: Page) =>
  page.evaluate(() => {
    const dock = document.getElementById('dock')!.getBoundingClientRect();
    const cards = [...document.querySelectorAll<HTMLElement>('#hand [data-card]')];
    const cw = cards[0]!.offsetWidth;
    const out: { id: string; ok: boolean; x: number; y: number; onScreen: boolean }[] = [];
    cards.forEach((c, i) => {
      const fx = parseFloat(c.style.getPropertyValue('--fx'));
      const fy = parseFloat(c.style.getPropertyValue('--fy'));
      const rot = (parseFloat(c.style.getPropertyValue('--rot')) * Math.PI) / 180;
      // the card that covers this one: the next (right hand) or the previous (left hand)
      const nxt = document.documentElement.dataset.thumb === 'left' ? cards[i - 1] : cards[i + 1];
      const step = nxt ? Math.hypot(parseFloat(nxt.style.getPropertyValue('--fx')) - fx, parseFloat(nxt.style.getPropertyValue('--fy')) - fy) : cw;
      const along = -cw / 2 + Math.min(step, cw) / 2;
      const x = dock.left + fx + Math.cos(rot) * along;
      const y = dock.top + fy + Math.sin(rot) * along;
      const hit = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-card]');
      const r = c.getBoundingClientRect();
      const onScreen = r.left >= -0.5 && r.top >= -0.5 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5;
      out.push({ id: c.dataset.card!, ok: hit === c, x, y, onScreen });
    });
    // the piles, Undo and Sort: their centres are not under a card
    const free = ['deck', 'discard', 'tool-undo', 'hand-sort'].map((id) => {
      const e = document.getElementById(id)!;
      const r = e.getBoundingClientRect();
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return { id, ok: !top?.closest('[data-card]'), w: r.width };
    });
    // the move buttons: never over the piles, never under a card
    const pileRects = ['deck', 'discard'].map((id) => document.getElementById(id)!.getBoundingClientRect());
    const moveBtns = [...document.querySelectorAll<HTMLElement>('#moves > button, #moves > .btn')].filter((b) => b.offsetParent !== null);
    const movesOk = moveBtns.every((b) => {
      const r = b.getBoundingClientRect();
      const overPile = pileRects.some((p) => r.left < p.right && p.left < r.right && r.top < p.bottom && p.top < r.bottom);
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return !overPile && !top?.closest('[data-card]');
    });
    // nothing that matters is ever under a card: tiles, homes, gold hexes
    const hidden = [...document.querySelectorAll<SVGGElement>('#board g.tile, #board .landmark, #board g.hex-cell.rich')].filter((g) => {
      const r = g.getBoundingClientRect();
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return !!top?.closest('[data-card]');
    }).length;
    const tileW = (() => {
      const a = document.querySelector<SVGGElement>('#board g.hex-cell');
      return a ? a.getBoundingClientRect().width : 0;
    })();
    const minStep = cards.slice(1).reduce((m, c, i) => {
      const a = cards[i]!;
      const d = Math.hypot(parseFloat(c.style.getPropertyValue('--fx')) - parseFloat(a.style.getPropertyValue('--fx')), parseFloat(c.style.getPropertyValue('--fy')) - parseFloat(a.style.getPropertyValue('--fy')));
      return Math.min(m, d);
    }, Infinity);
    return { n: cards.length, cards: out, free, minStep, movesOk, moveCount: moveBtns.length, hidden, tileW, over: document.documentElement.dataset.fanOver === '1', thumb: document.documentElement.dataset.thumb ?? null };
  });

const MAPS = [CLASSIC, PRESETS.find((p) => p.name === 'Triangle')!, PRESETS.find((p) => p.name === 'Tall rectangle 6x10')!];
for (const map of MAPS)
for (const [w, h] of [[390, 844], [360, 640]] as const) {
  for (const hand of [4, 9]) {
    const { page, errors } = await open(w, h, hand, 'right', map);
    const r = await sliceReport(page);
    const label = `${map.name}, ${w}x${h}, ${r.n} cards`;
    check(`${label}: no tile, home or gold hex under a card`, r.hidden === 0, `tile ${r.tileW.toFixed(1)}px wide${r.over ? ', fan over the map' : ''}`);
    check(`${label}: thumb layout on`, r.thumb === 'right');
    check(`${label}: every card's slice selects that card`, r.cards.every((c) => c.ok), `slice ${r.minStep.toFixed(1)}pt; misses: ${r.cards.map((c, i) => (c.ok ? '' : `#${i + 1}`)).filter(Boolean).join(',') || 'none'}`);
    check(`${label}: no card off screen`, r.cards.every((c) => c.onScreen));
    check(`${label}: piles, Undo and Sort not under the fan`, r.free.every((f) => f.ok), r.free.map((f) => `${f.id} ${f.ok ? 'free' : 'COVERED'}`).join(', '));
    check(`${label}: move buttons clear of the piles and the cards`, r.movesOk, `${r.moveCount} buttons`);
    check(`${label}: piles at least 48pt wide`, r.free.filter((f) => f.id === "deck" || f.id === "discard").every((f) => f.w >= 48));
    // a real tap on the first, middle and last slices picks that card (my Grow step)
    const st = await page.evaluate(() => (window as unknown as { __severgrow: { state: () => { phase: string } } }).__severgrow.state()?.phase);
    if (st === 'ACT') {
      let taps = 0;
      let good = 0;
      for (const c of [r.cards[0]!, r.cards[Math.floor(r.cards.length / 2)]!, r.cards.at(-1)!]) {
        await page.touchscreen.tap(c.x, c.y);
        await page.waitForTimeout(250);
        const picked = await page.evaluate((id) => document.querySelector(`#hand [data-card="${id}"]`)?.getAttribute('aria-pressed') === 'true' || !!(window as unknown as { __severgrow: { pending: () => unknown } }).__severgrow.pending(), c.id);
        taps++;
        if (picked) good++;
        // put it back down (a second tap may place it: Escape cancels the pick instead)
        await page.keyboard.press('Escape');
        await page.waitForTimeout(150);
      }
      check(`${label}: tapping slices picks those cards`, good === taps, `${good}/${taps}`);
    }
    check(`${label}: no console errors`, errors.length === 0, errors.slice(0, 2).join(' | '));
    await page.screenshot({ path: `docs/screens/thumb2/${map.name.split(' ')[0]!.toLowerCase()}-${w}x${h}-${r.n}cards.png` });
    await page.close();
  }
}

// left-handed: the whole layout mirrored
{
  const { page, errors } = await open(390, 844, 7, 'left');
  const r = await sliceReport(page);
  check('390x844, left hand: mirrored, every slice selects its card', r.thumb === 'left' && r.cards.every((c) => c.ok) && r.free.every((f) => f.ok));
  check('390x844, left hand: no console errors', errors.length === 0, errors.slice(0, 2).join(' | '));
  await page.screenshot({ path: 'docs/screens/thumb2/classic-390x844-left.png' });
  await page.close();
}

// the idle tip: shows after about 4 s of no input on my turn, goes on a tap
{
  const { page, errors } = await open(390, 844, 7);
  const vis = () => page.evaluate(() => {
    const e = document.getElementById('idle-tip');
    return e ? Number(getComputedStyle(e).opacity) : -1;
  });
  await page.waitForTimeout(1500);
  const early = await vis();
  await page.waitForTimeout(3600);
  const later = await vis();
  const text = await page.evaluate(() => document.getElementById('idle-tip')?.textContent ?? '');
  await page.screenshot({ path: 'docs/screens/thumb2/classic-390x844-idle-tip.png' });
  await page.touchscreen.tap(195, 120);
  await page.waitForTimeout(200);
  const after = await vis();
  check('idle tip: hidden at first, shows after ~4 s, faint, goes on a tap', early === 0 && later > 0.3 && later <= 0.41 && after === 0, `opacity ${early} -> ${later} -> ${after}; "${text}"`);
  check('idle tip: no console errors', errors.length === 0, errors.slice(0, 2).join(' | '));
  await page.close();
}

// a whole game on the thumb layout (my moves chosen by a level-5 player, played as if tapped)
{
  const { page, errors } = await open(390, 844, 7);
  type Hook = { state: () => State | null; busy: () => boolean; playFor: (a: Action, w: number) => boolean };
  let moves = 0;
  const t0 = Date.now();
  let s: State | null = null;
  while (Date.now() - t0 < 240000) {
    await page.waitForFunction(() => {
      const h = (window as unknown as { __severgrow: Hook }).__severgrow;
      const st = h.state();
      return !h.busy() && (!st || st.actor === 0 || st.phase === 'GAME_OVER');
    }, undefined, { timeout: 60000 });
    s = await page.evaluate(() => (window as unknown as { __severgrow: Hook }).__severgrow.state());
    if (!s || s.phase === 'GAME_OVER') break;
    const a = chooseLevelAction(viewFor(s, 0), 5, moves);
    await page.evaluate((x) => (window as unknown as { __severgrow: Hook }).__severgrow.playFor(x, 0), a);
    moves++;
  }
  check('thumb layout: a whole game plays to the end', s?.phase === 'GAME_OVER', `${moves} of my moves, ${JSON.stringify(s?.result?.scores)}`);
  check('thumb layout game: no console errors', errors.length === 0, errors.slice(0, 2).join(' | '));
  await page.close();
}

// desktop and landscape: unchanged (no thumb layout)
for (const vp of [{ width: 1280, height: 800, touch: false }, { width: 844, height: 390, touch: true }]) {
  const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height }, hasTouch: vp.touch, isMobile: vp.touch });
  await page.goto('http://localhost:4185/');
  await page.waitForTimeout(400);
  await page.click('#menu-new');
  await page.click('#level-grid [data-level="7"]');
  await page.waitForTimeout(800);
  const t = await page.evaluate(() => document.documentElement.dataset.thumb ?? null);
  check(`${vp.width}x${vp.height}: normal layout (no thumb layout)`, t === null);
  await page.close();
}

await browser.close();
server.httpServer.close();
console.log(failed ? `${failed} FAILED` : 'ALL PASS');
process.exit(failed ? 1 : 0);
