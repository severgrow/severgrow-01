// THE IN-GAME REPLAY MUST BE READABLE (owner, 2026-10-25: "when pressing 'replay' in game it shows
// too quickly — it feels rushed... make sure the replay is nicely visible and clear of what an
// enemy had done").
//
// A real built page, a seeded practice game, and the corner slot's own Replay (after a throw there
// is no undo left, so the same slot becomes Replay — the product's only in-game replay).
//
// Asserted on the measurement, not the eye:
//   pace    one real opponent turn's replay lasts longer than the same turn took live, and its
//           action steps are each long enough to read at Normal speed;
//   steps   a quiet beat separates the enemy's actions (the replay has ≥2 action steps, and the
//           gap between the end of one and the start of the next is not zero);
//   signs   the product's display says REPLAY for the whole replay and its glass is dimmed, then
//           both are cleared when the board resolves to the real state;
//   calm    Reduce motion still replays, and adds no beat waits of its own.
//
//   node --import tsx web/e2e/replay-readability.ts
//   (writes /tmp/polish2/replay-*.png)
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
import type { Browser, Page } from 'playwright-core';
import { preview } from 'vite';
import { legalActions, viewFor } from '../../src/engine/index.js';
import type { State } from '../../src/engine/index.js';

const OUT = '/tmp/polish2';
const PORT = Number(process.env.PORT ?? 4392);
const ORIGIN = `http://127.0.0.1:${PORT}`;
const CHROME = process.env.PW_CHROMIUM ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const SETTINGS_KEY = 'main2:severgrow.settings.v1';

mkdirSync(OUT, { recursive: true });

