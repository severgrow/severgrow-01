// Positioning pass, Step 1: the alignment audit. Opens a game (a full hand, the Grow step) at
// each viewport and measures, against the screen's centre line: the header pill, the race-bar
// tick, the drawn board (tiles, homes, ground), the pile pair, the hint and the hand fan; the
// left and right margins; the space above and below the board in its zone; and every visible
// control that has no mirrored partner. Writes <out>/audit.json, <out>/audit.md and a screenshot
// per viewport with the centre-line overlay.
//   npx tsx web/e2e/align-audit.ts --out=docs/screens/align/before [--dist=web/dist]
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { chromium } from 'playwright-core';
import type { Page } from 'playwright-core';

const opt = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const DIST = resolve(opt('dist') ?? 'web/dist');
const OUT = resolve(opt('out') ?? 'docs/screens/align/after');
mkdirSync(OUT, { recursive: true });
const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png' };
const server = createServer((req, res) => {
  const p = decodeURIComponent((req.url ?? '/').split('?')[0]!);
  let f = join(DIST, p === '/' ? 'index.html' : p);
  if (!existsSync(f)) f = join(DIST, 'index.html');
  res.writeHead(200, { 'content-type': TYPES[extname(f)] ?? 'application/octet-stream' });
  res.end(readFileSync(f));
});
await new Promise<void>((r) => server.listen(4197, r));
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});

export const VIEWPORTS = [
  { w: 360, h: 640, phone: true },
  { w: 390, h: 844, phone: true },
  { w: 430, h: 932, phone: true },
  { w: 768, h: 1024, phone: true },
  { w: 1280, h: 800, phone: false },
] as const;

/** The same overlay the page shows with ?align=1 (kept here so "before" builds get it too). */
const OVERLAY_CSS = `
html::after{content:'';position:fixed;left:calc(50% - 0.5px);top:0;bottom:0;width:1px;background:#ff2bd6;z-index:99999;pointer-events:none}
html::before{content:'';position:fixed;inset:0 16px;border-left:1px dashed #22e3ff;border-right:1px dashed #22e3ff;z-index:99999;pointer-events:none}`;

const openGame = async (v: (typeof VIEWPORTS)[number]) => {
  const page = await browser.newPage(v.phone ? { viewport: { width: v.w, height: v.h }, deviceScaleFactor: 2, hasTouch: true, isMobile: true } : { viewport: { width: v.w, height: v.h } });
  // tsx names inner functions with a __name helper the page does not have
  await page.addInitScript({ content: 'window.__name = (f) => f;' });
  await page.addInitScript(() => {
    if (sessionStorage.getItem('s')) return;
    sessionStorage.setItem('s', '1');
    localStorage.clear();
    localStorage.setItem('severgrow.settings.v1', JSON.stringify({ sound: false, coach: false, speed: 'skip', eyeCandy: false }));
    localStorage.setItem('severgrow.seen', '1');
    localStorage.setItem('severgrow.tips.v1', JSON.stringify({ fruit: true, strengthen: true, draw: true }));
    localStorage.setItem('severgrow.ctools.seen', '1');
  });
  await page.goto('http://localhost:4197/');
  await page.waitForTimeout(700);
  await page.locator('#menu-new').click({ force: true });
  await page.waitForTimeout(400);
  const tile = page.locator('.level-tile').nth(6);
  if (await tile.count()) await tile.click({ force: true });
  await page.waitForTimeout(1400);
  await page.locator('#deck').click({ force: true }).catch(() => {});
  await page.waitForTimeout(1200);
  await page.mouse.move(1, 1);
  return page;
};

type Rect = { l: number; r: number; t: number; b: number };
export type Audit = {
  viewport: string;
  centre: number;
  offsets: Record<string, number | null>;
  margins: Record<string, [number, number] | null>;
  board: { above: number; below: number; tileW: number } | null;
  lone: string[];
};

