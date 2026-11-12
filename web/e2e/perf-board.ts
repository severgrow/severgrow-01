// PERF PROBE — what one pointer move over the board costs while a Bloom is being painted, versus
// the same move on a still board. The earlier O(all cells) hover freeze was bounded to "once per
// hex under the pointer"; this measures what is actually left per move.
//   CHANNEL=futa04 PW_CHROMIUM=... npx tsx web/e2e/perf-board.ts
import { chromium } from 'playwright-core';
import type { Page } from 'playwright-core';
import { legalActions, viewFor } from '../../src/engine/index.js';
import type { Action, State } from '../../src/engine/index.js';
import { servePreview } from './helpers/preview-port.js';
import { seedSettings } from './helpers/settings-seed.js';

const CHROME = process.env.PW_CHROMIUM ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const stage = (line: string): void => console.log(`[perf] ${line}`);

const stats = (values: number[]) => {
  const s = [...values].sort((a, b) => a - b);
  const at = (q: number) => s[Math.min(s.length - 1, Math.floor(q * s.length))] ?? 0;
  return { n: s.length, median: at(0.5), p95: at(0.95), max: at(1) };
};
const report = (name: string, v: number[]): string => {
  const s = stats(v);
  return `${name}: n=${s.n} median ${s.median.toFixed(2)} ms, p95 ${s.p95.toFixed(2)} ms, max ${s.max.toFixed(2)} ms`;
};

const idle = (page: Page) =>
  page.waitForFunction('(() => { const h = window.__severgrow; return !!h.state() && !h.busy(); })()', undefined, { timeout: 90_000 });

/** 40 mouse moves across the board, paced by the display, timed inside the page. */
const sweep = (page: Page): Promise<{ moves: number[]; frames: number[]; targets: number } | null> =>
  page.evaluate(`(async () => {
    var svg = document.querySelector('#board svg');
    if (!svg) return null;
    var r = svg.getBoundingClientRect();
    var moves = [], frames = [];
    var nextFrame = function () { return new Promise(function (res) { requestAnimationFrame(res); }); };
    var last = await nextFrame();
    for (var i = 0; i < 40; i++) {
      var x = r.left + r.width * (0.15 + 0.7 * ((i * 7) % 40) / 40);
      var y = r.top + r.height * (0.2 + 0.6 * ((i * 11) % 40) / 40);
      var t = performance.now();
      svg.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: x, clientY: y, pointerId: 21, pointerType: 'mouse' }));
      moves.push(performance.now() - t);
      var now = await nextFrame();
      frames.push(now - last);
      last = now;
    }
    return { moves: moves, frames: frames, targets: document.querySelectorAll('#board .l-over .target').length };
  })()`);

const { server, origin } = await servePreview(4332, { logLevel: 'error' });
const browser = await chromium.launch({ executablePath: CHROME });
let failed = 0;
const check = (name: string, ok: boolean, note = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? `  (${note})` : ''}`);
};

try {
  // speed 'normal': a Bloom really paints for its beat (speed 'skip' would end it before the first
  // move lands, and the point is the cost DURING the paint).
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: false, isMobile: false });
  const page = await context.newPage();
  await seedSettings(page, { sound: false, music: false, coach: false, speed: 'normal', reduceMotion: false, eyeCandy: false });
  await page.goto(`${origin}/?seed=219682080`);
  await page.waitForFunction('(() => { const h = window.__severgrow; return !!h.state() && !h.busy(); })()', undefined, { timeout: 90_000 });
  await page
    .waitForFunction(() => {
      const ritual = document.getElementById('starter-lottery');
      return !ritual || ritual.hidden || !ritual.getClientRects().length;
    }, undefined, { timeout: 30_000 })
    .catch(() => undefined);
  stage('board up');

  // The human seat's turn: get to ACT/DRAW with a Bloom (or Grow) legal.
  const read = () => page.evaluate('(() => window.__severgrow.state())()') as Promise<State | null>;
  const playOne = async () => {
    for (let i = 0; i < 300; i++) {
      const s = await read();
      if (!s) return null;
      if (s.phase === 'GAME_OVER') return null;
      if (s.actor !== 0) { await page.waitForTimeout(80); continue; }
      await idle(page);
      const now = (await read())!;
      if (now.actor !== 0) continue;
      const legal = legalActions(viewFor(now, 0));
      const pick = (t: Action['t']) => legal.find((a) => a.t === t) ?? null;
      const want = now.phase === 'DRAW' ? pick('Draw') : (pick('Bloom') ?? pick('Sprout'));
      const a = want ?? legal[0];
      if (!a) return null;
      const ok = await page.evaluate(
        ([act, who]) => Boolean((window as unknown as { __severgrow: { playFor: (x: unknown, p: number) => boolean } }).__severgrow.playFor(act, who)),
        [a, 0] as const,
      );
      if (ok) return a;
      await page.waitForTimeout(150);
    }
    return null;
  };

  // A still board (no beat painting): the control.
  await playOne();
  await idle(page);
  await page.waitForTimeout(600);
  const still = await sweep(page);
  if (!still) throw new Error('no board');
  console.log(report('POINTER MOVE, still board', still.moves));
  console.log(report('FRAME GAP, still board', still.frames));
  console.log(`legal targets under the pointer while still: ${still.targets}`);

  // Now the same sweep immediately after a Bloom/Grow is played, while its paint is running.
  const during = await page.evaluate(`(async () => {
    var h = window.__severgrow;
    var svg = document.querySelector('#board svg');
    if (!svg) return null;
    var legal = h.legal();
    var pick = function (t) { for (var i = 0; i < legal.length; i++) if (legal[i].t === t) return legal[i]; return null; };
    var action = pick('Bloom') || pick('Sprout') || pick('Draw') || legal[0];
    if (!action) return { played: false };
    var applied = h.playFor(action, 0);
    var busyNow = h.busy();
    var r = svg.getBoundingClientRect();
    var moves = [], frames = [];
    var nextFrame = function () { return new Promise(function (res) { requestAnimationFrame(res); }); };
    var last = await nextFrame();
    for (var i = 0; i < 40; i++) {
      var x = r.left + r.width * (0.15 + 0.7 * ((i * 7) % 40) / 40);
      var y = r.top + r.height * (0.2 + 0.6 * ((i * 11) % 40) / 40);
      var t = performance.now();
      svg.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: x, clientY: y, pointerId: 22, pointerType: 'mouse' }));
      moves.push(performance.now() - t);
      var now = await nextFrame();
      frames.push(now - last);
      last = now;
    }
    return {
      played: applied,
      busyNow: busyNow,
      kind: action.t,
      moves: moves,
      frames: frames,
      targets: document.querySelectorAll('#board .l-over .target').length,
    };
  })()`) as
    | { played: boolean; busyNow: boolean; kind: string; moves: number[]; frames: number[]; targets: number }
    | null;
  if (!during || !during.played) {
    check('a Bloom is really painting while the moves land', false, JSON.stringify(during));
  } else {
    check('a Bloom is really painting while the moves land', during.busyNow === true, `busy=${during.busyNow} kind=${during.kind} targets=${during.targets}`);
    console.log(report('POINTER MOVE, during the Bloom paint', during.moves));
    console.log(report('FRAME GAP, during the Bloom paint', during.frames));
    console.log('PERF_BOARD ' + JSON.stringify({ still, during }));
  }
  await page.screenshot({ path: '/tmp/perf-board.png' });
} finally {
  await browser.close();
  await server.close();
}

if (failed) {
  console.error(`${failed} perf-board checks failed`);
  process.exit(1);
}
console.log('perf-board checks passed');
