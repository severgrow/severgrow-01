// Owner change 2026-10-25: the Throw step.
//   - one tap picks the card; the SAME card tapped again DESELECTS and never throws;
//   - there are three throws: swipe up, drag the card onto the Throw pile, tap the pile;
//   - the swipe-up gets one small boomerang (hand -> board -> pile), presentation only.
//
// Real pointer gestures (page.mouse with steps) drive the recognition itself, not a helper call.
// Screenshots land in /tmp/swipe-throw/. Build CHANNEL=futa04 first.
//
//   PW_CHROMIUM="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
//     node --import tsx web/e2e/futa04-swipe-throw.ts
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
import type { CDPSession, Page } from 'playwright-core';
import { servePreview } from './helpers/preview-port.js';
import { legalActions, viewFor } from '../../src/engine/index.js';
import type { Action, State } from '../../src/engine/index.js';

const SHOTS = '/tmp/swipe-throw';
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
const visiblePoint = async (p: Page, id: number) => {
  const point = await p.locator(`#hand [data-card="${id}"]`).evaluate((el) => {
    const r = el.getBoundingClientRect();
    for (const xf of [0.08, 0.2, 0.35, 0.5, 0.7, 0.9])
      for (const yf of [0.2, 0.45, 0.7, 0.85]) {
        const x = r.left + r.width * xf;
        const y = r.top + r.height * yf;
        if (document.elementFromPoint(x, y)?.closest('#hand .card') === el) return { x, y };
      }
    return null;
  }, undefined, { timeout: 120_000 });
  assert(point, `card ${id} has an exposed surface`);
  return point as { x: number; y: number };
};

/** Start a fresh Throw step: draw, leave Grow, and read the forced card. */
const toThrow = async (p: Page, seed: number) => {
  await p.goto(`${BASE}?seed=${seed}`);
  // The Who-starts ritual covers the hand and holds the game's input gate while it deals. Wait
  // for it to appear and then finish: the overlay starts hidden, so "wait until hidden" can
  // resolve before the ritual has even begun (and a bypassed gate dims the pile out of turn).
  await p.waitForSelector('#starter-lottery', { state: 'visible', timeout: 60000 });
  await p.waitForSelector('#starter-lottery', { state: 'hidden', timeout: 60000 });
  await idle(p);
  await playFor(p, find(await state(p), 'Draw'));
  await idle(p);
  const act = await state(p);
  if (act.phase === 'ACT') {
    const end = legalActions(viewFor(act, 0)).find((a) => a.t === 'EndAct');
    assert(end, 'Grow can be left');
    await playFor(p, end);
    await idle(p);
  }
  const s = await state(p);
  assert.equal(s.phase, 'DISCARD');
  const card = find(s, 'Discard');
  assert.equal(card.t, 'Discard');
  // The turn hand-over and the Throw dim are CSS transitions: let the fan stop before measuring.
  await p.waitForTimeout(450);
  return { before: s, card: card.card };
};

const tapCard = async (p: Page, id: number, touch: boolean) => {
  const pt = await visiblePoint(p, id);
  if (touch) await p.touchscreen.tap(pt.x, pt.y);
  else await p.mouse.click(pt.x, pt.y);
};

const pilePoint = async (p: Page) => {
  const r = await p.locator('#discard').boundingBox();
  assert(r, 'the Throw pile has a box');
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
};

/** The pile's own visual state: dim class, opacity/brightness, the one swell and its origin. */
type PileLook = {
  dim: boolean;
  target: boolean;
  ready: boolean;
  opacity: number;
  filter: string;
  scale: number;
  originX: number;
  originY: number;
  /** The layout box (transform-free): transform-origin is relative to this, not the swollen rect. */
  width: number;
  height: number;
};
const pileLook = (p: Page, selector = '#discard'): Promise<PileLook> =>
  p.locator(selector).evaluate((el) => {
    const cs = getComputedStyle(el);
    let scale = 1;
    if (cs.transform && cs.transform !== 'none') {
      const m = new DOMMatrixReadOnly(cs.transform);
      scale = Math.hypot(m.a, m.b);
    }
    const [ox = '0', oy = '0'] = cs.transformOrigin.split(' ');
    return {
      dim: el.classList.contains('dim'),
      target: el.classList.contains('futa04-throw-target'),
      ready: el.classList.contains('ready'),
      opacity: Number(cs.opacity),
      filter: cs.filter,
      scale,
      originX: parseFloat(ox),
      originY: parseFloat(oy),
      width: el.clientWidth,
      height: el.clientHeight,
    };
  });

