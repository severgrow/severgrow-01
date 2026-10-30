// THE FINISH CARD'S VERDICT (surprise brief, 2026-10-29), measured on a REAL match in a REAL browser.
//
//   CHANNEL=futa04 VITE_DUEL_API_URL=http://127.0.0.1:9/functions/v1/duel \
//     VITE_SUPABASE_URL=http://127.0.0.1:9 VITE_SUPABASE_ANON_KEY=local npm run web:build
//   PW_CHROMIUM="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" npx tsx web/e2e/finish-verdict.ts
//
// One whole match is played to its finish (the human seat driven with real legal moves, the
// computer playing itself), then the SAME finish card is measured at the three sizes the brief
// names: 320x568, 390x844 and 1280x800. At every size it asserts:
//   · the one-line match summary is GONE from the card (owner, 2026-10-30);
//   · the harvest stamp is on the card, and the two masses in its one-sentence alternative are the
//     REAL tile counts of the final board;
//   · the review face is gone entirely (owner, 2026-10-30), and the Territory key sits with the
//     payout and opens the Territory screen through the product's own route;
//   · neither is behind "More" (the detail list is still folded while both are on screen);
//   · the card does not scroll, the page does not widen, and there is no page error.
// Finally it takes the match's public record away (the pruned-duel case) and asserts the card drops
// the event record; the harvest stamp stays — the final board is still known (owner, 2026-10-30).
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
import type { Browser, Page } from 'playwright-core';
import { preview } from 'vite';
import { legalActions, viewFor } from '../../src/engine/index.js';
import type { Action, State } from '../../src/engine/index.js';
import { CHROME } from './helpers/local-duel.js';
import { seedSettings } from './helpers/settings-seed.js';

const OUT = new URL('../../docs/screens/finish/', import.meta.url).pathname;
const PORT = Number(process.env.PORT ?? 4307);
/** A seeded practice match: the same board every run, so a failure is reproducible. */
const SEED = Number(process.env.SEED ?? 219682080);
const SIZES = [
  { key: '320x568', width: 320, height: 568 },
  { key: '390x844', width: 390, height: 844 },
  { key: '1280x800', width: 1280, height: 800 },
] as const;

