// Input→result latency probe for Futasaku: drives REAL pointer gestures (tap a card, tap a hex,
// drag a card onto the Throw pile) and measures the phases from the finger to the visible result.
// Read-only: it never edits the page's source, it only injects a measuring script and reads
// `__severgrow` (state/legal/renderCosts/feel/timing).
import { chromium, webkit } from 'playwright-core';
import type { Page } from 'playwright-core';
import { writeFileSync, mkdirSync } from 'node:fs';

type Sample = Record<string, number | null | string>;

const BASE = process.env.BASE ?? 'https://www.futasaku.com/test/';
const LABEL = process.env.LABEL ?? 'new';
const MOVES = Number(process.env.MOVES ?? 8);
const THROTTLE = Number(process.env.THROTTLE ?? 1);
const DPR = Number(process.env.DPR ?? 2);
const SEED = Number(process.env.SEED ?? 219682080);
const OUT = process.env.OUT ?? '/tmp/latency';
const SETTINGS = process.env.SETTINGS_JSON ?? JSON.stringify({
  sound: false, music: false, speed: 'normal', reduceMotion: false, vibration: true, effects: 'normal',
  confirmPolicy: 'smart', coach: true, autoSkip: false, weakSpots: false, largeText: false,
});

const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)]! : null; };
const p95 = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.ceil(s.length * 0.95) - 1)]! : null; };
const r1 = (n: number | null) => (n === null ? null : Math.round(n * 10) / 10);

const BROWSER = process.env.BROWSER ?? 'chromium';
const PERSIST = process.env.PERSIST === '1';
const ctx = PERSIST
  ? await chromium.launchPersistentContext(`/tmp/latency/profile-${LABEL}`, {
    ...(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}),
    args: ['--no-sandbox'],
    viewport: { width: 390, height: 844 }, deviceScaleFactor: DPR, hasTouch: true, isMobile: true, ignoreHTTPSErrors: true,
  })
  : null;
const browser = ctx ? null : BROWSER === 'webkit'
  ? await webkit.launch({
    ...(process.env.PW_WEBKIT ? { executablePath: process.env.PW_WEBKIT } : {}),
  })
  : await chromium.launch({
    ...(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}),
    args: ['--no-sandbox'],
  });
const page: Page = ctx ? (ctx.pages()[0] ?? await ctx.newPage()) : await browser!.newPage({
  viewport: { width: 390, height: 844 }, deviceScaleFactor: DPR, hasTouch: true,
  ...(BROWSER === 'chromium' ? { isMobile: true } : {}),
  ignoreHTTPSErrors: true,
});
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.addInitScript((settings: string) => {
  (window as any).__name = (f: unknown) => f;
  try {
    for (const k of ['severgrow.settings.v1', 'test:severgrow.settings.v1', 'main2:severgrow.settings.v1', 'live:severgrow.settings.v1', 'futa05:severgrow.settings.v1']) {
      localStorage.setItem(k, settings);
    }
    for (const k of ['severgrow.save.v7', 'test:severgrow.save.v7']) localStorage.removeItem(k);
    sessionStorage.setItem('probe', '1');
  } catch { /* storage may be blocked */ }
}, SETTINGS);

let cdp: any = null;
try {
  cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  if (THROTTLE !== 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });
} catch { cdp = null; }

await page.goto(BASE + '?seed=' + SEED + '&debug=timing');
if (PERSIST) {
  // let the service worker install and take control, then come back like a returning player
  await page.waitForTimeout(4000);
  await page.evaluate(async () => { try { await (navigator as any).serviceWorker?.ready; } catch {} });
  await page.reload();
  await page.waitForFunction(() => (window as any).__severgrow?.state?.(), undefined, { timeout: 60000 });
  await page.waitForTimeout(2500);
}
await page.waitForFunction(() => {
  const h = (window as any).__severgrow;
  return h && h.state && h.state();
}, undefined, { timeout: 60000 });
await page.waitForFunction(() => (window as any).__severgrow.state()?.actor !== undefined, undefined, { timeout: 60000 });
// The Who-starts ritual mounts a little after the module starts (later still on WebKit): wait for it
// to have played and gone, skipping it once with a real tap (the ritual's own skip gesture).
const ritualVisible = () => page.evaluate(() => {
  const o = document.getElementById('starter-lottery') as HTMLElement | null;
  return !!o && !o.hidden;
});
let quiet = 0;
for (let i = 0; i < 80; i++) {
  const up = await ritualVisible();
  if (up) {
    quiet = 0;
    await page.mouse.click(195, 420); // one tap skips the ritual
  } else {
    quiet++;
    if (quiet >= 4) break;
  }
  await page.waitForTimeout(160);
}
// The page settles: nothing pumping, nothing pending, my move.
await page.waitForFunction(() => {
  const h = (window as any).__severgrow; const s = h.state();
  return !!s && !h.busy() && !h.pending();
}, undefined, { timeout: 60000 });

