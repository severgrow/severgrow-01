// THE FINISH SCREEN MUST NEVER SCROLL (owner direction, 2026-10-16) — measured, not eyeballed.
//
//   CHANNEL=futa05 VITE_DUEL_API_URL=http://127.0.0.1:9/functions/v1/duel \
//     VITE_SUPABASE_URL=http://127.0.0.1:9 VITE_SUPABASE_ANON_KEY=local npm run web:build
//   MODES=classic npx tsx web/e2e/finish-fit.ts
//   PW_CHROMIUM=/path/to/chrome npx tsx web/e2e/finish-fit.ts
//
// THE PLANET ANATOMY NEEDS A `futa05` BUILD: `ENDGAME_PLANET = FEATURES.planet && onlineBuildEnabled()`
// (main.ts), and `FEATURES.planet` is the 0.5 line's only. A `futa04` build is the classic card, so
// the planet assertions below would be skipped — the build in this header is the one that shoots
// docs/screens/finish/endgame-planet-*.png. (The API base points at a closed port: every call in
// this suite is stubbed, and a refused connection resolves instantly.)
//
// The owner: "end of screen menu should be always in every mode way shorter and show all on one
// screen with no scrolling". One screen shared by three modes, so all three are driven here:
//
//   classic   an offline duel against the computer, alone
//   campaign  a campaign level, alone
//   online    a real duel on the local API (the match is resigned, so the finish screen is real)
//
// For each mode, at 320x568 / 360x640 / 390x844 (phones), 1280x800 / 1440x900 (desktop, which since
// the owner's 2026-11-11 review is the SAME phone card CENTRED — never a two-page spread) and
// 844x390 (landscape phone, planet beside the read-out), it asserts on the MEASUREMENT: the card
// and the screen behind it both have no overflow, every visible control is inside the viewport,
// nothing widens the page, the desktop column is a phone-measured column with equal air either
// side, and in landscape the read-out's centre sits on the planet's. It also records exactly which
// lines and buttons each mode shows, writes docs/screens/finish/*.png, and fails if the shot could
// not be taken.
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
import type { Browser, Page } from 'playwright-core';
import { preview } from 'vite';
import { legalActions, viewFor } from '../../src/engine/index.js';
import type { Action, State } from '../../src/engine/index.js';
import { CAMPAIGN_LEVELS, nextCampaignLevel } from '../../src/campaign/index.js';
import { WORLD_CELLS } from '../../server/src/world.js';
import { CAMPAIGN, RESULT } from '../../src/strings.js';
import { lessonFor } from '../src/lessons/lessons.js';
import { CHROME, openDuel, openSeat, startLocalDuel } from './helpers/local-duel.js';
import { seedSettings } from './helpers/settings-seed.js';

const OUT = new URL('../../docs/screens/finish/', import.meta.url).pathname;
const PORT = Number(process.env.PORT ?? 4301);
/** MODES=classic,campaign,online — the online part rebuilds the dist, so it can be left out. */
const MODES = (process.env.MODES ?? 'classic,campaign,online').split(',').map((s) => s.trim());
const VIEWPORTS = ([
  { key: '320x568', width: 320, height: 568 },
  { key: '360x640', width: 360, height: 640 },
  { key: '390x844', width: 390, height: 844 },
  // DESKTOP IS THE PHONE CARD, CENTRED (owner review, 2026-11-11): "on your screenshot desktop looks
  // terrible - fix - dont worry about negative space on right and left, have the whole screen in the
  // middle like on mobile". Two desktop sizes, so the same centred column is proven at both and the
  // taller one is proven to give the planet MORE room (never a second column, never a max-width spread).
  { key: '1280x800', width: 1280, height: 800 },
  { key: '1440x900', width: 1440, height: 900 },
  // A landscape phone: the planet page beside the read-out and the keys (a single centred column
  // would waste the width here), with the read-out centred above the keys.
  { key: '844x390', width: 844, height: 390 },
] as const).filter((vp) => !process.env.FIT_VIEWPORTS || process.env.FIT_VIEWPORTS.split(',').includes(vp.key));

