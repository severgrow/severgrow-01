// SEEDS SETTLE ON THE FINISH CARD (owner report, 2026-10-25): "after finishing level says 'Seeds
// pending verification' — that should never happen".
//
// A real built page, a real training game played to its end, and a stub API that verifies the
// replay with the SERVER's own verifier (`verifyTrainingProof`) and pays the real economy's amount.
// Only the transport is stubbed, so what is measured is the client's own behaviour:
//
//   pay       the award lands: "+10 Seeds", counted, with its moment — at 390x844 and 1280x800
//   cap       a 0 paid by the daily cap says "Seed limit reached today", never "+0", never "pending"
//   reject    a 400 says so calmly, and the Seeds line is not left waiting
//   hung      a request that does not answer for a while shows NOTHING (never "pending"), and the
//             award appears the moment it does answer — the wedge fix, end to end
//   reduce    Reduce motion: the same line, static, no animation left running
//
// The card must never scroll (the one-screen rule, web/e2e/finish-fit.ts) and "pending" must never
// appear on the line at any moment (a MutationObserver records every value it takes).
//
//   node --import tsx web/e2e/seeds-settle.ts      (writes /tmp/seeds-settle/*.png)
//   (the suite sets its own CHANNEL + the online triple, so a plain shell is enough)
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
import type { Browser, BrowserContext, Page, Route } from 'playwright-core';
import { preview } from 'vite';
import { legalActions, viewFor } from '../../src/engine/index.js';
import type { Action, State } from '../../src/engine/index.js';
import { verifyLessonProof, verifyTrainingProof } from '../../server/src/seeds/verify.js';
import { CAMPAIGN_LEVELS } from '../../src/campaign/index.js';

const OUT = '/tmp/seeds-settle';
const PORT = Number(process.env.PORT ?? 4317);
const ORIGIN = `http://127.0.0.1:${PORT}`;
const CHROME = process.env.PW_CHROMIUM
  ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const IDENTITY_KEY = 'futa05:severgrow.duel.identity.v1';
const SETTINGS_KEY = 'futa05:severgrow.settings.v1';
const BOT_LEVEL = 3;
const TICKET_SEED = 424242;
const PROGRESS_KEY = 'futa05:severgrow.campaign.progress.v3';
/** Everything before the final lesson, so the campaign entry opens level 10 — the level that pays. */
const BEFORE_FINAL = JSON.stringify({
  version: 3,
  unlocked: 9,
  completed: CAMPAIGN_LEVELS.filter((level) => level.number < 10).map((level) => level.id),
  best: {},
});
const WALLET = { balance: 0, lifetimeEarned: 0, lifetimeSpent: 0, worldInvitationSeen: true };

type Scenario = 'pay' | 'cap' | 'reject' | 'hung';

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
        CHANNEL: 'futa05',
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

/** The three states the card can show, measured on the real card. */
const MEASURE = `(() => {
  const host = document.getElementById('go-seeds');
  const card = document.querySelector('#gameover .go-card');
  const screen = document.getElementById('gameover');
  const row = host && host.querySelector('.seed-gain');
  const num = row && row.querySelector('.seed-gain-num');
  const label = host && host.querySelector('.sr-only');
  const shown = (el) => !!el && el.getClientRects().length > 0;
  const control = [...document.querySelectorAll('#gameover .go-buttons .btn')].filter((el) => el.getClientRects().length);
  const inside = (el) => { const r = el.getBoundingClientRect(); return r.top >= -1 && r.bottom <= window.innerHeight + 1; };
  const r = row ? row.getBoundingClientRect() : null;
  return {
    line: host && shown(host) ? (host.textContent || '').trim() : '',
    spoken: label ? (label.textContent || '').trim() : '',
    rowText: row && shown(row) ? (row.textContent || '').trim() : '',
    title: (document.getElementById('go-title') || {}).textContent || '',
    counted: shown(row), number: num ? num.textContent : null, label: label ? label.textContent.trim() : null,
    animations: row ? row.getAnimations({ subtree: true }).length : 0,
    rowHeight: r ? Math.round(r.height) : null,
    cardOverflow: card ? card.scrollHeight - card.clientHeight : null,
    screenOverflow: screen ? screen.scrollHeight - screen.clientHeight : null,
    pageWide: document.documentElement.scrollWidth > window.innerWidth,
    clipped: control.filter((el) => !inside(el)).map((el) => el.id),
    controls: control.length,
    seedLog: (window.__seedLines || []).slice(),
  };
})()`;

