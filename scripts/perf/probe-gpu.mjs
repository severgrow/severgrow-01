// Is the menu planet fill-rate bound? Compare DPR2 / DPR1 / no-canvas on the GPU-side trace.
import { launch, newPage, trace, rafCounts, resetPerf } from './lib.mjs';

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
const show = (k, v) => console.log(k.padEnd(20), `gpu ${String(v.t.gpuThreadMs).padStart(5)}ms ${String(Math.round(v.t.gpuPct)).padStart(3)}%  comp ${String(v.t.compositorThreadMs).padStart(5)}ms ${String(Math.round(v.t.compositorPct)).padStart(3)}%  main ${String(Math.round(v.t.mainThreadBusyPct)).padStart(3)}%  drawFrames ${v.t.drawFrames}  raf ${v.raf}`);

await page.goto(BASE + '/', { waitUntil: 'load' });
await ready();
await page.waitForTimeout(2500);
show('base', await measure('gpu-base'));
// Force the planet canvas to DPR 1 (half the linear resolution, a quarter of the pixels).
await page.evaluate(() => {
  const c = document.querySelector('.planet-canvas');
  c.width = Math.round(c.clientWidth);
  c.height = Math.round(c.clientHeight);
});
await page.waitForTimeout(500);
show('canvas@dpr1', await measure('gpu-dpr1'));
// Stop drawing entirely (hide) to isolate the shader's own cost.
await page.evaluate(() => { document.querySelector('.planet-canvas').style.display = 'none'; });
await page.waitForTimeout(300);
show('canvas hidden', await measure('gpu-hidden'));
await page.evaluate(() => { document.querySelector('.planet-canvas').style.display = ''; });
// Reduce motion = no drift loop at all.
await page.evaluate(() => localStorage.setItem('severgrow.settings.v1', JSON.stringify({ reduceMotion: true })));
await page.reload({ waitUntil: 'load' });
await ready();
await page.waitForTimeout(2000);
show('reduce motion', await measure('gpu-reduce'));
await browser.close();
