// FRAME CADENCE DURING A MOVE: how smoothly does the grow actually animate?
// Counts real rAF frames in the 700 ms after the hex tap and reports the gaps.
import { chromium, webkit } from 'playwright-core';
import { writeFileSync, mkdirSync } from 'node:fs';

const BASE = process.env.BASE ?? 'https://www.futasaku.com/test/';
const LABEL = process.env.LABEL ?? 'cad-new';
const MOVES = Number(process.env.MOVES ?? 8);
const DPR = Number(process.env.DPR ?? 2);
const THROTTLE = Number(process.env.THROTTLE ?? 1);
const BROWSER = process.env.BROWSER ?? 'chromium';
const OUT = process.env.OUT ?? '/tmp/latency';

const browser = BROWSER === 'webkit'
  ? await webkit.launch({ ...(process.env.PW_WEBKIT ? { executablePath: process.env.PW_WEBKIT } : {}) })
  : await chromium.launch({ ...(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}), args: ['--no-sandbox'] });
const page = await browser.newPage({
  viewport: { width: 390, height: 844 }, deviceScaleFactor: DPR, hasTouch: true,
  ...(BROWSER === 'chromium' ? { isMobile: true } : {}), ignoreHTTPSErrors: true,
});
await page.addInitScript((settings: string) => {
  (window as any).__name = (f: unknown) => f;
  try { for (const k of ['severgrow.settings.v1', 'test:severgrow.settings.v1', 'futa05:severgrow.settings.v1']) localStorage.setItem(k, settings); } catch {}
}, process.env.SETTINGS_JSON ?? JSON.stringify({ sound: false, music: false, speed: 'normal', reduceMotion: false, vibration: false, effects: 'normal', confirmPolicy: 'smart', coach: true, autoSkip: false }));
let cdp: any = null;
try {
  cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  if (THROTTLE !== 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });
} catch { cdp = null; }

const rectOf = (sel: string) => page.evaluate((s) => {
  const el = document.querySelector<HTMLElement | SVGElement>(s); if (!el) return null;
  const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}, sel);
const settle = async () => page.waitForFunction(() => {
  const h = (window as any).__severgrow; const s = h.state();
  return !!s && !h.busy() && !h.pending();
}, undefined, { timeout: 120000 });

await page.goto(BASE + '?seed=219682080');
await page.waitForFunction(() => (window as any).__severgrow?.state?.(), undefined, { timeout: 60000 });
let quiet = 0;
for (let i = 0; i < 100; i++) {
  const up = await page.evaluate(() => { const o = document.getElementById('starter-lottery') as HTMLElement | null; return !!o && !o.hidden; });
  if (up) { quiet = 0; await page.mouse.click(195, 420); } else { quiet++; if (quiet >= 5) break; }
  await page.waitForTimeout(160);
}
await settle();
await page.waitForTimeout(500);