let failed = 0;
const check = (name: string, ok: boolean, note = '') => {
  if (!ok) failed += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? `  (${note})` : ''}`);
};

mkdirSync(OUT, { recursive: true });

/** The pre-game starter ritual owns the opening; wait for it to hand over before driving moves. */
const waitStarterRitual = async (page: Page): Promise<void> => {
  await page
    .waitForFunction(
      () => {
        const r = document.getElementById('starter-lottery');
        return !r || r.hidden || !r.getClientRects().length;
      },
      undefined,
      { timeout: 15_000 },
    )
    .catch(() => undefined);
};

/** Play the HUMAN seat with real legal moves; the computer plays its own turns. */
const toGameOver = async (page: Page, maxSteps = 2000): Promise<string> => {
  await waitStarterRitual(page);
  let refused = 0;
  const read = () =>
    page.evaluate('(() => { const h = window.__severgrow; return h.state(); })()') as Promise<State | null>;
  const idle = () =>
    page.waitForFunction('(() => { const h = window.__severgrow; return !!h && !!h.state() && !h.busy(); })()', undefined, {
      timeout: 30_000,
    });
  let waiting = 0;
  for (let i = 0; i < maxSteps; i++) {
    const s = await read();
    if (!s) return 'no state';
    if (s.phase === 'GAME_OVER') return 'ended';
    await idle();
    const now = (await read())!;
    if (now.phase === 'GAME_OVER') return 'ended';
    if (now.actor !== 0) {
      if (++waiting > 400) return `the computer never finished its turn (${now.actor}, ${now.phase})`;
      await page.waitForTimeout(80);
      continue;
    }
    waiting = 0;
    const legal = legalActions(viewFor(now, 0));
    if (!legal.length) return `no legal move for the human (${now.phase})`;
    const pick = (t: Action['t']) => legal.find((a) => a.t === t) ?? null;
    const natural = (now.phase === 'DRAW'
      ? [pick('Draw'), pick('EndAct'), pick('Discard')]
      : [pick('Bloom'), pick('Sprout'), pick('EndAct'), pick('Discard')]
    ).filter((a): a is Action => !!a);
    const candidates: Action[] = [...natural, ...legal.filter((a) => !natural.includes(a))];
    let applied = false;
    for (const candidate of candidates) {
      const ok = await page.evaluate(
        ([a, who]) =>
          Boolean(
            (window as unknown as { __severgrow: { playFor: (x: unknown, p: number) => boolean } }).__severgrow.playFor(
              a,
              who,
            ),
          ),
        [candidate, 0] as const,
      );
      if (ok) {
        applied = true;
        break;
      }
    }
    if (!applied) {
      if (++refused > 6) return 'the app refused every legal action';
      await page.waitForTimeout(150);
      continue;
    }
    refused = 0;
  }
  return `still playing after ${maxSteps} steps`;
};

/** The install invitation is a timed sheet that may open OVER the card; close it. */
const dismissInstall = async (page: Page): Promise<void> => {
  for (const id of ['#install-close', '#install-later']) {
    const el = page.locator(id);
    if (await el.isVisible().catch(() => false)) {
      await el.click({ timeout: 2_000 }).catch(() => undefined);
      return;
    }
  }
};

const waitFinish = async (page: Page) => {
  await page.waitForSelector('#gameover:not([hidden])', { timeout: 30_000 });
  await page.waitForFunction('(() => { const h = window.__severgrow; return !h.busy(); })()', undefined, {
    timeout: 30_000,
  });
  await page.waitForTimeout(500);
  await dismissInstall(page);
};

/**
 * What the card is showing, and what the final board really was. `tiles` is counted from the live
 * state in the page (never from the figure), so the two masses are checked against the match.
 */
const MEASURE = `(() => {
  const id = (x) => document.getElementById(x);
  const shown = (el) => !!el && el.getClientRects().length > 0;
  const card = document.querySelector('#gameover .go-card');
  const text = id('go-inquest');
  const fig = id('go-harvest');
  const svg = fig ? fig.querySelector('svg') : null;
  const state = window.__severgrow.state();
  const tiles = [0, 0];
  for (const t of Object.values(state.board)) if (t) tiles[t.owner] += 1;
  return {
    viewport: { w: innerWidth, h: innerHeight },
    cardOverflow: card ? card.scrollHeight - card.clientHeight : null,
    cardY: card ? Math.round(card.getBoundingClientRect().y) : null,
    pageWide: document.documentElement.scrollWidth > innerWidth,
    verdict: shown(id('go-verdict')),
    inquest: shown(text) ? (text.textContent || '').trim() : null,
    hasSummaryNode: !!text,
    harvest: shown(fig),
    reviewIds: ['go-review', 'go-review-face', 'go-review-show', 'go-review-back', 'go-review-kicker'].filter((x) => !!id(x)).length,
    cardReviewing: !!card && card.classList.contains('reviewing'),
    seedsShown: shown(id('go-seeds')),
    seedsText: shown(id('go-seeds')) ? (id('go-seeds').textContent || '').trim() : null,
    territoryGrow: shown(id('go-territory-grow')) ? (id('go-territory-grow').textContent || '').trim() : null,
    label: svg ? svg.getAttribute('aria-label') : null,
    cells: svg ? svg.querySelectorAll('.hv-you path, .hv-them path').length : 0,
    hasRim: svg ? svg.querySelectorAll('.hv-outline line').length > 0 : false,
    moreOpen: shown(id('go-highlights')),
    title: (id('go-title') || {}).textContent || '',
    score: (id('go-score') || {}).textContent || '',
    reason: (id('go-reason') || {}).textContent || '',
    turnNumber: state.turnNumber,
    tiles,
    resultReason: state.result ? state.result.reason : null,
    historyLength: (state.history || []).length,
    gameHidden: id('game').hidden,
    bodyClass: document.body.className,
  };
})()`;

type Measure = {
  viewport: { w: number; h: number };
  cardOverflow: number | null;
  cardY: number | null;
  pageWide: boolean;
  verdict: boolean;
  inquest: string | null;
  hasSummaryNode: boolean;
  harvest: boolean;
  reviewIds: number;
  cardReviewing: boolean;
  seedsShown: boolean;
  seedsText: string | null;
  territoryGrow: string | null;
  label: string | null;
  cells: number;
  hasRim: boolean;
  moreOpen: boolean;
  title: string;
  score: string;
  reason: string;
  turnNumber: number;
  tiles: [number, number];
  resultReason: string | null;
  historyLength: number;
  gameHidden: boolean;
  bodyClass: string;
};

const measure = (page: Page) => page.evaluate(MEASURE) as Promise<Measure>;

const server = await preview({
  configFile: 'web/vite.config.ts',
  preview: { host: '127.0.0.1', port: PORT, strictPort: true },
  logLevel: 'error',
});
const origin = server.resolvedUrls?.local?.[0]?.replace(/\/$/, '') ?? `http://127.0.0.1:${PORT}`;
const browser: Browser = await chromium.launch({ executablePath: CHROME });

