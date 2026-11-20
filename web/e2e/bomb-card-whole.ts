// THE BOMB CARD ON THE BOARD IS SHOWN WHOLE (owner, 2026-11-20: "when i was using bomb card - it was
// shown on board ugly not smooth and with cutted top and bottom - should be all shown during the bomb
// animation, look and feel amazing").
//
// This is the GEOMETRY proof, not a film. It audits the card that leaves the hand frame by frame
// while the real beat plays, and it measures the two ways a card can lose its top and bottom:
//
//  1. THE BOX IT IS PAINTED IN. The hand's cards are fanned (a few degrees each), so a card's
//     `getBoundingClientRect()` is the box AROUND the turned card — wider than the card itself. A
//     flight built from that box paints the face with `background-size: cover`, which then fits the
//     WIDTH and shaves the art's top and bottom. That was the owner's bug. So: the painted box's
//     aspect is measured at every frame and must never be wider than the art (256:356), and the
//     take-off frame must be the hand card's own box — the whole art height is visible or it fails.
//  2. A CLIPPING ANCESTOR. Every ancestor of the flyer is audited for a rule that could crop a
//     `position: fixed` descendant (`overflow`, `contain: paint/layout`, a filter/transform/…
//     that makes the ancestor its containing block). The measured flyer box must also stay inside
//     every ancestor that clips at all, and inside the screen, at every frame.
//
// It also pins the replay's beat (`logic/strike.ts`): the card lands at 2.15 hex radii (the replay's
// size), stays solid on the tile while the burst goes, fades out on the curve's cardOut marks (never
// a jump-cut), and the struck tile only goes after the burst has faded.
//
//   CHANNEL=futa04 npm run web:build
//   PW_CHROMIUM="…" node --import tsx web/e2e/bomb-card-whole.ts [shotsDir]
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
import type { Browser, Page } from 'playwright-core';
import { allNeighbors, coordKey, newGame } from '../../src/engine/index.js';
import type { Card, Player, State } from '../../src/engine/index.js';
import { positionSave } from './position.js';
import { resumeSavedGame } from './helpers/menu-nav.js';
import { servePreview } from './helpers/preview-port.js';

const SHOTS = process.env.SHOTS ?? process.argv[2] ?? '/tmp/bomb-fix2';
mkdirSync(SHOTS, { recursive: true });

/** The art's own aspect (`web/src/assets/cards/bomb.webp` is 256 x 356). */
const ART_ASPECT = 256 / 356;
/** The replay's card: `STRIKE_CARD_HEIGHT` hex radii of the tile's long side (`logic/strike.ts`). */
const CARD_RADII = 2.15;
/** `STRIKE_TIMING`: the replay's marks, as fractions of its `PINNED.bombBeat`. */
const BEAT = 624;
const LAND_END = 0.16;
const BURST = 0.36;
const BURST_END = 0.72;
const CARD_OUT_START = 0.42;
const CARD_OUT_END = 0.64;

let passed = 0;
const check = (name: string, value: unknown) => { assert.ok(value, name); passed++; console.log(`PASS ${name}`); };
const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;

/**
 * How much of the art's own height `background-size: cover` must throw away to fill a box of this
 * aspect. 0 means the top and bottom edge of the printed card are fully visible; > 0 is the cut.
 */
const coverCropY = (boxW: number, boxH: number) => {
  const boxAspect = boxW / boxH;
  return Math.max(0, 1 - Math.min(1, ART_ASPECT / boxAspect));
};

/** `translate(Xpx, Ypx) scale(S)` — the exact vocabulary `logic/strike.ts` builds frames in. */
const frameOf = (transform: string) => {
  const translate = /translate\(\s*(-?[\d.]+)px,\s*(-?[\d.]+)px\)/.exec(transform);
  const scale = /scale\(([\d.]+)\)/.exec(transform);
  assert(translate && scale, `a flight frame is a translate + scale: ${transform}`);
  return { x: Number(translate![1]), y: Number(translate![2]), scale: Number(scale![1]) };
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
  // EXACTLY ONE BOMB IN THE DECK'S HAND. A Bomb has no identity beyond "a Bomb", so a tap that picks
  // the target hex may play ANY legal Bomb on it — the dealt hand has four, and the flight then came
  // from another card than the one this suite measured. One Bomb makes the card that flies, the card
  // that was picked, by construction.
  const others = base.hands[0].filter((c) => c.suit !== null);
  const state: State = { ...base, phase: 'ACT', actor: 0, turnPlayer: 0, board,
    hands: [[{ id: 1000, suit: null, rank: 0 }, ...others.slice(0, 5)] as Card[], base.hands[1]] };
  return { state, target };
};

