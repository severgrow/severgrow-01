// THE BOARD MUST ANSWER AN OPPONENT'S MOVE, AND A HEMNED-IN HOME MUST TREMBLE
// (0.86 regression guards, owner 2026-11-15).
//
// 1. The board's reaction to the opponent's action lives in three places that no other suite pins:
//    - `web/src/main.ts` playStep: the BOT's lean toward what it touched (`translate` on
//      #board-wrap, `nudgeToward`), which is the ONLY board movement that belongs to the opponent's
//      turn alone;
//    - `web/src/main.ts` playStep/grow: the landed tile's pop (`scale(0.86) -> 1.02` on `g.tile`);
//    - and the reduced-motion contract, which must remove the lean entirely.
//
// 2. A HOME THAT IS BEING SURROUNDED trembles on its own artwork (owner, 2026-11-15: "Bring back
//    the tremble only — no ring, just the home reacting"). The old swell ran on the ring that was
//    then deleted, so it has to be pinned where it now lives (`.landmark.constricted .lm-art`,
//    style.css `lm-constrict`) — and the ring must NOT come back with it. Nothing else tests
//    either half: the unit suite covers the pure decision, never the paint.
//
// Why a browser test and not a source pin: the skin rewrites in this range (ui/defaultArtBoard.ts,
// ui/forestAsh.ts) moved art between layers and reordered the board's SVGs. Nothing in the source
// changed, so a source-text test would still pass while the movement silently stopped reaching the
// screen. This measures the real node, in the real browser, on a real (scripted) turn.
//
//   CHANNEL=futa04 npm run web:build && npx tsx web/e2e/board-impact-motion.ts
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import type { Page } from 'playwright-core';
import { allNeighbors, coordKey, homeCoord, newGame } from '../../src/engine/index.js';
import type { Player, State } from '../../src/engine/index.js';
import { servePreview, closePreview } from './helpers/preview-port.js';
import { positionSave } from './position.js';

const served = process.env.FUTA04_URL ? null : await servePreview(4173, { build: { outDir: process.env.FUTA04_DIST ?? 'dist' }, logLevel: 'silent' });
const BASE = process.env.FUTA04_URL ?? served!.url;
const browser = await chromium.launch({
  ...(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}),
  args: ['--no-sandbox'],
});

/** The lean amplitude the opponent's turn must reach, in px, from `--fa`-free defaults. */
const LEAN_FLOOR_PX = 4;

type Seen = {
  /** Every `translate` animation started on #board-wrap, as its largest absolute px. */
  leans: number[];
  /** True when one of those frames also animated something expensive (filter/shadow). */
  expensive: boolean;
  /** Every `scale(0.86)` pop started on a `g.tile`. */
  pops: number[];
  /** The visible board's own rect, sampled every frame while the opponent plays. */
  tops: number[];
  /** Homes wearing the constriction state, and how many home arts are running `lm-constrict`. */
  constricted: number;
  constrictRuns: number;
};
const readSeen = (p: Page) => p.evaluate(() => (window as any).__seen as Seen);

const settings = (reduceMotion: boolean) => ({
  sound: false, music: false, coach: false, speed: 'normal', reduceMotion,
  autoSkip: true, confirmPolicy: 'never', effects: 'normal', eyeCandy: true, vibration: false,
});

/**
 * Open the page, play one whole turn through the real action path, then sample the opponent's turn.
 * `playFor` is the page's own hook (the filmstrip suites use it): it runs session.play + afterPlay,
 * which is the same queue the taps feed, so the animation path is the product's, not a shortcut.
 */
