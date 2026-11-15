import { webkit } from 'playwright-core';

const BASE = process.env.BASE ?? 'https://www.futasaku.com/test/';
const DPR = Number(process.env.DPR ?? 3);
const browser = await webkit.launch({ ...(process.env.PW_WEBKIT ? { executablePath: process.env.PW_WEBKIT } : {}) });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: DPR, hasTouch: true, ignoreHTTPSErrors: true });
await page.addInitScript(() => { (window as any).__name = (f: unknown) => f; });
await page.goto(BASE + '?seed=219682080&debug=timing');
await page.waitForFunction(() => (window as any).__severgrow?.state?.(), undefined, { timeout: 90000 });
let gone = 0;
for (let i = 0; i < 200; i++) {
  const up = await page.evaluate(() => { const o = document.getElementById('starter-lottery') as HTMLElement | null; return !!o && !o.hidden; });
  if (up) { gone = 0; await page.mouse.click(195, 300); } else { gone++; if (gone >= 8) break; }
  await page.waitForTimeout(150);
}
const info = await page.evaluate(() => {
  const d = document.getElementById('deck') as HTMLElement;
  const r = d.getBoundingClientRect();
  const x = r.left + r.width / 2, y = r.top + r.height / 2;
  const chain: string[] = [];
  let el = document.elementFromPoint(x, y) as HTMLElement | null;
  while (el && chain.length < 8) { chain.push(el.id || el.className?.toString().slice(0, 40) || el.tagName); el = el.parentElement; }
  const g = document.getElementById('game') as HTMLElement;
  return {
    deck: { x: Math.round(x), y: Math.round(y), w: Math.round(r.width), h: Math.round(r.height) },
    chain,
    deckHidden: !!d.closest('[hidden]'),
    gameHidden: g.hidden,
    phase: (window as any).__severgrow.state().phase,
    busy: (window as any).__severgrow.busy(),
    vv: visualViewport ? { w: visualViewport.width, h: visualViewport.height, s: visualViewport.scale } : null,
  };
});
console.log(JSON.stringify(info, null, 1));
// try clicking the deck several times and watch the phase
for (let i = 0; i < 4; i++) {
  const d = await page.evaluate(() => { const r = document.getElementById('deck')!.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await page.mouse.click(d.x, d.y);
  await page.waitForTimeout(400);
  console.log('click', i, JSON.stringify(await page.evaluate(() => { const h = (window as any).__severgrow; const s = h.state(); return { phase: s.phase, actor: s.actor, busy: h.busy(), pending: h.pending() }; })));
}
// also try a touch tap via CDP-free path: dispatch through the page
await page.evaluate(() => {
  const el = document.getElementById('deck')!;
  const r = el.getBoundingClientRect();
  const t = new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 7, pointerType: 'touch', isPrimary: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 });
  el.dispatchEvent(t);
  el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, pointerId: 7, pointerType: 'touch', isPrimary: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }));
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }));
});
await page.waitForTimeout(500);
console.log('synthetic', JSON.stringify(await page.evaluate(() => { const h = (window as any).__severgrow; const s = h.state(); return { phase: s.phase, busy: h.busy() }; })));
await browser.close();
