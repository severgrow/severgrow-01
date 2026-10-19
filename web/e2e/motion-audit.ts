// Motion audit: plays whole offline games against the computer (both sides chosen here, through
// the page's own test hook) and reports how long each animation step really took on screen, plus
// any stutter (a frame gap over 50 ms) while something was animating. Read-only: it never changes
// the game. Used to tune the animation pass and to keep it honest afterwards.
//
//   PW_CHROMIUM=/opt/pw-browsers/chromium-1194/chrome-linux/chrome npx tsx web/e2e/motion-audit.ts
import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';
import { preview } from 'vite';
import { legalActionsForState } from '../../src/engine/index.js';
import type { Action, State } from '../../src/engine/index.js';
import { CHROME } from './helpers/local-duel.js';

const PORT = 4245;
const GAMES = Number(process.env.GAMES ?? 3);
await new Promise<void>((resolve, reject) => {
  const child = spawn(process.execPath, ['./node_modules/vite/bin/vite.js', 'build', '--config', 'web/vite.config.ts', ...(process.env.PROFILE ? ['--minify', 'false'] : [])], {
    env: { ...process.env, CHANNEL: 'futa05', VITE_DUEL_API_URL: 'http://127.0.0.1:9', VITE_SUPABASE_URL: 'http://127.0.0.1:9', VITE_SUPABASE_ANON_KEY: 'k' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let err = '';
  child.stderr?.on('data', (b) => (err += String(b)));
  child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(err))));
});
const server = await preview({ configFile: 'web/vite.config.ts', preview: { host: '127.0.0.1', port: PORT, strictPort: true }, logLevel: 'error' });
const browser = await chromium.launch({ executablePath: CHROME });

// A varied player: Blast and Bomb when it can (so they show up), otherwise grow, else the first move.
const pick = (acts: Action[], n: number): Action => {
  const by = (t: string) => acts.filter((a) => a.t === t);
  if (by('MegaBomb').length && n % 2 === 0) return by('MegaBomb')[0]!;
  if (by('PlayFruit').length && n % 2 === 0) return by('PlayFruit')[0]!;
  const bloom = by('Bloom').sort((a, b) => (b as { hexes: unknown[] }).hexes.length - (a as { hexes: unknown[] }).hexes.length);
  if (bloom.length) return bloom[0]!;
  if (by('Sprout').length) return by('Sprout')[n % by('Sprout').length]!;
  if (by('Draw').length) return by('Draw')[n % by('Draw').length]!;
  return acts.find((a) => a.t === 'Discard') ?? acts[0]!;
};

