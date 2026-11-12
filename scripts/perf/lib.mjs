// Measurement library for the Futasaku performance pass.
// Everything here is observation only: it must never change what the page draws.
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const CHROME = process.env.PW_CHROMIUM ?? '/Users/patryk/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
export const TRACE_DIR = process.env.PERF_TRACE_DIR ?? join(tmpdir(), 'futasaku-perf-traces');

export const launch = async ({ headed = process.env.PERF_HEADED === '1' } = {}) => {
  mkdirSync(TRACE_DIR, { recursive: true });
  const browser = await chromium.launch({
    executablePath: CHROME,
    headless: !headed,
    args: [
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--autoplay-policy=no-user-gesture-required',
      '--hide-scrollbars',
      ...(headed ? ['--window-position=-2400,-2400', '--window-size=420,900'] : []),
    ],
  });
  return browser;
};

const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

// The in-page observer. Installed before any app script so nothing is missed.
export const INIT = () => {
  const P = (globalThis.__perf = {
    longTasks: [],
    loaf: [],
    raf: { count: 0, bySecond: {}, stacks: {}, sampleEvery: 250 },
    timers: { count: 0, bySecond: {} },
    marks: {},
  });
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) P.longTasks.push({ start: e.startTime, dur: e.duration, name: e.name });
    }).observe({ type: 'longtask', buffered: true });
  } catch {}
  try {
    // Long Animation Frames give script attribution (sourceURL + duration) for jank.
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        P.loaf.push({
          start: e.startTime,
          dur: e.duration,
          blocking: e.blockingDuration,
          work: e.renderStart ? Math.max(0, e.duration - (e.renderStart - e.startTime)) : e.duration,
          scripts: (e.scripts ?? []).map((s) => ({ src: (s.sourceURL || '').replace(location.origin, ''), inv: s.invoker, dur: s.duration, forced: s.forcedStyleAndLayoutDuration })),
          styles: (e.scripts ?? []).reduce((n, s) => n + (s.forcedStyleAndLayoutDuration || 0), 0),
        });
      }
    }).observe({ type: 'long-animation-frame', buffered: true });
  } catch {}
  const sec = () => Math.floor(performance.now() / 1000);
  const raf = globalThis.requestAnimationFrame.bind(globalThis);
  globalThis.requestAnimationFrame = (cb) => raf((t) => {
    P.raf.count++;
    const s = sec();
    P.raf.bySecond[s] = (P.raf.bySecond[s] ?? 0) + 1;
    if (P.raf.count % P.raf.sampleEvery === 0) {
      const stack = String(new Error().stack || '').split('\n').slice(1, 4).join(' <- ');
      P.raf.stacks[stack] = (P.raf.stacks[stack] ?? 0) + 1;
    }
    cb(t);
  });
  const st = globalThis.setTimeout.bind(globalThis);
  globalThis.setTimeout = (fn, ms, ...rest) => st(() => {
    P.timers.count++;
    const s = sec();
    P.timers.bySecond[s] = (P.timers.bySecond[s] ?? 0) + 1;
    fn(...rest);
  }, ms);
  // Navigation timings we care about (paint etc.) are read through performance.getEntriesByType.
  addEventListener('load', () => { P.loadAt = performance.now(); });
};

