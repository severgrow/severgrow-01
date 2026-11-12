// THE CHAPTER LIST, MEASURED ON A PHONE: every chapter header renders, the numerals read in Roman
// order, and the LAST chapter's LAST tile can really be reached and tapped — not merely be in the DOM.
//
//   CHANNEL=futa05 VITE_DUEL_API_URL=http://127.0.0.1:9/functions/v1/duel \
//     VITE_SUPABASE_URL=http://127.0.0.1:9 VITE_SUPABASE_ANON_KEY=local npm run web:build
//   PW_CHROMIUM=/path/to/chrome npx tsx web/e2e/campaign-chapters.ts
//
// (Campaign is a product-channel feature; the build above is the recipe the other campaign suites
// document and the API base points at a closed port, so no suite call leaves the machine. The preview
// server picks a free port; set `PORT=` to pin one instead of killing whatever already holds it.)
//
// WHY THIS SUITE EXISTS. The list is built from `CAMPAIGN_CHAPTERS`, so the number of chapters is DATA:
// it is 7 today and becomes 10 when chapters VIII-X land. Every count here is therefore READ from the
// data (never a literal 7), and the suite checks the chapters that exist plus the numerals the source
// already maps for 8-10. The unit half (`web/tests/campaign-chapter-names.test.ts`) proves chapterName
// VIII/IX/X, which is what makes the list read correctly at 10 without waiting for the boards.
//
// The player path is the product's own: with every built level complete the PLAY menu's LEVELS entry
// opens the chapter list (`campaignEntry` → `list`), so a returning finished player is exactly who this
// drives. Nothing pokes `showScreen` directly.
//
// At 360x640 and 390x844 it asserts:
//   1. every chapter header is rendered, in chapter order;
//   2. its numeral is the one `CAMPAIGN.chapterName` gives AND the expected Roman numeral (I…X);
//   3. every chapter can be scrolled to, and the last chapter's last tile is scrolled into view and
//      TAPPED — the tap opens that level's authored board, which is what "tappable" means;
//   4. the page never widens and the list is not a scroll trap: the chapters column itself scrolls,
//      reaches its bottom, and nothing is clipped with no way to get to it.
import { chromium } from 'playwright-core';
import type { Page } from 'playwright-core';
import { CAMPAIGN_CHAPTERS, CAMPAIGN_LEVELS } from '../../src/campaign/index.js';
import { CAMPAIGN } from '../../src/strings.js';
import { seedSettings, seedSeen, SETTINGS_PREFIXES } from './helpers/settings-seed.js';
import { openMenuEntry } from './helpers/menu-nav.js';
import { servePreview } from './helpers/preview-port.js';

const CHROME = process.env.PW_CHROMIUM
  ?? '/Users/patryk/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';

const VIEWPORTS = [
  { key: '360x640', width: 360, height: 640 },
  { key: '390x844', width: 390, height: 844 },
] as const;

/** The ten Roman numerals chapterName maps. The ORACLE for the browser half: a header must read one
 *  of these, at the chapter's own position, so a wrong or repeated numeral cannot pass. */
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'] as const;

const PROGRESS_KEY = 'severgrow.campaign.progress.v3';
/** Every built level complete: that is the state in which the PLAY entry opens the chapter list. */
const COMPLETE = CAMPAIGN_LEVELS.map((level) => level.id);
const LAST_LEVEL = CAMPAIGN_LEVELS[CAMPAIGN_LEVELS.length - 1]!;
const LAST_CHAPTER = CAMPAIGN_CHAPTERS[CAMPAIGN_CHAPTERS.length - 1]!;

