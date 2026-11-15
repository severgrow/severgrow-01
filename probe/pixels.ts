// PRESENTED-FRAME probe: does the grown tile actually reach the screen, and when?
// Chrome's screencast emits a frame whenever the compositor produces one; a frame identical to the
// baseline is "nothing new on screen". The first differing frame is the first visible change.
import { chromium } from 'playwright-core';
import { writeFileSync, mkdirSync } from 'node:fs';

const BASE = process.env.BASE ?? 'https://www.futasaku.com/test/';
const LABEL = process.env.LABEL ?? 'px-new';
const MOVES = Number(process.env.MOVES ?? 6);
const DPR = Number(process.env.DPR ?? 2);
const THROTTLE = Number(process.env.THROTTLE ?? 1);
const OUT = process.env.OUT ?? '/tmp/latency';

const browser = await chromium.launch({ ...(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}), args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: DPR, hasTouch: true, isMobile: true, ignoreHTTPSErrors: true });
await page.addInitScript(() => { (window as any).__name = (f: unknown) => f; });
const cdp = await page.context().newCDPSession(page);
await cdp.send('Performance.enable');
if (THROTTLE !== 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });

type Frame = { t: number; hash: number; n: number };
let frames: Frame[] = [];
let frameNo = 0;
cdp.on('Page.screencastFrame', (ev: any) => {
  const data: string = ev.data;
  // A cheap rolling hash of the base64 payload: the same screen gives the same payload.
  let h = 0;
  const s = data.length;
  for (let i = 0; i < s; i += 97) h = (h * 31 + data.charCodeAt(i)) | 0;
  frames.push({ t: Date.now(), hash: h * 31 + s, n: frameNo++ });
  void cdp.send('Page.screencastFrameAck', { sessionId: ev.sessionId }).catch(() => {});
});

const settle = async () => {
  await page.waitForFunction(() => {
    const h = (window as any).__severgrow; const s = h.state();
    return !!s && !h.busy();
  }, undefined, { timeout: 60000 });
};
const settleMine = async () => {
  await settle();
  await page.waitForFunction(() => (window as any).__severgrow.state()?.actor === 0, undefined, { timeout: 120000 });
};
const rectOf = (sel: string) => page.evaluate((s) => {
  const el = document.querySelector<HTMLElement | SVGElement>(s);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}, sel);

await page.goto(BASE + '?seed=219682080');
await page.waitForFunction(() => (window as any).__severgrow?.state?.(), undefined, { timeout: 60000 });
// skip the starter ritual, wait until it has been gone for a while
let quiet = 0;
for (let i = 0; i < 90; i++) {
  const up = await page.evaluate(() => {
    const o = document.getElementById('starter-lottery') as HTMLElement | null;
    return !!o && !o.hidden;
  });
  if (up) { quiet = 0; await page.mouse.click(195, 420); }
  else { quiet++; if (quiet >= 4) break; }
  await page.waitForTimeout(160);
}
await settle();