const openGame = async (browser: Browser, pageUrl: string, width: number, height: number, dpr: number, reduceMotion = false) => {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: dpr, isMobile: width < 600, hasTouch: width < 600 });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(({ saved, reduce }) => {
    (window as any).__name = (fn: unknown) => fn;
    localStorage.setItem('main2:severgrow.save.v7', saved);
    localStorage.setItem('main2:severgrow.settings.v1', JSON.stringify({ sound: false, music: false, coach: false, autoSkip: false, reduceMotion: reduce, speed: 'normal', vibration: false }));
  }, { saved: positionSave({ state: fixture().state }), reduce: reduceMotion });
  await page.goto(pageUrl);
  await resumeSavedGame(page);
  await page.waitForFunction(() => document.querySelectorAll('#board .hex-cell').length > 0);
  await page.waitForFunction(() => document.documentElement.classList.contains('futa04-card-art-ready'));
  await page.waitForTimeout(600);
  return { context, page, errors };
};

/** Tap the Bomb and let the selection lift settle, then take the card as the player sees it now. */
const pickBomb = async (page: Page) => {
  const { target } = fixture();
  const hand = page.locator('#hand [data-card="1000"]');
  const card = await hand.boundingBox();
  assert(card, 'the Bomb is in the hand');
  await page.mouse.click(card.x + card.width / 2, card.y + card.height / 2);
  await page.waitForTimeout(160);
  const hex = await page.locator(`#board .hex-cell[data-key="${coordKey(target)}"]`).boundingBox();
  assert(hex, 'the target hex is on screen');
  // Measured immediately before the tap that commits the move: this is the box the game records.
  const picked = await hand.evaluate((c) => {
    const r = c.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, w: r.width, h: r.height,
      ownW: (c as HTMLElement).offsetWidth, ownH: (c as HTMLElement).offsetHeight,
      transform: getComputedStyle(c).transform };
  });
  return { hex, picked, key: coordKey(target) };
};

const tapTarget = async (page: Page, box: { x: number; y: number; width: number; height: number }) =>
  page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);

type Sample = {
  t: number;
  w: number; h: number; left: number; top: number; right: number; bottom: number;
  opacity: number; alive: boolean;
  art: { left: number; top: number; right: number; bottom: number; opacity: number } | null;
  flash: number;
  tile: { opacity: number; animations: number };
};

type Flight = {
  boxW: number; boxH: number; styleLeft: number; styleTop: number;
  duration: number; keys: { offset?: number | null; transform?: string; opacity?: number | undefined }[];
};

/**
 * Sample every animation frame of the whole beat, in the page, and keep the flight's own first
 * keyframe. The sampler starts BEFORE the tap that commits the move, so its first sample can be the
 * take-off frame. The card's PAINTED box (the transformed `getBoundingClientRect`) is recorded —
 * that is what the player sees.
 */
