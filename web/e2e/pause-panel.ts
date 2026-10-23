// THE PAUSE PANEL — measured, not eyeballed (owner direction, 2026-10-20).
//
//   CHANNEL=futa05 npm run web:build && npx tsx web/e2e/pause-panel.ts
//   SHOTS=docs/screens/pause-audit npx tsx web/e2e/pause-panel.ts
//
// The panel is one machine face: an engraved nameplate (lamp, title, close), an instrument read-out
// (both scores mirrored across the panel's centre line, the turn under them), the lead key
// (Back to the game), the quiet action column, and the corner plate (mode word left, SETTINGS key
// right). This suite pins the promises the owner made about it:
//   - ONE content axis: every control shares the same left and right edge, and the title sits on the
//     panel's centre line (the scores are mirrored about it);
//   - ONE height per family: every row in the action column is the same height, and every control is
//     at least 44px tall;
//   - NOTHING scrolls: at 320x568, 360x640, 390x844, 844x390 and with Large text on, every entry is
//     fully inside the panel and the panel itself has no overflow;
//   - SETTINGS is the last control in the DOM (so last in tab order) and sits alone in the bottom
//     right corner, to the right of the mode read-out.
// It runs the REAL built app over a REAL match, in the two palettes the product ships, and writes one
// screenshot per case.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { chromium } from 'playwright-core';
import type { Page } from 'playwright-core';

const DIST = process.env.FUTA_DIST ?? 'web/dist';
const SHOTS = process.env.SHOTS ?? '';
const types: Record<string, string> = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.json': 'application/json',
};

const server = createServer((req, res) => {
  const path = decodeURIComponent((req.url ?? '/').split('?')[0]!);
  const under = path.startsWith('/3/') ? path.slice(3) : path;
  let file = join(DIST, under || 'index.html');
  if (!existsSync(file) || file.endsWith('/')) file = join(DIST, 'index.html');
  res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' });
  res.end(readFileSync(file));
});
await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
const URL3 = `http://127.0.0.1:${(server.address() as AddressInfo).port}/3/`;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

const browser = await chromium.launch({
  ...(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}),
  args: ['--no-sandbox'],
});
const check = (ok: boolean, what: string) => {
  assert.ok(ok, what);
  console.log(`  ok  ${what}`);
};

const CASES = [
  { key: '390x844-soil', w: 390, h: 844, palette: 'soil' },
  { key: '360x640-soil', w: 360, h: 640, palette: 'soil' },
  { key: '320x568-soil', w: 320, h: 568, palette: 'soil' },
  { key: '844x390-soil', w: 844, h: 390, palette: 'soil' },
  { key: '320x568-large', w: 320, h: 568, palette: 'soil', largeText: true },
  { key: '390x844-moss', w: 390, h: 844, palette: 'moss' },
  // The busiest face: an online duel with a report row and a live "leave" row on top of the four
  // usual ones. Six/seven rows must still fit a 320 phone (the column pairs into a keypad).
  { key: '320x568-duel', w: 320, h: 568, palette: 'soil', duel: true },
  { key: '844x390-duel', w: 844, h: 390, palette: 'soil', duel: true },
] as const;

type Box = { x: number; y: number; w: number; h: number; left: number; right: number; top: number; bottom: number };
type Item = Box & { id: string; label: string; colour: string; kind: 'lead' | 'row' | 'key' | 'other' };
type Panel = {
  vw: number; vh: number;
  sheet: Box; sheetOverflow: number; bodyOverflow: number;
  title: (Box & { text: string; centre: number });
  axis: number;
  items: Item[];
  youScore: Box; botScore: Box;
  readout: Box; turn: Box | null;
  mode: (Box & { text: string });
  settings: Item;
  order: string[];
  overflowY: string;
  /** True when the action column becomes a two-column grid (the wide/landscape faceplate). */
  grid: boolean;
};

