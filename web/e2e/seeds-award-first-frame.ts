// THE SEEDS AWARD MUST BE THERE WHEN THE CARD ARRIVES (owner, 2026-10-25: "+20 seeds shows
// after few seconds — it should start showing immediately when the end of game screen shows up").
//
// A real built page, real training games played to their end, and a stub API whose answer time is
// what we vary. Only the transport is stubbed; the card, the settle and the reveal are the app's.
//
//   fast     the proof answers in ~150 ms: the award is on the card's FIRST visible frame
//   slow     the proof answers in ~1.5 s: nothing is fabricated while it is out (the line is
//            EMPTY, never a guess and never "pending"), and the award lands the moment it answers
//   type     the number uses the game's numeral face (--font-num, Futasaku Numerals) at the new
//            size, and the row stays one line inside the card at every real viewport
//
// The one-screen rule is still the 0 px overflow check (web/e2e/finish-fit.ts).
//
//   node --import tsx web/e2e/seeds-award-first-frame.ts
//   (writes /tmp/polish2/*.png)
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
import type { Browser, Page, Route } from 'playwright-core';
import { preview } from 'vite';
import { legalActions, viewFor } from '../../src/engine/index.js';
import type { Action, State } from '../../src/engine/index.js';

const OUT = '/tmp/polish2';
const PORT = Number(process.env.PORT ?? 4391);
const ORIGIN = `http://127.0.0.1:${PORT}`;
const CHROME = process.env.PW_CHROMIUM ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const IDENTITY_KEY = 'main2:severgrow.duel.identity.v1';
const SETTINGS_KEY = 'main2:severgrow.settings.v1';
const WALLET = { balance: 0, lifetimeEarned: 0, lifetimeSpent: 0, worldInvitationSeen: true };

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

const order = (legal: readonly Action[]): Action[] => {
  const pick = (t: Action['t']) => legal.find((a) => a.t === t);
  const natural = [pick('Bloom'), pick('Sprout'), pick('EndAct'), pick('Discard'), pick('Draw')]
    .filter((a): a is Action => !!a);
  return [...natural, ...legal.filter((a) => !natural.includes(a))];
};

/** Play the real game (human side) to its end; the computer plays itself. */
const toGameOver = async (page: Page, maxSteps = 1200): Promise<string> => {
  await waitStarterRitual(page);
  const read = () => page.evaluate('(() => window.__severgrow.state())()') as Promise<State | null>;
  const idle = () => page.waitForFunction('(() => !!window.__severgrow.state() && !window.__severgrow.busy())()', undefined, { timeout: 30_000 });
  let waitTurns = 0;
  for (let i = 0; i < maxSteps; i++) {
    const s = await read();
    if (!s) return 'no state';
    if (s.phase === 'GAME_OVER') return 'ended';
    await idle();
    const now = (await read())!;
    if (now.phase === 'GAME_OVER') return 'ended';
    if (now.actor !== 0) {
      if (++waitTurns > 400) return `the bot never finished its turn (${now.actor}, ${now.phase})`;
      await page.waitForTimeout(60);
      continue;
    }
    waitTurns = 0;
    const legal = legalActions(viewFor(now, 0));
    if (!legal.length) return `no legal move for the human (${now.phase})`;
    let applied = false;
    for (const action of order(legal)) {
      const ok = await page.evaluate(`(() => window.__severgrow.playFor(${JSON.stringify(action)}, 0))()`) as boolean;
      if (ok) { applied = true; break; }
    }
    if (!applied) await page.waitForTimeout(120);
  }
  return `still playing after ${maxSteps} steps`;
};

