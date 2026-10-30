// THE THROW PILE'S PRESENTATION (owner, 2026-10-30).
//
//   "when throwing, remove the outer contour rectangle around discard pile - but make the pile
//    bigger after player selects a card to throw. // the gold glow around discard pile when it
//    makes bloom - i dont like the color, its to mustardy, make it more like heavenly gold"
//
// Proves, in a real browser, on the prebuilt CHANNEL=futa04 dist:
//   1. no contour is PAINTED outside the Throw pile in the Throw step (pixel profile, not just CSS);
//      the OLD ring is injected afterwards as a negative control, so the detector must flag it;
//   2. the pile measurably grows when a card is picked, at 4 viewports, without touching the hand,
//      the LED display or the deck — and it still ends bigger under Reduce motion;
//   3. the Bloom-completing gold has a near-white core with its most saturated pixel in the
//      falloff (measured before/after on the same page, same sampler).
//
// Run (build first):
//   CHANNEL=futa04 … npm run web:build
//   PW_CHROMIUM="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
//     npx tsx web/e2e/throw-pile-presentation.ts
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
import type { Page } from 'playwright-core';
import { servePreview } from './helpers/preview-port.js';
import { legalActions, viewFor } from '../../src/engine/index.js';
import type { Action, State } from '../../src/engine/index.js';

const SHOTS = 'docs/screens/throw-pile-2026-10-30';
mkdirSync(SHOTS, { recursive: true });

const served = process.env.FUTA04_URL
  ? null
  : await servePreview(4196, { build: { outDir: process.env.FUTA04_DIST ?? 'dist' }, logLevel: 'silent' });
const BASE = process.env.FUTA04_URL ?? served!.url;
const browser = await chromium.launch({
  ...(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}),
  args: ['--no-sandbox'],
});

let checks = 0;
const check = (value: unknown, name: string) => {
  assert(value, name);
  checks++;
  console.log(`  ok ${name}`);
};

const state = (p: Page) => p.evaluate(() => (window as any).__severgrow.state() as State);
const idle = (p: Page) =>
  p.waitForFunction(() => {
    const h = (window as any).__severgrow;
    return h && !h.busy() && h.state()?.actor === 0;
  }, undefined, { timeout: 120000 });
const playFor = (p: Page, a: Action) => p.evaluate((action) => (window as any).__severgrow.playFor(action, 0), a);
const find = (s: State, t: Action['t']): Action => {
  const a = legalActions(viewFor(s, 0)).find((x) => x.t === t);
  assert(a, `a legal ${t} exists`);
  return a!;
};

/** Settings + a clean save (`reduce` is the in-app Reduce-motion preference). */
const settingsOn = (p: Page, reduce = false) =>
  p.addInitScript((reduceMotion) => {
    (window as any).__name = (fn: unknown) => fn;
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k && k.includes('save')) localStorage.removeItem(k);
      }
    } catch { /* storage blocked */ }
    const settings = JSON.stringify({ sound: false, music: false, coach: false, speed: 'normal', reduceMotion, autoSkip: false, confirmPolicy: 'never' });
    for (const k of ['severgrow.settings.v1', 'main2:severgrow.settings.v1', 'futa04:severgrow.settings.v1']) localStorage.setItem(k, settings);
  }, reduce);

/** Start a fresh Throw step (draw, leave Grow) and read the forced card. */
const toThrow = async (p: Page, seed: number) => {
  await p.goto(`${BASE}?seed=${seed}`);
  await p.waitForSelector('#starter-lottery', { state: 'visible', timeout: 60000 });
  await p.waitForSelector('#starter-lottery', { state: 'hidden', timeout: 60000 });
  await idle(p);
  await playFor(p, find(await state(p), 'Draw'));
  await idle(p);
  const act = await state(p);
  if (act.phase === 'ACT') {
    await playFor(p, legalActions(viewFor(act, 0)).find((a) => a.t === 'EndAct')!);
    await idle(p);
  }
  // The turn hand-over and the Throw dim are CSS transitions: let the fan stop before measuring.
  await p.waitForTimeout(450);
  assert.equal((await state(p)).phase, 'DISCARD');
  const move = find(await state(p), 'Discard');
  assert.equal(move.t, 'Discard');
  return move.card;
};

