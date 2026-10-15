// THE FINISH SCREEN MUST NEVER SCROLL (owner direction, 2026-10-16) — measured, not eyeballed.
//
//   CHANNEL=futa04 npm run web:build && npx tsx web/e2e/finish-fit.ts
//   PW_CHROMIUM=/path/to/chrome npx tsx web/e2e/finish-fit.ts
//
// The owner: "end of screen menu should be always in every mode way shorter and show all on one
// screen with no scrolling". One screen shared by three modes, so all three are driven here:
//
//   classic   an offline duel against the computer, alone
//   campaign  a campaign level, alone
//   online    a real duel on the local API (the match is resigned, so the finish screen is real)
//
// For each mode, at 360x640 (the tightest real phone) and 390x844, it asserts on the MEASUREMENT:
// the card and the screen behind it both have no overflow, every visible control is inside the
// viewport, and nothing widens the page. It also records exactly which lines and buttons each mode
// shows, writes docs/screens/finish/*.png, and fails if the shot could not be taken.
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
import type { Browser, Page } from 'playwright-core';
import { preview } from 'vite';
import { legalActions, viewFor } from '../../src/engine/index.js';
import type { Action, State } from '../../src/engine/index.js';
import { CHROME, openSeat, startLocalDuel } from './helpers/local-duel.js';

const OUT = new URL('../../docs/screens/finish/', import.meta.url).pathname;
const PORT = Number(process.env.PORT ?? 4301);
/** MODES=classic,campaign,online — the online part rebuilds the dist, so it can be left out. */
const MODES = (process.env.MODES ?? 'classic,campaign,online').split(',').map((s) => s.trim());
const VIEWPORTS = [
  { key: '360x640', width: 360, height: 640 },
  { key: '390x844', width: 390, height: 844 },
] as const;

