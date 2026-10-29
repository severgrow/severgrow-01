// The counter digits, the Bloom recipe and the HUD focus ring: three measured fit-and-centre
// rules from the polish audit. Each check states the rule, not a pixel:
//
//  1. The two digits of each pile counter sit in the middle of their little window — the text's
//     own box and the glyph's ink, on BOTH axes, within 0.5 CSS px (owner, 2026-10-29: "make sure
//     the numbers in the counters under draw and throw piles are centered in the tiny box
//     they're in"). The live display pads every count to two drum windows, so a value is always
//     two single digits; the rule is checked for 1-, 2- and 3-character faces so it cannot regress
//     for any digit count.
//  2. A Bloom recipe never leaves its own button: 3-, 5- and 6-card recipes stay inside the
//     button's content box at 320, 360, 390, landscape and desktop widths (a 6-card run at 390
//     used to paint 23 px over the LED display).
//  3. The HUD menu key's focus ring is not cut off by the top edge of the screen.
//
// The dock's own alignment (44px keys, two shared edges) is guarded here too, so the audit's
// "already correct" list cannot silently drift.
//
//  npx tsx web/e2e/polish-alignment.ts
import { chromium } from 'playwright-core';
import type { Page } from 'playwright-core';
import { servePreview } from './helpers/preview-port.js';

const served = await servePreview(0, { logLevel: 'silent' });
const BASE = served.url;
const browser = await chromium.launch({ ...(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}), args: ['--no-sandbox'] });

let checks = 0;
const failures: string[] = [];
const check = (ok: boolean, label: string) => {
  checks++;
  if (!ok) failures.push(label);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
};
const near = (a: number, b: number, tolerance = 0.5) => Math.abs(a - b) <= tolerance;
const f2 = (n: number) => n.toFixed(2);

/** Open the product on a phone-shaped page and reach the Grow step (piles are unscaled there). */
const open = async (width: number, height: number) => {
  const page = await browser.newPage({
    viewport: { width, height },
    ...(width < 800 ? { hasTouch: true, isMobile: true } : {}),
  });
  // Reduced motion settles the odometer drums: every face is the resting one.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript({ content: 'window.__name = (f) => f;' });
  // `?seed=` starts a real match without a save, so this suite is prefix-agnostic: it runs on any
  // channel's dist (the odometer, the recipe and the HUD are the same on every channel).
  await page.goto(`${BASE}?seed=3`);
  await page.waitForSelector('#deck.ready');
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(600);
  await page.locator('#deck').evaluate((el) => (el as HTMLButtonElement).click());
  await page.waitForFunction(() => (window as any).__severgrow?.state().phase === 'ACT' && !(window as any).__severgrow.busy(), undefined, { timeout: 15000 });
  await page.waitForTimeout(500);
  return page;
};

/**
 * Geometry of every digit window of one counter.
 * - `range` is the text's own inline box (a DOM Range over the digit).
 * - `ink` is the glyph's ink box, derived from the same font's metrics, so an optical check does
 *   not depend on the eye: baseline from the face's line box, then actualBoundingBox.
 * Both are compared with the window's centre, not with the face, so the window is the "tiny box".
 */
const counter = (page: Page, id: string) =>
  page.evaluate((id: string) => {
    const host = document.getElementById(id)!;
    const faces = [...host.querySelectorAll<HTMLElement>('.pile-meter-face')];
    const windows = [...host.querySelectorAll<HTMLElement>('.pile-meter-window')];
    return faces.map((face, index) => {
      const win = windows[index]!.getBoundingClientRect();
      const faceBox = face.getBoundingClientRect();
      const cs = getComputedStyle(face);
      const text = face.firstChild as Text | null;
      if (!text) return { digit: '', win: { x: 0, y: 0, w: 0, h: 0, cx: 0, cy: 0 }, face: { x: 0, y: 0, w: 0, h: 0 }, rangeDx: 0, rangeDy: 0, inkDx: 0, inkDy: 0, rangeTop: 0 };
      const range = document.createRange();
      range.selectNodeContents(text);
      const r = range.getBoundingClientRect();
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d')!;
      ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      const m = ctx.measureText(face.textContent ?? '');
      const ascent = m.fontBoundingBoxAscent;
      const descent = m.fontBoundingBoxDescent;
      const lh = parseFloat(cs.lineHeight);
      const baseline = faceBox.top + (lh - (ascent + descent)) / 2 + ascent;
      const ink = {
        left: r.left - m.actualBoundingBoxLeft,
        right: r.left + m.actualBoundingBoxRight,
        top: baseline - m.actualBoundingBoxAscent,
        bottom: baseline + m.actualBoundingBoxDescent,
      };
      const wc = { x: win.left + win.width / 2, y: win.top + win.height / 2 };
      return {
        digit: face.textContent ?? '',
        win: { x: win.left, y: win.top, w: win.width, h: win.height, cx: wc.x, cy: wc.y },
        face: { x: faceBox.left, y: faceBox.top, w: faceBox.width, h: faceBox.height },
        rangeDx: (r.left + r.right) / 2 - wc.x,
        rangeDy: (r.top + r.bottom) / 2 - wc.y,
        inkDx: (ink.left + ink.right) / 2 - wc.x,
        inkDy: (ink.top + ink.bottom) / 2 - wc.y,
        rangeTop: r.top,
      };
    });
  }, id);