const visiblePoint = (p: Page, id: number) =>
  p.locator(`#hand [data-card="${id}"]`).evaluate((el) => {
    const r = el.getBoundingClientRect();
    for (const xf of [0.08, 0.2, 0.35, 0.5, 0.7, 0.9])
      for (const yf of [0.2, 0.45, 0.7, 0.85]) {
        const x = r.left + r.width * xf;
        const y = r.top + r.height * yf;
        if (document.elementFromPoint(x, y)?.closest('#hand .card') === el) return { x, y };
      }
    return null;
  });

type Box = { x: number; y: number; w: number; h: number };
/** A hand card: its axis-aligned box, plus its REAL rotated outline when the browser gives one. */
type CardBox = Box & { quad: QuadPt[] | null };
type Boxes = { discard: Box; deck: Box; panel: Box; plate: Box; cards: CardBox[]; quads: boolean };
type QuadPt = { x: number; y: number };

const boxes = (p: Page): Promise<Boxes> =>
  p.evaluate(() => {
    const one = (sel: string) => {
      const el = document.querySelector(sel);
      if (!el) throw new Error(`the page has ${sel}`);
      const r = el.getBoundingClientRect();
      return { x: +r.x.toFixed(2), y: +r.y.toFixed(2), w: +r.width.toFixed(2), h: +r.height.toFixed(2) };
    };
    // The picked card is lifted IN FRONT of the console on purpose (z-index 100, 18px up, 1.31x),
    // so it is measured separately; the constraint is that the pile never covers the RESTING hand.
    const cards = [...document.querySelectorAll<HTMLElement>('#hand .card:not(.futa04-throw-picked)')].map((el) => {
      const r = el.getBoundingClientRect();
      // THE FAN IS ROTATED, so the axis-aligned box is bigger than the card: its corners are
      // empty space. `quad` is the card's REAL transformed outline, and the overlap test uses it —
      // otherwise a swell is reported as touching a card it never reaches.
      // `getBoxQuads` is Chromium's and is not in the DOM typings, so it is reached through a cast.
      const withQuads = el as unknown as { getBoxQuads?: () => { p1: QuadPt; p2: QuadPt; p3: QuadPt; p4: QuadPt }[] };
      const quads = typeof withQuads.getBoxQuads === 'function' ? withQuads.getBoxQuads() : [];
      const q = quads[0];
      const quad = q ? [q.p1, q.p2, q.p3, q.p4].map((pt) => ({ x: pt.x, y: pt.y })) : null;
      return { x: r.x, y: r.y, w: r.width, h: r.height, quad };
    });
    return { discard: one('#discard'), deck: one('#deck'), panel: one('#smart-panel'), plate: one('#futa04-box'), cards, quads: cards.some((c) => !!c.quad) };
  });

/**
 * What part of `rect` is really inside `card`. A rotated card has a `quad`; sampling the intersection
 * of the two boxes against that quad gives the area the CARD covers, not the area its bounding box
 * covers. A card without a quad (no getBoxQuads) falls back to the plain box.
 */
const overlapCard = (rect: Box, card: CardBox): number => {
  if (!card.quad) return overlap(rect, card);
  const x0 = Math.max(rect.x, card.x), x1 = Math.min(rect.x + rect.w, card.x + card.w);
  const y0 = Math.max(rect.y, card.y), y1 = Math.min(rect.y + rect.h, card.y + card.h);
  if (x1 - x0 <= 0.5 || y1 - y0 <= 0.5) return 0;
  const inside = (px: number, py: number) => {
    const q = card.quad!;
    let sign = 0;
    for (let i = 0; i < q.length; i++) {
      const a = q[i]!, b = q[(i + 1) % q.length]!;
      const cross = (b.x - a.x) * (py - a.y) - (b.y - a.y) * (px - a.x);
      if (Math.abs(cross) < 1e-9) continue;
      const s = cross > 0 ? 1 : -1;
      if (sign === 0) sign = s;
      else if (s !== sign) return false;
    }
    return true;
  };
  const steps = 24;
  let hit = 0;
  for (let iy = 0; iy < steps; iy++) {
    for (let ix = 0; ix < steps; ix++) {
      const px = x0 + ((ix + 0.5) / steps) * (x1 - x0);
      const py = y0 + ((iy + 0.5) / steps) * (y1 - y0);
      if (inside(px, py)) hit++;
    }
  }
  return +(((x1 - x0) * (y1 - y0) * hit) / (steps * steps)).toFixed(2);
};

