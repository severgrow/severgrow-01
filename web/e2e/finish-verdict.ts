// THE FINISH CARD'S VERDICT (surprise brief, 2026-10-29), measured on a REAL match in a REAL browser.
//
//   CHANNEL=futa04 VITE_DUEL_API_URL=http://127.0.0.1:9/functions/v1/duel \
//     VITE_SUPABASE_URL=http://127.0.0.1:9 VITE_SUPABASE_ANON_KEY=local npm run web:build
//   PW_CHROMIUM="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" npx tsx web/e2e/finish-verdict.ts
//
// One whole match is played to its finish (the human seat driven with real legal moves, the
// computer playing itself), then the SAME finish card is measured at the three sizes the brief
// names: 320x568, 390x844 and 1280x800. At every size it asserts:
//   · the inquest line is on the card, in the game's own words, and cites a turn inside the match;
//   · the harvest stamp is on the card, and the two masses in its one-sentence alternative are the
//     REAL tile counts of the final board;
//   · neither is behind "More" (the detail list is still folded while both are on screen);
//   · the card does not scroll, the page does not widen, and there is no page error.
// Finally it takes the match's public record away (the pruned-duel case) and asserts the card shows
// NEITHER piece — and no placeholder, no empty row.
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
    page.waitForFunction('(() => { const h = window.__severgrow; return !!h.state() && !h.busy(); })()', undefined, {
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
    harvest: shown(fig),
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
  harvest: boolean;
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
  await page.waitForFunction('(() => { const h = window.__severgrow; return !!h.state() && !h.busy(); })()', undefined, {
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
  check('the inquest line is on the card', !!base.inquest);
  check('the harvest stamp is on the card', base.harvest);
  check(
    'the line speaks the game\'s own sentence shapes',
    !!base.inquest &&
      /^(Turn \d+:|A draw|The deck ran out|The turn limit)/.test(base.inquest) &&
      !/!/.test(base.inquest),
    base.inquest ?? '',
  );
  // A cited turn can never be later than the last turn played (a "turn" is a round: both players').
  const cited = base.inquest ? Number(/^Turn (\d+)/.exec(base.inquest)?.[1] ?? '0') : 0;
  check(
    'a cited turn is inside the match',
    !base.inquest?.startsWith('Turn ') || (cited > 0 && cited <= Math.ceil(base.turnNumber / 2)),
    `turn ${cited} of ${Math.ceil(base.turnNumber / 2)}`,
  );
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

  // ---------- the three sizes ----------
  for (const size of SIZES) {
    await page.setViewportSize({ width: size.width, height: size.height });
    await page.waitForTimeout(700); // the card re-renders on a resize (debounced, 80ms)
    await dismissInstall(page);
    const m = await measure(page);
    check(`${size.key}: the inquest line still renders`, !!m.inquest, m.inquest ?? '');
    check(`${size.key}: the harvest stamp still renders`, m.harvest && m.cells >= 2, `cells ${m.cells}`);
    check(`${size.key}: the card does not scroll`, (m.cardOverflow ?? 1) <= 0, `overflow ${m.cardOverflow}px`);
    check(`${size.key}: the page does not widen`, !m.pageWide);
    check(`${size.key}: the outcome, the score and the reason are still legible`, !!m.title && !!m.score && !!m.reason);
    check(`${size.key}: no page errors`, errors.length === 0, errors.slice(0, 2).join(' | '));
    await page.screenshot({ path: `${OUT}finish-inquest-${size.key}.png` });
    console.log(`    shot: docs/screens/finish/finish-inquest-${size.key}.png (card at y=${m.cardY})`);
  }

  // ---------- the pruned duel: the record is gone, so NEITHER piece may show ----------
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
  check('a pruned record: the inquest line is gone', pruned.inquest === null, String(pruned.inquest));
  check('a pruned record: the stamp is gone', !pruned.harvest);
  check('a pruned record: no empty row is left behind', !pruned.verdict);
  check('a pruned record: the result itself still shows', !!pruned.title && !!pruned.reason, pruned.title);
  check('a pruned record: no page errors', errors.length === 0, errors.slice(0, 2).join(' | '));
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}finish-inquest-pruned-1280x800.png` });
  console.log('    shot: docs/screens/finish/finish-inquest-pruned-1280x800.png');

  await context.close();
} finally {
  await browser.close().catch(() => undefined);
  await server.close().catch(() => undefined);
}

console.log(`\n${failed === 0 ? 'ALL PASS' : `${failed} FAILED`} — shots in docs/screens/finish/`);
process.exit(failed === 0 ? 0 : 1);
