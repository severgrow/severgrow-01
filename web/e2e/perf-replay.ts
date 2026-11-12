// PERF PROBE — what one replay beat paint and one scrub-seek actually cost.
//
// Why it is written this way (the first attempt died here): the practice match is driven through
// the page's own hooks exactly as `replay-offline` does it, and every stage prints a line the
// moment it is reached, so a stall names its own stage instead of surfacing as one bare
// `waitForFunction` timeout. All waits are on a concrete DOM signal with a generous ceiling (this
// machine runs several worktrees at once), never a fixed sleep.
//   CHANNEL=futa04 PW_CHROMIUM=... npx tsx web/e2e/perf-replay.ts
import { chromium } from 'playwright-core';
import type { Page } from 'playwright-core';
import { legalActions, viewFor } from '../../src/engine/index.js';
import type { Action, State } from '../../src/engine/index.js';
import { servePreview } from './helpers/preview-port.js';
import { seedSettings } from './helpers/settings-seed.js';

const CHROME = process.env.PW_CHROMIUM ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const stage = (line: string): void => console.log(`[perf] ${line}`);

type Perf = { paint: number[]; sig: number[]; render: number[]; turn: number[]; seek: number[]; rebuild: number[] };
type ReplayNow = {
  index: number;
  playing: boolean;
  elapsed: number;
  total: number;
  ended: boolean;
  board: string;
  turn: number | null;
  perf: Perf;
};
const replayNow = async (page: Page): Promise<ReplayNow | null> =>
  (await page.evaluate(() => {
    const hook = (window as unknown as { __severgrow?: { replay?: () => unknown } }).__severgrow;
    return hook?.replay?.() ?? null;
  })) as ReplayNow | null;

const stats = (values: number[]) => {
  const s = [...values].sort((a, b) => a - b);
  const at = (q: number) => s[Math.min(s.length - 1, Math.floor(q * s.length))] ?? 0;
  const avg = s.length ? s.reduce((a, b) => a + b, 0) / s.length : 0;
  return { n: s.length, median: at(0.5), p95: at(0.95), max: at(1), avg };
};

const report = (name: string, values: number[]): string => {
  const s = stats(values);
  return `${name}: n=${s.n} median ${s.median.toFixed(2)} ms, p95 ${s.p95.toFixed(2)} ms, max ${s.max.toFixed(2)} ms, avg ${s.avg.toFixed(2)} ms`;
};

/** Play the practice match to its finish card (the same door `replay-offline` uses). */
const toGameOver = async (page: Page, maxSteps = 2000): Promise<string> => {
  await page
    .waitForFunction(
      () => {
        const ritual = document.getElementById('starter-lottery');
        return !ritual || ritual.hidden || !ritual.getClientRects().length;
      },
      undefined,
      { timeout: 30_000 },
    )
    .catch(() => undefined);
  const read = () => page.evaluate('(() => { const h = window.__severgrow; return h.state(); })()') as Promise<State | null>;
  const idle = () =>
    page.waitForFunction('(() => { const h = window.__severgrow; return !!h.state() && !h.busy(); })()', undefined, {
      timeout: 90_000,
    });
  let waiting = 0;
  let refused = 0;
  for (let i = 0; i < maxSteps; i++) {
    const s = await read();
    if (!s) return 'no state';
    if (s.phase === 'GAME_OVER') return 'ended';
    await idle();
    const now = (await read())!;
    if (now.phase === 'GAME_OVER') return 'ended';
    if (now.actor !== 0) {
      if (++waiting > 400) return `the computer never finished its turn (${now.actor}, ${now.phase})`;
      await page.waitForTimeout(80);
      continue;
    }
    waiting = 0;
    const legal = legalActions(viewFor(now, 0));
    if (!legal.length) return `no legal move for the human (${now.phase})`;
    const pick = (t: Action['t']) => legal.find((a) => a.t === t) ?? null;
    const natural = (now.phase === 'DRAW'
      ? [pick('Draw'), pick('EndAct'), pick('Discard')]
      : [pick('Bloom'), pick('Sprout'), pick('EndAct'), pick('Discard')]
    ).filter((a): a is Action => !!a);
    const candidates: Action[] = [...natural, ...legal.filter((a) => !natural.includes(a))];
    let applied = false;
    for (const candidate of candidates) {
      applied = await page.evaluate(
        ([a, who]) => Boolean((window as unknown as { __severgrow: { playFor: (x: unknown, p: number) => boolean } }).__severgrow.playFor(a, who)),
        [candidate, 0] as const,
      );
      if (applied) break;
    }
    if (!applied) {
      if (++refused > 10) return `the app refused every legal action (${now.phase})`;
      await page.waitForTimeout(200);
    } else refused = 0;
  }
  return `still playing after ${maxSteps} steps`;
};