const st = () => page.evaluate(() => {
  const s = (window as any).__severgrow.state();
  return s ? { phase: s.phase, actor: s.actor, turnPlayer: s.turnPlayer, turnNumber: s.turnNumber } : null;
});
let stepName = 'boot';
const note = (s: string) => { stepName = s; };

/** Wait for the gate to open (no pump, nothing pending). */
const settle = async () => {
  note('settle');
  await page.waitForFunction(() => {
    const h = (window as any).__severgrow;
    const s = h.state();
    return !!s && !h.busy() && !h.pending();
  }, undefined, { timeout: 90000 });
};
/** Wait until it is my turn and nothing is animating. */
const settleMine = async () => {
  await settle();
  await page.waitForFunction(() => {
    const h = (window as any).__severgrow;
    const s = h.state();
    return !!s && !h.busy() && s.actor === 0;
  }, undefined, { timeout: 120000 });
};

const handIds = () => page.evaluate(() => [...document.querySelectorAll<HTMLElement>('#hand [data-card]')].map((e) => Number(e.dataset.card)));
const rectOf = (sel: string) => page.evaluate((s) => {
  const el = document.querySelector<HTMLElement | SVGElement>(s);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height, hit: document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)?.tagName ?? null };
}, sel);

/** Arm the in-page probe for a hex key: input, state, DOM and first painted frame. */
const armHex = (key: string) => page.evaluate((k) => {
  const w = window as any;
  w.__p = null;
  const s0 = w.__severgrow.state();
  const owned = (s: any) => { let n = 0, sum = 0; const b = s.board; for (const q in b) { const t = b[q]; if (t && t.owner === 0) { n++; sum += t.strength; } } return n + ':' + sum; };
  const p: any = { key: k, input: null, stateAt: null, domAt: null, paintAt: null, frames: [], longtasks: [], d0: owned(s0) };
  w.__p = p;
  const hasTile = () => !!document.querySelector('#board g.tile[data-key="' + CSS.escape(k) + '"]');
  p.hasTile0 = hasTile();
  w.addEventListener('pointerdown', () => { if (p.input === null) p.input = performance.now(); }, { capture: true, once: true });
  // state: poll every task turn (setTimeout 0 is clamped to ~1ms; good enough and identical on both)
  const poll = () => {
    if (p.stateAt === null) {
      const s = w.__severgrow.state();
      if (s && owned(s) !== p.d0) p.stateAt = performance.now();
      else setTimeout(poll, 0);
    }
  };
  setTimeout(poll, 0);
  // DOM: the grown tile exists (fresh node) — the board writes it inside the same task as the state
  const mo = new MutationObserver(() => {
    if (p.domAt === null && p.input !== null && hasTile() && !p.hasTile0) p.domAt = performance.now();
  });
  mo.observe(document.getElementById('board')!, { childList: true, subtree: true, attributes: true, characterData: true });
  p.mo = mo;
  // frames
  const raf = (t: number) => { if (p.paintAt !== null && p.frames.length > 200) return; p.frames.push(t); if (p.input === null || p.paintAt === null) requestAnimationFrame(raf); };
  requestAnimationFrame(raf);
  // long tasks
  try {
    const lo = new PerformanceObserver((list) => { for (const e of list.getEntries()) p.longtasks.push(Math.round(e.duration)); });
    lo.observe({ type: 'longtask', buffered: false });
    p.lo = lo;
  } catch { /* no longtask */ }
}, key);

const readHex = (key: string) => page.evaluate((k) => {
  const w = window as any;
  const p = w.__p;
  if (!p) return null;
  const input = p.input, stateAt = p.stateAt, domAt = p.domAt;
  // the first frame that starts after the DOM was written paints it (that frame's end)
  let paintAt: number | null = null;
  if (domAt !== null) paintAt = p.frames.find((t: number) => t > domAt) ?? null;
  const after = p.frames.filter((t: number) => input !== null && t > input);
  const gaps: number[] = [];
  for (let i = 1; i < after.length; i++) gaps.push(after[i] - after[i - 1]);
  p.mo?.disconnect(); p.lo?.disconnect();
  return {
    input, stateAt, domAt, paintAt,
    framesAfterInput: after.length,
    maxGap: gaps.length ? Math.max(...gaps) : null,
    longtaskCount: p.longtasks.length, longtaskTotal: p.longtasks.reduce((a: number, b: number) => a + b, 0), longtaskMax: p.longtasks.length ? Math.max(...p.longtasks) : 0,
  };
}, key);

