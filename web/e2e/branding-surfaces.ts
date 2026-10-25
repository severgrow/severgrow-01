// THE BRANDING PASS — one mark per surface, always crisp (owner, 2026-10-24):
//   "when paused - dont blur the futasaku in top right corner , show the same logo nicely
//    symmetrically on the end of game screen and any similar ... have nearly every page have the
//    logo somewhere".
//
//   CHANNEL=futa04 npm run web:build && npx tsx web/e2e/branding-surfaces.ts
//   SHOTS=/tmp/branding/after npx tsx web/e2e/branding-surfaces.ts
//
// It runs the REAL built app and pins the owner's rules as measurements:
//   1. the mark is CRISP while paused — it is not inside a filter/backdrop-filter subtree, and no
//      full-screen veil is painted above it;
//   2. the finish plate carries the SAME mark (the same module, asset and tint) on its own axis,
//      and the corner mark stands down there, so no screen ever shows two;
//   3. the submenus (play menu, difficulty list) and an open sheet carry it too, without covering
//      content or a 44px target;
//   4. a short screen shrinks the mark rather than crowding the content;
//   5. Reduce motion leaves nothing animating on the mark.
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { chromium } from 'playwright-core';
import type { Browser, Page } from 'playwright-core';
import { seedSeen, seedSettings } from './helpers/settings-seed.js';

const SHOTS = process.env.SHOTS ?? '';
const types: Record<string, string> = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.json': 'application/json',
};
const server = createServer((req, res) => {
  const path = decodeURIComponent((req.url ?? '/').split('?')[0]!);
  let file = join('web/dist', path);
  if (!existsSync(file) || file.endsWith('/')) file = join('web/dist', 'index.html');
  res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' });
  res.end(readFileSync(file));
});
await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
const ORIGIN = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

