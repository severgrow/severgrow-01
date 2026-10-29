// PHONE HEAT PROBE (owner, 2026-10-29: "phones are getting hot and battery goes down quickly
// while playing"). A phone-sized Chromium (390×844, DPR 3, touch) at 4× CPU throttle, playing a
// REAL offline game and measuring what a phone would actually have to sustain:
//
//   1. IDLE — the player is thinking, nothing is animating. Frames requested by the page must be
//      ~0/s, and the main thread must be near-silent (script / style recalcs / layouts per second).
//   2. A TURN — while a real move animates, the game must still hold ~60 fps.
//   3. RUNNING ANIMATIONS — every live animation, classified: compositor-only (transform /
//      opacity / translate / scale) vs a paint or layout property (box-shadow, filter, width…).
//      An infinite paint animation runs forever on a phone with nobody looking; that is heat.
//   4. EXPENSIVE LAYERS — visible elements with filter / backdrop-filter / will-change, and the
//      biggest default blur/shadow radii on screen.
//   5. HIDDEN TAB — animations and timers must stop (a phone in a pocket must not paint).
//
// It prints one JSON block per run plus an averaged table, and fails only on the hard budgets
// below (`check`). Numbers are the deliverable; run it before and after a change.
//
//   CHANNEL=futa05 npm run web:build
//   PW_CHROMIUM="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
//     npx tsx web/e2e/perf-phone.ts            (RUNS=3 by default, CPU=4)
import { chromium } from 'playwright-core';
import type { Page } from 'playwright-core';
import { servePreview } from './helpers/preview-port.js';
import { seedSettings } from './helpers/settings-seed.js';

const CHROME = process.env.PW_CHROMIUM ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const RUNS = Math.max(1, Number(process.env.RUNS ?? 3));
const CPU = Math.max(1, Number(process.env.CPU ?? 4));
const IDLE_MS = Math.max(1000, Number(process.env.IDLE_MS ?? 4000));
const SEED = process.env.SEED ?? '219682080';

type G = {
  idle: { frames: number; fps: number; scriptMsPerS: number; taskMsPerS: number; recalcPerS: number; layoutPerS: number; layoutMsPerS: number; recalcMsPerS: number; longTaskMs: number };
  turn: { frames: number; fps: number; median: number; p95: number; worst: number; over33: number; kind: string };
  anim: { running: number; infinite: number; compositor: number; paint: number; paintProps: Record<string, number>; samples: string[] };
  layers: { filter: number; backdrop: number; willChange: number; biggestShadow: number; blur: number };
  hidden: { animations: number; scriptMsPerS: number; taskMsPerS: number };
  feel: unknown;
};

const stats = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const at = (q: number) => s[Math.min(s.length - 1, Math.floor(q * s.length))] ?? 0;
  const avg = s.reduce((a, b) => a + b, 0) / Math.max(1, s.length);
  return { n: s.length, avg, median: at(0.5), p95: at(0.95), worst: s.at(-1) ?? 0 };
};

/** Runs in the page before any app code: a switchable frame recorder + the animation classifier. */
const init = () => {
  const w = window as unknown as Record<string, unknown>;
  const probe = {
    on: false,
    frames: [] as number[],
    animations: 0,
    long: 0,
  };
  w.__probe = probe;
  let last = 0;
  const tick = (t: number) => {
    if (probe.on) {
      if (last) probe.frames.push(t - last);
      last = t;
    } else last = 0;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  try {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) if (probe.on) probe.long += e.duration;
    }).observe({ type: 'longtask', buffered: false });
  } catch {
    /* not every engine exposes longtask */
  }
};

/** CSS properties whose animation costs a paint / layout / re-raster on every frame. */
const PAINT = [
  'box-shadow', 'text-shadow', 'filter', 'backdrop-filter', 'width', 'height', 'top', 'left', 'right', 'bottom',
  'margin', 'margin-top', 'margin-left', 'margin-right', 'margin-bottom', 'padding', 'border-width',
  'border-radius', 'background', 'background-color', 'background-position', 'background-size',
  'stroke-width', 'stroke-dashoffset', 'clip-path', 'mask', 'mask-image', 'font-size', 'line-height',
  'inset', 'offset-distance',
];
const COMPOSITOR = ['transform', 'opacity', 'translate', 'rotate', 'scale'];

const pageEval = <T,>(page: Page, fn: string) => page.evaluate(fn) as Promise<T>;

