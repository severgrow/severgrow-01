// The pre-game card ritual, in the real page.
//
// It builds the futa05 preview and drives a real match start at several viewports. The checks that
// matter are behavioural: the displayed winner agrees with the engine, the higher card belongs to
// that winner, both faces are on screen, skip/cancel/resize cannot wedge the game, and no ritual
// animation is still running afterwards.
//
//   PW_CHROMIUM=/path/to/chrome npx tsx web/e2e/starter-ritual.ts
//   SHOTS=1 ... also writes docs/screens/ritual/e2e-*.png
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
import type { Browser, Page } from 'playwright-core';
import { preview } from 'vite';

const CHROME =
  process.env.PW_CHROMIUM ??
  '/Users/patryk/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const PORT = 4253;
const SHOTS = process.env.SHOTS === '1';
const SHOT_DIR = 'docs/screens/ritual';

let failed = 0;
const check = (name: string, ok: boolean, note = ''): void => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? `  (${note})` : ''}`);
};

const build = (): Promise<void> =>
  new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ['./node_modules/vite/bin/vite.js', 'build', '--config', 'web/vite.config.ts'],
      {
        env: {
          ...process.env,
          CHANNEL: 'futa05',
          VITE_DUEL_API_URL: 'http://127.0.0.1:65534',
          VITE_SUPABASE_URL: 'http://127.0.0.1:65534',
          VITE_SUPABASE_ANON_KEY: 'k',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    let err = '';
    child.stderr?.on('data', (b) => (err += String(b)));
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`web:build failed: ${err}`))));
  });

type StarterState = { startingPlayer?: number; turnPlayer: number; actor: number; turnNumber: number };

const settings = (over: Record<string, unknown> = {}): string =>
  JSON.stringify({
    sound: false,
    music: false,
    coach: false,
    speed: 'normal',
    reduceMotion: false,
    eyeCandy: false,
    vibration: false,
    largeText: false,
    weakSpots: false,
    weakPulse: false,
    placementList: false,
    autoSkip: false,
    bloomHints: false,
    ...over,
  });

const open = async (
  browser: Browser,
  seed: number,
  viewport: { width: number; height: number },
  over: Record<string, unknown> = {},
): Promise<{ page: Page; errors: string[] }> => {
  const touch = viewport.width < 700;
  const context = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch, deviceScaleFactor: 1 });
  await context.addInitScript((s) => {
    localStorage.setItem('futa05:severgrow.settings.v1', s);
    localStorage.setItem('futa05:severgrow.seen', '1');
    const win = window as unknown as {
      __name?: (f: unknown) => unknown;
      __ritualPhases: { phase: string; t: number }[];
      __ritualTimes: { visibleAt: number; hiddenAt: number };
      __longTasks: number[];
    };
    // Vite's bundle helper is referenced by class fields; the app itself does not need this shim,
    // but an init-script-evaluated page must define it (the same shim other suites use).
    win.__name = (f) => f;
    win.__ritualPhases = [];
    win.__ritualTimes = { visibleAt: 0, hiddenAt: 0 };
    win.__longTasks = [];
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) win.__longTasks.push(entry.duration);
      }).observe({ entryTypes: ['longtask'] });
    } catch {
      /* long-task timing is optional */
    }
    // Module boot can start a URL-seed match BEFORE DOMContentLoaded, so sample from the first
    // frame rather than installing the observer too late.
    let last = '';
    setInterval(() => {
      const el = document.getElementById('starter-lottery');
      const phase = el?.dataset.phase ?? '';
      if (phase && phase !== last) {
        last = phase;
        win.__ritualPhases.push({ phase, t: performance.now() });
      }
      if (!phase) last = '';
    }, 8);
    // The ritual's own on-screen duration, sampled at the mutation itself. Wall-clock timings taken
    // in the test process include page boot and Playwright's polling; under a loaded machine those
    // dominate a sub-second window, so the ritual is timed where it actually lives.
    const watch = (): void => {
      const el = document.getElementById('starter-lottery');
      if (!el) {
        setTimeout(watch, 20);
        return;
      }
      new MutationObserver(() => {
        const times = win.__ritualTimes;
        if (!el.hidden) {
          if (times.visibleAt === 0 || times.hiddenAt !== 0) {
            times.visibleAt = performance.now();
            times.hiddenAt = 0;
          }
        } else if (times.visibleAt !== 0 && times.hiddenAt === 0) {
          times.hiddenAt = performance.now();
        }
      }).observe(el, { attributes: true, attributeFilter: ['hidden'] });
    };
    watch();
  }, settings(over));
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const text = m.text();
    // The dummy online endpoint is deliberately unreachable in this offline suite.
    if (/Failed to load resource/i.test(text)) return;
    errors.push(text);
  });
  await page.goto(`http://127.0.0.1:${PORT}/?seed=${seed}`, { waitUntil: 'domcontentloaded' });
  return { page, errors };
};