/** A real pointer swipe with intermediate moves (the gesture recogniser sees every step). */
const mouseSwipe = async (p: Page, from: { x: number; y: number }, to: { x: number; y: number }, steps = 10) => {
  await p.mouse.move(from.x, from.y);
  await p.mouse.down();
  for (let i = 1; i <= steps; i++) {
    await p.mouse.move(from.x + ((to.x - from.x) * i) / steps, from.y + ((to.y - from.y) * i) / steps);
  }
  await p.mouse.up();
};

/** The real phone path: CDP touch events, so touch-action and pull-to-refresh are actually in play. */
const cdpFor = new WeakMap<Page, CDPSession>();
const touchSwipe = async (p: Page, from: { x: number; y: number }, to: { x: number; y: number }, steps = 10) => {
  let cdp = cdpFor.get(p);
  if (!cdp) {
    cdp = await p.context().newCDPSession(p);
    cdpFor.set(p, cdp);
  }
  const point = (x: number, y: number) => [{ x, y, id: 1, radiusX: 6, radiusY: 6, force: 1 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: point(from.x, from.y) });
  for (let i = 1; i <= steps; i++) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: point(from.x + ((to.x - from.x) * i) / steps, from.y + ((to.y - from.y) * i) / steps),
    });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
};

type FlightSample = { x: number; y: number; rot: number; target: boolean; pileScale: number; pileX: number; pileY: number };
type FlightRecord = {
  samples: FlightSample[];
  transforms: string[];
  heldTarget: boolean;
  heldScale: number;
  landing?: { x: number; y: number; pileX: number; pileY: number };
};

/**
 * Watches the real flyer from the moment it is added. It records:
 *   - the authored WAAPI transform frames (so the turn is checked even when frames are starved);
 *   - whether the Throw pile was still the swollen target when the flight began;
 *   - the flyer's and the pile's rects when the animation FINISHES (the landing).
 * Installed BEFORE the gesture and read afterwards: a single awaited evaluate can be dispatched
 * after the gesture (two CDP channels), missing a whole 570 ms flight and calling it "no flyer".
 */