let failed = 0;
const check = (name: string, ok: boolean, note = '') => {
  if (!ok) failed += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? `  (${note})` : ''}`);
};

mkdirSync(OUT, { recursive: true });

/** Every line and button the finish card owns, in document order (what a mode chooses to show). */
const PARTS = [
  'go-title', 'go-sub', 'go-score', 'go-reason', 'go-break', 'go-moves', 'go-highlights', 'go-stats',
  'go-rematch', 'go-other', 'go-more', 'go-share', 'go-board', 'go-cut', 'go-menu',
] as const;

/**
 * The measurement itself. `overflow` is the exact acceptance criterion: a negative or zero value is
 * "it fits". The card scrolls internally (`overflow-y:auto`) and the screen behind it must not
 * scroll either, so BOTH are read. Visible controls must sit inside the viewport.
 */
const MEASURE = `(() => {
  const id = (x) => document.getElementById(x);
  const card = document.querySelector('#gameover .go-card');
  const screen = id('gameover');
  const box = (el) => { const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), bottom: Math.round(r.bottom) }; };
  const shown = (el) => !!el && el.getClientRects().length > 0;
  const parts = ${JSON.stringify(PARTS)};
  const inside = (el) => {
    const r = el.getBoundingClientRect();
    return r.top >= -1 && r.bottom <= window.innerHeight + 1 && r.left >= -1 && r.right <= window.innerWidth + 1;
  };
  const controls = [...document.querySelectorAll('#gameover .go-buttons .btn')].filter(shown);
  return {
    card: card ? { ...box(card), scrollH: card.scrollHeight, clientH: card.clientHeight, overflow: card.scrollHeight - card.clientHeight } : null,
    screen: screen ? { scrollH: screen.scrollHeight, clientH: screen.clientHeight, overflow: screen.scrollHeight - screen.clientHeight } : null,
    pageWide: document.documentElement.scrollWidth > window.innerWidth,
    viewport: { w: window.innerWidth, h: window.innerHeight },
    visibleParts: parts.filter((p) => shown(id(p))),
    hiddenParts: parts.filter((p) => !shown(id(p))),
    buttons: controls.map((b) => ({ id: b.id, label: (b.textContent || '').trim(), inside: inside(b) })),
    primary: controls.filter((b) => b.classList.contains('primary')).map((b) => b.id),
    highlights: document.querySelectorAll('#go-highlights li').length,
    clipped: controls.filter((b) => !inside(b)).map((b) => b.id),
    title: (id('go-title') || {}).textContent || '',
    reason: (id('go-reason') || {}).textContent || '',
  };
})()`;

const measure = (page: Page) => page.evaluate(MEASURE) as Promise<{
  card: { overflow: number; h: number } | null;
  screen: { overflow: number } | null;
  pageWide: boolean;
  visibleParts: string[];
  hiddenParts: string[];
  buttons: { id: string; label: string; inside: boolean }[];
  primary: string[];
  highlights: number;
  clipped: string[];
  title: string;
  reason: string;
}>;

/** Drive the offline game to its end with real, legal moves for BOTH seats, as the app applies them. */
/**
 * Drive the offline game to its end. The HUMAN seat is played here with real, legal moves; the
 * computer plays its own turns exactly as it does in the product (the loop only waits for them).
 * Returns why it stopped, so a failure says what actually happened.
 */
const toGameOver = async (page: Page, maxSteps = 2000): Promise<string> => {
  const read = () => page.evaluate('(() => { const h = window.__severgrow; return h.state(); })()') as Promise<State | null>;
  const idle = () => page.waitForFunction('(() => { const h = window.__severgrow; return !!h.state() && !h.busy(); })()', undefined, { timeout: 30_000 });
  let waiting = 0;
  for (let i = 0; i < maxSteps; i++) {
    const s = await read();
    if (!s) return 'no state';
    if (s.phase === 'GAME_OVER') return 'ended';
    await idle();
    const now = (await read())!;
    if (now.phase === 'GAME_OVER') return 'ended';
    if (now.actor !== 0) {
      // The computer's turn: it plays itself. Wait for it, never push it a move of our own.
      if (++waiting > 400) return `the computer never finished its turn (${now.actor}, ${now.phase})`;
      await page.waitForTimeout(80);
      continue;
    }
    waiting = 0;
    const legal = legalActions(viewFor(now, 0));
    if (!legal.length) return `no legal move for the human (${now.phase})`;
    const pick = (t: Action['t']) => legal.find((a) => a.t === t) ?? null;
    const action =
      now.phase === 'DRAW'
        ? (pick('Draw') ?? legal[0]!)
        : (pick('Bloom') ?? pick('Sprout') ?? pick('EndAct') ?? pick('Discard') ?? legal[0]!);
    const applied = await page.evaluate(
      ([a, who]) => Boolean((window as unknown as { __severgrow: { playFor: (x: unknown, p: number) => boolean } }).__severgrow.playFor(a, who)),
      [action, 0] as const,
    );
    if (!applied) return `the app refused a legal ${action.t}`;
  }
  return `still playing after ${maxSteps} steps`;
};

/** The finish card is ready when it is on screen and the app is idle. */
const waitFinish = async (page: Page) => {
  await page.waitForSelector('#gameover:not([hidden])', { timeout: 30_000 });
  await page.waitForFunction('(() => { const h = window.__severgrow; return !h.busy(); })()', undefined, { timeout: 30_000 });
  await page.waitForTimeout(450);
};

const bootScreen = async (browser: Browser, vp: { width: number; height: number }) => {
  const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1, hasTouch: vp.width < 800, isMobile: vp.width < 800 });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => {
    if (sessionStorage.getItem('finish-fit-seeded')) return;
    sessionStorage.setItem('finish-fit-seeded', '1');
    localStorage.setItem('main2:severgrow.settings.v1', JSON.stringify({ sound: false, music: false, coach: false, speed: 'skip', reduceMotion: true, autoSkip: false, confirmPolicy: 'always' }));
  });
  return { context, page, errors };
};

const report = async (mode: string, vp: string, page: Page, errors: string[]) => {
  const m = await measure(page);
  console.log(`\n--- ${mode} ${vp}: "${m.title}" · ${m.reason}`);
  console.log(`    visible: ${m.visibleParts.join(' ') || '(none)'}`);
  console.log(`    hidden : ${m.hiddenParts.join(' ') || '(none)'}`);
  console.log(`    buttons: ${m.buttons.map((b) => `${b.label}${b.id === 'go-menu' ? '(link)' : ''}`).join(' | ')}`);
  console.log(`    card overflow ${m.card?.overflow}px (${m.card?.h}px tall), screen overflow ${m.screen?.overflow}px`);
  check(`${mode} ${vp}: the finish card does not scroll`, (m.card?.overflow ?? 1) <= 0, `overflow ${m.card?.overflow}px`);
  check(`${mode} ${vp}: the screen behind it does not scroll either`, (m.screen?.overflow ?? 1) <= 0, `overflow ${m.screen?.overflow}px`);
  check(`${mode} ${vp}: the page does not widen`, !m.pageWide);
  check(`${mode} ${vp}: every visible button is inside the viewport`, m.clipped.length === 0, m.clipped.join(' | '));
  check(`${mode} ${vp}: exactly one leading (cream) button`, m.primary.length === 1, m.primary.join(' | '));
  check(`${mode} ${vp}: the outcome, the score and the reason are all legible`, !!m.title && m.visibleParts.includes('go-score') && m.visibleParts.includes('go-reason'), m.title);
  check(`${mode} ${vp}: no page errors`, errors.length === 0, errors.slice(0, 2).join(' | '));
  await page.screenshot({ path: `${OUT}finish-${mode}-${vp}.png` });
  console.log(`    shot: docs/screens/finish/finish-${mode}-${vp}.png`);
  return m;
};

// ---------------------------------------------------------------- classic + campaign (offline)
const server = await preview({ configFile: 'web/vite.config.ts', preview: { host: '127.0.0.1', port: PORT, strictPort: true }, logLevel: 'error' });
const origin = server.resolvedUrls?.local?.[0]?.replace(/\/$/, '') ?? `http://127.0.0.1:${PORT}`;
const browser = await chromium.launch({ executablePath: CHROME });
const seen: Record<string, string[]> = {};

