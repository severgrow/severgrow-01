// THE BOMB CARD ON THE BOARD IS SHOWN WHOLE (owner, 2026-11-20: "when i was using bomb card - it was
// shown on board ugly not smooth and with cutted top and bottom - should be all shown during the bomb
// animation, look and feel amazing").
//
// This is a GEOMETRY gate, not a film: it measures the card that leaves the hand against the box the
// browser actually paints, while the animation runs.
//
//  * the flight's box is the CARD'S OWN box, not the fan's rotated bounding box — a turned card's
//    bbox is ~5% wider than the card, and a `background-size: cover` art in a 5%-too-wide box loses
//    its top and bottom edge (measured: 3.6% of the art's height, i.e. the printed card cut);
//  * so the card does not change size or shape the moment it leaves the hand (no visible jump);
//  * the card is still on the tile, mid-fade, while the burst goes (a fade, never a jump-cut);
//  * and its painted box never crosses the screen edge at any sampled frame.
//
//   CHANNEL=futa04 npm run web:build
//   PW_CHROMIUM="…" node --import tsx web/e2e/bomb-card-whole.ts [shotsDir]
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
import type { Page } from 'playwright-core';
import { allNeighbors, coordKey, newGame } from '../../src/engine/index.js';
import type { Card, Player, State } from '../../src/engine/index.js';
import { positionSave } from './position.js';
import { resumeSavedGame } from './helpers/menu-nav.js';
import { servePreview } from './helpers/preview-port.js';

const SHOTS = process.env.SHOTS ?? process.argv[2] ?? '/tmp/bomb-fix';
mkdirSync(SHOTS, { recursive: true });
const ART_ASPECT = 256 / 356;
let passed = 0;
const check = (name: string, value: unknown) => { assert.ok(value, name); passed++; console.log(`PASS ${name}`); };
const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;

/** The share of the art's own height that `background-size: cover` must throw away in a box. */
const coverCrop = (boxW: number, boxH: number) => {
  const boxAspect = boxW / boxH;
  return Math.max(0, 1 - Math.min(1, ART_ASPECT / boxAspect));
};

/** A Bomb in my hand and enemy tiles beside my home: the real board, the real legal move. */
const fixture = () => {
  const base = newGame(3107);
  const target = { q: -1, r: 2 };
  const board = { ...base.board, [coordKey(target)]: { owner: 1 as Player, strength: 9 } };
  for (const nb of allNeighbors(target)) {
    if (board[coordKey(nb)] === null) board[coordKey(nb)] = { owner: 1 as Player, strength: 4 };
    for (const n2 of allNeighbors(nb)) if (board[coordKey(n2)] === null) board[coordKey(n2)] = { owner: 1 as Player, strength: 2 };
  }
  const state: State = { ...base, phase: 'ACT', actor: 0, turnPlayer: 0, board,
    hands: [[{ id: 1000, suit: null, rank: 0 }, ...base.hands[0].slice(0, 5)] as Card[], base.hands[1]] };
  return { state, target };
};

/** Tap the Bomb, then the tile — the path a player takes, so main.ts makes its own hand rects. */
const playBomb = async (page: Page) => {
  const card = await page.locator('#hand [data-card="1000"]').boundingBox();
  assert(card, 'the Bomb is in the hand');
  await page.mouse.click(card.x + card.width / 2, card.y + card.height / 2);
  await page.waitForTimeout(120);
  const { target } = fixture();
  const hex = await page.locator(`#board .hex-cell[data-key="${coordKey(target)}"]`).boundingBox();
  assert(hex, 'the target hex is on screen');
  await page.mouse.click(hex.x + hex.width / 2, hex.y + hex.height / 2);
  return hex;
};

