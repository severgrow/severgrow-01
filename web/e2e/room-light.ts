/**
 * ONE ROOM, ONE WASH: an opponent's grow lights the whole background EVENLY (owner, 2026-11-20).
 *
 * Two owner reports, the same beat. In the morning: "the opponent's Grow reaction showed a vertical
 * seam at the board edge on desktop and an unlit strip at the bottom of an iPhone 15 Pro". In the
 * evening, about the fix for it: "you can see the border of this highlight/change ... it's like a
 * pulse. doesn't have color. i like it, but looks ugly when you can see its border".
 *
 * The fix that was tried (commit 92107d54) held `futa04-room-lit` on <html> for the beat and set the
 * board's four local light patches to `opacity: 0`, so that the full-screen outcome light could
 * "reach under" the board, the cockpit and the hand. Measured, it could not: the wash is one flat
 * layer and its change is already even to within a couple of units at the screen corners, in the
 * gutter beside the board, in the board's own tile gaps and on the phone's bottom strip. Hiding the
 * patches therefore moved no light anywhere; it only removed a SECOND, shaped light — the dark board
 * vignette — which is strongest exactly at the board's right edge and stops dead on the board's
 * opaque art. That is the border: the change doubled beside the board (+41/765 summed over R+G+B at
 * a .3 peek, against +23 everywhere else) and ended in a hard vertical step at the art's edge.
 *
 * So this suite pins the opposite contract, with pixels. It shoots the RESTING room, then drives a
 * real opponent grow (a saved position with the opponent to act, played through the page's own hook)
 * and freezes its beat at the beat's own brightest frame — the two frames the owner sees, one after
 * the other:
 *   - the beat still runs: the light is present at the screen corners, in the band beside the board
 *     and on the phone's bottom strip, so no future fix may silently kill the pulse;
 *   - the board keeps every local patch at its resting opacity while the beat runs (the hiding is
 *     the mechanism that made the second, shaped light);
 *   - the beat has ONE strength everywhere. The recovered alpha of the change (actual change / the
 *     change one flat wash of that colour would make over that pixel) beside the board must be
 *     within 40-160% of the far field's. The hiding build measured ~3x there, and a re-introduced
 *     shaped light fails immediately;
 *   - along rows of pure background there is no hard neighbour step, and no stretch is left unlit.
 *
 * Both layouts: 1440x900 (desktop, cockpit to the RIGHT of the board — where the border showed) and
 * 393x852 (iPhone 15 Pro, cockpit BELOW the board).
 *
 *   CHANNEL=futa04 npm run web:build && npx tsx web/e2e/room-light.ts
 *   ROOM_WEBKIT=1 npx tsx web/e2e/room-light-ios.ts      (the same checks in WebKit)
 *
 * Screenshots land in docs/screens/room-light/ for the owner.
 */
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { chromium, webkit } from 'playwright-core';
import type { Page } from 'playwright-core';
import { legalActions, newGame, viewFor } from '../../src/engine/index.js';
import type { Action, State } from '../../src/engine/index.js';
import { encodeSave } from '../src/logic/persist.js';
import { servePreview } from './helpers/preview-port.js';

const ios = process.env.ROOM_WEBKIT === '1';
const served = await servePreview(4231, { logLevel: 'silent' });
const browser = await (ios ? webkit : chromium).launch(ios ? {} : {
  ...(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}),
  args: ['--no-sandbox', '--enable-unsafe-swiftshader'],
});
const DIR = 'docs/screens/room-light';
mkdirSync(DIR, { recursive: true });
let checks = 0;
const check = (ok: boolean, label: string, note = '') => {
  if (!ok) throw new Error(`${label}${note ? ` (${note})` : ''}`);
  checks++;
  console.log(`PASS  ${label}${note ? `  (${note})` : ''}`);
};

/** The fixture: the standard seed 7 position, with `player` to act (nobody has moved). */
const turnFor = (player: 0 | 1): State => {
  const base = newGame(7);
  return { ...base, phase: 'ACT', turnPlayer: player, actor: player, sproutsThisTurn: 0 };
};

