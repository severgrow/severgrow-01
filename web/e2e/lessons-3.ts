// LEVELS 1-10 AS THE TUTORIAL, played in a real browser at /3/ with real pointer taps.
//
//   npm run web:build (CHANNEL=futa05 + its online config), then:  npx tsx web/e2e/lessons-3.ts
//
// Players: (c) taps ONLY the lit thing, (random) taps anywhere, then the robustness cases:
// cards before drawing, wrong tiles again and again, hints off, refresh mid-level, L11 board.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { chromium } from 'playwright-core';
import type { Page } from 'playwright-core';
import { CAMPAIGN_LEVELS } from '../../src/campaign/index.js';
import { SMALL_HOMES } from '../src/lessons/authored.js';
import { LESSON } from '../../src/strings.js';

const DIST = process.env.FUTA_DIST ?? 'web/dist';
const SHOTS = process.env.SHOTS ?? '';
const ONLY = process.env.ONLY ?? 'all';
const types: Record<string, string> = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.webp': 'image/webp', '.webmanifest': 'application/manifest+json', '.json': 'application/json',
};
// The /3/ copy is served at /3/, as on futasaku.com, so its own storage prefix is the one in use.
const server = createServer((req, res) => {
  const path = decodeURIComponent((req.url ?? '/').split('?')[0]!);
  if (!path.startsWith('/3/')) { res.writeHead(404); res.end(); return; }
  let file = join(DIST, path.slice(3) || 'index.html');
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
const check = (ok: boolean, what: string) => { assert.ok(ok, what); console.log(`  ok  ${what}`); };

type Lit = { t: string; key?: string; keys?: string[]; id?: number; ids?: number[]; player?: number };
type Beat = { id: string; title: string; line?: string; lit: Lit; explain?: boolean };
const hook = <T>(p: Page, f: string): Promise<T> => p.evaluate((name) => {
  const h = (window as any).__severgrow;
  const v = h?.[name]?.();
  return v === undefined ? null : JSON.parse(JSON.stringify(v));
}, f) as Promise<T>;
const idle = (p: Page) => p.waitForFunction(() => { const h = (window as any).__severgrow; return !!h && !h.busy(); }, undefined, { timeout: 30000 });

const newPage = async (w = 390, h = 844) => {
  const page = await browser.newPage({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true });
  // A page that is not the active tab gets its requestAnimationFrame loop throttled to about 1 fps,
  // which turns the page's own clock (the 650 ms guard is measured on it) into a coin toss. Bring
  // each page to the front so the timings this suite asserts are the app's, not the browser's
  // background policy. Nothing about the app changes; the measurement becomes truthful.
  await page.bringToFront();
  // No audio in a headless run: a machine without an output device raises an AudioContext
  // pageerror, which the suite (rightly) counts, and it has nothing to do with the lessons.
  await page.addInitScript(() => {
    const quiet = JSON.stringify({ sound: false, music: false });
    // ONLY the prefixes this page can actually use: /3 on a futa05 build reads `futa05-3:`, and
    // `main2:` is the fallback a futa04 build installs. Planting `futa05:` here would write the
    // ROOT channel's key from the /3 page and make the isolation check at the end of this suite
    // fail on the fixture's own key rather than on anything the app did.
    for (const prefix of ['futa05-3:', 'main2:']) {
      const key = `${prefix}severgrow.settings.v1`;
      try {
        const current = JSON.parse(localStorage.getItem(key) ?? '{}');
        localStorage.setItem(key, JSON.stringify({ ...current, ...JSON.parse(quiet) }));
      } catch { /* a page that has not written settings yet */ }
    }
  });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR|127\.0\.0\.1:9/.test(m.text())) errors.push(m.text()); });
  return { page, errors };
};

/** Close the install invitation the way a person does, and only when it is actually showing. */
const dismissInstall = (p: Page) => p.evaluate(`(() => {
  const prompt = document.getElementById('install-prompt');
  if (!prompt || prompt.hidden) return;
  for (const id of ['install-close', 'install-later', 'install-dismiss']) document.getElementById(id)?.click();
  if (!prompt.hidden) prompt.hidden = true;
})()`);

/** From the menu: PLAY → the next level (the only way in). */
const openNextLevel = async (p: Page) => {
  await p.waitForSelector('#menu-play:not([hidden])', { timeout: 20000 });
  await dismissInstall(p);
  await p.evaluate(() => (document.getElementById('menu-play') as HTMLButtonElement).click());
  await p.waitForSelector('#menu-campaign:not([hidden])', { timeout: 10000 });
  await dismissInstall(p);
  await p.evaluate(() => (document.getElementById('menu-campaign') as HTMLButtonElement).click());
  // A saved match asks first (owner decision); resume it so the level continues where it was.
  await p.waitForSelector('#game:not([hidden]), #sheet-campaign-start:not([hidden])', { timeout: 15000 });
  const asked = await p.evaluate(() => !document.getElementById('sheet-campaign-start')!.hidden);
  if (asked) await p.evaluate(() => (document.getElementById('csa-resume') as HTMLButtonElement).click());
  await p.waitForFunction(() => !!(window as any).__severgrow?.state?.(), undefined, { timeout: 15000 });
  // The stage intro and the opening deal both finish before the board is live; a card tapped
  // before that would skip the intro instead of answering DRAW FIRST.
  await p.waitForFunction(() => {
    const l = (window as any).__severgrow?.lesson?.();
    return !l || (!l.stage && l.handSettled);
  }, undefined, { timeout: 15000 });
  await p.waitForTimeout(300);
};

/**
 * The lesson's chrome, measured from the live page: the header (menu and logo only), the cockpit
 * plate under the map, and the hexes themselves. The checks compare these boxes.
 */
const GEOMETRY = `(() => {
  const R = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { x:+r.x.toFixed(1), y:+r.y.toFixed(1), w:+r.width.toFixed(1), h:+r.height.toFixed(1), right:+r.right.toFixed(1), bottom:+r.bottom.toFixed(1) }; };
  const vis = (el) => !!el && el.getBoundingClientRect().width > 0 && getComputedStyle(el).display !== 'none' && !el.hidden;
  const hud = document.querySelector('#game > .hud');
  const plate = document.getElementById('lesson-plate');
  const glass = document.getElementById('futasaku-glass');
  const wrap = document.getElementById('board-wrap');
  const menu = document.getElementById('hud-menu');
  const brand = document.getElementById('hud-brand');
  const ps = [...document.querySelectorAll('#board .hex-cell path.hex')].map((p) => p.getBoundingClientRect());
  const union = ps.length ? { x:+Math.min(...ps.map(r=>r.left)).toFixed(1), y:+Math.min(...ps.map(r=>r.top)).toFixed(1),
    right:+Math.max(...ps.map(r=>r.right)).toFixed(1), bottom:+Math.max(...ps.map(r=>r.bottom)).toFixed(1) } : null;
  if (union) { union.w = +(union.right - union.x).toFixed(1); union.h = +(union.bottom - union.y).toFixed(1); }
  const hex = ps.length ? ps.slice().sort((a, b) => b.width - a.width)[0] : null;
  const padTop = wrap ? parseFloat(getComputedStyle(wrap).paddingTop) || 0 : 0;
  const plateCss = plate && !plate.hidden ? getComputedStyle(plate) : null;
  return {
    hud: R(hud), headerTitle: vis(hud && hud.querySelector('.lesson-hud-title, #lesson-hud')),
    plate: plate && !plate.hidden ? R(plate) : null,
    plateHidden: !plate || plate.hidden,
    plateCopy: plate?.querySelector('.lesson-copy')?.textContent ?? '',
    plateCss: plateCss ? {
      border: plateCss.borderTopWidth, borderStyle: plateCss.borderTopStyle,
      outline: plateCss.outlineStyle, outlineWidth: plateCss.outlineWidth,
      shadow: plateCss.boxShadow, pointer: plateCss.pointerEvents,
      buttons: plate ? plate.querySelectorAll('button').length : 0,
      display: document.querySelector('#smart-led-text')?.textContent ?? '',
    } : null,
    menu: R(menu), brand: R(brand),
    glass: glass && !glass.hidden ? R(glass) : null,
    kicker: glass && !glass.hidden ? (glass.dataset.kicker ?? null) : null,
    tutorial: document.documentElement.classList.contains('futa04-tutorial'),
    wrap: R(wrap), union,
    hex: hex ? { w:+hex.width.toFixed(1), h:+hex.height.toFixed(1) } : null,
    padTop,
    hudPad: hud ? getComputedStyle(hud).paddingLeft : null,
    lessonAttr: document.documentElement.dataset.lesson ?? null,
    scroll: { h: document.documentElement.scrollHeight, w: document.documentElement.scrollWidth, ih: innerHeight, iw: innerWidth },
  };
})()`;

const geometry = (p: Page) => p.evaluate(GEOMETRY) as Promise<{
  hud: Box; headerTitle: boolean; plate: Box | null; plateHidden: boolean; plateCopy: string;
  plateCss: { border: string; borderStyle: string; outline: string; outlineWidth: string; shadow: string; pointer: string; buttons: number; display: string } | null;
  menu: Box; brand: Box;
  glass: Box | null; kicker: string | null; tutorial: boolean; wrap: Box; union: Box;
  hex: { w: number; h: number } | null; padTop: number; hudPad: string; lessonAttr: string | null;
  scroll: { h: number; w: number; ih: number; iw: number };
}>;
type Box = { x: number; y: number; w: number; h: number; right: number; bottom: number };

/** Header is the menu and the logo. Sentences sit in the plate under the map, which is not padded. */
const checkCockpit = (g: Awaited<ReturnType<typeof geometry>>, tag: string, phone: boolean) => {
  check(!g.headerTitle, `${tag}: the header has no lesson title`);
  check(!g.tutorial, `${tag}: the lesson does not use the tutorial band`);
  check(g.padTop < 2, `${tag}: the map is not padded down (${g.padTop}px)`);
  check(g.kicker === null && g.glass === null, `${tag}: no lesson window over the map`);
  check(!!g.menu && g.menu.w > 0 && !!g.brand && g.brand.w > 0, `${tag}: the header is the menu and the logo`);
  if (phone && g.hex) {
    const size = Math.max(g.hex.w, g.hex.h);
    check(size >= 72, `${tag}: a hex stays full size (${g.hex.w}x${g.hex.h}, was about 43 when the window padded the map)`);
  }
  if (!g.plateHidden && g.plate && g.union) {
    // The plate follows the lit action on a phone, so it may sit over unlit hexes; the hard rule
    // (never over the lit target, the hand or a control) is checked on every beat by
    // checkPlateClear. It must still stay fully on screen.
    check(g.plate.bottom <= g.scroll.ih + 1 && g.plate.y >= 0, `${tag}: the plate stays on screen`);
  }
  if (!g.plateHidden && g.plate && g.plateCss) {
    // One info box, information only: no border, no outline, no shadow, no buttons, taps through.
    check(parseFloat(g.plateCss.border) === 0, `${tag}: the info box has no border (${g.plateCss.border})`);
    check(g.plateCss.outline === 'none' || parseFloat(g.plateCss.outlineWidth) === 0, `${tag}: no outline`);
    check(g.plateCss.shadow === 'none', `${tag}: no box shadow/edge (${g.plateCss.shadow})`);
    check(g.plateCss.pointer === 'none', `${tag}: the box is pointer-events:none`);
    check(g.plateCss.buttons === 0, `${tag}: the box has no buttons`);
    check(!!g.plateCopy, `${tag}: the box carries the explanation sentence`);
  }
  check(g.scroll.h <= g.scroll.ih + 1 && g.scroll.w <= g.scroll.iw + 1, `${tag}: no page scroll (${g.scroll.w}x${g.scroll.h} in ${g.scroll.iw}x${g.scroll.ih})`);
};