/** Write a digit string into the counter's two faces (the meter itself pads live counts). */
const setFaces = (page: Page, id: string, value: string) =>
  page.evaluate(([id, value]: [string, string]) => {
    const faces = [...document.querySelectorAll<HTMLElement>(`#${id} .pile-meter-face`)];
    faces.forEach((face, i) => { face.textContent = value[i] ?? ''; });
  }, [id, value] as [string, string]);

const VIEWPORTS: [number, number, string][] = [
  [320, 568, '320x568'],
  [390, 844, '390x844'],
  [1280, 800, '1280x800'],
];

for (const [width, height, label] of VIEWPORTS) {
  const page = await open(width, height);
  for (const id of ['deck-count', 'discard-count']) {
    const pile = await page.evaluate((id) => {
      const counter = document.getElementById(id)!.getBoundingClientRect();
      const card = document.querySelector(`#${id.replace('-count', '')} .pile-card`)!.getBoundingClientRect();
      const meter = getComputedStyle(document.getElementById(id)!);
      return {
        dx: (counter.left + counter.right) / 2 - (card.left + card.right) / 2,
        w: counter.width,
        h: counter.height,
        windowW: document.querySelector(`#${id} .pile-meter-window`)!.getBoundingClientRect().width,
        windowH: document.querySelector(`#${id} .pile-meter-window`)!.getBoundingClientRect().height,
        tabular: `${meter.fontVariantNumeric}`.includes('tabular-nums'),
      };
    }, id);
    // The counter keeps its supplied footprint and its supplied position under the card.
    check(near(pile.dx, 0), `${label} ${id}: centred under the pile card (x delta ${f2(pile.dx)})`);
    check(pile.w === 34 && pile.h === 18, `${label} ${id}: keeps the 34x18 counter footprint (${pile.w}x${pile.h})`);
    check(pile.windowW === 11 && pile.windowH === 10, `${label} ${id}: each digit window stays 11x10 (${pile.windowW}x${pile.windowH})`);
    check(pile.tabular, `${label} ${id}: tabular figures, so a digit never moves when the value changes`);

    // 1-, 2- and 3-character faces in the same window: the rule must hold for any digit count.
    for (const value of ['7', '42', '105']) {
      await setFaces(page, id, value);
      const windows = await counter(page, id);
      const first = windows[0]!;
      const tag = `${label} ${id} "${value}"`;
      check(near(first.rangeDx, 0), `${tag}: text box centred left/right (${f2(first.rangeDx)})`);
      check(near(first.rangeDy, 0), `${tag}: text box centred above/below (${f2(first.rangeDy)})`);
      check(near(first.inkDx, 0), `${tag}: glyph ink centred left/right (${f2(first.inkDx)})`);
      check(near(first.inkDy, 0), `${tag}: glyph ink centred above/below (${f2(first.inkDy)})`);
    }

    // All ten digits share the same centre: no value-dependent drift.
    await setFaces(page, id, '01');
    const drift: number[] = [];
    for (let d = 0; d <= 9; d++) {
      await setFaces(page, id, `0${d}`);
      const [second] = await counter(page, id);
      drift.push(Math.abs(second!.rangeDx), Math.abs(second!.rangeDy));
    }
    check(Math.max(...drift) <= 0.5, `${label} ${id}: digits 0-9 share one centre (worst ${f2(Math.max(...drift))})`);

    // 9 -> 10: the windows and the digits' line must not move.
    await setFaces(page, id, '09');
    const nine = await counter(page, id);
    await setFaces(page, id, '10');
    const ten = await counter(page, id);
    await setFaces(page, id, '100');
    const hundred = await counter(page, id);
    const moved = [ten, hundred].flatMap((snapshot) => snapshot.map((w, i) => Math.max(
      Math.abs(w.win!.x - nine[i]!.win!.x), Math.abs(w.win!.y - nine[i]!.win!.y),
      Math.abs(w.win!.w - nine[i]!.win!.w), Math.abs(w.win!.h - nine[i]!.win!.h),
    )));
    check(Math.max(...moved) <= 0.01, `${label} ${id}: 09 -> 10 -> 100 does not move or resize a window (${f2(Math.max(...moved))})`);
    check(near(ten[0]!.rangeTop, nine[0]!.rangeTop, 0.01), `${label} ${id}: the digit keeps its baseline as the value changes`);
  }

  // The dock grid's own alignment: the icons sit on the centre of their 44px keys, the two rows
  // share one edge, and the action row is flush with the display column.
  const dock = await page.evaluate(() => {
    const rect = (s: string) => document.querySelector(s)!.getBoundingClientRect();
    const centre = (r: DOMRect) => ({ x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 });
    const icons = ['#smart-context', '#tool-undo', '#futa04-help-button', '#hand-sort'].map((sel) => {
      const box = rect(sel);
      const svg = document.querySelector(`${sel} svg`)!.getBoundingClientRect();
      return { sel, dx: centre(svg).x - centre(box).x, dy: centre(svg).y - centre(box).y };
    });
    return {
      icons,
      panelRight: rect('#smart-panel').right,
      sortRight: rect('#hand-sort').right,
      panelLeft: rect('#smart-panel').left,
      undoLeft: rect('#tool-undo').left,
    };
  });
  for (const icon of dock.icons) {
    check(near(icon.dx, 0, 0.01) && near(icon.dy, 0, 0.01), `${label} ${icon.sel}: icon centred in its key (${f2(icon.dx)}, ${f2(icon.dy)})`);
  }
  check(near(dock.panelRight, dock.sortRight, 0.5), `${label}: action row and display share a right edge`);
  check(near(dock.panelLeft, dock.undoLeft, 0.5), `${label}: action row and display share a left edge`);

  await page.close();
}