/**
 * The grow the opponent will play. A BLOOM when one is legal, because a Bloom's cue is the strongest
 * a grow ever gets (outcome-light.ts: style 'bloom' is strength .68), so the measurement below works
 * on a light twice as bright as a single Sprout's. `playFor(action, 1)` only plays when it really is
 * that player's turn (logic/session.ts refuses an action whose actor is someone else), so the beat
 * this suite measures is a real opponent grow — the one the owner reported — not a forced class or a
 * hand-set opacity. The action is read from the RESUMED page's own state (the save restores the
 * board, not a hand made up here).
 */
const pickGrow = (state: State, label: string): Action => {
  const legal = legalActions(viewFor(state, 1));
  const grow = legal.find((a) => a.t === 'Bloom') ?? legal.find((a) => a.t === 'Sprout');
  assert(grow, 'the opponent has a grow to play');
  check(grow.t === 'Bloom', `${label}: the opponent's grow is a Bloom, the strongest grow cue`);
  return grow;
};

type Beat = { tone: string | null; opacity: number; tintAlpha: number; alpha: number; tint: number[] };

/**
 * Freeze the beat at ITS OWN brightest frame and read back what the game is painting: the tone, the
 * element's opacity and the wash colour's own alpha. With those three the light's expected change is
 * exact, per pixel: `alpha * distance(tint, pixel)`. The brightest frame is found by asking the
 * animation, never assumed: the beat's easing is a cubic-bezier over the whole timeline, so the
 * peak keyframe's offset is not the time it is reached at.
 */
const freezeBeatAtPeak = (page: Page): Promise<Beat | null> => page.evaluate(() => {
  const el = document.getElementById('futa04-outcome-light') as HTMLElement | null;
  if (!el) return null;
  const beats = el.getAnimations();
  if (!beats.length) return null;
  const beat = beats[0]!;
  const duration = Number((beat.effect as KeyframeEffect | null)?.getComputedTiming().duration ?? 880);
  // Everything else stops where it stands: the two frames must differ in the light and nothing else.
  for (const a of document.getAnimations()) {
    if (a === beat) continue;
    try { a.pause(); } catch { /* already gone */ }
  }
  beat.pause();
  let brightest = -1, at = 0;
  for (let i = 0; i <= 50; i++) {
    beat.currentTime = (duration * i) / 50;
    const opacity = Number(getComputedStyle(el).opacity);
    if (opacity > brightest) { brightest = opacity; at = (duration * i) / 50; }
  }
  beat.currentTime = at;
  const style = getComputedStyle(el);
  // The wash colour, as the browser serialises it: `color(srgb .91 .26 .18 / .167)` for the
  // color-mix() in atmosphere.ts, or plain rgba() where color-mix is not supported.
  const srgb = /color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?\)/.exec(style.backgroundImage);
  const rgba = /rgba?\(([^)]+)\)/.exec(style.backgroundImage);
  let tint: number[] = [];
  let tintAlpha = 1;
  if (srgb) {
    tint = [Number(srgb[1]) * 255, Number(srgb[2]) * 255, Number(srgb[3]) * 255];
    tintAlpha = srgb[4] === undefined ? 1 : Number(srgb[4]);
  } else if (rgba) {
    const parts = rgba[1]!.split(',').map((n) => Number(n.trim()));
    tint = parts.slice(0, 3);
    tintAlpha = parts.length >= 4 ? parts[3]! : 1;
  }
  const opacity = Number(style.opacity);
  return { tone: el.dataset.tone ?? null, opacity, tintAlpha, alpha: opacity * tintAlpha, tint };
});

type Geometry = {
  w: number; h: number;
  art: { l: number; t: number; r: number; b: number };
  patchOpacity: [string, string, string];
  points: { kind: 'band' | 'far' | 'corner' | 'strip'; x: number; y: number }[];
  /** Dense runs of pure background, sampled pixel by pixel: a seam is a step between NEIGHBOURS. */
  runs: { name: string; y: number; x0: number; x1: number }[];
  gutter: { l: number; r: number; y: number } | null;
};