/** The focus layer must wrap the lit hex itself, not a neighbour or an old position. */
const checkPointerOnHex = async (p: Page, key: string, tag: string) => {
  // The overlay eases toward its target; wait for two identical samples before measuring.
  let last = '';
  for (let i = 0; i < 40; i++) {
    const now = await p.evaluate(`(() => { const g = document.querySelector('#tutorial-focus .focus-glow'); return g ? g.getAttribute('d') : ''; })()`);
    if (now && now === last) break;
    last = now as string;
    await p.waitForTimeout(60);
  }
  const m = await p.evaluate(`(() => {
    const R = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { x:+r.x.toFixed(2), y:+r.y.toFixed(2), w:+r.width.toFixed(2), h:+r.height.toFixed(2), right:+r.right.toFixed(2), bottom:+r.bottom.toFixed(2) }; };
    const cell = document.querySelector('#board .hex-cell[data-key="${key}"]');
    return { path: R(cell && cell.querySelector('path.hex')), glow: R(document.querySelector('#tutorial-focus .focus-glow')) };
  })()`) as { path: Box | null; glow: Box | null };
  check(!!m.path && !!m.glow, `${tag}: the light and the lit hex are both on screen`);
  if (!m.path || !m.glow) return;
  const dx = Math.abs((m.path.x + m.path.right) / 2 - (m.glow.x + m.glow.right) / 2);
  const dy = Math.abs((m.path.y + m.path.bottom) / 2 - (m.glow.y + m.glow.bottom) / 2);
  check(dx <= 2 && dy <= 2, `${tag}: the light sits on the lit hex (off ${dx.toFixed(1)},${dy.toFixed(1)}px)`);
  check(Math.abs(m.path.w - m.glow.w) <= 5 && Math.abs(m.path.h - m.glow.h) <= 6, `${tag}: the glow wraps that hex, no wider (${m.glow.w}x${m.glow.h} vs ${m.path.w}x${m.path.h})`);
};

/**
 * Watch the very first light: it may only appear once the opening hand has stopped moving. The
 * observer runs from before the level starts, so it sees the stage intro and the deal too.
 */
const installDealAudit = (p: Page) => p.evaluate(`(() => {
  const g = window.__severgrow;
  const audit = window.__dealAudit = { beatBeforeSettled: false, firstAfterSettled: false, stageSeen: false };
  let stop = false;
  window.__dealAuditStop = () => { stop = true; };
  const tick = () => {
    const l = g && g.lesson && g.lesson();
    if (l) {
      if (l.stage) audit.stageSeen = true;
      if (l.beat && !l.handSettled) audit.beatBeforeSettled = true;
      if (l.beat && l.handSettled) audit.firstAfterSettled = true;
    }
    if (!stop) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
})()`);
const checkDealAudit = async (p: Page, level: number, expectLight: boolean) => {
  const audit = await p.evaluate(`(() => { window.__dealAuditStop && window.__dealAuditStop(); return window.__dealAudit; })()`) as
    { beatBeforeSettled: boolean; firstAfterSettled: boolean; stageSeen: boolean } | null;
  if (expectLight) check(!!audit && audit.firstAfterSettled, `L${level}: first light appears after the deal settles`);
  check(!!audit && !audit.beatBeforeSettled, `L${level}: no light while the hand is still moving`);
  check(!!audit && audit.stageSeen, `L${level}: stage intro came first`);
};

/** The centre of the thing a lit beat points at (a real element on screen), or null. */
// Page code as a plain string: the test runner's name helpers do not exist inside the page.
const LIT_POINTS = `(l, homes) => {
  function centre(el) {
    if (!el) return null;
    var box = (el.querySelector(':scope > path.hex') || el).getBoundingClientRect();
    return box.width ? { x: box.left + box.width / 2, y: box.top + box.height / 2 } : null;
  }
  function hex(k) { return centre(document.querySelector('#board .hex-cell[data-key="' + k + '"]')); }
  function card(id) { return centre(document.querySelector('#hand .card[data-card="' + id + '"]')); }
  switch (l.t) {
    case 'hex': return [hex(l.key)];
    case 'hexes': return l.keys.map(hex);
    case 'home': return [hex(l.player === 1 ? homes[1] : homes[0])];
    case 'rock': return [hex(l.key)];
    case 'card': return [card(l.id)];
    case 'cards': return [card(l.ids[0])];
    case 'deck': return [centre(document.querySelector('#deck .pile-card') || document.getElementById('deck'))];
    case 'deckCount': return [centre(document.querySelector('#deck .pile-card') || document.getElementById('deck'))];
    case 'score': return [centre(document.getElementById('smart-led'))];
    case 'discard': return [centre(document.querySelector('#discard .pile-card') || document.getElementById('discard'))];
    case 'end': return [centre(document.getElementById('smart-context'))];
    case 'bloom': return [centre(document.getElementById('smart-bloom-button'))];
    default: return [];
  }
}`;
const litPoints = (p: Page, lit: Lit) =>
  p.evaluate(`(${LIT_POINTS})(${JSON.stringify(lit)}, ${JSON.stringify(SMALL_HOMES)})`) as Promise<({ x: number; y: number } | null)[]>;

/** The same selectors lesson-view.ts lights, so clearance is measured against the real target. */
const litSelectors = (l: Lit): string[] => {
  const hex = (k: string) => `#board .hex-cell[data-key="${k}"]`;
  const card = (id: number) => `#hand .card[data-card="${id}"]`;
  switch (l.t) {
    case 'hex': return l.key ? [hex(l.key)] : [];
    case 'hexes': return (l.keys ?? []).map(hex);
    case 'home': return [hex(SMALL_HOMES[l.player === 1 ? 1 : 0]!)];
    case 'rock': return l.key ? [hex(l.key)] : [];
    case 'card': return l.id === undefined ? [] : [card(l.id)];
    case 'cards': return (l.ids ?? []).map(card);
    case 'deck': return ['#deck'];
    case 'deckCount': return ['#deck .pile-card', '#deck-count'];
    case 'score': return ['#smart-led'];
    case 'discard': return ['#discard'];
    case 'end': return ['#smart-context'];
    case 'bloom': return ['#smart-bloom-button'];
    default: return [];
  }
};

// Page code as a string for the same reason as LIT_POINTS: the runner's TS transform must not leak
// into the browser.
const PLATE_CLEAR = `(sels) => {
  const R = (el) => {
    if (!el) return null;
    const b = (el.querySelector(':scope > path.hex') || el).getBoundingClientRect();
    return b.width > 0 ? { x: b.left, y: b.top, right: b.right, bottom: b.bottom } : null;
  };
  const plate = document.getElementById('lesson-plate');
  const pr = plate && !plate.hidden ? plate.getBoundingClientRect() : null;
  const cells = [...document.querySelectorAll('#board .hex-cell path.hex')].map((p) => p.getBoundingClientRect()).filter((b) => b.width > 0);
  const board = cells.length ? {
    x: Math.min(...cells.map((b) => b.left)), y: Math.min(...cells.map((b) => b.top)),
    right: Math.max(...cells.map((b) => b.right)), bottom: Math.max(...cells.map((b) => b.bottom)),
  } : null;
  // The cockpit owns the lower part of a phone screen, and the caption may never sit on it, so a
  // lower-half target often has no free gap below it at all. The test needs to know that.
  const dock = document.getElementById('dock');
  const dr = dock ? dock.getBoundingClientRect() : null;
  return {
    layout: document.documentElement.dataset.layout ?? '',
    plate: pr ? { x: pr.left, y: pr.top, right: pr.right, bottom: pr.bottom } : null,
    board,
    dock: dr ? { y: dr.top } : null,
    targets: sels.map((sel) => ({ sel, box: R(document.querySelector(sel)) })).filter((t) => !!t.box),
  };
}`;

/** The caption must never sit on the thing the step lights (hex, card, pile, sign, Bloom...). */
const checkPlateClear = async (p: Page, lit: Lit, tag: string) => {
  const selectors = litSelectors(lit);
  if (!selectors.length) return;
  type PlateGeom = {
    layout: string;
    plate: { x: number; y: number; right: number; bottom: number } | null;
    board: { x: number; y: number; right: number; bottom: number } | null;
    dock: { y: number } | null;
    targets: { sel: string; box: { x: number; y: number; right: number; bottom: number } }[];
  };
  // The camera eases after a beat and the plate follows it once it settles (the same follow-up
  // call the game makes). Read where the caption RESTS: wait for two identical samples.
  let r = await p.evaluate(`(${PLATE_CLEAR})(${JSON.stringify(selectors)})`) as PlateGeom;
  for (let i = 0; i < 25 && r.plate; i++) {
    const before = JSON.stringify([r.plate, r.targets.map((t) => t.box)]);
    await p.waitForTimeout(80);
    const next = await p.evaluate(`(${PLATE_CLEAR})(${JSON.stringify(selectors)})`) as PlateGeom;
    if (!next.plate) return;
    const after = JSON.stringify([next.plate, next.targets.map((t) => t.box)]);
    r = next;
    if (after === before) break;
  }
  if (!r.plate) return;
  for (const t of r.targets) {
    const b = t.box;
    const hits = r.plate.x < b.right && r.plate.right > b.x && r.plate.y < b.bottom && r.plate.bottom > b.y;
    check(!hits, `${tag}: the caption never covers ${t.sel}`);
  }
  // On a phone the caption follows the action: when the lit things on the map are clearly in the
  // board's lower half, the plate is in that half too. A hex straddling the midline is not
  // "lower" for this check (the nearest free spot can sit just above it), so the test needs a
  // margin of one small step past the middle. The side layout keeps its own (top-band) order.
  if (r.board && r.layout !== 'side') {
    const midBoard = (r.board.y + r.board.bottom) / 2;
    const clearlyLower = midBoard + 40;
    const onBoard = r.targets.filter((t) =>
      t.box.x < r.board!.right && t.box.right > r.board!.x && t.box.y < r.board!.bottom && t.box.bottom > r.board!.y);
    const midPlate = (r.plate.y + r.plate.bottom) / 2;
    // ...and only when the lower half of the map actually has a free gap: on a phone the cockpit
    // starts well above the map's bottom edge, so a lit hex down there often has the dock, the
    // hand or the display under it. The caption may never sit on any of those (that is the rule
    // above), so it goes to the nearest spot that is free — which can be the top band.
    const lowerHalfFree = !r.dock || r.dock.y > midBoard + 8;
    if (lowerHalfFree && onBoard.length && onBoard.every((t) => (t.box.y + t.box.bottom) / 2 > clearlyLower)) {
      check(midPlate > midBoard,
        `${tag}: the caption follows the action into the lower half (plate ${JSON.stringify(r.plate)} board mid ${Math.round(midBoard)} plate mid ${Math.round(midPlate)})`);
    }
  }
};

/** A tap somewhere neutral on the map (an explanation moves on with a tap anywhere). */
const tapAnywhere = async (p: Page) => {
  const box = await p.evaluate(() => { const r = document.getElementById('board-wrap')!.getBoundingClientRect(); return { x: r.left + 12, y: r.top + r.height * 0.5 }; });
  await p.mouse.click(box.x, box.y);
};

