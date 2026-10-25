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
import { CAMPAIGN_LEVELS, nextCampaignLevel } from '../../src/campaign/index.js';
import { CAMPAIGN, RESULT } from '../../src/strings.js';
import { lessonFor } from '../src/lessons/lessons.js';
import { CHROME, openDuel, openSeat, startLocalDuel } from './helpers/local-duel.js';
import { seedSettings } from './helpers/settings-seed.js';

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
/**
 * The pre-game starter ritual (2026-10-23) is an `aria-modal` surface that owns the opening of a
 * match and deliberately swallows taps. The board is not wrong when the driver is refused during
 * it; the ritual simply has the floor. Wait for it to hand over before driving real moves.
 */
const waitStarterRitual = async (page: Page): Promise<void> => {
  await page.waitForFunction(() => {
    const r = document.getElementById('starter-lottery');
    return !r || r.hidden || !r.getClientRects().length;
  }, undefined, { timeout: 15_000 }).catch(() => undefined);
};

const toGameOver = async (page: Page, maxSteps = 2000): Promise<string> => {
  await waitStarterRitual(page);
  let refused = 0;
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
    // The app has the final say on WHICH legal action it accepts. A guided lesson (levels 1-10) only
    // lets the player take the step it is teaching, so an action the ENGINE calls legal can still be
    // refused at the app's own door (the 2026-10-23 lesson gate). Try the natural order first, then
    // the rest of the engine's list; fail only if the app refuses EVERY legal action, persistently.
    const natural = (now.phase === 'DRAW'
      ? [pick('Draw'), pick('EndAct'), pick('Discard')]
      : [pick('Bloom'), pick('Sprout'), pick('EndAct'), pick('Discard')])
      .filter((a): a is Action => !!a);
    const candidates: Action[] = [...natural, ...legal.filter((a) => !natural.includes(a))];
    let action: Action = candidates[0]!;
    let applied = false;
    for (const candidate of candidates) {
      action = candidate;
      const ok = await page.evaluate(
        ([a, who]) => Boolean((window as unknown as { __severgrow: { playFor: (x: unknown, p: number) => boolean } }).__severgrow.playFor(a, who)),
        [candidate, 0] as const,
      );
      if (ok) { applied = true; break; }
    }
    if (!applied) {
      // A transient refusal (a surface still handing over) is not a product failure; a PERSISTENT
      // refusal of every legal action is. Give it a few beats, then fail loudly.
      if (++refused > 6) return `the app refused every legal action (last ${action.t}, ${now.phase})`;
      await page.waitForTimeout(150);
      continue;
    }
    refused = 0;
  }
  return `still playing after ${maxSteps} steps`;
};

/** The seed of the match on screen (the campaign's own level identity). */
/** The finish card is ready when it is on screen and the app is idle. */
const waitFinish = async (page: Page) => {
  await page.waitForSelector('#gameover:not([hidden])', { timeout: 30_000 });
  await page.waitForFunction('(() => { const h = window.__severgrow; return !h.busy(); })()', undefined, { timeout: 30_000 });
  await page.waitForTimeout(450);
  await dismissInstall(page);
};

const stateSeed = (page: Page): Promise<number | null> =>
  page.evaluate('(() => { const h = window.__severgrow; const s = h && h.state(); return s ? s.seed : null; })()') as Promise<number | null>;

/**
 * The seed a campaign level REALLY opens on — read from the same data the app reads, never a literal.
 *
 * Levels 1-10 are the lessons since 2026-10-22: a lesson opens from its AUTHORED position
 * (`lessonOpening` → `authoredState`), and that position's own seed is the match seed. So
 * `CAMPAIGN_LEVELS[0].seed` (95001) is no longer what the board carries for level 1 — it is 96001,
 * the lesson's seed. Asserting the old number was not a product failure; it asserted a fact that
 * had stopped being true. `level.seed` still applies to every level without a lesson (11+).
 */
const openingSeed = (level: (typeof CAMPAIGN_LEVELS)[number]): number => lessonFor(level.number)?.position.seed ?? level.seed;

/** The reward line as the player sees it: '' when there is no line at all (which is the answer for
 *  a game that paid nothing — absence, never a zero). */
const seedLine = (page: Page): Promise<string> =>
  page.evaluate('(() => { const el = document.getElementById("go-seeds"); return el && el.getClientRects().length ? (el.textContent || "").trim() : ""; })()') as Promise<string>;

/**
 * The Seeds reveal's own measurement, taken on the real card. `animations` is what proves the two
 * settings differ: the count-up has beats running, the reduced form has NONE (and never will — no
 * rAF loop, nothing left behind).
 */
