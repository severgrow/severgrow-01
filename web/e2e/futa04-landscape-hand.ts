// A PHONE HELD SIDEWAYS WITH A FULL HAND: every card and every tile is a real 44pt target.
//
// Owner, 2026-11-20: on a short landscape screen (640x360) a single-row fan of eight cards can only
// show a ~33pt strip of each, so the hand wraps into two rows of four (logic/layout.ts `hand`).
// This suite proves it in the real page: at 640x360 and 844x390, with eight cards in hand, it
// measures the boxes, the strip each card exposes, whether each card owns its own centre, the
// tiles' size, and that nothing overlaps its neighbour, a tile, the header or the cockpit's keys.
//
// Run: CHANNEL=futa04 npm run web:build
//      PW_CHROMIUM="…/Google Chrome for Testing" npx tsx web/e2e/futa04-landscape-hand.ts
// Screenshots (unless SHOTS is set) go to /tmp/landscape-hand.
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
import type { Page } from 'playwright-core';
import { servePreview } from './helpers/preview-port.js';

const SHOTS = process.env.SHOTS ?? '/tmp/landscape-hand';
mkdirSync(SHOTS, { recursive: true });
const TARGET = 44; // the game's own promise: a card's box, the strip it exposes, and a tile
const served = await servePreview(4199, { build: { outDir: process.env.FUTA04_DIST ?? 'dist' }, logLevel: 'silent' });
const BASE = served.url;
const browser = await chromium.launch({ ...(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}), args: ['--no-sandbox'] });
let checks = 0;
const check = (value: unknown, name: string) => { assert(value, name); checks++; };
const n1 = (v: number) => Number(v.toFixed(1));

const idle = async (p: Page) => {
  await p.waitForFunction(() => { const h = (window as any).__severgrow; return h && !h.busy() && h.state()?.actor === 0; }, undefined, { timeout: 30000 });
};

type Box = { x: number; y: number; w: number; h: number };
type Measure = {
  cards: (Box & { id: string })[];
  strips: number[];
  centre: (string | null)[];
  rows: Box[];
  tiles: Box[];
  hexPx: number;
  handRows: string | null;
  dock: Box;
  play: Box;
  header: Box | null;
  keys: Box[];
  bodyScroll: number;
};

const measure = (p: Page) => p.evaluate(() => {
  const box = (el: Element): { x: number; y: number; w: number; h: number } => {
    const b = el.getBoundingClientRect();
    return { x: b.x, y: b.y, w: b.width, h: b.height };
  };
  const cards = [...document.querySelectorAll<HTMLElement>('#hand .card')].sort((a, b) => Number(a.dataset.card) - Number(b.dataset.card));
  const boxes = cards.map((c) => ({ id: c.dataset.card!, ...box(c) }));
  // the strip a card exposes: inside its own row, up to the next card's left edge (the last card in
  // a row is fully visible). A wrapped hand has no overlap at all, so this equals the card's width.
  const strips = boxes.map((c, i) => {
    const after = boxes.slice(i + 1).filter((o) => Math.abs(o.y - c.y) < 1);
    return after.length ? Math.min(...after.map((o) => o.x)) - c.x : c.w;
  });
  // its own centre must be its own: the topmost element there is this card (or inside it)
  const centre = cards.map((c) => {
    const b = c.getBoundingClientRect();
    const hit = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2)?.closest('#hand .card') as HTMLElement | null;
    return hit ? hit.dataset.card! : null;
  });
  // the rows: group by top edge
  const rowTops = [...new Set(boxes.map((c) => Math.round(c.y)))];
  const rows = rowTops.map((top) => {
    const inRow = boxes.filter((c) => Math.round(c.y) === top);
    return { x: Math.min(...inRow.map((c) => c.x)), y: top, w: Math.max(...inRow.map((c) => c.x + c.w)) - Math.min(...inRow.map((c) => c.x)), h: Math.max(...inRow.map((c) => c.h)) };
  });
  // the tiles: the nearest two centres give the pitch a finger has to hit (the layout's hexPx)
  const cells = [...document.querySelectorAll<SVGPathElement>('#board g.hex-cell path.hex')].map(box);
  let pitch = Infinity;
  const centresOf = cells.map((c) => ({ x: c.x + c.w / 2, y: c.y + c.h / 2 }));
  for (let i = 0; i < centresOf.length; i++)
    for (let j = i + 1; j < centresOf.length; j++)
      pitch = Math.min(pitch, Math.hypot(centresOf[i]!.x - centresOf[j]!.x, centresOf[i]!.y - centresOf[j]!.y));
  const header = document.querySelector('#game > .hud');
  const play = document.querySelector('#game > .play')!;
  return {
    cards: boxes,
    strips,
    centre,
    rows,
    tiles: cells,
    hexPx: Number.isFinite(pitch) ? pitch : 0,
    handRows: document.documentElement.dataset.handRows ?? null,
    dock: box(document.querySelector('#game .dock')!),
    play: box(play),
    header: header ? box(header) : null,
    keys: [...document.querySelectorAll<HTMLElement>('#game .dock > .hand-row .hand-slot, #game .dock > .hand-row .hand-sort')].map(box),
    bodyScroll: document.documentElement.scrollHeight - innerHeight,
  } satisfies Measure;
});

