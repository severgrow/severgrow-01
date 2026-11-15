// THE TAP → RESULT COST ON WEBKIT (the owner's engine): a real grow tap, repeated, reporting
// (a) tap → the state the page shows, (b) the page's own `render()` cost for that move, (c) the
// frame gap around it. Each target is served by this process, one after another, same page setup.
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { webkit } from 'playwright-core';
import type { AddressInfo } from 'node:net';

const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };

/** A target: a local directory to serve, or a deployed URL. */
type Target = { name: string; dir?: string; url?: string };

const targets: Target[] = (process.env.TARGETS ?? '').split(',').filter(Boolean).map((spec) => {
  const [name, rest] = spec.split('=');
  return rest!.startsWith('http') ? { name: name!, url: rest! } : { name: name!, dir: rest! };
});
const DPR = Number(process.env.DPR ?? 3);
const MOVES = Number(process.env.MOVES ?? 6);

const serve = (dir: string) => new Promise<{ url: string; close: () => void }>((resolve) => {
  const server = createServer((req, res) => {
    const path = decodeURIComponent((req.url ?? '/').split('?')[0]!);
    let file = join(dir, path === '/' ? 'index.html' : path);
    if (!existsSync(file) || statSync(file).isDirectory()) file = join(dir, 'index.html');
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(readFileSync(file));
  });
  server.listen(0, '127.0.0.1', () => {
    const port = (server.address() as AddressInfo).port;
    resolve({ url: `http://127.0.0.1:${port}/`, close: () => server.close() });
  });
});

const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? Math.round(s[Math.floor(s.length / 2)]! * 10) / 10 : null; };
const p95 = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? Math.round(s[Math.min(s.length - 1, Math.ceil(s.length * 0.95) - 1)]! * 10) / 10 : null; };