const watchOpponentTurn = async (reduceMotion: boolean): Promise<Seen> => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  try {
    await page.addInitScript((cfg) => {
      (window as any).__name = (f: unknown) => f;
      const raw = JSON.stringify(cfg);
      for (const prefix of ['', 'futa05:', 'futa04:', 'futa05-test:', 'main2:']) {
        localStorage.setItem(`${prefix}severgrow.settings.v1`, raw);
        localStorage.removeItem(`${prefix}severgrow.save.v7`);
      }
    }, settings(reduceMotion));
    await page.goto(`${BASE}?seed=219682080`);
    const idle = () => page.waitForFunction(() => {
      const h = (window as any).__severgrow;
      return h && !h.busy() && h.state()?.actor === 0;
    }, undefined, { timeout: 60_000 });
    const play = (pred: string) => page.evaluate((code) => {
      const h = (window as any).__severgrow;
      const a = h.legal().find(new Function('a', `return ${code}`));
      if (a) h.playFor(a, 0);
      return Boolean(a);
    }, pred);
    await idle();
    await page.waitForTimeout(600);
    // A whole turn, so the opponent's own turn follows it.
    assert(await play("a.t==='Draw'"), 'the draw is offered');
    await page.waitForTimeout(400); await idle();
    assert(await play("a.t==='Sprout'"), 'a Grow is offered');
    await page.waitForTimeout(400); await idle();
    await play("a.t==='EndAct'");
    await page.waitForTimeout(600); await idle();
    assert(await play("a.t==='Discard'"), 'the Throw is offered');

    // Record every animation the board runs, and the board's own box, frame by frame.
    await page.evaluate(() => {
      const seen = ((window as any).__seen = { leans: [], expensive: false, pops: [], tops: [], constricted: 0, constrictRuns: 0 } as Seen);
      const wrap = document.getElementById('board-wrap')!;
      const proto = Element.prototype as unknown as { __origAnimate?: typeof Element.prototype.animate; animate: typeof Element.prototype.animate };
      if (!proto.__origAnimate) {
        proto.__origAnimate = proto.animate;
        proto.animate = function (this: Element, frames: Keyframe[] | PropertyIndexedKeyframes | null, opts?: number | KeyframeAnimationOptions) {
          const json = JSON.stringify(frames);
          if ((this as HTMLElement).id === 'board-wrap' && json.includes('"translate"')) {
            let max = 0;
            for (const hit of json.matchAll(/"translate":"([^"]+)"/g)) {
              for (const px of hit[1]!.matchAll(/(-?[\d.]+)px/g)) max = Math.max(max, Math.abs(Number(px[1])));
            }
            if (max > 0) seen.leans.push(max);
            if (/blur|boxShadow|drop-shadow/.test(json)) seen.expensive = true;
          }
          const cls = (this as Element).getAttribute?.('class') ?? '';
          if (/\btile\b/.test(cls) && json.includes('0.86')) seen.pops.push(0.86);
          return proto.__origAnimate!.call(this, frames as Keyframe[], opts as KeyframeAnimationOptions);
        };
      }
      const t0 = performance.now();
      const tick = () => {
        seen.tops.push(Number(wrap.getBoundingClientRect().top.toFixed(2)));
        seen.constricted = document.querySelectorAll('#board .landmark.constricted').length;
        seen.constrictRuns = [...document.querySelectorAll('#board .landmark .lm-art')]
          .filter((el) => getComputedStyle(el).animationName.includes('lm-constrict')).length;
        if (performance.now() - t0 < 11_000) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    await page.waitForTimeout(12_000);
    return await readSeen(page);
  } finally {
    await page.close();
  }
};

let checks = 0;
const check = (ok: unknown, name: string) => { assert(ok, name); checks++; };

/**
 * The constriction, measured on the real home: a state where `blocked` of the volcano's six sides
 * are held by my tiles, opened from a save (the pattern `web/e2e/cut-severe.ts` uses).
 */
type Constriction = {
  classes: string[];
  animationName: string;
  duration: string;
  iterations: string;
  transformBox: string;
  /** Ring / segment / ring-state elements anywhere on the board. */
  ringEls: number;
  /** Children of the wrapper the tremble runs on: the drawing only, or something else too. */
  artKids: string[];
  scaleMin: number;
  scaleMax: number;
};

const homeWithBlockedSides = (blocked: number): State => {
  const base = newGame(219682080);
  const home = homeCoord(1, base.config);
  const board = { ...base.board };
  for (const nb of allNeighbors(home).slice(0, blocked)) board[coordKey(nb)] = { owner: 0 as Player, strength: 3 };
  return { ...base, phase: 'ACT', actor: 0, turnPlayer: 0, board };
};

const watchHome = async (blocked: number, reduceMotion: boolean): Promise<Constriction> => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  try {
    await page.addInitScript(([save, cfg]) => {
      (window as any).__name = (f: unknown) => f;
      const raw = JSON.stringify(cfg);
      for (const prefix of ['', 'futa05:', 'futa04:', 'futa05-test:', 'main2:']) {
        localStorage.setItem(`${prefix}severgrow.save.v7`, save as string);
        localStorage.setItem(`${prefix}severgrow.settings.v1`, raw);
      }
    }, [positionSave({ state: homeWithBlockedSides(blocked) }), settings(reduceMotion)] as const);
    await page.goto(BASE);
    await page.waitForSelector('#menu-continue', { state: 'attached' });
    await page.evaluate(() => (document.getElementById('menu-continue') as HTMLElement | null)?.click());
    await page.waitForFunction(() => !!(window as any).__severgrow?.state?.(), undefined, { timeout: 20_000 });
    await page.waitForFunction(() => !(window as any).__severgrow.busy(), undefined, { timeout: 30_000 });
    await page.waitForTimeout(1_400);
    const out = await page.evaluate(async () => {
      const landmarks = [...document.querySelectorAll('#board .landmark')];
      const home = document.querySelector('#board .landmark.lm-volcano')!;
      const art = home.querySelector('.lm-art') as Element | null;
      const cs = art ? getComputedStyle(art) : null;
      const scales: number[] = [];
      const t0 = performance.now();
      await new Promise<void>((done) => {
        const tick = () => {
          if (art) scales.push(new DOMMatrixReadOnly(getComputedStyle(art).transform).a);
          if (performance.now() - t0 < 2_600) requestAnimationFrame(tick);
          else done();
        };
        requestAnimationFrame(tick);
      });
      return {
        classes: [...home.classList],
        animationName: cs?.animationName ?? 'none',
        duration: cs?.animationDuration ?? '',
        iterations: cs?.animationIterationCount ?? '',
        transformBox: cs?.transformBox ?? '',
        ringEls: document.querySelectorAll('#board .lm-ring, #board .lm-seg, #board .landmark.show-ring, #board .landmark.ring-soft, #board .landmark.ring-strong').length,
        artKids: [...(art?.children ?? [])].map((c) => `${c.tagName.toLowerCase()}.${c.getAttribute('class') ?? ''}`),
        scaleMin: scales.length ? Math.min(...scales) : 1,
        scaleMax: scales.length ? Math.max(...scales) : 1,
        landmarks: landmarks.length,
      };
    });
    const box = await page.locator('#board .landmark.lm-volcano').boundingBox();
    await page.screenshot({ path: `/tmp/board-impact-motion-home-${blocked}${reduceMotion ? '-reduced' : ''}.png`, ...(box ? { clip: { x: Math.max(0, box.x - 90), y: Math.max(0, box.y - 90), width: 260, height: 260 } } : {}) });
    return out;
  } finally {
    await page.close();
  }
};