/** Where to look, in CSS px, before the beat moves anything. */
const geometryOf = (page: Page): Promise<Geometry> => page.evaluate(() => {
  const paths = [...document.querySelectorAll('#board .l-base .hex-cell > path.hex')];
  let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
  for (const path of paths) {
    const box = path.getBoundingClientRect();
    l = Math.min(l, box.left); t = Math.min(t, box.top);
    r = Math.max(r, box.right); b = Math.max(b, box.bottom);
  }
  const W = innerWidth, H = innerHeight;
  const cockpit = document.querySelector('#smart-panel')?.getBoundingClientRect() ?? null;
  const heights = [t + (b - t) * .2, t + (b - t) * .5, t + (b - t) * .8].map((y) => Math.round(y));
  const points: Geometry['points'] = [];
  // The four screen corners: the wash must reach them (the phone's unlit bottom strip lived here).
  points.push({ kind: 'corner', x: 6, y: 6 }, { kind: 'corner', x: W - 7, y: 6 },
    { kind: 'corner', x: 6, y: H - 7 }, { kind: 'corner', x: W - 7, y: H - 7 });
  // Desktop: the band just right of the board (where the border showed) and the far field beyond the
  // cockpit, at the same heights — the same background, lit only by the same wash.
  const beside = r + 6 < W - 200;
  if (beside) {
    for (const y of heights) {
      for (let i = 0; i < 7; i++) points.push({ kind: 'band', x: Math.round(r + 4 + i * 10), y });
      for (let i = 0; i < 7; i++) points.push({ kind: 'far', x: Math.round(W - 140 + i * 16), y });
    }
  }
  // The phone's visible bottom strip, which the owner reported as unlit.
  for (let i = 0; i < 12; i++) points.push({ kind: 'strip', x: Math.round(4 + i * ((W - 9) / 11)), y: H - 6 });
  const runs: Geometry['runs'] = [];
  // Pure background, starting ON the board's edge and walking away from it: the gutter beside the
  // board (desktop, where the border showed) and the phone's visible bottom strip.
  if (beside) runs.push({ name: 'gutter', y: heights[1]!, x0: Math.round(r + 4), x1: Math.round(cockpit ? cockpit.left - 8 : W - 40) });
  runs.push({ name: 'bottom strip', y: H - 6, x0: 6, x1: W - 7 });
  const patchOpacity = ['#game .play', '#game .board-wrap', '#game .dock'].map((sel) =>
    getComputedStyle(document.querySelector(sel)!, '::before').opacity);
  return {
    w: W, h: H,
    art: { l: Math.round(l), t: Math.round(t), r: Math.round(r), b: Math.round(b) },
    patchOpacity: patchOpacity as [string, string, string],
    points, runs,
    gutter: cockpit && cockpit.left - r > 60 ? { l: Math.round(r + 3), r: Math.round(cockpit.left - 3), y: heights[1]! } : null,
  };
});

type Measured = {
  deltas: { kind: string; x: number; y: number; delta: number; alpha: number }[];
  runs: { name: string; values: number[]; maxStep: number; at: number }[];
};

/**
 * The change each pixel actually got, plus the alpha that change implies for the wash (0 when the
 * pixel is under something opaque, e.g. a tile or a card — those are skipped as points, not here).
 */
