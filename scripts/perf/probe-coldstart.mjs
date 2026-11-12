// COLD START / FIRST BEAT probe. Observation only: it never changes what the page draws.
//
// Run:  npx tsx scripts/perf/probe-coldstart.mjs [out.json]
// Needs: a product build in web/dist and a static server (scripts/perf/serve.mjs) on PERF_BASE.
//
// Reports, per run: navigation timeline (TTFB → first paint → logo decoded → menu interactive →
// first match playable), the ACTUAL transferred bytes and every request with its initiator, the boot
// long tasks with LoAF attribution, font decode order, and how many images were decoded eagerly.
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';

const BASE = process.env.PERF_BASE ?? 'http://127.0.0.1:4310';
const OUT = process.argv[2] ?? '/tmp/perf-coldstart.json';
const CHROME = process.env.PW_CHROMIUM ?? '/Users/patryk/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const CPU = Number(process.env.PERF_CPU ?? 4);
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

/** Installed before any app script: timestamps every beat the page can observe itself. */
const INIT = () => {
  const C = (globalThis.__cold = {
    t0: performance.now(),
    longTasks: [],
    loaf: [],
    fonts: [],
    marks: {},
    errors: [],
  });
  const mark = (name, extra) => { C.marks[name] = { at: +(performance.now()).toFixed(1), ...(extra ?? {}) }; };
  C.mark = mark;
  try {
    new PerformanceObserver((l) => { for (const e of l.getEntries()) C.longTasks.push({ start: +e.startTime.toFixed(1), dur: +e.duration.toFixed(1) }); })
      .observe({ type: 'longtask', buffered: true });
  } catch {}
  try {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) C.loaf.push({
        start: +e.startTime.toFixed(1), dur: +e.duration.toFixed(1), blocking: +(e.blockingDuration ?? 0).toFixed(1),
        scripts: (e.scripts ?? []).map((s) => ({ src: String(s.sourceURL || '').split('/').pop(), inv: s.invoker, dur: +s.duration.toFixed(1), forced: +(s.forcedStyleAndLayoutDuration ?? 0).toFixed(1) })),
      });
    }).observe({ type: 'long-animation-frame', buffered: true });
  } catch {}
  try {
    new PerformanceObserver((l) => { for (const e of l.getEntries()) if (e.name === 'largest-contentful-paint') mark('lcp', { at: +e.startTime.toFixed(1) }); })
      .observe({ type: 'largest-contentful-paint', buffered: true });
  } catch {}
  try {
    new PerformanceObserver((l) => { for (const e of l.getEntries()) if (e.name === 'first-paint') mark('firstPaint', { at: +e.startTime.toFixed(1) }); })
      .observe({ type: 'paint', buffered: true });
  } catch {}
  try {
    new PerformanceObserver((l) => { for (const e of l.getEntries()) if (e.name === 'first-contentful-paint') mark('fcp', { at: +e.startTime.toFixed(1) }); })
      .observe({ type: 'paint', buffered: true });
  } catch {}
  // Font decode order: which face finishes when.
  if (document.fonts) document.fonts.addEventListener('loadingdone', () => {
    C.fonts = [...document.fonts].map((f) => ({ family: f.family, status: f.status }));
  });
  // THE CANONICAL FIRST-REVEAL BEAT. startup.ts dispatches it when the menu is composed (fonts +
  // the menu's planet painted) and the boot cover lifts; planet-painted is the planet's own frame.
  // Watching the event is exact, where polling a rect can miss the moment.
  addEventListener('futasaku:startup-visible', () => mark('startupVisible'), { once: true });
  addEventListener('futasaku:planet-painted', () => mark('planetPainted'), { once: true });
  // Bytes that were still to come when the menu appeared: the number that says how much of the
  // transfer the player actually waited for.
  addEventListener('futasaku:startup-visible', () => {
    try { C.marks.bytesAtReveal = performance.getEntriesByType('resource').reduce((n, r) => n + (r.encodedBodySize || 0), 0); } catch { C.marks.bytesAtReveal = null; }
  }, { once: true });
  let frames = 0;
  const watch = () => {
    frames++;
    const logo = document.querySelector('#logo img, #logo svg');
    if (!C.marks.logoDecoded && logo) {
      const img = logo.tagName === 'IMG' ? logo : null;
      const ready = img ? (img.complete && img.naturalWidth > 0) : logo.getBBox !== undefined;
      if (ready) mark('logoDecoded');
    }
    if (!C.marks.logoOnScreen && logo) {
      const r = logo.getBoundingClientRect();
      const cover = document.getElementById('boot-cover');
      const covered = !!cover && !cover.hidden && getComputedStyle(cover).opacity !== '0';
      if (r.width > 1 && r.height > 1 && !covered) mark('logoOnScreen', { w: Math.round(r.width), h: Math.round(r.height) });
    }
    if (!C.marks.menuInteractive) {
      const play = document.getElementById('menu-play');
      const r = play?.getBoundingClientRect();
      if (r && r.width > 1 && r.height > 1 && !play.hidden) mark('menuInteractive');
    }
    if (!C.marks.appReady && globalThis.__severgrow?.ready?.()) mark('appReady');
    if (frames < 900) requestAnimationFrame(watch);
  };
  requestAnimationFrame(watch);
};