type Mark = { t: number; ev: string; k?: string; ms?: number; n?: number; who?: number };
const all: Mark[] = [];
const gaps: number[] = [];
const gapDetail: string[] = [];
const longs: string[] = [];
type Feel = {
  pressLatency: { count: number; median: number | null; max: number | null };
  frameGaps: { count: number; median: number | null; max: number | null };
  longTasks: { count: number; total: number; max: number };
  liveAnimations: number;
  rafSubscribers: number;
  hidden: { elements: number; animations: number };
  idle: { animations: number; elements: number };
};
const feels: Feel[] = [];
try {
  for (let g = 0; g < GAMES; g++) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    await page.goto(`http://127.0.0.1:${PORT}/?seed=${4242 + g * 7}`);
    await page.waitForSelector('#game:not([hidden])', { timeout: 30_000 });
    await page.waitForSelector('#starter-lottery', { state: 'hidden', timeout: 20_000 }).catch(() => undefined);
    // Frame gaps while the board is busy animating.
    await page.evaluate(`(() => { window.__gaps = []; let last = performance.now(); const tick = (t) => { if (window.__severgrow.busy() && t - last > 50) window.__gaps.push({ at: Math.round(last), ms: Math.round(t - last) }); last = t; requestAnimationFrame(tick); }; requestAnimationFrame(tick); window.__long = []; try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__long.push({ at: Math.round(e.startTime), ms: Math.round(e.duration), busy: window.__severgrow.busy() }); }).observe({ type: 'longtask', buffered: true }); } catch {} })()`);
    const cdp = process.env.PROFILE ? await page.context().newCDPSession(page) : null;
    if (cdp) {
      await cdp.send('Profiler.enable');
      await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
      await cdp.send('Profiler.start');
    }
    let n = 0;
    for (let i = 0; i < 400; i++) {
      const st = (await page.evaluate('window.__severgrow.state()')) as State | null;
      if (!st || st.phase === 'GAME_OVER') break;
      const busy = (await page.evaluate('window.__severgrow.busy()')) as boolean;
      if (busy || st.actor !== 0) {
        await page.waitForTimeout(60);
        continue;
      }
      const acts = legalActionsForState(st);
      if (!acts.length) break;
      await page.evaluate(([a]) => (window as unknown as { __severgrow: { playFor: (a: unknown, w: number) => boolean } }).__severgrow.playFor(a, 0), [pick(acts, n++)] as const);
      await page.waitForTimeout(30);
    }
    await page.waitForFunction('!window.__severgrow.busy()', undefined, { timeout: 20_000 }).catch(() => undefined);
    if (cdp) {
      const { profile } = (await cdp.send('Profiler.stop')) as { profile: { nodes: { id: number; callFrame: { functionName: string; url: string; lineNumber: number }; hitCount?: number; children?: number[] }[]; samples: number[]; timeDeltas: number[] } };
      const self = new Map<number, number>();
      profile.samples.forEach((id, i) => self.set(id, (self.get(id) ?? 0) + (profile.timeDeltas[i] ?? 0)));
      const byName = new Map<string, number>();
      // inclusive time: walk parents
      const parent = new Map<number, number>();
      for (const nd of profile.nodes) for (const c of nd.children ?? []) parent.set(c, nd.id);
      const node = new Map(profile.nodes.map((nd) => [nd.id, nd]));
      for (const [id, us] of self) {
        const seen = new Set<string>();
        for (let cur: number | undefined = id; cur !== undefined; cur = parent.get(cur)) {
          const cf = node.get(cur)!.callFrame;
          const name = `${cf.functionName || '(anon)'} ${cf.url.split('/').pop()}:${cf.lineNumber}`;
          if (seen.has(name)) continue;
          seen.add(name);
          byName.set(name, (byName.get(name) ?? 0) + us);
        }
      }
      console.log('top inclusive CPU (ms):');
      for (const [k, us] of [...byName].sort((a, b) => b[1] - a[1]).slice(0, 45)) console.log(`${String(Math.round(us / 1000)).padStart(7)}  ${k}`);
    }
    all.push(...((await page.evaluate('window.__severgrow.animLog()')) as Mark[]).filter((m) => m.ev === 'step'));
    const marks = (await page.evaluate('window.__severgrow.animLog()')) as Mark[];
    for (const lt of (await page.evaluate('window.__long')) as { at: number; ms: number; busy: boolean }[]) {
      const during = marks.find((m) => m.ev === 'step' && m.t >= lt.at && m.t - (m.ms ?? 0) <= lt.at + lt.ms);
      longs.push(`${lt.ms}ms long task ${lt.busy ? 'while animating' : 'idle'}${during ? ` during ${during.k}(${during.n}) who=${during.who}` : ''}`);
    }
    for (const gp of (await page.evaluate('window.__gaps')) as { at: number; ms: number }[]) {
      gaps.push(gp.ms);
      // which step was on screen when the frame stalled (the step's mark is logged at its END)
      const during = marks.find((m) => m.ev === 'step' && m.t >= gp.at && m.t - (m.ms ?? 0) <= gp.at + gp.ms);
      gapDetail.push(`${gp.ms}ms during ${during ? `${during.k}(${during.n}) who=${during.who}` : 'no step (between steps)'}`);
    }
    feels.push((await page.evaluate('window.__severgrow.feel()')) as Feel);
    await page.close();
  }
} finally {
  await browser.close();
  await server.close();
}
const groups = new Map<string, number[]>();
for (const m of all) {
  const key = `${m.k}${m.k === 'grow' || m.k === 'sever' || m.k === 'megaBomb' ? `(${(m.n ?? 0) > 3 ? '4+' : m.n})` : ''} ${m.who === 0 ? 'you' : m.who === 1 ? 'opp' : ''}`.trim();
  groups.set(key, [...(groups.get(key) ?? []), m.ms ?? 0]);
}
const q = (xs: number[], p: number) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(p * xs.length))]!;
console.log('step                      count   median   p90    max   (ms on screen)');
for (const [k, xs] of [...groups].sort()) console.log(`${k.padEnd(25)} ${String(xs.length).padStart(5)} ${String(q(xs, 0.5)).padStart(8)} ${String(q(xs, 0.9)).padStart(6)} ${String(Math.max(...xs)).padStart(6)}`);
if (process.env.DETAIL) console.log(gapDetail.join('\n'));
console.log(`long tasks (>50ms of blocked main thread): ${longs.length}`);
if (process.env.DETAIL) console.log(longs.join('\n'));
console.log(`\nframe gaps >50ms while animating: ${gaps.length}${gaps.length ? `  (worst ${Math.max(...gaps)}ms, median ${q(gaps, 0.5)}ms)` : ''}`);
if (feels.length) {
  const press = feels.reduce((n, f) => n + f.pressLatency.count, 0);
  const pressMax = Math.max(...feels.map((f) => f.pressLatency.max ?? 0));
  const schedulerGaps = feels.reduce((n, f) => n + f.frameGaps.count, 0);
  const longTotal = feels.reduce((n, f) => n + f.longTasks.total, 0);
  const subs = Math.max(...feels.map((f) => f.rafSubscribers));
  const live = Math.max(...feels.map((f) => f.liveAnimations));
  const hidden = feels.reduce((n, f) => n + f.hidden.elements, 0);
  const idle = Math.max(...feels.map((f) => f.idle.animations));
  console.log(`feel: ${press} presses (worst ${pressMax}ms) · scheduler gaps ${schedulerGaps} · long tasks ${longTotal}ms · max RAF subscribers ${subs} · live animations ${live} · hidden elements ${hidden} · idle animations ${idle}`);
}