const measure = (page: Page, plain: string, lit: string, beat: Beat, geo: Geometry): Promise<Measured> =>
  page.evaluate(async ({ plain, lit, beat, geo }) => {
    const load = async (src: string) => {
      const image = new Image(); image.src = `data:image/png;base64,${src}`; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
      const context = canvas.getContext('2d', { willReadFrequently: true })!;
      context.drawImage(image, 0, 0);
      return { w: canvas.width, h: canvas.height, d: context.getImageData(0, 0, canvas.width, canvas.height).data };
    };
    const [a, b] = await Promise.all([load(plain), load(lit)]);
    const at = (shot: typeof a, x: number, y: number) => {
      const i = (Math.round(y) * shot.w + Math.round(x)) * 4;
      return [shot.d[i]!, shot.d[i + 1]!, shot.d[i + 2]!] as [number, number, number];
    };
    const at0 = at;
    const delta = (x: number, y: number) => {
      const p = at(a, x, y), q = at(b, x, y);
      return Math.abs(q[0] - p[0]) + Math.abs(q[1] - p[1]) + Math.abs(q[2] - p[2]);
    };
    // What ONE flat wash of this colour, at this alpha, must add to THIS pixel.
    const expected = (x: number, y: number) => {
      const p = at(a, x, y);
      const distance = Math.abs(beat.tint[0]! - p[0]) + Math.abs(beat.tint[1]! - p[1]) + Math.abs(beat.tint[2]! - p[2]);
      return beat.alpha * distance;
    };
    const deltas = geo.points.map((point) => {
      const d = delta(point.x, point.y);
      const e = expected(point.x, point.y);
      return { kind: point.kind, x: point.x, y: point.y, delta: d, alpha: e > 0 ? d / e : 0 };
    });
    const runs = geo.runs.map((run) => {
      const values: number[] = [];
      for (let x = run.x0; x <= run.x1; x++) values.push(delta(x, run.y));
      /* A SEAM is a step in the LIGHT across a stretch of background that was already smooth: the
         page's own objects (a card's rim, the board's silhouette) are steps in the room itself, and
         they are allowed to stay exactly where they are. So a step only counts when the resting
         pixels either side of it are within 2/255 per channel of each other. */
      let maxStep = 0, at = run.x0;
      for (let i = 1; i < values.length; i++) {
        const p = at0(a, run.x0 + i - 1, run.y), q = at0(a, run.x0 + i, run.y);
        const restStep = Math.max(Math.abs(q[0] - p[0]), Math.abs(q[1] - p[1]), Math.abs(q[2] - p[2]));
        if (restStep > 2) continue;
        const step = Math.abs(values[i]! - values[i - 1]!);
        if (step > maxStep) { maxStep = step; at = run.x0 + i; }
      }
      return { name: run.name, values, maxStep, at };
    });
    return { deltas, runs };
  }, { plain, lit, beat, geo });

const openGame = async (
  width: number, height: number, mobile: boolean, save: string, resume = true,
): Promise<{ page: Page; errors: string[] }> => {
  const page = await browser.newPage({
    viewport: { width, height }, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1,
  });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript((raw) => {
    (window as any).__name = (fn: unknown) => fn;
    for (const prefix of ['', 'main2:', 'futa04:', 'futa05:', 'futa-test:', 'test:']) {
      localStorage.setItem(`${prefix}severgrow.settings.v1`, JSON.stringify({
        sound: false, music: false, coach: false, reduceMotion: false, effects: 'high', speed: 'fast',
      }));
      localStorage.setItem(`${prefix}severgrow.save.v7`, raw);
    }
  }, save);
  await page.goto(`${served.url}?seed=7`);
  await page.waitForFunction(() => (window as any).__severgrow?.ready?.() === true, undefined, { timeout: 30_000 });
  if (!resume) return { page, errors }; // the caller resumes and moves in one round trip (see below)
  // The product menu has no Continue (owner, 2026-10-19); the saved position is a fixture, so the
  // hidden legacy control resumes it directly, as the other fixture suites do.
  await page.evaluate(() => (document.getElementById('menu-continue') as HTMLButtonElement | null)?.click());
  await page.waitForFunction(() => (window as any).__severgrow?.state()?.phase === 'ACT', undefined, { timeout: 30_000 });
  return { page, errors };
};

/**
 * Hold the resting room perfectly still: every decorative animation paused, the slow 32 s warm pass
 * at 0. Any LIGHT beat is waited out first — pausing one would hold a full-screen wash at whatever
 * opacity it had reached, and the frame would not be the resting room at all.
 */
const parkWarmPass = async (page: Page) => {
  await page.waitForFunction(() => {
    const outcome = document.getElementById('futa04-outcome-light');
    const ambient = document.querySelector('#futa04-ambient-light .al-pulse');
    return (!outcome || outcome.getAnimations().length === 0)
      && (!ambient || ambient.getAnimations().length === 0);
  }, undefined, { timeout: 10_000 }).catch(() => undefined);
  await page.evaluate(() => {
    for (const a of document.getAnimations()) {
      try { a.pause(); } catch { /* already gone */ }
      if ((a as CSSAnimation).animationName === 'futasaku-warm-pass') a.currentTime = 0;
    }
  });
};

