// WHAT ONE MOVE COSTS TO DRAW: aggregate Chrome trace events over a grow, per name.
import { chromium } from 'playwright-core';
import { writeFileSync, mkdirSync } from 'node:fs';

const BASE = process.env.BASE ?? 'https://www.futasaku.com/test/';
const LABEL = process.env.LABEL ?? 'fc-new';
const MOVES = Number(process.env.MOVES ?? 4);
const DPR = Number(process.env.DPR ?? 2);
const OUT = process.env.OUT ?? '/tmp/latency';

const browser = await chromium.launch({ ...(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}), args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: DPR, hasTouch: true, isMobile: true, ignoreHTTPSErrors: true });
await page.addInitScript(() => { (window as any).__name = (f: unknown) => f; });
const cdp = await page.context().newCDPSession(page);
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
await page.waitForTimeout(600);

if (process.env.WARM === '1') {
  const warmed = await page.evaluate(async () => {
    const urls = performance.getEntriesByType('resource').map((e) => e.name)
      .filter((u) => /\/assets\/(forest|ash)-0\d-.*\.webp/.test(u));
    const svg = document.getElementById('board') as unknown as SVGSVGElement;
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('opacity', '0.004');
    for (const [i, url] of urls.entries()) {
      const img = document.createElementNS('http://www.w3.org/2000/svg', 'image');
      img.setAttribute('href', url);
      img.setAttribute('x', String(20 + (i % 6) * 64));
      img.setAttribute('y', String(20 + Math.floor(i / 6) * 56));
      img.setAttribute('width', '60');
      img.setAttribute('height', '52');
      g.append(img);
    }
    svg.append(g);
    await new Promise<void>((res) => requestAnimationFrame(() => requestAnimationFrame(() => res())));
    g.remove();
    return urls.length;
  });
  console.log('warmed', warmed);
  await page.waitForTimeout(300);
}

const rows: any[] = [];
const WANT = new Set(['Paint', 'RasterTask', 'Rasterize', 'Layerize', 'CompositeLayers', 'DrawFrame', 'GpuImageDecodeCache::DecodeImage', 'Decode LazyPixelRef', 'ImageDecodeTask', 'UpdateLayer', 'PrePaint', 'Layout', 'RecalcStyle', 'UpdateLayoutTree', 'FunctionCall', 'FireAnimationFrame', 'Animation', 'Commit', 'BeginMainThreadFrame', 'DrawLazyPixelRef']);
for (let i = 0; i < MOVES; i++) {
  await page.waitForFunction(() => (window as any).__severgrow.state()?.actor === 0 && !(window as any).__severgrow.busy(), undefined, { timeout: 120000 });
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
      for (const a of legal) {
        if (a.t !== 'Sprout') continue;
        const k = a.coord.q + ',' + a.coord.r;
        if (!document.querySelector('#board g.tile[data-key="' + CSS.escape(k) + '"]')) return k;
      }
      return null;
    });
    if (t) { key = t; break; }
    await page.mouse.click(r.x, r.y);
  }
  if (!key) { rows.push({ i, kind: 'nosprout' }); break; }
  const cell = await rectOf(`#board g.hex-cell[data-key="${key}"] path`);
  if (!cell) break;
  await page.waitForTimeout(300);
  await cdp.send('Tracing.start', { categories: 'devtools.timeline,disabled-by-default-devtools.timeline,blink,cc,gpu,viz,disabled-by-default-gpu.service', transferMode: 'ReturnAsStream' });
  await page.mouse.move(cell.x, cell.y);
  await page.mouse.down(); await page.mouse.up();
  await page.waitForTimeout(900);
  const stream = await new Promise<string>((resolve) => {
    cdp.once('Tracing.tracingComplete', (e: any) => resolve(e.stream));
    void cdp.send('Tracing.end');
  });
  const chunks: string[] = [];
  for (;;) {
    const r: any = await cdp.send('IO.read', { handle: stream, size: 8_000_000 });
    chunks.push(r.data);
    if (r.eof) break;
  }
  const json = JSON.parse(chunks.join(''));
  const agg: Record<string, { n: number; ms: number; max: number }> = {};
  let totalMs = 0;
  for (const e of json.traceEvents ?? []) {
    if (typeof e.dur !== 'number' || !WANT.has(e.name)) continue;
    const ms = e.dur / 1000;
    const a = agg[e.name] ?? (agg[e.name] = { n: 0, ms: 0, max: 0 });
    a.n++; a.ms += ms; a.max = Math.max(a.max, ms);
  }
  for (const a of Object.values(agg)) { a.ms = Math.round(a.ms * 10) / 10; a.max = Math.round(a.max * 10) / 10; }
  rows.push({ i, kind: 'grow', agg });
  console.log('MOVE', i, JSON.stringify(agg));
  await settle();
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
mkdirSync(OUT, { recursive: true });
writeFileSync(`${OUT}/${LABEL}.json`, JSON.stringify(rows, null, 1));
await browser.close();