const overlap = (a: Box, b: Box) => a.x < b.x + b.w - 0.5 && b.x < a.x + a.w - 0.5 && a.y < b.y + b.h - 0.5 && b.y < a.y + a.h - 0.5;

try {
  for (const [w, h] of [[640, 360], [844, 390]] as const) {
    const tag = `${w}x${h}`;
    const page = await browser.newPage({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript(() => {
      (window as any).__name = (f: unknown) => f;
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      localStorage.setItem('severgrow.save.v7', 'MAIN-SENTINEL');
      localStorage.setItem('test:severgrow.save.v7', 'TEST-SENTINEL');
      localStorage.setItem('main2:severgrow.settings.v1', JSON.stringify({ sound: false, music: false, coach: false, speed: 'fast', reduceMotion: true, autoSkip: false, confirmPolicy: 'always' }));
    });
    await page.goto(`${BASE}?seed=219682080&lab=1&design=1&tools=1`);
    await idle(page);
    await page.waitForTimeout(500);
    // a full hand: draw, so the hand is 8 (7 dealt + the card just drawn)
    await page.click('#deck');
    await idle(page);
    await page.waitForTimeout(400);
    const m = await measure(page);
    await page.screenshot({ path: `${SHOTS}/${tag}.png` });

    check(m.handRows === '2', `${tag}: the hand wraps into two rows (attribute ${m.handRows})`);
    check(m.cards.length === 8, `${tag}: a full hand of 8 cards (${m.cards.length})`);
    check(m.rows.length === 2, `${tag}: two rows (${m.rows.length})`);
    for (const [i, c] of m.cards.entries()) {
      check(c.w >= TARGET, `${tag}: card ${i + 1} is ${n1(c.w)}pt wide (>= ${TARGET})`);
      check(c.h >= TARGET, `${tag}: card ${i + 1} is ${n1(c.h)}pt tall (>= ${TARGET})`);
      check(m.strips[i]! >= TARGET, `${tag}: card ${i + 1} exposes ${n1(m.strips[i]!)}pt (>= ${TARGET})`);
      check(m.centre[i] === c.id, `${tag}: card ${i + 1} owns its centre (hit ${m.centre[i]})`);
    }
    // four cards in each row, both rows inside the cockpit and the screen
    for (const [r, row] of m.rows.entries()) {
      check(Math.abs(row.x - m.rows[0]!.x) < 1, `${tag}: row ${r + 1} starts at the same x as row 1`);
      check(row.x >= m.dock.x && row.x + row.w <= m.dock.x + m.dock.w, `${tag}: row ${r + 1} is inside the dock`);
      check(row.x >= 0 && row.x + row.w <= w, `${tag}: row ${r + 1} is on screen`);
    }
    check(m.rows[1]!.y >= m.rows[0]!.y + m.rows[0]!.h - 0.01, `${tag}: the rows do not overlap (${n1(m.rows[1]!.y - (m.rows[0]!.y + m.rows[0]!.h))}pt apart)`);
    check(m.rows[0]!.y >= m.dock.y && m.rows[1]!.y + m.rows[1]!.h <= m.dock.y + m.dock.h, `${tag}: both rows are inside the dock`);
    // the dock fits under the header and inside the play area, with no page scroll
    check(m.dock.y >= (m.header ? m.header.y + m.header.h : 44) - 0.5, `${tag}: the cockpit starts under the header (${n1(m.dock.y)})`);
    check(m.dock.y + m.dock.h <= h + 0.5, `${tag}: the cockpit ends on screen (${n1(m.dock.y + m.dock.h)})`);
    check(m.bodyScroll <= 0, `${tag}: no page scroll (${m.bodyScroll}px)`);
    // tiles: a real target, and far from the hand
    check(m.hexPx >= TARGET, `${tag}: tiles are ${n1(m.hexPx)}pt centre to centre (>= ${TARGET})`);
    for (const t of m.tiles) check(Math.max(t.w, t.h) >= TARGET, `${tag}: a tile measures ${n1(t.w)}x${n1(t.h)}`);
    // nothing overlaps: card vs card, card vs tile, card vs the cockpit's keys, card vs the header
    for (const [i, c] of m.cards.entries()) {
      for (const o of m.cards.slice(i + 1)) check(!overlap(c, o), `${tag}: cards ${i + 1} and ${m.cards.indexOf(o) + 1} do not overlap`);
      for (const t of m.tiles) check(!overlap(c, t), `${tag}: card ${i + 1} leaves every tile clear`);
      for (const k of m.keys) check(!overlap(c, k), `${tag}: card ${i + 1} leaves the cockpit's keys clear`);
      if (m.header) check(!overlap(c, m.header), `${tag}: card ${i + 1} leaves the header clear`);
    }
    check(errors.length === 0, `${tag}: no page errors (${errors.join(' | ')})`);
    console.log(`${tag}: 8 cards in 2 rows, card ${n1(m.cards[0]!.w)}x${n1(m.cards[0]!.h)}, strip ${n1(Math.min(...m.strips))}pt, tiles ${n1(m.hexPx)}pt, dock ${n1(m.dock.h)} at ${n1(m.dock.y)}`);
    await page.close();
  }
  console.log(`${checks} checks passed`);
} finally {
  await browser.close();
  await served.server.close();
}