const MEASURE_SEEDS = `(() => {
  const host = document.getElementById('go-seeds');
  const card = document.querySelector('#gameover .go-card');
  const screen = document.getElementById('gameover');
  const row = host && host.querySelector('.seed-gain');
  const num = row && row.querySelector('.seed-gain-num');
  const label = host && host.querySelector('.sr-only');
  const shown = (el) => !!el && el.getClientRects().length > 0;
  const r = row ? row.getBoundingClientRect() : null;
  return {
    shown: shown(row),
    number: num ? (num.textContent || '') : null,
    label: label ? (label.textContent || '').trim() : null,
    lines: host && shown(host) ? Math.round(host.getBoundingClientRect().height) : 0,
    rowHeight: r ? Math.round(r.height) : null,
    animations: row ? row.getAnimations({ subtree: true }).length : 0,
    inside: !!r && r.top >= -1 && r.bottom <= window.innerHeight + 1 && r.left >= -1 && r.right <= window.innerWidth + 1,
    cardOverflow: card ? card.scrollHeight - card.clientHeight : null,
    screenOverflow: screen ? screen.scrollHeight - screen.clientHeight : null,
  };
})()`;

type SeedMeasure = {
  shown: boolean; number: string | null; label: string | null; lines: number;
  rowHeight: number | null; animations: number; inside: boolean;
  cardOverflow: number | null; screenOverflow: number | null;
};

const seedMeasure = (page: Page) => page.evaluate(MEASURE_SEEDS) as Promise<SeedMeasure>;

/**
 * Dismiss the install invitation if it is on screen. It is a timed sheet that may open OVER the
 * finish card (by design — it counts the games this device has played), and it takes pointer events
 * while it is up. A player closes it; so does this, with the sheet's own control.
 */
const dismissInstall = async (page: Page): Promise<void> => {
  for (const id of ['#install-close', '#install-later']) {
    const el = page.locator(id);
    if (await el.isVisible().catch(() => false)) {
      await el.click({ timeout: 2_000 }).catch(() => undefined);
      return;
    }
  }
};

/** Click a control, dismissing the install sheet whenever it gets in the way (never force-clicked). */
const clickThrough = async (page: Page, selector: string, tries = 30): Promise<boolean> => {
  for (let i = 0; i < tries; i++) {
    await dismissInstall(page);
    const ok = await page.locator(selector).click({ timeout: 1_500 }).then(() => true).catch(() => false);
    if (ok) return true;
  }
  return false;
};

/**
 * A phone with the finish card's own settings. Reduce motion / Speed off is the default (the strict
 * case: it is the setting where nothing may move), and ONE caller asks for the moving version so the
 * Seeds reveal's count-up can be watched here too.
 *
 * The settings are seeded under EVERY channel prefix (helpers/settings-seed.ts), not under
 * `main2:` alone: the prefix is baked in at build time, so a fixture that names one channel
 * silently loses its Reduce motion on any other build — and this suite's "seeds static" case then
 * measured a count-up ("+0", 3 animations) that only looked like a product bug (2026-10-22).
 */
const bootScreen = async (browser: Browser, vp: { width: number; height: number }, moving = false) => {
  const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1, hasTouch: vp.width < 800, isMobile: vp.width < 800 });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await seedSettings(page, { sound: false, music: false, coach: false, speed: moving ? 'normal' : 'skip', reduceMotion: !moving, autoSkip: false, confirmPolicy: 'always' });
  return { context, page, errors };
};