let failed = 0;
const check = (name: string, ok: boolean, note = '') => {
  if (!ok) failed += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? `  (${note})` : ''}`);
};

mkdirSync(OUT, { recursive: true });

/** Every line and button the finish card owns, in document order (what a mode chooses to show). */
const PARTS = [
  'go-title', 'go-sub', 'go-score', 'go-reason', 'go-break', 'go-moves', 'go-highlights', 'go-stats',
  'go-rematch', 'go-result', 'go-replay', 'go-more', 'go-share', 'go-cut', 'go-menu', 'go-world',
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
  const pane = id('go-world');
  const rows = [...document.querySelectorAll('#gameover .go-key-row')].filter(shown);
  const keyBox = (el) => { const r = el.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x) }; };
  return {
    card: card ? { ...box(card), scrollH: card.scrollHeight, clientH: card.clientHeight, overflow: card.scrollHeight - card.clientHeight } : null,
    screen: screen ? { scrollH: screen.scrollHeight, clientH: screen.clientHeight, overflow: screen.scrollHeight - screen.clientHeight } : null,
    pageWide: document.documentElement.scrollWidth > window.innerWidth,
    viewport: { w: window.innerWidth, h: window.innerHeight },
    visibleParts: parts.filter((p) => shown(id(p))),
    hiddenParts: parts.filter((p) => !shown(id(p))),
    buttons: controls.map((b) => {
      const r = b.getBoundingClientRect();
      const row = b.closest('.go-key-row');
      return {
        id: b.id, label: (b.textContent || '').trim(), ...keyBox(b), inside: inside(b),
        top: Math.round(r.top), left: Math.round(r.left), right: Math.round(r.right),
        // Which ROW WRAPPER the key sits in (1 = the lead's row) and its own grid column, so the
        // suite can assert the CELL the owner asked for, not just that four keys exist.
        rowIndex: row ? [...document.querySelectorAll('#gameover .go-key-row')].indexOf(row) + 1 : 0,
        column: getComputedStyle(b).gridColumnStart,
      };
    }),
    primary: controls.filter((b) => b.classList.contains('primary')).map((b) => b.id),
    rows: rows.map((row) => [...row.querySelectorAll('.btn')].filter(shown).map((b) => b.id)),
    anatomy: screen.dataset.anatomy || 'classic',
    planet: pane && shown(pane) ? keyBox(pane) : null,
    summaryH: (() => { const s = card && card.querySelector('.go-summary'); const r = s ? s.getBoundingClientRect() : null; return r ? Math.round(r.height) : 0; })(),
    keysH: (() => { const s = document.querySelector('#gameover .go-buttons'); const r = s ? s.getBoundingClientRect() : null; return r ? Math.round(r.height) : 0; })(),
    cardDisplay: card ? getComputedStyle(card).display : '',
    cardDir: card ? getComputedStyle(card).flexDirection : '',
    cardHeight: card ? getComputedStyle(card).height : '',
    kids: card ? [...card.children].map((c) => (c.className || c.id) + ':' + Math.round(c.getBoundingClientRect().height) + ':' + getComputedStyle(c).display) : [],
    summaryFlex: (() => { const s = card && card.querySelector('.go-summary'); return s ? getComputedStyle(s).flex : ''; })(),
    canvas: !!document.querySelector('#go-world-surface > .planet-canvas'),
    worldStyle: (() => {
      if (!pane) return null;
      const s = getComputedStyle(pane);
      const c = card ? getComputedStyle(card) : null;
      return { flex: s.flex, grow: s.flexGrow, basis: s.flexBasis, h: s.height, mh: s.maxHeight, align: s.alignSelf, gap: c ? c.gap : '', justify: c ? c.justifyContent : '', cardH: c ? c.height : '' };
    })(),
    planetSnap: (() => {
      const s = (window.__goPlanetSnap && window.__goPlanetSnap()) || null;
      return s ? { zoom: +s.zoom.toFixed(2), tilePx: +s.tilePx.toFixed(1), disc: Math.round(s.disc.r), frame: s.frame } : null;
    })(),
    // THE TIER RHYTHM, measured from the four tiers the owner named: A the outcome title, B the
    // score, C the game-info line, D the planet window. Sorted by their top edge, then each
    // neighbouring pair's gap, so one number describes the rhythm on every shape.
    tierGaps: (() => {
      const tiers = [
        { at: 'A', el: id('go-title') },
        { at: 'B', el: id('go-score') },
        { at: 'C', el: id('go-note') },
        { at: 'D', el: pane },
      ].filter((t) => t.el && shown(t.el)).map((t) => ({ at: t.at, r: t.el.getBoundingClientRect() }));
      // THE RHYTHM IS A VERTICAL RELATIONSHIP (owner, 2026-11-11). A tier counts only if it sits in
      // the SAME PAGE as the outcome title: on every stacked shape (all phones AND both desktop
      // sizes since the spread was deleted) that is all four, A->B->C->D; in the landscape phone's
      // two pages the planet is the LEFT page and the window is not stacked under the words at all,
      // so the rhythm there is A->B->C. Sorting the un-related side-by-side pairs produced a
      // meaningless number (a title "gapped" from the window by -479px), which is what this anchor
      // removes: the title's column defines the page the rhythm lives in.
      const title = tiers.find((t) => t.at === 'A');
      if (!title) return { order: '', gaps: [] };
      const page = tiers.filter((t) => Math.min(title.r.right, t.r.right) - Math.max(title.r.left, t.r.left) > 1);
      const boxes = page.sort((a, b) => a.r.top - b.r.top);
      const gaps = [];
      for (let i = 1; i < boxes.length; i++) {
        gaps.push({ pair: boxes[i - 1].at + boxes[i].at, px: Math.round(boxes[i].r.top - boxes[i - 1].r.bottom) });
      }
      return { order: boxes.map((b) => b.at).join(''), gaps };
    })(),
    viewportH: window.innerHeight,
    gridRows: card ? getComputedStyle(card).gridTemplateRows : '',
    paneRect: pane ? { top: Math.round(pane.getBoundingClientRect().top), h: Math.round(pane.getBoundingClientRect().height), disp: getComputedStyle(pane).display, grid: getComputedStyle(pane).gridRowStart + '/' + getComputedStyle(pane).gridRowEnd, align: getComputedStyle(pane).alignSelf, cardAlign: card ? getComputedStyle(card).alignItems : '', pos: getComputedStyle(pane).position, contain: getComputedStyle(pane).contain, ar: getComputedStyle(pane).aspectRatio } : null,
    cardTop: card ? Math.round(card.getBoundingClientRect().top) : 0,
    titleTop: id('go-title') ? Math.round(id('go-title').getBoundingClientRect().top) : 0,
    // THE COLUMN AND THE COMPOSITION, measured from boxes (owner review, 2026-11-11).
    //   column  the card's own width and the air it leaves either side, so a WIDE screen can be
    //           proven to be the phone card CENTRED (equal margins, a phone's measure) rather than a
    //           stretched two-page spread.
    //   centre  the vertical middles of the read-out group and of the planet's window, and the
    //           signed difference between them (read-out minus planet). In landscape the two sit
    //           side by side, so this is the number that says they are optically on one band.
    column: card ? (() => { const r = card.getBoundingClientRect(); return { w: Math.round(r.width), left: Math.round(r.left), right: Math.round(window.innerWidth - r.right) }; })() : null,
    centre: (() => {
      const s = card && card.querySelector('.go-summary');
      const sr = s && shown(s) ? s.getBoundingClientRect() : null;
      const pr = pane && shown(pane) ? pane.getBoundingClientRect() : null;
      if (!sr || !pr) return null;
      const sc = sr.top + sr.height / 2, pc = pr.top + pr.height / 2;
      return { summary: Math.round(sc), planet: Math.round(pc), delta: Math.round(sc - pc) };
    })(),
    summaryRect: (() => { const s = card && card.querySelector('.go-summary'); const r = s && shown(s) ? s.getBoundingClientRect() : null; return r ? { top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height) } : null; })(),
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
  buttons: { id: string; label: string; inside: boolean; w: number; h: number; top: number; left: number; right: number; rowIndex: number; column: string }[];
  primary: string[];
  rows: string[][];
  anatomy: string;
  planet: { w: number; h: number } | null;
  summaryH: number;
  keysH: number;
  viewport: { w: number; h: number };
  cardDisplay: string;
  cardDir: string;
  cardHeight: string;
  kids: string[];
  tierGaps: { order: string; gaps: { pair: string; px: number }[] };
  viewportH: number;
  cardTop: number;
  titleTop: number;
  column: { w: number; left: number; right: number } | null;
  centre: { summary: number; planet: number; delta: number } | null;
  summaryRect: { top: number; bottom: number; h: number } | null;
  gridRows: string;
  paneRect: { top: number; h: number; disp: string; grid: string; align: string; cardAlign: string; pos: string; contain: string; ar: string } | null;
  worldStyle: { flex: string; grow: string; basis: string; h: string; mh: string; align: string; gap: string; justify: string; cardH: string } | null;
  summaryFlex: string;
  canvas: boolean;
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
  const idle = () => page.waitForFunction('(() => { const h = window.__severgrow; return !!h && !!h.state() && !h.busy(); })()', undefined, { timeout: 30_000 });
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
  // THE HERO'S FIRST FRAME. The window is the card's largest element, so acceptance shots (and the
  // measurements taken beside them) wait for it to have PAINTED, exactly as a player sees it: its
  // canvas carries `data-planet-ready` after its first real frame. A card with no planet (a lesson,
  // a locked line) simply resolves at once.
  await page.waitForSelector('#go-world-surface > .planet-canvas[data-planet-ready="true"]', { timeout: 8_000 })
    .catch(() => undefined);
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
const openingSeed = (level: (typeof CAMPAIGN_LEVELS)[number]): number => lessonFor(level.number)?.position?.seed ?? level.seed;

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
 * THE WORLD, STUBBED (owner feedback, 2026-11-11: the card's hero is THE PLANET, so the acceptance
 * shots must show a real world). The finish card reads the same public world the Planet page does;
 * without these routes the classic fixture would photograph an empty window and "prove" the hero is
 * blank. The holding is a REALISTIC one — a cluster of a returning player's tiles — because a card
 * with one tile would be a fixture, not a screen. Nothing here touches a network or an account.
 */
const FINISH_WORLD = {
  ok: true,
  world: {
    version: 1, revision: 5, cost: 100, growAnywhere: true, cells: WORLD_CELLS,
    claims: [
      '0,0', '1,0', '0,1', '-1,1', '-1,0', '2,0', '1,1', '0,2', '-2,2', '1,-1', '2,-1', '0,-1', '-1,2', '-2,3',
    ].map((cellId, index) => ({
      cellId,
      ownerId: index < 9 ? 'stub' : 'other',
      ownerName: index < 9 ? 'You' : 'WillowBirch',
      ownerTag: index < 9 ? '1001' : '1002',
      ownerLevel: index < 9 ? 22 : null,
      colour: index < 9 ? 'hsl(150 32% 52%)' : 'hsl(30 34% 49%)',
      claimedAt: Date.now() - index * 60_000,
    })),
  },
};

const stubWorld = async (page: Page): Promise<void> => {
  await page.route('**/v1/world', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FINISH_WORLD) }));
  await page.route('**/v1/world/challenges*', (r) => r.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ ok: true, incoming: [], outgoing: [], serverNow: Date.now() }),
  }));
  await page.route('**/v1/seeds/wallet', (r) => r.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ ok: true, wallet: { balance: 148, lifetimeEarned: 250, lifetimeSpent: 0, worldInvitationSeen: true } }),
  }));
  await page.route('**/v1/guests*', (r) => r.fulfill({
    status: 201, contentType: 'application/json',
    body: JSON.stringify({ ok: true, token: 'stub-token', player: { id: 'stub', kind: 'guest', displayName: 'StubGuest' }, serverNow: Date.now() }),
  }));
};

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
  // A guest's end-of-game "keep progress" dialog is a person's "Not now". It arrives 700ms after the
  // card (main.ts `offerEndOfGamePrompts`), so a fast run used to tap the leading button before it
  // opened; under load it covers the card and every retry hits it. Dismiss it like a player would.
  const notNow = page.locator('#keep-progress .keep-progress-actions button:not(.primary)');
  if (await notNow.isVisible().catch(() => false)) {
    await notNow.click({ timeout: 2_000 }).catch(() => undefined);
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
  await stubWorld(page);
  // THE WINDOW'S BEATS ARE RECORDED, NOT SAMPLED. The arrival is ~150ms on a card that takes longer
  // than that to appear, so a `getAnimations()` read taken after Playwright's round trip found the
  // beat already FINISHED — and the old check reported an empty list, which looked like "no arrival"
  // when the arrival had in fact played (owner report, 2026-11-11). Wrapping `animate()` before the
  // app boots records every beat the window creates, with its own properties and duration, whether it
  // is still running or not. Under Reduce motion the list must stay EMPTY: that is the proof that
  // nothing was created at all.
  await page.addInitScript(() => {
    const original = Element.prototype.animate;
    const log: { cls: string; props: string[]; ms: number }[] = [];
    (window as unknown as { __goAnim: typeof log }).__goAnim = log;
    Element.prototype.animate = function (this: Element, keyframes: unknown, options?: unknown) {
      const animation = original.call(this, keyframes as Keyframe[], options as KeyframeAnimationOptions);
      try {
        const inWindow = this.closest('#go-world') !== null;
        if (inWindow) {
          const frames = Array.isArray(keyframes) ? keyframes : [keyframes];
          const props = new Set<string>();
          for (const frame of frames) for (const key of Object.keys(frame as Record<string, unknown>)) props.add(key);
          log.push({
            cls: this.className,
            props: [...props],
            ms: Math.round(Number((options as KeyframeAnimationOptions | undefined)?.duration ?? 0) || 0),
          });
        }
      } catch { /* a probe must never break the page */ }
      return animation;
    } as typeof Element.prototype.animate;
  });
  return { context, page, errors };
};

const report = async (mode: string, vp: string, page: Page, errors: string[], expectLead?: string) => {
  const m = await measure(page);
  const leadLabel = m.buttons.find((b) => b.id === 'go-rematch')?.label ?? '';
  const planet = m.anatomy === 'planet';
  console.log(`\n--- ${mode} ${vp}: "${m.title}" · ${m.reason} · anatomy ${m.anatomy}`);
  console.log(`    visible: ${m.visibleParts.join(' ') || '(none)'}`);
  console.log(`    hidden : ${m.hiddenParts.join(' ') || '(none)'}`);
  console.log(`    buttons: ${m.buttons.map((b) => `${b.label} ${b.w}x${b.h}`).join(' | ')}`);
  if (planet && m.card && m.planet) {
    const share = Math.round((m.planet.h / m.card.h) * 100);
    console.log(`    MEASURED: card ${m.card.h}px · planet window ${m.planet.h}px (${share}%) · planet ${m.planet.w}px wide`);
    console.log(`    layout  : card ${m.cardDisplay}/${m.cardDir} ${m.cardHeight} · summary ${m.summaryH}px (${m.summaryFlex}) · keys ${m.keysH}px · top ${m.cardTop} -> title ${m.titleTop}`);
    console.log(`    children: ${m.kids.join(' | ')}`);
    console.log(`    world   : ${JSON.stringify(m.worldStyle)}`);
  }
  if (planet) console.log(`    rows   : ${m.rows.map((r) => r.join('+')).join(' / ')}`);
  if (planet) console.log(`    grid   : rows ${m.gridRows} · pane ${JSON.stringify(m.paneRect)}`);
  if (planet) console.log(`    tiers  : ${m.tierGaps.order} -> ${m.tierGaps.gaps.map((g) => `${g.pair}=${g.px}px`).join(' · ')}`);
  if (planet && m.column) console.log(`    column : ${m.column.w}px wide, ${m.column.left}px air left / ${m.column.right}px air right`);
  if (planet && m.centre) console.log(`    centre : read-out ${m.centre.summary}px · planet ${m.centre.planet}px · delta ${m.centre.delta}px`);
  console.log(`    card overflow ${m.card?.overflow}px (${m.card?.h}px tall), screen overflow ${m.screen?.overflow}px`);
  check(`${mode} ${vp}: the finish card does not scroll`, (m.card?.overflow ?? 1) <= 0, `overflow ${m.card?.overflow}px`);
  check(`${mode} ${vp}: the screen behind it does not scroll either`, (m.screen?.overflow ?? 1) <= 0, `overflow ${m.screen?.overflow}px`);
  check(`${mode} ${vp}: the page does not widen`, !m.pageWide);
  check(`${mode} ${vp}: every visible button is inside the viewport`, m.clipped.length === 0, m.clipped.join(' | '));
  check(`${mode} ${vp}: exactly one leading (cream) button`, m.primary.length === 1, m.primary.join(' | '));
  // On the planet card the reason lives in RESULT, one tap away; the card itself carries the title,
  // the score and the window. The classic card still shows its reason inline.
  check(
    `${mode} ${vp}: the outcome, the score and the reason are all legible`,
    !!m.title && m.visibleParts.includes('go-score')
      && (m.visibleParts.includes('go-reason') || (planet && m.visibleParts.includes('go-result'))),
    m.title,
  );
  if (planet) {
    // THE LEAD KEY IS THE RIGHT-HAND KEY OF THE FIRST ROW (owner, 2026-11-11). Visual order, measured
    // from the cells: RESULT on the left of row 1, the cream lead on the right of it, the replay and
    // the way out split across row 2. The DOM still puts the lead first, so focus order is unchanged.
    const byId = (want: string) => m.buttons.find((b) => b.id === want);
    const lead = byId('go-rematch')!;
    const result = byId('go-result');
    const replay = byId('go-replay');
    const menu = byId('go-menu');
    console.log(`    cells  : ${m.buttons.map((b) => `${b.id}@r${b.rowIndex}c${b.column}(${b.left}-${b.right})`).join(' ')}`);
    check(`${mode} ${vp}: the lead key is the RIGHT-hand key of the first row`,
      !!result && lead.rowIndex === 1 && result.rowIndex === 1 && lead.left > result.left && lead.right > result.right,
      `lead r${lead.rowIndex} ${lead.left}-${lead.right} · result ${result ? `${result.left}-${result.right}` : 'none'}`);
    check(`${mode} ${vp}: the second row is the replay and the way out`,
      !!replay && !!menu && replay.rowIndex === 2 && menu.rowIndex === 2 && replay.left < menu.left,
      `${replay?.rowIndex}/${menu?.rowIndex} ${replay?.left}-${menu?.left}`);
    // THE PLATE IS THE SCREEN (owner correction, 2026-11-11: "make sure the whole screen uses entire
    // height of the current display ... the plate is the screen, not a floating card with margins").
    // The card must reach the viewport's own height, minus only the deliberate inset (<= 16px).
    check(`${mode} ${vp}: the plate fills the screen's height`, Math.abs((m.card?.h ?? 0) - m.viewportH) <= 16,
      `card ${m.card?.h}px vs viewport ${m.viewportH}px`);
    // THE ONE RHYTHM (owner, same day): A->B->C->D, one value, within 2px of each other.
    const gaps = m.tierGaps.gaps.map((g) => g.px);
    check(`${mode} ${vp}: the header tiers are one equal rhythm`,
      gaps.length >= 2 && gaps.every((g) => g > 0) && Math.max(...gaps) - Math.min(...gaps) <= 2,
      m.tierGaps.gaps.map((g) => `${g.pair}=${g.px}`).join(' '));
    // EVERY shape but the landscape phone is ONE STACKED COLUMN, so the full rhythm the owner named
    // (A->B->C->D) is measured there. In landscape the planet sits BESIDE the read-out, so the
    // stacked rhythm is A->B->C. Since the desktop spread was deleted, the desktop sizes are stacked
    // too — they used to be the exception and must no longer be.
    const landscape = vp === '844x390';
    check(`${mode} ${vp}: ${landscape ? 'the stacked' : 'all three'} tier gaps are measured`,
      gaps.length === (landscape ? 2 : 3), m.tierGaps.gaps.map((g) => g.pair).join(','));
    check(`${mode} ${vp}: the rhythm is the declared token (12px, 10px on a short plate)`,
      gaps.every((g) => g === (vp === '320x568' || vp === '360x640' || vp === '844x390' ? 10 : 12)),
      gaps.join(','));
    // DESKTOP IS THE PHONE CARD, CENTRED (owner review, 2026-11-11). No two-page spread: the card is
    // one phone-measured column, CENTRED, with the negative space the owner explicitly accepted on
    // either side. Asserted on the boxes, not on the CSS text: a phone's measure (<= 440px), equal
    // margins either side (<= 1px), and a column — never a grid with a second page.
    if ((m.viewport?.w ?? 0) >= 760 && !landscape) {
      check(`${mode} ${vp}: the card is a phone-measured column, not a spread`,
        (m.column?.w ?? 0) <= 440, `column ${m.column?.w}px`);
      check(`${mode} ${vp}: that column is CENTRED with equal air either side`,
        Math.abs((m.column?.left ?? 0) - (m.column?.right ?? 1)) <= 1,
        `air ${m.column?.left}px left / ${m.column?.right}px right`);
      check(`${mode} ${vp}: the card is one column, never a grid`,
        m.cardDisplay === 'flex' && m.cardDir === 'column', `${m.cardDisplay}/${m.cardDir}`);
    }
    // LANDSCAPE COMPOSITION (owner correction, 2026-11-11: "you lost 0 - 25 in the centre not on
    // top"). The read-out centres in the band above the keys, and its middle sits on the planet's
    // own middle band — measured, not eyeballed (~24px of tolerance).
    if (landscape) {
      // "In the space above the keys" is measured as AIR: the gap between the card's top edge and
      // the read-out equals the gap between the read-out and the keys (a pinned-to-the-top read-out
      // leaves ~140px of dead air under it and fails here).
      const keysTop = Math.min(...m.buttons.map((b) => b.top));
      const above = (m.summaryRect?.top ?? 0) - m.cardTop;
      const below = keysTop - (m.summaryRect?.bottom ?? 0);
      check(`${mode} ${vp}: the read-out centres in the band above the keys (equal air either side)`,
        Math.abs(above - below) <= 14, `${above}px air above / ${below}px below · keys top ${keysTop}px`);
      check(`${mode} ${vp}: the read-out and the planet sit on one horizontal band`,
        Math.abs(m.centre?.delta ?? 999) <= 24, `delta ${m.centre?.delta}px (read-out ${m.centre?.summary}px, planet ${m.centre?.planet}px)`);
    }
    // THE PLANET IS THE HERO (owner, 2026-11-11): it takes the freed space on every shape, and the
    // four keys never leave an orphaned half slot.
    check(`${mode} ${vp}: the planet window is the card's hero`, (m.planet?.h ?? 1) / (m.card?.h ?? 1) >= 0.5,
      `${m.planet?.h}px of ${m.card?.h}px`);
    planetHeights[vp] = m.planet?.h ?? 0;
    check(`${mode} ${vp}: the shared planet renderer is mounted`, m.canvas);
    // Row MEMBERSHIP by rendered position (the DOM order is deliberately not the visual order).
    const row1 = m.buttons.filter((b) => b.rowIndex === 1).sort((a, b) => a.left - b.left).map((b) => b.id);
    const row2 = m.buttons.filter((b) => b.rowIndex === 2).sort((a, b) => a.left - b.left).map((b) => b.id);
    check(`${mode} ${vp}: four keys, two rows of two — RESULT | LEAD`,
      JSON.stringify([row1, row2]) === JSON.stringify([['go-result', 'go-rematch'], ['go-replay', 'go-menu']]),
      JSON.stringify([row1, row2]));
    const halves = m.buttons.filter((b) => ['go-rematch', 'go-result', 'go-replay', 'go-menu'].includes(b.id));
    const widths = new Set(halves.map((b) => b.w));
    check(`${mode} ${vp}: the four keys are equal halves`, widths.size === 1 && [...widths][0]! >= 120, [...widths].join(','));
    check(`${mode} ${vp}: every key is the one 46px height`, m.buttons.every((b) => b.h === 46), m.buttons.map((b) => `${b.id}:${b.h}`).join(' '));
  }
  if (expectLead) check(`${mode} ${vp}: the leading button reads "${expectLead}"`, leadLabel === expectLead, leadLabel);
  check(`${mode} ${vp}: no page errors`, errors.length === 0, errors.slice(0, 2).join(' | '));
  await page.screenshot({ path: `${OUT}finish-${mode}-${vp}.png` });
  console.log(`    shot: docs/screens/finish/finish-${mode}-${vp}.png`);
  if (planet) {
    await page.screenshot({ path: `${OUT}endgame-planet-${vp}.png` });
    console.log(`    shot: docs/screens/finish/endgame-planet-${vp}.png`);
    // RESULT: the dark-glass window with the final board, on its own key.
    await page.locator('#go-result').click({ timeout: 5_000 }).catch(() => undefined);
    await page.waitForSelector('#go-result-pane:not([hidden])', { timeout: 5_000 }).catch(() => undefined);
    await page.waitForTimeout(320);
    if (vp === '390x844') {
      await page.screenshot({ path: `${OUT}endgame-result-390x844.png` });
      console.log(`    shot: docs/screens/finish/endgame-result-390x844.png`);
    }
    const result = await page.evaluate(`(() => {
      const id = (x) => document.getElementById(x);
      const shown = (el) => !!el && el.getClientRects().length > 0;
      const sheet = id('go-result-sheet');
      return {
        focused: document.activeElement ? document.activeElement.id : '',
        board: shown(id('go-result-board')) && !!id('go-result-board').querySelector('svg'),
        overflow: sheet ? sheet.scrollHeight - sheet.clientHeight : null,
      };
    })()`) as { focused: string; board: boolean; overflow: number | null };
    check(`${mode} ${vp}: RESULT takes focus and shows the final board`, result.focused === 'go-result-close' && result.board, result.focused);
    await page.keyboard.press('Escape');
    await page.waitForSelector('#go-result-pane', { state: 'hidden', timeout: 5_000 }).catch(() => undefined);
    await page.waitForTimeout(200);
  }
  return m;
};