type Measured = {
  line: string; spoken: string; rowText: string; title: string; counted: boolean; number: string | null; label: string | null;
  animations: number; rowHeight: number | null; cardOverflow: number | null; screenOverflow: number | null;
  pageWide: boolean; clipped: string[]; controls: number; seedLog: string[];
};

const measure = (page: Page) => page.evaluate(MEASURE) as Promise<Measured>;

const waitStarterRitual = async (page: Page): Promise<void> => {
  await page.waitForFunction(`(() => {
    const r = document.getElementById('starter-lottery');
    return !r || r.hidden || !r.getClientRects().length;
  })()`, undefined, { timeout: 15_000 }).catch(() => undefined);
};

/** Play the real game to its end with real, legal moves (the human side); the bot plays itself. */
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
      // A STRING evaluate: tsx/esbuild's name-keeping helper (`__name`) cannot cross into the page.
      const ok = await page.evaluate(`(() => window.__severgrow.playFor(${JSON.stringify(action)}, 0))()`) as boolean;
      if (ok) { applied = true; break; }
    }
    if (!applied) { await page.waitForTimeout(120); continue; }
  }
  return `still playing after ${maxSteps} steps`;
};

/** A natural move order, so a practice game reads like a game (and ends quickly). */
const order = (legal: readonly Action[]): Action[] => {
  const pick = (t: Action['t']) => legal.find((a) => a.t === t);
  const natural = [pick('Bloom'), pick('Sprout'), pick('EndAct'), pick('Discard'), pick('Draw')]
    .filter((a): a is Action => !!a);
  return [...natural, ...legal.filter((a) => !natural.includes(a))];
};

const dismissInstall = async (page: Page): Promise<void> => {
  for (const id of ['#install-close', '#install-later']) {
    if (await page.locator(id).isVisible().catch(() => false)) {
      await page.locator(id).click({ timeout: 2_000 }).catch(() => undefined);
      return;
    }
  }
};

/** Watch every value the Seeds line takes, so "pending" can be proven absent at any moment. */
const WATCH_SEED_LINE = `(() => {
  const host = document.getElementById('go-seeds');
  window.__seedLines = [];
  if (!host) return;
  const record = () => {
    const text = (host.textContent || '').trim();
    if (window.__seedLines[window.__seedLines.length - 1] !== text) window.__seedLines.push(text);
  };
  record();
  new MutationObserver(record).observe(host, { childList: true, characterData: true, subtree: true });
})()`;
const watchSeedLine = (page: Page): Promise<void> => page.evaluate(WATCH_SEED_LINE) as Promise<void>;

type Settle = {
  /** What the Seeds endpoint answers. `hung` holds the FIRST answer until `release()`. */
  scenario: Scenario;
  /** Called with the award the stub actually returned (for the report). */
  onPaid?: (awarded: number) => void;
};

let ticket: { id: string; seed: number; botLevel: number; expiresAt: number } | null = null;
/** Held by the `hung` scenario: the Seeds answer that has not been given yet. */
const hold: { release: (() => void) | null } = { release: null };
/** Give the held answer (the `hung` scenario). A function, so the closure below is not narrowed. */
const releaseHeld = (): void => { const fn = hold.release; if (typeof fn === 'function') fn(); };