/** Arm the window that starts at the Throw drag's release and ends when the bot's turn is visible. */
const armBot = () => page.evaluate(() => {
  const w = window as any;
  const p: any = { input: null, stateAt: null, botDomAt: null, pillAt: null, myAgainAt: null, frames: [], longtasks: [], dPhase: null };
  w.__b = p;
  const s0 = w.__severgrow.state();
  p.d0 = s0.phase + ':' + s0.actor + ':' + s0.turnNumber;
  document.addEventListener('pointerup', () => { if (p.input === null) p.input = performance.now(); }, { capture: true, once: true });
  const digest = () => { const s = w.__severgrow.state(); return s.phase + ':' + s.actor + ':' + s.turnNumber; };
  const poll = () => {
    if (p.stateAt === null) { if (w.__severgrow.state() && digest() !== p.d0) p.stateAt = performance.now(); }
    if (p.myAgainAt === null) { const s = w.__severgrow.state(); if (s && s.actor === 0 && p.input !== null) p.myAgainAt = performance.now(); }
    if (p.stateAt === null || p.myAgainAt === null) setTimeout(poll, 0);
  };
  setTimeout(poll, 0);
  const pill = document.getElementById('turn-pill');
  const pillText = () => (pill?.textContent ?? '').trim();
  p.pill0 = pillText();
  const mo = new MutationObserver(() => {
    if (p.input === null) return;
    if (p.botDomAt === null) p.botDomAt = performance.now();
    const t = pillText();
    if (p.pillAt === null && t !== p.pill0 && /opponent|their|bot/i.test(t)) p.pillAt = performance.now();
  });
  mo.observe(document.getElementById('board')!, { childList: true, subtree: true, attributes: true, characterData: true });
  const mo2 = new MutationObserver(() => {
    if (p.input === null) return;
    if (p.pillAt === null) p.pillAt = performance.now();
  });
  if (pill) mo2.observe(pill, { childList: true, subtree: true, attributes: true, characterData: true });
  p.mo = mo; p.mo2 = mo2;
  const raf = (t: number) => { p.frames.push(t); requestAnimationFrame(raf); };
  requestAnimationFrame(raf);
  try { const lo = new PerformanceObserver((list) => { for (const e of list.getEntries()) p.longtasks.push(Math.round(e.duration)); }); lo.observe({ type: 'longtask' }); p.lo = lo; } catch {}
});

const readBot = () => page.evaluate(() => {
  const p = (window as any).__b;
  if (!p) return null;
  const after = p.frames.filter((t: number) => p.input !== null && t > p.input);
  const gaps: number[] = [];
  for (let i = 1; i < after.length; i++) gaps.push(after[i] - after[i - 1]);
  p.mo?.disconnect(); p.mo2?.disconnect(); p.lo?.disconnect();
  return {
    input: p.input, stateAt: p.stateAt, botDomAt: p.botDomAt, pillAt: p.pillAt, myAgainAt: p.myAgainAt,
    framesAfterInput: after.length, maxGap: gaps.length ? Math.max(...gaps) : null,
    longtaskCount: p.longtasks.length, longtaskTotal: p.longtasks.reduce((a: number, b: number) => a + b, 0), longtaskMax: p.longtasks.length ? Math.max(...p.longtasks) : 0,
    pill0: p.pill0,
  };
});

const metrics = async () => {
  if (!cdp) return {};
  const res = await cdp.send('Performance.getMetrics') as unknown as { metrics: { name: string; value: number }[] };
  const m: Record<string, number> = {};
  for (const e of res.metrics) m[e.name] = e.value;
  return m;
};
const metricDelta = (a: Record<string, number>, b: Record<string, number>) => {
  const keys = ['ScriptDuration', 'RecalcStyleDuration', 'LayoutDuration', 'LayoutCount', 'RecalcStyleCount', 'TaskDuration', 'JSHeapUsedSize', 'Nodes'];
  const out: Record<string, number> = {};
  for (const k of keys) out[k] = Math.round(((b[k] ?? 0) - (a[k] ?? 0)) * 1000) / 1000;
  return out;
};
const timingMarks = () => page.evaluate(() => [...((window as any).__severgrow.timing() as any[])]);
const clearMarks = () => page.evaluate(() => { (window as any).__severgrow.clearTiming(); (window as any).__severgrow.clearRenderCosts(); });

