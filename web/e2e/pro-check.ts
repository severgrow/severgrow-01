// Test copy, lite: the pro phone layout (slim header, dock v4). On a few phone sizes, at every
// one of my steps for about 6 turns: nothing overlaps (piles, Undo/Sort, move buttons, cards,
// map), the move buttons sit halfway between the map and the hand, the header shows only the
// menu button and the score bar, no console errors. Screenshots in docs/screens/pro/.
//   CHANNEL=test npm run web:build && npx tsx web/e2e/pro-check.ts
import { chromium } from 'playwright-core';
import type { Page } from 'playwright-core';
import { preview } from 'vite';
import { viewFor } from '../../src/engine/index.js';
import type { Action, State } from '../../src/engine/index.js';
import { chooseLevelAction } from '../../src/bots/levels.js';

const server = await preview({ configFile: 'web/vite.config.ts', preview: { port: 4189, strictPort: true }, logLevel: 'silent' });
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
let failed = 0;
const fails = new Map<string, number>();
const check = (name: string, ok: boolean, note = '') => {
  if (!ok) {
    failed++;
    const n = (fails.get(name) ?? 0) + 1;
    fails.set(name, n);
    if (n > 2) return;
  }
  if (!ok || process.env.VERBOSE) console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? `  (${note})` : ''}`);
};
type Hook = { state: () => State | null; busy: () => boolean; playFor: (a: Action, w: number) => boolean };

const measure = (page: Page) =>
  page.evaluate(() => {
    type R = { l: number; t: number; r: number; b: number; n: string };
    const box = (e: Element, n: string): R | null => {
      const b = e.getBoundingClientRect();
      if (b.width < 1 || b.height < 1 || getComputedStyle(e).visibility === 'hidden' || (e as HTMLElement).closest('[hidden]')) return null;
      return { l: b.left, t: b.top, r: b.right, b: b.bottom, n };
    };
    const all = (sel: string, n: string) => [...document.querySelectorAll(sel)].map((e, i) => box(e, `${n}${i}`)).filter((x): x is R => !!x);
    const hexes = all('#board g.hex-cell', 'hex').filter((h) => h.b > 0);
    const map = hexes.length ? { l: Math.min(...hexes.map((h) => h.l)), t: Math.min(...hexes.map((h) => h.t)), r: Math.max(...hexes.map((h) => h.r)), b: Math.max(...hexes.map((h) => h.b)), n: 'map' } : null;
    const piles = all('#deck .pile-card, #discard .pile-card, #deck .pile-meta, #discard .pile-meta', 'pile');
    const tools = all('.undo-slot, .hand-sort', 'tool');
    const moves = all('#moves > *', 'move');
    const cards = all('.hand .card:not(.lifted)', 'card');
    const svg = document.getElementById('board')!.getBoundingClientRect();
    const hud = [...document.querySelectorAll('.game > .hud > *')].filter((e) => getComputedStyle(e).display !== 'none').map((e) => e.id || e.className);
    return { map, piles, tools, moves, cards, hud, svgBottom: svg.bottom, vw: innerWidth, vh: innerHeight };
  });

const hit = (a: { l: number; t: number; r: number; b: number }, b: { l: number; t: number; r: number; b: number }) => a.l < b.r - 1 && b.l < a.r - 1 && a.t < b.b - 1 && b.t < a.b - 1;

for (const [w, h] of [[390, 844], [390, 664], [360, 640], [430, 932]] as const) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.addInitScript(() => {
    (window as unknown as { __name: unknown }).__name = (f: unknown) => f;
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.clear();
    localStorage.setItem('test:severgrow.settings.v1', JSON.stringify({ sound: false, coach: false, speed: 'fast' }));
  });
  await page.goto('http://localhost:4189/');
  await page.waitForTimeout(500);
  await page.click('#menu-new');
  await page.click('#level-grid [data-level="7"]');
  await page.waitForTimeout(1500);
  const tag = `${w}x${h}`;
  let step = 0;
  let shots = 0;
  const t0 = Date.now();
  while (Date.now() - t0 < 150000) {
    await page.waitForFunction(() => {
      const hk = (window as unknown as { __severgrow: Hook }).__severgrow;
      const st = hk.state();
      return !hk.busy() && (!st || st.actor === 0 || st.phase === 'GAME_OVER');
    }, undefined, { timeout: 60000 });
    await page.waitForTimeout(400);
    const s = await page.evaluate(() => (window as unknown as { __severgrow: Hook }).__severgrow.state());
    if (!s || s.phase === 'GAME_OVER' || s.turnNumber >= 13) break;
    const m = await measure(page);
    const at = `${tag} turn ${s.turnNumber} ${s.phase}`;
    check(`${tag}: header shows only the menu button`, m.hud.length === 1 && m.hud[0] === 'hud-menu', m.hud.join(','));
    if (m.map) {
      for (const x of [...m.piles, ...m.tools, ...m.moves, ...m.cards]) check(`${tag}: ${x.n.replace(/\d+$/, '')} never on the map`, x.t >= m.map!.b - 1, `${at}: top ${x.t.toFixed(0)} vs map ${m.map!.b.toFixed(0)}`);
    }
    for (const a of m.tools) for (const b of [...m.piles, ...m.moves, ...m.cards]) check(`${tag}: Undo/Sort never on ${b.n.replace(/\d+$/, '')}`, !hit(a, b), at);
    for (const a of m.moves) for (const b of [...m.piles, ...m.cards]) check(`${tag}: move buttons never on ${b.n.replace(/\d+$/, '')}`, !hit(a, b), at);
    for (const a of m.cards) for (const b of m.piles) check(`${tag}: cards never on the piles`, !hit(a, b), at);
    for (const x of [...m.piles, ...m.tools, ...m.moves, ...m.cards]) check(`${tag}: everything on screen`, x.l >= -1 && x.r <= m.vw + 1 && x.b <= m.vh + 1, `${at} ${x.n}`);
    if (m.moves.length && m.cards.length) {
      const top = Math.min(...m.moves.map((x) => x.t));
      const bot = Math.max(...m.moves.map((x) => x.b));
      const hand = Math.min(...m.cards.map((x) => x.t));
      const mid = (m.map ? m.map.b : m.svgBottom) + (hand - (m.map ? m.map.b : m.svgBottom)) / 2;
      check(`${tag}: move buttons halfway between the map and the hand`, Math.abs((top + bot) / 2 - mid) <= 8, `${at}: buttons centre ${((top + bot) / 2).toFixed(0)}, halfway ${mid.toFixed(0)}`);
    }
    if (shots < 3 && (s.phase === 'ACT' || (s.phase === 'DISCARD' && shots === 2))) {
      await page.screenshot({ path: `docs/screens/pro/${tag}-${++shots}-${s.phase.toLowerCase()}.png` });
    }
    await page.evaluate((x) => (window as unknown as { __severgrow: Hook }).__severgrow.playFor(x, 0), chooseLevelAction(viewFor(s, 0), 5, step++));
  }
  await page.evaluate(() => document.getElementById('hud-menu')!.click());
  await page.waitForTimeout(300);
  const menu = await page.evaluate(() => ({ you: document.getElementById('gm-score-you')?.textContent, bot: document.getElementById('gm-score-bot')?.textContent, turn: document.getElementById('gm-turn')?.textContent, marks: document.querySelectorAll('#sheet-menu .mark').length }));
  check(`${tag}: the menu shows the scores and the turn, no player marks`, !!menu.you && !!menu.bot && !!menu.turn && menu.marks === 0, JSON.stringify(menu));
  await page.screenshot({ path: `docs/screens/pro/${tag}-menu.png` });
  check(`${tag}: no console errors`, errors.length === 0, errors.slice(0, 2).join(' | '));
  await page.close();
}
await browser.close();
server.httpServer.close();
for (const [n, c] of fails) console.log(`  ${c}x ${n}`);
console.log(failed ? `${failed} FAILED` : 'ALL PASS');
process.exit(failed ? 1 : 0);