/** Intersection area of two rects, with a 0.5px rounding tolerance. */
const overlap = (a: Box, b: Box): number => {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0.5 && h > 0.5 ? +(w * h).toFixed(2) : 0;
};

/**
 * The painted edge profile: for `d` CSS px OUT from the card's right edge, the pixel at the card's
 * vertical middle. The right side is used because it has no neighbour (the deck sits on the left).
 * A contour is a bright 1px band hugging the card; a falloff only ever gets darker going out.
 */
const EDGE_PROCESS = `(async ({ b64, clip, card, dpr }) => {
  const img = new Image();
  img.src = 'data:image/png;base64,' + b64;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, c.width, c.height).data;
  const at = (x, y) => {
    const i = (Math.round(y) * c.width + Math.round(x)) * 4;
    return Math.max(data[i], data[i + 1], data[i + 2]);
  };
  const left = (card.x - clip.x) * dpr;
  const right = left + card.width * dpr;
  const midY = (card.y - clip.y + card.height / 2) * dpr;
  const out = [];
  for (let d = 0.5; d <= 6; d += 0.5) out.push({ d, v: at(right + d * dpr, midY) });
  return out;
})`;

const edgeProfile = async (p: Page): Promise<{ d: number; v: number }[]> => {
  const card = (await p.locator('#discard .pile-top').boundingBox())!;
  const pad = 14;
  const clip = {
    x: Math.round(card.x - pad), y: Math.round(card.y - pad),
    width: Math.round(card.width + pad * 2), height: Math.round(card.height + pad * 2),
  };
  const b64 = (await p.screenshot({ clip })).toString('base64');
  return (await p.evaluate(`${EDGE_PROCESS}(${JSON.stringify({ b64, clip, card, dpr: 3 })})`)) as { d: number; v: number }[];
};

/**
 * A contour reads as: the band just outside the card is much brighter than the light 2px further
 * out (the old ring: 182 against 65), or there is a bump in the falloff. Both are false for a glow.
 */
const contourScore = (profile: { d: number; v: number }[]) => {
  const at = (d: number) => profile.find((p) => Math.abs(p.d - d) < 0.01)?.v ?? 0;
  const near = Math.max(at(0.5), at(1), at(1.5));
  const far = at(2.5);
  let bump = 0;
  for (const p of profile.filter((x) => x.d >= 1.5 && x.d <= 5.5)) {
    const prev = at(p.d - 0.5);
    const next = at(p.d + 0.5);
    bump = Math.max(bump, p.v - Math.max(prev, next));
  }
  return { ring: near - far, bump, near, far };
};

/** The glow's radial profile around the Bloom pile (mean of four sides), in HSV. */
const GLOW_PROCESS = `(async ({ b64, clip, card, dpr }) => {
  const img = new Image();
  img.src = 'data:image/png;base64,' + b64;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, c.width, c.height).data;
  const hsv = (r, g, b) => {
    const max = Math.max(r, g, b) / 255, min = Math.min(r, g, b) / 255, d = max - min;
    let h = 0;
    if (d > 0) {
      const rr = r / 255, gg = g / 255, bb = b / 255;
      if (max === rr) h = 60 * ((((gg - bb) / d) % 6) + 6) % 360;
      else if (max === gg) h = 60 * ((bb - rr) / d + 2);
      else h = 60 * ((rr - gg) / d + 4);
    }
    return { h: Math.round(h), s: max === 0 ? 0 : d / max, v: max };
  };
  const at = (x, y) => {
    const i = (Math.round(y) * c.width + Math.round(x)) * 4;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    return Object.assign({ r, g, b }, hsv(r, g, b));
  };
  const left = (card.x - clip.x) * dpr, right = left + card.width * dpr;
  const top = (card.y - clip.y) * dpr, bottom = top + card.height * dpr;
  const midX = (left + right) / 2, midY = (top + bottom) / 2;
  const rows = [];
  for (let d = 0.5; d <= 12; d += 0.5) {
    const px = d * dpr;
    const sides = [at(left - px, midY), at(right + px, midY), at(midX, top - px), at(midX, bottom + px)];
    const mean = (k) => sides.reduce((a, s) => a + s[k], 0) / sides.length;
    rows.push({ d, h: Math.round(mean('h')), s: +mean('s').toFixed(3), v: +mean('v').toFixed(3) });
  }
  return rows;
})`;