const startFlyerTracking = (p: Page, ms = 1600): Promise<void> =>
  p.evaluate((duration) => {
    const w = window as unknown as {
      __flight?: {
        samples: { x: number; y: number; rot: number; target: boolean; pileScale: number; pileX: number; pileY: number }[];
        done: boolean;
        transforms: string[];
        heldTarget: boolean;
        heldScale: number;
        landing?: { x: number; y: number; pileX: number; pileY: number };
      };
    };
    w.__flight = { samples: [], done: false, transforms: [], heldTarget: false, heldScale: 1 };
    // No named inner functions: esbuild's keepNames injects `__name` into those, and that helper
    // does not exist inside page.evaluate.
    new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (!(node instanceof HTMLElement) || !node.classList.contains('flyer')) continue;
          const flight = w.__flight!;
          const discard = document.getElementById('discard');
          if (discard) {
            flight.heldTarget = discard.classList.contains('futa04-throw-target');
            const ds = getComputedStyle(discard);
            if (ds.transform && ds.transform !== 'none') {
              const pm = new DOMMatrixReadOnly(ds.transform);
              flight.heldScale = Math.hypot(pm.a, pm.b);
            }
          }
          const anim = node.getAnimations().find((a) => a.effect instanceof KeyframeEffect);
          if (anim && anim.effect instanceof KeyframeEffect) {
            // The authored motion, read from the animation itself (not from sampled frames).
            const frames = anim.effect.getKeyframes();
            const last = String(frames.at(-1)?.transform ?? '');
            flight.transforms = frames.map((k) => String(k.transform ?? ''));
            const start = node.getBoundingClientRect();
            const startX = start.left + start.width / 2;
            const startY = start.top + start.height / 2;
            anim.finished
              .then(() => {
                // Remove-after can win the race with `finished`; derive the landing from the
                // last authored keyframe (translate from the flyer's own starting centre) and
                // compare it with where the pile really is now.
                const move = /translate\(([-\d.]+)px, ([-\d.]+)px\)/.exec(last);
                const face = discard?.querySelector('.pile-card') ?? discard;
                if (!move || !face) return;
                const p = face.getBoundingClientRect();
                flight.landing = {
                  x: startX + Number(move[1]),
                  y: startY + Number(move[2]),
                  pileX: p.left + p.width / 2,
                  pileY: p.top + p.height / 2,
                };
              })
              .catch(() => undefined);
          }
        }
      }
    }).observe(document.body, { childList: true });
    // The sampled frames are a fallback and a per-frame hold check; they never gate the landing.
    void (async () => {
      const t0 = performance.now();
      while (performance.now() - t0 < duration) {
        const f = document.querySelector('.flyer') as HTMLElement | null;
        if (f) {
          const r = f.getBoundingClientRect();
          let rot = 0;
          try {
            const m = new DOMMatrixReadOnly(getComputedStyle(f).transform);
            rot = (Math.atan2(m.b, m.a) * 180) / Math.PI;
          } catch { /* transform: none on a not-yet-started frame */ }
          const discard = document.getElementById('discard')!;
          const ds = getComputedStyle(discard);
          let pileScale = 1;
          if (ds.transform && ds.transform !== 'none') {
            const pm = new DOMMatrixReadOnly(ds.transform);
            pileScale = Math.hypot(pm.a, pm.b);
          }
          const face = discard.querySelector('.pile-card') ?? discard;
          const live = face.getBoundingClientRect();
          w.__flight!.samples.push({
            x: r.left + r.width / 2,
            y: r.top + r.height / 2,
            rot,
            target: discard.classList.contains('futa04-throw-target'),
            pileScale,
            pileX: live.left + live.width / 2,
            pileY: live.top + live.height / 2,
          });
        }
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      }
      w.__flight!.done = true;
    })();
  }, ms);

const readFlyerTracking = (p: Page): Promise<FlightRecord> =>
  p.evaluate(async () => {
    const w = window as unknown as {
      __flight?: {
        samples: unknown[];
        done: boolean;
        transforms: string[];
        heldTarget: boolean;
        heldScale: number;
        landing?: { x: number; y: number; pileX: number; pileY: number };
      };
    };
    const flight = w.__flight;
    if (!flight) return { samples: [], transforms: [], heldTarget: false, heldScale: 1, landing: undefined };
    const t0 = performance.now();
    while (!flight.done && performance.now() - t0 < 5000) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    }
    // The animation can finish a tick after the frame loop does; give its promise a beat.
    if (!flight.landing) {
      const wait = performance.now();
      while (!flight.landing && performance.now() - wait < 800) {
        await new Promise<void>((resolve) => setTimeout(resolve, 16));
      }
    }
    return {
      samples: flight.samples,
      transforms: flight.transforms,
      heldTarget: flight.heldTarget,
      heldScale: flight.heldScale,
      landing: flight.landing,
    };
  }) as Promise<FlightRecord>;

