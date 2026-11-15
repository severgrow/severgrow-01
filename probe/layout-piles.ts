// Where the piles and the hand really are, and what a tap on a pile actually hits.
import { chromium, webkit } from 'playwright-core';

const BASE = process.env.BASE ?? 'https://www.futasaku.com/test/';
const BROWSER = process.env.BROWSER ?? 'chromium';
const DPR = Number(process.env.DPR ?? 2);
const W = Number(process.env.W ?? 390);
const H = Number(process.env.H ?? 844);
const browser = BROWSER === 'webkit'
  ? await webkit.launch({ ...(process.env.PW_WEBKIT ? { executablePath: process.env.PW_WEBKIT } : {}) })
  : await chromium.launch({ ...(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}), args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: DPR, hasTouch: true, ...(BROWSER === 'chromium' ? { isMobile: true } : {}), ignoreHTTPSErrors: true });
await page.addInitScript(() => { (window as any).__name = (f: unknown) => f; });
await page.goto(BASE + '?seed=219682080');
await page.waitForFunction(() => (window as any).__severgrow?.state?.(), undefined, { timeout: 90000 });
let gone = 0;
for (let i = 0; i < 200; i++) {
  const up = await page.evaluate(() => { const o = document.getElementById('starter-lottery') as HTMLElement | null; return !!o && !o.hidden; });
  if (up) { gone = 0; await page.mouse.click(W / 2, 300); } else { gone++; if (gone >= 8) break; }
  await page.waitForTimeout(150);
}
await page.waitForTimeout(600);
const out = await page.evaluate(() => {
  const R = (el: Element | null) => { if (!el) return null; const r = el.getBoundingClientRect(); return { l: Math.round(r.left), t: Math.round(r.top), r: Math.round(r.right), b: Math.round(r.bottom), w: Math.round(r.width), h: Math.round(r.height) }; };
  const chainAt = (x: number, y: number) => { const c: string[] = []; let el = document.elementFromPoint(x, y) as HTMLElement | null; while (el && c.length < 7) { c.push(el.id || (el.className?.toString ? el.className.toString().slice(0, 30) : el.tagName)); el = el.parentElement; } return c; };
  const deck = document.getElementById('deck')!;
  const disc = document.getElementById('discard')!;
  const dr = deck.getBoundingClientRect(), sr = disc.getBoundingClientRect();
  const cards = [...document.querySelectorAll<HTMLElement>('#hand [data-card]')].map((c) => ({ id: c.dataset.card, ...R(c)!, lift: getComputedStyle(c).getPropertyValue('--lift').trim(), ml: getComputedStyle(c).marginLeft }));
  return {
    deck: R(deck), discard: R(disc), piles: R(document.querySelector('.piles')), hand: R(document.getElementById('hand')), handRow: R(document.querySelector('.hand-row')), dock: R(document.getElementById('dock')),
    deckHit: chainAt(dr.left + dr.width / 2, dr.top + dr.height / 2),
    discardHit: chainAt(sr.left + sr.width / 2, sr.top + sr.height / 2),
    cards,
  };
});
console.log(JSON.stringify(out));
await browser.close();
