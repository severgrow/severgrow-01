// End-screen / pause veils: is the work behind the glass gone?
import { launch, newPage, trace, rafCounts, resetPerf } from './lib.mjs';
import { legalActions, viewFor } from '../../src/engine/index.js';

const BASE = 'http://127.0.0.1:4310';
const browser = await launch();
const { page, cdp } = await newPage(browser, { base: BASE });
const ready = () => page.waitForFunction(() => globalThis.__severgrow?.ready?.() === true, undefined, { timeout: 30000 });
const measure = async (label, secs = 6) => {
  await resetPerf(page);
  const raf = await rafCounts(page, 4);
  const tr = await trace(cdp, secs * 1000, label);
  return { t: tr.summary, raf: raf.mean };
};
const show = (k, v) => console.log(k.padEnd(24), `main ${String(Math.round(v.t.mainThreadBusyPct)).padStart(3)}%  gpu ${String(v.t.gpuThreadMs).padStart(5)}ms ${String(Math.round(v.t.gpuPct)).padStart(4)}%  comp ${String(Math.round(v.t.compositorPct)).padStart(3)}%  layout ${String(v.t.layoutCount).padStart(4)}  paint ${String(v.t.paintCount).padStart(4)}  style ${String(Math.round(v.t.styleMs)).padStart(4)}ms  tasks ${v.t.tasks}  raf ${v.raf}`);
const planetFrames = async (ms = 2000) => {
  const a = await page.evaluate(() => globalThis.__severgrow.planet?.()?.frames ?? null);
  await page.waitForTimeout(ms);
  const b = await page.evaluate(() => globalThis.__severgrow.planet?.()?.frames ?? null);
  return a === null ? null : { frames: b - a, perSec: +((b - a) / (ms / 1000)).toFixed(1) };
};

await page.goto(BASE + '/', { waitUntil: 'load' });
await ready();
await page.waitForTimeout(2500);
show('menu', await measure('v3-menu'));
console.log('menu planet fps', JSON.stringify(await planetFrames()));

await page.goto(`${BASE}/?seed=219682080`, { waitUntil: 'load' });
await ready();
await page.waitForFunction(() => { const h = globalThis.__severgrow; return !!h?.state?.() && !h.busy?.(); }, undefined, { timeout: 60000 });
await page.waitForFunction(() => { const r = document.getElementById('starter-lottery'); return !r || r.hidden || !r.getClientRects().length; }, undefined, { timeout: 20000 }).catch(() => {});
await page.waitForTimeout(2000);
show('match idle', await measure('v3-match'));
await page.click('#hud-menu');
await page.waitForSelector('#sheet-menu:not([hidden])');
await page.waitForTimeout(600);
show('match paused', await measure('v3-match-paused'));
console.log('held while paused', await page.evaluate(() => document.documentElement.classList.contains('backdrop-held')));
await page.keyboard.press('Escape');
await page.waitForTimeout(500);
// Play out the match.
const read = () => page.evaluate(() => globalThis.__severgrow.state());
const idle = () => page.waitForFunction(() => { const h = globalThis.__severgrow; return !!h && !!h.state() && !h.busy(); }, undefined, { timeout: 60000 });
for (let i = 0; i < 1200; i++) {
  const s = await read();
  if (s?.phase === 'GAME_OVER') break;
  await idle();
  const now = await read();
  if (!now || now.phase === 'GAME_OVER') break;
  if (now.actor !== 0) { await page.waitForTimeout(50); continue; }
  const legal = legalActions(viewFor(now, 0));
  if (!legal.length) break;
  let ok = false;
  for (const a of legal) if (await page.evaluate(([x]) => globalThis.__severgrow.playFor(x, 0), [a])) { ok = true; break; }
  if (!ok) await page.waitForTimeout(100);
}
await page.waitForSelector('#gameover:not([hidden])', { timeout: 30000 }).catch(() => {});
await page.waitForFunction(() => !globalThis.__severgrow.busy(), undefined, { timeout: 30000 }).catch(() => {});
await page.waitForSelector('#go-world-surface > .planet-canvas[data-planet-ready="true"]', { timeout: 15000 }).catch(() => {});
await page.waitForTimeout(2500);
show('end screen', await measure('v3-end'));
console.log('held on end', await page.evaluate(() => document.documentElement.classList.contains('backdrop-held')));
console.log('end planet frames', JSON.stringify(await page.evaluate(() => globalThis.__goPlanet?.() ?? null)));
await page.waitForTimeout(1500);
console.log('end planet frames later', JSON.stringify(await page.evaluate(() => globalThis.__goPlanet?.() ?? null)));
await page.screenshot({ path: '/tmp/perf-read/v3-end.png' });
await browser.close();