// ---------------------------------------------------------------- classic + campaign (offline)
const server = await preview({ configFile: 'web/vite.config.ts', preview: { host: '127.0.0.1', port: PORT, strictPort: true }, logLevel: 'error' });
const origin = server.resolvedUrls?.local?.[0]?.replace(/\/$/, '') ?? `http://127.0.0.1:${PORT}`;
const browser = await chromium.launch({ executablePath: CHROME });
const seen: Record<string, string[]> = {};
/** Planet window height per viewport, so the last assertion can prove it GROWS with the screen. */
const planetHeights: Record<string, number> = {};

try {
  for (const vp of VIEWPORTS) {
    // ---- classic: a plain offline game, seeded from the URL, driven to its end ----
    if (MODES.includes('classic')) {
      const { context, page, errors } = await bootScreen(browser, vp);
      await page.goto(`${origin}/?seed=219682080`);
      await page.waitForFunction('(() => { const h = window.__severgrow; return !!h && !!h.state() && !h.busy(); })()', undefined, { timeout: 40_000 });
      const ended = await toGameOver(page);
      check(`classic ${vp.key}: the game reached its end`, ended === 'ended', ended);
      // THE WINDOW'S ARRIVAL (owner motion brief, 2026-11-11): measured the instant the card shows,
      // before the finish card's own settle wait. The surface must be fading and rising (opacity +
      // translate, <= 8px), on a short beat — and nothing may animate a layout property.
      await page.waitForSelector('#gameover:not([hidden])', { timeout: 30_000 });
      // This fixture boots with Reduce motion ON, so the window's arrival is INSTANT and provable:
      // the recorder must hold NO beat for it at all (the element is simply set to its rest state).
      const arrival = await page.evaluate('(() => (window.__goAnim || []))()') as { cls: string; props: string[]; ms: number }[];
      console.log(`    window arrival (reduce motion): ${JSON.stringify(arrival)}`);
      check(`classic ${vp.key}: Reduce motion makes the window instant`, arrival.length === 0, JSON.stringify(arrival));
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
        `(() => { const h = window.__severgrow; return !!h && !!h.state() || !document.getElementById('campaign').hidden; })()`,
        undefined,
        { timeout: 20_000 },
      );
      if (await page.locator('#campaign-continue').isVisible().catch(() => false)) await page.click('#campaign-continue');
      await page.waitForFunction('(() => { const h = window.__severgrow; return !!h && !!h.state() && !h.busy(); })()', undefined, { timeout: 40_000 });
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
      // A lesson's finish card carries the LESSON's own title — since 2026-11-12 the two-line
      // `Lesson 1` over `Learned` lockup (paintGoTitle splits its last space), not the campaign
      // level's "Level 1 Complete". Reading the campaign title here made a real win look like a
      // loss of words, which silently skipped the whole next-level block below.
      const startedLesson = lessonFor(level1.number);
      const wonTitle = startedLesson ? startedLesson.finish.title : CAMPAIGN.levelWon(level1.number);
      const wonIt = (await page.textContent('#go-title')) === wonTitle;
      if (startedLesson && wonIt) {
        const lockup = await page.evaluate(() => ({
          kicker: document.querySelector('#go-title .go-kicker')?.textContent ?? '',
          outcome: document.querySelector('#go-title .go-outcome')?.textContent ?? '',
        }));
        check(
          `campaign ${vp.key}: a won lesson reads LESSON ${level1.number} over LEARNED`,
          lockup.kicker === `Lesson ${level1.number}` && lockup.outcome === 'Learned',
          JSON.stringify(lockup),
        );
      }
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
            `(() => { const h = window.__severgrow; return !!h && !!h.state() && h.state().seed === ${openingSeed(second)} && !h.busy(); })()`,
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
      // 360x640: the tightest real phone whose shots the docs carry for this reveal.
      const vp = VIEWPORTS.find((v) => v.key === '360x640') ?? VIEWPORTS[0]!;
      const { context, page, errors } = await bootScreen(browser, vp, moving);
      await page.goto(`${origin}/?seed=219682080`);
      await page.waitForFunction('(() => { const h = window.__severgrow; return !!h && !!h.state() && !h.busy(); })()', undefined, { timeout: 40_000 });
      const ended = await toGameOver(page);
      check(`seeds ${label}: the game reached its end`, ended === 'ended', ended);
      // THE MOVING CARD'S ARRIVAL (owner motion brief, 2026-11-11), measured on the live surface the
      // instant the card appears: a short opacity + translate beat, and nothing else.
      if (moving) {
        await page.waitForSelector('#gameover:not([hidden])', { timeout: 30_000 });
        // THE RECORD, NOT A SAMPLE (owner, 2026-11-11). The arrival is a ~150ms beat on a card that
        // takes longer than that to paint, so reading `getAnimations()` after the selector wait
        // found it already finished and reported [] — "no arrival" — although it had played. The
        // recorder installed in `bootScreen` keeps every beat the window creates, so this asserts
        // the beat EXISTS with the right properties and duration, whether or not it is still running.
        const created = await page.evaluate('(() => (window.__goAnim || []))()') as { cls: string; props: string[]; ms: number }[];
        const surface = created.filter((a) => a.cls.includes('go-world-surface'));
        console.log(`    window arrival (moving): ${JSON.stringify(created)}`);
        check('seeds moving: the window fades and rises in on arrival',
          surface.some((a) => a.props.includes('opacity') && a.props.includes('translate') && a.ms > 0 && a.ms <= 300),
          JSON.stringify(surface));
        const banned = ['width', 'height', 'top', 'left', 'filter', 'backdropFilter', 'boxShadow'];
        check('seeds moving: nothing animates a layout or paint property',
          created.every((a) => a.props.every((p) => !banned.includes(p))),
          JSON.stringify(created.map((a) => a.props)));
      }
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
      await a.page.waitForFunction('(() => { const h = window.__severgrow; return !!h && !!h.state() && !h.busy(); })()', undefined, { timeout: 40_000 });
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
// THE PLANET GROWS WITH THE SCREEN (owner, 2026-11-11: "on a taller phone the player gets MORE
// planet, not more padding"). Portrait phone heights are compared in the order they were measured;
// the landscape phone has its own shape, so it is held to the same >= 50% share but not to this
// order. The desktop sizes are the SAME centred column, so a taller desktop must give the planet
// MORE room too — that is what proves it is the phone card and not a fixed spread.
const portrait = ['320x568', '360x640', '390x844'].filter((k) => planetHeights[k] !== undefined);
check(
  'the planet window grows with the viewport height',
  portrait.length < 2 || portrait.every((k, i) => i === 0 || planetHeights[k]! > planetHeights[portrait[i - 1]!]!),
  portrait.map((k) => `${k}:${planetHeights[k]}px`).join(' '),
);
const desk = ['1280x800', '1440x900'].filter((k) => planetHeights[k] !== undefined);
check(
  'a taller desktop gives the centred column MORE planet',
  desk.length < 2 || planetHeights[desk[1]!]! > planetHeights[desk[0]!]!,
  desk.map((k) => `${k}:${planetHeights[k]}px`).join(' '),
);
console.log(`\n${failed === 0 ? 'ALL PASS' : `${failed} FAILED`} — shots in docs/screens/finish/`);
process.exit(failed === 0 ? 0 : 1);