/**
 * Dismiss an explanation the way a player now must — after its reading floor (owner, 2026-10-21:
 * "make sure the window can't be skipped for 3s"). DELIBERATE UPDATE: this used to tap straight away
 * because the old floor was 650 ms; a dismissing tap inside the new 3 s floor is swallowed on
 * purpose, so tapping early here would test nothing but the floor. The helper does not hard-code a
 * sleep: it reads the box's own clock from the test hook and waits exactly the remaining floor, so
 * it stays quick when the sentence has already been up a while.
 */
const READ_FLOOR_MS = 3000;
/** Wait out what is left of the open explanation's reading floor (nothing if it has passed). */
const waitReadFloor = async (p: Page) => {
  const left = await p.evaluate(`(() => {
    const l = window.__severgrow?.lesson?.();
    return l && l.explainAt ? Math.max(0, ${READ_FLOOR_MS} - (performance.now() - l.explainAt)) : 0;
  })()`) as number;
  if (left > 0) await p.waitForTimeout(left + 120);
};
const dismissExplanation = async (p: Page) => {
  await waitReadFloor(p);
  await tapAnywhere(p);
  await p.waitForTimeout(320);
};

/**
 * What an element is animating right now: every animation on it, the lesson's own breath, and the
 * CSS properties those keyframes touch (so a filter or a shadow can be ruled out by name).
 */
const ANIMATIONS_OF = `(sel) => {
  const el = document.querySelector(sel);
  if (!el) return null;
  const SKIP = ['offset', 'computedOffset', 'easing', 'composite'];
  const propsOf = (a) => {
    try {
      if (!a.effect || !a.effect.getKeyframes) return [];
      return a.effect.getKeyframes().flatMap((k) => Object.keys(k).filter((n) => !SKIP.includes(n)));
    } catch { return []; }
  };
  const anims = el.getAnimations();
  const breath = anims.filter((a) => a.id === 'lesson-beat-breath');
  return {
    count: anims.length,
    names: anims.map((a) => a.id || a.animationName || a.constructor.name),
    each: anims.map((a) => ({ name: a.id || a.animationName || a.constructor.name, state: a.playState, props: [...new Set(propsOf(a))] })),
    running: anims.filter((a) => a.playState === 'running').length,
    breath: breath.map((a) => ({ state: a.playState, props: [...new Set(propsOf(a))] })),
    props: [...new Set(anims.flatMap(propsOf))],
  };
}`;
type Anims = {
  count: number; names: string[]; running: number;
  each: { name: string; state: string; props: string[] }[];
  breath: { state: string; props: string[] }[];
  props: string[];
};
const animationsOf = (p: Page, sel: string) => p.evaluate(`(${ANIMATIONS_OF})(${JSON.stringify(sel)})`) as Promise<Anims | null>;

/** The display's own text and tone, and the action line as words. */
const displayState = (p: Page) => p.evaluate(() => ({
  text: document.querySelector('#smart-led-text')?.textContent?.trim() ?? '',
  mode: document.getElementById('smart-led')?.dataset.mode ?? '',
})) as Promise<{ text: string; mode: string }>;
const wordCount = (t: string) => t.replace(/[»:]/g, ' ').split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w)).length;

/**
 * Player (c): ignores the words, taps only the lit thing (and anywhere on an explanation). Counts
 * every answer the game gives (a wrong tap). Returns when the level is over.
 */
const tapOnlyTheLight = async (p: Page, level: number) => {
  let wrong = 0; let taps = 0; let still = 0; let last = ''; let lastPlate = '';
  const t0 = Date.now();
  for (let guard = 0; Date.now() - t0 < 360000; guard++) {
    const s = await hook<any>(p, 'state');
    if (!s) throw new Error('no state');
    if (s.phase === 'GAME_OVER') return { wrong, taps, ms: Date.now() - t0, winner: s.result?.winner, reason: s.result?.reason, turns: s.turnNumber };
    const busy = await p.evaluate(() => (window as any).__severgrow.busy());
    if (s.actor !== 0 || busy) { await p.waitForTimeout(120); continue; }
    // The install invitation may follow a closed finish card (from level 4): a person closes it.
    await dismissInstall(p);
    const lesson = await hook<{ beat: Beat | null; answer: string; idle: boolean; stage: boolean; handSettled: boolean } | null>(p, 'lesson');
    if (!lesson) throw new Error(`L${level}: no lesson on screen`);
    const pos = `${s.turnNumber}|${s.phase}|${s.history?.length}|${lesson.beat?.id}|${JSON.stringify(lesson.beat?.lit)}`;
    still = pos === last ? still + 1 : 0;
    last = pos;
    // A silent tier deliberately shows nothing; the 6 s safety net brings a whisper. Wait past
    // that before calling it stuck.
    if (still > 70) {
      const pts = lesson.beat ? await litPoints(p, lesson.beat.lit) : [];
      const under = pts[0] ? await p.evaluate(`(() => { const e = document.elementFromPoint(${pts[0].x}, ${pts[0].y}); return e ? (e.tagName + '#' + e.id + '.' + (e.getAttribute('class') || '') + ' < ' + (e.closest('[id]') || {}).id) : 'none'; })()`) : 'no point';
      const sel = await hook(p, 'sel');
      if (SHOTS) await p.screenshot({ path: `${SHOTS}/stuck-L${level}.png` });
      throw new Error(`L${level}: stuck at ${pos}; point ${JSON.stringify(pts[0])} is ${under}; sel ${JSON.stringify(sel)}; lesson ${JSON.stringify(lesson)}`);
    }
    const beat = lesson.beat;
    if (!beat) {
      // SILENT is a real state: the light deliberately says nothing. A player who already knows
      // the move makes it; the test does the same rather than waiting out the 6 s safety net.
      if (lesson.stage || !lesson.handSettled) { await p.waitForTimeout(120); continue; }
      const move = await hook<any>(p, 'lessonMove');
      if (move) {
        const ok = await p.evaluate((a) => (window as any).__severgrow.playFor(a, 0), move);
        if (ok) { taps++; await idle(p); continue; }
      }
      await p.waitForTimeout(250);
      continue;
    }
    // Every step (including an explanation that lights a home, a rock, the sign or a pile): the
    // caption may move to another gap, but it must never sit on the lit thing.
    if (beat.id !== lastPlate) {
      lastPlate = beat.id;
      await p.waitForTimeout(220);
      await checkPlateClear(p, beat.lit, `L${level} ${beat.id}`);
    }
    if (beat.explain) { await dismissExplanation(p); taps++; continue; }
    // A power hello is information, not a target. It fades by itself; then the ordinary move.
    if ((beat as { hello?: string }).hello) { await p.waitForTimeout(2800); continue; }
    const points = (await litPoints(p, beat.lit)).filter((x): x is { x: number; y: number } => !!x);
    if (!points.length) { await p.waitForTimeout(200); continue; }
    for (const pt of points) {
      const seq = (await hook<{ answers: number } | null>(p, 'lesson'))?.answers ?? 0;
      await p.mouse.click(pt.x, pt.y);
      taps++;
      await p.waitForTimeout(140);
      const after = await hook<{ answer: string; answers: number } | null>(p, 'lesson');
      if (after && after.answers > seq) { wrong++; console.log(`     L${level} answer after a lit tap: ${after.answer} (${beat.id})`); break; }
    }
    await idle(p);
  }
  throw new Error(`L${level}: never finished`);
};

/** With hints off there is no light: play the page's legal moves (the lesson's own suggestion). */
const tapOnlyTheLightHintsOff = async (p: Page, level: number) => {
  const t0 = Date.now();
  for (; Date.now() - t0 < 240000;) {
    const s = await hook<any>(p, 'state');
    if (s.phase === 'GAME_OVER') return { winner: s.result?.winner, reason: s.result?.reason };
    if (s.actor !== 0 || (await p.evaluate(() => (window as any).__severgrow.busy()))) { await p.waitForTimeout(120); continue; }
    const ok = await p.evaluate(`(() => { const g = window.__severgrow; const a = g.lessonMove(); return a ? g.playFor(a, 0) : false; })()`);
    if (!ok) throw new Error(`L${level}: hints off, no move`);
    await idle(p);
  }
  throw new Error(`L${level}: hints off, never finished`);
};