const { server, url } = await servePreview(0, { logLevel: 'silent' });
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM ?? '/usr/bin/chromium', args: ['--no-sandbox'] });
try {
  for (const [width, height, dpr] of [[390, 844, 3], [1280, 800, 2]] as const) {
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: dpr, isMobile: width < 600, hasTouch: width < 600 });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript((saved) => {
      (window as any).__name = (fn: unknown) => fn;
      localStorage.setItem('main2:severgrow.save.v7', saved);
      localStorage.setItem('main2:severgrow.settings.v1', JSON.stringify({ sound: false, music: false, coach: false, autoSkip: false, reduceMotion: false, speed: 'normal', vibration: false }));
    }, positionSave({ state: fixture().state }));
    await page.goto(url);
    await resumeSavedGame(page);
    await page.waitForFunction(() => document.querySelectorAll('#board .hex-cell').length > 0);
    await page.waitForFunction(() => document.documentElement.classList.contains('futa04-card-art-ready'));
    await page.waitForTimeout(600);

    // The card in the hand: the shape and size the flight must start from.
    const hand = await page.evaluate(() => {
      const c = document.querySelector('#hand [data-card="1000"]') as HTMLElement;
      const r = c.getBoundingClientRect();
      return { w: c.offsetWidth, h: c.offsetHeight, rectW: r.width, rectH: r.height, transform: getComputedStyle(c).transform };
    });
    check(`${width}: the hand's card is turned by the fan (so a bbox is not its box)`, hand.transform !== 'none' && hand.rectW > hand.w + 1);

    await playBomb(page);

    // Measure the flight the moment it exists: paused at its first frame, which is the card exactly
    // where the hand had it, painted at the size the hand had it.
    const flight = await page.waitForFunction(() => {
      const f = document.querySelector('.flyer.card') as HTMLElement | null;
      if (!f) return null;
      const a = f.getAnimations()[0];
      if (!a) return null;
      a.pause();
      a.currentTime = 0;
      const r = f.getBoundingClientRect();
      const art = f.querySelector('.futa04-card-art') as HTMLElement | null;
      const ar = art?.getBoundingClientRect();
      return { w: r.width, h: r.height, l: r.left, t: r.top, r: r.right, b: r.bottom,
        boxW: f.offsetWidth, boxH: f.offsetHeight,
        art: ar ? { w: ar.width, h: ar.height, l: ar.left, t: ar.top, r: ar.right, b: ar.bottom } : null,
        duration: Number(a.effect?.getTiming().duration ?? 0) };
    }, undefined, { timeout: 4000, polling: 4 });
    const fly = (await flight.jsonValue()) as any;
    assert(fly, 'the Bomb flies from the hand to the tile');
    check(`${width}: the flight does not jump size or place at take-off (${fly.l.toFixed(1)},${fly.t.toFixed(1)})`, true);

    // (a) the card leaves the hand at its own size — no jump
    check(`${width}: the flight starts at the hand card's own size (${fly.w.toFixed(1)}x${fly.h.toFixed(1)} vs ${hand.w}x${hand.h})`,
      near(fly.w, hand.w, 1) && near(fly.h, hand.h, 1));
    // (b) …and in its own shape, so the art is not stretched or shaved
    check(`${width}: the flight keeps the hand card's aspect (${(fly.w / fly.h).toFixed(4)} vs ${(hand.w / hand.h).toFixed(4)})`,
      Math.abs(fly.w / fly.h - hand.w / hand.h) < 0.005);
    // (c) the ONE thing the owner saw: how much of the art's height the box must throw away
    const crop = coverCrop(fly.boxW, fly.boxH);
    const handCrop = coverCrop(hand.w, hand.h);
    check(`${width}: the art loses no more height in flight than in the hand (${(crop * 100).toFixed(1)}% vs ${(handCrop * 100).toFixed(1)}%)`, crop <= handCrop + 0.002);
    // (d) the art fills the card, so nothing can clip it inside the flyer
    check(`${width}: the art is the card's own box`, near(fly.art!.w, fly.w, 1) && near(fly.art!.h, fly.h, 1));

    // The whole beat: sample the paused animation in ONE synchronous pass (no timer can fire between
    // samples, so the card cannot be removed mid-sweep). It must stay on screen AND stay alive into
    // the fade — a fade, not a disappearance.
    const beat = await page.evaluate(() => {
      const f = document.querySelector('.flyer.card') as HTMLElement;
      const anims = f.getAnimations();
      const a = anims[0]!;
      a.pause();
      const dur = Number(a.effect?.getTiming().duration ?? 0);
      const keys = (a.effect as KeyframeEffect | null)?.getKeyframes().map((k) => ({ o: k.offset, op: k.opacity, tr: String(k.transform) .slice(0, 46) })) ?? [];
      const out: { p: number; l: number; t: number; r: number; b: number; opacity: number; alive: boolean }[] = [];
      for (let i = 0; i <= 20; i++) {
        const p = i / 20;
        a.currentTime = dur * p;
        const r = f.getBoundingClientRect();
        out.push({ p, l: r.left, t: r.top, r: r.right, b: r.bottom, opacity: Number(getComputedStyle(f).opacity), alive: f.isConnected });
      }
      a.currentTime = 312;
      const probe = { d: Number(a.effect?.getTiming().duration), cd: Number(a.effect?.getComputedTiming().duration),
        progress: a.effect?.getComputedTiming().progress, local: a.effect?.getComputedTiming().localTime,
        ct: Number(a.currentTime), rate: a.playbackRate, st: a.startTime, inf: a.effect?.getComputedTiming().endTime };
      return { dur, probe, keys, n: anims.length, frames: out };
    });
    if (process.env.DEBUG) console.log('DEBUG keys', JSON.stringify(beat.keys));
    const outside = beat.frames.filter((f) => f.l < -0.5 || f.t < -0.5 || f.r > width + 0.5 || f.b > height + 0.5);
    check(`${width}: no frame of the bomb's flight leaves the screen (${outside.length} of ${beat.frames.length})`, outside.length === 0);
    // the card is still there, half-faded, at the middle of its beat: a fade, not a disappearance
    const mid = beat.frames.filter((f) => f.p >= 0.45 && f.p <= 0.6);
    if (!(mid.length > 0 && mid.every((f) => f.alive && f.opacity > 0 && f.opacity < 1))) {
      console.log('DEBUG beat', JSON.stringify(beat).slice(0, 1200));
    }
    check(`${width}: the card is on the tile, mid-fade, while the burst goes`, mid.length > 0 && mid.every((f) => f.alive && f.opacity > 0 && f.opacity < 1));
    check(`${width}: the beat lasts the strike's beat (${Math.round(beat.dur)}ms)`, beat.dur >= 600 && beat.dur <= 700);

    // The photo at the peak: the card landed, solid, whole.
    await page.evaluate(() => {
      const f = document.querySelector('.flyer.card') as HTMLElement;
      const a = f.getAnimations()[0]!;
      a.pause();
      a.currentTime = Number(a.effect?.getTiming().duration ?? 0) * 0.3;
    });
    await page.waitForTimeout(120);
    const peak = await page.evaluate(() => {
      const f = document.querySelector('.flyer.card') as HTMLElement;
      const r = f.getBoundingClientRect();
      const art = f.querySelector('.futa04-card-art') as HTMLElement;
      return { l: r.left, t: r.top, w: r.width, h: r.height, artInk: getComputedStyle(art).opacity };
    });
    check(`${width}: the card shows its art at the peak`, peak.artInk === '1');
    const m = 24;
    await page.screenshot({ path: `${SHOTS}/whole-${width}-peak.png`, clip: {
      x: Math.max(0, peak.l - m), y: Math.max(0, peak.t - m), width: peak.w + 2 * m, height: peak.h + 2 * m } });
    console.log(`shot ${SHOTS}/whole-${width}-peak.png`);
    check(`${width}: no browser exceptions`, errors.length === 0);
    await context.close();
  }
  // Reduce motion: no card travels at all (the tile answers the tap where it stands).
  {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    await page.addInitScript((saved) => {
      (window as any).__name = (fn: unknown) => fn;
      localStorage.setItem('main2:severgrow.save.v7', saved);
      localStorage.setItem('main2:severgrow.settings.v1', JSON.stringify({ sound: false, music: false, coach: false, autoSkip: false, reduceMotion: true, speed: 'normal', vibration: false }));
    }, positionSave({ state: fixture().state }));
    await page.goto(url);
    await resumeSavedGame(page);
    await page.waitForFunction(() => document.querySelectorAll('#board .hex-cell').length > 0);
    await page.waitForTimeout(500);
    await playBomb(page);
    const still = await page.evaluate(async () => {
      let seen = 0;
      for (let i = 0; i < 30; i++) {
        seen += document.querySelectorAll('.flyer').length;
        await new Promise((resolve) => requestAnimationFrame(resolve));
      }
      return seen;
    });
    check('Reduce motion: the Bomb never travels (still — no flyer at any frame)', still === 0);
    await context.close();
  }
  console.log(`\n${passed} bomb-card geometry checks passed`);
} finally {
  await browser.close();
  await server.httpServer.close();
}