const browser: Browser = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  args: ['--no-sandbox'],
});
let failed = 0;
let total = 0;
const check = (ok: boolean, what: string) => {
  total += 1;
  if (!ok) failed += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}`);
};

type View = { w: number; h: number; tag: string };
const ALL_VIEWS: View[] = [
  { w: 390, h: 844, tag: '390x844' },
  { w: 360, h: 640, tag: '360x640' },
  { w: 320, h: 568, tag: '320x568' },
  { w: 844, h: 390, tag: '844x390' },
  { w: 1280, h: 800, tag: '1280x800' },
];
/** VIEWS=390x844,360x640 narrows a debugging run; unset means every real viewport. */
const VIEWS = process.env.VIEWS ? ALL_VIEWS.filter((v) => process.env.VIEWS!.split(',').includes(v.tag)) : ALL_VIEWS;

const seed = async (page: Page, reduceMotion = true) => {
  // Every channel prefix, once: a fixture that names one prefix silently loses Reduce motion on
  // another build (the lesson finish-fit learned the hard way).
  await seedSettings(page, { sound: false, music: false, coach: false, speed: 'skip', reduceMotion, palette: 'soil' });
  await seedSeen(page, '1');
  await page.addInitScript(() => { (window as unknown as { __name: (f: unknown) => unknown }).__name = (f: unknown) => f; });
};

const waitIdle = (page: Page) =>
  page.waitForFunction('(() => { const h = window.__severgrow; return !!h.state() && !h.busy(); })()', undefined, { timeout: 40_000 });

const startMatch = async (page: Page) => {
  await page.goto(ORIGIN, { waitUntil: 'networkidle' });
  await page.waitForSelector('#menu:not([hidden])', { timeout: 20_000 });
  await page.waitForTimeout(400);
  await page.click('#menu-play');
  await page.waitForSelector('#play-menu:not([hidden])', { timeout: 10_000 });
  await page.click('#menu-new');
  await page.waitForSelector('#levels:not([hidden])', { timeout: 12_000 });
  await page.waitForTimeout(250);
  await page.locator('#levels .level-tile, #levels .difficulty-tile').nth(1).click({ force: true });
  await page.waitForSelector('#game:not([hidden])', { timeout: 25_000 });
  await page.waitForFunction(() => {
    const r = document.getElementById('starter-lottery');
    return !r || r.hidden || !r.getClientRects().length;
  }, undefined, { timeout: 15_000 }).catch(() => undefined);
  await waitIdle(page);
  await page.waitForTimeout(400);
};

/**
 * The mark's own report: is it on screen, what size, and is ANY filter between it and the glass —
 * its ancestor chain, or an overlay painted above it that blurs its backdrop?
 */
const MARK = `(() => {
  const el = document.getElementById('hud-brand');
  if (!el) return { found: false };
  const r = el.getBoundingClientRect();
  const s = getComputedStyle(el);
  const visible = !!el.getClientRects().length && s.display !== 'none' && s.visibility !== 'hidden'
    && +s.opacity > 0 && r.width > 0 && r.height > 0;
  const chain = [];
  for (let n = el; n; n = n.parentElement) {
    const cs = getComputedStyle(n);
    if ((cs.filter && cs.filter !== 'none') || (cs.backdropFilter && cs.backdropFilter !== 'none'))
      chain.push({ node: n.id || n.className || n.tagName, filter: cs.filter, back: cs.backdropFilter });
  }
  const z = +s.zIndex || 0;
  const overlays = [];
  for (const n of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(n);
    if (!cs.backdropFilter || cs.backdropFilter === 'none' || cs.display === 'none' || cs.visibility === 'hidden') continue;
    const b = n.getBoundingClientRect();
    // A veil that covers the mark's centre and is painted above it would blur it.
    if (b.width < 1 || b.height < 1) continue;
    if (b.left > r.left + r.width / 2 || b.right < r.left + r.width / 2) continue;
    if (b.top > r.top + r.height / 2 || b.bottom < r.top + r.height / 2) continue;
    overlays.push({ node: n.id || n.className, z: +cs.zIndex || 0, back: cs.backdropFilter, covers: b.width >= innerWidth - 1 && b.height >= innerHeight - 1 });
  }
  return {
    found: true, visible,
    box: { x:+r.x.toFixed(1), y:+r.y.toFixed(1), w:+r.width.toFixed(1), h:+r.height.toFixed(1), right:+r.right.toFixed(1), bottom:+r.bottom.toFixed(1) },
    opacity: +s.opacity, z, chain, overlays,
    animations: el.getAnimations({ subtree: true }).length,
    tint: (() => { const f = el.querySelector('image'); return f ? f.getAttribute('href') : ''; })(),
  };
})()`;

/** Click a control through any install invitation that may be over it. */
const clickThrough = async (page: Page, selector: string, tries = 24): Promise<boolean> => {
  for (let i = 0; i < tries; i++) {
    for (const id of ['#install-close', '#install-later'])
      if (await page.locator(id).isVisible().catch(() => false)) await page.click(id, { timeout: 1_500 }).catch(() => undefined);
    if (await page.locator(selector).click({ timeout: 1_500 }).then(() => true).catch(() => false)) return true;
  }
  return false;
};

const pause = async (page: Page) => {
  for (let i = 0; i < 20 && !(await page.locator('#sheet-menu:not([hidden])').count()); i++) {
    await clickThrough(page, '#hud-menu');
    await page.waitForTimeout(400);
  }
  await page.waitForSelector('#sheet-menu:not([hidden])', { timeout: 6_000 });
  await page.waitForTimeout(450);
};

const finish = async (page: Page) => {
  const read = () => page.evaluate(() => (window as unknown as { __severgrow: { state: () => { phase: string; actor: number } | null } }).__severgrow.state());
  let waiting = 0;
  for (let i = 0; i < 2500; i++) {
    const s = await read();
    if (!s || s.phase === 'GAME_OVER') break;
    await waitIdle(page);
    const now = (await read())!;
    if (now.phase === 'GAME_OVER') break;
    if (now.actor !== 0) {
      if (++waiting > 400) break;
      await page.waitForTimeout(45);
      continue;
    }
    waiting = 0;
    const legal = await page.evaluate(() => (window as unknown as { __severgrow: { legal: () => unknown[] } }).__severgrow.legal());
    if (!legal.length) break;
    const applied = await page.evaluate(
      (a) => (window as unknown as { __severgrow: { playFor: (x: unknown, p: number) => boolean } }).__severgrow.playFor(a, 0),
      legal[0],
    );
    if (!applied) await page.waitForTimeout(90);
  }
  await page.waitForSelector('#gameover:not([hidden])', { timeout: 30_000 });
  await page.waitForTimeout(650);
  for (const id of ['#install-close', '#install-later'])
    if (await page.locator(id).isVisible().catch(() => false)) await page.click(id, { timeout: 1_500 }).catch(() => undefined);
  await page.waitForTimeout(300);
};

/** The one mark the eye can see on a surface, whatever element carries it. */
const COUNT_MARKS = `(() => {
  const sel = ['#logo svg', '#hud-brand', '#go-brand', '#online-brand', '.online-brand'];
  const seen = new Set();
  const out = [];
  for (const s of sel) for (const el of document.querySelectorAll(s)) {
    if (seen.has(el)) continue;
    seen.add(el);
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0 || !el.getClientRects().length) continue;
    if (r.width < 1 || r.height < 1) continue;
    out.push({ id: el.id || (el.closest('#logo') ? '#logo svg' : s), r: { x:+r.x.toFixed(1), y:+r.y.toFixed(1), w:+r.width.toFixed(1), h:+r.height.toFixed(1), right:+r.right.toFixed(1), bottom:+r.bottom.toFixed(1) } });
  }
  return out;
})()`;

const overlap = (a: { x: number; y: number; right: number; bottom: number }, b: { x: number; y: number; right: number; bottom: number }) =>
  a.x < b.right && a.right > b.x && a.y < b.bottom && a.bottom > b.y;

// ---------------------------------------------------------------------------------------------
// The finish plate needs a real game. Everything else is fast and runs at every viewport.
const FINISH_VIEWS = ['390x844', '360x640', '844x390', '1280x800'];
const PAGE_VIEWS = VIEWS;

for (const v of PAGE_VIEWS) {
  const tag = v.tag;
  console.log(`\n--- ${tag}`);
  const page = await browser.newPage({
    viewport: { width: v.w, height: v.h }, deviceScaleFactor: 2, hasTouch: v.w < 800, isMobile: v.w < 800,
  });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await seed(page);

  // ---- menu: the big logo, and only it ----
  await page.goto(ORIGIN, { waitUntil: 'networkidle' });
  await page.waitForSelector('#menu:not([hidden])', { timeout: 20_000 });
  await page.waitForTimeout(500);
  const menuMarks = (await page.evaluate(COUNT_MARKS)) as { id: string }[];
  check(menuMarks.length === 1 && menuMarks[0]!.id === '#logo svg', `${tag}: the menu carries exactly ONE mark (the big logo) — ${menuMarks.map((m) => m.id).join(', ') || 'none'}`);
  if (SHOTS) await page.screenshot({ path: join(SHOTS, `menu-${tag}.png`) });

  // ---- Settings from the MENU: the menu's big logo is still the one mark ----
  await page.click('#menu-settings');
  await page.waitForSelector('#sheet-settings:not([hidden])', { timeout: 8_000 });
  await page.waitForTimeout(400);
  const menuSheetMarks = (await page.evaluate(COUNT_MARKS)) as { id: string }[];
  const menuSheetBadge = (await page.evaluate(MARK)) as { visible: boolean };
  check(menuSheetMarks.length === 1 && menuSheetMarks[0]!.id === '#logo svg',
    `${tag}: Settings over the menu still shows ONE mark (${menuSheetMarks.map((m) => m.id).join(', ') || 'none'})`);
  check(!menuSheetBadge.visible, `${tag}: no corner badge is added over the menu`);
  await page.evaluate(() => document.querySelector<HTMLElement>('#sheet-settings [data-close]')?.click());
  await page.waitForTimeout(400);

  // ---- play menu: the corner mark, clear of the plate ----
  await page.click('#menu-play');
  await page.waitForSelector('#play-menu:not([hidden])', { timeout: 10_000 });
  await page.waitForTimeout(450);
  const playMark = (await page.evaluate(MARK)) as { visible: boolean; box: { h: number } };
  const playPlate = await page.evaluate(() => {
    const r = document.querySelector('#play-menu .levels-inner')!.getBoundingClientRect();
    return { x: r.x, y: r.y, right: r.right, bottom: r.bottom };
  });
  check(playMark.visible, `${tag}: the play menu carries the corner mark (${playMark.box?.h}px tall)`);
  check(!overlap(playMark.box as never, playPlate), `${tag}: the play-menu mark never sits on the plate`);
  const playMarks = (await page.evaluate(COUNT_MARKS)) as { id: string }[];
  check(playMarks.length === 1, `${tag}: the play menu shows ONE mark (${playMarks.map((m) => m.id).join(', ') || 'none'})`);
  if (SHOTS) await page.screenshot({ path: join(SHOTS, `play-menu-${tag}.png`) });

  // ---- difficulty list ----
  await page.click('#menu-new');
  await page.waitForSelector('#levels:not([hidden])', { timeout: 12_000 });
  await page.waitForTimeout(450);
  const levelMark = (await page.evaluate(MARK)) as { visible: boolean; box: { h: number } };
  const levelPlate = await page.evaluate(() => {
    const r = document.querySelector('#levels .levels-inner')!.getBoundingClientRect();
    return { x: r.x, y: r.y, right: r.right, bottom: r.bottom };
  });
  check(levelMark.visible, `${tag}: the difficulty list carries the corner mark`);
  check(!overlap(levelMark.box as never, levelPlate), `${tag}: the difficulty mark never sits on the plate`);
  if (SHOTS) await page.screenshot({ path: join(SHOTS, `levels-${tag}.png`) });

  // ---- the install invitation: the mark must stand down (owner's "nearly every page", but a
  // modal's 20px blur is meant to be the only thing in focus, and the badge is painted at z 74
  // ABOVE the invitation's z 13) ----
  await page.evaluate(() => (window as unknown as { __severgrow: { showInstall: () => void } }).__severgrow.showInstall());
  await page.waitForSelector('#install-prompt:not([hidden])', { timeout: 8_000 });
  await page.waitForTimeout(250);
  const inviteMark = (await page.evaluate(MARK)) as { visible: boolean };
  check(!inviteMark.visible, `${tag}: the corner mark stands down on the install invitation`);
  await page.click('#install-close', { timeout: 4_000 });
  await page.waitForTimeout(350);
  const afterInvite = (await page.evaluate(MARK)) as { visible: boolean };
  check(afterInvite.visible, `${tag}: the corner mark returns when the invitation closes`);

  // ---- a real match, its pause plate, and the shield of a settings sheet ----
  await page.locator('#levels .level-tile, #levels .difficulty-tile').nth(1).click({ force: true });
  await page.waitForSelector('#game:not([hidden])', { timeout: 25_000 });
  await page.waitForFunction(() => {
    const r = document.getElementById('starter-lottery');
    return !r || r.hidden || !r.getClientRects().length;
  }, undefined, { timeout: 15_000 }).catch(() => undefined);
  await waitIdle(page);
  await page.waitForTimeout(350);

  await pause(page);
  const pauseMark = (await page.evaluate(MARK)) as {
    visible: boolean; opacity: number; z: number; h: number;
    chain: unknown[]; overlays: { node: string; z: number }[]; animations: number; box: Record<string, number>;
  };
  const pauseMarks = (await page.evaluate(COUNT_MARKS)) as { id: string }[];
  const panelTop = await page.evaluate(() => document.getElementById('sheet-menu')!.getBoundingClientRect().top);
  check(pauseMark.visible, `${tag}: the mark is on screen while paused`);
  check(pauseMark.chain.length === 0, `${tag}: the paused mark has NO filter in its ancestor chain (${JSON.stringify(pauseMark.chain)})`);
  check(pauseMark.overlays.every((o) => o.z < pauseMark.z), `${tag}: no veil is painted above the paused mark (${JSON.stringify(pauseMark.overlays)} vs z ${pauseMark.z})`);
  check(pauseMark.opacity >= 0.7, `${tag}: the paused mark keeps its full ink (opacity ${pauseMark.opacity})`);
  check(pauseMarks.length === 1, `${tag}: the pause plate shows ONE mark (${pauseMarks.map((m) => m.id).join(', ') || 'none'})`);
  check((pauseMark.box as { bottom: number }).bottom <= panelTop, `${tag}: the mark clears the pause plate`);
  const markH = (pauseMark.box as { h: number }).h;
  check(v.h <= 660 ? markH > 0 && markH <= 18.5 : Math.abs(markH - 21.75) <= 1.5,
    `${tag}: the mark keeps the one size convention (${markH}px)`);
  check(pauseMark.animations === 0, `${tag}: the mark never animates on its own (${pauseMark.animations})`);
  if (SHOTS) {
    await page.screenshot({ path: join(SHOTS, `pause-${tag}.png`) });
    await page.screenshot({
      path: join(SHOTS, `pause-corner-${tag}.png`),
      clip: { x: Math.max(0, v.w - 130), y: 0, width: Math.min(130, v.w), height: 80 },
    });
  }

  await page.click('#gm-settings');
  await page.waitForSelector('#sheet-settings:not([hidden])', { timeout: 8_000 });
  await page.waitForTimeout(450);
  const settingsMark = (await page.evaluate(MARK)) as { visible: boolean; box: { h: number } };
  const settingsSheet = await page.evaluate(() => {
    const r = document.getElementById('sheet-settings')!.getBoundingClientRect();
    return { x: r.x, y: r.y, right: r.right, bottom: r.bottom };
  });
  check(settingsMark.visible, `${tag}: an open Settings sheet keeps the corner mark`);
  check(!overlap(settingsMark.box as never, settingsSheet), `${tag}: the Settings mark never sits on the sheet`);
  const settingsMarks = (await page.evaluate(COUNT_MARKS)) as { id: string }[];
  check(settingsMarks.length === 1, `${tag}: Settings shows ONE mark (${settingsMarks.map((m) => m.id).join(', ') || 'none'})`);
  if (SHOTS) await page.screenshot({ path: join(SHOTS, `settings-${tag}.png`) });
  await page.evaluate(() => document.querySelector<HTMLElement>('#sheet-settings [data-close]')?.click());
  await page.waitForTimeout(350);
  await page.click('#gm-resume');
  await page.waitForTimeout(300);

  // ---- the finish plate: the mark moves onto its axis, the corner stands down ----
  if (FINISH_VIEWS.includes(tag)) {
    await finish(page);
    const goState = await page.evaluate(() => {
      const card = document.querySelector('#gameover .go-card')!;
      const summary = document.querySelector('#gameover .go-summary')!;
      const mark = document.getElementById('go-brand');
      const r = card.getBoundingClientRect();
      const sr = summary.getBoundingClientRect();
      const mr = mark?.getBoundingClientRect();
      // A `filter` on an ancestor blurs the mark itself. A `backdrop-filter` blurs only what is
      // painted BEHIND that element, never its own content — so the plate's glass is allowed in
      // this list (the cap is content ON the glass, like the title), and only a veil between the
      // mark and the eye could smear it. The pause badge's own check above keeps the strict
      // "no veil painted above it" invariant.
      const filterChain: string[] = [];
      const glassChain: string[] = [];
      if (mark) for (let n: Element | null = mark; n; n = n.parentElement) {
        const cs = getComputedStyle(n);
        if (cs.filter && cs.filter !== 'none') filterChain.push(n.id || n.className || n.tagName);
        if (cs.backdropFilter && cs.backdropFilter !== 'none') glassChain.push(n.id || n.className || n.tagName);
      }
      const hud = document.getElementById('hud-brand');
      const hs = hud ? getComputedStyle(hud) : null;
      return {
        card: { x: r.x, y: r.y, right: r.right, bottom: r.bottom, w: r.width, h: r.height },
        overflow: card.scrollHeight - card.clientHeight,
        mark: mr ? {
          x: +mr.x.toFixed(1), y: +mr.y.toFixed(1), w: +mr.width.toFixed(1), h: +mr.height.toFixed(1),
          centre: +((mr.left + mr.right) / 2).toFixed(1), filterChain, glassChain,
          animations: mark!.getAnimations({ subtree: true }).length,
          asset: mark!.querySelector('image')?.getAttribute('href') ?? '',
          tint: getComputedStyle(mark!.querySelector('feFlood')!).floodColor,
        } : null,
        cardCentre: +((sr.left + sr.right) / 2).toFixed(1),
        cornerShown: !!hud && !!hs && hs.display !== 'none' && !!hud.getClientRects().length,
      };
    });
    const marks = (await page.evaluate(COUNT_MARKS)) as { id: string; r: { h: number } }[];
    check(!!goState.mark, `${tag}: the finish plate carries the mark`);
    if (goState.mark) {
      check(Math.abs(goState.mark.centre - goState.cardCentre) <= 1,
        `${tag}: the finish mark is on the lockup's axis (${goState.mark.centre} vs ${goState.cardCentre})`);
      if (v.h <= 660) check(goState.mark.h > 0 && goState.mark.h <= 18.5,
        `${tag}: a short screen wears the small cap (${goState.mark.h}px)`);
      check(goState.mark.filterChain.length === 0, `${tag}: no filter smears the finish mark (${goState.mark.filterChain.join(', ')})`);
      check(goState.mark.glassChain.every((n) => n === 'go-card' || n === 'gameover'),
        `${tag}: only the plate's own glass sits behind the mark (${goState.mark.glassChain.join(', ')})`);
      check(goState.mark.animations === 0, `${tag}: the finish mark never animates under Reduce motion (${goState.mark.animations})`);
      check(goState.mark.tint !== '' && goState.mark.asset.includes('futasaku-wordmark-silhouette'),
        `${tag}: the finish mark is the SAME asset and tint (${goState.mark.asset.split('/').pop()}, ${goState.mark.tint})`);
    }
    check(!goState.cornerShown, `${tag}: the corner mark stands down on the finish plate`);
    check(marks.length === 1 && marks[0]!.id === 'go-brand',
      `${tag}: the finish plate shows exactly ONE mark (${marks.map((m) => m.id).join(', ') || 'none'})`);
    check(goState.overflow <= 0, `${tag}: the finish plate still does not scroll with the mark (${goState.overflow}px)`);

    // The owner's one condition on the placement: it must not fight the Seeds line. Paint a real
    // award through the product's own reveal, then re-measure the same card.
    await page.evaluate(() => (window as unknown as { __severgrow: { seedReveal: (n: number) => void } }).__severgrow.seedReveal(50));
    await page.waitForTimeout(900);
    const withSeeds = await page.evaluate(() => {
      const card = document.querySelector('#gameover .go-card')!;
      const seeds = document.getElementById('go-seeds')!;
      const mark = document.getElementById('go-brand')!;
      return {
        overflow: card.scrollHeight - card.clientHeight,
        seedsShown: seeds.getClientRects().length > 0,
        seedsAboveMark: seeds.getBoundingClientRect().top > mark.getBoundingClientRect().bottom,
      };
    });
    check(withSeeds.seedsShown, `${tag}: the Seeds line is on the card`);
    check(withSeeds.overflow <= 0, `${tag}: the plate still fits WITH the Seeds line (${withSeeds.overflow}px)`);
    check(withSeeds.seedsAboveMark, `${tag}: the mark never runs into the Seeds line`);
    if (SHOTS) await page.screenshot({ path: join(SHOTS, `finish-seeds-${tag}.png`) });
    check(errors.length === 0, `${tag}: no page errors (${errors.slice(0, 2).join(' | ')})`);
    if (SHOTS) {
      await page.screenshot({ path: join(SHOTS, `finish-${tag}.png`) });
      await page.screenshot({ path: join(SHOTS, `finish-card-${tag}.png`), clip: { x: goState.card.x, y: goState.card.y, width: goState.card.w, height: Math.min(goState.card.h, 200) } });
    }
  }

  await page.close();
}