const browser = await chromium.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox', '--hide-scrollbars'],
});

const run = async ({ label, standalone = false, bypassCache = false, play = false }) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    screen: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    userAgent: IPHONE_UA,
  });
  const page = await context.newPage();
  await page.addInitScript(INIT);
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Performance.enable');
  if (CPU > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });
  await cdp.send('Emulation.setEmulatedMedia', {
    features: [
      { name: 'prefers-reduced-motion', value: 'no-preference' },
      { name: 'prefers-color-scheme', value: 'dark' },
      ...(standalone ? [{ name: 'display-mode', value: 'standalone' }] : []),
    ],
  });
  if (bypassCache) await page.setExtraHTTPHeaders({ 'cache-control': 'no-cache' });
  // A phone is not localhost. PERF_NET=4g models a good mobile link (9 Mbps / 85 ms RTT), PERF_NET=3g a
  // poor one (1.6 Mbps / 150 ms). Only used for questions about BYTES on the critical path; the CPU
  // throttle is the comparison basis everywhere else.
  const net = process.env.PERF_NET;
  if (net) {
    // 4g = a good mobile link; 3g = a poor one; fast = home wifi / 5G (the owner's own case).
    const mbit = net === '3g' ? 1.6 : net === 'fast' ? 30 : 9;
    const latency = net === '3g' ? 150 : net === 'fast' ? 40 : 85;
    const profile = { offline: false, latency, downloadThroughput: (mbit * 1024 * 1024) / 8, uploadThroughput: (1.5 * 1024 * 1024) / 8 };
    await cdp.send('Network.emulateNetworkConditions', profile);
  }

  const reqs = [];
  cdp.on('Network.requestWillBeSent', (e) => {
    if (!reqs.some((r) => r.id === e.requestId)) reqs.push({ id: e.requestId, url: e.request.url, type: e.type, at: Date.now(), size: 0, fromCache: false });
  });
  cdp.on('Network.responseReceived', (e) => {
    const r = reqs.find((x) => x.id === e.requestId);
    if (r) { r.status = e.response.status; r.mime = e.response.mimeType; r.fromCache = e.response.fromDiskCache || e.response.fromServiceWorker; }
  });
  cdp.on('Network.loadingFinished', (e) => {
    const r = reqs.find((x) => x.id === e.requestId);
    if (r) r.size = e.encodedDataLength ?? 0;
  });

  const t0 = Date.now();
  await page.goto(`${BASE}/?cold=${Math.random().toString(36).slice(2)}`, { waitUntil: 'domcontentloaded' });
  const dcl = Date.now() - t0;
  await page.waitForFunction(() => globalThis.__severgrow?.ready?.() === true, undefined, { timeout: 60000 });
  const ready = Date.now() - t0;
  await page.waitForTimeout(1800);

  const observed = await page.evaluate(() => ({
    marks: globalThis.__cold.marks,
    longTasks: globalThis.__cold.longTasks,
    loaf: globalThis.__cold.loaf,
    fonts: globalThis.__cold.fonts,
    displayMode: matchMedia('(display-mode: standalone)').matches ? 'standalone' : 'browser',
    nav: (() => {
      const n = performance.getEntriesByType('navigation')[0];
      return n ? {
        ttfb: +(n.responseStart).toFixed(1), dcl: +(n.domContentLoadedEventEnd).toFixed(1), load: +(n.loadEventEnd || n.responseEnd).toFixed(1),
        transfer: n.transferSize, encoded: n.encodedBodySize, decoded: n.decodedBodySize,
      } : null;
    })(),
    resources: performance.getEntriesByType('resource').map((r) => ({
      name: r.name.replace(location.origin, ''), type: r.initiatorType, bytes: r.encodedBodySize, transfer: r.transferSize,
      start: +r.startTime.toFixed(1), end: +r.responseEnd.toFixed(1), decoded: r.decodedBodySize,
    })).sort((a, b) => a.start - b.start),
    images: [...document.images].map((i) => ({ src: i.currentSrc.replace(location.origin, ''), complete: i.complete, natural: `${i.naturalWidth}x${i.naturalHeight}`, loading: i.loading, decoding: i.decoding, inViewport: !!i.getClientRects().length })),
    fontFaces: [...document.fonts].map((f) => ({ family: f.family, weight: f.weight, status: f.status })),
    boot: {
      coverHidden: document.getElementById('boot-cover')?.hidden ?? null,
      coverOpacity: document.getElementById('boot-cover') ? getComputedStyle(document.getElementById('boot-cover')).opacity : null,
    },
  }));

  let match = null;
  if (play) {
    const tb = Date.now();
    await page.click('#menu-play').catch(() => {});
    await page.waitForSelector('#play-menu:not([hidden])', { timeout: 15000 }).catch(() => {});
    const playMenu = Date.now() - tb;
    await page.click('#menu-campaign').catch(() => {});
    const first = await page.waitForFunction(() => {
      const h = globalThis.__severgrow;
      return !!h?.state?.() && !h.busy?.();
    }, undefined, { timeout: 60000 }).then(() => Date.now() - tb).catch(() => null);
    // The first animation after load: one draw tap, traced for long tasks it causes.
    const before = await page.evaluate(() => globalThis.__cold.longTasks.length);
    await page.click('#deck').catch(() => {});
    await page.waitForFunction(() => !globalThis.__severgrow.busy?.(), undefined, { timeout: 30000 }).catch(() => {});
    const after = await page.evaluate(() => globalThis.__cold.longTasks.slice());
    match = { playMenu, firstPlayable: first, afterFirstTapLongTasks: after.slice(before) };
  }

  const totalBytes = reqs.reduce((n, r) => n + r.size, 0);
  const out = {
    label, dcl, ready, totalBytes, requestCount: reqs.length,
    observed,
    requests: reqs.map((r) => ({ url: r.url.replace(BASE, ''), type: r.type, size: r.size, status: r.status, fromCache: r.fromCache })).sort((a, b) => b.size - a.size),
    match,
  };
  await context.close();
  return out;
};