const { server, origin } = await servePreview(4331, { logLevel: 'error' });
stage(`serving ${origin}`);
const browser = await chromium.launch({ executablePath: CHROME });
let failed = 0;
const check = (name: string, ok: boolean, note = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? `  (${note})` : ''}`);
};

try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  await seedSettings(page, { sound: false, music: false, coach: false, speed: 'skip', reduceMotion: false, eyeCandy: false });
  await page.goto(`${origin}/?seed=219682080`);
  stage('page loaded');
  await page.waitForFunction('(() => { const h = window.__severgrow; return !!h.state() && !h.busy(); })()', undefined, {
    timeout: 90_000,
  });
  stage('app idle, playing the practice match');
  const t0 = Date.now();
  const ended = await toGameOver(page);
  stage(`practice match: ${ended} in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  check('a real practice match reaches its finish card', ended === 'ended', ended);
  await page.waitForSelector('#gameover:not([hidden])', { timeout: 60_000 });
  await page.waitForFunction('(() => { const h = window.__severgrow; return !h.busy(); })()', undefined, { timeout: 60_000 });
  await page.waitForTimeout(300);
  stage('finish card up, opening the replay');
  await page.locator('#go-replay').click();
  await page.waitForSelector('#replay:not([hidden])', { timeout: 30_000 });
  // The concrete signal that the replay has really booted: its clock exists and a tile is drawn.
  await page.waitForFunction(
    '(() => { const h = window.__severgrow; const r = h.replay(); return !!r && r.total > 0 && document.querySelectorAll("#replay .l-tiles .tile").length > 0; })()',
    undefined,
    { timeout: 60_000 },
  );
  stage('replay mounted');
  const plan = (await page.evaluate(() => (window as unknown as { __severgrow?: { replayPlan?: () => unknown } }).__severgrow?.replayPlan?.() ?? null)) as
    | { total: number; frames: unknown[] }
    | null;
  console.log(`Replay plan: ${plan?.frames.length ?? '?'} beats over ${((plan?.total ?? 0) / 1000).toFixed(1)} s`);

  // ---- 1. PLAYBACK PAINT: let it play ~8 s and read the player's own per-beat timings ----
  const before = (await replayNow(page))!;
  // Frame pacing while the beats paint: a dropped frame here is what the eye would see.
  // (String form on purpose: tsx's keepNames helper wraps named inner functions with `__name`,
  // which does not exist in the page.)
  await page.evaluate(`(() => {
    window.__perfFrames = [];
    var last = performance.now();
    var step = function (now) {
      window.__perfFrames.push(now - last);
      last = now;
      if (window.__perfFrames.length < 100000) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  })()`);
  await page.waitForTimeout(8000);
  const frameGaps = (await page.evaluate(() => (window as unknown as { __perfFrames?: number[] }).__perfFrames ?? [])) as number[];
  const overBudget = frameGaps.filter((g) => g > 20).length;
  console.log(report('FRAME GAP while beats paint', frameGaps));
  console.log(`frames over 20 ms: ${overBudget} of ${frameGaps.length}`);
  const played = (await replayNow(page))!;
  const p = played.perf;
  console.log(report('BEAT paint (whole paint())', p.paint));
  console.log(report('BEAT board.render()', p.render));
  console.log(report('BEAT boardSignature()', p.sig));
  console.log(report('BEAT paintTurn', p.turn));
  check('playback advanced through several beats', played.index > before.index + 2, `${before.index} -> ${played.index}`);

  // ---- 2. SEEK: 24 pointer drags across the bar, each a rebuild from the log + one paint ----
  const seekSamples = await page.evaluate(async () => {
    const scrub = document.querySelector('#replay .rp-scrub');
    const r = scrub?.getBoundingClientRect();
    if (!r) return null;
    const y = r.top + r.height / 2;
    scrub!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: r.left + r.width * 0.02, clientY: y, pointerId: 9, pointerType: 'mouse' }));
    const walls: number[] = [];
    const rects: number[] = [];
    const order: number[] = [];
    for (let i = 0; i <= 24; i++) {
      const f = 0.02 + (0.96 * i) / 24;
      const x = r.left + r.width * f;
      // The rect the handler itself reads on every move (a forced layout if the last paint
      // invalidated style/layout), timed apart from the handler's own work.
      const tRect = performance.now();
      scrub!.getBoundingClientRect();
      rects.push(performance.now() - tRect);
      const t = performance.now();
      scrub!.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: x, clientY: y, pointerId: 9, pointerType: 'mouse' }));
      walls.push(performance.now() - t);
      order.push(f);
    }
    scrub!.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: r.left + r.width * 0.98, clientY: y, pointerId: 9, pointerType: 'mouse' }));
    return { walls, rects, order };
  });
  if (!seekSamples) throw new Error('no scrub bar');
  const seekNow = (await replayNow(page))!;
  console.log(report('SEEK rebuild from log (boardAtIndex)', seekNow.perf.rebuild));
  console.log(report('SEEK paint', seekNow.perf.seek));
  console.log(report('SEEK getBoundingClientRect before the move', seekSamples.rects));
  console.log(report('SEEK pointer handler (wall clock)', seekSamples.walls));

  // ---- 2b. THE SAME DRAG ON A SLOW PHONE (4x CPU throttle, the usual mid-range penalty) ----
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.waitForTimeout(500);
  const slow = await page.evaluate(`(async () => {
    var scrub = document.querySelector('#replay .rp-scrub');
    var r = scrub && scrub.getBoundingClientRect();
    if (!r) return null;
    var y = r.top + r.height / 2;
    scrub.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: r.left + r.width * 0.02, clientY: y, pointerId: 11, pointerType: 'mouse' }));
    var walls = [];
    for (var i = 0; i <= 24; i++) {
      var f = 0.02 + (0.96 * i) / 24;
      var x = r.left + r.width * f;
      var t = performance.now();
      scrub.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: x, clientY: y, pointerId: 11, pointerType: 'mouse' }));
      walls.push(performance.now() - t);
    }
    scrub.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: r.left + r.width * 0.98, clientY: y, pointerId: 11, pointerType: 'mouse' }));
    return walls;
  })()`) as number[] | null;
  if (slow) console.log(report('SEEK pointer handler, 4x CPU throttle', slow));

  // ---- 2b2. THE REAL DRAG ON THAT SLOW PHONE: one move per displayed frame ----
  const slowPaced = (await page.evaluate(`(async () => {
    var scrub = document.querySelector('#replay .rp-scrub');
    var r = scrub && scrub.getBoundingClientRect();
    if (!r) return null;
    var y = r.top + r.height / 2;
    scrub.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: r.left + r.width * 0.05, clientY: y, pointerId: 15, pointerType: 'touch', isPrimary: true }));
    var gaps = [], moves = [];
    var nextFrame = function () { return new Promise(function (res) { requestAnimationFrame(res); }); };
    var last = await nextFrame();
    for (var i = 0; i < 90; i++) {
      var f = 0.05 + (0.9 * i) / 89;
      var x = r.left + r.width * f;
      var t = performance.now();
      scrub.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: x, clientY: y, pointerId: 15, pointerType: 'touch', isPrimary: true }));
      moves.push(performance.now() - t);
      var now = await nextFrame();
      gaps.push(now - last);
      last = now;
    }
    scrub.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: r.left + r.width * 0.95, clientY: y, pointerId: 15, pointerType: 'touch', isPrimary: true }));
    return { gaps: gaps, moves: moves };
  })()`)) as { gaps: number[]; moves: number[] } | null;
  if (slowPaced) {
    const dropped = slowPaced.gaps.filter((g) => g > 20).length;
    console.log(report('DRAG 4x throttled: frame gap', slowPaced.gaps));
    console.log(report('DRAG 4x throttled: move handler', slowPaced.moves));
    console.log(`drag 4x: ${dropped} of ${slowPaced.gaps.length} frames over 20 ms`);
  }

  // ---- 2b3. DOES THE SEEK COST GROW WITH HOW FAR ALONG THE MATCH IS? ----
  // `boardAtIndex` re-applies every action before the beat, so a drag near the end replays more.
  for (const f of [0.02, 0.25, 0.5, 0.75, 0.98]) {
    const one = (await page.evaluate(`(async () => {
      var scrub = document.querySelector('.rp-scrub');
      var r = scrub && scrub.getBoundingClientRect();
      if (!r) return null;
      var y = r.top + r.height / 2;
      var x = r.left + r.width * ${f};
      var reps = 6, walls = [];
      scrub.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: x, clientY: y, pointerId: 17, pointerType: 'mouse' }));
      for (var i = 0; i < reps; i++) {
        var t = performance.now();
        scrub.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: x + (i % 2), clientY: y, pointerId: 17, pointerType: 'mouse' }));
        walls.push(performance.now() - t);
      }
      scrub.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: x, clientY: y, pointerId: 17, pointerType: 'mouse' }));
      var now = window.__severgrow.replay();
      return { walls: walls, rebuild: now.perf.rebuild.slice(-reps), index: now.index, frames: window.__severgrow.replayPlan().frames.length };
    })()`)) as { walls: number[]; rebuild: number[]; index: number; frames: number } | null;
    if (one) {
      console.log(
        `SEEK AT ${Math.round(f * 100)}%: frame ${one.index}/${one.frames - 1}, rebuild median ${stats(one.rebuild).median.toFixed(2)} ms, move median ${stats(one.walls).median.toFixed(2)} ms`,
      );
    }
  }
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });

  // ---- 2c. A REAL DRAG: one move per displayed frame for 1.5 s, as a finger actually does ----
  const paced = (await page.evaluate(`(async () => {
    var scrub = document.querySelector('#replay .rp-scrub');
    var r = scrub && scrub.getBoundingClientRect();
    if (!r) return null;
    var y = r.top + r.height / 2;
    scrub.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: r.left + r.width * 0.05, clientY: y, pointerId: 13, pointerType: 'touch', isPrimary: true }));
    var gaps = [], moves = [];
    var nextFrame = function () { return new Promise(function (res) { requestAnimationFrame(res); }); };
    var last = await nextFrame();
    for (var i = 0; i < 90; i++) {
      var f = 0.05 + (0.9 * i) / 89;
      var x = r.left + r.width * f;
      var t = performance.now();
      scrub.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: x, clientY: y, pointerId: 13, pointerType: 'touch', isPrimary: true }));
      moves.push(performance.now() - t);
      var now = await nextFrame();
      gaps.push(now - last);
      last = now;
    }
    scrub.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: r.left + r.width * 0.95, clientY: y, pointerId: 13, pointerType: 'touch', isPrimary: true }));
    return { gaps: gaps, moves: moves };
  })()`)) as { gaps: number[]; moves: number[] } | null;
  if (paced) {
    const dropped = paced.gaps.filter((g) => g > 20).length;
    console.log(report('DRAG, one move per frame: frame gap', paced.gaps));
    console.log(report('DRAG, one move per frame: move handler', paced.moves));
    console.log(`drag: ${dropped} of ${paced.gaps.length} frames over 20 ms (60 Hz budget 16.7 ms)`);
  }

  // ---- 3. THE SEEKED BOARD IS THE FRAME'S OWN BOARD (never take a picture for speed) ----
  const seekMatches = await page.evaluate(() => {
    const hook = (window as unknown as { __severgrow?: { replay?: () => { index: number; board: string } | null; replayPlan?: () => { frames: { board: string }[] } | null } }).__severgrow;
    const now = hook?.replay?.() ?? null;
    const plan = hook?.replayPlan?.() ?? null;
    if (!now || !plan) return false;
    return plan.frames[now.index]?.board === now.board;
  });
  check('a dragged seek paints exactly the frame it claims', seekMatches === true);

  console.log('PERF_REPLAY ' + JSON.stringify({ frames: plan?.frames.length, played, seek: seekNow.perf }));
} finally {
  await browser.close();
  await server.close();
}

if (failed) {
  console.error(`${failed} perf-replay checks failed`);
  process.exit(1);
}
console.log('perf-replay checks passed');