const openTrainingGame = async (page: Page): Promise<void> => {
  await page.goto(ORIGIN, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction('(() => !!(window.__severgrow && window.__severgrow.ready && window.__severgrow.ready()))()', undefined, { timeout: 60_000 });
  await page.waitForSelector('#menu-play:not([hidden])', { timeout: 30_000 }).catch(() => undefined);
  if (!(await page.locator('#play-menu').isVisible().catch(() => false))) {
    await page.click('#menu-play');
    await page.waitForSelector('#play-menu:not([hidden])', { timeout: 20_000 });
  }
  await page.click('#menu-new');
  await page.waitForSelector('#levels:not([hidden])', { timeout: 20_000 });
  await page.click('.difficulty-tile[data-difficulty="easy"]');
  await page.waitForFunction('(() => !!window.__severgrow.state() && !window.__severgrow.busy())()', undefined, { timeout: 60_000 });
};

/**
 * Watches the two moments that decide this suite, inside the page:
 *   gameover — the plate became visible (its hidden attribute came off)
 *   number   — the award's full sentence (the screen reader's own "+N Seeds") is in the DOM
 * plus what was on the line at the first painted frame.
 */
const WATCH = `(() => {
  const marks = { gameover: null, number: null, firstFrame: null, seedLog: [] };
  window.__awardMarks = marks;
  const go = document.getElementById('gameover');
  const host = document.getElementById('go-seeds');
  const record = () => {
    const text = host ? (host.textContent || '').trim() : '';
    if (marks.seedLog[marks.seedLog.length - 1] !== text) marks.seedLog.push(text);
  };
  record();
  if (host) new MutationObserver(record).observe(host, { childList: true, characterData: true, subtree: true });
  const visible = () => {
    if (marks.gameover !== null) return;
    if (go && !go.hidden && go.getClientRects().length) {
      marks.gameover = performance.now();
      requestAnimationFrame(() => {
        const sr = host && host.querySelector('.sr-only');
        const num = host && host.querySelector('.seed-gain-num');
        marks.firstFrame = {
          sr: sr ? sr.textContent : null,
          num: num ? num.textContent : null,
          text: host ? (host.textContent || '').trim() : '',
          deltaMs: Math.round((performance.now() - marks.gameover) * 10) / 10,
        };
      });
    }
  };
  if (go) new MutationObserver(visible).observe(go, { attributes: true, attributeFilter: ['hidden'] });
  new MutationObserver(() => {
    if (marks.gameover === null) { visible(); return; }
    const sr = host && host.querySelector('.sr-only');
    if (marks.number === null && sr && /\\+\\d+\\s*Seeds/i.test(sr.textContent || '')) marks.number = performance.now();
  }).observe(document.body, { childList: true, subtree: true, characterData: true });
})()`;

type Marks = {
  gameover: number | null;
  number: number | null;
  firstFrame: { sr: string | null; num: string | null; text: string; deltaMs: number } | null;
  seedLog: string[];
};

const stub = async (page: Page, delayMs: number): Promise<void> => {
  await page.route('**/v1/guests', (route: Route) => route.fulfill({
    json: { token: 'e2e-token', player: { id: 'e2e-player', displayName: 'E2E', kind: 'guest' } },
  }));
  await page.route('**/v1/seeds/training/tickets', (route: Route) => route.fulfill({
    json: { ticket: { id: 'ticket-first-frame', seed: 424242, botLevel: 3, expiresAt: Date.now() + 3_600_000 } },
  }));
  await page.route('**/v1/seeds/training', async (route: Route) => {
    await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
    return route.fulfill({ json: { reward: { awarded: 100, reason: null, wallet: WALLET, replayed: false } } });
  });
};

const boot = async (browser: Browser, width: number, height: number) => {
  const context = await browser.newContext({
    viewport: { width, height },
    hasTouch: width < 800,
    isMobile: width < 800,
    deviceScaleFactor: 1,
    serviceWorkers: 'block',
  });
  await context.addInitScript({
    content: `(() => {
      try {
        localStorage.clear();
        localStorage.setItem(${JSON.stringify(IDENTITY_KEY)}, JSON.stringify({ token: 'e2e-seed-token', playerId: 'e2e-seed-player', displayName: 'E2E', kind: 'guest' }));
        localStorage.setItem(${JSON.stringify(SETTINGS_KEY)}, JSON.stringify({ sound: false, music: false, coach: false, speed: 'normal', reduceMotion: false, eyeCandy: false, autoSkip: false }));
        localStorage.setItem('main2:severgrow.install-prompt.v1', JSON.stringify({ games: 0, shown: true, never: true }));
      } catch {}
    })();`,
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return { context, page, errors };
};

/** Everything the card says about the award, measured on the real DOM. */
const MEASURE = `(() => {
  const host = document.getElementById('go-seeds');
  const card = document.querySelector('#gameover .go-card');
  const screen = document.getElementById('gameover');
  const row = host && host.querySelector('.seed-gain');
  const num = row && row.querySelector('.seed-gain-num');
  const emblem = row && row.querySelector('.seed-gain-emblem');
  const nth = num ? getComputedStyle(num) : null;
  const shown = (el) => !!el && el.getClientRects().length > 0;
  const r = row ? row.getBoundingClientRect() : null;
  const controls = [...document.querySelectorAll('#gameover .go-buttons .btn')].filter(shown);
  const inside = (el) => { const b = el.getBoundingClientRect(); return b.top >= -1 && b.bottom <= window.innerHeight + 1 && b.left >= -1 && b.right <= window.innerWidth + 1; };
  const sr = host && host.querySelector('.sr-only');
  return {
    line: host && shown(host) ? (host.textContent || '').trim() : '',
    spoken: sr ? sr.textContent.trim() : '',
    rowShown: shown(row),
    rowHeight: r ? Math.round(r.height) : null,
    hostHeight: host ? Math.round(host.getBoundingClientRect().height) : null,
    fontFamily: nth ? nth.fontFamily : null,
    fontSize: nth ? nth.fontSize : null,
    fontWeight: nth ? nth.fontWeight : null,
    emblem: emblem ? Math.round(emblem.getBoundingClientRect().width) : null,
    number: num ? num.textContent : null,
    cardOverflow: card ? card.scrollHeight - card.clientHeight : null,
    screenOverflow: screen ? screen.scrollHeight - screen.clientHeight : null,
    pageWide: document.documentElement.scrollWidth > window.innerWidth,
    clipped: controls.filter((el) => !inside(el)).map((el) => el.id),
    seedSlot: !!card && card.classList.contains('seed-slot'),
  };
})()`;

type Measured = {
  line: string; spoken: string; rowShown: boolean; rowHeight: number | null; hostHeight: number | null;
  fontFamily: string | null; fontSize: string | null; fontWeight: string | null; emblem: number | null;
  number: string | null; cardOverflow: number | null; screenOverflow: number | null;
  pageWide: boolean; clipped: string[]; seedSlot: boolean;
};

const measure = (page: Page) => page.evaluate(MEASURE) as Promise<Measured>;

const run = async (
  browser: Browser,
  name: string,
  width: number,
  height: number,
  delayMs: number,
  options: { slow?: boolean; preanswered?: boolean } = {},
): Promise<void> => {
  const { context, page, errors } = await boot(browser, width, height);
  try {
    await stub(page, delayMs);
    await openTrainingGame(page);
    await page.evaluate(WATCH);
    const ended = await toGameOver(page);
    check(`${name}: the game reached its end`, ended === 'ended', ended);
    await page.waitForFunction('(() => window.__awardMarks.gameover !== null)()', undefined, { timeout: 30_000 });
    // The owner's frame: the card as it appears, ~50 ms in.
    await page.waitForTimeout(50);
    await page.screenshot({ path: `${OUT}/award-first-frame-${name}.png` });
    const at50 = await measure(page);
    const marks = await page.evaluate('(() => window.__awardMarks)()') as Marks;
    const delta = marks.number === null ? null : Math.round(marks.number - (marks.gameover as number));
    console.log(`  ${name}: card→number ${delta} ms · first frame ${JSON.stringify(marks.firstFrame)} · at50 "${at50.line}"`);

    check(`${name}: the card never says "pending"`, marks.seedLog.every((text) => !/pending/i.test(text)), marks.seedLog.join(' | '));
    check(`${name}: the card does not scroll`, (at50.cardOverflow ?? 1) <= 0, `${at50.cardOverflow}px`);
    check(`${name}: the screen behind it does not scroll`, (at50.screenOverflow ?? 1) <= 0, `${at50.screenOverflow}px`);
    check(`${name}: the page does not widen`, !at50.pageWide);
    check(`${name}: every control is inside the viewport`, at50.clipped.length === 0, at50.clipped.join(','));

    if (!options.slow) {
      // The happy path: an answer that was in hand when the plate appeared is painted on that
      // very frame. A ~150 ms stub can also land a few frames AFTER a short win animation — that
      // is still immediate, and it must never be a guess before it arrives. The "preanswered"
      // scenario (a zero-latency answer) pins the first-frame rule exactly.
      check(`${name}: the award is on the card within a couple of frames`, delta !== null && delta <= (options.preanswered ? 24 : 250), `${delta} ms`);
      if (options.preanswered) {
        check(`${name}: the award is there on the card's first visible frame`, !!marks.firstFrame?.sr && /^\+\d+ Seeds$/.test(marks.firstFrame.sr), String(marks.firstFrame?.sr));
      }
    } else {
      // Never fabricate: while the proof is out, the line is EMPTY.
      check(`${name}: nothing is claimed while the proof is unanswered`, !marks.firstFrame?.sr && (marks.firstFrame?.text ?? '') === '', JSON.stringify(marks.firstFrame));
      check(`${name}: the award lands as soon as the answer does`, delta !== null && delta < 1200, `${delta} ms`);
    }

    // Let the count land, then measure and photograph the settled line.
    await page.waitForTimeout(1_200);
    const settled = await measure(page);
    console.log(`  ${name}: settled "${settled.spoken}" · ${settled.fontFamily} ${settled.fontSize}/${settled.fontWeight} · row ${settled.rowHeight}px (host ${settled.hostHeight}px), emblem ${settled.emblem}px`);
    check(`${name}: the award landed on the amount`, settled.spoken === '+100 Seeds', settled.spoken);
    check(`${name}: the number uses the game's numeral typeface`, !!settled.fontFamily && /Futasaku Numerals/i.test(settled.fontFamily), String(settled.fontFamily));
    // 1.65rem at the product's 16px root is 26.4px; a step up from the 0.85rem body line.
    check(`${name}: the number is a clear step up in size`, !!settled.fontSize && parseFloat(settled.fontSize) >= 24, String(settled.fontSize));
    check(`${name}: the emblem still sits beside it`, settled.rowShown && settled.emblem !== null && settled.emblem >= 18, `${settled.emblem}px`);
    check(`${name}: the line is still one row`, (settled.rowHeight ?? 99) <= 34, `row ${settled.rowHeight}px`);
    check(`${name}: the slot was held, so the number did not push the card`, settled.seedSlot);
    check(`${name}: still no scrolling after it lands`, (settled.cardOverflow ?? 1) <= 0 && (settled.screenOverflow ?? 1) <= 0, `card ${settled.cardOverflow}px / screen ${settled.screenOverflow}px`);

    // A close-up of the line itself (for the eye, not for the check).
    const box = await page.evaluate(`(() => {
      const host = document.getElementById('go-seeds');
      const r = host.getBoundingClientRect();
      return { x: Math.max(0, r.x - 8), y: Math.max(0, r.y - 8), width: Math.min(window.innerWidth, r.width + 16), height: r.height + 16 };
    })()`) as { x: number; y: number; width: number; height: number };
    await page.screenshot({ path: `${OUT}/award-closeup-${name}.png`, clip: box });
    check(`${name}: no page errors`, errors.length === 0, errors.slice(0, 2).join(' | '));
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
const ONLY = (process.env.ONLY ?? '').split(',').map((v) => v.trim()).filter(Boolean);
const want = (name: string) => ONLY.length === 0 || ONLY.includes(name);
try {
  if (want('320x568')) await run(browser, '320x568', 320, 568, 150);
  if (want('360x640')) await run(browser, '360x640', 360, 640, 150);
  if (want('390x844')) await run(browser, '390x844', 390, 844, 150);
  if (want('1280x800')) await run(browser, '1280x800', 1280, 800, 150);
  if (want('preanswered')) await run(browser, 'preanswered-360x640', 360, 640, 0, { preanswered: true });
  if (want('slow')) await run(browser, 'slow-390x844', 390, 844, 1500, { slow: true });
} finally {
  await browser.close().catch(() => undefined);
  await server.close().catch(() => undefined);
}
console.log(`\n${failed === 0 ? 'ALL PASS' : `${failed} FAILED`} — shots in ${OUT}`);
process.exit(failed === 0 ? 0 : 1);