const measure = (page: Page, viewport: string) =>
  page.evaluate((viewport): Audit => {
    const W = window.innerWidth;
    const cx = W / 2;
    const vis = (e: Element | null) => !!e && (e as HTMLElement).offsetParent !== null && getComputedStyle(e).visibility !== 'hidden';
    const rect = (e: Element | null): Rect | null => {
      if (!e || !vis(e)) return null;
      const r = e.getBoundingClientRect();
      return r.width || r.height ? { l: r.left, r: r.right, t: r.top, b: r.bottom } : null;
    };
    const union = (rs: (Rect | null)[]): Rect | null => {
      const ok = rs.filter((r): r is Rect => !!r);
      return ok.length ? { l: Math.min(...ok.map((r) => r.l)), r: Math.max(...ok.map((r) => r.r)), t: Math.min(...ok.map((r) => r.t)), b: Math.max(...ok.map((r) => r.b)) } : null;
    };
    const off = (r: Rect | null, c = cx) => (r ? +((r.l + r.r) / 2 - c).toFixed(2) : null);
    // wide screens put the board and the dock side by side: each part is measured against the
    // centre of its own column (on phones both are the screen's centre line)
    const colCentre = (sel: string) => {
      const r = document.querySelector(sel)?.getBoundingClientRect();
      return r && r.width ? (r.left + r.right) / 2 : cx;
    };
    const zc = colCentre('#board-wrap');
    const dc = colCentre('#dock');
    const q = (s: string) => document.querySelector(s);
    const pill = rect(q('#turn'));
    const raceFill = rect(q('.race-fill'));
    const tick = raceFill ? { l: raceFill.l + (raceFill.r - raceFill.l) / 2, r: raceFill.l + (raceFill.r - raceFill.l) / 2, t: 0, b: 0 } : null;
    // the drawn board: tiles, homes and the ground (svg groups: their painted extent)
    const board = union([rect(q('.l-tiles')), rect(q('.l-homes')), rect(q('.l-base'))]);
    const zone = rect(q('#board-wrap'));
    const piles = rect(q('.piles'));
    const hintEl = q('#hint .hint-text') ?? q('#hint');
    const hint = hintEl && (hintEl.textContent ?? '').trim() ? rect(hintEl) : null;
    const fan = union([...document.querySelectorAll('#hand .card')].map(rect));
    // tile width: the distance between two neighbouring tile centres on screen
    let tileW = 0;
    const cells = [...document.querySelectorAll('.l-tiles [data-key], .l-base [data-key]')] as SVGGraphicsElement[];
    const centres = new Map<string, { x: number; y: number }>();
    for (const c of cells) {
      const k = c.getAttribute('data-key')!;
      if (centres.has(k)) continue;
      const r = c.getBoundingClientRect();
      centres.set(k, { x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 });
    }
    const a = centres.get('0,0');
    const b = centres.get('1,0');
    if (a && b) tileW = +Math.hypot(a.x - b.x, a.y - b.y).toFixed(2);
    // lone controls: a visible corner tool or header button whose mirrored partner is not shown
    const pairs: [string, string][] = [
      ['#hud-menu', '#hud-history'],
      ['#tool-weak', '#tool-targets'],
      ['#tool-replay', '#hint-btn'],
      ['#tool-undo', '#hand-sort'],
    ];
    const lone: string[] = [];
    for (const [x, y] of pairs) {
      const rx = rect(q(x));
      const ry = rect(q(y));
      if (rx && !ry) lone.push(x);
      if (ry && !rx) lone.push(y);
    }
    const skip = rect(q('#tool-skip'));
    if (skip) lone.push('#tool-skip');
    return {
      viewport,
      centre: cx,
      offsets: { pill: off(pill), raceTick: off(tick), board: off(board, zc), piles: off(piles, dc), hint: off(hint, dc), hand: off(fan, dc) },
      margins: {
        board: board ? [+board.l.toFixed(1), +(W - board.r).toFixed(1)] : null,
        hand: fan ? [+fan.l.toFixed(1), +(W - fan.r).toFixed(1)] : null,
        header: (() => {
          const m = rect(q('#hud-menu'));
          const h = rect(q('#hud-history'));
          return m && h ? [+m.l.toFixed(1), +(W - h.r).toFixed(1)] : null;
        })(),
      },
      board: board && zone ? { above: +(board.t - zone.t).toFixed(1), below: +(zone.b - board.b).toFixed(1), tileW } : null,
      lone,
    };
  }, viewport);

const results: Audit[] = [];
for (const v of VIEWPORTS) {
  const page = await openGame(v);
  const name = `${v.w}x${v.h}`;
  results.push(await measure(page, name));
  await page.screenshot({ path: `${OUT}/${name}.png` });
  await page.addStyleTag({ content: OVERLAY_CSS });
  await page.screenshot({ path: `${OUT}/${name}-overlay.png` });
  await page.close();
}
await browser.close();
server.close();

const f = (n: number | null | undefined) => (n === null || n === undefined ? '–' : `${n > 0 ? '+' : ''}${n}`);
const rows = results.map(
  (r) =>
    `| ${r.viewport} | ${f(r.offsets.pill)} | ${f(r.offsets.raceTick)} | ${f(r.offsets.board)} | ${f(r.offsets.piles)} | ${f(r.offsets.hint)} | ${f(r.offsets.hand)} | ${r.board ? `${r.board.above} / ${r.board.below}` : '–'} | ${r.board?.tileW ?? '–'} | ${r.margins.board?.join(' / ') ?? '–'} | ${r.margins.hand?.join(' / ') ?? '–'} | ${r.lone.join(', ') || 'none'} |`,
);
const md = `# Alignment audit

Offsets are the horizontal distance (pt) of each part's centre from its centre line (+ is right
of centre): the screen's for the header; on wide screens (board and dock side by side) the board
is measured against its column and the piles, hint and hand against the dock's column. "Above / below" is the space between the drawn board and its zone.
Margins are left / right. "Lone" lists visible controls whose mirrored partner is not shown.

| viewport | pill | race tick | board | piles | hint | hand | board above / below | tile width | board margins | hand margins | lone controls |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
${rows.join('\n')}
`;
writeFileSync(`${OUT}/audit.json`, JSON.stringify(results, null, 2));
writeFileSync(`${OUT}/audit.md`, md);
console.log(md);