const browser = await webkit.launch({ ...(process.env.PW_WEBKIT ? { executablePath: process.env.PW_WEBKIT } : {}) });
const results: any[] = [];
for (const t of targets) {
  const served = t.dir ? await serve(t.dir) : null;
  const base = served?.url ?? t.url!;
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: DPR, hasTouch: true, ignoreHTTPSErrors: true });
  await page.addInitScript(() => { (window as any).__name = (f: unknown) => f; });
  try {
    await page.goto(base + '?seed=219682080&debug=timing', { timeout: 45000 });
    await page.waitForFunction(() => (window as any).__severgrow?.state?.(), undefined, { timeout: 90000 });
    // skip the who-starts ritual, then let the cockpit settle completely
    let gone = 0;
    for (let i = 0; i < 200; i++) {
      const up = await page.evaluate(() => { const o = document.getElementById('starter-lottery') as HTMLElement | null; return !!o && !o.hidden; });
      if (up) { gone = 0; await page.mouse.click(195, 300); } else { gone++; if (gone >= 6) break; }
      await page.waitForTimeout(150);
    }
    await page.waitForTimeout(3000);
    const at = (sel: string) => page.evaluate((s) => { const el = document.querySelector(s); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, sel);
    const rows: any[] = [];
    for (let m = 0; m < MOVES; m++) {
      // draw if needed (a tap, then wait for the step)
      const phase = await page.evaluate(() => (window as any).__severgrow.state().phase);
      if (phase === 'DRAW') {
        const d = await at('#deck'); if (!d) break;
        await page.mouse.click(d.x, d.y);
        await page.waitForFunction(() => { const h = (window as any).__severgrow; const s = h.state(); return s && !h.busy() && s.phase !== 'DRAW'; }, undefined, { timeout: 30000 }).catch(() => {});
        await page.waitForTimeout(500);
      }
      // pick a card that offers a Sprout, then tap its target hex
      const ids = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('#hand [data-card]')].map((e) => Number(e.dataset.card)));
      let key: string | null = null;
      let picked = false;
      for (const id of ids) {
        const r = await at(`#hand [data-card="${id}"]`); if (!r) continue;
        await page.mouse.click(r.x, r.y);
        await page.waitForTimeout(120);
        key = await page.evaluate(() => {
          const legal = (window as any).__severgrow.legal() as any[];
          const sp = legal.filter((a: any) => a.t === 'Sprout');
          const pick = sp.find((a: any) => !document.querySelector('#board g.tile[data-key="' + CSS.escape(a.coord.q + ',' + a.coord.r) + '"]')) ?? sp[0];
          return pick ? pick.coord.q + ',' + pick.coord.r : null;
        });
        if (key) { picked = true; break; }
        await page.mouse.click(r.x, r.y);
      }
      if (!picked || !key) { rows.push({ m, skip: 'no sprout' }); break; }
      const cell = await at(`#board g.hex-cell[data-key="${key}"] path`);
      if (!cell) break;
      // arm: tap time, the page's own render costs, the frames
      await page.evaluate(() => {
        const w = window as any;
        w.__r = { input: null, stateAt: null, before: w.__severgrow.renderCosts().length, frames: [] };
        w.addEventListener('pointerdown', () => { if (w.__r.input === null) w.__r.input = performance.now(); }, { capture: true, once: true });
        const d0 = JSON.stringify(w.__severgrow.state().board);
        const poll = () => {
          if (w.__r.stateAt === null) {
            if (JSON.stringify(w.__severgrow.state().board) !== d0) w.__r.stateAt = performance.now(); else setTimeout(poll, 0);
          }
        };
        setTimeout(poll, 0);
        const raf = (t: number) => { w.__r.frames.push(t); if (w.__r.frames.length < 90) requestAnimationFrame(raf); };
        requestAnimationFrame(raf);
      });
      await page.mouse.move(cell.x, cell.y);
      await page.mouse.down();
      await page.mouse.up();
      await page.waitForTimeout(1200);
      const r = await page.evaluate(() => {
        const w = window as any;
        const after = w.__r.frames.filter((t: number) => t >= w.__r.input - 1);
        const gaps: number[] = [];
        for (let i = 1; i < after.length; i++) gaps.push(after[i] - after[i - 1]);
        const costs = w.__severgrow.renderCosts().slice(w.__r.before);
        return {
          stateAt: w.__r.stateAt === null ? null : Math.round(w.__r.stateAt - w.__r.input),
          full: costs.filter((c: any) => c.kind === 'full').map((c: any) => c.ms),
          tile: costs.filter((c: any) => c.kind === 'tile').map((c: any) => c.ms),
          frames: after.length,
          maxGap: gaps.length ? Math.round(Math.max(...gaps)) : null,
        };
      });
      rows.push({ m, ...r });
      // throw, and wait for my turn to come back
      const ph2 = await page.evaluate(() => (window as any).__severgrow.state().phase);
      if (ph2 === 'DISCARD') {
        const hr = await page.evaluate(() => { const el = document.querySelector<HTMLElement>('#hand [data-card]'); if (!el) return null; const b = el.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; });
        const pile = await at('#discard');
        if (hr && pile) {
          await page.mouse.move(hr.x, hr.y); await page.mouse.down();
          for (let k = 1; k <= 8; k++) { await page.mouse.move(hr.x + (pile.x - hr.x) * k / 8, hr.y + (pile.y - hr.y) * k / 8); await page.waitForTimeout(16); }
          await page.mouse.up();
          await page.waitForFunction(() => { const h = (window as any).__severgrow; return !h.busy() && h.state()?.actor === 0; }, undefined, { timeout: 60000 }).catch(() => {});
          await page.waitForTimeout(300);
        }
      }
    }
    const tap = rows.filter((r) => typeof r.stateAt === 'number').map((r) => r.stateAt as number);
    const full = rows.flatMap((r) => (r.full ?? []) as number[]);
    const gaps = rows.filter((r) => typeof r.maxGap === 'number').map((r) => r.maxGap as number);
    const summary = {
      name: t.name, base, moves: tap.length,
      tapToState: { p50: median(tap), p95: p95(tap), values: tap },
      renderFull: { n: full.length, p50: median(full), p95: p95(full), max: full.length ? Math.max(...full) : null },
      maxGap: { p50: median(gaps), p95: p95(gaps) },
    };
    results.push({ summary, rows });
    console.log(JSON.stringify(summary));
  } catch (e) {
    console.log(JSON.stringify({ name: t.name, error: String((e as Error).message).slice(0, 160) }));
    results.push({ name: t.name, error: String((e as Error).message).slice(0, 160) });
  }
  await page.close();
  served?.close();
}
await browser.close();
console.log(JSON.stringify({ results }));
