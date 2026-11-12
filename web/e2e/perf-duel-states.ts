// PHONE HEAT, per duel state (owner 2026-10-30: "phone is still getting warm while playing duels").
//
// `perf-phone.ts` measures ONE state: an empty board, idle, at the very start of a game. That is
// the cheapest state a duel has. This suite measures the states a real duel actually spends its
// time in, on the same phone profile (390×844, DPR 3, touch, 4× CPU) and with the same metric set,
// so the numbers can be put beside the 2026-10-29 table:
//
//   1. BOARD IDLE — the player is thinking on the first turn (empty board).
//   2. MID-GAME IDLE — the player has played a few turns: the board now carries per-tile art.
//   3. THROW IDLE — the player is choosing a card to discard and the display's idle re-prompt is
//      blinking (the state a thinking player leaves the phone in).
//   4. A TURN — a real move, frame-timed.
//   5. OPPONENT CATCH-UP — the bot is taking its turn; the player's phone is still awake.
//   6. THE PLATE — the duel is over and the result is on screen.
//
// Per state: main-thread task ms/s, style recalcs/s and ms/s, layouts/s, main-thread frames/s,
// compositor draws/s, raster ms/s, running animations split compositor vs paint (plus which paint
// properties), and how many visible elements carry filter / backdrop-filter / will-change.
//
//   CHANNEL=futa04 … npm run web:build
//   PW_CHROMIUM="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" npx tsx web/e2e/perf-duel-states.ts
// Optional: RUNS=1 (default 2), CPU=4, MS=3000, SEED=…, DIST=web/dist-before, SKIP_PLATE=1
import { chromium } from 'playwright-core';
import type { Page } from 'playwright-core';
import { servePreview, serveStaticDist } from './helpers/preview-port.js';
import { seedSettings } from './helpers/settings-seed.js';

const CHROME = process.env.PW_CHROMIUM ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const RUNS = Math.max(1, Number(process.env.RUNS ?? 2));
const CPU = Math.max(1, Number(process.env.CPU ?? 4));
const MS = Math.max(1500, Number(process.env.MS ?? 3000));
const SEED = process.env.SEED ?? '219682080';
const DIST = process.env.DIST ?? '';
const SKIP_PLATE = process.env.SKIP_PLATE === '1';
const TURNS = Math.max(0, Number(process.env.TURNS ?? 5));

const PAINT = [
  'box-shadow', 'text-shadow', 'filter', 'backdrop-filter', 'width', 'height', 'top', 'left', 'right', 'bottom',
  'margin', 'padding', 'border-width', 'border-radius', 'background', 'background-color', 'background-position',
  'background-size', 'stroke-width', 'stroke-dashoffset', 'stroke-opacity', 'clip-path', 'mask', 'mask-image',
  'font-size', 'line-height', 'inset', 'offset-distance', 'fill',
];
const COMPOSITOR = ['transform', 'opacity', 'translate', 'rotate', 'scale'];

type State = {
  label: string; step: string; ms: number;
  taskMsPerS: number; scriptMsPerS: number; recalcMsPerS: number; recalcPerS: number;
  layoutMsPerS: number; layoutPerS: number; beginMainPerS: number; drawPerS: number; rasterMsPerS: number;
  appRafPerS: number; longTaskMs: number;
  anims: number; infinite: number; compositor: number; paint: number; paintNames: string[];
  filter: number; backdrop: number; willChange: number; shadowBlur: number; blur: number;
  branches: number; cards: number;
};

const stats = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const at = (q: number) => s[Math.min(s.length - 1, Math.floor(q * s.length))] ?? 0;
  return { n: s.length, avg: s.reduce((a, b) => a + b, 0) / Math.max(1, s.length), median: at(0.5), p95: at(0.95), worst: s.at(-1) ?? 0 };
};

/** Counts frames the GAME asks for and long tasks; never schedules a frame of its own. */
const init = () => {
  const w = window as unknown as Record<string, unknown>;
  const probe = { on: false, frames: [] as number[], long: 0, appRaf: 0, own: 0, recording: false };
  w.__probe = probe;
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb: FrameRequestCallback) => {
    if (!probe.own) probe.appRaf++;
    return raf(cb);
  };
  try {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) if (probe.on) probe.long += e.duration;
    }).observe({ type: 'longtask', buffered: false });
  } catch { /* not every engine exposes longtask */ }
  (w as { __recordFrames?: (on: boolean) => void }).__recordFrames = (on: boolean) => {
    probe.recording = on;
    if (on) probe.frames = [];
    else return;
    let last = 0;
    const tick = (t: number) => {
      if (!probe.recording) return;
      if (last) probe.frames.push(t - last);
      last = t;
      probe.own++;
      requestAnimationFrame(tick);
      probe.own--;
    };
    probe.own++;
    requestAnimationFrame(tick);
    probe.own--;
  };
};