// ---- the Bloom recipe stays inside its own button -------------------------------------------
for (const [width, height, label] of [...VIEWPORTS, [360, 640, '360x640'] as [number, number, string], [844, 390, '844x390'] as [number, number, string]]) {
  const page = await open(width, height);
  const measured = await page.evaluate(() => {
    const button = document.getElementById('smart-bloom-button');
    const combination = document.querySelector<HTMLElement>('#smart-bloom-button .futa04-combination');
    if (!button || !combination) return null;
    const out: { n: number; overLeft: number; overRight: number; cardW: number; cardH: number }[] = [];
    const original = combination.children.length;
    const sample = combination.firstElementChild!;
    for (const n of [3, 5, 6]) {
      while (combination.children.length < n) combination.append(sample.cloneNode(true));
      const b = button.getBoundingClientRect();
      const cs = getComputedStyle(button);
      const c = combination.getBoundingClientRect();
      const card = combination.firstElementChild!.getBoundingClientRect();
      out.push({
        n,
        overLeft: b.left + parseFloat(cs.paddingLeft) - c.left,
        overRight: c.right - (b.right - parseFloat(cs.paddingRight)),
        cardW: card.width,
        cardH: card.height,
      });
      while (combination.children.length > original) combination.lastElementChild!.remove();
    }
    return { cards: original, out };
  });
  if (!measured) {
    check(false, `${label}: Bloom recipe is present to measure`);
    await page.close();
    continue;
  }
  for (const row of measured.out) {
    const inside = row.overLeft <= 0.5 && row.overRight <= 0.5;
    check(inside, `${label}: a ${row.n}-card Bloom recipe stays inside its button (left ${f2(row.overLeft)}, right ${f2(row.overRight)})`);
    if (row.n === 3 && (width === 390 || width === 1280)) {
      // The designed recipe size on the two reference widths must not change.
      const wantW = width === 390 ? 26 : 30;
      const wantH = width === 390 ? 41 : 47;
      check(near(row.cardW, wantW, 0.5) && near(row.cardH, wantH, 0.5), `${label}: the 3-card recipe keeps its designed ${wantW}x${wantH} cards (${f2(row.cardW)}x${f2(row.cardH)})`);
    }
  }
  await page.close();
}

// ---- the HUD menu key's focus ring is not cut off by the screen edge ------------------------
{
  const page = await open(390, 844);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('Tab');
  const ring = await page.evaluate(() => {
    const el = document.activeElement as HTMLElement;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const w = parseFloat(cs.outlineWidth) || 0;
    const offset = parseFloat(cs.outlineOffset) || 0;
    return { id: el.id, outline: cs.outlineStyle, width: w, offset, top: r.top - offset - w, left: r.left - offset - w };
  });
  check(ring.id === 'hud-menu', `focus: the first Tab key reaches the menu key (${ring.id})`);
  check(ring.outline !== 'none' && ring.width > 0, 'focus: the menu key paints a visible ring');
  check(ring.top >= -0.01, `focus: the menu key ring is not clipped by the top edge (ring top ${f2(ring.top)})`);
  check(ring.left >= -0.01, `focus: the menu key ring is not clipped by the left edge (ring left ${f2(ring.left)})`);
  await page.close();
}

await browser.close();
await served.server.close();
console.log(`\n${checks - failures.length}/${checks} checks passed`);
if (failures.length) {
  console.log('FAILURES:');
  for (const f of failures) console.log(` - ${f}`);
  process.exitCode = 1;
}
