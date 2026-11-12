// Is the finish card's live backdrop-filter the thing that keeps re-rasterising?
import { launch, newPage, traceInvalidations } from './lib.mjs';
import { legalActions, viewFor } from '../../src/engine/index.js';

const BASE = 'http://127.0.0.1:4310';
const browser = await launch();
const { page, cdp } = await newPage(browser, { base: BASE });
const ready = () => page.waitForFunction(() => globalThis.__severgrow?.ready?.() === true, undefined, { timeout: 30000 });
await page.goto(`${BASE}/?seed=219682080`, { waitUntil: 'load' });
await ready();
await page.waitForFunction(() => { const h = globalThis.__severgrow; return !!h?.state?.() && !h.busy?.(); }, undefined, { timeout: 60000 });
await page.waitForFunction(() => { const r = document.getElementById('starter-lottery'); return !r || r.hidden || !r.getClientRects().length; }, undefined, { timeout: 20000 }).catch(() => {});
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
await page.waitForTimeout(2500);
const summarize = (rows) => JSON.stringify(rows.slice(0, 4));
console.log('base            ', summarize(await traceInvalidations(cdp, 3000)));
// 1. no backdrop-filter on the veil or the card
let un = await page.addStyleTag({ content: '#gameover, #gameover .go-card { -webkit-backdrop-filter: none !important; backdrop-filter: none !important; }' });
await page.waitForTimeout(400);
console.log('no blur         ', summarize(await traceInvalidations(cdp, 3000)));
await un.evaluate((el) => el.remove());
// 2. no pattern fill in the harvest stamp (an SVG resource that must be re-rastered)
un = await page.addStyleTag({ content: '#gameover .go-harvest-svg .hv-hatch path { fill: rgba(255,255,255,.08) !important; }' });
await page.waitForTimeout(400);
console.log('no svg pattern  ', summarize(await traceInvalidations(cdp, 3000)));
await un.evaluate((el) => el.remove());
// 3. the harvest figure hidden entirely
await page.evaluate(() => { const v = document.getElementById('go-verdict'); if (v) v.hidden = true; });
await page.waitForTimeout(300);
console.log('no harvest      ', summarize(await traceInvalidations(cdp, 3000)));
await browser.close();