try {
  for (const vp of VIEWPORTS) {
    // ---- classic: a plain offline game, seeded from the URL, driven to its end ----
    if (MODES.includes('classic')) {
      const { context, page, errors } = await bootScreen(browser, vp);
      await page.goto(`${origin}/?seed=219682080`);
      await page.waitForFunction('(() => { const h = window.__severgrow; return !!h.state() && !h.busy(); })()', undefined, { timeout: 40_000 });
      const ended = await toGameOver(page);
      check(`classic ${vp.key}: the game reached its end`, ended === 'ended', ended);
      await waitFinish(page);
      const m = await report('classic', vp.key, page, errors);
      seen[`classic-${vp.key}`] = m.visibleParts;
      await context.close();
    }

    // ---- campaign: the current campaign level, started from its own screen, driven to its end ----
    if (MODES.includes('campaign')) {
      const { context, page, errors } = await bootScreen(browser, vp);
      await page.goto(origin);
      await page.waitForSelector('#menu:not([hidden])', { timeout: 40_000 });
      await page.click('#menu-play');
      await page.waitForSelector('#play-menu:not([hidden])', { timeout: 10_000 });
      await page.click('#menu-campaign');
      await page.waitForSelector('#campaign:not([hidden])', { timeout: 10_000 });
      await page.click('#campaign-continue');
      await page.waitForFunction('(() => { const h = window.__severgrow; return !!h.state() && !h.busy(); })()', undefined, { timeout: 40_000 });
      const ended = await toGameOver(page);
      check(`campaign ${vp.key}: the campaign level reached its end`, ended === 'ended', ended);
      await waitFinish(page);
      const m = await report('campaign', vp.key, page, errors);
      seen[`campaign-${vp.key}`] = m.visibleParts;
      await context.close();
    }
  }
} finally {
  await browser.close().catch(() => undefined);
  await server.close().catch(() => undefined);
}

// ---------------------------------------------------------------- online (a real local duel)
if (MODES.includes('online')) {
  const duel = await startLocalDuel({ port: PORT + 1 });
  try {
    for (const vp of VIEWPORTS) {
      const match = await duel.newMatch();
      const a = await openSeat(duel, match, 0, { viewport: { width: vp.width, height: vp.height }, hasTouch: true, isMobile: true, reduceMotion: true, speed: 'skip' });
      const b = await openSeat(duel, match, 1, { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, reduceMotion: true, speed: 'skip' });
      const errors: string[] = [];
      a.page.on('pageerror', (e) => errors.push(e.message));
      await a.page.waitForFunction('(() => { const h = window.__severgrow; return !!h.state() && !h.busy(); })()', undefined, { timeout: 40_000 });
      // Keep the confirm() out of the way, then resign: a real end to a real duel.
      await a.page.evaluate('(() => { window.confirm = () => true; })()');
      await a.page.evaluate(`(() => { const x = document.getElementById('gm-resign'); if (x) x.click(); })()`);
      await waitFinish(a.page);
      check(`online ${vp.key}: the duel really ended`, (await a.page.textContent('#go-title')) !== '');
      await report('online', vp.key, a.page, errors);
      await Promise.all([a.context.close(), b.context.close()]);
    }
  } finally {
    await duel.close();
  }
}

void seen;
console.log(`\n${failed === 0 ? 'ALL PASS' : `${failed} FAILED`} — shots in docs/screens/finish/`);
process.exit(failed === 0 ? 0 : 1);