const results: string[] = [];
try {
  if (ONLY === 'all' || ONLY === 'run') {
    console.log('Levels 1-10 in a row, tapping only the light:');
    const { page, errors } = await newPage();
    await page.goto(URL3, { waitUntil: 'networkidle' });
    await installDealAudit(page);
    await openNextLevel(page);
    // THE COLD FIRST BOARD (owner, 2026-10-20): the first level of a fresh visit may wait for the
    // art it composes, but only briefly — an 800 ms cap, never over 1.2 s — and the visit is then
    // marked warmed. This page is cold (a fresh context), so the wait is reported here.
    const warm = await page.evaluate(() => (window as any).__severgrow.warm());
    check(!!warm && warm.cold === true && warm.waitedMs >= 0 && warm.waitedMs <= 1200,
      `the cold first board waits for its art, bounded (${warm?.waitedMs} ms, cap 800)`);
    for (let level = 1; level <= 10; level++) {
      if (level > 1) {
        await page.waitForSelector('#gameover:not([hidden])', { timeout: 30000 });
        await dismissInstall(page);
        await installDealAudit(page);
        await page.evaluate(() => (document.getElementById('go-rematch') as HTMLButtonElement).click());
        await page.waitForFunction((n) => (window as any).__severgrow?.lesson?.()?.level === n, level, { timeout: 15000 });
      }
      await page.waitForFunction(() => {
        const l = (window as any).__severgrow?.lesson?.();
        return !!l && !l.stage && l.handSettled;
      }, undefined, { timeout: 15000 });
      if (SHOTS && (level === 1 || level === 5 || level === 10)) await page.screenshot({ path: `${SHOTS}/L${level}-first-frame.png` });
      const hexes = await page.evaluate(() => document.querySelectorAll('#board .hex-cell').length);
      check(hexes === 19, `L${level} plays on the 19-hex map (${hexes})`);
      // The header stays the menu and the logo. Teaching sits under the map, which stays full size.
      await page.waitForFunction((n) => document.documentElement.dataset.lesson === String(n), level, { timeout: 10000 }).catch(() => undefined);
      const lg = await geometry(page);
      checkCockpit(lg, `L${level}`, true);
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/L${level}-open.png` });
      const r = await tapOnlyTheLight(page, level);
      // The observer saw the whole level: no hint may have appeared before the deal settled, and
      // the first one (where the level has one) came after it.
      await checkDealAudit(page, level, level !== 10);
      check(r.winner === 0, `L${level} won by ${r.reason} in ${r.turns} turns, ${r.taps} taps, ${r.wrong} wrong, ${(r.ms / 1000).toFixed(0)}s`);
      if (level === 1) {
        check(r.wrong === 0, 'L1: zero wrong taps');
        check(r.ms < 180000, 'L1: under 3 minutes');
      }
      await page.waitForSelector('#gameover:not([hidden])', { timeout: 30000 });
      const card = await page.evaluate(() => ({
        title: document.getElementById('go-title')?.textContent?.trim(),
        line: document.getElementById('go-learned')?.textContent?.trim(),
        seeds: !(document.getElementById('go-seeds')?.hidden ?? true) ? document.getElementById('go-seeds')?.textContent?.trim() : '',
      }));
      check(!!card.line, `L${level} finish card: ${card.title} / ${card.line}`);
      check(!card.seeds, `L${level} finish card has no Seeds line`);
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/L${level}-finish.png` });
      results.push(`L${level}: ${r.reason}, ${r.turns} turns, ${r.wrong} wrong taps`);
      const words = await page.evaluate(() => document.querySelectorAll('.tap-why').length);
      check(words === 0, `L${level}: no text drawn on the map`);
    }
    // Level 11 hands over to the 37-hex board, with no lesson.
    await dismissInstall(page);
    await page.evaluate(() => (document.getElementById('go-rematch') as HTMLButtonElement).click());
    await page.waitForFunction(() => !!(window as any).__severgrow?.state?.(), undefined, { timeout: 15000 });
    await page.waitForTimeout(900);
    const big = await page.evaluate(() => document.querySelectorAll('#board .hex-cell').length);
    check(big === 37, `level 11 is the 37-hex board (${big})`);
    check((await hook(page, 'lesson')) === null, 'level 11 has no lesson');
    // /3 kept its own storage: nothing written under the root's prefix.
    const keys = await page.evaluate(() => Object.keys(localStorage));
    check(keys.some((k) => k.startsWith('futa05-3:')), '/3 writes under its own prefix');
    check(!keys.some((k) => k.startsWith('futa05:')), '/3 never writes the root or /2 keys');
    assert.deepEqual(errors, [], `no page errors: ${errors.join(' | ')}`);

    // A REPEAT VISIT ADDS NOTHING (owner, 2026-10-20): the cold board wrote the warmed marker, so a
    // later start must not wait for art again — in the SAME browser profile, which is what a person
    // has. "Start this level over" is the path that really calls startGame afresh (a resume reuses
    // the saved match and never reaches the warm at all), so it is the honest place to prove it.
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('#menu-play:not([hidden])', { timeout: 20000 });
    await dismissInstall(page);
    await page.evaluate(() => (document.getElementById('menu-play') as HTMLButtonElement).click());
    await page.waitForSelector('#menu-campaign:not([hidden])', { timeout: 10000 });
    await dismissInstall(page);
    await page.evaluate(() => (document.getElementById('menu-campaign') as HTMLButtonElement).click());
    await page.waitForSelector('#sheet-campaign-start:not([hidden])', { timeout: 15000 });
    await page.evaluate(() => (document.getElementById('csa-start') as HTMLButtonElement).click());
    await page.waitForFunction(() => !!(window as any).__severgrow?.state?.(), undefined, { timeout: 15000 });
    const warmAgain = await page.evaluate(() => (window as any).__severgrow.warm());
    check(!!warmAgain && warmAgain.cold === false && warmAgain.waitedMs === 0,
      `a repeat visit does not wait for art (${JSON.stringify(warmAgain)})`);
    const marker = await page.evaluate(() => Object.keys(localStorage).some((k) => k.endsWith('severgrow.board-warmed.v1')));
    check(marker, 'the warmed marker is kept for the next visit');
    assert.deepEqual(errors, [], `the repeat visit: no page errors: ${errors.join(' | ')}`);
    await page.close();
  }
  if (ONLY === 'all' || ONLY === 'robust') {
    console.log('\nRobustness:');
    // --- Level 1, a player who ignores the words and taps anywhere ---
    {
      const { page, errors } = await newPage();
      await page.goto(URL3, { waitUntil: 'networkidle' });
      await openNextLevel(page);
      // Cards before drawing: every one is answered, none is played.
      const st0 = await hook<any>(page, 'state');
      // (the two explanations first: a tap anywhere, at a person's pace: a tap in an
      // explanation's first moments is deliberately ignored)
      for (let i = 0; i < 8 && (await hook<any>(page, 'lesson'))?.beat?.explain; i++) { await dismissExplanation(page); }
      const cardPt = await page.evaluate(`(() => { const r = document.querySelector('#hand .card').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`) as { x: number; y: number };
      await page.mouse.click(cardPt.x, cardPt.y);
      await page.waitForTimeout(150);
      const ans = (await hook<any>(page, 'lesson')).answer;
      check(ans === 'DRAW FIRST', `a card tapped before drawing: "${ans}"`);
      check((await hook<any>(page, 'state')).history.length === st0.history.length, 'and nothing was played');
      // Random taps all over the screen. Every tap on a game thing either does something or is answered.
      let silent = 0; let tries = 0;
      const rnd = (() => { let x = 12345; return () => ((x = (x * 1103515245 + 12345) % 2147483648) / 2147483648); })();
      const vp = page.viewportSize()!;
      for (let i = 0; i < 160; i++) {
        const s = await hook<any>(page, 'state');
        if (s.phase === 'GAME_OVER') break;
        if (s.actor !== 0 || (await page.evaluate(() => (window as any).__severgrow.busy()))) { await page.waitForTimeout(150); continue; }
        const x = 8 + rnd() * (vp.width - 16); const y = 60 + rnd() * (vp.height - 70);
        const kind = await page.evaluate(`(() => { const e = document.elementFromPoint(${x}, ${y}); if (!e) return 'other';
          if (e.closest('#hud, #hud-menu, #futasaku-glass, .sheet, #scrim, #gameover')) return 'chrome';
          if (e.closest('#hand [data-card]')) return 'card'; if (e.closest('#deck')) return 'deck'; if (e.closest('#discard')) return 'discard';
          if (e.closest('#board [data-key]')) return 'hex'; return 'other'; })()`) as string;
        if (kind === 'chrome') continue;
        const l1 = await hook<any>(page, 'lesson');
        const before = JSON.stringify([s.history.length, s.phase, await hook(page, 'sel'), l1?.seen?.length]);
        const acksBefore = l1?.floorAcks ?? 0;
        await page.mouse.click(x, y);
        await page.waitForTimeout(160);
        const s2 = await hook<any>(page, 'state');
        const l2 = await hook<any>(page, 'lesson');
        const after = JSON.stringify([s2.history.length, s2.phase, await hook(page, 'sel'), l2?.seen?.length]);
        if (kind !== 'other') {
          tries++;
          // A tap inside the explanation's reading floor is refused on purpose (owner, 2026-10-21),
          // and it is ACKNOWLEDGED with a pulse of the caption - counted as `floorAcks`. So a refusal
          // is an answer here; only a tap that changed nothing AND was acknowledged by nothing is
          // silent. The guarantee is unchanged, it now names the third way a tap can be answered.
          const acked = (l2?.floorAcks ?? 0) > acksBefore;
          if (before === after && !l2?.answer && !acked) { silent++; console.log(`     silent ${kind} tap at ${x.toFixed(0)},${y.toFixed(0)} (${l2?.beat?.id})`); }
        }
      }
      check(silent === 0, `random taps: ${tries} taps on game things, every one did something or was answered`);
      // Never stuck: the light still finishes the level from wherever the random taps left it.
      const r = await tapOnlyTheLight(page, 1);
      check(r.winner === 0, `after random taps, L1 still finishes and is won (${r.reason})`);
      check((await page.evaluate(() => document.querySelectorAll('.tap-why').length)) === 0, 'no text drawn on the map');
      assert.deepEqual(errors, [], `no page errors: ${errors.join(' | ')}`);
      await page.close();
    }
    // --- Every explanation fits in four lines in the real box, on the smallest phone ---
    {
      const { page } = await newPage(320, 568);
      await page.goto(URL3, { waitUntil: 'networkidle' });
      await openNextLevel(page);
      await page.waitForSelector('#lesson-plate .lesson-copy', { timeout: 10000 });
      // Measure in the game's own fonts: on a slow machine the box can be on screen before the web
      // fonts have loaded, and the wider fallback font then wraps a line that players never see wrap.
      await page.evaluate(() => document.fonts.ready.then(() => undefined));
      const over: string[] = [];
      for (const [k, v] of Object.entries(LESSON)) {
        if (typeof v !== 'string' || !k.endsWith('Line')) continue;
        // Measure the copy itself, not the four-line clamp that keeps the box from growing.
        const n = await page.evaluate(`(() => { const el = document.querySelector('#lesson-plate .lesson-copy');
          el.style.display = 'block'; el.style.webkitLineClamp = 'unset'; el.style.overflow = 'visible';
          el.textContent = ${JSON.stringify(v)}; const lh = parseFloat(getComputedStyle(el).lineHeight); return Math.round(el.getBoundingClientRect().height / lh); })()`) as number;
        if (n > 4) over.push(`${k} (${n} lines)`);
      }
      check(over.length === 0, `every explanation fits in four lines at 320 px${over.length ? `: ${over.join(', ')}` : ''}`);
      await page.close();
    }
    // --- Level 3: the same wrong hex again and again; a refresh in the middle; hints off ---
    {
      const { page, errors } = await newPage(360, 640);
      await page.goto(URL3, { waitUntil: 'networkidle' });
      // Levels 1-2 already cleared on this device (the progress record, as a player who did them).
      const done = CAMPAIGN_LEVELS.slice(0, 2).map((l) => l.id);
      await page.evaluate(`localStorage.setItem('severgrow.campaign.progress.v3', ${JSON.stringify(JSON.stringify({ version: 1, unlocked: 3, completed: done, best: {} }))})`);
      await page.reload({ waitUntil: 'networkidle' });
      await openNextLevel(page);
      const lv = (await hook<any>(page, 'lesson'))?.level;
      if (lv !== 3) console.log(`     (progress format differs: opened level ${lv}; robustness continues there)`);
      // Through the intro, draw, then tap the rock five times.
      const level = lv ?? 1;
      for (let i = 0; i < 8 && (await hook<any>(page, 'lesson'))?.beat?.explain; i++) { await dismissExplanation(page); }
      const deck = (await litPoints(page, { t: 'deck' }))[0]!;
      await page.mouse.click(deck.x, deck.y); await idle(page); await page.waitForTimeout(300);
      if (level === 3) {
        const rock = (await litPoints(page, { t: 'hex', key: '-1,0' }))[0]!;
        const answers = new Set<string>();
        const h0 = (await hook<any>(page, 'state')).history.length;
        for (let i = 0; i < 5; i++) { await page.mouse.click(rock.x, rock.y); await page.waitForTimeout(120); answers.add((await hook<any>(page, 'lesson')).answer); }
        check(answers.size === 1 && answers.has('ROCK BLOCKS THIS'), `the rock tapped 5 times: always "${[...answers].join('/')}"`);
        check((await hook<any>(page, 'state')).history.length === h0, 'and nothing was played');
      }
      // Refresh in the middle of the level: the same position, the explanations stay read.
      const before = await hook<any>(page, 'state');
      const seen = (await hook<any>(page, 'lesson')).seen;
      await page.reload({ waitUntil: 'networkidle' });
      await openNextLevel(page);
      const after = await hook<any>(page, 'state');
      check(after.history.length === before.history.length && after.phase === before.phase, `refresh mid-level resumes the same position (${after.phase}, ${after.history.length} events)`);
      check(JSON.stringify((await hook<any>(page, 'lesson')).seen) === JSON.stringify(seen), 'and the explanations already read stay read');
      // Hints off: the glass and the light step away; a wrong tap is answered on the LED instead.
      await page.evaluate(() => localStorage.setItem('severgrow-guide', 'off'));
      await page.reload({ waitUntil: 'networkidle' });
      await openNextLevel(page);
      await page.waitForTimeout(500);
      const glass = await page.evaluate(() => { const g = document.getElementById('futasaku-glass'); return !!g && !g.hidden; });
      check(!glass, 'hints off: no glass window');
      const r = await tapOnlyTheLightHintsOff(page, level);
      check(r.winner === 0, `hints off: the level still plays to a win (${r.reason})`);
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/hints-off-finish.png` });
      assert.deepEqual(errors, [], `no page errors: ${errors.join(' | ')}`);
      await page.close();
    }
  }
  if (ONLY === 'all' || ONLY === 'bloom') {
    console.log('\nL5 Bloom explanation: the owner copy and the compact example in the same box:');
    for (const [w, h] of [[360, 640], [390, 844]] as const) {
      const tag = `${w}x${h}`;
      const { page, errors } = await newPage(w, h);
      await page.goto(URL3, { waitUntil: 'networkidle' });
      const done = CAMPAIGN_LEVELS.slice(0, 4).map((l) => l.id);
      await page.evaluate(`localStorage.setItem('severgrow.campaign.progress.v3', ${JSON.stringify(JSON.stringify({ version: 1, unlocked: 5, completed: done, best: {} }))})`);
      await page.reload({ waitUntil: 'networkidle' });
      await openNextLevel(page);
      await page.waitForSelector('#lesson-plate:not([hidden]) .lesson-copy', { timeout: 15000 });
      await page.waitForFunction(() => (window as any).__severgrow?.lesson?.()?.beat?.id === '5:intro:bloom-cards', undefined, { timeout: 15000 });
      await page.waitForTimeout(500);
      const beat = await hook<any>(page, 'lesson');
      const g = await geometry(page);
      check(g.plateCopy.includes('three in order in one suit'), `${tag}: the Bloom sentence says three in order in one suit`);
      check(!g.plateCopy.includes('in a row'), `${tag}: the Bloom sentence never says in a row`);
      const ex = await page.evaluate(`(() => {
        const plate = document.getElementById('lesson-plate');
        const box = plate.querySelector('.lesson-example');
        const cards = [...(box ? box.querySelectorAll('.lesson-example-card') : [])];
        const rows = [...(box ? box.querySelectorAll('.lesson-example-row') : [])].filter(r => !r.hidden);
        const size = (c) => { const r = c.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; };
        return {
          present: !!box && !box.hidden,
          inside: box ? box.parentElement === plate : false,
          rows: rows.map(r => r.querySelectorAll('.lesson-example-card').length),
          cards: cards.length,
          nums: cards.map(c => (c.querySelector('.c-num')?.textContent || '').trim()),
          sizes: cards.map(size),
          fonts: cards.map(c => parseFloat(getComputedStyle(c.querySelector('.c-num')).fontSize)),
          animations: box ? box.getAnimations({ subtree: true }).length : -1,
          platePosition: getComputedStyle(plate).position,
          padTop: parseFloat(getComputedStyle(document.getElementById('board-wrap')).paddingTop) || 0,
          scroll: { h: document.documentElement.scrollHeight, ih: innerHeight },
        };
      })()`) as {
        present: boolean; inside: boolean; rows: number[]; cards: number; nums: string[];
        sizes: { w: number; h: number }[]; fonts: number[]; animations: number;
        platePosition: string; padTop: number; scroll: { h: number; ih: number };
      };
      check(ex.inside, `${tag}: the example lives inside the ONE caption box (no new overlay)`);
      // On a short phone the box may sit over unlit hexes, so both rows always fit. On a tall
      // phone the free gap is about 54 px: the example gives way (run row first, then the whole
      // example) rather than covering a hex or pushing the map — the sentence always stays.
      if (ex.present) {
        check(ex.rows.length >= 1 && ex.rows.length <= 2 && ex.rows.every((n) => n === 3), `${tag}: the set, and the run when it fits (${ex.rows.join(' + ')})`);
        check(ex.nums.slice(0, 3).join('') === '333', `${tag}: the set is 3-3-3 (${ex.nums.slice(0, 3).join('-')})`);
        check(ex.rows.length === 1 || ex.nums.slice(3).join('') === '345', `${tag}: a second row is the run 3-4-5 (${ex.nums.slice(3).join('-') || 'dropped to fit'})`);
        const smallest = Math.min(...ex.sizes.map((s) => s.w));
        check(smallest >= 20, `${tag}: every example face is legible at this width (${smallest}px wide)`);
        check(Math.min(...ex.fonts) >= 10, `${tag}: the example numbers are at least 10 px (${Math.min(...ex.fonts)}px)`);
      }
      if (h < 800) {
        check(ex.present && ex.rows.length === 2, `${tag}: the short phone shows both rows (${ex.rows.join(' + ')})`);
      } else if (!ex.present) {
        // The tall phone kept the sentence and took the example away, exactly so the caption
        // stays in its gap (checkCockpit asserts it covers no hex at this height).
        check(!!g.plateCopy, `${tag}: the tall phone keeps the sentence when the example cannot fit`);
        check(ex.cards === 0, `${tag}: and leaves no example markup behind`);
      } else {
        check(true, `${tag}: the tall phone fits the example in its gap (${ex.rows.join(' + ')})`);
      }
      check(ex.animations === 0, `${tag}: the example is static (no animation)`);
      check(ex.platePosition === 'fixed' && ex.padTop < 2, `${tag}: the box never pushes the map (${ex.platePosition}, pad ${ex.padTop}px)`);
      check(ex.scroll.h <= ex.scroll.ih + 1, `${tag}: the example adds no page scroll`);
      checkCockpit(g, tag, true);
      await checkPlateClear(page, beat.beat.lit, `${tag} Bloom example`);

      // The lit lesson card is a pressable surface like every other card.
      const pts = await litPoints(page, beat.beat.lit);
      check(!!pts[0], `${tag}: the explanation lights a card`);
      if (pts[0]) {
        await page.mouse.move(pts[0].x, pts[0].y);
        await page.mouse.down();
        await page.waitForTimeout(40);
        const painted = await page.evaluate(`(() => {
          const el = document.querySelector('[data-pressed="true"]');
          return { any: !!el, card: !!el && !!el.closest('#hand .card'), what: el ? (el.id || el.className || el.tagName) : 'none', under: (() => { const u = document.elementFromPoint(${pts[0].x}, ${pts[0].y}); return u ? (u.id || u.className || u.tagName) : 'none'; })() };
        })()`) as { any: boolean; card: boolean; what: string; under: string };
        await page.mouse.up();
        check(painted.card, `${tag}: the lit lesson card paints the press (${painted.what} / under ${painted.under})`);
      }
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/bloom-example-${w}x${h}.png` });
      assert.deepEqual(errors, [], `${tag} Bloom example: no page errors: ${errors.join(' | ')}`);
      await page.close();

      // The same box under Reduce motion: present, still, and clear of the lit card.
      const rm = await browser.newPage({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true });
      await rm.bringToFront();
      const rmErrors: string[] = [];
      rm.on('pageerror', (e) => rmErrors.push(e.message));
      await rm.addInitScript(`
        localStorage.setItem('futa05-3:severgrow.settings.v1', ${JSON.stringify(JSON.stringify({ sound: false, music: false, coach: false, autoSkip: false, reduceMotion: true, speed: 'normal' }))});
        localStorage.setItem('futa05:severgrow.settings.v1', ${JSON.stringify(JSON.stringify({ sound: false, music: false, coach: false, autoSkip: false, reduceMotion: true, speed: 'normal' }))});
      `);
      await rm.goto(URL3, { waitUntil: 'networkidle' });
      await rm.evaluate(`localStorage.setItem('severgrow.campaign.progress.v3', ${JSON.stringify(JSON.stringify({ version: 1, unlocked: 5, completed: done, best: {} }))})`);
      await rm.reload({ waitUntil: 'networkidle' });
      await openNextLevel(rm);
      // Wait for the Bloom beat itself. The example is only present when the fit rule allows it:
      // on a tall phone the box would cover a hex, so it is deliberately dropped. Waiting for it
      // to be visible would contradict the "never cover the map" rule.
      await rm.waitForFunction(() => (window as any).__severgrow?.lesson?.()?.beat?.id === '5:intro:bloom-cards', undefined, { timeout: 15000 });
      await rm.waitForTimeout(400);
      const rmEx = await rm.evaluate(`(() => {
        const box = document.querySelector('#lesson-plate .lesson-example');
        return {
          reduce: document.documentElement.classList.contains('reduce-motion'),
          cards: box ? box.querySelectorAll('.lesson-example-card').length : 0,
          animations: box ? box.getAnimations({ subtree: true }).length : -1,
          plateAnimations: document.getElementById('lesson-plate').getAnimations({ subtree: true }).length,
        };
      })()`) as { reduce: boolean; cards: number; animations: number; plateAnimations: number };
      check(rmEx.reduce, `${tag} reduce motion: the page is in its reduce-motion state`);
      // The same fit rule applies: both rows on a short phone; on a tall phone the example yields
      // to the gap, but it is still static (nothing animates either way).
      if (h < 800) check(rmEx.cards === 6, `${tag} reduce motion: the example still shows both rows (${rmEx.cards} faces)`);
      else check(rmEx.cards === 0 || rmEx.cards === 6, `${tag} reduce motion: the example follows the same fit rule (${rmEx.cards} faces)`);
      check(rmEx.animations === 0 && rmEx.plateAnimations === 0, `${tag} reduce motion: the example and the box are static`);
      await checkPlateClear(rm, (await hook<any>(rm, 'lesson')).beat.lit, `${tag} reduce motion Bloom example`);
      if (SHOTS) await rm.screenshot({ path: `${SHOTS}/bloom-example-${w}x${h}-reduce.png` });
      assert.deepEqual(rmErrors, [], `${tag} reduce motion Bloom example: no page errors: ${rmErrors.join(' | ')}`);
      await rm.close();
    }
  }
  if (ONLY === 'all' || ONLY === 'breath') {
    console.log('\nThe lit thing breathes until the player acts, and the display speaks the action:');
    const { page, errors } = await newPage();
    await page.goto(URL3, { waitUntil: 'networkidle' });
    await openNextLevel(page);
    // Past the opening explanations to the plain Draw beat (a pile, no sentence).
    for (let i = 0; i < 5; i++) {
      const b = (await hook<any>(page, 'lesson'))?.beat;
      if (!b?.explain) break;
      await dismissExplanation(page);
    }
    await page.waitForFunction(() => (window as any).__severgrow?.lesson?.()?.beat?.id === 'draw', undefined, { timeout: 15000 });
    await page.waitForTimeout(300);

    // THE DISPLAY: the action, in at most three words, and never the score.
    const shown = await displayState(page);
    check(shown.text === LESSON.tapDraw, `the display reads the action line (${shown.text})`);
    check(wordCount(shown.text) <= 3 && wordCount(shown.text) >= 1, `and it is ${wordCount(shown.text)} words (<= 3)`);
    check(!/^\d+:\d+$/.test(shown.text) && shown.mode !== 'score', `the score never holds the display while there is an action (${shown.mode})`);

    // THE PULSE, on a pile: still running after ten seconds of no input.
    const deckFirst = await animationsOf(page, '#deck');
    check(!!deckFirst && deckFirst.breath.length === 1 && deckFirst.breath[0]!.state === 'running',
      `the lit Draw pile has exactly one running lesson breath (${deckFirst?.names.join(' + ')})`);
    const ownPile = deckFirst?.each.find((e) => e.name === 'futa04-draw-pile-breathe');
    check(!ownPile || ownPile.state === 'paused',
      `and its own breathe is held still, so two pulses never run out of step (${ownPile?.state ?? 'not running'})`);
    await page.waitForTimeout(10_000);
    const deckLater = await animationsOf(page, '#deck');
    check(!!deckLater && deckLater.breath.length === 1 && deckLater.breath[0]!.state === 'running',
      'after 10 s with no input the lit Draw pile is still breathing');
    const ownPileLater = deckLater?.each.find((e) => e.name === 'futa04-draw-pile-breathe');
    check(!ownPileLater || ownPileLater.state === 'paused',
      `and still just the one pulse (${ownPileLater?.state ?? 'not running'})`);
    check(!!deckLater && deckLater.breath[0]!.props.every((p) => p === 'scale' || p === 'opacity' || p === 'transform'),
      `the breath animates transform only (${deckLater?.breath[0]?.props.join(', ')})`);
    check(!!deckLater && !deckLater.props.some((p) => /filter|shadow|background/i.test(p)),
      `and the lit pile carries no filter/shadow animation (${deckLater?.props.join(', ')})`);
    const stillBeat = (await hook<any>(page, 'lesson'))?.beat?.id;
    check(stillBeat === 'draw', `the beat is still live after the idle wait (${stillBeat})`);

    // A hidden page holds the breath where it is (the same signal the hand's breath uses).
    const hidden = await page.evaluate(`(async () => {
      const were = Object.getOwnPropertyDescriptor(Document.prototype, 'hidden');
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      document.dispatchEvent(new Event('visibilitychange'));
      const el = document.getElementById('deck');
      const anims = el.getAnimations().filter((a) => a.id === 'lesson-beat-breath');
      const paused = anims.map((a) => a.playState);
      Object.defineProperty(document, 'hidden', were ?? { configurable: true, value: false });
      document.dispatchEvent(new Event('visibilitychange'));
      return { paused, resumed: el.getAnimations().filter((a) => a.id === 'lesson-beat-breath').map((a) => a.playState) };
    })()`) as { paused: string[]; resumed: string[] };
    check(hidden.paused.length === 1 && hidden.paused[0] === 'paused', `a hidden page pauses the breath (${hidden.paused.join(',')})`);
    check(hidden.resumed.length === 1 && hidden.resumed[0] === 'running', `and coming back resumes it (${hidden.resumed.join(',')})`);

    // THE PULSE, on a card: the Grow sentence's card keeps breathing for as long as it is live.
    const deckPt = (await litPoints(page, { t: 'deck' }))[0]!;
    await page.mouse.click(deckPt.x, deckPt.y);
    await idle(page);
    await page.waitForFunction(() => (window as any).__severgrow?.lesson?.()?.beat?.id === '1:idea:first-grow', undefined, { timeout: 15000 });
    const cardId = (await hook<any>(page, 'lesson')).beat.lit.id as number;
    const cardSel = `#hand .card[data-card="${cardId}"]`;
    const cardFirst = await animationsOf(page, cardSel);
    check(!!cardFirst && cardFirst.breath.length === 1 && cardFirst.breath[0]!.state === 'running',
      `the lit card breathes while its sentence is open (${cardFirst?.breath.length})`);
    await page.waitForTimeout(10_000);
    const cardLater = await animationsOf(page, cardSel);
    check(!!cardLater && cardLater.breath.length === 1 && cardLater.breath[0]!.state === 'running',
      'after 10 s with no input the lit card is still breathing');
    check(!!cardLater && !cardLater.props.some((p) => /filter|shadow|background/i.test(p)),
      `and the lit card carries no filter/shadow animation (${cardLater?.props.join(', ')})`);
    check(!!cardLater && cardLater.breath[0]!.props.every((p) => p === 'scale' || p === 'opacity' || p === 'transform'),
      `the card's breath animates transform only (${cardLater?.breath[0]?.props.join(', ')})`);

    // THE GUARD: the 650 ms window belongs to a tap meant for the move that just happened. On the
    // lit target it is gone — proven in the page's own clock, by tapping the instant the sentence
    // appears (the watcher is installed before that sentence exists).
    const guardRun = await newPage();
    const guardPage = guardRun.page;
    await guardPage.goto(URL3, { waitUntil: 'networkidle' });
    await openNextLevel(guardPage);
    for (let i = 0; i < 3; i++) {
      const b = (await hook<any>(guardPage, 'lesson'))?.beat;
      if (b?.explain && b.lit.t === 'deck') break;
      await dismissExplanation(guardPage);
    }
    await guardPage.evaluate(`(() => {
      window.__guard = new Promise((resolve) => {
        const g = window.__severgrow;
        const started = performance.now();
        const tick = () => {
          const l = g.lesson();
          if (l && l.beat && l.beat.explain && l.beat.lit && l.beat.lit.t === 'deck') {
            const age = Math.round(performance.now() - l.explainAt);
            const before = g.state().history.length;
            document.getElementById('deck').click();
            resolve({ age, before, beat: l.beat.id });
            return;
          }
          if (performance.now() - started > 20000) { resolve({ age: -1, before: -1, beat: '' }); return; }
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
    })()`);
    const guard = await guardPage.evaluate('window.__guard') as { age: number; before: number; beat: string };
    check(guard.age >= 0 && guard.age < 650, `the lit Draw pile was tapped ${guard.age} ms after its sentence appeared (inside the old 650 ms guard)`);
    await guardPage.waitForFunction((n) => (window as any).__severgrow.state().history.length > n, guard.before, { timeout: 10000 }).catch(() => undefined);
    const guardAfter = await hook<any>(guardPage, 'state');
    check(guardAfter.history.length === guard.before + 1 && guardAfter.history.at(-1)?.t === 'Draw',
      `and that one tap still drew (${guardAfter.history.length - guard.before} move)`);
    const guardSeen = (await hook<any>(guardPage, 'lesson'))?.seen ?? [];
    check(guardSeen.includes(guard.beat), 'and the sentence was marked read by the same tap');
    assert.deepEqual(guardRun.errors, [], `the guard tap: no page errors: ${guardRun.errors.join(' | ')}`);
    await guardPage.close();

    // Reduce motion: a static lit state, no endless animation.
    const rm = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await rm.bringToFront();
    await rm.addInitScript(`
      localStorage.setItem('futa05-3:severgrow.settings.v1', ${JSON.stringify(JSON.stringify({ sound: false, music: false, coach: true, autoSkip: false, reduceMotion: true, speed: 'normal' }))});
    `);
    await rm.goto(URL3, { waitUntil: 'networkidle' });
    await openNextLevel(rm);
    for (let i = 0; i < 5; i++) {
      const b = (await hook<any>(rm, 'lesson'))?.beat;
      if (!b?.explain) break;
      await dismissExplanation(rm);
    }
    await rm.waitForFunction(() => (window as any).__severgrow?.lesson?.()?.beat?.id === 'draw', undefined, { timeout: 15000 });
    const rmAnims = await animationsOf(rm, '#deck');
    check(!!rmAnims && rmAnims.breath.length === 0, `reduce motion: the lit pile is static (${rmAnims?.breath.length} breaths)`);
    await rm.close();

    assert.deepEqual(errors, [], `breath/display: no page errors: ${errors.join(' | ')}`);
    await page.close();
  }
  if (ONLY === 'all' || ONLY === 'restart') {
    // Owner, 2026-10-22: a lesson that can no longer teach its idea offers START AGAIN in the box,
    // and one tap restarts the same level in place (never a trip to the menu).
    console.log('\nA stuck lesson: START AGAIN in the box restarts the level in place:');
    const { page, errors } = await newPage(390, 844);
    await page.goto(URL3, { waitUntil: 'networkidle' });
    const done = CAMPAIGN_LEVELS.slice(0, 7).map((l) => l.id);
    await page.evaluate(`localStorage.setItem('severgrow.campaign.progress.v3', ${JSON.stringify(JSON.stringify({ version: 1, unlocked: 8, completed: done, best: {} }))})`);
    await page.reload({ waitUntil: 'networkidle' });
    await openNextLevel(page);
    check((await hook<any>(page, 'lesson'))?.level === 8, 'the Blast lesson is open');
    // Spend ONE Bomb on its own: two Bombs are needed for the Blast, so the lesson cannot finish.
    let spent = false;
    for (let i = 0; i < 6 && !spent; i++) {
      await idle(page);
      spent = await page.evaluate(() => {
        const h = (window as any).__severgrow;
        if (h.state().actor !== 0) return false;
        const legal = h.legal() as { t: string }[];
        const bomb = legal.find((a) => a.t === 'PlayFruit');
        if (bomb) return h.playFor(bomb, 0) && 'spent';
        const draw = legal.find((a) => a.t === 'Draw');
        if (draw) h.playFor(draw, 0);
        return false;
      }) === 'spent';
    }
    check(spent, 'one Bomb was played on its own');
    await page.waitForFunction(() => (window as any).__severgrow?.lesson?.()?.beat?.id === 'restart', undefined, { timeout: 15000 });
    await page.waitForSelector('#lesson-plate:not([hidden]) .lesson-restart', { timeout: 5000 });
    const stuck = await page.evaluate(() => {
      const plate = document.getElementById('lesson-plate')!;
      const btn = plate.querySelector<HTMLButtonElement>('.lesson-restart')!;
      const r = btn.getBoundingClientRect();
      const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return {
        copy: plate.querySelector('.lesson-copy')?.textContent ?? '', label: btn.textContent ?? '',
        hit: at === btn || btn.contains(at), w: r.width, h: r.height,
        onScreen: r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth,
      };
    });
    check(stuck.copy === LESSON.restartLine, `the box explains why (${stuck.copy})`);
    check(stuck.label === LESSON.startAgain, `the button says ${LESSON.startAgain} (${stuck.label})`);
    check(stuck.onScreen && stuck.h >= 40, `the button is on screen and thumb-sized (${stuck.w}x${stuck.h})`);
    check(stuck.hit, 'a tap on the button reaches the button');
    await page.tap('#lesson-plate .lesson-restart');
    await page.waitForFunction(() => {
      const h = (window as any).__severgrow;
      const s = h?.state?.();
      return !!s && s.hands[0].filter((c: { suit: number | null }) => c.suit === null).length >= 2 && h.lesson?.()?.beat?.id !== 'restart';
    }, undefined, { timeout: 15000 });
    const after = await page.evaluate(() => ({
      level: (window as any).__severgrow.lesson()?.level,
      game: !document.getElementById('game')!.hidden,
      buttons: document.querySelectorAll('#lesson-plate button').length,
    }));
    check(after.level === 8 && after.game, 'the same level starts again, in place');
    check(after.buttons === 0, 'the box holds no button once the lesson can finish again');
    assert.deepEqual(errors, [], `restart: no page errors: ${errors.join(' | ')}`);
    await page.close();
  }
  if (ONLY === 'all' || ONLY === 'layout') {
    console.log('\nLayout: the header, the plate under the map, and the hexes:');
    for (const [w, h] of [[390, 844], [1440, 900]] as const) {
      const { page, errors } = await newPage(w, h);
      await page.goto(URL3, { waitUntil: 'networkidle' });
      await openNextLevel(page);
      await page.waitForSelector('#lesson-plate:not([hidden])', { timeout: 10000 });
      await page.waitForSelector('#tutorial-focus[data-on="1"]', { timeout: 10000 });
      await page.waitForTimeout(450);
      const g = await geometry(page);
      check(g.lessonAttr === '1', `${w}x${h}: lesson styling is scoped to the lesson`);
      check(!g.plateHidden && !!g.plateCopy, `${w}x${h}: the opening sentence is in the info box`);
      checkCockpit(g, `${w}x${h}`, w < 600);
      check(!!g.union && g.union.w > 200, `${w}x${h}: the map is drawn (${g.union?.w}x${g.union?.h})`);
      await checkPointerOnHex(page, '-2,2', `${w}x${h} (L1 home)`);
      // The box is information only: no button. Tapping the lit thing itself advances. The lit
      // home is not a move, so that tap is a dismissal and waits out the 3 s reading floor.
      await waitReadFloor(page);
      const before = await hook<any>(page, 'lesson');
      const pts = await litPoints(page, before.beat.lit);
      check(!!pts[0], `${w}x${h}: the explanation lights a thing to tap`);
      if (pts[0]) {
        await page.mouse.click(pts[0].x, pts[0].y);
        await page.waitForTimeout(350);
        const after = await hook<any>(page, 'lesson');
        check(after?.beat?.id !== before.beat.id, `${w}x${h}: tapping the lit thing advances (${before.beat.id} -> ${after?.beat?.id})`);
      }
      // And a tap over the box itself passes through (pointer-events:none) to the board.
      const nextBeat = (await hook<any>(page, 'lesson')).beat;
      if (nextBeat?.explain) {
        // A dismissing tap inside an explanation's 3 s reading floor is deliberately refused; wait
        // past it, as a person would.
        await waitReadFloor(page);
        const boxPt = await page.evaluate(() => { const p = document.getElementById('lesson-plate'); const r = p!.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }) as { x: number; y: number };
        const under = await page.evaluate(`(() => { const e = document.elementFromPoint(${boxPt.x}, ${boxPt.y}); return e ? e.id || e.className || e.tagName : 'none'; })()`);
        check(under !== 'lesson-plate', `${w}x${h}: a tap over the box reaches the board (${under})`);
        await page.mouse.click(boxPt.x, boxPt.y);
        await page.waitForTimeout(350);
        const after = await hook<any>(page, 'lesson');
        check(after?.beat?.id !== nextBeat.id, `${w}x${h}: a tap on the box dismisses the explanation (${nextBeat.id} -> ${after?.beat?.id})`);
      }
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/layout-L1-${w}x${h}.png` });
      assert.deepEqual(errors, [], `${w}x${h}: no page errors: ${errors.join(' | ')}`);
      await page.close();
    }
    // Outside a lesson the change must be invisible: level 11 keeps its chrome and its board.
    {
      const { page, errors } = await newPage(390, 844);
      await page.goto(URL3, { waitUntil: 'networkidle' });
      await page.evaluate((done) => {
        localStorage.clear();
        localStorage.setItem('severgrow.campaign.progress.v3', JSON.stringify({ version: 1, unlocked: 11, completed: done, best: {} }));
      }, CAMPAIGN_LEVELS.slice(0, 10).map((l) => l.id));
      await page.reload({ waitUntil: 'networkidle' });
      await openNextLevel(page);
      await page.waitForTimeout(700);
      const g = await geometry(page);
      check(g.lessonAttr === null && !g.headerTitle && g.plateHidden, 'L11: no lesson title, no plate, and no lesson attribute');
      check(Math.abs(parseFloat(g.hudPad ?? '6') - 6) <= 0.5, `L11: the HUD keeps its own gutter (${g.hudPad})`);
      check((await page.evaluate(() => document.querySelectorAll('#board .hex-cell').length)) === 37, 'L11: the 37-hex board is whole');
      check(g.scroll.h <= g.scroll.ih + 1 && g.scroll.w <= g.scroll.iw + 1, 'L11: no page scroll');
      assert.deepEqual(errors, [], `L11: no page errors: ${errors.join(' | ')}`);
      await page.close();
    }
  }
  if (ONLY === 'all' || ONLY === 'tiers') {
    console.log('\nTier fade on the real window:');
    const openWith = async (counts: Record<string, number>) => {
      const { page, errors } = await newPage(390, 844);
      await page.goto(URL3, { waitUntil: 'networkidle' });
      await page.evaluate((c) => {
        localStorage.clear();
        localStorage.setItem('severgrow.campaign.progress.v3', JSON.stringify({ version: 1, unlocked: 1, completed: [], best: {} }));
        localStorage.setItem('severgrow.lesson.meta.v1', JSON.stringify({ level: 1, version: 2, seen: ['1:intro:tree', '1:intro:their-home'] }));
        localStorage.setItem('severgrow.lesson.mastery.v1', JSON.stringify({ version: 2, counts: c, spotlights: {}, hellos: [] }));
      }, counts);
      await page.reload({ waitUntil: 'networkidle' });
      await openNextLevel(page);
      // A fresh level replays its opening explanations; move past them to the first Draw.
      for (let i = 0; i < 4; i++) {
        const b = (await hook<any>(page, 'lesson'))?.beat;
        if (!b?.explain) break;
        await dismissExplanation(page);
      }
      await page.waitForTimeout(350);
      const info = await page.evaluate(() => {
        const f = document.getElementById('tutorial-focus');
        const dim = f?.querySelector('.focus-dim');
        const plate = document.getElementById('lesson-plate');
        return {
          tier: f?.getAttribute('data-tier') ?? '',
          hidden: !!f?.hasAttribute('hidden'),
          fill: dim ? getComputedStyle(dim).fill : '',
          plateHidden: !plate || !!plate.hidden,
          plateText: plate?.querySelector('.lesson-copy')?.textContent ?? '',
          display: document.querySelector('#smart-led-text')?.textContent ?? '',
          lesson: (window as any).__severgrow?.lesson?.() ?? null,
        };
      });
      return { page, errors, info };
    };

    {
      const { page, errors, info } = await openWith({});
      check(info.tier === 'spotlight', `L1 first Draw is SPOTLIGHT (${info.tier})`);
      check(!info.hidden && /0\.45\)/.test(info.fill), `SPOTLIGHT dim is the strong L1 dim (${info.fill})`);
      check(info.lesson?.beat?.say === LESSON.tapDraw, 'and the display says what to do');
      check(info.plateHidden, 'and the box is empty: nothing to explain');
      assert.deepEqual(errors, []);
      await page.close();
    }
    {
      const { page, errors, info } = await openWith({ draw: 1 });
      check(info.tier === 'guide', `second Draw is GUIDE (${info.tier})`);
      check(/0\.15\)/.test(info.fill), `GUIDE dim is light (${info.fill})`);
      check(info.lesson?.beat?.say === LESSON.tapDraw && !info.lesson?.beat?.line, 'and the action stays, with no box sentence');
      assert.deepEqual(errors, []);
      await page.close();
    }
    {
      const { page, errors, info } = await openWith({ draw: 2 });
      check(info.tier === 'whisper', `third Draw is WHISPER (${info.tier})`);
      check(/rgba\(0, 0, 0, 0\)/.test(info.fill), `WHISPER has no dim (${info.fill})`);
      check(info.lesson?.beat?.say === LESSON.tapDraw && !info.lesson?.beat?.line, 'and the action line, never a single word');
      check(/\s/.test(info.lesson?.beat?.say ?? ''), 'the whisper says what to do (more than one word)');
      assert.deepEqual(errors, []);
      await page.close();
    }
    {
      const { page, errors, info } = await openWith({ draw: 9 });
      check(info.lesson?.beat == null, 'a well-practised Draw shows no light');
      check(info.plateHidden, 'and the box stays empty: no label, no sentence');
      assert.deepEqual(errors, []);
      await page.close();
    }
  }
  if (ONLY === 'all' || ONLY === 'redesign') {
    console.log('\nRedesign: one borderless box, tap-to-dismiss, a lifted card that still throws:');
    const boxText = (p: Page) => p.evaluate(() => {
      const plate = document.getElementById('lesson-plate');
      return plate && !plate.hidden ? (plate.querySelector('.lesson-copy')?.textContent ?? '') : '';
    }) as Promise<string>;
    const displayText = (p: Page) => p.evaluate(() => document.querySelector('#smart-led-text')?.textContent ?? '') as Promise<string>;
    const tap = async (p: Page, pt: { x: number; y: number } | null) => {
      if (!pt) throw new Error('nothing to tap');
      await p.mouse.click(pt.x, pt.y);
      await p.waitForTimeout(380);
    };
    for (const [w, h] of [[390, 844], [360, 640]] as const) {
      const tag = `${w}x${h}`;
      const { page, errors } = await newPage(w, h);
      await page.goto(URL3, { waitUntil: 'networkidle' });
      await openNextLevel(page);
      const copy: string[] = [];
      try {
        // 1. The opening explanation: one caption, no border/outline/shadow, no buttons, taps through.
        await page.waitForSelector('#lesson-plate:not([hidden]) .lesson-copy', { timeout: 10000 });
        const g = await geometry(page);
        checkCockpit(g, tag, true);
        check(g.plateCopy === LESSON.yourHomeLine, `${tag}: the home explanation is the new sentence`);
        copy.push(g.plateCopy);
        const chrome = await page.evaluate(() => {
          const p = document.getElementById('lesson-plate')!;
          const s = getComputedStyle(p);
          const r = p.getBoundingClientRect();
          const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          return {
            border: s.borderTopWidth, outline: s.outlineStyle + ' ' + s.outlineWidth, shadow: s.boxShadow,
            pointer: s.pointerEvents, buttons: p.querySelectorAll('button, [role="button"]').length,
            under: at ? (at.id || at.className || at.tagName) : 'none',
          };
        });
        check(parseFloat(chrome.border) === 0, `${tag}: no border (${chrome.border})`);
        check(chrome.outline.startsWith('none') || chrome.outline.endsWith('0px'), `${tag}: no outline (${chrome.outline})`);
        check(chrome.shadow === 'none', `${tag}: no shadow/edge (${chrome.shadow})`);
        check(chrome.pointer === 'none', `${tag}: pointer-events:none (${chrome.pointer})`);
        check(chrome.buttons === 0, `${tag}: no buttons in the box (${chrome.buttons})`);
        check(chrome.under !== 'lesson-plate', `${tag}: a tap over the box lands on the board (${chrome.under})`);
        await page.waitForTimeout(750);
        const b1 = (await hook<any>(page, 'lesson')).beat;
        check(!!b1 && b1.id === '1:intro:tree', `${tag}: the first beat is the home explanation (${b1?.id})`);
        if (SHOTS) await page.screenshot({ path: `${SHOTS}/redesign-box-${w}x${h}.png` });
        if (SHOTS) await page.screenshot({ path: `${SHOTS}/redesign-box-${w}x${h}.png` });

        // 2. Tapping the highlighted thing advances; the win condition is a sentence, not a label.
        // The lit home is not a move, so a tap on it is a dismissal: inside the 3 s reading floor it
        // is refused and acknowledged (owner, 2026-10-21), and once the floor has passed it advances.
        const p1 = (await litPoints(page, b1.lit))[0]!;
        const acks0 = (await hook<any>(page, 'lesson')).floorAcks ?? 0;
        await tap(page, p1);
        const held = await hook<any>(page, 'lesson');
        check(held.beat?.id === b1.id && (held.floorAcks ?? 0) > acks0,
          `${tag}: inside the reading floor a tap on the lit home is refused and acknowledged (${held.beat?.id})`);
        await waitReadFloor(page);
        await tap(page, p1);
        const b2 = (await hook<any>(page, 'lesson')).beat;
        check(!!b2 && b2.lit.t === 'home' && b2.lit.player === 1, `${tag}: tapping the lit home advances (${b2?.id})`);
        check((await boxText(page)) === LESSON.theirHomeLine, `${tag}: the win sentence is in the box`);
        copy.push(await boxText(page));

        // 3. Tapping anywhere (over the box itself) advances once its reading floor has passed;
        // then the first-draw sentence.
        await waitReadFloor(page);
        const boxPt = await page.evaluate(() => { const r = document.getElementById('lesson-plate')!.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }) as { x: number; y: number };
        await tap(page, boxPt);
        const b3 = (await hook<any>(page, 'lesson')).beat;
        check(!!b3 && b3.id === '1:intro:first-draw', `${tag}: a tap anywhere advances (${b3?.id})`);
        check((await boxText(page)) === LESSON.tapDrawLine, `${tag}: the first-draw sentence is in the box`);
        copy.push(await boxText(page));

        // 4. ONE tap on the lit Draw pile while the sentence is open: it closes the sentence AND
        // draws (owner, 2026-10-20: "the first tap with this window open - if tapped on the
        // highlighted item works first time - no double taps needed"). Deliberately inside the
        // old 650 ms guard, which no longer applies to the lit target.
        const deck = (await litPoints(page, b3.lit))[0]!;
        const draws0 = (await hook<any>(page, 'state')).history.length;
        await tap(page, deck);
        await idle(page);
        const s4 = await hook<any>(page, 'state');
        const drawn = s4.history.length === draws0 + 1 && s4.history.at(-1)?.t === 'Draw' && s4.history.at(-1)?.player === 0;
        check(drawn, `${tag}: one tap on the lit Draw pile draws the card (${s4.history.length - draws0} move)`);
        const b4 = (await hook<any>(page, 'lesson')).beat;
        check(!!b4 && b4.id === '1:idea:first-grow' && (await boxText(page)) === LESSON.growLine,
          `${tag}: the same tap closed the first-draw sentence and brought the Grow one (${b4?.id})`);
        copy.push(await boxText(page));

        // 5. The Grow explanation: the suggested card is genuinely lifted, and the display is the
        // other voice.
        //
        // TWO VOICES, BOTH THE OWNER'S (2026-10-20 and 2026-10-21): the sign holds the last action
        // line for its 2 s lesson dwell, then — because the player has not moved — it WAKES on this
        // step's action (`ddc4d87`, "the sign wakes when idle"). A blanket "never a step word" ban
        // therefore fails the product for doing what it was told, and the moment it was read only
        // moved the failure: at 1.2 s the PREVIOUS line could still be holding its dwell (seen on a
        // loaded runner as "DRAW!"), at 2.2 s the wake has correctly said "GROW!".
        // What must hold at every moment is narrower and stronger: the sign never repeats the
        // caption, and the step it names is the CURRENT one. A stale word fails, as does an echo.
        const settleDisplay = (await displayText(page)).trim();
        check(settleDisplay !== LESSON.growLine, `${tag}: the display does not repeat the box (${settleDisplay})`);
        const woke = await page.waitForFunction(() => {
          const t = document.getElementById('smart-led-text')?.textContent?.trim() ?? '';
          return /^(DRAW|GROW|THROW|BLOOM|BOMB|BLAST|SKIP)[!?]?$/.test(t) ? t : false;
        }, undefined, { timeout: 8000 }).then((handle) => handle.jsonValue() as Promise<string>).catch(() => '');
        check(woke.replace(/[!?]$/, '') === 'GROW',
          `${tag}: the idle sign wakes on THIS step's action, never a stale one (${woke || 'never woke'})`);
        if (SHOTS) await page.screenshot({ path: `${SHOTS}/redesign-card-${w}x${h}.png` });
        const cardId = b4.lit.id;
        const lift = await page.evaluate(`(() => {
          const c = document.querySelector('#hand .card[data-card="${cardId}"]');
          if (!c) return null;
          const s = getComputedStyle(c); const r = c.getBoundingClientRect();
          const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          return { translate: s.translate, scale: s.scale, z: s.zIndex, hit: at?.closest('#hand .card')?.getAttribute('data-card') ?? '' };
        })()`) as { translate: string; scale: string; z: string; hit: string } | null;
        check(!!lift, `${tag}: the suggested card is in the fan`);
        check(!!lift && lift.translate !== 'none' && parseFloat(lift.translate.split(' ').at(-1) ?? '0') <= -18,
          `${tag}: it is lifted out of the fan (${lift?.translate})`);
        check(!!lift && parseFloat(lift.scale) >= 1.04, `${tag}: it is slightly larger (${lift?.scale})`);
        check(!!lift && lift.hit === String(cardId), `${tag}: the lifted card is still the tap target`);
        if (SHOTS) await page.screenshot({ path: `${SHOTS}/redesign-lifted-${w}x${h}.png` });

        // 6. ONE tap on the lit card while the Grow sentence is open: it closes the sentence AND
        // picks the card, in the same gesture.
        const cardPt = (await litPoints(page, b4.lit))[0]!;
        await tap(page, cardPt);
        const b5 = (await hook<any>(page, 'lesson')).beat;
        check(!!b5 && b5.lit.t === 'hex' && b5.say === LESSON.tapTile,
          `${tag}: one tap on the lit card picks it and lights the tile (${b5?.id})`);
        check((await boxText(page)) === '', `${tag}: the Grow sentence closed on that same tap`);
        check((await page.evaluate(() => document.querySelectorAll('.tutorial-target-card').length)) === 0,
          `${tag}: no card stays lifted after the beat moves on`);
        // 7. Place it: the explanation points at the TILE THAT WAS JUST PLACED and its number
        // (owner, 2026-10-20: it used to light the score display, which taught the wrong thing).
        const placedKey = b5.lit.t === 'hex' ? b5.lit.key : '';
        const tilePt = (await litPoints(page, b5.lit))[0]!;
        await tap(page, tilePt);
        await idle(page);
        await page.waitForTimeout(300);
        const b6 = (await hook<any>(page, 'lesson')).beat;
        check(!!b6 && b6.id === '1:grew' && (await boxText(page)) === LESSON.youGrewLine, `${tag}: the grow moment explains the tile rank`);
        check(!!b6 && b6.lit.t === 'hex', `${tag}: it lights the tile, not the display (${b6?.lit?.t})`);
        check(!!b6 && b6.lit.t !== 'score', `${tag}: the score display is not the lit target`);
        check(!!b6 && !!placedKey && b6.lit.key === placedKey,
          `${tag}: it lights the hex that was just grown (${b6?.lit?.key} vs ${placedKey})`);
        // The tile really carries the card's rank, right where the light points.
        const rank = await page.evaluate((key) => {
          const g = document.querySelector(`#board .tile[data-key="${key}"]`);
          const num = g?.querySelector('.tile-num');
          const r = g?.getBoundingClientRect();
          return { text: num?.textContent?.trim() ?? '', w: r ? Math.round(r.width) : 0 };
        }, placedKey);
        check(/^\d+$/.test(rank.text) && rank.w > 0, `${tag}: the placed tile shows its rank (${rank.text})`);
        // The caption never covers the number it is talking about.
        await checkPlateClear(page, b6.lit, `${tag} grow rank`);
        // The display is the OTHER voice: a play fact (YOU LEAD, +N) or the resting score — never
        // the box's sentence, never a lone step word. It used to be pinned to a held score, but
        // that hold existed only so the lesson could point at the display; this beat points at
        // the tile now, and the sign is free to report what just happened. The previous action
        // line finishes its own 2 s dwell first (owner, 2026-10-20: no message changes faster).
        await page.waitForTimeout(2200);
        const spoken = (await displayText(page)).trim();
        check(spoken !== LESSON.youGrewLine, `${tag}: the explanation is not on the display (${spoken})`);
        check(!/^(DRAW|GROW|THROW|BLOOM|BOMB|BLAST|SKIP)[!?]?$/.test(spoken), `${tag}: no lone step word on the display (${spoken})`);
        check(/^\d+:\d+$/.test(spoken) || /LEAD|OPP|^\+\d+$|^-\d+$|^UP\d+$/.test(spoken),
          `${tag}: the display carries the fact (score, lead or points) (${spoken})`);
        if (SHOTS) await page.screenshot({ path: `${SHOTS}/redesign-rank-${w}x${h}.png` });
        copy.push(await boxText(page));
        // 9. Tap anywhere: nothing is left to do but end the Grow, so the game goes on to the Throw
        // by itself, as in a real game. » is never lit on the way, not even for a frame (owner,
        // 2026-10-20: lighting » here was redundant, and it used to flash for a second).
        await waitReadFloor(page);
        await page.evaluate(`(() => { window.__endLit = 0; const tick = () => {
          const b = window.__severgrow.lesson()?.beat; if (b && b.id === 'end') window.__endLit++;
          if (window.__severgrow.state().phase === 'ACT') requestAnimationFrame(tick); }; requestAnimationFrame(tick); })()`);
        await tapAnywhere(page);
        await page.waitForFunction(() => (window as any).__severgrow.state().phase === 'DISCARD', undefined, { timeout: 8000 });
        await idle(page);
        await page.waitForTimeout(250);
        check((await page.evaluate('window.__endLit')) === 0, `${tag}: » is never lit before the game moves on to the Throw`);
        const b7 = (await hook<any>(page, 'lesson')).beat;
        check(!!b7 && b7.id === '1:idea:first-throw', `${tag}: the Throw explanation follows the Grow`);
        check((await boxText(page)) === LESSON.throwLine, `${tag}: the Throw sentence is in the box`);
        copy.push(await boxText(page));
        check(b7.lit.t === 'card', `${tag}: the Throw explanation points at a card`);
        // 10. ONE tap on the lit Throw card: the sentence closes AND the card is picked for the
        // throw, so the Throw pile is the only thing left to tap.
        const throwCardPt = (await litPoints(page, b7.lit))[0]!;
        await tap(page, throwCardPt);
        const b8 = (await hook<any>(page, 'lesson')).beat;
        check(!!b8 && b8.id === 'throw-pile' && b8.say === LESSON.tapThrowPile && b8.lit.t === 'discard',
          `${tag}: one tap on the lit Throw card picks it and lights the Throw pile (${b8?.id})`);
        check((await boxText(page)) === '', `${tag}: the Throw sentence closed on that same tap`);
        // 11. The Throw pile: the tap throws the card and ends the turn.
        const pilePt = (await litPoints(page, b8.lit))[0]!;
        await tap(page, pilePt);
        await idle(page);
        const st = await hook<any>(page, 'state');
        check(st.history.some((e: any) => e.t === 'Discard' && e.player === 0), `${tag}: the lifted card was thrown and the turn ended`);
        check((await page.evaluate(() => document.querySelectorAll('.tutorial-target-card').length)) === 0,
          `${tag}: nothing is left lifted after the throw`);

        // The four required sentences all appeared in their own beat.
        for (const [name, text] of [['win', LESSON.theirHomeLine], ['draw', LESSON.tapDrawLine], ['grow', LESSON.growLine], ['throw', LESSON.throwLine]] as const) {
          check(copy.includes(text), `${tag}: the ${name} sentence appeared in the box`);
        }
        if (SHOTS) await page.screenshot({ path: `${SHOTS}/redesign-${w}x${h}.png` });
        assert.deepEqual(errors, [], `${tag}: no page errors: ${errors.join(' | ')}`);
      } finally {
        await page.close();
      }
    }
  }
  console.log('\n' + results.join('\n'));
} finally {
  await browser.close();
  server.close();
}
