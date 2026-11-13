// The social link-preview card (1200x630) AND the guard for the whole share path.
//
//   npx tsx web/e2e/og-image.ts             # rebuild web/dist, render, write web/public/og.jpg, verify
//   npx tsx web/e2e/og-image.ts --no-build  # reuse the existing web/dist
//   npx tsx web/e2e/og-image.ts --debug=DIR # also write the raw board screenshot to DIR/og-board.png
//
// WHY IT IS NOT HAND-DRAWN ANY MORE
// ---------------------------------
// The old card was an SVG drawing made by this same script, and it drifted the moment the product
// was renamed: the committed file was rendered while the title still read the old pre-rename name
// and was never regenerated (see docs/DECISIONS.md). So the picture is no longer drawn. The script
// renders the REAL game — the built `web/dist` — in Chromium at exactly 1200x630, plays a fixed,
// seeded opening so the board carries real growth, and screenshots it. It then lays the product's
// own brand marks over it: the same `futasaku-emblem.webp` / `futasaku-white.webp` the app tints
// with `--c-accent` (web/src/player/branding.ts), painted with the same alpha-mask recipe. Palette,
// type and board all come from the product, so the card cannot drift from it again.
//
// The words on the card are read from `web/index.html`'s own `og:title` / `og:description`, so the
// picture and the metadata can never disagree.
//
// The tail of this file then VERIFIES the share path it just fed (absolute og:image, real file,
// exact 1200x630, no stale branding, icons present). A failure exits non-zero.
import { mkdirSync, readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import type { Browser, Page } from 'playwright-core';
import { legalActions, viewFor } from '../../src/engine/index.js';
import type { Action, State } from '../../src/engine/index.js';
import { serveStaticDist } from './helpers/preview-port.js';
import { CHROME } from './helpers/local-duel.js';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const INDEX_HTML = resolve(REPO, 'web/index.html');
const OG_FILE = resolve(REPO, 'web/public/og.jpg');
const OG_NAME = 'og.jpg';
const DIST = resolve(REPO, process.env.OG_DIST ?? 'web/dist');
const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? null;
const DEBUG_DIR = arg('debug');
const NO_BUILD = process.argv.includes('--no-build');

/** The card size every scraper is told to expect (`og:image:width` / `og:image:height`). */
export const CARD_W = 1200;
export const CARD_H = 630;

/**
 * The fixed opening the card shows. A seed (not a random game), so the same picture is produced on
 * every run and every machine; `MOVES` so the board carries real growth — a fresh board is a nearly
 * empty lattice and reads as "nothing here yet". The pair was chosen by rendering a spread of seeds
 * and openings and comparing them (this one shows the largest, most cohesive green territory, with
 * the opponent's warm tiles pushing into the middle — legible even at a 200px preview).
 */
const SEED = Number(process.env.OG_SEED ?? 8080);
const MOVES = Number(process.env.OG_MOVES ?? 12);

/** The app's default (ink) look: the cream accent the app tints its mark with, on near-black paper. */
const PAPER = '#0e0f10';

const asset = (rel: string) => resolve(REPO, 'web/src/assets', rel);
const dataUri = (buf: Buffer, mime: string) => `data:${mime};base64,${buf.toString('base64')}`;
const distAsset = (pattern: RegExp): string => {
  const dir = resolve(DIST, 'assets');
  if (!existsSync(dir)) throw new Error(`${dir} is missing — run the build first (drop --no-build)`);
  const name = readdirSync(dir).find((n) => pattern.test(n));
  if (!name) throw new Error(`web/dist/assets has no file matching ${pattern} — rebuild the dist`);
  return resolve(dir, name);
};

// ---------- the words come from the page, never from a second copy ----------

const meta = (html: string, property: string): string => {
  const m = new RegExp(`<meta\\s+(?:property|name)="${property}"\\s+content="([^"]*)"`).exec(html);
  if (!m) throw new Error(`web/index.html has no ${property} meta tag — the share card reads its words from it`);
  return m[1]!;
};

const indexHtml = readFileSync(INDEX_HTML, 'utf8');
const TITLE = meta(indexHtml, 'og:title');
const DESCRIPTION = meta(indexHtml, 'og:description');
/** The description is one sentence per line on the card (it wraps where it reads, not where it fits). */
const TAGLINE = DESCRIPTION.split(/(?<=\.)\s+/).filter(Boolean);

// ---------- 1. render the real game ----------

const waitIdle = (page: Page) =>
  page.waitForFunction('!!(window.__severgrow && !window.__severgrow.busy())', undefined, { timeout: 30_000 });

/** One real, legal human move — the same choice every run, so the opening is reproducible. */
const humanMove = async (page: Page): Promise<boolean> => {
  const state = (await page.evaluate('window.__severgrow.state()')) as State | null;
  if (!state || state.actor !== 0 || state.phase === 'GAME_OVER') return false;
  const legal = legalActions(viewFor(state, 0));
  const pick = (t: Action['t']) => legal.find((a) => a.t === t) ?? null;
  const action =
    state.phase === 'DRAW'
      ? (pick('Draw') ?? legal[0]!)
      : (pick('Bloom') ?? pick('Sprout') ?? pick('EndAct') ?? pick('Discard') ?? legal[0]!);
  return page.evaluate((a: Action) => Boolean((window as any).__severgrow.playFor(a, 0)), action as never);
};

const buildDist = (): Promise<void> =>
  new Promise((resolveBuild, reject) => {
    const child = spawn(process.execPath, ['./node_modules/vite/bin/vite.js', 'build', '--config', 'web/vite.config.ts'], {
      env: {
        ...process.env,
        CHANNEL: process.env.CHANNEL ?? 'futa04',
        ...(process.env.VITE_DUEL_API_URL ? { VITE_DUEL_API_URL: process.env.VITE_DUEL_API_URL } : {}),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let err = '';
    child.stderr?.on('data', (b) => (err += String(b)));
    child.on('exit', (code) => (code === 0 ? resolveBuild() : reject(new Error(`web:build failed: ${err}`))));
  });

if (!NO_BUILD) await buildDist();

const { server, url: BASE } = await serveStaticDist(DIST);
const browser = await chromium.launch({ executablePath: CHROME });

let boardPng: Buffer;
let boardBox = { x: 0, y: 0, width: 1, height: 1 };
try {
  // THE PHONE GAME (owner, 2026-11-13: "keep the cockpit and hand view"): the board, the cockpit and the
  // hand as one column, captured at 3x so it stays sharp when scaled into the card.
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  await page.addInitScript(() => {
    (window as unknown as { __name: (f: unknown) => unknown }).__name = (f) => f;
    if (sessionStorage.getItem('og-card')) return;
    sessionStorage.setItem('og-card', '1');
    localStorage.clear();
    // A calm, fully-settled board: no coach, no teaching panel, no opening splash, and every
    // "seen" flag set, so nothing overlays the picture.
    localStorage.setItem(
      'severgrow.settings.v1',
      JSON.stringify({ sound: false, music: false, coach: false, speed: 'skip', reduceMotion: true, autoSkip: true, confirmPolicy: 'never', eyeCandy: false, vibration: false }),
    );
    localStorage.setItem('severgrow.seen', '1');
    localStorage.setItem('severgrow.tips.v1', JSON.stringify({ fruit: true, strengthen: true, draw: true }));
    localStorage.setItem('severgrow.ctools.seen', '1');
  });
  await page.goto(`${BASE}?seed=${SEED}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#game:not([hidden])', { timeout: 40_000 });
  await page.waitForFunction(
    '!!(window.__severgrow && window.__severgrow.state() && !window.__severgrow.busy() && document.getElementById("starter-lottery").hidden)',
    undefined,
    { timeout: 40_000 },
  );
  for (let i = 0; i < MOVES; i++) {
    const ready = await page
      .waitForFunction(
        '!!(window.__severgrow && window.__severgrow.state() && !window.__severgrow.busy() && window.__severgrow.state().actor === 0 && window.__severgrow.state().phase !== "GAME_OVER")',
        undefined,
        { timeout: 30_000 },
      )
      .then(() => true)
      .catch(() => false);
    const moved = ready && (await humanMove(page));
    if (DEBUG_DIR) console.log(`  move ${i + 1}: ready=${ready} moved=${moved}`);
    if (!moved) break;
    await page.waitForTimeout(120);
  }
  await waitIdle(page);
  // No hover chrome, no focus ring, and NO motion: parts of the board (the home heartbeat, the
  // card-art crossfade, placement particles) keep animating, so a screenshot taken while they run
  // catches them at a different phase on every run. Freeze the CSS animation, wait for the live
  // particles to drain, and only then take the picture.
  await page.addStyleTag({
    content: '.tooltip,#tooltip,.ctool-tip{display:none !important}'
      + '*,*::before,*::after{animation:none !important;transition:none !important}',
  });
  await page.evaluate('document.activeElement instanceof HTMLElement && document.activeElement.blur()');
  // Everything behind the board takes the card's own ground, so the crop has no visible rectangle.
  await page.evaluate((ground: string) => {
    const svg = document.querySelector('#board .hex-cell')?.closest('svg');
    let el: HTMLElement | null = svg?.parentElement ?? null;
    while (el) {
      el.style.setProperty('background', ground, 'important');
      el.style.setProperty('background-image', 'none', 'important');
      el.style.setProperty('box-shadow', 'none', 'important');
      el = el.parentElement;
    }
  }, PAPER);
  // The header's own chrome (menu key, small wordmark, history key) is not part of the picture, and the
  // display is held still (a scrolling message caught mid-crossfade reads as garbage in a still).
  await page.addStyleTag({ content: '#hud-menu,#hud-history,#futasaku-hud-plain,#staging-badge{visibility:hidden !important} #smart-led *{transition:none !important;animation:none !important}' });
  await page
    .waitForFunction('!!(window.__severgrow && window.__severgrow.particles().alive === 0)', undefined, { timeout: 10_000 })
    .catch(() => undefined);
  await page.waitForTimeout(900);
  // The game column: from the board's top to the hand's lowest card, across the screen.
  boardBox = (await page.evaluate(`(() => {
    const rs = [...document.querySelectorAll('#board .hex-cell, #dock, #hand .card, #hand > *')].map((c) => c.getBoundingClientRect()).filter((r) => r.width > 0 && r.height > 0);
    const x = Math.min(...rs.map((r) => r.left)), y = Math.min(...rs.map((r) => r.top));
    const r = Math.max(...rs.map((r) => r.right)), b = Math.max(...rs.map((r) => r.bottom));
    const top = Math.max(0, y - 10), bottom = Math.min(innerHeight, b + 10);
    return { x: 0, y: top, width: innerWidth, height: bottom - top };
  })()`)) as { x: number; y: number; width: number; height: number };
  boardPng = await page.screenshot({ clip: boardBox, animations: 'disabled' });
  const boardState = (await page.evaluate('window.__severgrow.state()')) as State;
  if (DEBUG_DIR) {
    mkdirSync(DEBUG_DIR, { recursive: true });
    writeFileSync(resolve(DEBUG_DIR, 'og-board.png'), boardPng);
  }
  console.log(`board: turn ${boardState.turnNumber}, phase ${boardState.phase}`);
} catch (error) {
  await browser.close().catch(() => undefined);
  server.close();
  throw error;
}
server.close();

// ---------- 2. compose the card ----------

// THE CARD (owner, 2026-11-13): the real board on the left, floating on the app's own charcoal; on the
// right the PLAIN wordmark (owner, 2026-11-13: "dont use the paint logo on banners - just plain") with the share copy under it,
// one sentence per line, in the product's monospace. Nothing else: no interface, no decoration.
const BOARD_H = 590;
const boardW = Math.round((BOARD_H * boardBox.width) / boardBox.height);
const cardHtml = `<!doctype html><html lang="en"><head><meta charset="utf-8" />
<title>${TITLE}</title>
<style>
  @font-face { font-family:'Fragment Mono'; src:url(${dataUri(readFileSync(distAsset(/fragment-mono.*\.woff2$/)), 'font/woff2')}) format('woff2'); font-weight:400; font-display:block; }
  html, body { margin:0; width:${CARD_W}px; height:${CARD_H}px; overflow:hidden; background:${PAPER}; }
  .board { position:absolute; left:${Math.round(320 - boardW / 2)}px; top:${Math.round((CARD_H - BOARD_H) / 2)}px; width:${boardW}px; height:${BOARD_H}px;
    background:url(${dataUri(boardPng, 'image/png')}) center/contain no-repeat; }
  .side { position:absolute; left:640px; width:470px; top:50%; transform:translateY(-50%); display:flex; flex-direction:column; align-items:center; gap:44px; }
  .side img { display:block; width:100%; height:auto; }
  .tag { margin:0; text-align:center; font-family:'Fragment Mono', ui-monospace, monospace; font-size:21px; line-height:1.6; letter-spacing:.005em; color:rgba(239,229,203,.74); }
  .tag span { display:block; }
</style></head><body>
  <div class="board"></div>
  <div class="side"><img src="${dataUri(readFileSync(asset('brand/plain-wordmark.svg')), 'image/svg+xml')}" alt="${TITLE}" />
  <p class="tag">${TAGLINE.map((line) => `<span>${line}</span>`).join('')}</p></div>
</body></html>`;

const renderCard = async (b: Browser): Promise<Buffer> => {
  const context = await b.newContext({ viewport: { width: CARD_W, height: CARD_H }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await page.setContent(cardHtml, { waitUntil: 'load' });
  // the embedded marks are SVG <image> elements, which `load` does not necessarily decode
  await page.evaluate('document.fonts.ready');
  await page.waitForTimeout(400);
  // A JPEG, not a PNG: the picture is photographic (a rendered board), and lossless PNG weighs
  // ~930 KB against ~200 KB at q92 — five times the bytes for every unfurl, on the phone of
  // whoever opens the shared link. Scrapers re-encode a preview to JPEG anyway.
  const jpeg = await page.screenshot({ animations: 'disabled', type: 'jpeg', quality: 92 });
  await context.close();
  return jpeg;
};

writeFileSync(OG_FILE, await renderCard(browser));
await browser.close();

// ---------- 3. verify the share path this card feeds ----------

const checks: { name: string; ok: boolean; note?: string }[] = [];
const check = (name: string, ok: boolean, note = '') => checks.push({ name, ok, note });

/**
 * The pixel size of a PNG or a JPEG, read off the file header (no image library, no decode). Both
 * are needed: the card is a JPEG while the icons it sits beside are PNGs.
 */
const imageSize = (buf: Buffer): { w: number; h: number; format: 'png' | 'jpeg' | '?' } => {
  if (buf.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20), format: 'png' };
  }
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    // walk the JPEG segments to the Start-Of-Frame, which carries the real size
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) {
        i += 1;
        continue;
      }
      const marker = buf[i + 1]!;
      const length = buf.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7), format: 'jpeg' };
      }
      i += 2 + length;
    }
  }
  return { w: 0, h: 0, format: '?' };
};

// the card itself
const card = { ...imageSize(readFileSync(OG_FILE)), bytes: readFileSync(OG_FILE).length };
check(`${OG_NAME} is a JPEG`, card.format === 'jpeg', `${card.bytes} bytes`);
check(`${OG_NAME} is exactly 1200x630`, card.w === CARD_W && card.h === CARD_H, `${card.w}x${card.h}`);

// the metadata that points at it
const ogImage = meta(indexHtml, 'og:image');
let ogImagePath = '';
try {
  ogImagePath = new URL(ogImage).pathname;
} catch {
  /* not absolute — reported below */
}
check('og:image is an ABSOLUTE url (scrapers drop relative ones)', ogImage.startsWith('https://'), ogImage);
check(`og:image points at /${OG_NAME}`, ogImagePath === `/${OG_NAME}`, ogImagePath || '(unresolvable)');
check('og:image width/height are declared as 1200/630',
  meta(indexHtml, 'og:image:width') === '1200' && meta(indexHtml, 'og:image:height') === '630',
  `${meta(indexHtml, 'og:image:width')}x${meta(indexHtml, 'og:image:height')}`);
check('og:image:type matches the real file', meta(indexHtml, 'og:image:type') === 'image/jpeg');
check('og:image:alt is declared', meta(indexHtml, 'og:image:alt').length > 0);
check('og:site_name is declared', meta(indexHtml, 'og:site_name') === TITLE);
check('og:url is absolute', meta(indexHtml, 'og:url').startsWith('https://'), meta(indexHtml, 'og:url'));
// X/Twitter reads its own tags; with only twitter:card set it can fall back to nothing useful.
check('twitter:card is summary_large_image', meta(indexHtml, 'twitter:card') === 'summary_large_image');
check('twitter:title is set', meta(indexHtml, 'twitter:title') === TITLE);
check('twitter:description is set', meta(indexHtml, 'twitter:description') === DESCRIPTION);
check('twitter:image is the same absolute url as og:image', meta(indexHtml, 'twitter:image') === ogImage, meta(indexHtml, 'twitter:image'));
check('twitter:image:alt is set', meta(indexHtml, 'twitter:image:alt').length > 0);

// no stale branding on the share/install path (the copy a scraper or a crawler reads)
// Read the VISIBLE copy only: `severor-ready` / `severgrow.*` are compatibility IDENTIFIERS the app
// and its save keys still use (AGENTS.md), not branding a person ever sees.
const visibleCopy = [
  ...[...indexHtml.matchAll(/content="([^"]*)"/g)].map((m) => m[1]!),
  indexHtml.match(/<title>([^<]*)<\/title>/)?.[1] ?? '',
].join(' | ');
check('the share copy carries no stale Severor branding', !/severor|severgrow/i.test(visibleCopy), visibleCopy.slice(0, 120));

// the icons the share/install path names must exist and be the CURRENT (futasaku) art
const iconRefs = [...indexHtml.matchAll(/<link rel="(?:icon|apple-touch-icon)"[^>]*href="\.\/([^"]+)"/g)].map((m) => m[1]!);
check('index.html names at least one icon', iconRefs.length > 0, iconRefs.join(', '));
for (const ref of iconRefs) {
  // App icons come from the icon pipeline; the browser-tab set (futasaku-tab-*, light and dark) ships
  // from web/public with the 0.83 brand pack.
  const file = [resolve(REPO, 'web/src/assets/futa04-icons', ref), resolve(REPO, 'web/public', ref)].find((f) => existsSync(f))
    ?? resolve(REPO, 'web/src/assets/futa04-icons', ref);
  // Favicon is the tree-hex (futasaku-favicon-* / futasaku-tab-*); apple-touch / PWA tiles are futasaku-icon-*.
  const current = /^(futasaku-icon-|futasaku-favicon-|futasaku-tab-)/.test(ref);
  check(`icon ${ref} exists (current futasaku art)`, existsSync(file) && current,
    existsSync(file) ? ref : `${file} is missing`);
}
const apple = indexHtml.match(/<link rel="apple-touch-icon"[^>]*href="\.\/([^"]+)"/)?.[1];
check('the apple-touch-icon is current futasaku art', !!apple && apple.startsWith('futasaku-icon-'), apple ?? '(none)');

let failed = 0;
for (const c of checks) {
  if (!c.ok) failed += 1;
  console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name}${c.note ? `  (${c.note})` : ''}`);
}
console.log(`\nwrote web/public/${OG_NAME} (${card.w}x${card.h}, ${Math.round(card.bytes / 1024)} KB)`);
if (failed) {
  console.error(`${failed} share-path check(s) failed`);
  process.exit(1);
}
