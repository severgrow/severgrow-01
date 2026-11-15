// What takes the time when a grown tile stalls? Record a Chrome trace around one move.
import { chromium } from 'playwright-core';
import { writeFileSync } from 'node:fs';

const BASE = process.env.BASE ?? 'https://www.futasaku.com/test/';
const MOVES = Number(process.env.MOVES ?? 6);

const browser = await chromium.launch({ ...(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}), args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, ignoreHTTPSErrors: true });
await page.addInitScript(() => { (window as any).__name = (f: unknown) => f; });
const cdp = await page.context().newCDPSession(page);

const settle = async () => page.waitForFunction(() => {
  const h = (window as any).__severgrow; const s = h.state();
  return !!s && !h.busy() && !h.pending();
}, undefined, { timeout: 120000 });
const rectOf = (sel: string) => page.evaluate((s) => {
  const el = document.querySelector<HTMLElement | SVGElement>(s); if (!el) return null;
  const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}, sel);

await page.goto(BASE + '?seed=219682080');
await page.waitForFunction(() => (window as any).__severgrow?.state?.(), undefined, { timeout: 60000 });
let quiet = 0;
for (let i = 0; i < 90; i++) {
  const up = await page.evaluate(() => { const o = document.getElementById('starter-lottery') as HTMLElement | null; return !!o && !o.hidden; });
  if (up) { quiet = 0; await page.mouse.click(195, 420); } else { quiet++; if (quiet >= 4) break; }
  await page.waitForTimeout(160);
}
await settle();

const traces: { i: number; ms: number; top: any[] }[] = [];
for (let i = 0; i < MOVES; i++) {
  await page.waitForFunction(() => (window as any).__severgrow.state()?.actor === 0 && !(window as any).__severgrow.busy(), undefined, { timeout: 120000 });
  const st = await page.evaluate(() => (window as any).__severgrow.state().phase);
  if (st === 'DRAW') {
    const d = await rectOf('#deck'); if (!d) break;
    await page.mouse.click(d.x, d.y);
    await page.waitForTimeout(700);
  }
  const ids = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('#hand [data-card]')].map((e) => Number(e.dataset.card)));
  let target: any = null;
  for (const id of ids) {
    const r = await rectOf(`#hand [data-card="${id}"]`); if (!r) continue;
    await page.mouse.click(r.x, r.y); await page.waitForTimeout(50);
    const t = await page.evaluate(() => {
      const legal = (window as any).__severgrow.legal() as any[];
      for (const a of legal) {
        if (a.t !== 'Sprout') continue;
        const k = a.coord.q + ',' + a.coord.r;
        if (!document.querySelector('#board g.tile[data-key="' + CSS.escape(k) + '"]')) return { key: k };
      }
      return null;
    });
    if (t) { target = t; break; }
    await page.mouse.click(r.x, r.y);
  }
  if (!target) break;
  const cell = await rectOf(`#board g.hex-cell[data-key="${target.key}"] path`);
  if (!cell) break;
  // Which ground sprite variant is this cell? (one of the nine big webps)
  const variant = await page.evaluate((k) => {
    const cells = [...document.querySelectorAll('#board g.hex-cell')];
    return { idx: cells.findIndex((e) => (e as HTMLElement).dataset.key === k), total: cells.length };
  }, target.key);

  await cdp.send('Tracing.start', { categories: 'devtools.timeline,disabled-by-default-devtools.timeline,blink,cc,gpu,viz', transferMode: 'ReturnAsStream' });
  const t0 = Date.now();
  await page.mouse.move(cell.x, cell.y);
  await page.mouse.down(); await page.mouse.up();
  await page.waitForTimeout(1200);
  const stream = await new Promise<string>((resolve) => {
    cdp.once('Tracing.tracingComplete', (e: any) => resolve(e.stream));
    void cdp.send('Tracing.end');
  });
  const chunks: string[] = [];
  for (;;) {
    const r: any = await cdp.send('IO.read', { handle: stream, size: 4_000_000 });
    chunks.push(r.data);
    if (r.eof) break;
  }
  const json = JSON.parse(chunks.join(''));
  const evs = (json.traceEvents ?? []).filter((e: any) => typeof e.dur === 'number' && e.dur > 20_000);
  evs.sort((a: any, b: any) => b.dur - a.dur);
  const top = evs.slice(0, 14).map((e: any) => ({ name: e.name, ms: Math.round(e.dur / 100) / 10, args: JSON.stringify(e.args ?? {}).slice(0, 160) }));
  traces.push({ i, ms: Date.now() - t0, top });
  console.log('MOVE', i, 'variant', JSON.stringify(variant), JSON.stringify(top.slice(0, 8)));
  // throw to end the turn
  await settle();
  const phase = await page.evaluate(() => (window as any).__severgrow.state().phase);
  if (phase === 'DISCARD') {
    const handIds = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('#hand [data-card]')].map((e) => Number(e.dataset.card)));
    const from = handIds.length ? await rectOf(`#hand [data-card="${handIds[0]}"]`) : null;
    const pile = await rectOf('#discard');
    if (from && pile) {
      await page.mouse.move(from.x, from.y); await page.mouse.down();
      for (let k = 1; k <= 8; k++) { await page.mouse.move(from.x + (pile.x - from.x) * k / 8, from.y + (pile.y - from.y) * k / 8); await page.waitForTimeout(16); }
      await page.mouse.up();
      await page.waitForTimeout(500);
    }
  }
}
writeFileSync('/tmp/latency/traces.json', JSON.stringify(traces, null, 1));
await browser.close();