// ---------------------------------------------------------------------------------------------
// THE TUTORIAL/SURFACE IN A LESSON. A guided level is a match, so it wears the corner badge like
// any other match — the tutorial's dim must never swallow it.
{
  console.log('\n--- tutorial surface (390x844)');
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await seed(page);
  await page.goto(ORIGIN, { waitUntil: 'networkidle' });
  await page.waitForSelector('#menu:not([hidden])', { timeout: 20_000 });
  await page.click('#menu-play');
  await page.waitForSelector('#play-menu:not([hidden])', { timeout: 10_000 });
  await page.click('#menu-campaign');
  await page.waitForFunction(
    "(() => { const h = window.__severgrow; return !!h.state() || !document.getElementById('campaign').hidden; })()",
    undefined, { timeout: 20_000 },
  );
  if (await page.locator('#campaign-continue').isVisible().catch(() => false)) await page.click('#campaign-continue');
  await waitIdle(page);
  await page.waitForTimeout(1200);
  const lesson = (await page.evaluate(MARK)) as {
    visible: boolean; opacity: number; z: number; chain: unknown[]; overlays: { node: string; z: number }[];
    box: { x: number; y: number; right: number; bottom: number };
  };
  const lessonState = await page.evaluate(() => {
    const plate = document.getElementById('lesson-plate');
    const r = plate?.getBoundingClientRect();
    return {
      tutorial: document.documentElement.classList.contains('futa04-tutorial'),
      lesson: document.documentElement.classList.contains('futa04-lesson'),
      plate: r && r.width > 0 ? { x: r.x, y: r.y, right: r.right, bottom: r.bottom } : null,
    };
  });
  const marks = (await page.evaluate(COUNT_MARKS)) as { id: string }[];
  check(lessonState.tutorial || lessonState.lesson, 'guided lesson: the lesson surface is really on screen');
  check(lesson.visible, 'guided lesson: the corner mark is still there');
  check(lesson.chain.length === 0, `guided lesson: no filter smears it (${JSON.stringify(lesson.chain)})`);
  check(lesson.overlays.every((o) => o.z < lesson.z), `guided lesson: the dim is painted below it (${JSON.stringify(lesson.overlays)} vs z ${lesson.z})`);
  check(marks.length === 1, `guided lesson: exactly one mark (${marks.map((m) => m.id).join(', ') || 'none'})`);
  if (lessonState.plate) check(!overlap(lesson.box as never, lessonState.plate), 'guided lesson: the mark clears the lesson plate');
  if (SHOTS) await page.screenshot({ path: join(SHOTS, 'tutorial-390x844.png') });
  check(errors.length === 0, `guided lesson: no page errors (${errors.slice(0, 2).join(' | ')})`);
  await page.close();
}

// ---------------------------------------------------------------------------------------------
// Reduce motion: the mark is simply there (it may fade with a surface, but it never runs its own
// animation) and the finish card pays for the mark without scrolling on the tightest phone.
{
  console.log('\n--- reduce motion + marks');
  const page = await browser.newPage({ viewport: { width: 360, height: 640 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  await seed(page, true);
  await startMatch(page);
  await pause(page);
  const m = (await page.evaluate(MARK)) as { animations: number; visible: boolean };
  const reduce = await page.evaluate(() => document.documentElement.classList.contains('reduce-motion'));
  check(reduce, 'reduce motion: the seeded setting really reached the page');
  check(m.visible && m.animations === 0, `reduce motion: the paused mark is still and present (${m.animations} animations)`);
  await page.close();
}

await browser.close();
server.close();
console.log(`\n${failed === 0 ? 'ALL PASS' : `${failed} FAILED`} — ${total} checks — branding surfaces${SHOTS ? ` — shots in ${SHOTS}` : ''}`);
process.exit(failed === 0 ? 0 : 1);