let checks = 0;
let failed = 0;
const check = (name: string, ok: boolean, note = '') => {
  checks += 1;
  if (!ok) failed += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? `  (${note})` : ''}`);
};

/** The install invitation can sit over the menu on a fresh profile; a player closes it. */
const dismissInstall = (page: Page) => page.evaluate(() => {
  for (const id of ['install-close', 'install-later', 'install-dismiss']) document.getElementById(id)?.click();
  const prompt = document.getElementById('install-prompt');
  if (prompt && !prompt.hidden) prompt.hidden = true;
});

const MEASURE = `(() => {
  const shown = (el) => !!el && el.getClientRects().length > 0 && el.getBoundingClientRect().height > 0;
  const chapters = [...document.querySelectorAll('#campaign-chapters .campaign-chapter')];
  const headers = chapters.map((c) => c.querySelector('.campaign-chapter-name'));
  const tiles = [...document.querySelectorAll('#campaign-chapters .campaign-tile')];
  const lastChapter = chapters[chapters.length - 1] || null;
  const lastTile = lastChapter ? [...lastChapter.querySelectorAll('.campaign-tile')].pop() || null : null;
  const scroller = document.getElementById('campaign-chapters');
  const screen = document.getElementById('campaign');
  const box = (el) => { const r = el.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right), w: Math.round(r.width), h: Math.round(r.height) }; };
  return {
    chapterCount: chapters.length,
    headerTexts: headers.map((h) => (h && h.textContent || '').trim()),
    headerShown: headers.map(shown),
    headerBoxes: headers.filter(Boolean).map(box),
    tileCount: tiles.length,
    lastTile: lastTile ? { id: lastTile.dataset.level || '', disabled: !!lastTile.disabled, box: box(lastTile) } : null,
    lastChapterTiles: lastChapter ? lastChapter.querySelectorAll('.campaign-tile').length : 0,
    lastChapterHeader: headers.length ? (headers[headers.length - 1].textContent || '').trim() : '',
    // Horizontal pressure, measured on the page and on the list itself.
    pageOverflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    listOverflowX: scroller ? scroller.scrollWidth - scroller.clientWidth : null,
    // The scroll trap: the list is taller than its column, so the COLUMN must be the scroller.
    listOverflowsY: !!scroller && scroller.scrollHeight > scroller.clientHeight + 1,
    listOverflowY: scroller ? getComputedStyle(scroller).overflowY : '',
    listBox: scroller ? { ...box(scroller), scrollTop: Math.round(scroller.scrollTop), scrollH: scroller.scrollHeight, clientH: scroller.clientHeight } : null,
    screenOverflowY: screen ? getComputedStyle(screen).overflowY : '',
    viewport: { w: window.innerWidth, h: window.innerHeight },
    scrollY: Math.round(window.scrollY),
  };
})()`;

type Measured = {
  chapterCount: number;
  headerTexts: string[];
  headerShown: boolean[];
  headerBoxes: { top: number; bottom: number; left: number; right: number; w: number; h: number }[];
  tileCount: number;
  lastTile: { id: string; disabled: boolean; box: { top: number; bottom: number; left: number; right: number; w: number; h: number } } | null;
  lastChapterTiles: number;
  lastChapterHeader: string;
  pageOverflowX: number;
  listOverflowX: number | null;
  listOverflowsY: boolean;
  listOverflowY: string;
  listBox: { top: number; bottom: number; left: number; right: number; w: number; h: number; scrollTop: number; scrollH: number; clientH: number } | null;
  screenOverflowY: string;
  viewport: { w: number; h: number };
  scrollY: number;
};

const served = await servePreview(4307, { logLevel: 'silent' });
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
const errors: string[] = [];

try {
  for (const vp of VIEWPORTS) {
    checks = 0;
    errors.length = 0; // each viewport's "no page errors" describes its own run
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 1,
      hasTouch: true,
      isMobile: true,
    });
    const page = await context.newPage();
    page.on('pageerror', (error) => errors.push(`${vp.key}: ${error.message}`));

    // A returning player who has finished every built level: the state in which the PLAY menu's
    // LEVELS entry opens the chapter list. Storage is prefixed per channel at build time, and this
    // init script runs BEFORE that wrapper, so the same record is written under every prefix a
    // product build can install and the running app finds its own (`helpers/settings-seed.ts`).
    await seedSettings(page, {
      sound: false, music: false, coach: false, speed: 'skip', reduceMotion: true, autoSkip: true, confirmPolicy: 'never',
    });
    await seedSeen(page);
    await page.addInitScript(({ prefixes, key, ids }) => {
      const record = JSON.stringify({ version: 1, unlocked: ids.length + 1, completed: ids, best: {} });
      for (const prefix of prefixes) {
        try {
          localStorage.setItem(`${prefix}${key}`, record);
        } catch {
          /* a prefix the app never reads is still written; a quota error must not hide the others */
        }
      }
    }, { prefixes: [...SETTINGS_PREFIXES], key: PROGRESS_KEY, ids: COMPLETE });

    await page.goto(served.url, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#menu:not([hidden])', { timeout: 40_000 });
    await page.waitForFunction('(() => { const h = window.__severgrow; return !!h && typeof h.ready === "function" && h.ready(); })()', undefined, { timeout: 40_000 });
    await dismissInstall(page);

    // The product path: PLAY → LEVELS (the entry the campaign shows once nothing is left to open).
    await openMenuEntry(page, 'menu-campaign');
    await page.waitForSelector('#campaign:not([hidden])', { timeout: 20_000 });
    await page.waitForSelector('#campaign-chapters .campaign-chapter', { timeout: 20_000 });
    await page.waitForFunction(
      (want: number) => document.querySelectorAll('#campaign-chapters .campaign-chapter').length === want,
      CAMPAIGN_CHAPTERS.length,
      { timeout: 20_000 },
    );
    await page.waitForTimeout(250); // the list's own paint settles before it is measured

    const m = (await page.evaluate(MEASURE)) as Measured;

    // 1. EVERY CHAPTER HEADER RENDERS — the count is the DATA's, never a literal.
    console.log(`\n--- ${vp.key}: ${m.chapterCount} chapters, ${m.tileCount} tiles; headers ${JSON.stringify(m.headerTexts)}`);
    check(`${vp.key}: every chapter in CAMPAIGN_CHAPTERS has a header`, m.chapterCount === CAMPAIGN_CHAPTERS.length,
      `${m.chapterCount} rendered, ${CAMPAIGN_CHAPTERS.length} in the data`);
    check(`${vp.key}: every chapter header is really rendered`, m.headerShown.every(Boolean),
      m.headerShown.map((ok, i) => (ok ? '' : `chapter ${i + 1}`)).filter(Boolean).join(' '));
    check(`${vp.key}: the list carries every built level`, m.tileCount === CAMPAIGN_LEVELS.length,
      `${m.tileCount} tiles, ${CAMPAIGN_LEVELS.length} levels`);
    check(`${vp.key}: the last chapter carries its own levels`, m.lastChapterTiles === LAST_CHAPTER.levels.length,
      `${m.lastChapterTiles} tiles, chapter has ${LAST_CHAPTER.levels.length}`);

    // 2. THE NUMERALS ARE THE SOURCE'S AND THE ROMAN ORDER I…X.
    const expected = CAMPAIGN_CHAPTERS.map((chapter) => CAMPAIGN.chapterName(chapter.number));
    check(`${vp.key}: every header reads CAMPAIGN.chapterName for its chapter`,
      JSON.stringify(m.headerTexts) === JSON.stringify(expected), JSON.stringify(m.headerTexts));
    const romanOk = m.headerTexts.every((text, i) => text === `Chapter ${ROMAN[i]}`);
    check(`${vp.key}: the numerals run in order from I (the list reads to X when ten exist)`, romanOk,
      m.headerTexts.join(' '));
    check(`${vp.key}: the last chapter's numeral is the one its number maps to`,
      m.lastChapterHeader === CAMPAIGN.chapterName(LAST_CHAPTER.number), m.lastChapterHeader);

    // 3. REACHABILITY, THEN A REAL TAP ON THE LAST CHAPTER'S LAST TILE.
    // Every chapter head must be reachable by scrolling the list — not just the last one.
    const unreachable: string[] = [];
    for (let i = 0; i < CAMPAIGN_CHAPTERS.length; i++) {
      const reachable = await page.evaluate((index: number) => {
        const chapters = document.getElementById('campaign-chapters')!;
        const head = chapters.querySelectorAll('.campaign-chapter')[index]?.querySelector('.campaign-chapter-head');
        if (!head) return false;
        head.scrollIntoView({ block: 'nearest' });
        const r = head.getBoundingClientRect();
        const c = chapters.getBoundingClientRect();
        return r.top >= c.top - 1 && r.bottom <= c.bottom + 1 && r.left >= -1 && r.right <= window.innerWidth + 1;
      }, i);
      if (!reachable) unreachable.push(`chapter ${i + 1}`);
    }
    check(`${vp.key}: every chapter can be scrolled to`, unreachable.length === 0, unreachable.join(', '));

    // The last chapter's last tile: scroll the list to its true bottom, then read the tile's box
    // against the VISIBLE column. A tile below the fold, or inside a clipped overflow, fails here.
    const bottom = await page.evaluate((lastChapterIndex: number) => {
      const chapters = document.getElementById('campaign-chapters')!;
      const chapter = chapters.querySelectorAll('.campaign-chapter')[lastChapterIndex];
      const tile = chapter ? [...chapter.querySelectorAll('.campaign-tile')].pop() || null : null;
      if (!tile) return { found: false };
      chapters.scrollTop = chapters.scrollHeight;
      const r = tile.getBoundingClientRect();
      const c = chapters.getBoundingClientRect();
      // What a finger would actually hit at the tile's centre (the tile or one of its children).
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return {
        found: true,
        id: (tile as HTMLElement).dataset.level || '',
        disabled: (tile as HTMLButtonElement).disabled,
        inColumn: r.top >= c.top - 1 && r.bottom <= c.bottom + 1,
        inViewport: r.top >= -1 && r.bottom <= window.innerHeight + 1 && r.left >= -1 && r.right <= window.innerWidth + 1,
        hitIsTile: !!hit && (hit === tile || tile.contains(hit)),
        atBottom: chapters.scrollTop + chapters.clientHeight >= chapters.scrollHeight - 1,
        scrollTop: Math.round(chapters.scrollTop),
      };
    }, CAMPAIGN_CHAPTERS.length - 1);
    check(`${vp.key}: the last chapter's last tile is the last level`, bottom.found && bottom.id === LAST_LEVEL.id,
      `${bottom.id || '(none)'} vs ${LAST_LEVEL.id}`);
    check(`${vp.key}: the list really scrolls to its bottom`, !!bottom.atBottom, `scrollTop ${bottom.scrollTop}`);
    check(`${vp.key}: the last tile is scrolled into the visible column`, !!bottom.inColumn);
    check(`${vp.key}: the last tile is inside the viewport`, !!bottom.inViewport);
    check(`${vp.key}: nothing covers the last tile where a finger lands`, !!bottom.hitIsTile);
    check(`${vp.key}: the last tile is enabled, not a locked plate`, bottom.found && bottom.disabled === false);

    // TAP IT. Playwright's tap requires the tile to be visible, stable, enabled and to receive the
    // event; the app then starts the level — the authored board is the proof it opened THAT level.
    const tile = page.locator(`#campaign-chapters .campaign-chapter:nth-child(${CAMPAIGN_CHAPTERS.length}) .campaign-tile`).last();
    let tapped = false;
    try {
      await tile.tap({ timeout: 10_000 });
      tapped = true;
    } catch (error) {
      console.log(`    tap refused: ${String(error).split('\n')[0]}`);
    }
    check(`${vp.key}: the last tile accepts a real tap`, tapped);
    // The tap's hand-off is asynchronous (startGame → the opening state), so wait for the list to
    // leave and the match to exist instead of sampling the frame right after the event.
    const entered = await page.waitForFunction(() => {
      const h = (window as any).__severgrow;
      return !!h && !!h.state && !!h.state() && !!document.getElementById('campaign')?.hidden;
    }, undefined, { timeout: 20_000 }).then(() => true).catch(() => false);
    const opened = await page.evaluate(() => {
      const h = (window as any).__severgrow;
      const s = h?.state?.();
      return {
        campaignHidden: !!document.getElementById('campaign')?.hidden,
        hasState: !!s,
        rocks: s?.config?.board?.rock?.length ?? null,
        cells: s?.config?.board?.cells?.length ?? null,
      };
    }).catch(() => ({ campaignHidden: false, hasState: false, rocks: null, cells: null }));
    check(`${vp.key}: the tap leaves the list and opens the level`, entered && opened.campaignHidden && opened.hasState);
    check(`${vp.key}: the opened match is the last level's authored board`,
      opened.rocks === LAST_LEVEL.config.board!.rock.length && opened.cells === LAST_LEVEL.config.board!.cells.length,
      `rocks ${opened.rocks}/${LAST_LEVEL.config.board!.rock.length}, cells ${opened.cells}/${LAST_LEVEL.config.board!.cells.length}`);

    // 4. NO HORIZONTAL OVERFLOW / NO SCROLL TRAP, measured back on the list.
    // (The tap left the list and opened a board, so this reads the page as it now stands — the board
    // must not widen either — and then the list's own numbers from the measurement above.)
    const wide = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check(`${vp.key}: the page never widens sideways`, m.pageOverflowX <= 1 && wide <= 1, `list ${m.pageOverflowX}px, board ${wide}px`);
    check(`${vp.key}: the chapter list itself does not widen`, (m.listOverflowX ?? 0) <= 1, `${m.listOverflowX}px`);
    check(`${vp.key}: a taller-than-screen list makes its column the scroller, not the page`,
      !m.listOverflowsY || m.listOverflowY === 'auto' || m.listOverflowY === 'scroll', m.listOverflowY);
    check(`${vp.key}: nothing is clipped behind a non-scrolling screen`,
      !m.listOverflowsY || (m.listBox?.scrollH ?? 0) > (m.listBox?.clientH ?? 0));
    check(`${vp.key}: no page errors`, errors.length === 0, errors.slice(0, 2).join(' | '));

    console.log(`    ${vp.key}: ${checks} checks`);
    await context.close();
  }
} finally {
  await browser.close().catch(() => undefined);
  await served.server.close().catch(() => undefined);
}

console.log(`\n${failed === 0 ? 'ALL PASS' : `${failed} FAILED`} — ${checks} checks in the last viewport`);
process.exit(failed === 0 ? 0 : 1);