const settleFrame = (page: Page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

try {
  for (const [label, width, height, mobile] of [['desktop', 1440, 900, false], ['iphone-15-pro', 393, 852, true]] as const) {
    const beatSave = encodeSave({ seed: 7, actions: [], coach: null, level: 7, base: turnFor(1) });
    const restSave = encodeSave({ seed: 7, actions: [], coach: null, level: 7, base: turnFor(0) });

    /* THE RESTING ROOM — its own load of the SAME position (the same seed and board; only the turn
       marker differs, so nothing on the page can move: the computer is not to act here). The beat's
       page is resumed with the opponent to act, and any frame taken there could be raced by the
       computer's own move. */
    const rest = await openGame(width, height, mobile, restSave);
    const liveState = await rest.page.evaluate(() => (window as any).__severgrow.state()) as State;
    const grow = pickGrow(liveState, label);
    await parkWarmPass(rest.page);
    await rest.page.waitForTimeout(2500);
    const geometry = await geometryOf(rest.page);
    check(geometry.patchOpacity.every((value) => value === '1'),
      `${label}: the board's local light patches rest visible`, JSON.stringify(geometry.patchOpacity));
    /* Two frames: the FIRST forces the composition to finish (the board's baked rim arrives as an
       asynchronously decoded blob, so one paint can still land after the page looks settled), the
       second is the room every number below is measured against. */
    await settleFrame(rest.page);
    await rest.page.screenshot();
    await rest.page.waitForTimeout(150);
    await rest.page.screenshot();
    await rest.page.waitForTimeout(150);
    const plain = await rest.page.screenshot({ path: `${DIR}/${label}-plain.png` });
    // The resting frame must hold still, or every number below would describe the page's own motion.
    await rest.page.waitForTimeout(300);
    const plainAgain = await rest.page.screenshot();
    await rest.page.close();

    // ---- a real opponent grow, and its beat ----
    const { page, errors } = await openGame(width, height, mobile, beatSave, false);
    /* Resume AND play the grow inside one evaluate. The computer is due to act on this position, and
       it waits only `idle()` plus a think of ~150 ms before its own move: a Playwright round trip on
       a loaded machine can outlast that, and then it would have played first and the beat would be
       its action, not the one this suite is measuring. So one evaluate clicks Continue, polls at
       2 ms and plays the grow the instant the position is live. `session.play` only accepts an action
       from the player whose turn it is, so the beat that follows is a real opponent grow -- the one
       the owner reported -- not a forced class or a hand-set opacity. */
    const growCandidates = [grow, ...legalActions(viewFor(liveState, 1)).filter((a) => a.t !== 'EndAct' && a !== grow)];
    const played = await page.evaluate((actions) => new Promise<boolean>((resolve) => {
      const hook = (window as any).__severgrow;
      document.getElementById('menu-continue')?.click();
      const started = performance.now();
      const tick = () => {
        const state = hook?.state?.();
        if (state && state.phase === 'ACT' && state.actor === 1) {
          for (const action of actions) if (hook.playFor(action, 1) === true) { resolve(true); return; }
          resolve(false);
          return;
        }
        if (performance.now() - started > 20_000) { resolve(false); return; }
        setTimeout(tick, 2);
      };
      tick();
    }), growCandidates.map((action) => JSON.parse(JSON.stringify(action)) as Action));
    check(played === true, `${label}: the opponent's grow was played`);
    await page.waitForFunction(() => {
      const el = document.getElementById('futa04-outcome-light');
      return !!el && el.dataset.tone === 'bad' && el.getAnimations().length > 0;
    }, undefined, { timeout: 6000 });
    const beat = await freezeBeatAtPeak(page);
    assert(beat, `${label}: the beat has an animation to freeze`);
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    const lit = await page.screenshot({ path: `${DIR}/${label}-beat.png` });
    // Read the patches, now that the beat is on screen and held at its peak.
    const litPatches = await page.evaluate(() => ['#game .play', '#game .board-wrap', '#game .dock']
      .map((sel) => getComputedStyle(document.querySelector(sel)!, '::before').opacity));
    check(litPatches.every((value) => value === '1'),
      `${label}: the beat does not hide the board's local light patches`, JSON.stringify(litPatches));
    check(beat.tone === 'bad' && beat.alpha > 0.02,
      `${label}: the opponent's grow is the colour the owner saw`, `${beat.tone} alpha ${beat.alpha.toFixed(3)}`);

    const measured = await measure(page, plain.toString('base64'), lit.toString('base64'), beat, geometry);
    /* Nothing else was moving while the resting frame was taken: the floor of every number below. */
    const noise = await measure(page, plain.toString('base64'), plainAgain.toString('base64'), { ...beat, alpha: 0 }, geometry);
    const floor = Math.max(...noise.deltas.map((point) => point.delta));

    check(floor <= 2, `${label}: the resting room holds still, so the change below is the light (floor ${floor}/765)`);
    if (process.env.E2E_DEBUG === '1') console.log('INFO ', label, JSON.stringify({ beat, geometry, measured }));

    const byKind = (kind: string) => measured.deltas.filter((point) => point.kind === kind);
    const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
    const weakest = (kind: string) => Math.min(...byKind(kind).map((point) => point.delta));
    const strength = (kind: string) => mean(byKind(kind).map((point) => point.delta));
    const wash = (kind: string) => mean(byKind(kind).map((point) => point.alpha));
    /* 1. THE PULSE STILL WORKS. The light reaches the corners (the phone's unlit strip lived at the
          bottom edge), the band beside the board and the bottom strip — a fix may never quietly kill
          the beat. Presence only: HOW the room is lit is the next check's business. */
    for (const kind of ['corner', 'band', 'strip'] as const) {
      if (!byKind(kind).length) continue;
      check(weakest(kind) >= 3 && strength(kind) >= 5,
        `${label}: the beat lights the ${kind} (weakest +${weakest(kind)}/765, mean +${strength(kind).toFixed(1)})`);
    }
    /* 2. NO SECOND LIGHT. The board's vignette shades the room's light where it sits, so beside the
          board the wash may arrive a little dimmer than across the room — but a vignette can only ever
          SHADE it, never add. A second, shaped light near the board (hiding the board's patches for
          the beat) does exactly that: that build measured 147% of the far field beside the board
          against this one's 70%. So the band must stay between half and a shade over the far field. */
    if (byKind('band').length && byKind('far').length) {
      const ratio = wash('band') / wash('far');
      check(ratio >= .5 && ratio <= 1.1,
        `${label}: no highlight hugging the board - it is lit like the rest of the room (${(ratio * 100).toFixed(0)}% of the far field's strength)`);
    }
    /* The corners must carry the same single wash as the far field (or, on the phone layout, as the
       bottom strip), so the light is one layer over the whole viewport rather than a pool that stops
       somewhere. */
    if (byKind('far').length || byKind('strip').length) {
      const reference = byKind('far').length ? wash('far') : wash('strip');
      const ratio = wash('corner') / reference;
      check(ratio >= .6 && ratio <= 1.6,
        `${label}: the same light reaches the screen's corners (${ratio.toFixed(2)}x the rest of the background)`);
    }
    /* 3. NO SEAM. Along rows of pure background there is no hard neighbour step, and no stretch of
          that row is left unlit (the old seam was a step of 8-10 units a few pixels wide). */
    for (const run of measured.runs) {
      check(run.maxStep <= 5,
        `${label}: no seam along the ${run.name} (largest step between neighbouring pixels ${run.maxStep}/765 at x=${run.at})`);
      check(Math.min(...run.values) >= 3, `${label}: the ${run.name} is never unlit (weakest +${Math.min(...run.values)}/765)`);
    }
    check(errors.length === 0, `${label}: no browser errors (${errors.join(' | ')})`);
    await page.close();
  }
  console.log(`${checks} room-light checks passed; screenshots: ${DIR}`);
} finally {
  await browser.close();
  await served.server.httpServer.close();
}