try {
  for (const [w, h, touch] of [[390, 844, true]] as const) {
    const tag = `${w}x${h}`;
    const page = await browser.newPage({ viewport: { width: w, height: h }, hasTouch: touch, isMobile: touch });
    // A background tab can pause requestAnimationFrame; the flight tracker samples frames.
    await page.bringToFront();
    // This suite can run beside other browser suites; a starved renderer must not look like a bug.
    page.setDefaultTimeout(120_000);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript(() => {
      try {
        for (let i = localStorage.length - 1; i >= 0; i--) {
          const k = localStorage.key(i);
          if (k && k.includes('save')) localStorage.removeItem(k);
        }
      } catch { /* storage blocked */ }
      const settings = JSON.stringify({
        sound: false, music: false, coach: false, speed: 'normal', reduceMotion: false, autoSkip: false, confirmPolicy: 'never',
      });
      for (const k of ['severgrow.settings.v1', 'main2:severgrow.settings.v1', 'futa04:severgrow.settings.v1'])
        localStorage.setItem(k, settings);
    });
    const gesture = (from: { x: number; y: number }, to: { x: number; y: number }, steps = 10) =>
      touch ? touchSwipe(page, from, to, steps) : mouseSwipe(page, from, to, steps);

    // 1. One tap selects; the same card tapped again DESELECTS and commits nothing.
    let { before, card } = await toThrow(page, 810000 + w);
    // Owner cue, 2026-10-25: the Throw pile is never dimmed during the Throw step, even before a
    // card is picked. The deck is the thing that recedes.
    // The step's class flips a frame after the state; wait for the product to apply it rather
    // than sampling a stale render.
    await page.waitForFunction(() => {
      const d = document.getElementById('discard');
      return !!d && !d.classList.contains('dim') && getComputedStyle(d).opacity === '1';
    }, undefined, { timeout: 5000 });
    const idlePile = await pileLook(page);
    check(!idlePile.dim && idlePile.opacity === 1, `${tag}: the Throw pile is never dimmed in the Throw step`);
    check((await pileLook(page, '#deck')).opacity < 0.7, `${tag}: the deck recedes while the Throw pile stays lit`);
    const deckBox = await page.locator('#deck').boundingBox();
    const handBox = await page.locator('#hand').boundingBox();
    await tapCard(page, card, touch);
    await page.waitForFunction(() => {
      const d = document.getElementById('discard');
      if (!d?.classList.contains('futa04-throw-target')) return false;
      const t = getComputedStyle(d).transform;
      if (!t || t === 'none') return false;
      const m = new DOMMatrixReadOnly(t);
      return Math.hypot(m.a, m.b) >= 1.079;
    }, undefined, { timeout: 3000 });
    let s = await state(page);
    check(JSON.stringify(s) === JSON.stringify(before), `${tag}: the first tap does not throw`);
    check((await page.locator('#hand .futa04-throw-picked').count()) === 1, `${tag}: the first tap selects the card`);
    // The pile swells once, about its own centre-bottom, with transform only (no reflow).
    const picked = await pileLook(page);
    check(picked.target, `${tag}: selection marks the Throw pile as the target`);
    check(picked.scale >= 1.06 && picked.scale <= 1.12, `${tag}: the target swells slightly (${picked.scale.toFixed(3)})`);
    check(picked.opacity === 1, `${tag}: the target stays fully opaque`);
    check(/brightness\(1\.[12]/.test(picked.filter), `${tag}: the target's edge light brightens (${picked.filter})`);
    check(Math.abs(picked.originX - picked.width / 2) <= 1, `${tag}: the swell is centred on the pile (${picked.originX} vs ${picked.width / 2})`);
    check(Math.abs(picked.originY - picked.height / 2) <= 1, `${tag}: the swell is centred vertically on the pile (${picked.originY} vs ${picked.height / 2})`);
    // Transform only: the layout boxes (and therefore the deck and the hand) are untouched.
    check(picked.width === idlePile.width && picked.height === idlePile.height,
      `${tag}: the swell does not reflow the pile (${picked.width}x${picked.height})`);
    const deckBoxAfter = await page.locator('#deck').boundingBox();
    const handBoxAfter = await page.locator('#hand').boundingBox();
    check(!!deckBox && !!deckBoxAfter && Math.abs(deckBox.x - deckBoxAfter.x) <= 1 && Math.abs(deckBox.y - deckBoxAfter.y) <= 1,
      `${tag}: the neighbouring deck does not move`);
    check(!!handBox && !!handBoxAfter && Math.abs(handBox.x - handBoxAfter.x) <= 1 && Math.abs(handBox.y - handBoxAfter.y) <= 1,
      `${tag}: the hand does not move`);
    if (touch) {
      check(await page.locator(`#hand [data-card="${card}"]`).evaluate((el) => getComputedStyle(el).touchAction === 'none'),
        `${tag}: the card owns the swipe (touch-action none)`);
      check(await page.evaluate(() => getComputedStyle(document.documentElement).overscrollBehaviorY === 'none'),
        `${tag}: no browser pull-to-refresh under the gesture`);
    }
    await page.screenshot({ path: `${SHOTS}/${tag}-01-selected.png` });

    await tapCard(page, card, touch);
    await page.waitForFunction(() => {
      const d = document.getElementById('discard');
      if (!d || d.classList.contains('futa04-throw-target')) return false;
      const t = getComputedStyle(d).transform;
      if (!t || t === 'none') return true;
      const m = new DOMMatrixReadOnly(t);
      return Math.hypot(m.a, m.b) <= 1.01;
    }, undefined, { timeout: 3000 });
    s = await state(page);
    check(JSON.stringify(s) === JSON.stringify(before), `${tag}: the second tap never throws`);
    check((await page.locator('#hand .futa04-throw-picked').count()) === 0, `${tag}: the second tap deselects`);
    const deselected = await pileLook(page);
    check(!deselected.target && Math.abs(deselected.scale - 1) <= 0.01, `${tag}: deselect settles the pile back (${deselected.scale.toFixed(3)})`);
    await page.screenshot({ path: `${SHOTS}/${tag}-02-deselected.png` });

    // 2. Swipe up on the card: a real gesture, committed immediately, with the boomerang flight.
    ({ before, card } = await toThrow(page, 810000 + w));
    const pt = await visiblePoint(page, card);
    const scrollBefore = await page.evaluate(() => window.scrollY);
    await startFlyerTracking(page);
    await gesture(pt, { x: pt.x, y: pt.y - 160 }, 10);
    // The commit is synchronous with pointerup; wait only long enough for the next task.
    await page.waitForTimeout(70);
    s = await state(page);
    check(s.discard.length === before.discard.length + 1, `${tag}: swipe up commits the throw at once`);
    check(await page.evaluate(() => window.scrollY) === scrollBefore, `${tag}: the swipe does not scroll the page`);
    // Three frames: the outward turn (~120ms), the aligned settle (~300ms), the return (~460ms).
    await page.screenshot({ path: `${SHOTS}/${tag}-03-swipe-mid-out.png` });
    await page.waitForTimeout(170);
    await page.screenshot({ path: `${SHOTS}/${tag}-04-swipe-mid-settle.png` });
    await page.waitForTimeout(160);
    await page.screenshot({ path: `${SHOTS}/${tag}-05-swipe-mid-return.png` });
    const flight = await readFlyerTracking(page);
    // The animation itself is the evidence (sampled frames can be starved on a busy renderer).
    check(!!flight.landing, `${tag}: the boomerang finished its flight`);
    check(flight.transforms.some((t) => /rotate\(-?[1-9][\d.]*deg\)/.test(t)),
      `${tag}: the card turns on its way (${flight.transforms.filter((t) => /rotate/.test(t)).join(' | ')})`);
    check(flight.transforms.some((t) => /rotate\(0deg\)/.test(t)), `${tag}: it aligns again`);
    const miss = Math.hypot((flight.landing?.x ?? 0) - (flight.landing?.pileX ?? 0), (flight.landing?.y ?? 0) - (flight.landing?.pileY ?? 0));
    check(miss <= 10, `${tag}: the return lands on the Throw pile (${miss.toFixed(1)}px off)`);
    await idle(page);
    await page.screenshot({ path: `${SHOTS}/${tag}-06-pile.png` });
    await page.waitForTimeout(80);
    check((await page.locator('.flyer').count()) === 0, `${tag}: the ghost is gone after the landing`);

    // 2b. Picked first: the pile is already swollen, and the boomerang must land on THAT rect —
    // the swell is part of the target, not a second box the flight misses.
    ({ before, card } = await toThrow(page, 810001 + w));
    await tapCard(page, card, touch);
    await page.waitForFunction(() => {
      const d = document.getElementById('discard');
      if (!d?.classList.contains('futa04-throw-target')) return false;
      const t = getComputedStyle(d).transform;
      if (!t || t === 'none') return false;
      const m = new DOMMatrixReadOnly(t);
      return Math.hypot(m.a, m.b) >= 1.079;
    }, undefined, { timeout: 3000 });
    const swell = await pileLook(page);
    check(swell.target && swell.scale >= 1.06, `${tag}: the picked card swells the pile before a swipe`);
    await page.screenshot({ path: `${SHOTS}/${tag}-09-selected-swell.png` });
    const pickedPt = await visiblePoint(page, card);
    await startFlyerTracking(page);
    await gesture(pickedPt, { x: pickedPt.x, y: pickedPt.y - 160 }, 10);
    await page.waitForTimeout(70);
    s = await state(page);
    check(s.discard.length === before.discard.length + 1, `${tag}: the picked card's swipe commits the throw`);
    // The owner's proof frames: the swollen pile stays the target while the card is out and home.
    await page.screenshot({ path: `${SHOTS}/${tag}-12-picked-mid-out.png` });
    await page.waitForTimeout(150);
    await page.screenshot({ path: `${SHOTS}/${tag}-13-picked-mid-settle.png` });
    await page.waitForTimeout(150);
    await page.screenshot({ path: `${SHOTS}/${tag}-14-picked-mid-return.png` });
    const pickedFlight = await readFlyerTracking(page);
    // The hold is captured when the flyer is born: a wall-clock check can land after the flight
    // on a slow renderer. The sampled frames are an additional witness when frames do run.
    const held = pickedFlight.heldTarget && pickedFlight.heldScale >= 1.06;
    const heldFrames = pickedFlight.samples.some((sample) => sample.target && sample.pileScale >= 1.06);
    check(held || heldFrames,
      `${tag}: the swollen pile is held while its card is away (held ${pickedFlight.heldTarget}/${pickedFlight.heldScale.toFixed(3)}; ${pickedFlight.samples.filter((sample) => sample.target).length}/${pickedFlight.samples.length} frames)`);
    const pickedMiss = Math.hypot(
      (pickedFlight.landing?.x ?? 0) - (pickedFlight.landing?.pileX ?? 0),
      (pickedFlight.landing?.y ?? 0) - (pickedFlight.landing?.pileY ?? 0),
    );
    check(!!pickedFlight.landing && pickedMiss <= 10, `${tag}: the boomerang lands on the swollen pile (${pickedMiss.toFixed(1)}px off)`);
    // Inspect as soon as the flight lets go: waiting for the next turn would also catch the Draw
    // step's own (legitimate) pile swell and confuse it with a stuck throw target.
    await page.waitForFunction(
      () => !document.getElementById('discard')?.classList.contains('futa04-throw-target'),
      undefined,
      { timeout: 5000 },
    );
    await page.waitForTimeout(240);
    const settled = await pileLook(page);
    check(!settled.target && Math.abs(settled.scale - 1) <= 0.02, `${tag}: the pile is back to normal after the throw (${settled.scale.toFixed(3)})`);
    await page.screenshot({ path: `${SHOTS}/${tag}-10-after-swell.png` });
    await idle(page);

    // 3. Tap the pile with a card picked: the ordinary throw, no boomerang required.
    ({ before, card } = await toThrow(page, 810002 + w));
    await tapCard(page, card, touch);
    await page.waitForTimeout(120);
    const pile = await pilePoint(page);
    if (touch) await page.touchscreen.tap(pile.x, pile.y);
    else await page.locator('#discard').click();
    await page.waitForTimeout(120);
    s = await state(page);
    check(s.discard.length === before.discard.length + 1, `${tag}: tapping the pile throws the picked card`);
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${SHOTS}/${tag}-07-tap-pile.png` });
    await idle(page);

    // 4. A sloppy 16px swipe is still a tap: it deselects, never throws.
    ({ before, card } = await toThrow(page, 810004 + w));
    await tapCard(page, card, touch);
    await page.waitForTimeout(120);
    const slop = await visiblePoint(page, card);
    await gesture(slop, { x: slop.x, y: slop.y - 16 }, 4);
    await page.waitForTimeout(220);
    s = await state(page);
    check(JSON.stringify(s) === JSON.stringify(before), `${tag}: a short swipe never throws`);
    check((await page.locator('#hand .futa04-throw-picked').count()) === 0, `${tag}: a short swipe still deselects like a tap`);

    // 5. A gesture that starts on one card belongs to that card, even ending over another.
    ({ before, card } = await toThrow(page, 810006 + w));
    const handIds = (await state(page)).hands[0].map((c) => c.id);
    const other = handIds.find((id) => id !== card);
    if (other !== undefined) {
      const a = await visiblePoint(page, card);
      const b = await visiblePoint(page, other);
      // Cross toward the neighbour's column, but keep the gesture clearly upward (a mostly
      // sideways drag is not a swipe): the source is fixed at pointerdown, so the thrown card is
      // the one the gesture started on (also unit-tested in drag.test.ts).
      await gesture(a, { x: a.x + (b.x - a.x) * 0.3, y: a.y - 140 }, 10);
      await page.waitForTimeout(80);
      s = await state(page);
      const thrown = s.discard.at(-1)!;
      const original = before.hands[0].find((c) => c.id === card)!;
      check(s.discard.length === before.discard.length + 1, `${tag}: the swipe throws exactly one card (the one it started on)`);
      check(thrown.suit === original.suit && thrown.rank === original.rank, `${tag}: it is the ORIGINAL card (${original.rank})`);
      await idle(page);
    }

    // 6. Reduce motion / Speed off: the throw lands, but there is no flyer and no spin.
    // The app patches localStorage to add its channel prefix, so a post-boot setItem can double
    // the prefix. Write from an init script instead: it runs before the patch, exactly like the
    // settings the suite starts each page with.
    await page.addInitScript(() => {
      const settings = JSON.stringify({
        sound: false, music: false, coach: false, speed: 'normal',
        reduceMotion: true, autoSkip: false, confirmPolicy: 'never', largeText: false,
      });
      for (const k of ['severgrow.settings.v1', 'main2:severgrow.settings.v1', 'futa04:severgrow.settings.v1'])
        localStorage.setItem(k, settings);
    });
    await page.reload();
    await page.waitForFunction(() => document.documentElement.classList.contains('reduce-motion'), undefined, { timeout: 20000 });
    await idle(page);
    ({ before, card } = await toThrow(page, 810008 + w));
    // Reduce motion keeps the static emphasis (the light), but never the swell.
    await tapCard(page, card, touch);
    await page.waitForTimeout(220);
    const still = await pileLook(page);
    check(still.target, `${tag}: Reduce motion still marks the Throw pile`);
    check(Math.abs(still.scale - 1) <= 0.01, `${tag}: Reduce motion drops the swell (${still.scale.toFixed(3)})`);
    check(still.opacity === 1 && /brightness\(1\.[12]/.test(still.filter), `${tag}: Reduce motion keeps the brighter target`);
    await page.screenshot({ path: `${SHOTS}/${tag}-11-reduce-motion-selected.png` });
    await tapCard(page, card, touch); // put it down; the swipe below is the no-flight proof
    await page.waitForTimeout(180);
    const rp = await visiblePoint(page, card);
    await startFlyerTracking(page, 900);
    await gesture(rp, { x: rp.x, y: rp.y - 160 }, 10);
    await page.waitForTimeout(80);
    s = await state(page);
    check(s.discard.length === before.discard.length + 1, `${tag}: Reduce motion still commits the throw`);
    const quiet = await readFlyerTracking(page);
    check(quiet.samples.length === 0, `${tag}: Reduce motion draws no flight (${quiet.samples.length} flyers)`);
    await page.screenshot({ path: `${SHOTS}/${tag}-08-reduce-motion.png` });
    await idle(page);

    check(errors.length === 0, `${tag}: no page errors (${errors[0] ?? ''})`);
    await page.close();
  }
  console.log(`\nSWIPE-THROW E2E: ${checks} checks passed. Screenshots: ${SHOTS}`);
} finally {
  await browser.close();
  await served?.server.close();
}