/** The stub API: real verification, real amounts, and every answer shape the card must handle. */
const stubSeeds = async (page: Page, settle: Settle): Promise<void> => {
  let held = false;
  await page.route('**/v1/seeds/**', async (route: Route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === '/v1/seeds/training/tickets') {
      ticket = { id: 'ticket-e2e-1', seed: TICKET_SEED, botLevel: BOT_LEVEL, expiresAt: Date.now() + 3_600_000 };
      return route.fulfill({ json: { ticket } });
    }
    if (path === '/v1/seeds/campaign') {
      if (settle.scenario === 'reject') {
        return route.fulfill({
          status: 400,
          json: { ok: false, code: 'INVALID_REQUEST', message: 'That Campaign result could not be verified.' },
        });
      }
      const body = JSON.parse(request.postData() ?? '{}') as { levelId: string; actions: Action[]; botVersion: string };
      const verified = verifyLessonProof(body.levelId, body.actions, body.botVersion);
      if (!verified) {
        return route.fulfill({
          status: 400,
          json: { ok: false, code: 'INVALID_REQUEST', message: 'That Campaign result could not be verified.' },
        });
      }
      const awarded = verified.winner === 0 ? 100 : 0;
      settle.onPaid?.(awarded);
      return route.fulfill({ json: { reward: { awarded, reason: null, wallet: WALLET, replayed: false } } });
    }
    if (path !== '/v1/seeds/training') {
      return route.fulfill({ status: 404, json: { ok: false, code: 'NOT_FOUND', message: 'no such stub route' } });
    }
    if (settle.scenario === 'reject') {
      return route.fulfill({
        status: 400,
        json: { ok: false, code: 'INVALID_REQUEST', message: 'That Training result could not be verified.' },
      });
    }
    const body = JSON.parse(request.postData() ?? '{}') as { actions: Action[]; botVersion: string };
    const verified = ticket ? verifyTrainingProof(ticket.seed, ticket.botLevel, body.actions, body.botVersion) : null;
    if (!verified) {
      return route.fulfill({
        status: 400,
        json: { ok: false, code: 'INVALID_REQUEST', message: 'That Training result could not be verified.' },
      });
    }
    const awarded = settle.scenario === 'cap' ? 0 : verified.winner === 0 ? 10 : verified.winner === 1 ? 3 : 0;
    const reason = settle.scenario === 'cap' ? 'mode_daily_limit' : awarded === 0 ? 'no_draw_reward' : null;
    settle.onPaid?.(awarded);
    if (settle.scenario === 'hung' && !held) {
      held = true;
      // The wedged-request case: the connection is up but nothing comes back for a while.
      await new Promise<void>((resolve) => { hold.release = resolve; });
    }
    return route.fulfill({ json: { reward: { awarded, reason, wallet: WALLET, replayed: false } } });
  });
};

/** Drive a LEVEL game by following the lesson's own suggested move (level 10 tells you how to win). */
const toGameOverLesson = async (page: Page, maxSteps = 1600): Promise<string> => {
  await waitStarterRitual(page);
  const read = () => page.evaluate('(() => window.__severgrow.state())()') as Promise<State | null>;
  const suggested = () => page.evaluate('(() => window.__severgrow.lessonMove())()') as Promise<Action | null>;
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
    const hint = await suggested();
    const candidates = hint ? [hint, ...order(legal).filter((a) => JSON.stringify(a) !== JSON.stringify(hint))] : order(legal);
    let applied = false;
    for (const action of candidates) {
      const ok = await page.evaluate(`(() => window.__severgrow.playFor(${JSON.stringify(action)}, 0))()`) as boolean;
      if (ok) { applied = true; break; }
    }
    if (!applied) { await page.waitForTimeout(120); continue; }
  }
  return `still playing after ${maxSteps} steps`;
};