try {
  const context = await browser.newContext({
    viewport: { width: SIZES[0].width, height: SIZES[0].height },
    deviceScaleFactor: 1,
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // A renderer crash is not a page error; name it, so a failed run says which happened.
  page.on('crash', () => errors.push('the page crashed'));
  browser.on('disconnected', () => errors.push('the browser disconnected'));
  // Reduce motion: the strict case, where nothing may move and the card is painted at once.
  await seedSettings(page, {
    sound: false,
    music: false,
    coach: false,
    speed: 'skip',
    reduceMotion: true,
    autoSkip: false,
    confirmPolicy: 'always',
  });

  await page.goto(`${origin}/?seed=${SEED}`);
  await page.waitForFunction('(() => { const h = window.__severgrow; return !!h && !!h.state() && !h.busy(); })()', undefined, {
    timeout: 40_000,
  });
  const ended = await toGameOver(page);
  check('the match reached its end', ended === 'ended', ended);
  await waitFinish(page);

  const base = await measure(page);
  console.log(`\n--- a real match: "${base.title}" ${base.score} · ${base.reason} (${base.resultReason})`);
  console.log(`    inquest: ${base.inquest ?? '(none)'}`);
  console.log(`    harvest: ${base.label ?? '(none)'}`);

  // ---------- the two pieces, on real data ----------
  // The owner removed the one-line match summary (2026-10-30): it must not be on the card.
  check('the one-line match summary is gone from the card', base.inquest === null && !base.hasSummaryNode, base.inquest ?? '');
  check('the harvest stamp is on the card', base.harvest);
  // The stamp's own alternative must name the REAL final masses, and the drawing must be the board.
  const labelCounts = /Your network, (\d+) tiles?\. Theirs, (\d+)\./.exec(base.label ?? '');
  check('the stamp has a one-sentence alternative naming both masses', !!labelCounts, base.label ?? '');
  check(
    'its two masses are the real final board',
    !!labelCounts && Number(labelCounts[1]) === base.tiles[0] && Number(labelCounts[2]) === base.tiles[1],
    `${labelCounts?.[1]}/${labelCounts?.[2]} vs board ${base.tiles[0]}/${base.tiles[1]}`,
  );
  check('the stamp draws the board it is cut from', base.cells >= 2 && base.hasRim, `cells ${base.cells}`);
  check('neither piece waits behind "More"', base.verdict && !base.moreOpen);
  // The owner removed the review face entirely (2026-10-30): no key, no face, no state.
  check('the review face is gone from the card', base.reviewIds === 0 && !base.cardReviewing, `ids ${base.reviewIds}`);
  // The Territory key belongs WITH the payout: present iff the Seeds line is on the card.
  check(
    'the Territory key is present with the payout and absent without it',
    (base.territoryGrow !== null) === base.seedsShown,
    `key ${base.territoryGrow ?? '(none)'} · payout ${base.seedsText ?? '(none)'}`,
  );
  if (base.territoryGrow !== null) {
    check('the Territory key reads the product sentence', base.territoryGrow === 'Grow tiles in Territory', base.territoryGrow);
  }

  // ---------- the three sizes ----------
  for (const size of SIZES) {
    await page.setViewportSize({ width: size.width, height: size.height });
    await page.waitForTimeout(700); // the card re-renders on a resize (debounced, 80ms)
    await dismissInstall(page);
    const m = await measure(page);
    check(`${size.key}: no one-line summary`, m.inquest === null, m.inquest ?? '');
    check(`${size.key}: the harvest stamp still renders`, m.harvest && m.cells >= 2, `cells ${m.cells}`);
    check(`${size.key}: the card does not scroll`, (m.cardOverflow ?? 1) <= 0, `overflow ${m.cardOverflow}px`);
    check(`${size.key}: the page does not widen`, !m.pageWide);
    check(`${size.key}: the outcome, the score and the reason are still legible`, !!m.title && !!m.score && !!m.reason);
    check(`${size.key}: no page errors`, errors.length === 0, errors.slice(0, 2).join(' | '));
    await page.screenshot({ path: `${OUT}finish-verdict-${size.key}.png` });
    console.log(`    shot: docs/screens/finish/finish-verdict-${size.key}.png (card at y=${m.cardY})`);
  }

  // ---------- the pruned duel: the record is gone, so the LINE may show nothing ----------
  // The card paints on a fresh appearance (the plate never repaints itself while it stands), so the
  // record is taken away exactly as a pruned duel would have it, and the card is put away and
  // brought back through the product's own "Board" → "Results" path.
  await page.evaluate('(() => { window.__severgrow.state().history.length = 0; })()');
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.click('#go-board');
  // `#gameover[hidden]` cannot be awaited as a VISIBLE selector: a hidden element never becomes
  // visible, so that wait could only ever time out. The question here is whether the card has gone
  // away, which is the `hidden` STATE of the element.
  await page.waitForSelector('#gameover', { state: 'hidden', timeout: 10_000 });
  const reopened = await page.evaluate(`(() => {
    const b = [...document.querySelectorAll('#moves button')].find((el) => (el.textContent || '').trim() === 'Results');
    if (!b) return false;
    b.click();
    return true;
  })()`);
  check('the result can be brought back after "Board" (the product\'s own path)', reopened === true);
  await page.waitForSelector('#gameover:not([hidden])', { timeout: 10_000 });
  await page.waitForTimeout(600);
  const pruned = await measure(page);
  console.log(`    pruned: history ${pruned.historyLength} events, verdict ${pruned.verdict}, line ${pruned.inquest ?? '(none)'}`);
  check('a pruned record: the stamp is STILL there (the final board is known)', pruned.harvest && pruned.cells >= 2, `cells ${pruned.cells}`);
  check('a pruned record: the row stays because the stamp does', pruned.verdict);
  check('a pruned record: the result itself still shows', !!pruned.title && !!pruned.reason, pruned.title);
  check('a pruned record: no page errors', errors.length === 0, errors.slice(0, 2).join(' | '));
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}finish-verdict-pruned-1280x800.png` });
  console.log('    shot: docs/screens/finish/finish-verdict-pruned-1280x800.png');

  // ---------- the Territory key, through the product's own route ----------
  // This practice card has no payout line (a plain ?seed game asks for no reward), so the key is
  // correctly absent. Give the card the award through the app's own reveal path (the same hook the
  // seeds-fit suite uses): a visible Seeds line must grow the key, on the card that is already up.
  const noPayout = await page.evaluate(`(() => !document.getElementById('go-seeds') || document.getElementById('go-seeds').hidden)()`);
  if (noPayout) {
    await page.evaluate(`(() => window.__severgrow.seedReveal(50))()`);
    await page.waitForSelector('#go-territory-grow:not([hidden])', { timeout: 10_000 });
  }
  const territory = (await page.evaluate(`(() => {
    const btn = document.getElementById('go-territory-grow');
    const seeds = document.getElementById('go-seeds');
    const shown = (el) => !!el && el.getClientRects().length > 0;
    const r = btn ? btn.getBoundingClientRect() : null;
    return { control: shown(btn), seeds: shown(seeds), label: btn ? (btn.textContent || '').trim() : null, height: r ? Math.round(r.height) : 0 };
  })()`)) as { control: boolean; seeds: boolean; label: string | null; height: number };
  check('the Territory key is on the card with the payout', (territory.control) === territory.seeds, `key ${territory.control} · payout ${territory.seeds}`);
  if (territory.control) {
    check('the Territory key is a real 44px target', territory.height >= 44, `${territory.height}px`);
    check('the Territory key reads the product sentence', territory.label === 'Grow tiles in Territory', territory.label ?? '');
    await page.click('#go-territory-grow');
    const world = await page
      .waitForSelector('#online-world-screen:not([hidden])', { timeout: 15_000 })
      .then(() => true)
      .catch(() => false);
    check('the Territory key opens the Territory screen', world);
    await page.screenshot({ path: `${OUT}finish-territory-key-world-1280x800.png` });
  } else {
    check('the Territory key opens the Territory screen', false, 'the key was not on the card to press');
  }

  await context.close();
} finally {
  await browser.close().catch(() => undefined);
  await server.close().catch(() => undefined);
}

console.log(`\n${failed === 0 ? 'ALL PASS' : `${failed} FAILED`} — shots in docs/screens/finish/`);
process.exit(failed === 0 ? 0 : 1);