const MEASURE = `(() => {
  const sheet = document.getElementById('sheet-menu');
  const s = getComputedStyle(sheet);
  const box = (el) => { const r = el.getBoundingClientRect(); return { x:+r.x.toFixed(1), y:+r.y.toFixed(1), w:+r.width.toFixed(1), h:+r.height.toFixed(1), left:+r.left.toFixed(1), right:+r.right.toFixed(1), top:+r.top.toFixed(1), bottom:+r.bottom.toFixed(1) }; };
  const vis = (el) => !!el && !el.hidden && el.offsetParent !== null && el.getBoundingClientRect().height > 0;
  const controls = [...sheet.querySelectorAll('button')].filter(vis);
  const items = controls.map((b) => Object.assign(box(b), {
    id: b.id || b.className,
    label: (b.textContent || '').trim().slice(0, 22),
    colour: getComputedStyle(b).color,
    kind: b.id === 'gm-settings' ? 'key' : b.classList.contains('gm-lead') ? 'lead' : b.classList.contains('gm-act') ? 'row' : 'other',
  }));
  const title = document.getElementById('gm-title');
  const tb = box(title);
  const status = document.getElementById('gm-status');
  const you = status && vis(status) ? box(status.querySelector('.gm-you')) : null;
  const bot = status && vis(status) ? box(status.querySelector('.gm-bot')) : null;
  const mode = document.getElementById('gm-mode');
  const sh = box(sheet);
  return {
    vw: innerWidth, vh: innerHeight,
    sheet: sh,
    sheetOverflow: Math.max(0, Math.round(sheet.scrollHeight - sheet.clientHeight)),
    bodyOverflow: Math.max(0, Math.round(sheet.scrollHeight - sheet.clientHeight)),
    overflowY: s.overflowY,
    axis: +((sh.left + sh.right) / 2).toFixed(1),
    title: Object.assign(tb, { text: (title.textContent || '').trim(), centre: +((tb.left + tb.right) / 2).toFixed(1) }),
    items,
    youScore: you, botScore: bot,
    readout: vis(status) ? box(status) : null,
    turn: status && vis(status.querySelector('.gm-turn')) ? box(status.querySelector('.gm-turn')) : null,
    mode: Object.assign(box(mode), { text: (mode.textContent || '').trim() }),
    settings: items.find((i) => i.id === 'gm-settings'),
    order: items.map((i) => i.id),
    grid: getComputedStyle(sheet.querySelector('.gm-acts')).display === 'grid',
  };
})()`;

/** Open a real match, then the pause panel. */
/**
 * Reveal the rows an online duel adds (Resign, Leave live) and the report row, without a server:
 * these are the same elements the live and feedback modules insert, so the layout they produce is
 * the real one.
 */
const revealDuelRows = async (page: Page) => {
  await page.evaluate(() => {
    const acts = document.querySelector('#sheet-menu .gm-acts');
    const main = document.getElementById('gm-main');
    for (const [id, words, cls] of [['gm-resign', 'Resign', 'btn ghost gm-act'], ['gm-leave-live', 'Leave live', 'btn ghost gm-act'], ['gm-report', 'Report a problem', 'btn ghost gm-act']] as const) {
      let el = document.getElementById(id) as HTMLButtonElement | null;
      if (!el) {
        el = document.createElement('button');
        el.id = id;
        el.type = 'button';
        el.className = cls;
        el.textContent = words;
        acts?.insertBefore(el, main);
      }
      el.hidden = false;
    }
    const mode = document.getElementById('gm-mode');
    if (mode) mode.textContent = 'Duel';
  });
};

const openPanel = async (page: Page, largeText: boolean, palette: string) => {
  await page.addInitScript((cfg) => {
    localStorage.clear();
    const settings = JSON.stringify({
      sound: false, music: false, coach: false, speed: 'normal', eyeCandy: false,
      reduceMotion: false, largeText: !!cfg.largeText, palette: cfg.palette,
    });
    // The futa05 build prefixes every key with "futa05:", older channels do not. Write both.
    for (const k of ['severgrow.settings.v1', 'futa05:severgrow.settings.v1']) localStorage.setItem(k, settings);
    for (const k of ['severgrow.seen', 'futa05:severgrow.seen']) localStorage.setItem(k, '1');
  }, { largeText, palette });
  await page.goto(URL3, { waitUntil: 'networkidle' });
  await page.waitForSelector('#menu:not([hidden])', { timeout: 20_000 });
  await page.waitForTimeout(500);
  await page.click('#menu-play');
  await page.waitForSelector('#play-menu:not([hidden])', { timeout: 10_000 });
  await page.click('#menu-new');
  await page.waitForSelector('#levels:not([hidden])', { timeout: 12_000 });
  await page.waitForTimeout(300);
  await page.locator('#levels .level-tile, #levels .difficulty-tile').nth(1).click({ force: true });
  await page.waitForSelector('#game:not([hidden])', { timeout: 25_000 });
  // The pre-game starter ritual (2026-10-23) is an `aria-modal` surface that owns the first
  // 1.8-3.6s of a match and deliberately swallows taps on `#hud-menu`. Wait for it to hand the
  // board over before opening the pause panel: this suite measures the pause face, not the ritual.
  await page.waitForFunction(() => {
    const r = document.getElementById('starter-lottery');
    return !r || r.hidden || !r.getClientRects().length;
  }, undefined, { timeout: 12_000 }).catch(() => undefined);
  await page.waitForTimeout(2200);
  await page.click('#hud-menu', { force: true });
  await page.waitForSelector('#sheet-menu:not([hidden])', { timeout: 6_000 });
  // The panel's own entrance is var(--dur-quick); let it land before measuring.
  await page.waitForTimeout(450);
  if (largeText) await page.evaluate(() => document.documentElement.classList.add('large-text'));
};