const rows: any[] = [];
for (let i = 0; i < MOVES; i++) {
  await page.waitForFunction(() => {
    const h = (window as any).__severgrow;
    return (window as any).__severgrow.state()?.actor === 0 && !h.busy();
  }, undefined, { timeout: 120000 });
  const phase = await page.evaluate(() => (window as any).__severgrow.state().phase);
  if (phase === 'DRAW') {
    const d = await rectOf('#deck'); if (!d) break;
    await page.mouse.click(d.x, d.y);
    await page.waitForTimeout(900);
    await settle();
  }
  const ids = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('#hand [data-card]')].map((e) => Number(e.dataset.card)));
  let key: string | null = null;
  for (const id of ids) {
    const r = await rectOf(`#hand [data-card="${id}"]`); if (!r) continue;
    await page.mouse.click(r.x, r.y); await page.waitForTimeout(50);
    const t = await page.evaluate(() => {
      const legal = (window as any).__severgrow.legal() as any[];
      const sprout = legal.filter((a: any) => a.t === 'Sprout');
      const empty = sprout.find((a: any) => !document.querySelector('#board g.tile[data-key="' + CSS.escape(a.coord.q + ',' + a.coord.r) + '"]'));
      const pick = empty ?? sprout[0];
      return pick ? pick.coord.q + ',' + pick.coord.r : null;
    });
    if (t) { key = t; break; }
    await page.mouse.click(r.x, r.y);
  }
  if (!key) { rows.push({ kind: 'nosprout', i }); break; }
  const cell = await rectOf(`#board g.hex-cell[data-key="${key}"] path`);
  if (!cell) break;
  // arm the frame recorder in the page
  await page.evaluate(() => {
    const w = window as any;
    w.__f = { frames: [], long: [] };
    const raf = (t: number) => { w.__f.frames.push(t); if (w.__f.frames.at(-1) - (w.__f.t0 ?? t) < 1400) requestAnimationFrame(raf); };
    requestAnimationFrame(raf);
    try { const lo = new PerformanceObserver((l) => { for (const e of l.getEntries()) w.__f.long.push(Math.round(e.duration)); }); lo.observe({ type: 'longtask' }); w.__f.lo = lo; } catch {}
  });
  await page.mouse.move(cell.x, cell.y);
  await page.mouse.down();
  const t0 = await page.evaluate(() => { const w = window as any; w.__f.t0 = performance.now(); return w.__f.t0; });
  await page.mouse.up();
  await page.waitForTimeout(750);
  const f = await page.evaluate(() => {
    const w = window as any; w.__f.lo?.disconnect();
    return { t0: w.__f.t0, frames: w.__f.frames, long: w.__f.long };
  });
  const after = (f.frames as number[]).filter((t) => t >= f.t0 - 1);
  const gaps: number[] = [];
  for (let k = 1; k < after.length; k++) gaps.push(after[k]! - after[k - 1]!);
  const span = after.length > 1 ? after.at(-1)! - after[0]! : 0;
  rows.push({
    kind: 'grow', i, n: after.length,
    fps: span > 0 ? Math.round(((after.length - 1) / span) * 1000) : null,
    maxGap: gaps.length ? Math.round(Math.max(...gaps)) : null,
    over33: gaps.filter((g) => g > 33).length,
    over100: gaps.filter((g) => g > 100).length,
    long: f.long.length, longMax: f.long.length ? Math.max(...f.long) : 0,
  });
  await settle();
  // throw to end the turn
  const phase2 = await page.evaluate(() => (window as any).__severgrow.state().phase);
  if (phase2 === 'DISCARD') {
    const handIds = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('#hand [data-card]')].map((e) => Number(e.dataset.card)));
    const from = handIds.length ? await rectOf(`#hand [data-card="${handIds[0]}"]`) : null;
    const pile = await rectOf('#discard');
    if (from && pile) {
      await page.mouse.move(from.x, from.y); await page.mouse.down();
      for (let k = 1; k <= 8; k++) { await page.mouse.move(from.x + (pile.x - from.x) * k / 8, from.y + (pile.y - from.y) * k / 8); await page.waitForTimeout(16); }
      await page.mouse.up();
      await page.waitForFunction(() => {
        const h = (window as any).__severgrow;
        return !h.busy() && h.state()?.actor === 0;
      }, undefined, { timeout: 120000 });
    }
  }
}
const num = (f: string) => rows.filter((r) => typeof r[f] === 'number').map((r) => r[f] as number);
const med = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)]! : null; };
const p95 = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.ceil(s.length * 0.95) - 1)]! : null; };
const summary: any = { label: LABEL, base: BASE, browser: BROWSER, moves: MOVES, dpr: DPR, throttle: THROTTLE };
for (const f of ['fps', 'maxGap', 'over33', 'over100', 'longMax', 'n']) {
  const xs = num(f);
  if (xs.length) summary[f] = { n: xs.length, p50: med(xs), p95: p95(xs), min: Math.min(...xs), max: Math.max(...xs), mean: Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) };
}
mkdirSync(OUT, { recursive: true });
writeFileSync(`${OUT}/${LABEL}.json`, JSON.stringify({ summary, rows }, null, 1));
console.log(JSON.stringify({ summary, rows }, null, 1));
await browser.close();
