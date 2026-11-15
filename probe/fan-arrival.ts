// How long after the match appears does the hand reach its fan (WebKit, iPhone DPR)?
import { webkit } from 'playwright-core';

const BASE = process.env.BASE!;
const DPR = Number(process.env.DPR ?? 3);
const browser = await webkit.launch({ ...(process.env.PW_WEBKIT ? { executablePath: process.env.PW_WEBKIT } : {}) });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: DPR, hasTouch: true, ignoreHTTPSErrors: true });
await page.addInitScript(() => { (window as any).__name = (f: unknown) => f; });
await page.goto(BASE + '?seed=219682080');
await page.waitForFunction(() => (window as any).__severgrow?.state?.(), undefined, { timeout: 90000 });
const t0 = Date.now();
let gone = 0;
for (let i = 0; i < 200; i++) {
  const up = await page.evaluate(() => { const o = document.getElementById('starter-lottery') as HTMLElement | null; return !!o && !o.hidden; });
  if (up) { gone = 0; await page.mouse.click(195, 300); } else { gone++; if (gone >= 4) break; }
  await page.waitForTimeout(120);
}
const ritualGone = Date.now() - t0;
const rects = () => page.evaluate(() => [...document.querySelectorAll<HTMLElement>('#hand [data-card]')].map((c) => Math.round(c.getBoundingClientRect().left)));
let fanAt: number | null = null;
const samples: string[] = [];
for (let i = 0; i < 40; i++) {
  const lefts = await rects();
  const spread = lefts.length > 1 && new Set(lefts).size >= Math.min(4, lefts.length);
  if (i < 12) samples.push(lefts.join('/'));
  if (spread && fanAt === null) fanAt = Date.now() - t0;
  if (fanAt !== null && i > 2) break;
  await page.waitForTimeout(100);
}
// the deck's own centre: is it the deck, or a card on top of it?
const hit = await page.evaluate(() => {
  const r = document.getElementById('deck')!.getBoundingClientRect();
  const chain: string[] = [];
  let el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) as HTMLElement | null;
  while (el && chain.length < 5) { chain.push((el.id || el.className?.toString() || el.tagName).slice(0, 24)); el = el.parentElement; }
  return chain;
});
console.log(JSON.stringify({ base: BASE, ritualGone, fanAt, hit, samples: samples.slice(0, 8) }));
await browser.close();