// WARM=1: decode every tile picture the page has fetched, once, at a real tile's drawn size —
// the "do the expensive work once at setup" candidate fix, tested without touching the source.
if (process.env.WARM === '2') {
  const warmed = await page.evaluate(async () => {
    const urls = performance.getEntriesByType('resource').map((e) => e.name)
      .filter((u) => /\/assets\/(forest|ash)-0\d-.*\.webp/.test(u));
    const tileImg = document.querySelector('#board g.tile image') as SVGImageElement | null;
    const box = tileImg ? tileImg.getBoundingClientRect() : null;
    const dpr = window.devicePixelRatio || 1;
    const w = (box?.width || 60) * dpr, h = (box?.height || 52) * dpr;
    for (const url of urls) {
      const img = new Image();
      img.src = url;
      try { await img.decode(); } catch { /* fall through */ }
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h));
      c.getContext('2d')?.drawImage(img, 0, 0, c.width, c.height);
      // keep it referenced so nothing is collected before the first move
      (window as any).__warm ??= [];
      (window as any).__warm.push(c);
    }
    return { n: urls.length, w: Math.round(w), h: Math.round(h) };
  });
  console.log('warmed', JSON.stringify(warmed));
  await page.waitForTimeout(150);
}
if (process.env.WARM === '1') {
  const warmed = await page.evaluate(async () => {
    const urls = performance.getEntriesByType('resource')
      .map((e) => e.name)
      .filter((u) => /\/assets\/(forest|ash)-0\d-.*\.webp/.test(u));
    const tileImg = document.querySelector('#board g.tile image') as SVGImageElement | null;
    const box = tileImg ? tileImg.getBoundingClientRect() : null;
    const w = box?.width || 60, h = box?.height || 52;
    const svg = document.getElementById('board') as unknown as SVGSVGElement;
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('opacity', '0.004');
    g.setAttribute('aria-hidden', 'true');
    g.style.pointerEvents = 'none';
    for (const [i, url] of urls.entries()) {
      const img = document.createElementNS('http://www.w3.org/2000/svg', 'image');
      img.setAttribute('href', url);
      img.setAttribute('x', '0');
      img.setAttribute('y', String(i * h));
      img.setAttribute('width', String(w));
      img.setAttribute('height', String(h));
      g.append(img);
    }
    svg.append(g);
    await new Promise<void>((res) => requestAnimationFrame(() => requestAnimationFrame(() => res())));
    g.remove();
    return urls.length;
  });
  console.log('warmed', warmed, 'pictures');
  await page.waitForTimeout(200);
}

// Turn the screencast on only for the measured windows.
const startCast = async () => {
  frames = []; frameNo = 0;
  await cdp.send('Page.startScreencast', { format: 'png', maxWidth: 390, maxHeight: 844, everyNthFrame: 1 });
};
const stopCast = async () => { try { await cdp.send('Page.stopScreencast'); } catch { /* gone */ } };

const rows: any[] = [];
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)]! : null; };
const p95 = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.ceil(s.length * 0.95) - 1)]! : null; };