const glowProfile = async (p: Page): Promise<{ d: number; h: number; s: number; v: number }[]> => {
  const card = (await p.locator('#discard .pile-top').boundingBox())!;
  const pad = 22;
  const clip = {
    x: Math.max(0, Math.round(card.x - pad)), y: Math.max(0, Math.round(card.y - pad)),
    width: Math.round(card.width + pad * 2), height: Math.round(card.height + pad * 2),
  };
  const b64 = (await p.screenshot({ clip })).toString('base64');
  return (await p.evaluate(`${GLOW_PROCESS}(${JSON.stringify({ b64, clip, card, dpr: 3 })})`)) as { d: number; h: number; s: number; v: number }[];
};

/** The rules this change replaced, injected for the before/after record and negative controls. */
const OLD_GOLD = `html.futa04-information[data-step='draw'] #discard.futa04-bloom-draw .pile-top.card {
  transform:translateY(-3px) !important; border-color:rgba(212,175,55,.85) !important;
  box-shadow:0 0 0 1px rgba(212,175,55,.5), 0 0 8px 1px rgba(196,152,42,.34),
    0 0 3px rgba(255,241,205,.42), 0 2px 4px rgba(0,0,0,.45) !important;
}`;
const OLD_THROW = `
html.futa04-information[data-step='throw'] #discard .gd-halo { box-shadow: 0 0 0 1px rgba(218,104,80,.38), 0 0 22px 2px rgba(173,64,47,.32) !important; }
html.futa04-information #futa04-box #discard.futa04-throw-target .gd-halo { box-shadow: 0 0 0 1.5px rgba(232,150,120,.55), 0 0 26px 4px rgba(190,80,60,.42) !important; }
html.futa04-information #futa04-box #discard.futa04-throw-target { transform: scale(1.08) !important; }
`;

const errors: string[] = [];
const watch = (p: Page) => p.on('pageerror', (e) => errors.push(`${e.name}: ${e.message}`));