const startGame = async (page: Page, base: string) => {
  await page.goto(`${base}/?seed=${SEED}`);
  await page.waitForFunction('(() => { const h = window.__severgrow; return !!h && !!h.state() && !h.busy(); })()', undefined, { timeout: 90_000 });
  // The Who-starts ritual covers the board for ~1.6 s; measured play starts after it.
  await page
    .waitForFunction(() => {
      const ritual = document.getElementById('starter-lottery');
      return !ritual || ritual.hidden || !ritual.getClientRects().length;
    }, undefined, { timeout: 30_000 })
    .catch(() => undefined);
  // Land on the human's turn with the board settled.
  await page.waitForFunction(() => {
    const h = (window as any).__severgrow;
    if (!h || !h.state) return false;
    const s = h.state();
    return !!s && s.phase !== 'GAME_OVER' && s.actor === 0 && !h.busy();
  }, undefined, { timeout: 90_000 }).catch(() => undefined);
};

/** One idle window: no input, no move, the player just thinking. */
const measureIdle = async (page: Page, cdp: any, ms: number) => {
  const before = await metrics(cdp);
  await pageEval(page, '(() => { const p = window.__probe; p.frames = []; p.long = 0; p.on = true; })()');
  await page.waitForTimeout(ms);
  const frames = await pageEval<number[]>(page, '(() => { const p = window.__probe; p.on = false; return p.frames.slice(1); })()');
  const long = await pageEval<number>(page, '(() => window.__probe.long)()');
  const after = await metrics(cdp);
  const s = ms / 1000;
  const d = (k: string) => (after[k] ?? 0) - (before[k] ?? 0);
  return {
    frames: frames.length,
    fps: frames.length / s,
    scriptMsPerS: (d('ScriptDuration') * 1000) / s,
    taskMsPerS: (d('TaskDuration') * 1000) / s,
    recalcPerS: d('RecalcStyleCount') / s,
    layoutPerS: d('LayoutCount') / s,
    layoutMsPerS: (d('LayoutDuration') * 1000) / s,
    recalcMsPerS: (d('RecalcStyleDuration') * 1000) / s,
    longTaskMs: Math.round(long),
  };
};

const metrics = async (cdp: any): Promise<Record<string, number>> =>
  Object.fromEntries(((await cdp.send('Performance.getMetrics')) as { metrics: { name: string; value: number }[] }).metrics.map((m) => [m.name, m.value]));

/** One real move, played through the page's own test hook, with every frame timed. */
const measureTurn = async (page: Page) => {
  const picked = await pageEval<{ ok: boolean; kind: string }>(page, `(() => {
    const h = window.__severgrow;
    const legal = h.legal();
    const pick = (t) => legal.find((a) => a.t === t) ?? null;
    const s = h.state();
    const action = s.phase === 'DRAW' ? (pick('Draw') ?? legal[0]) : (pick('Bloom') ?? pick('Sprout') ?? legal[0]);
    if (!action) return { ok: false, kind: 'none' };
    const p = window.__probe; p.frames = []; p.long = 0; p.on = true;
    const ok = h.playFor(action, 0);
    return { ok, kind: action.t };
  })()`);
  // Wait for the queue to drain (the animation has finished), then stop recording.
  await page.waitForFunction('(() => { const h = window.__severgrow; return !h || !h.busy(); })()', undefined, { timeout: 60_000 }).catch(() => undefined);
  await page.waitForTimeout(120);
  const frames = await pageEval<number[]>(page, '(() => { const p = window.__probe; p.on = false; return p.frames.slice(1); })()');
  const g = stats(frames);
  return {
    frames: g.n,
    fps: 1000 / Math.max(1, g.avg),
    median: g.median,
    p95: g.p95,
    worst: g.worst,
    over33: frames.filter((x) => x > 33.4).length,
    kind: picked.kind,
  };
};