const rows: Sample[] = [];

/** Tap a hand card by id (real pointer press/release on its own centre). */
const tapCard = async (id: number) => {
  const r = await rectOf(`#hand [data-card="${id}"]`);
  if (!r) throw new Error('no card ' + id);
  await page.mouse.click(r.x, r.y);
  await page.waitForTimeout(60);
};

/** Pick a card + a legal empty-hex Sprout target, then tap the hex with the probe armed. */
const measureGrow = async (i: number) => {
  await settleMine();
  note('grow:after-settle-mine');
  // the Draw step
  const s = await st();
  if (!s) throw new Error('no state');
  if (s.phase === 'DRAW') {
    const d = await rectOf('#deck');
    if (!d) throw new Error('no deck');
    await page.mouse.click(d.x, d.y);
    await page.waitForFunction(() => {
      const h = (window as any).__severgrow; const s = h.state();
      return s && !h.busy() && s.phase !== 'DRAW' && s.actor === 0;
    }, undefined, { timeout: 60000 });
    await page.waitForTimeout(80);
    note('grow:after-draw');
  }
  // choose a card that can sprout onto an EMPTY hex
  let target: { card: number; key: string } | null = null;
  for (const id of await handIds()) {
    await tapCard(id);
    target = await page.evaluate(() => {
      const w = (window as any);
      const legal = w.__severgrow.legal() as any[];
      const keyOf = (c: any) => c.q + ',' + c.r;
      for (const a of legal) {
        if (a.t !== 'Sprout') continue;
        const k = keyOf(a.coord);
        if (!document.querySelector('#board g.tile[data-key="' + CSS.escape(k) + '"]') && document.querySelector('#board g.hex-cell[data-key="' + CSS.escape(k) + '"]')) return { key: k };
      }
      return null;
    }).then((t) => (t ? { card: id, key: (t as any).key } : null));
    if (target) break;
    await tapCard(id); // deselect
  }
  if (!target) throw new Error('no sprout target in hand');
  note('grow:card-picked');
  const cell = await rectOf(`#board g.hex-cell[data-key="${target.key}"] path`);
  if (!cell) throw new Error('no cell ' + target.key);
  await clearMarks();
  const m0 = await metrics();
  await armHex(target.key);
  // real press/release on the hex centre (the cell binds pointerup)
  await page.mouse.move(cell.x, cell.y);
  await page.mouse.down();
  await page.mouse.up();
  await page.waitForTimeout(50);
  note('grow:tapped');
  const h = await readHex(target.key);
  await page.waitForFunction(() => {
    const h2 = (window as any).__severgrow; const s = h2.state();
    return s && !h2.busy() && (s.phase === 'DISCARD' || (s.actor === 0 && s.turnNumber !== undefined));
  }, undefined, { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(150);
  const m1 = await metrics();
  const marks = await timingMarks();
  const costs = await page.evaluate(() => (window as any).__severgrow.renderCosts());
  rows.push({
    kind: 'grow', i, key: target.key,
    input: r1(h?.input), stateAt: r1(h?.stateAt ? h!.stateAt - h!.input! : null),
    domAt: r1(h?.domAt && h.input ? h.domAt - h.input : null),
    paintAt: r1(h?.paintAt && h.input ? h.paintAt - h.input : null),
    frames: h ? h.framesAfterInput : null, maxGap: h ? r1(h.maxGap) : null,
    lt: h ? h.longtaskCount : null, ltMs: h ? h.longtaskTotal : null, ltMax: h ? r1(h.longtaskMax) : null,
    ...Object.fromEntries(Object.entries(metricDelta(m0, m1)).map(([k, v]) => ['m_' + k, v])),
    full: costs.length ? r1(costs.at(-1).ms) : null,
    marks: marks.map((m: any) => m.ev).join(','),
    gateArm: r1(h?.input ? (marks.find((m: any) => m.ev === 'gate:arm')?.t ?? null) - h.input : null),
    tile: r1(h?.input ? (marks.find((m: any) => m.ev === 'tile')?.t ?? null) - h.input : null),
    replayEnd: r1(h?.input ? (marks.find((m: any) => m.ev === 'replay:end')?.t ?? null) - h.input : null),
  });
  // back to the Throw step
};

/** Drag a card onto the Throw pile; measure the bot's start. */
const measureThrow = async (i: number) => {
  const s = await st();
  if (!s) throw new Error('no state');
  note('throw:phase-' + s.phase);
  if (s.phase !== 'DISCARD') {
    // an empty grow step may need the auto-skip: tap the deck-less continue if present
    rows.push({ kind: 'throw-skipped', i, phase: s.phase });
    return;
  }
  const ids = await handIds();
  const r = await rectOf(`#hand [data-card="${ids[0]}"]`);
  const pile = await rectOf('#discard');
  if (!r || !pile) throw new Error('no card or pile');
  await clearMarks();
  const m0 = await metrics();
  await armBot();
  await page.mouse.move(r.x, r.y);
  await page.mouse.down();
  for (let k = 1; k <= 8; k++) {
    await page.mouse.move(r.x + (pile.x - r.x) * (k / 8), r.y + (pile.y - r.y) * (k / 8));
    await page.waitForTimeout(16);
  }
  await page.mouse.up();
  // wait for the bot's turn to be over and my turn back
  await page.waitForFunction(() => {
    const h = (window as any).__severgrow;
    const s = h.state();
    return s && !h.busy() && s.actor === 0;
  }, undefined, { timeout: 120000 });
  await page.waitForTimeout(150);
  const b = await readBot();
  const m1 = await metrics();
  const marks = (await timingMarks()) as any[];
  const input = b?.input ?? null;
  const replayEndT = marks.find((m) => m.ev === 'replay:end')?.t ?? null;
  const botFirst = replayEndT === null ? null : marks.find((m) => m.ev === 'tile' && m.t > replayEndT)?.t ?? null;
  rows.push({
    kind: 'throw', i,
    stateAt: r1(b?.stateAt && input ? b.stateAt - input : null),
    botDom: r1(b?.botDomAt && input ? b.botDomAt - input : null),
    pill: r1(b?.pillAt && input ? b.pillAt - input : null),
    myAgain: r1(b?.myAgainAt && input ? b.myAgainAt - input : null),
    replayEnd: r1(replayEndT !== null && input ? replayEndT - input : null),
    botFirst: r1(botFirst !== null && input ? botFirst! - input : null),
    idleGap: r1(replayEndT !== null && botFirst !== null ? botFirst! - replayEndT : null),
    maxGap: b ? r1(b.maxGap) : null,
    lt: b ? b.longtaskCount : null, ltMs: b ? b.longtaskTotal : null, ltMax: b ? r1(b.longtaskMax) : null,
    ...Object.fromEntries(Object.entries(metricDelta(m0, m1)).map(([k, v]) => ['m_' + k, v])),
    marks: marks.map((m) => m.ev).join(','),
  });
};

let done = 0;
try {
  for (let i = 0; i < MOVES; i++) {
    await measureGrow(i);
    await measureThrow(i);
    done = i + 1;
  }
} catch (e) {
  rows.push({ kind: 'error', i: done, msg: stepName + ': ' + String((e as Error).message).slice(0, 300) });
}

const num = (kind: string, field: string) => rows.filter((r) => r.kind === kind && typeof r[field] === 'number').map((r) => r[field] as number);
const summary: Record<string, unknown> = { label: LABEL, base: BASE, moves: MOVES, throttle: THROTTLE, dpr: DPR, errors, done };
for (const kind of ['grow', 'throw']) {
  const acc: Record<string, unknown> = {};
  for (const f of ['stateAt', 'domAt', 'paintAt', 'botDom', 'pill', 'myAgain', 'botFirst', 'idleGap', 'maxGap', 'ltMs', 'ltMax', 'm_ScriptDuration', 'm_RecalcStyleDuration', 'm_LayoutDuration', 'm_LayoutCount', 'm_RecalcStyleCount', 'm_TaskDuration', 'm_Nodes', 'full', 'gateArm', 'tile', 'replayEnd', 'frames']) {
    const xs = num(kind, f);
    if (xs.length) acc[f] = { n: xs.length, p50: r1(median(xs)), p95: r1(p95(xs)), min: r1(Math.min(...xs)), max: r1(Math.max(...xs)) };
  }
  summary[kind] = acc;
}
mkdirSync(OUT, { recursive: true });
writeFileSync(`${OUT}/${LABEL}-${THROTTLE}x.json`, JSON.stringify({ summary, rows }, null, 1));
console.log(JSON.stringify({ summary, rows }, null, 1));
await (ctx ? ctx.close() : browser!.close());