const startSampler = (page: Page, key: string) => page.evaluate((tileKey) => {
  const w = window as unknown as { __samples: Sample[]; __flight: Flight | null; __chain: unknown[] | null; __stopSample: boolean };
  w.__samples = []; w.__flight = null; w.__chain = null; w.__stopSample = false;
  const visit = (node: Element) => {
    const s = getComputedStyle(node);
    const r = node.getBoundingClientRect();
    return {
      tag: node.tagName, id: (node as HTMLElement).id, cls: String((node as HTMLElement).className ?? '').slice(0, 64),
      overflow: `${s.overflowX}/${s.overflowY}`, contain: s.contain, filter: s.filter, transform: s.transform,
      clipPath: s.clipPath, willChange: s.willChange,
      /** A containing block for a `position: fixed` child: its overflow then crops that child. */
      trapsFixed: s.transform !== 'none' || s.filter !== 'none' || s.perspective !== 'none'
        || /(^|\s)(paint|layout|strict|content)(\s|$)/.test(s.contain) || /transform|filter|perspective/.test(s.willChange),
      clips: s.overflowX !== 'visible' || s.overflowY !== 'visible' || s.clipPath !== 'none',
      rect: [r.left, r.top, r.right, r.bottom].map((n) => +n.toFixed(2)),
    };
  };
  const tileEl = document.querySelector(`#board .tile[data-key="${tileKey}"]`);
  const t0 = performance.now();
  const tick = () => {
    if (w.__stopSample) return;
    const flyer = document.querySelector('.flyer.card') as HTMLElement | null;
    const r = flyer?.getBoundingClientRect();
    const artEl = flyer?.querySelector('.futa04-card-art');
    const ar = artEl?.getBoundingClientRect();
    // The ancestor chain is stable for a flyer (it is appended to <body>), so it is read once; the
    // flight's own first keyframe is recorded once, too.
    if (flyer && !w.__chain) {
      w.__chain = [];
      for (let e = flyer.parentElement; e; e = e.parentElement) (w.__chain as unknown[]).push(visit(e));
      const a = flyer.getAnimations()[0];
      const fx = a?.effect as KeyframeEffect | null;
      w.__flight = {
        boxW: flyer.offsetWidth, boxH: flyer.offsetHeight,
        styleLeft: Number.parseFloat(flyer.style.left), styleTop: Number.parseFloat(flyer.style.top),
        duration: Number(a?.effect?.getTiming().duration ?? 0),
        keys: (fx?.getKeyframes() ?? []).map((k) => ({ offset: k.offset, transform: String(k.transform), opacity: k.opacity === undefined ? undefined : Number(k.opacity) })),
      };
    }
    w.__samples.push({
      t: Math.round(performance.now() - t0),
      w: r?.width ?? 0, h: r?.height ?? 0, left: r?.left ?? 0, top: r?.top ?? 0, right: r?.right ?? 0, bottom: r?.bottom ?? 0,
      opacity: flyer ? Number(getComputedStyle(flyer).opacity) : 0,
      alive: !!flyer?.isConnected,
      art: ar ? { left: ar.left, top: ar.top, right: ar.right, bottom: ar.bottom, opacity: Number(getComputedStyle(artEl!).opacity) } : null,
      flash: document.querySelectorAll('#board .fx-flash').length,
      tile: tileEl ? { opacity: Number(getComputedStyle(tileEl).opacity), animations: tileEl.getAnimations().length } : { opacity: 1, animations: 0 },
    });
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}, key);

const readSampler = (page: Page) => page.evaluate(() => {
  const w = window as unknown as { __samples: Sample[]; __flight: Flight | null; __chain: unknown[] | null; __stopSample: boolean };
  w.__stopSample = true;
  return { samples: w.__samples, flight: w.__flight, chain: w.__chain ?? [] };
});

const { server, url } = await servePreview(0, { logLevel: 'silent' });
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM ?? '/usr/bin/chromium', args: ['--no-sandbox'] });
try {
  for (const [width, height, dpr] of [[390, 844, 3], [1280, 800, 2]] as const) {
    const { context, page, errors } = await openGame(browser, url, width, height, dpr);

    // The hand card is turned by the fan, so its bounding box is NOT the card: that box is what the
    // old flight used, and the source of the shaved top and bottom.
    const turned = await page.locator('#hand [data-card="1000"]').evaluate((c) => {
      const r = c.getBoundingClientRect();
      return { w: r.width, ownW: (c as HTMLElement).offsetWidth, transform: getComputedStyle(c).transform };
    });
    check(`${width}: the hand's card is turned by the fan (a bbox is not its box)`, turned.transform !== 'none' && turned.w > turned.ownW + 1);

    const { hex, picked, key } = await pickBomb(page);
    await startSampler(page, key);
    await tapTarget(page, hex);
    await page.waitForTimeout(1200);
    const { samples, flight, chain } = await readSampler(page) as { samples: Sample[]; flight: Flight | null; chain: Record<string, any>[] };

    const shown = samples.filter((s) => s.alive);
    const t0 = shown[0]?.t ?? 0;
    check(`${width}: no browser exceptions on the way in (${errors.join(' | ') || 'none'})`, errors.length === 0);

    // ── 1. NOTHING CAN CLIP IT ─────────────────────────────────────────────────────────────────
    // A fixed child is only cropped by an ancestor that both overflows and makes itself the child's
    // containing block. Print the whole chain so the reason is on record.
    console.log(`CHAIN ${width}`, JSON.stringify(chain));
    check(`${width}: the flyer has an audited ancestor chain (${chain.length} ancestors: ${chain.map((a) => `${a.tag}${a.id ? '#' + a.id : ''}[${a.overflow}]`).join(' > ')})`,
      chain.length >= 2);
    check(`${width}: no ancestor traps the fixed flyer inside its own overflow`,
      chain.every((a) => !(a.clips && a.trapsFixed)));

    // ── 2. THE ART IS WHOLE, FRAME BY FRAME ───────────────────────────────────────────────────
    // `cover` shaves the top and bottom when the painted box is wider than the art's own aspect.
    let worstCrop = 0, worstAspect = 0;
    for (const s of shown) {
      worstCrop = Math.max(worstCrop, coverCropY(s.w, s.h));
      worstAspect = Math.max(worstAspect, s.w / s.h);
    }
    console.log(`${width}: worst painted aspect ${worstAspect.toFixed(4)} vs art ${ART_ASPECT.toFixed(4)} -> ${(worstCrop * 100).toFixed(2)}% of the art's height cut`);
    check(`${width}: the art's top and bottom are whole at every frame (${(worstCrop * 100).toFixed(2)}% cut)`, worstCrop <= 0.002);
    const faceWrong = shown.filter((s) => !s.art || s.art.opacity !== 1 || Math.abs(s.art.left - s.left) > 0.6
      || Math.abs(s.art.top - s.top) > 0.6 || Math.abs(s.art.right - s.right) > 0.6 || Math.abs(s.art.bottom - s.bottom) > 0.6);
    check(`${width}: the face fills the flying card at every frame (${faceWrong.length} frames disagree)`, faceWrong.length === 0);

    // ── 3. ON SCREEN, INSIDE EVERY ANCESTOR THAT CLIPS AT ALL ─────────────────────────────────
    const offScreen = shown.filter((s) => s.left < -0.5 || s.top < -0.5 || s.right > width + 0.5 || s.bottom > height + 0.5);
    check(`${width}: no frame of the flight crosses the screen edge (${offScreen.length} of ${shown.length})`, offScreen.length === 0);
    const outsideChain = shown.filter((s) => chain.some((a) => a.clips && !a.trapsFixed
      && (s.left < a.rect[0] - 0.5 || s.top < a.rect[1] - 0.5 || s.right > a.rect[2] + 0.5 || s.bottom > a.rect[3] + 0.5)));
    check(`${width}: no frame leaves a clipping ancestor's box`, outsideChain.length === 0);

    // ── 4. THE TAKE-OFF IS THE HAND'S OWN CARD, AT THE HAND'S PLACE ───────────────────────────
    // (the sampled-footage sanity checks come first, so a broken sampler reports itself as such)
    check(`${width}: the flight was sampled frame by frame (${shown.length} frames over ${Math.round(samples.at(-1)!.t)}ms)`, shown.length >= 8);
    check(`${width}: the flight's own animation was captured`, !!flight && flight.keys.length >= 5);
    const k0 = frameOf(String(flight!.keys[0]!.transform));
    const startW = flight!.boxW * k0.scale;
    const startH = flight!.boxH * k0.scale;
    const startCx = flight!.styleLeft + flight!.boxW / 2 + k0.x;
    const startCy = flight!.styleTop + flight!.boxH / 2 + k0.y;
    check(`${width}: the flight starts at the hand card's own size (${startW.toFixed(1)}x${startH.toFixed(1)} vs ${picked.ownW}x${picked.ownH})`,
      near(startW, picked.ownW, 0.75) && near(startH, picked.ownH, 0.75));
    check(`${width}: …where the card was picked up (${startCx.toFixed(0)},${startCy.toFixed(0)} vs ${(picked.left + picked.w / 2).toFixed(0)},${(picked.top + picked.h / 2).toFixed(0)})`,
      near(startCx, picked.left + picked.w / 2, 2) && near(startCy, picked.top + picked.h / 2, 2));
    check(`${width}: the beat is the replay's ${BEAT}ms (${flight!.duration})`, flight!.duration === BEAT);

    // ── 5. THE REPLAY'S LANDING: 2.15 HEX RADII, ON THE TILE, LONG ENOUGH TO READ ─────────────
    const expectedH = CARD_RADII * (hex.width / 2);
    const settled = shown.filter((s) => s.opacity === 1 && s.t >= t0 + BEAT * (LAND_END + 0.06) && s.t <= t0 + BEAT * CARD_OUT_START);
    const heights = settled.map((s) => s.h).sort((a, b) => a - b);
    const landedH = heights[Math.floor(heights.length / 2)] ?? 0;
    console.log(`${width}: landed ${landedH.toFixed(1)}px tall, the replay's ${expectedH.toFixed(1)}px (hex ${hex.width.toFixed(1)}px)`);
    check(`${width}: the card lands at the replay's size (${landedH.toFixed(1)}px vs ${expectedH.toFixed(1)}px)`, near(landedH, expectedH, 1.5));
    check(`${width}: it stays solid on the tile before it leaves (${settled.length} frames)`, settled.length >= 2);

    // ── 6. THE REPLAY'S BEAT: burst → card leaves → the tile goes ─────────────────────────────
    const firstFlash = samples.find((s) => s.flash > 0);
    check(`${width}: the burst goes off`, !!firstFlash);
    const burstAt = (firstFlash?.t ?? 0) - t0;
    console.log(`${width}: the burst is lit ${burstAt}ms into the beat (the curve's mark is ${Math.round(BEAT * BURST)}ms)`);
    check(`${width}: the burst is on the curve's own mark (${burstAt}ms)`,
      burstAt >= BEAT * BURST * 0.75 && burstAt <= BEAT * BURST + 100);
    const atBurst = firstFlash ? samples.filter((s) => s.t >= firstFlash.t && s.t <= firstFlash.t + 34 && s.alive) : [];
    check(`${width}: the card is solid on the tile when the burst goes (opacity ${atBurst.map((s) => s.opacity).join(', ')})`,
      atBurst.length > 0 && atBurst.every((s) => s.opacity > 0.5));
    const lastFlash = [...samples].reverse().find((s) => s.flash > 0)!;
    const fades = shown.filter((s) => s.opacity > 0 && s.opacity < 1);
    check(`${width}: the card leaves on a fade (${fades.length} mid-fade frames: ${fades.slice(0, 4).map((s) => s.opacity.toFixed(2)).join(' → ')})`, fades.length >= 2);
    const lastVisible = shown.filter((s) => s.opacity > 0.01).at(-1);
    check(`${width}: the card is still on the tile at the curve's cardOutStart (${lastVisible ? lastVisible.t - t0 : '—'}ms)`,
      !!lastVisible && lastVisible.t - t0 >= BEAT * CARD_OUT_START * 0.9);
    const firstGone = shown.find((s) => !!lastVisible && s.t > lastVisible.t && s.opacity <= 0.01);
    check(`${width}: …and gone by the curve's cardOutEnd (${firstGone ? firstGone.t - t0 : '—'}ms)`,
      !!firstGone && firstGone.t - t0 <= BEAT * CARD_OUT_END + 90);
    // The tile's own fade is a second animation on it; its first frame must come after the burst has
    // faded (the replay's order), not before.
    const tileDrop = samples.find((s) => s.tile.animations > 1 || (s.tile.opacity < 0.995 && s.t > (firstFlash?.t ?? 0)));
    console.log(`${width}: tile starts to go at ${tileDrop?.t ?? '—'}ms; the burst was gone at ${lastFlash.t}ms (${lastFlash.t - t0}ms into the beat)`);
    check(`${width}: the struck tile goes only after the burst has faded`,
      !!tileDrop && tileDrop.t >= lastFlash.t && tileDrop.t - t0 >= BEAT * BURST_END * 0.9);

    // ── 7. SMOOTH: NO SIZE OR PLACE POP ON THE TILE ───────────────────────────────────────────
    // The authored animation is judged structurally, not by wall-clock sampling: a busy machine can
    // drop frames, and a dropped frame is not a "pop". The curve's own biggest step is its landing
    // overshoot (0.72 → 1.06 → 1), so no two neighbouring keyframes may jump more than that, and a
    // card that has landed must hold ONE size until it starts to leave.
    const keyScales = flight!.keys.map((k) => frameOf(String(k.transform)).scale);
    const biggestStep = keyScales.slice(1).reduce((m, s, i) => Math.max(m, Math.abs(s - keyScales[i]!)), 0);
    console.log(`${width}: the flight's keyframe scales ${keyScales.map((s) => s.toFixed(3)).join(' → ')}`);
    check(`${width}: the authored frames never jump (biggest scale step ${biggestStep.toFixed(3)})`, biggestStep <= 0.36);
    const steady = shown.filter((s) => s.opacity === 1 && s.t >= t0 + BEAT * (LAND_END + 0.04) && s.t <= t0 + BEAT * CARD_OUT_START);
    const offSize = steady.filter((s) => Math.abs(s.h - landedH) > 1.5);
    check(`${width}: the landed card holds one size until it leaves (${offSize.length} of ${steady.length} frames differ by >1.5px)`, offSize.length === 0);

    check(`${width}: no browser exceptions`, errors.length === 0);

    // ── 8. THE PHOTO AT THE PEAK (a separate game, so the sample pass above is untouched) ─────
    if (process.env.SHOTS !== 'none') {
      const shotGame = await openGame(browser, url, width, height, dpr);
      const shot = await pickBomb(shotGame.page);
      await tapTarget(shotGame.page, shot.hex);
      const box = await shotGame.page.waitForFunction(() => {
        const f = document.querySelector('.flyer.card') as HTMLElement | null;
        const a = f?.getAnimations()[0];
        if (!f || !a) return null;
        a.pause();
        a.currentTime = Number(a.effect?.getTiming().duration ?? 0) * 0.30; // landed, solid, before the fade
        const r = f.getBoundingClientRect();
        return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
      }, undefined, { timeout: 4000, polling: 4 }).then((h) => h.jsonValue()) as { left: number; top: number; right: number; bottom: number };
      await shotGame.page.waitForTimeout(140); // let the burst paint over the landed card
      const m = Math.max(30, (box.right - box.left) * 0.75);
      await shotGame.page.screenshot({ path: `${SHOTS}/after-${width}-peak.png`, clip: {
        x: Math.max(0, box.left - m), y: Math.max(0, box.top - m),
        width: Math.min(width, box.right - box.left + 2 * m), height: Math.min(height, box.bottom - box.top + 2 * m) } });
      console.log(`shot ${SHOTS}/after-${width}-peak.png`);
      check(`${width}: the peak photo was taken`, box.right > box.left);
      await shotGame.context.close();
    }

    await context.close();
  }

  // Reduce motion: no card travels at all (the tile answers the tap where it stands).
  {
    const { context, page, errors } = await openGame(browser, url, 390, 844, 3, true);
    const { hex } = await pickBomb(page);
    await tapTarget(page, hex);
    const still = await page.evaluate(async () => {
      let seen = 0;
      for (let i = 0; i < 30; i++) {
        seen += document.querySelectorAll('.flyer').length;
        await new Promise((resolve) => requestAnimationFrame(resolve));
      }
      return seen;
    });
    check('Reduce motion: the Bomb never travels (still — no flyer at any frame)', still === 0);
    check('Reduce motion: no browser exceptions', errors.length === 0);
    await context.close();
  }
  console.log(`\n${passed} bomb-card geometry checks passed`);
} finally {
  await browser.close();
  await server.httpServer.close();
}
