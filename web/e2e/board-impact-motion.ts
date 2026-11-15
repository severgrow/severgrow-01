// THE BOARD MUST ANSWER AN OPPONENT'S MOVE (0.86 regression guard, owner 2026-11-15: "the board
// stopped ''shaking'' when opp growing etc").
//
// The board's reaction to the opponent's action lives in three places that no other suite pins:
//   - `web/src/main.ts` playStep: the BOT's lean toward what it touched (`translate` on
//     #board-wrap, `nudgeToward`), which is the ONLY board movement that belongs to the opponent's
//     turn alone;
//   - `web/src/main.ts` playStep/grow: the landed tile's pop (`scale(0.86) -> 1.02` on `g.tile`);
//   - and the reduced-motion contract, which must remove the lean entirely.
//
// Why a browser test and not a source pin: the skin rewrites in this range (ui/defaultArtBoard.ts,
// ui/forestAsh.ts) moved art between layers and reordered the board's SVGs. Nothing in the source
// changed, so a source-text test would still pass while the movement silently stopped reaching the
// screen. This measures the real node, in the real browser, on a real (scripted) opponent turn.
//
//   CHANNEL=futa04 npm run web:build && npx tsx web/e2e/board-impact-motion.ts
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import type { Page } from 'playwright-core';
import { servePreview, closePreview } from './helpers/preview-port.js';

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
      const seen = ((window as any).__seen = { leans: [], expensive: false, pops: [], tops: [] } as Seen);
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

  console.log(`Board impact motion checks passed (${checks}): the opponent's turn leans the board ${lean}px, the landing pops, Reduce motion removes both`);
} finally {
  await browser.close();
  await closePreview(served?.server ?? null);
}