try {
  // ---------- 1 + 2: the Throw pile ----------
  for (const [w, h, touch] of [[390, 844, true], [320, 568, true], [844, 390, true], [1280, 800, false]] as const) {
    const tag = `${w}x${h}`;
    const page = await browser.newPage({ viewport: { width: w, height: h }, hasTouch: touch, isMobile: touch, deviceScaleFactor: 3 });
    await settingsOn(page);
    watch(page);
    page.setDefaultTimeout(120_000);
    const card = await toThrow(page, 870000 + w);

    // --- the contour: computed evidence + painted evidence ---
    const restCss = await page.locator('#discard .gd-halo').evaluate((el) => getComputedStyle(el).boxShadow);
    check(!/\b0px 0px 0px\b/.test(restCss), `${tag}: no zero-blur ring in the resting Throw light (${restCss})`);
    const restScore = contourScore(await edgeProfile(page));
    check(restScore.ring < 12 && restScore.bump < 8,
      `${tag}: the resting pile paints a falloff, not a contour (near ${restScore.near} vs 2.5px ${restScore.far}; bump ${restScore.bump})`);
    await page.locator('#discard').screenshot({ path: `${SHOTS}/${tag}-pile-rest.png` });
    await page.screenshot({ path: `${SHOTS}/${tag}-throw-rest.png`, scale: 'css' });

    // --- the swell ---
    const rest = await boxes(page);
    const point = await visiblePoint(page, card);
    assert(point, `card ${card} is tappable`);
    await page.mouse.click(point!.x, point!.y);
    await page.waitForFunction(() => {
      const d = document.getElementById('discard');
      if (!d?.classList.contains('futa04-throw-target')) return false;
      const t = getComputedStyle(d).transform;
      if (!t || t === 'none') return false;
      return Math.abs(new DOMMatrixReadOnly(t).a - 1.16) < 0.005;
    }, undefined, { timeout: 3000 });
    const picked = await boxes(page);
    const beforePx = rest.discard;
    const afterPx = picked.discard;
    const scale = afterPx.w / beforePx.w;
    check(afterPx.w >= beforePx.w + 6, `${tag}: the picked pile is wider (${beforePx.w} → ${afterPx.w}px)`);
    check(afterPx.h >= beforePx.h + 10, `${tag}: the picked pile is taller (${beforePx.h} → ${afterPx.h}px)`);
    check(scale >= 1.15 && scale <= 1.2, `${tag}: the swell is the 1.16 step (${scale.toFixed(3)})`);
    check(afterPx.w >= 44 && afterPx.h >= 44, `${tag}: the pick target stays a real target (${afterPx.w}x${afterPx.h})`);

    // SELF-CHECK: the quad measure must be able to see an overlap at all. Each card's own box,
    // measured against that card, necessarily overlaps it — and on a rotated card the answer must be
    // SMALLER than the box (the corners are empty), which is precisely why the box alone over-reports.
    const selfHits = picked.cards
      .map((c) => ({ box: c.w * c.h, area: overlapCard(c, c) }))
      .filter((x) => x.area > 0);
    check(
      picked.quads ? selfHits.length === picked.cards.length : selfHits.length > 0,
      `${tag}: the real-card measure can see a card it must (${selfHits.length}/${picked.cards.length})`,
    );
    // ...and it must also REJECT what is not there: a rect placed far from every card measures 0.
    // Together these two prove the measure is neither always-zero nor always-positive.
    const far = { x: -9999, y: -9999, w: 50, h: 50 };
    check(
      picked.cards.every((c) => overlapCard(far, c) === 0),
      `${tag}: the real-card measure rejects a rect no card reaches`,
    );
    // The resting state is the control: the pile must not touch the hand BEFORE it swells either, so
    // any hit after the swell is attributable to the swell.
    const restHits = rest.cards.map((c) => ({ c, area: overlapCard(beforePx, c) })).filter((x) => x.area > 0);
    check(restHits.length === 0, `${tag}: at rest the pile already touches no card (${restHits.length} hits)`);
    const cardHits = picked.cards.map((c) => ({ c, area: overlapCard(afterPx, c) })).filter((x) => x.area > 0);
    check(cardHits.length === 0, `${tag}: the swollen pile touches no resting card in the hand (${cardHits.length} hits)`);
    check(overlap(afterPx, picked.deck) === 0,
      `${tag}: it does not reach the deck (gap ${(afterPx.x - (picked.deck.x + picked.deck.w)).toFixed(2)}px)`);
    check(overlap(afterPx, picked.panel) === 0,
      `${tag}: it does not reach the LED display (gap ${(picked.panel.x - (afterPx.x + afterPx.w)).toFixed(2)}px)`);
    console.log(`  · ${tag} pile ${JSON.stringify(beforePx)} → ${JSON.stringify(afterPx)} | deck ${JSON.stringify(picked.deck)} | panel ${JSON.stringify(picked.panel)} | plate ${JSON.stringify(picked.plate)}`);

    const pickedCss = await page.locator('#discard .gd-halo').evaluate((el) => getComputedStyle(el).boxShadow);
    check(!/\b0px 0px 0px\b/.test(pickedCss), `${tag}: no zero-blur ring in the picked Throw light (${pickedCss})`);
    const pickedScore = contourScore(await edgeProfile(page));
    check(pickedScore.ring < 12 && pickedScore.bump < 8,
      `${tag}: the picked pile paints a falloff, not a contour (near ${pickedScore.near} vs 2.5px ${pickedScore.far}; bump ${pickedScore.bump})`);
    await page.locator('#discard').screenshot({ path: `${SHOTS}/${tag}-pile-picked.png` });
    await page.screenshot({ path: `${SHOTS}/${tag}-throw-picked.png`, scale: 'css' });

    // --- negative control: the OLD ring must be caught by the same detector ---
    await page.addStyleTag({ content: OLD_THROW });
    await page.waitForTimeout(250);
    await page.screenshot({ path: `${SHOTS}/${tag}-throw-picked-before.png`, scale: 'css' });
    await page.locator('#discard').screenshot({ path: `${SHOTS}/${tag}-pile-picked-before.png` });
    const oldScore = contourScore(await edgeProfile(page));
    check(oldScore.ring > 40, `${tag}: the old ring IS caught by the detector (near ${oldScore.near} vs 2.5px ${oldScore.far} = +${oldScore.ring})`);
    const oldScale = (await boxes(page)).discard.w / beforePx.w;
    check(Math.abs(oldScale - 1.08) < 0.01, `${tag}: the old swell was 1.08 (${oldScale.toFixed(3)})`);
    await page.close();
  }

  // ---------- 2b: Reduce motion still ends bigger ----------
  {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 });
    await settingsOn(page, true);
    watch(page);
    page.setDefaultTimeout(120_000);
    const card = await toThrow(page, 871390);
    const rest = await boxes(page);
    const point = await visiblePoint(page, card);
    await page.mouse.click(point!.x, point!.y);
    await page.waitForFunction(() => document.getElementById('discard')?.classList.contains('futa04-throw-target'), undefined, { timeout: 3000 });
    await page.waitForTimeout(120);
    const settled = await page.locator('#discard').evaluate((el) => {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      const m = new DOMMatrixReadOnly(cs.transform);
      return { transform: cs.transform, scale: Math.hypot(m.a, m.b), transition: cs.transitionProperty, w: r.width, h: r.height };
    });
    check(await page.evaluate(() => document.documentElement.classList.contains('reduce-motion')), 'reduce motion: the in-app preference is on');
    check(Math.abs(settled.scale - 1.16) < 0.005, `reduce motion: the pile still ends bigger (${settled.transform})`);
    check(settled.w >= rest.discard.w + 6, `reduce motion: ${rest.discard.w} → ${settled.w.toFixed(2)}px wide`);
    check(settled.transition === 'none', `reduce motion: no transition (${settled.transition})`);
    await page.screenshot({ path: `${SHOTS}/390x844-reduce-motion-picked.png`, scale: 'css' });
    await page.close();
  }

  // ---------- 3: the Bloom gold, before and after on one page ----------
  {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 });
    await settingsOn(page, true);
    watch(page);
    page.setDefaultTimeout(120_000);
    await page.goto(`${BASE}?seed=14`);
    await page.waitForSelector('#discard.futa04-bloom-draw', { timeout: 60000 });
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${SHOTS}/390x844-bloom-gold.png`, scale: 'css' });
    await page.locator('#discard .pile-top').screenshot({ path: `${SHOTS}/390x844-bloom-gold-pile.png` });

    const after = await glowProfile(page);
    const brightest = after.reduce((a, b) => (b.v > a.v ? b : a));
    const saturated = after.reduce((a, b) => (b.s > a.s ? b : a));
    check(brightest.d <= 1.5, `gold: the brightest glow pixel is at the core (${brightest.d}px out)`);
    check(brightest.v >= 0.85, `gold: the core is near-white (v ${brightest.v}, hue ${brightest.h})`);
    check(brightest.s <= 0.28, `gold: the core carries almost no chroma (s ${brightest.s})`);
    check(saturated.d >= 2 && saturated.d <= 9, `gold: peak chroma sits in the falloff (${saturated.d}px out)`);
    check(saturated.s >= 0.45, `gold: the falloff is a richer gold (s ${saturated.s}, hue ${saturated.h})`);
    check(brightest.v > saturated.v + 0.3, `gold: lightness peaks at the core, not at the chroma (${brightest.v} vs ${saturated.v})`);

    // The same sampler against the OLD rule: it must fail the new criteria.
    await page.addStyleTag({ content: OLD_GOLD });
    await page.waitForTimeout(350);
    await page.locator('#discard .pile-top').screenshot({ path: `${SHOTS}/390x844-bloom-gold-before-pile.png` });
    const before = await glowProfile(page);
    const oldBrightest = before.reduce((a, b) => (b.v > a.v ? b : a));
    const oldSaturated = before.reduce((a, b) => (b.s > a.s ? b : a));
    check(oldBrightest.v < 0.75, `gold: the old core was dull (v ${oldBrightest.v})`);
    check(oldSaturated.s > 0.6 && oldSaturated.v > 0.5,
      `gold: the old peak chroma was the mustard rim (hue ${oldSaturated.h}, s ${oldSaturated.s}, v ${oldSaturated.v} at ${oldSaturated.d}px)`);
    check(oldSaturated.d <= 1.5, `gold: the old mustard sat ON the rim (${oldSaturated.d}px)`);
    console.log(`  · gold peak lightness ${oldBrightest.v} → ${brightest.v}; peak chroma ${oldSaturated.s} at ${oldSaturated.d}px → ${saturated.s} at ${saturated.d}px`);
    await page.close();
  }
} finally {
  await browser.close();
  await served?.server.close();
}

check(errors.length === 0, `no page errors (${errors.join(' | ') || 'none'})`);
console.log(`\nthrow-pile-presentation: ${checks} checks passed`);
