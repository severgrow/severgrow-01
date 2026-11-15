// ONE MOVE, robustly: load, skip the ritual, draw, pick a card, tap a hex, throw; print the phases.
import { webkit } from 'playwright-core';

const BASE = process.env.BASE ?? 'https://www.futasaku.com/test/';
const LABEL = process.env.LABEL ?? 'one-new';
const DPR = Number(process.env.DPR ?? 3);

const browser = await webkit.launch({ ...(process.env.PW_WEBKIT ? { executablePath: process.env.PW_WEBKIT } : {}) });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: DPR, hasTouch: true, ignoreHTTPSErrors: true });
await page.addInitScript(() => { (window as any).__name = (f: unknown) => f; });
const log = (...a: unknown[]) => console.log(LABEL, ...a);

await page.goto(BASE + '?seed=219682080&debug=timing');
await page.waitForFunction(() => (window as any).__severgrow?.state?.(), undefined, { timeout: 120000 });
// skip the ritual with real taps until it has been gone for 2 s
let gone = 0;
for (let i = 0; i < 200; i++) {
  const up = await page.evaluate(() => { const o = document.getElementById('starter-lottery') as HTMLElement | null; return !!o && !o.hidden; });
  if (up) { gone = 0; await page.mouse.click(195, 300); } else { gone++; if (gone >= 8) break; }
  await page.waitForTimeout(150);
}
log('ritual gone');
await page.waitForTimeout(3000); // the dock/cockpit finishes arriving
const st = () => page.evaluate(() => { const s = (window as any).__severgrow.state(); return { phase: s.phase, actor: s.actor, busy: (window as any).__severgrow.busy() }; });
log('state', JSON.stringify(await st()));
// draw
const deck = await page.evaluate(() => { const r = document.getElementById('deck')!.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
await page.mouse.click(deck.x, deck.y);
for (let i = 0; i < 100; i++) { const s = await st(); if (s.phase !== 'DRAW' && !s.busy) break; await page.waitForTimeout(100); }
log('after draw', JSON.stringify(await st()));
// pick a card with a legal sprout
const ids = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('#hand [data-card]')].map((e) => Number(e.dataset.card)));
let key: string | null = null;
for (const id of ids) {
  const r = await page.evaluate((i2) => { const el = document.querySelector(`#hand [data-card="${i2}"]`); if (!el) return null; const b = el.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; }, id);
  if (!r) continue;
  await page.mouse.click(r.x, r.y);
  await page.waitForTimeout(150);
  key = await page.evaluate(() => {
    const legal = (window as any).__severgrow.legal() as any[];
    const sp = legal.filter((a: any) => a.t === 'Sprout');
    const empty = sp.find((a: any) => !document.querySelector('#board g.tile[data-key="' + CSS.escape(a.coord.q + ',' + a.coord.r) + '"]'));
    const pick = empty ?? sp[0];
    return pick ? pick.coord.q + ',' + pick.coord.r : null;
  });
  if (key) break;
  await page.mouse.click(r.x, r.y);
}
log('target', key);
if (!key) { await browser.close(); process.exit(0); }
const cell = await page.evaluate((k) => { const el = document.querySelector(`#board g.hex-cell[data-key="${k}"] path`) ?? document.querySelector(`#board g.hex-cell[data-key="${k}"]`); if (!el) return null; const b = el.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; }, key);
if (!cell) { log('no cell'); await browser.close(); process.exit(0); }
// arm
await page.evaluate(() => {
  const w = window as any;
  w.__m = { input: null, stateAt: null, domAt: null, frames: [], d0: JSON.stringify(w.__severgrow.state().board) };
  w.addEventListener('pointerdown', () => { if (w.__m.input === null) w.__m.input = performance.now(); }, { capture: true, once: true });
  const poll = () => {
    if (w.__m.stateAt === null) {
      const s = JSON.stringify(w.__severgrow.state().board);
      if (s !== w.__m.d0) w.__m.stateAt = performance.now(); else setTimeout(poll, 0);
    }
  };
  setTimeout(poll, 0);
  const raf = (t: number) => { w.__m.frames.push(t); requestAnimationFrame(raf); };
  requestAnimationFrame(raf);
});
await page.mouse.move(cell.x, cell.y);
await page.mouse.down();
await page.mouse.up();
await page.waitForTimeout(1500);
const m = await page.evaluate(() => {
  const w = (window as any).__m;
  const after = w.frames.filter((t: number) => w.input !== null && t >= w.input - 1);
  const gaps: number[] = [];
  for (let i = 1; i < after.length; i++) gaps.push(Math.round(after[i] - after[i - 1]));
  return { input: w.input, stateAt: w.stateAt === null ? null : Math.round(w.stateAt - w.input), frames: after.length, maxGap: gaps.length ? Math.max(...gaps) : null, costs: (window as any).__severgrow.renderCosts().slice(-3), timing: (window as any).__severgrow.timing().map((x: any) => x.ev) };
});
log('move', JSON.stringify(m));
await browser.close();