const openTrainingGame = async (page: Page, identity: { token: string; playerId: string }) => {
  await page.goto(ORIGIN, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction('(() => !!(window.__severgrow && window.__severgrow.ready && window.__severgrow.ready()))()', undefined, { timeout: 60_000 });
  await page.waitForSelector('#menu-play:not([hidden])', { timeout: 30_000 }).catch(() => undefined);
  // PLAY → Practice match → EASY, exactly as a player reaches it on a product build.
  if (!(await page.locator('#play-menu').isVisible().catch(() => false))) {
    await page.click('#menu-play');
    await page.waitForSelector('#play-menu:not([hidden])', { timeout: 20_000 });
  }
  await page.click('#menu-new');
  await page.waitForSelector('#levels:not([hidden])', { timeout: 20_000 });
  await page.click('.difficulty-tile[data-difficulty="easy"]');
  await page.waitForFunction('(() => !!window.__severgrow.state() && !window.__severgrow.busy())()', undefined, { timeout: 60_000 });
  await watchSeedLine(page);
  void identity;
};

/** Open the level the profile is on (level 10, after seeding levels 1-9 as complete). */
const openLevelGame = async (page: Page): Promise<void> => {
  await page.goto(ORIGIN, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction('(() => !!(window.__severgrow && window.__severgrow.ready && window.__severgrow.ready()))()', undefined, { timeout: 60_000 });
  await page.waitForSelector('#menu-play:not([hidden])', { timeout: 30_000 }).catch(() => undefined);
  if (!(await page.locator('#play-menu').isVisible().catch(() => false))) {
    await page.click('#menu-play');
    await page.waitForSelector('#play-menu:not([hidden])', { timeout: 20_000 });
  }
  await page.click('#menu-campaign');
  await page.waitForFunction(
    '(() => !!window.__severgrow.state() || !document.getElementById("campaign").hidden)()',
    undefined,
    { timeout: 30_000 },
  );
  if (await page.locator('#campaign-continue').isVisible().catch(() => false)) await page.click('#campaign-continue');
  await page.waitForFunction('(() => !!window.__severgrow.state() && !window.__severgrow.busy())()', undefined, { timeout: 60_000 });
  await watchSeedLine(page);
};

const boot = async (
  browser: Browser,
  options: { width: number; height: number; reduceMotion?: boolean; lesson?: boolean },
): Promise<{ context: BrowserContext; page: Page; errors: string[] }> => {
  const context = await browser.newContext({
    viewport: { width: options.width, height: options.height },
    hasTouch: options.width < 800,
    isMobile: options.width < 800,
    deviceScaleFactor: 1,
    serviceWorkers: 'block',
  });
  // A STRING init script (tsx/esbuild's `__name` helper cannot cross into the page).
  await context.addInitScript({
    content: `(() => {
      const identityKey = ${JSON.stringify(IDENTITY_KEY)};
      const settingsKey = ${JSON.stringify(SETTINGS_KEY)};
      try {
        localStorage.clear();
        localStorage.setItem(identityKey, JSON.stringify({
          token: 'e2e-seed-token', playerId: 'e2e-seed-player', displayName: 'E2E', kind: 'guest',
        }));
        localStorage.setItem(settingsKey, JSON.stringify({
          sound: false, music: false, coach: false, speed: 'normal', reduceMotion: ${options.reduceMotion ? 'true' : 'false'},
          eyeCandy: false, autoSkip: false,
        }));
        localStorage.setItem('futa05:severgrow.install-prompt.v1', JSON.stringify({ games: 0, shown: true, never: true }));
        ${options.lesson ? `localStorage.setItem(${JSON.stringify(PROGRESS_KEY)}, ${JSON.stringify(BEFORE_FINAL)});` : ''}
      } catch { /* storage blocked: the app reports it */ }
    })();`,
  });
  const page = await context.newPage();
  if (options.reduceMotion) await page.emulateMedia({ reducedMotion: 'reduce' });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return { context, page, errors };
};

const portrait = { width: 390, height: 844 };
const desktop = { width: 1280, height: 800 };

// THE SUITE OWNS ITS BUILD **AND** ITS PREVIEW, so it must supply both sides' environment. `build()`
// below passes the online triple to its child process, but `preview()` loads web/vite.config.ts in
// THIS process, and a `futa05` config refuses to load without it — so the documented command
// (`CHANNEL=futa05 node --import tsx web/e2e/seeds-settle.ts`) used to die at the preview with
// "CHANNEL=futa05 build requires VITE_DUEL_API_URL…" before a browser ever opened. Setting the same
// values here makes the suite runnable from a plain shell, and inside a CI job that only exports
// the Supabase pair. The API origin is a ROUTING PATTERN only: `stubSeeds` intercepts
// `**/v1/seeds/**`, so it never has to be reachable.
process.env.CHANNEL = 'futa05';
process.env.VITE_DUEL_API_URL = ORIGIN;
process.env.VITE_SUPABASE_URL ||= 'http://127.0.0.1:9';
process.env.VITE_SUPABASE_ANON_KEY ||= 'local-e2e-anon-key';

await build();
const server = await preview({
  configFile: 'web/vite.config.ts',
  preview: { host: '127.0.0.1', port: PORT, strictPort: true },
  logLevel: 'error',
});
const browser = await chromium.launch({ executablePath: CHROME });
const rows: string[] = [];
/** `ONLY="level 10,pay/phone"` re-runs a subset while iterating on the frames. */
const ONLY = (process.env.ONLY ?? '').split(',').map((value) => value.trim()).filter(Boolean);

const run = async (
  name: string,
  viewport: { width: number; height: number },
  scenario: Scenario,
  options: { reduceMotion?: boolean; releaseAfterMs?: number; shot: string; lesson?: boolean },
): Promise<void> => {
  if (ONLY.length && !ONLY.includes(name)) return;
  ticket = null;
  hold.release = null;
  const { context, page, errors } = await boot(browser, {
    ...viewport,
    ...(options.reduceMotion ? { reduceMotion: true } : {}),
    ...(options.lesson ? { lesson: true } : {}),
  });
  let awarded: number | null = null;
  try {
    await stubSeeds(page, { scenario, onPaid: (value) => { awarded = value; } });
    if (options.lesson) {
      await openLevelGame(page);
      const ended = await toGameOverLesson(page);
      check(`${name}: the level reached its end`, ended === 'ended', ended);
    } else {
      await openTrainingGame(page, { token: 'e2e-seed-token', playerId: 'e2e-seed-player' });
      const ended = await toGameOver(page);
      check(`${name}: the game reached its end`, ended === 'ended', ended);
    }
    await page.waitForSelector('#gameover:not([hidden])', { timeout: 30_000 });
    await dismissInstall(page);

    if (scenario === 'hung') {
      // Past any "settle within a second" hope, with nothing back yet: the line must be EMPTY.
      await page.waitForTimeout(1_400);
      const waiting = await measure(page);
      check(`${name}: nothing is claimed while the request is unanswered`, waiting.line === '', `"${waiting.line}"`);
      await page.screenshot({ path: `${OUT}/${options.shot}-waiting.png` });
      releaseHeld();
    }

    const expectText = scenario === 'cap' ? 'Seed limit reached today'
      : scenario === 'reject' ? 'Seeds for this game could not be verified.'
      : null;
    if (expectText) {
      await page.waitForFunction(
        `(() => (document.getElementById('go-seeds')?.textContent ?? '').trim() === ${JSON.stringify(expectText)})()`,
        undefined,
        { timeout: 15_000 },
      ).catch(() => undefined);
    } else {
      await page.waitForFunction(
        `(() => /\\+\\d+\\s*Seeds/i.test(document.querySelector('#go-seeds .sr-only')?.textContent ?? ''))()`,
        undefined,
        { timeout: 15_000 },
      ).catch(() => undefined);
    }
    const m0 = await measure(page);
    if (scenario === 'pay' && m0.counted) {
      // THE FRAMES (owner: "show me the frames"): back-to-back shots through the count, so the
      // strip covers the whole moment rather than its last 200 ms.
      for (let frame = 1; frame <= 6; frame += 1) {
        const shot = `${OUT}/${options.shot}-f${frame}.png`;
        await page.screenshot({ path: shot });
        const f = await measure(page);
        console.log(`    frame ${frame}: ${f.number ?? '-'} (${f.animations} anim) → ${shot}`);
      }
    }
    // Let the count finish (or never start), then read the settled card.
    await page.waitForTimeout(scenario === 'pay' || scenario === 'hung' ? 1_100 : 300);
    const m = await measure(page);
    console.log(`  ${name} [${viewport.width}x${viewport.height}] "${m.title}" → line "${m.line}" (${m.number ?? '-'}, ${m.animations} anim)`);

    check(`${name}: the card never says "pending"`, m.seedLog.every((text) => !/pending/i.test(text)), m.seedLog.join(' | '));
    check(`${name}: no zero and no invented number`, !/^\+0\b/.test(m.counted ? (m.number ?? '') : m.line), m.line);
    check(`${name}: the card does not scroll`, (m.cardOverflow ?? 1) <= 0, `${m.cardOverflow}px`);
    check(`${name}: the screen behind it does not scroll`, (m.screenOverflow ?? 1) <= 0, `${m.screenOverflow}px`);
    check(`${name}: the page does not widen`, !m.pageWide);
    check(`${name}: every control is inside the viewport`, m.clipped.length === 0, m.clipped.join(','));
    check(`${name}: no page errors`, errors.length === 0, errors.slice(0, 2).join(' | '));

    if (scenario === 'pay') {
      check(`${name}: the award is the amount the server paid`, m.spoken === `+${awarded} Seeds`, `${m.spoken} vs +${awarded}`);
      check(`${name}: the row is one line, emblem + amount`, m.counted && (m.rowHeight ?? 99) <= 34, `row ${m.rowHeight}px`);
      check(`${name}: the reader is told the plain sentence`, m.label === `+${awarded} Seeds`, String(m.label));
      check(`${name}: the moment played and then stopped`, m.animations === 0, `${m.animations}`);
      rows.push(`pay ${viewport.width}x${viewport.height} → ${m.line}`);
    }
    if (scenario === 'cap') {
      check(`${name}: a capped payout is the calm limit line`, m.line === 'Seed limit reached today', m.line);
      check(`${name}: no counting row for a zero`, !m.counted);
    }
    if (scenario === 'reject') {
      check(`${name}: a refusal is said out loud`, m.line === 'Seeds for this game could not be verified.', m.line);
      check(`${name}: a refusal is not a number`, !m.counted);
    }
    if (scenario === 'hung') {
      check(`${name}: the award lands as soon as the line answers`, m.spoken === `+${awarded} Seeds`, m.spoken);
    }
    if (options.reduceMotion) {
      check(`${name}: Reduce motion shows the finished line, still`, m.animations === 0, `${m.animations}`);
      check(`${name}: Reduce motion's number is final at once`, m.number === `+${awarded}`, String(m.number));
    }
    // The settled card, saved BEFORE anything replays the reveal, so the named shot is the real one.
    await page.screenshot({ path: `${OUT}/${options.shot}.png` });
    console.log(`    shot: ${OUT}/${options.shot}.png`);
    if (scenario === 'pay') {
      // The award's own moment, replayed through the SAME paint path (`__severgrow.seedReveal` is
      // the app's documented hook for exactly this), so the strip starts at the first frame instead
      // of 400 ms in. The live award frames above are the unscaled proof of the real thing.
      await page.evaluate('(() => window.__severgrow.seedReveal(100))()');
      for (let frame = 1; frame <= 6; frame += 1) {
        await page.screenshot({ path: `${OUT}/${options.shot}-strip-${frame}.png` });
      }
      console.log(`    strip: ${OUT}/${options.shot}-strip-1..6.png`);
    }
  } finally {
    await context.close().catch(() => undefined);
  }
};

try {
  await run('pay/phone', portrait, 'pay', { shot: 'award-390x844' });
  await run('pay/desktop', desktop, 'pay', { shot: 'award-1280x800' });
  await run('cap', portrait, 'cap', { shot: 'cap-390x844' });
  await run('reject', portrait, 'reject', { shot: 'reject-390x844' });
  await run('hung', portrait, 'hung', { shot: 'hung-390x844' });
  await run('reduce motion', portrait, 'pay', { reduceMotion: true, shot: 'reduce-motion-390x844' });
  await run('level 10', portrait, 'pay', { lesson: true, shot: 'lesson-10-390x844' });
  await run('level 10/desktop', desktop, 'pay', { lesson: true, shot: 'lesson-10-1280x800' });
} finally {
  await browser.close().catch(() => undefined);
  await server.close().catch(() => undefined);
}

writeFileSync(`${OUT}/report.txt`, `${rows.join('\n')}\n`);
console.log(`\n${failed === 0 ? 'ALL PASS' : `${failed} FAILED`} — shots in ${OUT}`);
process.exit(failed === 0 ? 0 : 1);