for (let i = 0; i < MOVES; i++) {
  await settleMine();
  const s = await page.evaluate(() => { const st = (window as any).__severgrow.state(); return { phase: st.phase }; });
  if (s.phase === 'DRAW') {
    const d = await rectOf('#deck'); if (!d) throw new Error('no deck');
    await page.mouse.click(d.x, d.y);
    await page.waitForFunction(() => {
      const h = (window as any).__severgrow; const st = h.state();
      return st && !h.busy() && st.phase !== 'DRAW' && st.actor === 0;
    }, undefined, { timeout: 30000 });
  }
  // pick a card that can sprout onto an empty hex
  let target: { card: number; key: string } | null = null;
  let selectedCard = false;
  const ids = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('#hand [data-card]')].map((e) => Number(e.dataset.card)));
  for (const id of ids) {
    const r = await rectOf(`#hand [data-card="${id}"]`); if (!r) continue;
    // MEASURE THE CARD TAP: from the tap to the first frame that shows the selection/targets.
    await startCast();
    await page.waitForTimeout(250);
    const cardBase = frames.at(-1)?.hash ?? null;
    const cardTapAt = Date.now();
    await page.mouse.click(r.x, r.y);
    await page.waitForTimeout(500);
    await stopCast();
    if (!selectedCard) {
      const cardAfter = frames.filter((f) => f.t >= cardTapAt);
      const cardChanged = cardAfter.find((f) => f.hash !== cardBase) ?? null;
      rows.push({ kind: 'select', i, visible: cardChanged ? cardChanged.t - cardTapAt : null, frames500: cardAfter.filter((f) => f.t - cardTapAt <= 500).length });
      selectedCard = true;
    }
    await page.waitForTimeout(50);
    const t = await page.evaluate(() => {
      const legal = (window as any).__severgrow.legal() as any[];
      for (const a of legal) {
        if (a.t !== 'Sprout') continue;
        const k = a.coord.q + ',' + a.coord.r;
        if (!document.querySelector('#board g.tile[data-key="' + CSS.escape(k) + '"]') && document.querySelector('#board g.hex-cell[data-key="' + CSS.escape(k) + '"]')) return { key: k };
      }
      return null;
    });
    if (t) { target = { card: id, key: (t as any).key }; break; }
    await page.mouse.click(r.x, r.y);
  }
  if (!target) { rows.push({ kind: 'nosprout', i }); continue; }
  const cell = await rectOf(`#board g.hex-cell[data-key="${target.key}"] path`);
  if (!cell) { rows.push({ kind: 'nocell', i }); continue; }
  await page.waitForTimeout(200);
  await startCast();
  await page.waitForTimeout(250); // a baseline of identical frames
  const base = frames.at(-1)?.hash ?? null;
  const tapAt = Date.now();
  await page.mouse.move(cell.x, cell.y);
  await page.mouse.down();
  await page.mouse.up();
  await page.waitForTimeout(900);
  await stopCast();
  const after = frames.filter((f) => f.t >= tapAt);
  const changed = after.find((f) => f.hash !== base) ?? null;
  const visible = changed ? changed.t - tapAt : null;
  // frames delivered in the first 500 ms after the tap: the compositor's real pace
  const first500 = after.filter((f) => f.t - tapAt <= 500);
  // Which picture did this tile wear, and had the page drawn it before?
  const href = await page.evaluate((k) => {
    const img = document.querySelector(`#board g.tile[data-key="${k}"] image`);
    return img ? (img.getAttribute('href') ?? '') : '';
  }, target.key);
  const seen = globalThis.__seenHrefs ?? (globalThis.__seenHrefs = new Set<string>());
  const firstUse = href !== '' && !seen.has(href);
  if (href) seen.add(href);
  rows.push({
    kind: 'grow', i, href: href.split('/').pop(), firstUse,
    visible,
    framesBeforeTap: frames.filter((f) => f.t < tapAt).length,
    frames500: first500.length,
    fps: first500.length >= 2 ? Math.round((first500.length / Math.max(1, first500.at(-1)!.t - first500[0]!.t)) * 1000) : null,
    totalFrames: after.length,
  });
  await settle();
  // Throw: drag the first hand card onto the Throw pile (the real gesture), then let the bot play.
  const th = await page.evaluate(() => { const s = (window as any).__severgrow.state(); return { phase: s.phase }; });
  if (th.phase !== 'DISCARD') {
    rows.push({ kind: 'throw-skipped', i, phase: th.phase });
    continue;
  }
  const handIds = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('#hand [data-card]')].map((e) => Number(e.dataset.card)));
  const from = handIds.length ? await rectOf(`#hand [data-card="${handIds[0]}"]`) : null;
  const pile = await rectOf('#discard');
  if (!from || !pile) { rows.push({ kind: 'nopile', i }); continue; }
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let k = 1; k <= 8; k++) {
    await page.mouse.move(from.x + (pile.x - from.x) * (k / 8), from.y + (pile.y - from.y) * (k / 8));
    await page.waitForTimeout(16);
  }
  await page.mouse.up();
  await page.waitForFunction(() => {
    const h = (window as any).__severgrow; const st = h.state();
    return st && !h.busy() && st.actor === 0;
  }, undefined, { timeout: 120000 });
}
const picks = (f: string) => rows.filter((r) => r.kind === 'grow' && typeof r[f] === 'number').map((r) => r[f] as number);
const summary: any = { label: LABEL, base: BASE, moves: MOVES, dpr: DPR, throttle: THROTTLE };
for (const f of ['visible', 'fps', 'frames500', 'framesBeforeTap']) {
  const xs = picks(f);
  if (xs.length) summary[f] = { n: xs.length, p50: median(xs), p95: p95(xs), min: Math.min(...xs), max: Math.max(...xs) };
}
mkdirSync(OUT, { recursive: true });
writeFileSync(`${OUT}/${LABEL}.json`, JSON.stringify({ summary, rows }, null, 1));
console.log(JSON.stringify({ summary, rows }, null, 1));
await browser.close();