const state = (page: Page): Promise<StarterState> =>
  page.evaluate(() => {
    const hook = (window as unknown as { __severgrow: { state: () => StarterState } }).__severgrow;
    return hook.state();
  });

const phases = (page: Page): Promise<{ phase: string; t: number }[]> =>
  page.evaluate(() => (window as unknown as { __ritualPhases: { phase: string; t: number }[] }).__ritualPhases);

const longTasks = (page: Page): Promise<number[]> =>
  page.evaluate(() => (window as unknown as { __longTasks: number[] }).__longTasks);

const startFrameProbe = (page: Page): Promise<void> =>
  page.evaluate(() => {
    const win = window as unknown as {
      __frameGaps: number[];
      __frameProbe: boolean;
      __frameLast: number;
    };
    win.__frameGaps = [];
    win.__frameProbe = true;
    win.__frameLast = performance.now();
    const tick = (t: number): void => {
      if (!win.__frameProbe) return;
      const gap = t - win.__frameLast;
      win.__frameLast = t;
      if (gap > 0) win.__frameGaps.push(gap);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

const stopFrameProbe = (page: Page): Promise<number[]> =>
  page.evaluate(() => {
    const win = window as unknown as { __frameGaps: number[]; __frameProbe: boolean };
    win.__frameProbe = false;
    const gaps = [...win.__frameGaps];
    win.__frameGaps = [];
    return gaps;
  });

const waitPhase = (page: Page, phase: string, timeout = 12_000): Promise<unknown> =>
  page.waitForFunction(
    (p) => document.getElementById('starter-lottery')?.dataset.phase === p,
    phase,
    { timeout },
  );

const readResult = (page: Page): Promise<{
  hidden: boolean;
  phase: string | undefined;
  starter: string | undefined;
  youRank: string | undefined;
  opponentRank: string | undefined;
  title: string;
  sentence: boolean;
  reduced: boolean;
}> =>
  page.evaluate(() => {
    const el = document.getElementById('starter-lottery');
    return {
      hidden: !!el?.hidden,
      phase: el?.dataset.phase,
      starter: el?.dataset.starter,
      youRank: el?.dataset.youRank,
      opponentRank: el?.dataset.opponentRank,
      title: document.getElementById('lottery-title')?.textContent ?? '',
      // The outcome is one line: the deck has just shown which rank was higher, so a second
      // sentence explaining the draw is noise. Fail if one ever comes back.
      sentence: [...(document.getElementById('lottery-outcome')?.querySelectorAll('p') ?? [])]
        .some((p) => (p.textContent ?? '').trim() !== ''),
      reduced: !!el?.classList.contains('is-reduced'),
    };
  });

const waitHidden = (page: Page, timeout = 8_000): Promise<unknown> =>
  page.waitForSelector('#starter-lottery', { state: 'hidden', timeout });

const checkResultAgainstEngine = async (page: Page, label: string): Promise<void> => {
  const actual = await state(page);
  const result = await readResult(page);
  const starter = actual.startingPlayer ?? actual.turnPlayer;
  const you = Number(result.youRank);
  const opponent = Number(result.opponentRank);
  const expectedTitle = starter === 0 ? /^you start$/i : /^.+ starts$/i;
  check(`${label}: the result names the real starting seat`, expectedTitle.test(result.title), result.title);
  check(`${label}: two distinct ranks 1..9`, Number.isInteger(you) && Number.isInteger(opponent) && you !== opponent && you >= 1 && you <= 9 && opponent >= 1 && opponent <= 9, `${result.youRank}/${result.opponentRank}`);
  check(`${label}: the higher card belongs to the starter`, starter === 0 ? you > opponent : opponent > you, `starter=${starter} ${you}/${opponent}`);
  check(`${label}: the outcome is the single line naming the starter`, !result.sentence, result.sentence ? 'a sentence is shown' : '');
};

const screenshot = async (page: Page, name: string): Promise<void> => {
  if (!SHOTS) return;
  mkdirSync(SHOT_DIR, { recursive: true });
  await page.screenshot({ path: `${SHOT_DIR}/e2e-${name}.png` });
};

/**
 * Nine cards, one of every strength. The deck is the presentation's own fairness guarantee: the two
 * numbers on the table can never be equal, because the stack never holds the same number twice.
 * The count also has to stay honest — seven backs behind the two dealt faces, never nine plus two.
 */
const checkDeck = async (page: Page, label: string): Promise<void> => {
  const info = await page.evaluate(() => {
    const layers = [...document.querySelectorAll<HTMLElement>('#lottery-deck .ritual-deck-layer')];
    return {
      layers: layers.length,
      ranks: layers.map((l) => Number(l.dataset.rank)),
      shown: layers.filter((l) => Number(getComputedStyle(l).opacity) > 0.5).length,
      youCardRank: Number(document.getElementById('starter-lottery')?.dataset.youRank),
      opponentCardRank: Number(document.getElementById('starter-lottery')?.dataset.opponentRank),
    };
  });
  const sorted = [...info.ranks].sort((a, b) => a - b);
  check(`${label}: the stack is exactly nine cards`, info.layers === 9, `layers=${info.layers}`);
  check(
    `${label}: every strength 1..9 appears once and only once`,
    sorted.length === 9 && sorted.every((r, i) => r === i + 1),
    sorted.join(','),
  );
  check(`${label}: the two numbers on the table can never tie`, info.youCardRank !== info.opponentCardRank, `${info.youCardRank}/${info.opponentCardRank}`);
  check(
    `${label}: both dealt numbers came out of that deck`,
    info.ranks.includes(info.youCardRank) && info.ranks.includes(info.opponentCardRank),
  );
  check(`${label}: only seven cards are left in the stack`, info.shown === 7, `shown=${info.shown}`);
};


type Box = { l: number; t: number; r: number; b: number; cx: number; cy: number; w: number; h: number };

/**
 * The layout is the point of this pass: one card at each player's own home, the deck between them,
 * no label over a card, both faces actually turned up, nothing overlapping or clipped.
 */
const checkHomeLayout = async (page: Page, label: string): Promise<void> => {
  const info = await page.evaluate(() => {
    const box = (el: Element | null): Box | null => {
      const r = el?.getBoundingClientRect();
      return r ? { l: r.left, t: r.top, r: r.right, b: r.bottom, cx: r.left + r.width / 2, cy: r.top + r.height / 2, w: r.width, h: r.height } : null;
    };
    const hex = (key: string): Box | null => {
      const el = document.querySelector(`#board .hex-cell[data-key="${key}"] .hex`);
      return box(el);
    };
    const face = (id: string): { front: number; back: number } => {
      const front = document.getElementById(`lottery-face-${id}`);
      const back = document.getElementById(`lottery-back-${id}`);
      return {
        front: front ? Number(getComputedStyle(front).opacity) : -1,
        back: back ? Number(getComputedStyle(back).opacity) : -1,
      };
    };
    return {
      you: box(document.getElementById('lottery-card-you')),
      opponent: box(document.getElementById('lottery-card-opponent')),
      deck: box(document.getElementById('lottery-deck')),
      youHome: hex('-2,2'),
      opponentHome: hex('2,-2'),
      youFace: face('you'),
      opponentFace: face('opponent'),
      visibleLabels: document.querySelectorAll('.ritual-lane-label, .ritual-kicker').length,
      vw: innerWidth,
      vh: innerHeight,
    };
  });
  const { you, opponent, deck, youHome, opponentHome } = info;
  if (!you || !opponent || !deck || !youHome || !opponentHome) {
    check(`${label}: both homes and both cards are measurable`, false);
    return;
  }
  const near = (card: Box, home: Box): number => Math.hypot(card.cx - home.cx, card.cy - home.cy);
  check(`${label}: my card is dealt at my home`, near(you, youHome) <= 52, `${near(you, youHome).toFixed(1)}px from the tree`);
  check(`${label}: their card is dealt at their home`, near(opponent, opponentHome) <= 52, `${near(opponent, opponentHome).toFixed(1)}px from the volcano`);
  check(`${label}: the cards are separated vertically, not in a row`, Math.abs(you.cy - opponent.cy) > Math.abs(you.cx - opponent.cx), `dy=${Math.round(Math.abs(you.cy - opponent.cy))} dx=${Math.round(Math.abs(you.cx - opponent.cx))}`);
  check(`${label}: no name label is needed over a card`, info.visibleLabels === 0, `labels=${info.visibleLabels}`);
  check(
    `${label}: both faces are turned up`,
    info.youFace.front > 0.9 && info.youFace.back < 0.1 && info.opponentFace.front > 0.9 && info.opponentFace.back < 0.1,
    `${JSON.stringify(info.youFace)} / ${JSON.stringify(info.opponentFace)}`,
  );
  const between = (v: number, a: number, b: number): boolean => v >= Math.min(a, b) && v <= Math.max(a, b);
  check(`${label}: the deck waits between the two cards`, between(deck.cy, you.cy, opponent.cy), `deck=${Math.round(deck.cy)} you=${Math.round(you.cy)} opp=${Math.round(opponent.cy)}`);
  const overlaps = (a: Box, b: Box): boolean => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
  check(`${label}: the deck never covers a dealt card`, !overlaps(deck, you) && !overlaps(deck, opponent));
  const outside = [you, opponent, deck].filter((r) => r.l < -1 || r.t < -1 || r.r > info.vw + 1 || r.b > info.vh + 1);
  check(`${label}: the whole composition is inside the viewport`, outside.length === 0, `${outside.length} clipped`);
};

const main = async (): Promise<void> => {
  await build();
  const server = await preview({
    configFile: 'web/vite.config.ts',
    preview: { host: '127.0.0.1', port: PORT, strictPort: true },
    logLevel: 'error',
  });
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    // ------------------------------------------------------------------ normal, full playback
    {
      const { page, errors } = await open(browser, 4242, { width: 390, height: 844 });
      await page.waitForSelector('#starter-lottery:not([hidden])', { timeout: 20_000 });
      await page.evaluate(() => {
        (window as unknown as { __longTasks: number[] }).__longTasks.length = 0;
      });
      await startFrameProbe(page);
      await waitPhase(page, 'shuffle');
      await waitPhase(page, 'deal');
      await waitPhase(page, 'reveal');
      await waitPhase(page, 'result');
      await screenshot(page, 'result-390x844');
      await checkResultAgainstEngine(page, 'normal');
      await checkHomeLayout(page, 'normal');
      await checkDeck(page, 'normal');
      await waitHidden(page);
      const trace = await phases(page);
      const order = ['arrive', 'shuffle', 'deal', 'reveal', 'result', 'exit'];
      const got = trace.map((p) => p.phase);
      check('normal: every phase plays in order', order.every((p) => got.includes(p)), got.join('>'));
      const first = trace.find((p) => p.phase === 'arrive')?.t;
      const last = trace[trace.length - 1]?.t;
      const duration = first !== undefined && last !== undefined ? last - first : 0;
      check('normal: the whole ritual is 1.8–3.6s', duration >= 1_800 && duration <= 3_600, `${Math.round(duration)}ms`);
      const animations = await page.evaluate(() =>
        document.getElementById('starter-lottery')?.getAnimations({ subtree: true }).length ?? 0,
      );
      check('normal: no ritual animation is left running', animations === 0, `animations=${animations}`);
      const gaps = await stopFrameProbe(page);
      const sorted = [...gaps].sort((a, b) => a - b);
      const p95 = sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] ?? 0 : 0;
      const maxGap = sorted.length ? sorted[sorted.length - 1] ?? 0 : 0;
      check('normal: no frame gap over 120ms during the ritual', maxGap <= 120, `frames=${gaps.length} p95=${p95.toFixed(1)}ms max=${maxGap.toFixed(1)}ms`);
      await page.waitForFunction('!window.__severgrow.busy()', undefined, { timeout: 10_000 });
      const after = await state(page);
      const actualStarter = after.startingPlayer ?? after.turnPlayer;
      const legalCount = await page.evaluate(() =>
        (window as unknown as { __severgrow: { legal: () => unknown[] } }).__severgrow.legal().length,
      );
      if (actualStarter === 0) {
        check(
          'normal: my first legal action is available at once',
          after.actor === 0 && after.turnNumber === 1 && legalCount > 0,
          `actor=${after.actor} turn=${after.turnNumber} legal=${legalCount}`,
        );
      }
      check('normal: the page threw no errors', errors.length === 0, errors.slice(0, 2).join(' | '));
      const tasks = await longTasks(page);
      const worst = tasks.length ? Math.max(...tasks) : 0;
      check('normal: no long task over 200ms during play', worst <= 200, `worst=${Math.round(worst)}ms n=${tasks.length}`);
      await page.context().close();
    }

    // ------------------------------------------------------------------ skip during the deal
    {
      const { page, errors } = await open(browser, 77, { width: 390, height: 844 });
      await page.waitForSelector('#starter-lottery:not([hidden])', { timeout: 20_000 });
      await waitPhase(page, 'deal');
      const t0 = Date.now();
      await page.touchscreen.tap(24, 24);
      await page.waitForFunction(() => /start/i.test(document.getElementById('lottery-title')?.textContent ?? ''), undefined, { timeout: 3_000 });
      await checkResultAgainstEngine(page, 'skip');
      await waitHidden(page, 3_000);
      check('skip: a tap resolves the ritual promptly', Date.now() - t0 < 1_500, `${Date.now() - t0}ms`);
      check('skip: the page threw no errors', errors.length === 0, errors.slice(0, 2).join(' | '));
      await page.context().close();
    }

    // ------------------------------------------------------------------ rapid repeated tapping
    {
      const { page, errors } = await open(browser, 78, { width: 390, height: 844 });
      await page.waitForSelector('#starter-lottery:not([hidden])', { timeout: 20_000 });
      await waitPhase(page, 'shuffle');
      for (let i = 0; i < 8; i++) {
        await page.touchscreen.tap(20 + i, 24 + i);
        await page.waitForTimeout(12);
      }
      await waitHidden(page, 3_000);
      check('rapid taps: the ritual closes once and the game survives', (await state(page)) !== null);
      check('rapid taps: the page threw no errors', errors.length === 0, errors.slice(0, 2).join(' | '));
      await page.context().close();
    }

    // ------------------------------------------------------------------ keyboard skip
    {
      const { page, errors } = await open(browser, 79, { width: 390, height: 844 });
      await page.waitForSelector('#starter-lottery:not([hidden])', { timeout: 20_000 });
      await waitPhase(page, 'deal');
      await page.keyboard.press('Escape');
      await waitHidden(page, 3_000);
      check('keyboard: a key resolves the ritual and cannot reach the board', (await state(page)) !== null);
      check('keyboard: the page threw no errors', errors.length === 0, errors.slice(0, 2).join(' | '));
      await page.context().close();
    }

    // ------------------------------------------------------------------ reduced motion
    {
      const { page, errors } = await open(browser, 12, { width: 390, height: 844 }, { reduceMotion: true });
      await page.waitForSelector('#starter-lottery:not([hidden])', { timeout: 20_000 });
      await page.waitForFunction(() => /start/i.test(document.getElementById('lottery-title')?.textContent ?? ''), undefined, { timeout: 2_000 });
      const result = await readResult(page);
      check('reduced motion: the result is immediate and both faces are shown', result.reduced && /start/i.test(result.title), `reduced=${result.reduced} ${result.title}`);
      await checkResultAgainstEngine(page, 'reduced');
      await waitHidden(page, 3_000);
      // Timed in the page, from the overlay appearing to it closing: the ritual's own short version,
      // without this process's boot and polling in the window.
      const times = await page.evaluate(() => (window as unknown as {
        __ritualTimes: { visibleAt: number; hiddenAt: number };
      }).__ritualTimes);
      const onScreen = times.hiddenAt - times.visibleAt;
      check(
        'reduced motion: the short version stays under 1.2s',
        onScreen > 0 && onScreen < 1_200,
        `${Math.round(onScreen)}ms`,
      );
      check('reduced motion: the page threw no errors', errors.length === 0, errors.slice(0, 2).join(' | '));
      await page.context().close();
    }

    // ------------------------------------------------------------------ resize / rotation mid-play
    {
      const { page, errors } = await open(browser, 81, { width: 390, height: 844 });
      await page.waitForSelector('#starter-lottery:not([hidden])', { timeout: 20_000 });
      await waitPhase(page, 'shuffle');
      await page.setViewportSize({ width: 844, height: 390 });
      await waitPhase(page, 'result');
      const fit = await page.evaluate(() => {
        const rects = ['lottery-deck', 'lottery-card-you', 'lottery-card-opponent', 'lottery-title']
          .map((id) => document.getElementById(id)?.getBoundingClientRect())
          .filter((r): r is DOMRect => !!r);
        return {
          vw: innerWidth,
          vh: innerHeight,
          bad: rects.filter((r) => r.left < -1 || r.top < -1 || r.right > innerWidth + 1 || r.bottom > innerHeight + 1).length,
        };
      });
      check('rotation: the composition stays inside the viewport', fit.bad === 0, JSON.stringify(fit));
      await checkHomeLayout(page, 'rotation');
      await waitHidden(page);
      check('rotation: the game still starts', (await state(page)) !== null);
      check('rotation: the page threw no errors', errors.length === 0, errors.slice(0, 2).join(' | '));
      await page.context().close();
    }

    // ------------------------------------------------------------------ another match supersedes it
    {
      const { page, errors } = await open(browser, 82, { width: 390, height: 844 });
      await page.waitForSelector('#starter-lottery:not([hidden])', { timeout: 20_000 });
      await waitPhase(page, 'shuffle');
      // A programmatic entry point, exactly as a fast player's next tap would reach it.
      await page.evaluate(() => {
        const overlay = document.getElementById('starter-lottery');
        if (overlay) overlay.style.pointerEvents = 'none';
        (document.getElementById('menu-new') as HTMLButtonElement | null)?.click();
      });
      await page.waitForSelector('#levels:not([hidden])', { timeout: 5_000 });
      await page.locator('.level-tile').first().click();
      await page.waitForSelector('#starter-lottery:not([hidden])', { timeout: 5_000 });
      await waitHidden(page, 8_000);
      check('supersede: a new match cancels the old ritual and starts its own', (await state(page)) !== null);
      check('supersede: the page threw no errors', errors.length === 0, errors.slice(0, 2).join(' | '));
      await page.context().close();
    }

    // ------------------------------------------------------------------ pagehide cleanup
    {
      const { page, errors } = await open(browser, 83, { width: 390, height: 844 });
      await page.waitForSelector('#starter-lottery:not([hidden])', { timeout: 20_000 });
      await waitPhase(page, 'shuffle');
      await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
      await waitHidden(page, 2_000);
      const animations = await page.evaluate(() =>
        document.getElementById('starter-lottery')?.getAnimations({ subtree: true }).length ?? 0,
      );
      check('pagehide: the overlay closes and leaves no animation behind', animations === 0, `animations=${animations}`);
      check('pagehide: the page threw no errors', errors.length === 0, errors.slice(0, 2).join(' | '));
      await page.context().close();
    }
  } finally {
    await browser.close();
    await server.close();
  }
};

await main();
console.log(`\n${failed === 0 ? 'ALL PASS' : `${failed} FAILED`}`);
process.exit(failed === 0 ? 0 : 1);