const report = async (mode: string, vp: string, page: Page, errors: string[], expectLead?: string) => {
  const m = await measure(page);
  const leadLabel = m.buttons.find((b) => b.id === 'go-rematch')?.label ?? '';
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
  if (expectLead) check(`${mode} ${vp}: the leading button reads "${expectLead}"`, leadLabel === expectLead, leadLabel);
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
      // A plain offline game keeps its own two words: "Play again" on a win, "Try again" on a loss.
      const classicWon = (await page.textContent('#go-title')) === RESULT.won;
      const m = await report('classic', vp.key, page, errors, classicWon ? 'Play again' : 'Try again');
      check(`classic ${vp.key}: a plain offline game never offers a next level`, !m.buttons.some((b) => b.label === 'Next level'));
      // A plain offline game pays nothing, and nothing is exactly what it must show: no line, no
      // zero, no empty row waiting for a number (the reward line lives on the online build).
      check(`classic ${vp.key}: the reward line is absent, not a zero`, (await seedLine(page)) === '', await seedLine(page));
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
      // The campaign's one entry point hands STRAIGHT into the current level (there is no level list
      // to pick from any more), so this waits for whichever comes up: the screen if the list ever
      // returns, the board today. Waiting only on the screen made this block time out.
      await page.waitForFunction(
        `(() => { const h = window.__severgrow; return !!h.state() || !document.getElementById('campaign').hidden; })()`,
        undefined,
        { timeout: 20_000 },
      );
      if (await page.locator('#campaign-continue').isVisible().catch(() => false)) await page.click('#campaign-continue');
      await page.waitForFunction('(() => { const h = window.__severgrow; return !!h.state() && !h.busy(); })()', undefined, { timeout: 40_000 });
      // The campaign's own leading button IS the campaign entry point the tutorial now uses, so this
      // also proves the handoff lands in a REAL level: a fresh profile opens level 1 — on the seed
      // that level actually deals, which for a lesson is the lesson's own authored seed (96001).
      const level1 = CAMPAIGN_LEVELS[0]!;
      const opened = (await stateSeed(page)) ?? 0;
      check(
        `campaign ${vp.key}: a fresh profile opens campaign level ${level1.number}`,
        opened === openingSeed(level1),
        `seed ${opened}, expected ${openingSeed(level1)}`,
      );
      const ended = await toGameOver(page);
      check(`campaign ${vp.key}: the campaign level reached its end`, ended === 'ended', ended);
      await waitFinish(page);
      // A lesson's finish card carries the LESSON's own title (W.youWin, "YOU WIN"), not the campaign
      // level's "Level 1 complete" (main.ts `presentResult` paints the taught lesson's title). Reading
      // the campaign title here made a real win look like a loss of words, which silently skipped the
      // whole next-level block below — the check existed but never ran.
      const startedLesson = lessonFor(level1.number);
      const wonTitle = startedLesson ? startedLesson.finish.title : CAMPAIGN.levelWon(level1.number);
      const wonIt = (await page.textContent('#go-title')) === wonTitle;
      const m = await report('campaign', vp.key, page, errors, wonIt ? CAMPAIGN.nextLevel : undefined);
      // A campaign win can pay Seeds, but the number is verified after the card is up and it is not
      // always earned. Whatever the build: the line is either absent or the game's own calm sentence
      // — never a bare number, and never a zero (a zero is not a state the player is shown).
      const line = await seedLine(page);
      check(`campaign ${vp.key}: the reward line is a notice or absent, never a zero`, line === '' || !/^[+\d]/.test(line), line);
      seen[`campaign-${vp.key}`] = m.visibleParts;
      // A WON level leads with the next one, and tapping it really opens that level — the whole point
      // of the owner's rule: no walk back to the level list to pick it.
      if (wonIt) {
        const second = nextCampaignLevel(CAMPAIGN_LEVELS[0]!.number);
        check(`campaign ${vp.key}: a won level offers a next level at all`, !!second);
        if (second) {
          const led = await clickThrough(page, '#go-rematch');
          check(`campaign ${vp.key}: the leading button is tappable`, led);
          // Level 2 is a lesson too, so it deals ITS authored seed (96002), not its campaign seed.
          await page.waitForFunction(
            `(() => { const h = window.__severgrow; return !!h.state() && h.state().seed === ${openingSeed(second)} && !h.busy(); })()`,
            undefined,
            { timeout: 40_000 },
          );
          const nowSeed = (await stateSeed(page)) ?? 0;
          check(
            `campaign ${vp.key}: the leading button opens the NEXT level`,
            nowSeed === openingSeed(second),
            `level ${second.number} seed ${nowSeed}, expected ${openingSeed(second)}`,
          );
          await page.screenshot({ path: `${OUT}finish-campaign-next-level-${vp.key}.png` });
        }
      }
      await context.close();
    }
  }

  // ---- EARNING SEEDS: the reward line, on the same card, in both motion settings ----
  //
  // The reward is painted into the card's own `#go-seeds` line (the same slot the old muted sentence
  // used), so the only honest way to prove it cannot break the one-screen rule is to measure it
  // here. `moving` is the setting the count-up may play in; `static` is Reduce motion, where the
  // line must be the finished line at once, with NO animation running at all.
  if (MODES.includes('classic')) {
    for (const moving of [true, false]) {
      const label = moving ? 'moving' : 'static';
      const vp = VIEWPORTS[0]!; // 360x640: the tightest real phone, the one the rule is about
      const { context, page, errors } = await bootScreen(browser, vp, moving);
      await page.goto(`${origin}/?seed=219682080`);
      await page.waitForFunction('(() => { const h = window.__severgrow; return !!h.state() && !h.busy(); })()', undefined, { timeout: 40_000 });
      const ended = await toGameOver(page);
      check(`seeds ${label}: the game reached its end`, ended === 'ended', ended);
      await waitFinish(page);
      check(`seeds ${label}: nothing is on the reward line before a reward lands`, (await seedLine(page)) === '');
      // Exactly the paint path a win takes, so this measures the real thing, not a copy of it.
      await page.evaluate('(() => { window.__severgrow.seedReveal(50); })()');
      const first = await seedMeasure(page);
      check(`seeds ${label}: the award's line is on screen`, first.shown, JSON.stringify(first));
      // The owner (2026-10-25) asked for a bigger number in the game's numeral face: the row is now
      // ~1.65rem tall, not the 0.95rem body size, so the ceiling moves with the design. The real
      // one-screen rule is the 0 px overflow checks below, which are unchanged.
      check(`seeds ${label}: the emblem and the amount are one line, never a block`, first.rowHeight !== null && first.rowHeight <= 34 && first.lines <= 34, `row ${first.rowHeight}px, host ${first.lines}px`);
      check(`seeds ${label}: the line is inside the viewport`, first.inside);
      check(`seeds ${label}: the reader is told the plain sentence, "+50 Seeds"`, first.label === '+50 Seeds', String(first.label));
      check(`seeds ${label}: the card still does not scroll`, (first.cardOverflow ?? 1) <= 0, `overflow ${first.cardOverflow}px`);
      check(`seeds ${label}: the screen behind it still does not scroll`, (first.screenOverflow ?? 1) <= 0, `overflow ${first.screenOverflow}px`);
      if (moving) {
        check(`seeds moving: the number starts at zero and is counting`, first.number === '+0', String(first.number));
        check(`seeds moving: the moment is actually running`, first.animations >= 3, `${first.animations}`);
      } else {
        check(`seeds static: Reduce motion shows the finished number at once`, first.number === '+50', String(first.number));
        check(`seeds static: nothing is left animating (no loop, nothing to clean up)`, first.animations === 0, `${first.animations}`);
      }
      // The moment is ~0.95 s end to end (the count lands at ~0.74 s, the emblem's settle and the
      // number's landing run a little past it), so this covers it with room to spare.
      await page.waitForTimeout(1_100); // the count and its settle are over well inside this
      const settled = await seedMeasure(page);
      check(`seeds ${label}: it lands exactly on the amount`, settled.number === '+50', String(settled.number));
      check(`seeds ${label}: nothing is still running once it lands`, settled.animations === 0, `${settled.animations}`);
      check(`seeds ${label}: still no scrolling after it settles`, (settled.cardOverflow ?? 1) <= 0 && (settled.screenOverflow ?? 1) <= 0, `card ${settled.cardOverflow}px / screen ${settled.screenOverflow}px`);
      check(`seeds ${label}: no page errors`, errors.length === 0, errors.slice(0, 2).join(' | '));
      await page.screenshot({ path: `${OUT}seed-reveal-${label}-360x640.png` });
      console.log(`    shot: docs/screens/finish/seed-reveal-${label}-360x640.png`);
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
      const errors: string[] = [];
      a.page.on('pageerror', (e) => errors.push(e.message));
      // The lobby list resumes the running match; the board (and the duel HUD) come up from there.
      await openDuel(a, match.matchId);
      await a.page.waitForFunction('(() => { const h = window.__severgrow; return !!h.state() && !h.busy(); })()', undefined, { timeout: 40_000 });
      // Keep the confirm() out of the way, then resign: a real end to a real duel.
      await a.page.evaluate('(() => { window.confirm = () => true; })()');
      await a.page.evaluate(`(() => { const x = document.getElementById('gm-resign'); if (x) x.click(); })()`);
      await waitFinish(a.page);
      check(`online ${vp.key}: the duel really ended`, (await a.page.textContent('#go-title')) !== '');
      await report('online', vp.key, a.page, errors);
      await a.context.close();
    }
  } finally {
    await duel.close();
  }
}

// NOTE: the tutorial's own hand-off (finishing the guided run opens a campaign level) is NOT driven
// here. The guided run's last chapter is a "look and tap" chapter whose steps did not advance under a
// generic tap driver (60 steps, still in the chapter), and driving all 13 chapters is a suite of its
// own (`web/e2e/futa04-tutorial-*.ts`). The hand-off itself is pinned at the source by
// `web/tests/finish-card.test.ts`, and the entry point it calls IS proven here: the campaign block
// above opens campaign level 1 (its lesson seed, 96001) from the campaign's own leading button,
// which is the very button `enterCampaign()` backs.

void seen;
console.log(`\n${failed === 0 ? 'ALL PASS' : `${failed} FAILED`} — shots in docs/screens/finish/`);
process.exit(failed === 0 ? 0 : 1);