for (const c of CASES) {
  const tag = c.key;
  console.log(`\n${tag} (${c.w}x${c.h}, ${c.palette}${'largeText' in c && c.largeText ? ', Large text' : ''})`);
  const page = await browser.newPage({
    viewport: { width: c.w, height: c.h },
    deviceScaleFactor: 2,
    hasTouch: c.w < 800,
    isMobile: c.w < 800,
  });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await openPanel(page, 'largeText' in c && !!c.largeText, c.palette);
  if ('duel' in c && c.duel) {
    await revealDuelRows(page);
    await page.waitForTimeout(150);
  }
  const p = (await page.evaluate(MEASURE)) as Panel;
  if (SHOTS) await page.screenshot({ path: join(SHOTS, `panel-${tag}.png`) });

  // 1. Nothing scrolls, and every control is inside the panel.
  check(p.sheetOverflow <= 1, `${tag}: the panel does not scroll (overflow ${p.sheetOverflow}px)`);
  check(p.sheet.w <= p.vw + 0.5, `${tag}: the panel is inside the screen width`);
  check(p.sheet.top >= -0.5 && p.sheet.bottom <= p.vh + 0.5, `${tag}: the panel is inside the screen height`);
  for (const i of p.items) {
    check(i.top >= p.sheet.top - 0.5 && i.bottom <= p.vh + 0.5, `${tag}: ${i.id} is fully on screen (${i.label})`);
  }

  // 2. One content axis: the lead key and the action rows share both edges, and the corner plate's
  //    controls sit exactly on that same edge (the mode word on the left, the Settings key right).
  const column = p.items.filter((i) => i.kind === 'lead' || i.kind === 'row');
  const lead = column.find((i) => i.kind === 'lead' && i.id === 'gm-resume') ?? column[0]!;
  const edge = { left: lead.left, right: lead.right };
  // The lead key is the column's width on every screen: the rows match it exactly in portrait.
  if (!p.grid) {
    const lefts = [...new Set(column.map((i) => i.left))];
    const rights = [...new Set(column.map((i) => i.right))];
    check(lefts.length === 1, `${tag}: one left edge for the lead and every row (${lefts.join(', ')})`);
    check(rights.length === 1, `${tag}: one right edge for the lead and every row (${rights.join(', ')})`);
  } else {
    // The wide faceplate splits the actions into two equal halves about the panel's axis.
    const halves = [...new Set(column.filter((i) => i.kind === 'row' && i.w < edge.right - edge.left - 2).map((i) => +((i.left + i.right) / 2).toFixed(1)))].sort((a, b) => a - b);
    // The wide faceplate lays the secondary keys on ONE line (owner brief 2026-10-22: height is the
    // scarce axis in landscape). Their count follows what the mode offers (3-5), so accept any
    // 2-5 equal columns; the real invariant is that the outermost pair mirrors the axis below.
    check(halves.length >= 2 && halves.length <= 5, `${tag}: the action keypad has 2-5 columns (${halves.join(', ')})`);
    // However many columns, the outermost two are the same distance from the axis.
    check(Math.abs((p.axis - halves[0]!) - (halves[halves.length - 1]! - p.axis)) <= 1,
      `${tag}: the action columns mirror the axis (${p.axis - halves[0]!} / ${halves[halves.length - 1]! - p.axis})`);
  }
  check(Math.abs(p.settings.right - edge.right) <= 0.5, `${tag}: Settings ends on that same right edge (${p.settings.right} vs ${edge.right})`);
  check(Math.abs(p.mode.left - edge.left) <= 0.5, `${tag}: the mode word starts on that same left edge (${p.mode.left} vs ${edge.left})`);

  // 3. The nameplate and the read-out sit on the panel's centre line; the scores mirror each other.
  check(Math.abs(p.title.centre - p.axis) <= 1, `${tag}: the title is on the axis (${p.title.centre} vs ${p.axis})`);
  check(p.youScore.right < p.botScore.left, `${tag}: your score reads before the opponent's`);
  if (!p.grid) {
    check(p.youScore.right < p.axis && p.botScore.left > p.axis, `${tag}: the scores sit on opposite sides of the axis`);
    check(Math.abs((p.axis - p.youScore.right) - (p.botScore.left - p.axis)) <= 0.5,
      `${tag}: the scores are mirrored about the axis (${p.axis - p.youScore.right} / ${p.botScore.left - p.axis})`);
  } else {
    // Landscape lays the read-out on one line: the pair is centred as a row, so the air either
    // side of it must be equal.
    const l = p.youScore.left - p.readout.left;
    const r = p.turn ? p.readout.right - p.turn.right : l;
    check(Math.abs(l - r) <= 1.5, `${tag}: the read-out row is centred (${l} / ${r})`);
  }

  // 4. One height per family, and no control under 44px.
  const heights = [...new Set(column.filter((i) => i.kind === 'row' && i.w > 0).map((i) => i.h))];
  check(heights.length === 1, `${tag}: every action row is the same height (${heights.join(', ')})`);
  for (const i of p.items) check(i.h >= 44, `${tag}: ${i.id} is at least 44px tall (${i.h})`);

  // 5. Settings is last in the DOM (tab order), alone in the bottom-right corner.
  check(p.order[p.order.length - 1] === 'gm-settings', `${tag}: Settings is the last control (${p.order.join(' > ')})`);
  check(p.settings.bottom > p.mode.bottom - 1, `${tag}: Settings shares the bottom line with the mode word`);
  const sMid = (p.settings.top + p.settings.bottom) / 2;
  const mMid = (p.mode.top + p.mode.bottom) / 2;
  check(Math.abs(sMid - mMid) <= 1.5, `${tag}: Settings is centred on the mode line (${sMid} vs ${mMid})`);
  check(p.settings.left > p.mode.right, `${tag}: the mode read-out is left of Settings (${p.mode.text})`);
  check(p.settings.h >= 44, `${tag}: Settings keeps the 44px target (${p.settings.h})`);

  // 6. The quiet rows recede; the lamp and the lead key carry the only warm colour.
  const quiet = p.items.find((i) => i.id.includes('gm-act-quiet'));
  if (quiet) check(quiet.colour !== p.items.find((i) => i.id === 'gm-new')!.colour, `${tag}: Main menu recedes (${quiet.colour})`);

  check(errors.length === 0, `${tag}: no page errors (${errors.join(' | ')})`);
  console.log(
    `  --  ${tag}: panel ${p.sheet.h}px tall at y=${p.sheet.top}, overflow ${p.sheetOverflow}; ` +
    `rows ${heights[0]}px; edges ${edge.left}..${edge.right}; title centre ${p.title.centre} (axis ${p.axis}); ` +
    `Settings ${p.settings.left}..${p.settings.right} y=${p.settings.top}, ${p.settings.h}px; mode "${p.mode.text}"`,
  );
  await page.close();
}