try {
  const seen = await watchOpponentTurn(false);
  const lean = Math.max(...seen.leans.filter((n) => n > 0), 0);
  const tops = seen.tops;
  const topSwing = tops.length ? Math.max(...tops) - Math.min(...tops) : 0;
  console.log(`motion on : leans=${JSON.stringify(seen.leans)} lean=${lean}px board top swing=${topSwing.toFixed(2)}px pops=${seen.pops.length}`);
  check(seen.leans.length > 0, 'the opponent\'s turn leans the board (#board-wrap translate)');
  check(lean >= LEAN_FLOOR_PX, `the lean is big enough to see (${lean}px >= ${LEAN_FLOOR_PX}px)`);
  check(topSwing >= 3, `the visible board really moves with it (${topSwing.toFixed(2)}px)`);
  check(!seen.expensive, 'the lean is transform only: no filter, blur or box-shadow is animated');
  check(seen.pops.length >= 1, 'the tile that lands pops (scale(0.86) on g.tile)');

  const calm = await watchOpponentTurn(true);
  const calmLean = Math.max(...calm.leans, 0);
  console.log(`reduce motion: leans=${JSON.stringify(calm.leans)} pops=${calm.pops.length}`);
  check(calm.leans.length === 0 && calmLean === 0, 'Reduce motion: the board never leans');
  check(calm.pops.length === 0, 'Reduce motion: no tile pop either');
  // A whole turn of an ordinary game is watched above: nothing may be trembling on its own.
  check(seen.constricted === 0 && seen.constrictRuns === 0,
    `a home that is not surrounded never trembles (constricted=${seen.constricted}, running=${seen.constrictRuns})`);

  // ---- The constriction: a home with five of its six sides taken trembles on its own artwork ----
  const five = await watchHome(5, false);
  console.log(`5 blocked sides: ${JSON.stringify({ classes: five.classes, animation: `${five.animationName} ${five.duration} ${five.iterations}`, scale: [five.scaleMin, five.scaleMax], ringEls: five.ringEls, artKids: five.artKids })}`);
  check(five.classes.includes('constricted'), 'five blocked sides: the home is in the constricted state');
  check(five.animationName === 'lm-constrict', `the swell runs on the home's own art (${five.animationName || 'none'})`);
  check(five.duration === '1.9s' && five.iterations === 'infinite', `the old character: one slow 1.9s breathe (${five.duration} ${five.iterations})`);
  check(five.transformBox === 'fill-box', `it scales about the art's own centre (${five.transformBox})`);
  check(five.scaleMin <= 0.974 && five.scaleMax >= 0.999,
    `the measured swell is scale 1 -> 0.972 and back (${five.scaleMin}..${five.scaleMax})`);
  check(five.ringEls === 0, 'no ring, segment or ring state exists around the surrounded home');
  check(five.artKids.length === 1 && /default-home-art/.test(five.artKids[0]!),
    `the tremble runs on the drawing alone (${JSON.stringify(five.artKids)})`);

  const four = await watchHome(4, false);
  console.log(`4 blocked sides: ${JSON.stringify({ classes: four.classes, animation: four.animationName, scale: [four.scaleMin, four.scaleMax] })}`);
  check(!four.classes.includes('constricted') && four.animationName === 'none' && four.scaleMax - four.scaleMin === 0,
    'four blocked sides: the home is still (the constriction is five of six)');

  const calmHome = await watchHome(5, true);
  console.log(`5 blocked + Reduce motion: ${JSON.stringify({ classes: calmHome.classes, animation: calmHome.animationName, scale: [calmHome.scaleMin, calmHome.scaleMax] })}`);
  check(!calmHome.classes.includes('constricted') && calmHome.animationName === 'none' && calmHome.scaleMax - calmHome.scaleMin === 0,
    'Reduce motion: a surrounded home does not tremble either');

  console.log(`Board impact motion checks passed (${checks}): the opponent's turn leans the board ${lean}px, the landing pops, a hemmed-in home swells ${five.scaleMin}..${five.scaleMax} with no ring, Reduce motion removes both`);
} finally {
  await browser.close();
  await closePreview(served?.server ?? null);
}
