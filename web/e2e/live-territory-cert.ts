// THE LIVE TERRITORY, CERTIFIED — the real site, a real touch, at 390x844 and 360x640.
//
//   PW_CHROMIUM=… tsx web/e2e/live-territory-cert.ts
//
// Proves on https://www.futasaku.com/ (a guest identity is created by the site itself; nothing is
// claimed and no Seeds are spent): the screen opens from the menu, a cell is drawn at a real touch
// size, a drag pans in BOTH axes to every extreme, the one FIT toggle shows the whole silhouette,
// an EDGE cell answers a tap, and the page never scrolls. Screenshots land in docs/screens/0.6/.
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';

const LIVE = 'https://www.futasaku.com/';
const SHOTS = '/Users/patryk/sg-polish2/docs/screens/0.6';
mkdirSync(SHOTS, { recursive: true });

let fails = 0, passes = 0;
const check = (name: string, ok: boolean, note: string | number = '') => {
  if (ok) passes++; else fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note !== '' ? `  (${note})` : ''}`);
};
const n1 = (v: number) => Number(v.toFixed(1));

const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  args: ['--no-sandbox'],
});
const errors: string[] = [];

const GEOMETRY = `(() => {
  const svg = document.querySelector('.world-map-svg');
  const panel = document.getElementById('online-world-grid');
  const fit = document.getElementById('online-world-fit');
  const box = (el) => { const r = el.getBoundingClientRect(); return { left:+r.left.toFixed(1), top:+r.top.toFixed(1), right:+r.right.toFixed(1), bottom:+r.bottom.toFixed(1), width:+r.width.toFixed(1), height:+r.height.toFixed(1) }; };
  const cells = [...document.querySelectorAll('.world-hex')].map((el) => ({ id: el.getAttribute('data-cell-id') || '', ...box(el) }));
  const first = svg ? svg.querySelector('.world-hex') : null;
  return {
    panel: panel ? box(panel) : null,
    fit: fit ? { text: fit.textContent.trim(), pressed: fit.getAttribute('aria-pressed'), ...box(fit) } : null,
    viewBox: (svg?.getAttribute('viewBox') ?? '').split(/[\\s,]+/).map(Number),
    hex: first ? { width: +first.getBoundingClientRect().width.toFixed(1), height: +first.getBoundingClientRect().height.toFixed(1) } : null,
    cells,
    scrollY: window.scrollY,
    docScroll: Math.max(0, document.documentElement.scrollHeight - innerHeight),
    count: cells.length,
  };
})()`;

const touchDrag = async (page: any, x: number, y: number, dx: number, dy: number) => {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  const steps = 12;
  for (let i = 1; i <= steps; i++) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove', touchPoints: [{ x: x + (dx * i) / steps, y: y + (dy * i) / steps }],
    });
    await page.waitForTimeout(16);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(180);
};

try {
  for (const [w, h] of [[390, 844], [360, 640]] as const) {
    const tag = `${w}x${h}`;
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    page.on('pageerror', (e: Error) => errors.push(`${tag}: ${e.message}`));
    await page.addInitScript(() => { (window as any).__name = (fn: unknown) => fn; });

    await page.goto(LIVE, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#menu:not([hidden]) .menu-inner', { timeout: 40000 });
    // The menu entry and the map both belong to the lobby's lazy import; click until it opens.
    let open = false;
    for (let attempt = 0; attempt < 5 && !open; attempt++) {
      await page.evaluate(() => document.getElementById('menu-world')?.click());
      open = await page.waitForSelector('#online-world-screen:not([hidden])', { timeout: 8000 }).then(() => true).catch(() => false);
      if (!open) await page.waitForTimeout(700);
    }
    check(`[${tag}] the Territory screen opens from the menu`, open);
    await page.waitForSelector('.world-hex', { timeout: 45000 });
    await page.waitForTimeout(700);

    const large = (await page.evaluate(GEOMETRY)) as any;
    check(`[${tag}] the live map draws ${large.count} cells`, large.count > 250, large.count);
    check(`[${tag}] a cell is a real touch target (>=44px)`, large.hex.width >= 44 && large.hex.height >= 44, `${n1(large.hex.width)}x${n1(large.hex.height)}`);
    check(`[${tag}] the page does not scroll on open`, large.docScroll <= 1 && large.scrollY === 0, `${large.docScroll}px`);
    check(`[${tag}] the FIT toggle is there and off`, !!large.fit && large.fit.text === 'FIT' && large.fit.pressed === 'false', `${large.fit?.text}/${large.fit?.pressed}`);
    await page.screenshot({ path: `${SHOTS}/territory-large-${tag}.png` });

    const centre = { x: large.panel.left + large.panel.width / 2, y: large.panel.top + large.panel.height / 2 };
    const start = large.viewBox;
    await touchDrag(page, centre.x, centre.y, -220, 0);
    const afterX = (await page.evaluate(GEOMETRY)) as any;
    check(`[${tag}] a touch drag pans HORIZONTALLY`, Math.abs(afterX.viewBox[0] - start[0]) > 20, `x ${n1(start[0])} -> ${n1(afterX.viewBox[0])}`);
    await touchDrag(page, centre.x, centre.y, 0, -220);
    const afterY = (await page.evaluate(GEOMETRY)) as any;
    check(`[${tag}] a touch drag pans VERTICALLY`, Math.abs(afterY.viewBox[1] - afterX.viewBox[1]) > 20, `y ${n1(afterX.viewBox[1])} -> ${n1(afterY.viewBox[1])}`);

    // The extremes: keep dragging each way until the view stops moving, then check the edge cell.
    for (const [axis, sign] of [['x', -1], ['y', -1], ['x', 1], ['y', 1]] as const) {
      let before = (await page.evaluate(GEOMETRY)) as any;
      for (let i = 0; i < 6; i++) {
        await touchDrag(page, centre.x, centre.y, axis === 'x' ? sign * 240 : 0, axis === 'y' ? sign * 240 : 0);
        const now = (await page.evaluate(GEOMETRY)) as any;
        if (now.viewBox[0] === before.viewBox[0] && now.viewBox[1] === before.viewBox[1]) break;
        before = now;
      }
      const m = (await page.evaluate(GEOMETRY)) as any;
      const inside = m.cells.filter((c: any) => c.left >= m.panel.left - 1 && c.right <= m.panel.right + 1 && c.top >= m.panel.top - 1 && c.bottom <= m.panel.bottom + 1);
      check(`[${tag}] the ${axis === 'x' ? (sign < 0 ? 'left' : 'right') : (sign < 0 ? 'top' : 'bottom')} extreme leaves cells fully inside the panel`,
        inside.length > 0, `${inside.length} whole cells`);
    }

    const panView = (await page.evaluate(GEOMETRY)) as any;
    await page.evaluate(() => document.getElementById('online-world-fit')!.click());
    await page.waitForTimeout(450);
    const fit = (await page.evaluate(GEOMETRY)) as any;
    const outside = fit.cells.filter((c: any) => c.left < fit.panel.left - 1 || c.right > fit.panel.right + 1 || c.top < fit.panel.top - 1 || c.bottom > fit.panel.bottom + 1);
    check(`[${tag}] FIT shows the WHOLE silhouette`, outside.length === 0 && fit.fit.pressed === 'true', `${outside.length} of ${fit.cells.length} outside`);
    check(`[${tag}] FIT really is a different view`, Math.abs(fit.viewBox[2] - panView.viewBox[2]) > 1, `width ${n1(panView.viewBox[2])} -> ${n1(fit.viewBox[2])}`);
    await page.screenshot({ path: `${SHOTS}/territory-fit-${tag}.png` });
    await page.evaluate(() => document.getElementById('online-world-fit')!.click());
    await page.waitForTimeout(400);
    const restored = (await page.evaluate(GEOMETRY)) as any;
    check(`[${tag}] turning FIT off restores the pan view`, Math.abs(restored.viewBox[0] - panView.viewBox[0]) < 0.6 && Math.abs(restored.viewBox[2] - panView.viewBox[2]) < 0.6,
      `${n1(restored.viewBox[0])}/${n1(restored.viewBox[2])} vs ${n1(panView.viewBox[0])}/${n1(panView.viewBox[2])}`);

    // An EDGE cell answers a tap: pick the visible cell nearest the panel's right edge.
    const edge = restored.cells
      .filter((c: any) => c.left >= restored.panel.left && c.right <= restored.panel.right && c.top >= restored.panel.top && c.bottom <= restored.panel.bottom)
      .sort((a: any, b: any) => b.right - a.right)[0];
    if (edge) {
      await page.mouse.click((edge.left + edge.right) / 2, (edge.top + edge.bottom) / 2);
      await page.waitForTimeout(500);
      // The map marks the chosen tile with `.selected` on its own path (world-view.select), so the
      // assertion is the tile the light is on, not merely "the screen stayed".
      const selected = (await page.evaluate(() => {
        const el = document.querySelector('.world-hex.selected');
        const status = document.getElementById('online-world-pick')?.textContent
          ?? document.querySelector('.world-selection')?.textContent ?? '';
        return { id: el?.getAttribute('data-cell-id') ?? '', status: status.replace(/\s+/g, ' ').trim().slice(0, 60) };
      })) as { id: string; status: string };
      check(`[${tag}] an edge cell answers a tap`, selected.id === edge.id, `tapped ${edge.id}, selected "${selected.id}"`);
      check(`[${tag}] the selection bar answers with it`, selected.status.length > 0, selected.status);
    } else {
      check(`[${tag}] an edge cell answers a tap`, false, 'no fully visible cell found');
    }
    const final = (await page.evaluate(GEOMETRY)) as any;
    check(`[${tag}] the page still does not scroll after panning`, final.docScroll <= 1 && final.scrollY === 0, `${final.docScroll}px / y ${final.scrollY}`);
    await page.screenshot({ path: `${SHOTS}/territory-select-${tag}.png` });
    await ctx.close();
  }
} catch (error) {
  check('the live Territory walk completed without throwing', false, String((error as Error)?.message ?? error).slice(0, 300));
} finally {
  check('no page errors on the live Territory', errors.length === 0, errors.join(' | '));
  await browser.close();
  console.log(`\n${passes} passed, ${fails} failed`);
  process.exit(fails ? 1 : 0);
}