// ---------------------------------------------------------------------------------------------
// THE RESULT AND THE PLATE NEVER SHARE THE SCREEN (owner review, 2026-10-23).
//
// The owner's desktop loss capture showed "Paused" and "Settings" painted above the outcome card:
// the HUD keys sit above the result, and a tap opened the plate over a finished match. A finished
// match has no menu to open, so this plays one out for real and proves the key does nothing.
{
  console.log('\nresult vs plate (1280x800)');
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => {
    localStorage.setItem('severgrow.seen', '1');
    // Speed skip: the point is the finished state, not the animation. The ritual still plays.
    localStorage.setItem('severgrow.settings.v1', JSON.stringify({
      sound: false, music: false, coach: false, speed: 'skip', reduceMotion: true,
    }));
    // Vite's bundle helper is referenced by class fields; a page evaluated by an init script must
    // define it (the same shim the other suites use).
    (window as unknown as { __name: (f: unknown) => unknown }).__name = (f: unknown) => f;
  });
  await page.goto(URL3, { waitUntil: 'networkidle' });
  await page.waitForSelector('#menu:not([hidden])', { timeout: 20_000 });
  await page.waitForTimeout(400);
  await page.click('#menu-play');
  await page.waitForSelector('#play-menu:not([hidden])', { timeout: 10_000 });
  await page.click('#menu-new');
  await page.waitForSelector('#levels:not([hidden])', { timeout: 12_000 });
  await page.waitForTimeout(300);
  await page.locator('#levels .level-tile, #levels .difficulty-tile').nth(1).click({ force: true });
  await page.waitForSelector('#game:not([hidden])', { timeout: 25_000 });
  await page.waitForFunction(() => {
    const r = document.getElementById('starter-lottery');
    return !r || r.hidden || !r.getClientRects().length;
  }, undefined, { timeout: 15_000 }).catch(() => undefined);
  const idle = () => page.waitForFunction('(() => { const h = window.__severgrow; return !!h.state() && !h.busy(); })()', undefined, { timeout: 30_000 });
  await idle();
  const read = () => page.evaluate(() => (window as unknown as { __severgrow: { state: () => { phase: string; actor: number } } }).__severgrow.state());

  // Play only the human's turns; the computer takes its own, exactly as a player experiences it.
  let waiting = 0;
  for (let i = 0; i < 900; i++) {
    const s = await read();
    if (!s || s.phase === 'GAME_OVER') break;
    await idle();
    const now = (await read())!;
    if (now.phase === 'GAME_OVER') break;
    if (now.actor !== 0) {
      if (++waiting > 400) break;
      await page.waitForTimeout(50);
      continue;
    }
    waiting = 0;
    const legal = await page.evaluate(() => (window as unknown as { __severgrow: { legal: () => unknown[] } }).__severgrow.legal());
    if (!legal.length) break;
    const played = await page.evaluate(
      (a) => (window as unknown as { __severgrow: { playFor: (x: unknown, p: number) => boolean } }).__severgrow.playFor(a, 0),
      legal[0],
    );
    if (!played) break;
  }
  await idle();
  await page.waitForTimeout(600);

  const state = (await page.evaluate(() => {
    const rects = (el: HTMLElement) => el.getClientRects().length;
    return {
      result: !document.getElementById('gameover')!.hidden,
      plate: document.getElementById('sheet-menu')!.hidden || !rects(document.getElementById('sheet-menu')!),
      sheets: [...document.querySelectorAll<HTMLElement>('.sheet')]
        .filter((s) => !s.hidden && rects(s) && !s.classList.contains('install-sheet')).map((s) => s.id || '(no id)'),
    };
  })) as { result: boolean; plate: boolean; sheets: string[] };
  check(state.result, 'finished: the outcome card is on screen');
  check(state.plate, 'finished: the pause plate is not on screen beside it');
  if (SHOTS) await page.screenshot({ path: join(SHOTS, 'result-under-plate-1280x800.png') });

  // The tap that used to paint "Paused" and "Settings" above the outcome.
  await page.evaluate(() => (document.getElementById('hud-menu') as HTMLElement).click());
  await page.waitForTimeout(500);
  const after = await page.evaluate(() => {
    const rects = (el: HTMLElement) => el.getClientRects().length;
    return {
      sheets: [...document.querySelectorAll<HTMLElement>('.sheet')]
        .filter((s) => !s.hidden && rects(s) && !s.classList.contains('install-sheet')).map((s) => s.id || '(no id)'),
      scrim: rects(document.getElementById('scrim')!),
      blocked: document.documentElement.classList.contains('futa04-information-blocked'),
    };
  });
  check(after.sheets.length === 0, `finished: the menu key opens nothing (${after.sheets.join(', ') || 'none'})`);
  check(!after.scrim && !after.blocked, 'finished: no scrim and no blocked board, the result owns the screen');
  check(errors.length === 0, `finished: no page errors (${errors.join(' | ')})`);
  await page.close();
}

await browser.close();
server.close();
console.log('\nPause panel: one axis, equal rows, no scroll at every size, Settings last in the corner.');