const metrics = async (cdp: any): Promise<Record<string, number>> =>
  Object.fromEntries(((await cdp.send('Performance.getMetrics')) as { metrics: { name: string; value: number }[] }).metrics.map((m) => [m.name, m.value]));

const census = (page: Page, paint: string[], compositor: string[]) => page.evaluate(({ paint: P, compositor: C }: { paint: string[]; compositor: string[] }) => {
  const props = (a: Animation): string[] => {
    const out = new Set<string>();
    const effect = a.effect;
    if (!effect || typeof (effect as KeyframeEffect).getKeyframes !== 'function') return [];
    for (const k of (effect as KeyframeEffect).getKeyframes()) {
      for (const key of Object.keys(k)) {
        if (['offset', 'easing', 'composite', 'computedOffset'].includes(key)) continue;
        out.add(key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`));
      }
    }
    return [...out];
  };
  const running = document.getAnimations().filter((a) => a.playState === 'running');
  let infinite = 0, comp = 0, painted = 0;
  const paintNames = new Set<string>();
  for (const a of running) {
    const written = props(a);
    const timing = a.effect && typeof (a.effect as KeyframeEffect).getTiming === 'function' ? (a.effect as KeyframeEffect).getTiming() : {};
    if (timing.iterations === Infinity) infinite++;
    if (written.some((p) => P.includes(p))) {
      painted++;
      paintNames.add((a as unknown as { animationName?: string }).animationName ?? '(script)');
    } else if (written.some((p) => C.includes(p))) comp++;
  }
  let filter = 0, backdrop = 0, willChange = 0, shadowBlur = 0, blur = 0;
  for (const el of document.querySelectorAll('#game *')) {
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    if (r.bottom < 0 || r.right < 0 || r.top > innerHeight || r.left > innerWidth) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) <= 0.01) continue;
    if (cs.filter && cs.filter !== 'none') {
      filter++;
      const m = /blur\(([\d.]+)px\)/.exec(cs.filter);
      if (m) blur = Math.max(blur, Number(m[1]));
    }
    if (cs.backdropFilter && cs.backdropFilter !== 'none') backdrop++;
    if (cs.willChange && cs.willChange !== 'auto') willChange++;
    if (cs.boxShadow !== 'none') {
      for (const sh of cs.boxShadow.split(/,(?![^(]*\))/)) {
        const nums = sh.match(/-?[\d.]+px/g);
        if (nums && nums.length >= 3) shadowBlur = Math.max(shadowBlur, Number.parseFloat(nums[2]!));
      }
    }
  }
  return {
    anims: running.length, infinite, compositor: comp, paint: painted, paintNames: [...paintNames],
    filter, backdrop, willChange, shadowBlur, blur,
    branches: document.querySelectorAll('.territory-branch').length,
    cards: document.querySelectorAll('#hand .card').length,
  };
}, { paint, compositor });

/** One measured window: Performance metrics + a CDP trace for compositor frames and raster. */
const window_ = async (page: Page, cdp: any, bcdp: any, label: string, ms: number): Promise<State> => {
  const events: { name?: string; dur?: number; ph?: string }[] = [];
  const onData = (e: { value?: unknown[] }) => events.push(...(e.value as typeof events));
  bcdp.on('Tracing.dataCollected', onData);
  const done = new Promise<void>((r) => bcdp.once('Tracing.tracingComplete', () => r()));
  await bcdp.send('Tracing.start', {
    categories: 'devtools.timeline,cc,disabled-by-default-devtools.timeline.frame,toplevel',
    transferMode: 'ReportEvents',
  });
  const before = await metrics(cdp);
  await page.evaluate('(() => { const p = window.__probe; p.long = 0; p.appRaf = 0; p.on = true; })()');
  await page.waitForTimeout(ms);
  const after = await metrics(cdp);
  const probe = await page.evaluate<{ long: number; appRaf: number }>('(() => { const p = window.__probe; p.on = false; return { long: p.long, appRaf: p.appRaf }; })()');
  await bcdp.send('Tracing.end');
  await done;
  bcdp.off('Tracing.dataCollected', onData);
  const s = ms / 1000;
  const d = (k: string) => (after[k] ?? 0) - (before[k] ?? 0);
  let draw = 0, beginMain = 0, raster = 0;
  for (const e of events) {
    if (!e.name || e.name.startsWith('__metadata') || e.ph === 'M') continue;
    if (e.name === 'MainFrame.Draw') draw++;
    else if (e.name === 'SendBeginMainFrame') beginMain++;
    else if (/Raster|PictureLayer|TileManager/.test(e.name)) raster += Number(e.dur ?? 0) / 1000;
  }
  const c = await census(page, PAINT, COMPOSITOR);
  const step = await page.evaluate<string>('(() => document.documentElement.dataset.step ?? "-")()');
  return {
    label, step, ms,
    taskMsPerS: d('TaskDuration') * 1000 / s,
    scriptMsPerS: d('ScriptDuration') * 1000 / s,
    recalcMsPerS: d('RecalcStyleDuration') * 1000 / s,
    recalcPerS: d('RecalcStyleCount') / s,
    layoutMsPerS: d('LayoutDuration') * 1000 / s,
    layoutPerS: d('LayoutCount') / s,
    beginMainPerS: beginMain / s,
    drawPerS: draw / s,
    rasterMsPerS: raster / s,
    appRafPerS: probe.appRaf / s,
    longTaskMs: Math.round(probe.long),
    ...c,
  };
};

const startGame = async (page: Page, base: string) => {
  await page.goto(`${base}/?seed=${SEED}`);
  await page.waitForFunction('(() => { const h = window.__severgrow; return !!h && !!h.state() && !h.busy(); })()', undefined, { timeout: 90_000 });
  await page.waitForFunction(() => {
    const ritual = document.getElementById('starter-lottery');
    return !ritual || ritual.hidden || !ritual.getClientRects().length;
  }, undefined, { timeout: 30_000 }).catch(() => undefined);
};

const settle = async (page: Page) => {
  await page.waitForFunction(() => {
    const h = (window as any).__severgrow;
    return !h || !h.busy();
  }, undefined, { timeout: 60_000 }).catch(() => undefined);
};

/** Play one of the named actions for the human (falling back to any legal move). */
const PREFER = ['Draw', 'Bloom', 'Sprout', 'PlayFruit', 'Discard', 'EndAct', 'Cut', 'Blast', 'Bomb'];
const play = async (page: Page, want: string[] = PREFER) => {
  const r = await page.evaluate((wanted: string[]) => {
    const h = (window as any).__severgrow;
    const legal = h.legal();
    const pick = wanted.map((t) => legal.find((a: any) => a.t === t)).find(Boolean) ?? legal[0];
    if (!pick) return { ok: false, kind: 'none' };
    return { ok: h.playFor(pick, 0), kind: pick.t };
  }, want);
  await settle(page);
  return r;
};

/** Hand the turn over: one legal move at a time until it is not ours. */
const passTurn = async (page: Page) => {
  for (let i = 0; i < 8; i++) {
    const s = await page.evaluate(() => (window as any).__severgrow.state());
    if (!s || s.phase === 'GAME_OVER' || s.actor !== 0) return;
    await play(page);
  }
};

/** Wait for the board to be the human's to move on, and the display's idle re-prompt to be up. */
const humanTurnIdle = async (page: Page, waitAlarm: boolean) => {
  await page.waitForFunction(() => {
    const h = (window as any).__severgrow;
    const s = h?.state?.();
    return !!s && s.phase !== 'GAME_OVER' && s.actor === 0 && !h.busy();
  }, undefined, { timeout: 90_000 }).catch(() => undefined);
  if (waitAlarm) {
    await page.waitForFunction(() => document.documentElement.classList.contains('idle-urgency'), undefined, { timeout: 40_000 })
      .catch(() => undefined);
  }
  await page.waitForTimeout(700);
};

/** Frame gaps while a real move animates. */
const measureTurn = async (page: Page) => {
  const played = await page.evaluate<{ ok: boolean; kind: string }>(`(() => {
    const h = window.__severgrow;
    const legal = h.legal();
    const pick = (t) => legal.find((a) => a.t === t) ?? null;
    const s = h.state();
    const action = s.phase === 'DRAW' ? (pick('Draw') ?? legal[0]) : (pick('Bloom') ?? pick('Sprout') ?? legal[0]);
    if (!action) return { ok: false, kind: 'none' };
    window.__recordFrames(true);
    const ok = h.playFor(action, 0);
    return { ok, kind: action.t };
  })()`);
  await settle(page);
  await page.waitForTimeout(150);
  const frames = await page.evaluate<number[]>('(() => { const p = window.__probe; window.__recordFrames(false); return p.frames.slice(1); })()');
  const g = stats(frames);
  return { kind: played.kind, frames: g.n, fps: 1000 / Math.max(1, g.avg), median: g.median, p95: g.p95, worst: g.worst, over33: frames.filter((x) => x > 33.4).length };
};

let failed = 0;
const check = (name: string, ok: boolean, note = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? `  (${note})` : ''}`);
};

const served = DIST ? await serveStaticDist(DIST) : await servePreview(4393, { logLevel: 'error' });
const origin = DIST ? served.origin : (served as { origin: string }).origin;
const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
const states: State[] = [];
const turns: { kind: string; frames: number; fps: number; median: number; p95: number; worst: number; over33: number }[] = [];

try {
  for (let run = 0; run < RUNS; run++) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    await seedSettings(page, { sound: false, music: false, coach: false, speed: 'normal', reduceMotion: false, eyeCandy: true });
    await page.addInitScript('window.__name = window.__name || ((fn) => fn);');
    await page.addInitScript(init);
    const cdp = await context.newCDPSession(page);
    const bcdp = await browser.newBrowserCDPSession();
    await cdp.send('Performance.enable');
    await startGame(page, origin);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });

    // 1. Empty board, the player thinking.
    await humanTurnIdle(page, true);
    states.push(await window_(page, cdp, bcdp, 'board idle (empty)', MS));

    // 2. Mid-game: build a board with per-tile art on it.
    for (let i = 0; i < TURNS; i++) {
      const s = await page.evaluate(() => (window as any).__severgrow.state());
      if (!s || s.phase === 'GAME_OVER') break;
      await passTurn(page);
      await settle(page);
      await page.waitForTimeout(500);
    }
    await humanTurnIdle(page, true);
    states.push(await window_(page, cdp, bcdp, 'mid-game idle', MS));

    // 3. The throw step with the idle re-prompt blinking (the state a thinking player sits in).
    let reachedThrow = false;
    for (let i = 0; i < 10 && !reachedThrow; i++) {
      await humanTurnIdle(page, false);
      const s = await page.evaluate(() => (window as any).__severgrow.state());
      if (!s || s.phase === 'GAME_OVER') break;
      if (s.phase === 'DISCARD' && s.actor === 0) { reachedThrow = true; break; }
      await play(page, ['Draw']);
      await play(page, ['Bloom', 'Sprout', 'PlayFruit']);
    }
    if (reachedThrow) {
      await page.waitForFunction(() => document.documentElement.classList.contains('idle-urgency'), undefined, { timeout: 40_000 }).catch(() => undefined);
      await page.waitForTimeout(400);
      states.push(await window_(page, cdp, bcdp, 'throw idle (re-prompt on)', MS));
    }

    // 4. A real move, frame-timed.
    turns.push(await measureTurn(page));

    // 5. The opponent's catch-up.
    const opp = await page.evaluate(() => (window as any).__severgrow.state());
    if (opp && opp.phase !== 'GAME_OVER' && opp.actor !== 0) {
      states.push(await window_(page, cdp, bcdp, 'opponent catch-up', MS));
    } else {
      await page.waitForFunction(() => document.documentElement.dataset.step === 'opp', undefined, { timeout: 20_000 }).catch(() => undefined);
      states.push(await window_(page, cdp, bcdp, 'opponent catch-up', MS));
    }

    // 6. The plate: finish the game and watch what is still running.
    if (!SKIP_PLATE) {
      const t0 = Date.now();
      while (Date.now() - t0 < 260_000) {
        await settle(page);
        const s = await page.evaluate(() => (window as any).__severgrow.state());
        if (!s || s.phase === 'GAME_OVER') break;
        await play(page);
        await page.waitForTimeout(40);
      }
      const end = await page.evaluate(() => (window as any).__severgrow.state());
      console.log(`\nplate reached: ${end?.phase} scores=${JSON.stringify(end?.result?.scores)}`);
      await page.waitForTimeout(3000);
      states.push(await window_(page, cdp, bcdp, 'win/lose plate', MS));
      // The plate must stop: after it has settled, everything it owns is finished or paused.
      await page.waitForTimeout(6000);
      const plate = await page.evaluate(() => {
        const el = document.getElementById('gameover');
        if (!el) return null;
        const all = el.getAnimations({ subtree: true });
        return {
          shown: !el.hidden && el.getClientRects().length > 0,
          total: all.length,
          running: all.filter((a) => a.playState === 'running').length,
          names: all.map((a) => (a as unknown as { animationName?: string }).animationName ?? '(script)'),
        };
      });
      console.log(`plate animations after settling: ${JSON.stringify(plate)}`);
      check('the finished duel plate runs no animation of its own', !!plate && plate.running === 0, `${plate?.running ?? '?'} running of ${plate?.total ?? '?'}`);
    }

    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    await context.close();
    await bcdp.detach();
  }
} finally {
  await browser.close();
  if (DIST) await new Promise<void>((r) => (served as { server: import('node:http').Server }).server.close(() => r()));
  else await new Promise<void>((r) => ((served as { server: { httpServer: import('node:http').Server } }).server.httpServer).close(() => r()));
}

// ---------- report ----------
const byLabel = new Map<string, State[]>();
for (const s of states) {
  const l = byLabel.get(s.label) ?? [];
  l.push(s);
  byLabel.set(s.label, l);
}
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
console.log(`\nPERF-DUEL-STATES  runs=${RUNS}  cpu=${CPU}x  viewport=390x844  seed=${SEED}  window=${MS} ms  ${DIST ? `dist=${DIST}` : 'dist=web/dist'}`);
console.log(`${'state'.padEnd(26)}${'task'.padStart(9)}${'recalc'.padStart(9)}${'rec/s'.padStart(8)}${'layout/s'.padStart(9)}${'mainfr/s'.padStart(9)}${'draw/s'.padStart(8)}${'raster'.padStart(8)}${'anims'.padStart(7)}${'inf'.padStart(5)}${'comp'.padStart(6)}${'paint'.padStart(7)}${'filt'.padStart(6)}${'bd'.padStart(4)}${'wc'.padStart(4)}${'tiles'.padStart(7)}`);
for (const [label, xs] of byLabel) {
  const f = (k: keyof State) => mean(xs.map((s) => Number(s[k]))).toFixed(1);
  console.log(label.padEnd(26) + f('taskMsPerS').padStart(9) + f('recalcMsPerS').padStart(9) + f('recalcPerS').padStart(8) + f('layoutPerS').padStart(9) + f('beginMainPerS').padStart(9) + f('drawPerS').padStart(8) + f('rasterMsPerS').padStart(8) + f('anims').padStart(7) + f('infinite').padStart(5) + f('compositor').padStart(6) + f('paint').padStart(7) + f('filter').padStart(6) + f('backdrop').padStart(4) + f('willChange').padStart(4) + f('branches').padStart(7));
}
console.log('\npaint-property animations per state:');
for (const [label, xs] of byLabel) {
  const names = new Set<string>();
  for (const s of xs) for (const n of s.paintNames) names.add(n);
  if (names.size) console.log(`  ${label}: ${[...names].join(', ')}`);
}
if (turns.length) {
  console.log(`\nturn: fps ${mean(turns.map((t) => t.fps)).toFixed(1)}   median ${mean(turns.map((t) => t.median)).toFixed(1)} ms   p95 ${mean(turns.map((t) => t.p95)).toFixed(1)} ms   worst ${mean(turns.map((t) => t.worst)).toFixed(1)} ms   over-33ms ${mean(turns.map((t) => t.over33)).toFixed(1)}`);
}
console.log('PERF_DUEL_STATES ' + JSON.stringify(states.map((s) => ({ label: s.label, step: s.step, task: +s.taskMsPerS.toFixed(1), recalc: +s.recalcMsPerS.toFixed(1), recalcN: +s.recalcPerS.toFixed(1), layoutN: +s.layoutPerS.toFixed(1), main: +s.beginMainPerS.toFixed(1), draw: +s.drawPerS.toFixed(1), anims: s.anims, paint: s.paint }))));

if (failed) {
  console.error(`\n${failed} perf-duel-states checks failed`);
  process.exit(1);
}
console.log('\nperf-duel-states checks passed');
process.exit(0);