export const newPage = async (browser, { width = 390, height = 844, dpr = 3, cpu = 4, mobile = true, cache = false, base } = {}) => {
  const context = await browser.newContext({
    viewport: { width, height },
    screen: { width, height },
    deviceScaleFactor: dpr,
    isMobile: mobile,
    hasTouch: mobile,
    userAgent: IPHONE_UA,
    ignoreHTTPSErrors: true,
  });
  const page = await context.newPage();
  await page.addInitScript(INIT);
  const cdp = await context.newCDPSession(page);
  await cdp.send('Performance.enable');
  await cdp.send('Network.enable');
  if (cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
  await cdp.send('Emulation.setEmulatedMedia', { features: [
    { name: 'prefers-reduced-motion', value: 'no-preference' },
    { name: 'prefers-color-scheme', value: 'dark' },
  ] });
  // Network accounting for this page only.
  const net = { requests: [], bytes: 0 };
  cdp.on('Network.responseReceived', (e) => net.requests.push({ url: e.response.url, type: e.type, status: e.response.status, at: Date.now() }));
  cdp.on('Network.loadingFinished', (e) => { net.bytes += e.encodedDataLength ?? 0; });
  return { context, page, cdp, net };
};

export const getMetrics = async (cdp) => {
  const { metrics } = await cdp.send('Performance.getMetrics');
  return Object.fromEntries(metrics.map((m) => [m.name, m.value]));
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Trace a window and summarise it. Raw trace is written to a file (and deleted after summary).
 * Returns main-thread task stats, frame production and layout/paint counts.
 */
export const trace = async (cdp, ms, label) => {
  const path = null;
  const events = [];
  const onData = (e) => {
    if (Array.isArray(e.value)) events.push(...e.value);
    else if (typeof e.data === 'string') {
      // ReportEvents normally hands over objects; keep a base64 fallback for other Chromiums.
      for (const item of JSON.parse(Buffer.from(e.data, 'base64').toString('utf8'))) events.push(item);
    }
  };
  cdp.on('Tracing.dataCollected', onData);
  const done = new Promise((r) => cdp.once('Tracing.tracingComplete', r));
  await cdp.send('Tracing.start', {
    categories: [
      'devtools.timeline',
      'disabled-by-default-devtools.timeline',
      'disabled-by-default-devtools.timeline.frame',
      'benchmark',
      'blink.animations',
      'cc',
      'gpu',
      'viz',
    ].join(','),
    transferMode: 'ReportEvents',
  });
  await sleep(ms);
  await cdp.send('Tracing.end');
  await done;
  cdp.off('Tracing.dataCollected', onData);
  // DISK IS TIGHT: summarise in memory, never persist the raw trace (these are 50-200 MB each).
  const summary = summariseTrace(events, ms / 1000, label);
  return { summary, path, bytes: events.length };
};

export const summariseTrace = (events, seconds = 10) => {
  // Main thread identification from metadata.
  const threads = new Map();
  for (const e of events) if (e.ph === 'M' && e.name === 'thread_name') threads.set(`${e.pid}:${e.tid}`, e.args.name);
  const main = new Set([...threads].filter(([, n]) => n === 'CrRendererMain').map(([k]) => k));
  const compositor = new Set([...threads].filter(([, n]) => /Compositor|VizCompositor/i.test(n)).map(([k]) => k));
  const gpu = new Set([...threads].filter(([, n]) => /CrGpuMain|GPU Main|VizGpu/i.test(n)).map(([k]) => k));
  let taskSum = 0; const tasks = [];
  let gpuSum = 0, compSum = 0;
  let frames = 0, drawFrames = 0, activateLayerTree = 0; const frameSeqs = new Set();
  let layoutDur = 0, layoutCount = 0, styleDur = 0, styleCount = 0, paintCount = 0, paintDur = 0, compositeCount = 0;
  const byName = new Map();
  for (const e of events) {
    const key = `${e.pid}:${e.tid}`;
    const onMain = main.has(key);
    if (e.ph === 'X' && typeof e.dur === 'number' && gpu.has(key)) gpuSum += e.dur;
    if (e.ph === 'X' && typeof e.dur === 'number' && compositor.has(key)) compSum += e.dur;
    if (e.ph === 'X' && typeof e.dur === 'number' && onMain) {
      const entry = byName.get(e.name) ?? { n: 0, ms: 0 };
      entry.n++; entry.ms += e.dur / 1000;
      byName.set(e.name, entry);
      if (e.name === 'RunTask') { taskSum += e.dur; tasks.push(e.dur); }
      if (e.name === 'Layout') { layoutDur += e.dur; layoutCount++; }
      if (e.name === 'UpdateLayoutTree') { styleDur += e.dur; styleCount++; }
      if (e.name === 'Paint') { paintDur += e.dur; paintCount++; }
    }
    if ((e.name === 'DrawFrame' || e.name === 'ActivateLayerTree') && (onMain || compositor.has(key))) {
      if (e.name === 'DrawFrame') drawFrames++;
      else activateLayerTree++;
    }
    if (e.name === 'BeginFrame' || e.name === 'BeginMainThreadFrame') {
      frames++;
      const seq = e.args?.frameSeq ?? e.args?.data?.frameSeq;
      if (seq !== undefined) frameSeqs.add(seq);
    }
    if (e.name === 'CompositeLayers') compositeCount++;
  }
  tasks.sort((a, b) => a - b);
  const pct = (p) => tasks.length ? tasks[Math.min(tasks.length - 1, Math.floor(tasks.length * p))] / 1000 : 0;
  const top = [...byName.entries()]
    .map(([name, v]) => ({ name, n: v.n, ms: +v.ms.toFixed(1) }))
    .sort((a, b) => b.ms - a.ms)
    .slice(0, 18);
  return {
    seconds,
    mainThreadBusyMs: taskSum / 1000,
    mainThreadBusyPct: (taskSum / 1000) / (seconds * 1000) * 100,
    compositorThreadMs: +(compSum / 1000).toFixed(0),
    compositorPct: +(compSum / 1000) / (seconds * 1000) * 100,
    gpuThreadMs: +(gpuSum / 1000).toFixed(0),
    gpuPct: +(gpuSum / 1000) / (seconds * 1000) * 100,
    tasks: tasks.length,
    tasksPerSecond: tasks.length / seconds,
    over16: tasks.filter((d) => d > 16_700).length,
    over33: tasks.filter((d) => d > 33_000).length,
    over50: tasks.filter((d) => d > 50_000).length,
    meanTaskMs: tasks.length ? taskSum / 1000 / tasks.length : 0,
    p50TaskMs: pct(.5), p95TaskMs: pct(.95), p99TaskMs: pct(.99), maxTaskMs: (tasks.at(-1) ?? 0) / 1000,
    beginFrames: frames, drawFrames, activateLayerTree, frameSeqCount: frameSeqs.size,
    layoutCount, layoutMs: +(layoutDur / 1000).toFixed(2), styleCount, styleMs: +(styleDur / 1000).toFixed(2), paintCount, paintMs: +(paintDur / 1000).toFixed(2), compositeCount,
    top,
  };
};

export const pagePerf = async (page) => page.evaluate(() => {
  const P = globalThis.__perf;
  const nav = performance.getEntriesByType('navigation')[0];
  const paints = Object.fromEntries(performance.getEntriesByType('paint').map((p) => [p.name, p.startTime]));
  const lo = performance.getEntriesByType('largest-contentful-paint').at(-1);
  return {
    longTasks: P.longTasks.slice(),
    loaf: P.loaf.slice(),
    raf: { count: P.raf.count, bySecond: { ...P.raf.bySecond }, stacks: { ...P.raf.stacks }, sampleEvery: P.raf.sampleEvery },
    timers: { count: P.timers.count, bySecond: { ...P.timers.bySecond } },
    nav: nav ? { ttfb: nav.responseStart, domContentLoaded: nav.domContentLoadedEventEnd, load: nav.loadEventEnd, transfer: nav.transferSize, encoded: nav.encodedBodySize, decoded: nav.decodedBodySize } : null,
    paints,
    lcp: lo ? lo.startTime : null,
    now: performance.now(),
    marks: { ...P.marks },
  };
});

export const resetPerf = async (page) => page.evaluate(() => {
  const P = globalThis.__perf;
  P.longTasks.length = 0; P.loaf.length = 0;
  P.raf.bySecond = {}; P.timers.bySecond = {};
});

export const rafCounts = async (page, seconds = 5) => {
  const start = await page.evaluate(() => {
    const P = globalThis.__perf; P.raf.bySecond = {}; P.timers.bySecond = {}; P.raf.stacks = {}; P.raf.count = 0;
    return performance.now();
  });
  await page.waitForTimeout(seconds * 1000);
  return page.evaluate((s) => {
    const P = globalThis.__perf;
    const vals = Object.values(P.raf.bySecond);
    return { rafTotal: P.raf.count, perSecond: vals, mean: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0, stacks: P.raf.stacks, timers: P.timers.count, startedAt: s };
  }, start);
};

export const writeJson = (file, value) => writeFileSync(file, JSON.stringify(value, null, 2));

/**
 * Which DOM node invalidates layout/paint, and why? Chrome's invalidation-tracking categories name
 * the node and the reason, which is the only reliable way to attribute a per-frame repaint.
 */
export const traceInvalidations = async (cdp, ms) => {
  const events = [];
  const onData = (e) => { if (Array.isArray(e.value)) events.push(...e.value); };
  cdp.on('Tracing.dataCollected', onData);
  const done = new Promise((r) => cdp.once('Tracing.tracingComplete', r));
  await cdp.send('Tracing.start', {
    categories: ['devtools.timeline', 'disabled-by-default-devtools.timeline.invalidationTracking'].join(','),
    transferMode: 'ReportEvents',
  });
  await sleep(ms);
  await cdp.send('Tracing.end');
  await done;
  cdp.off('Tracing.dataCollected', onData);
  const reasons = new Map();
  for (const e of events) {
    if (!/InvalidationTracking$/.test(e.name)) continue;
    const d = e.args?.data ?? {};
    const key = `${e.name} | ${d.reason ?? '?'} | ${d.nodeName ?? d.elementName ?? '?'}`;
    reasons.set(key, (reasons.get(key) ?? 0) + 1);
  }
  return [...reasons.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([k, n]) => ({ k, n }));
};