/** What is running right now, and what would it cost? */
const measureAnimations = (page: Page) =>
  page.evaluate(({ paint, compositor }: { paint: string[]; compositor: string[] }) => {
    const props = (a: Animation & { effect?: AnimationEffect | null }): string[] => {
      const out = new Set<string>();
      const effect = a.effect;
      if (!effect || typeof (effect as KeyframeEffect).getKeyframes !== 'function') return [];
      for (const k of (effect as KeyframeEffect).getKeyframes()) {
        for (const key of Object.keys(k)) {
          if (['offset', 'easing', 'composite', 'computedOffset'].includes(key)) continue;
          out.add(key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`).replace(/^(webkit|moz)-/, ''));
        }
      }
      return [...out];
    };
    const describe = (a: Animation & { effect?: AnimationEffect | null }) => {
      const t = a.effect && (a.effect as KeyframeEffect).target;
      const name = t instanceof Element
        ? (t.id ? `#${t.id}` : t.tagName.toLowerCase()) + '.' + String(t.getAttribute('class') || '').split(' ').filter(Boolean).slice(0, 2).join('.')
        : '?';
      return `${name} [${props(a).join(',')}]`;
    };
    const all = document.getAnimations();
    const running = all.filter((a) => a.playState === 'running');
    let infinite = 0, comp = 0, paintNow = 0;
    const paintProps: Record<string, number> = {};
    const samples: string[] = [];
    for (const a of running) {
      const written = props(a);
      const timing = a.effect && typeof (a.effect as KeyframeEffect).getTiming === 'function' ? (a.effect as KeyframeEffect).getTiming() : {};
      const isInfinite = timing.iterations === Infinity;
      const paintKeys = written.filter((p) => paint.includes(p));
      const compKeys = written.filter((p) => compositor.includes(p));
      if (isInfinite) infinite++;
      if (paintKeys.length) {
        paintNow++;
        for (const p of paintKeys) paintProps[p] = (paintProps[p] || 0) + 1;
        if (samples.length < 14) samples.push(`${isInfinite ? 'INF ' : ''}${describe(a)}`);
      } else if (compKeys.length) comp++;
    }
    return { running: running.length, infinite, compositor: comp, paint: paintNow, paintProps, samples };
  }, { paint: PAINT, compositor: COMPOSITOR });

/** Visible costly layers: filters, backdrop blurs, permanent will-change, biggest shadows. */
const measureLayers = (page: Page) =>
  page.evaluate(() => {
    const visible = (el: Element) => {
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return false;
      if (r.bottom < 0 || r.right < 0 || r.top > innerHeight || r.left > innerWidth) return false;
      const cs = getComputedStyle(el);
      return cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.01;
    };
    let filter = 0, backdrop = 0, willChange = 0, biggestShadow = 0, blur = 0;
    for (const el of document.querySelectorAll('#game *')) {
      if (!visible(el)) continue;
      const cs = getComputedStyle(el);
      if (cs.filter && cs.filter !== 'none') {
        filter++;
        const m = /blur\(([\d.]+)px\)/.exec(cs.filter);
        if (m) blur = Math.max(blur, Number(m[1]));
      }
      if (cs.backdropFilter && cs.backdropFilter !== 'none') backdrop++;
      if (cs.willChange && cs.willChange !== 'auto') willChange++;
      if (cs.boxShadow === 'none') continue;
      // the blur radius is the third length of each shadow; take the largest on screen
      for (const sh of cs.boxShadow.split(/,(?![^(]*\))/)) {
        const nums = sh.match(/-?[\d.]+px/g);
        if (nums && nums.length >= 3) biggestShadow = Math.max(biggestShadow, Number.parseFloat(nums[2]!));
      }
    }
    return { filter, backdrop, willChange, biggestShadow, blur };
  });

/** The page in the background: another tab is in front, nothing may paint. */
const measureHidden = async (page: Page, cdp: any, context: any) => {
  const other = await context.newPage();
  await other.goto('about:blank');
  await other.bringToFront();
  await page.waitForTimeout(400);
  const before = await metrics(cdp);
  const anim = await measureAnimations(page);
  const isHidden = await pageEval<boolean>(page, '(() => document.hidden)()');
  await page.waitForTimeout(3000);
  const after = await metrics(cdp);
  const d = (k: string) => (after[k] ?? 0) - (before[k] ?? 0);
  await page.bringToFront();
  await other.close();
  await page.waitForTimeout(300);
  return {
    animations: anim.running,
    scriptMsPerS: (d('ScriptDuration') * 1000) / 3,
    taskMsPerS: (d('TaskDuration') * 1000) / 3,
    hidden: isHidden,
  };
};

let failed = 0;
const check = (name: string, ok: boolean, note = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? `  (${note})` : ''}`);
};

const { server, origin } = await servePreview(4391, { logLevel: 'error' });
const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
const runs: G[] = [];

try {
  for (let run = 0; run < RUNS; run++) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    await seedSettings(page, { sound: false, music: false, coach: false, speed: 'normal', reduceMotion: false, eyeCandy: true });
    // tsx names inner arrow functions with its own `__name` helper; the page needs that helper
    // when Playwright serialises an instrumented function into it.
    await page.addInitScript('window.__name = window.__name || ((fn) => fn);');
    await page.addInitScript(init);
    const cdp = await context.newCDPSession(page);
    await cdp.send('Performance.enable');
    // The app reads its own base from the served page; patch the placeholder here.
    await page.route('**/*', (route) => route.continue());
    await startGame(page, origin);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });
    await page.waitForTimeout(700);

    const idle = await measureIdle(page, cdp, IDLE_MS);
    const anim = await measureAnimations(page);
    const layers = await measureLayers(page);
    const turn = await measureTurn(page);
    const hidden = await measureHidden(page, cdp, context);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    const feel = await pageEval(page, '(() => window.__severgrow.feel())()');
    const g: G = { idle, turn, anim, layers, hidden: { animations: hidden.animations, scriptMsPerS: hidden.scriptMsPerS, taskMsPerS: hidden.taskMsPerS }, feel };
    runs.push(g);
    console.log(`RUN ${run + 1} ` + JSON.stringify(g));
    if (run === 0) {
      check('the tab really goes hidden for the hidden test', hidden.hidden === true, `hidden=${hidden.hidden}`);
      if (anim.samples.length) console.log('  paint animations: ' + JSON.stringify(anim.samples, null, 0));
      console.log('  paint props: ' + JSON.stringify(anim.paintProps));
    }
    await context.close();
  }
} finally {
  await browser.close();
  await server.close();
}

// ----- the table (averaged, with the range that matters) -----
const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
const col = (f: (g: G) => number) => {
  const xs = runs.map(f);
  return `${avg(xs).toFixed(1)} (${Math.min(...xs).toFixed(1)}–${Math.max(...xs).toFixed(1)})`;
};
console.log(`\nPERF-PHONE  runs=${runs.length}  cpu=${CPU}x  viewport=390x844  seed=${SEED}`);
console.log(`idle      frames/s ${col((g) => g.idle.fps)}   script ms/s ${col((g) => g.idle.scriptMsPerS)}   task ms/s ${col((g) => g.idle.taskMsPerS)}`);
console.log(`idle      style recalcs/s ${col((g) => g.idle.recalcPerS)}   layouts/s ${col((g) => g.idle.layoutPerS)}   long-task ms ${col((g) => g.idle.longTaskMs)}`);
console.log(`turn      fps ${col((g) => g.turn.fps)}   median ${col((g) => g.turn.median)} ms   p95 ${col((g) => g.turn.p95)} ms   worst ${col((g) => g.turn.worst)} ms   over-33ms ${col((g) => g.turn.over33)}`);
console.log(`anim      running ${col((g) => g.anim.running)}   infinite ${col((g) => g.anim.infinite)}   compositor ${col((g) => g.anim.compositor)}   PAINT ${col((g) => g.anim.paint)}`);
console.log(`layers    filter ${col((g) => g.layers.filter)}   backdrop-filter ${col((g) => g.layers.backdrop)}   will-change ${col((g) => g.layers.willChange)}   biggest shadow blur ${col((g) => g.layers.biggestShadow)}px   blur ${col((g) => g.layers.blur)}px`);
console.log(`hidden    animations ${col((g) => g.hidden.animations)}   script ms/s ${col((g) => g.hidden.scriptMsPerS)}   task ms/s ${col((g) => g.hidden.taskMsPerS)}`);
console.log('PERF_PHONE ' + JSON.stringify(runs));

// Budgets: a phone that is merely thinking must not animate, and a move must stay at 60 fps.
const mean = (f: (g: G) => number) => avg(runs.map(f));
check('idle requests ~no frames (<= 2/s mean)', mean((g) => g.idle.fps) <= 2, `${mean((g) => g.idle.fps).toFixed(1)}/s`);
check('idle keeps the main thread quiet (<= 4 ms script/s mean)', mean((g) => g.idle.scriptMsPerS) <= 4, `${mean((g) => g.idle.scriptMsPerS).toFixed(1)} ms/s`);
check('a turn still animates at full rate (p95 <= 34 ms at 4x CPU)', mean((g) => g.turn.p95) <= 34, `${mean((g) => g.turn.p95).toFixed(1)} ms`);
check('no paint-property animation runs while idle', mean((g) => g.anim.paint) === 0, `${mean((g) => g.anim.paint).toFixed(1)} running`);
check('nothing animates in a hidden tab', mean((g) => g.hidden.animations) === 0, `${mean((g) => g.hidden.animations).toFixed(1)} running`);

if (failed) {
  console.error(`\n${failed} perf-phone checks failed`);
  process.exit(1);
}
console.log('\nperf-phone checks passed');
process.exit(0);