const results = {};
results.cold = await run({ label: 'cold browser', bypassCache: true });
results.warm = await run({ label: 'warm browser' });
results.standalone = await run({ label: 'standalone cold', standalone: true, bypassCache: true });
results.firstMatch = await run({ label: 'cold → first match', bypassCache: true, play: true });

mkdirSync('/tmp/perf-out', { recursive: true });
writeFileSync(OUT, JSON.stringify(results, null, 2));

const short = (r) => ({
  bytes: r.totalBytes, requests: r.requestCount,
  ttfb: r.observed.nav?.ttfb, dcl: r.dcl, ready: r.ready,
  firstPaint: r.observed.marks.firstPaint?.at, fcp: r.observed.marks.fcp?.at, lcp: r.observed.marks.lcp?.at,
  logoDecoded: r.observed.marks.logoDecoded?.at, logoOnScreen: r.observed.marks.logoOnScreen?.at,
  planetPainted: r.observed.marks.planetPainted?.at, startupVisible: r.observed.marks.startupVisible?.at,
  bytesAtReveal: r.observed.marks.bytesAtReveal,
  menuInteractive: r.observed.marks.menuInteractive?.at,
  longTasks: r.observed.longTasks.length,
  longTaskMs: Math.round(r.observed.longTasks.reduce((n, t) => n + t.dur, 0)),
  worst: r.observed.longTasks.slice().sort((a, b) => b.dur - a.dur).slice(0, 4),
  match: r.match,
});
for (const [k, v] of Object.entries(results)) console.log(k.padEnd(20), JSON.stringify(short(v)));
console.log('\ntop requests (cold):');
for (const r of results.cold.requests.slice(0, 18)) console.log(String(r.size).padStart(8), r.type.padEnd(10), r.url.slice(0, 90));
await browser.close();
