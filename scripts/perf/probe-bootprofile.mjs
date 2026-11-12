// BOOT PROFILE: where the boot's main-thread milliseconds actually go, by function.
//
// Run: npx tsx scripts/perf/probe-bootprofile.mjs [out.json]
//
// CDP Profiler around the whole boot, aggregated by (url, function). Long-animation-frame gives you
// the SCRIPT that was running; this gives you the line. It is the instrument that stops us from
// "fixing" the chunk that merely happened to be executing when a task started.
import { chromium } from 'playwright-core';
import { writeFileSync } from 'node:fs';

const BASE = process.env.PERF_BASE ?? 'http://127.0.0.1:4310';
const OUT = process.argv[2] ?? '/tmp/perf-bootprofile.json';
const CHROME = process.env.PW_CHROMIUM ?? '/Users/patryk/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const CPU = Number(process.env.PERF_CPU ?? 4);
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: IPHONE_UA,
});
const page = await context.newPage();
const cdp = await context.newCDPSession(page);
if (CPU > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });

await cdp.send('Profiler.enable');
await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
await cdp.send('Profiler.start');
await page.goto(`${BASE}/`, { waitUntil: 'load' });
await page.waitForFunction(() => globalThis.__severgrow?.ready?.() === true, undefined, { timeout: 60000 });
// Keep sampling through the idle work that follows the first paint: that is where the finish-card
// chunk and the lobby's own modules actually execute.
await page.waitForTimeout(2500);
const { profile } = await cdp.send('Profiler.stop');

// Aggregate self time per (script, function name).
const byId = new Map(profile.nodes.map((n) => [n.id, n]));
const self = new Map();
const total = profile.samples.length;
for (let i = 0; i < profile.samples.length; i++) {
  const node = byId.get(profile.samples[i]);
  if (!node) continue;
  const cf = node.callFrame;
  const url = (cf.url || '').replace(BASE, '') || '(inline)';
  const key = `${url.split('/').pop() || url} :: ${cf.functionName || '(anonymous)'}`;
  const dt = profile.timeDeltas?.[i] ?? 0;
  self.set(key, (self.get(key) ?? 0) + dt / 1000);
}
const rows = [...self.entries()].sort((a, b) => b[1] - a[1]);
const totalMs = rows.reduce((n, [, ms]) => n + ms, 0);
writeFileSync(OUT, JSON.stringify({ totalMs, samples: total, rows }, null, 2));
console.log(`profile: ${totalMs.toFixed(0)} ms of samples over ${(totalMs / 1000).toFixed(1)} s wall`);
for (const [k, ms] of rows.slice(0, 28)) console.log(String(Math.round(ms)).padStart(6) + ' ms  ' + k);
await browser.close();