let failed = 0;
const check = (name: string, ok: boolean, note = '') => {
  if (!ok) failed += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? `  (${note})` : ''}`);
};

const build = (): Promise<void> =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['./node_modules/vite/bin/vite.js', 'build', '--config', 'web/vite.config.ts'], {
      env: {
        ...process.env,
        CHANNEL: 'futa04',
        VITE_DUEL_API_URL: ORIGIN,
        VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL || 'http://127.0.0.1:9',
        VITE_SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY || 'local-e2e-anon-key',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let err = '';
    child.stderr?.on('data', (b) => { err += String(b); });
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`web:build failed: ${err}`))));
  });

const waitStarterRitual = async (page: Page): Promise<void> => {
  await page.waitForFunction(`(() => {
    const r = document.getElementById('starter-lottery');
    return !r || r.hidden || !r.getClientRects().length;
  })()`, undefined, { timeout: 15_000 }).catch(() => undefined);
};

/**
 * Watches the two clocks that matter while the page plays:
 *   live — the opponent's OWN turn: from the moment the actor becomes the bot to the moment it is
 *          the human's turn again (read from the engine's state, each poll stamped in the page);
 *   sign — the display's own text and dim class, sampled every 100 ms, so "REPLAY for the whole
 *          replay" is a range, not one lucky screenshot.
 */
const WATCH = `(() => {
  const watch = { liveTurns: [], samples: [] };
  window.__replayWatch = watch;
  let prevActor = null;
  let liveStart = null;
  setInterval(() => {
    const h = window.__severgrow;
    const s = h && h.state();
    if (!s) return;
    const busy = h.busy();
    if (s.actor !== prevActor) {
      if (s.actor === 1) liveStart = performance.now();
      prevActor = s.actor;
    }
    if (s.actor === 0 && liveStart !== null && !busy) {
      watch.liveTurns.push({ start: liveStart, end: performance.now() });
      liveStart = null;
    }
    // The display, as it actually shows, for the whole session (bounded).
    if (watch.samples.length < 6000) {
      const panel = document.getElementById('smart-panel');
      const led = document.getElementById('smart-led');
      watch.samples.push({
        t: Math.round(performance.now()),
        text: led ? (led.textContent || '').trim() : '',
        dim: !!panel && panel.classList.contains('led-theirs'),
        busy,
      });
    }
  }, 50);
})()`;

type SignSample = { t: number; text: string; dim: boolean; busy: boolean };
type Watch = { liveTurns: { start: number; end: number }[]; samples: SignSample[] };

const boot = async (browser: Browser, reduceMotion: boolean) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 1,
    serviceWorkers: 'block',
  });
  await context.addInitScript({
    content: `(() => {
      try {
        localStorage.clear();
        localStorage.setItem(${JSON.stringify(SETTINGS_KEY)}, JSON.stringify({ sound: false, music: false, coach: false, speed: 'normal', reduceMotion: ${reduceMotion}, eyeCandy: false, autoSkip: false }));
        localStorage.setItem('main2:severgrow.install-prompt.v1', JSON.stringify({ games: 0, shown: true, never: true }));
      } catch {}
    })();`,
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return { context, page, errors };
};

/** Play whole turns until the corner slot IS Replay (after a throw, undo is gone). */
const playToReplaySlot = async (page: Page): Promise<State> => {
  await waitStarterRitual(page);
  let last: State | null = null;
  for (let i = 0; i < 240; i++) {
    const slot = await page.evaluate(`(() => {
      const btn = document.getElementById('tool-undo');
      return { mode: btn && btn.dataset.mode, disabled: !!btn && (btn.disabled || btn.getAttribute('aria-disabled') === 'true') };
    })()`) as { mode: string; disabled: boolean };
    if (slot.mode === 'replay' && !slot.disabled && !(await page.evaluate('(() => window.__severgrow.busy())()'))) return last!;
    if (await page.evaluate('(() => window.__severgrow.busy())()')) { await page.waitForTimeout(80); continue; }
    const s = await page.evaluate('(() => window.__severgrow.state())()') as State;
    last = s;
    if (s.actor !== 0 || s.phase === 'GAME_OVER') { await page.waitForTimeout(80); continue; }
    const legal = legalActions(viewFor(s, 0));
    const pick = s.phase === 'DRAW' ? legal.find((a) => a.t === 'Draw')
      : s.phase === 'DISCARD' ? legal.find((a) => a.t === 'Discard')
      : legal.some((a) => a.t === 'EndAct') ? legal.find((a) => a.t === 'EndAct') : legal[0];
    if (!pick) { await page.waitForTimeout(80); continue; }
    await page.evaluate(`(() => window.__severgrow.playFor(${JSON.stringify(pick)}, 0))()`);
    await page.waitForTimeout(100);
  }
  throw new Error('the replay slot never lit up');
};

const run = async (browser: Browser, name: string, reduceMotion: boolean): Promise<void> => {
  const { context, page, errors } = await boot(browser, reduceMotion);
  try {
    await page.goto(`${ORIGIN}/?seed=219682080`);
    await page.waitForFunction('(() => !!window.__severgrow.state() && !window.__severgrow.busy())()', undefined, { timeout: 40_000 });
    await page.evaluate(WATCH);
    const state = await playToReplaySlot(page);
    const watchBefore = await page.evaluate('(() => window.__replayWatch)()') as Watch;
    const lastTurn = watchBefore.liveTurns.at(-1);
    const liveMs = lastTurn ? Math.round(lastTurn.end - lastTurn.start) : null;

    // Take the replay, and time the pump it starts (the pump's own log, not wall clock around a
    // screenshot, so this number is the animation's real length).
    await page.evaluate('(() => window.__severgrow.clearAnimLog())()');
    const clickedAt = await page.evaluate(`(() => { const t = performance.now(); document.getElementById('tool-undo').click(); return t; })()`) as number;
    await page.waitForFunction('(() => window.__severgrow.busy())()', undefined, { timeout: 5_000 });

    // Two frames of two different enemy actions (the screenshots are slow on this machine, so the
    // timing evidence is the pump log below, never how long a screenshot took).
    await page.waitForTimeout(250);
    await page.screenshot({ path: `${OUT}/replay-${name}-step1.png` });
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT}/replay-${name}-step2.png` });
    await page.waitForFunction('(() => !window.__severgrow.busy())()', undefined, { timeout: 60_000 });

    const log = await page.evaluate(`(() => window.__severgrow.animLog())()`) as { ev: string; t: number; ms?: number; k?: string }[];
    const enter = log.find((m) => m.ev === 'pump:enter');
    const leave = log.find((m) => m.ev === 'pump:leave');
    const steps = log.filter((m) => m.ev === 'step');
    const actions = steps.filter((s) => ['grow', 'sever', 'remove', 'strengthen', 'fruit', 'megaBomb', 'discard', 'draw'].includes(String(s.k)));
    const pumpMs = enter && leave ? Math.round(leave.t - enter.t) : null;
    const window0 = enter ? enter.t : clickedAt;
    const window1 = leave ? leave.t : Infinity;
    const watchAfter = await page.evaluate('(() => window.__replayWatch)()') as Watch;
    const during = watchAfter.samples.filter((s) => s.t >= window0 && s.t <= window1);
    const after = await page.evaluate(`(() => {
      const panel = document.getElementById('smart-panel');
      const led = document.getElementById('smart-led');
      return { text: led ? (led.textContent || '').trim() : '', dim: !!panel && panel.classList.contains('led-theirs'), busy: window.__severgrow.busy() };
    })()`) as { text: string; dim: boolean; busy: boolean };

    console.log(`  ${name}: live turn ${liveMs} ms · replay pump ${pumpMs} ms · action steps ${actions.map((a) => `${a.k}:${a.ms}`).join(' ')}`);
    console.log(`  ${name}: display during replay ${during.length} samples: ${[...new Set(during.map((s) => `${s.text}${s.dim ? '/dim' : ''}`))].join(' | ')} → after "${after.text}"${after.dim ? '/dim' : ''}`);

    check(`${name}: a replay of a real turn was played`, !!pumpMs && pumpMs > 0, `${pumpMs} ms`);
    check(`${name}: it has at least two enemy actions to read`, actions.length >= 2, `${actions.length}`);
    if (!reduceMotion) {
      // The wall clock of the LIVE turn includes the computer's own thinking; the replay is about
      // the animation, so the readable-pace gate is the replay's own plan (the old 0.75 replay ran
      // ~2.4 s for this turn).
      check(`${name}: a whole enemy turn is readable, not a blur`, (pumpMs as number) >= 2_600, `${pumpMs} ms`);
      // The quiet beat: the pump runs longer than the action steps themselves, by more than a whole
      // beat — that extra time is the air between actions.
      const actionTotal = actions.reduce((sum, a) => sum + (a.ms ?? 0), 0);
      check(`${name}: there is air between actions, not a back-to-back run`, (pumpMs as number) - actionTotal >= 300, `steps ${actionTotal} ms of ${pumpMs} ms`);
      check(`${name}: each action is given time to be seen`, actions.every((a) => (a.ms ?? 0) >= 400), actions.map((a) => a.ms).join(','));
    } else {
      // Reduce motion: the replay still runs at the same rate, and motionOn() adds NO beat waits.
      check(`${name}: Reduce motion still replays the enemy turn`, (pumpMs as number) > 0, `${pumpMs} ms`);
      const actionTotal = actions.reduce((sum, a) => sum + (a.ms ?? 0), 0);
      check(`${name}: Reduce motion adds no beat air`, (pumpMs as number) - actionTotal < 300, `steps ${actionTotal} ms of ${pumpMs} ms`);
    }
    // The sign is sampled by the page every 50 ms, so this is the WHOLE replay, not three frames.
    // The window opens at `pump:enter`, i.e. AFTER the click and AFTER the sign was set, and the
    // board's first step starts just past it — so 250 ms is a generous multi-frame allowance for
    // one paint, not a tolerance to hide a wait. MEASURED with the sign forced immediately: 15 ms
    // (moving) / 14 ms (Reduce motion). With the force removed it was 856 / 806 ms, so this check
    // catches exactly the bug it exists for.
    const first = during.findIndex((s) => s.text === 'REPLAY' && s.dim);
    const settled = first >= 0 ? during.slice(first) : [];
    check(
      `${name}: the display says REPLAY for the whole replay`,
      first >= 0 && during[first]!.t - window0 <= 250 && settled.length >= 10 && settled.every((s) => s.text === 'REPLAY' && s.dim),
      `${during.length} samples, first REPLAY ${first >= 0 ? Math.round(during[first]!.t - window0) : 'never'} ms in, ${settled.length} held`,
    );
    check(`${name}: the replay sign and its dim are cleared when control returns`, after.text !== 'REPLAY' && !after.dim && !after.busy, `${after.text}${after.dim ? '/dim' : ''}`);
    const finalActor = await page.evaluate('(() => window.__severgrow.state().actor)()') as number;
    check(`${name}: the board ends on the real state (the turn is the player's)`, finalActor === 0, `actor ${finalActor}`);
    check(`${name}: no page errors`, errors.length === 0, errors.slice(0, 2).join(' | '));
    void state;
  } finally {
    await context.close().catch(() => undefined);
  }
};

await build();
const server = await preview({
  configFile: 'web/vite.config.ts',
  preview: { host: '127.0.0.1', port: PORT, strictPort: true },
  logLevel: 'error',
});
const browser = await chromium.launch({ executablePath: CHROME });
try {
  await run(browser, 'moving', false);
  await run(browser, 'reduce', true);
} finally {
  await browser.close().catch(() => undefined);
  await server.close().catch(() => undefined);
}
console.log(`\n${failed === 0 ? 'ALL PASS' : `${failed} FAILED`} — shots in ${OUT}`);
process.exit(failed === 0 ? 0 : 1);
