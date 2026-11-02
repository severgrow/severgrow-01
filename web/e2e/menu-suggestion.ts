// THE MENU'S CAMPAIGN SUGGESTION, AND THE DARK GLASS — the browser guard (owner, 2026-11-02).
//
//   CHANNEL=futa04 VITE_DUEL_API_URL=/functions/v1/duel npm run web:build
//   npx tsx web/e2e/menu-suggestion.ts
//
// Serves the CURRENT `web/dist` (the product build) and drives real Chromium:
//   1. a new player sees a slight CREAM halo around PLAY — a static box-shadow on the key's ::after,
//      never a `filter` and never an animation — and PLAY says only "Play";
//   2. tapping PLAY opens the submenu with LEVEL 1 wearing the same halo; the count/lamps are gone;
//   3. once c1-10 is cleared the halo is off both keys, and it stays off through a submenu round trip;
//   4. the main menu's key material is EXACTLY the PLAY submenu's key material — same computed
//      background and backdrop-filter, the dark glass the owner pointed at — and PLAY stays cream;
//   5. Reduce motion leaves the halo in place but removes every movement (there is none to begin
//      with: the key reports `animation: none`, `transition: none`, no running animation);
//   6. the pinned menu geometry is untouched: 50px keys and equal spacing at 320x568 and 390x844;
//   7. screenshots land in docs/screens/menu/, and no page error is logged.
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { chromium } from 'playwright-core';
import type { Page } from 'playwright-core';

const DIST = process.env.FUTA_DIST ?? 'web/dist';
const SHOTS = 'docs/screens/menu';
const PROGRESS_KEY = 'severgrow.campaign.progress.v3';
const KEY_H = 50;
const C1 = ['c1-01', 'c1-02', 'c1-03', 'c1-04', 'c1-05', 'c1-06', 'c1-07', 'c1-08', 'c1-09', 'c1-10'];
const CREAM = 'rgb(232, 221, 197)';
/** The same cream after `color-mix()`: Chromium serialises it in modern `color(srgb …)` form. */
const CREAM_INK = /232, 221, 197|0\.909804 0\.866667 0\.772549/;
const GLASS = 'rgba(8, 10, 10, 0.42)';
const GLASS_BLUR = 'blur(9px) saturate(1.05)';

const types: Record<string, string> = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.webp': 'image/webp', '.webmanifest': 'application/manifest+json', '.json': 'application/json',
};
const server = createServer((req, res) => {
  const path = decodeURIComponent((req.url ?? '/').split('?')[0]!);
  let file = join(DIST, path === '/' ? 'index.html' : path);
  if (!existsSync(file) || file.endsWith('/')) file = join(DIST, 'index.html');
  res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' });
  res.end(readFileSync(file));
});
await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
const ORIGIN = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

mkdirSync(SHOTS, { recursive: true });
const browser = await chromium.launch({
  ...(process.env.PW_CHROMIUM
    ? { executablePath: process.env.PW_CHROMIUM }
    : existsSync('/Users/patryk/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing')
      ? { executablePath: '/Users/patryk/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing' }
      : {}),
  args: ['--no-sandbox'],
});

type Box = { x: number; y: number; w: number; h: number; bottom: number; right: number; cx: number; cy: number };
/** One key: its box, its spoken line, and the material it actually computes. */
const KEY = `(id) => {
  const el = document.getElementById(id);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const cs = getComputedStyle(el);
  const after = getComputedStyle(el, '::after');
  const box = { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1), bottom: +r.bottom.toFixed(1), right: +r.right.toFixed(1), cx: +(r.x + r.width / 2).toFixed(1), cy: +(r.y + r.height / 2).toFixed(1) };
  return {
    ...box,
    text: (el.textContent || '').trim(),
    aria: el.getAttribute('aria-label'),
    suggest: el.classList.contains('suggest'),
    primary: el.classList.contains('primary'),
    visible: el.offsetParent !== null,
    background: cs.backgroundColor,
    backdrop: cs.backdropFilter,
    shadow: cs.boxShadow,
    filter: cs.filter,
    animation: cs.animationName,
    transition: cs.transitionDuration,
    halo: { content: after.content, shadow: after.boxShadow, filter: after.filter, animation: after.animationName, pointer: after.pointerEvents },
    running: el.getAnimations({ subtree: true }).filter((a) => a.playState === 'running').length,
  };
}`;
type Key = Box & {
  text: string; aria: string | null; suggest: boolean; primary: boolean; visible: boolean;
  background: string; backdrop: string; shadow: string; filter: string; animation: string; transition: string;
  halo: { content: string; shadow: string; filter: string; animation: string; pointer: string }; running: number;
};
const key = (page: Page, id: string) => page.evaluate(`(${KEY})(${JSON.stringify(id)})`) as Promise<Key | null>;

/** The real gaps between consecutive visible menu keys (the owner's equal-spacing rule). */
const MENU = `(() => {
  const keys = [...document.querySelectorAll('#menu .menu-buttons .btn')].filter((b) => b.offsetParent !== null)
    .sort((a, b) => a.getBoundingClientRect().y - b.getBoundingClientRect().y || a.getBoundingClientRect().x - b.getBoundingClientRect().x);
  const gaps = [];
  for (let i = 1; i < keys.length; i++) {
    const p = keys[i - 1].getBoundingClientRect(), c = keys[i].getBoundingClientRect();
    if (Math.abs(c.y - p.y) < 1) continue;
    gaps.push(+(c.y - p.bottom).toFixed(1));
  }
  const inner = document.querySelector('#menu .menu-inner');
  return {
    keys: keys.map((k) => ({ id: k.id, h: +k.getBoundingClientRect().height.toFixed(1), suggest: k.classList.contains('suggest') })),
    gaps,
    innerOverflow: inner ? Math.max(0, Math.round(inner.scrollHeight - inner.clientHeight)) : null,
    screenOverflow: Math.max(0, document.documentElement.scrollHeight - window.innerHeight),
    lamps: !!document.getElementById('menu-play-lessons'),
  };
})()`;
type Menu = { keys: { id: string; h: number; suggest: boolean }[]; gaps: number[]; innerOverflow: number | null; screenOverflow: number; lamps: boolean };
const menu = (page: Page) => page.evaluate(MENU) as Promise<Menu>;

const results: { name: string; ok: boolean; note: string }[] = [];
const check = (name: string, ok: boolean, note = '') => {
  results.push({ name, ok, note });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? `  (${note})` : ''}`);
};
const storage = (completed: string[]) => JSON.stringify({ version: 1, unlocked: Math.min(11, completed.length + 1), completed, best: {} });

/** A fresh device: no storage at all. Cleared after boot, as an init script would break the reload. */
const openFresh = async (page: Page) => {
  await page.goto(ORIGIN, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#menu:not([hidden])', { timeout: 30_000 });
  await page.waitForTimeout(600); // the injected typography stylesheet mounts after boot
};

const reopenWith = async (page: Page, completed: string[]) => {
  await page.evaluate((pair) => localStorage.setItem(pair[0], pair[1]), [PROGRESS_KEY, storage(completed)] as [string, string]);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#menu:not([hidden])', { timeout: 30_000 });
  await page.waitForTimeout(600);
};

const VIEWPORTS = [
  { key: '320x568', width: 320, height: 568 },
  { key: '390x844', width: 390, height: 844 },
] as const;

for (const vp of VIEWPORTS) {
  const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height }, hasTouch: true, isMobile: true });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const tag = vp.key;

  // ---- 1. the new player's menu: halo on PLAY only, PLAY speaks just its word ----
  await openFresh(page);
  const play = await key(page, 'menu-play');
  const fresh = await menu(page);
  check(`${tag}: PLAY carries the suggestion class`, !!play?.suggest, JSON.stringify(play && { suggest: play.suggest }));
  check(`${tag}: the halo is a cream box-shadow on the key's ::after`,
    !!play && play.halo.shadow !== 'none' && CREAM_INK.test(play.halo.shadow),
    String(play?.halo.shadow));
  check(`${tag}: the halo is NOT a filter on the key, and not an animation`,
    play?.filter === 'none' && play?.halo.filter === 'none' && play?.animation === 'none' && play?.halo.animation === 'none',
    `filter ${play?.filter} / ${play?.halo.filter}, anim ${play?.animation} / ${play?.halo.animation}`);
  check(`${tag}: nothing on PLAY is running`, play?.running === 0, `${play?.running} running`);
  check(`${tag}: PLAY is just "Play" — no lesson count in its spoken line`,
    play?.aria === 'Play' && play?.text === 'Play', String(play?.aria));
  check(`${tag}: the halo cannot eat a tap`, play?.halo.pointer === 'none' && play?.halo.content !== 'none', `${play?.halo.pointer} / ${play?.halo.content}`);
  check(`${tag}: PLAY stays the one cream key`, play?.primary === true && play?.background === CREAM, `${play?.primary} / ${play?.background}`);
  check(`${tag}: the lamp strip is gone from the menu completely`, fresh.lamps === false);
  check(`${tag}: every key is still ${KEY_H}px and the spacing is equal`,
    fresh.keys.every((k) => k.h === KEY_H) && fresh.gaps.length > 0 && new Set(fresh.gaps).size === 1,
    `${fresh.keys.map((k) => `${k.id}:${k.h}`).join(' ')} gaps ${JSON.stringify(fresh.gaps)}`);
  check(`${tag}: the menu does not overflow`, fresh.innerOverflow === 0 && fresh.screenOverflow === 0,
    `inner ${fresh.innerOverflow}, screen ${fresh.screenOverflow}`);
  // Which keys are suggested: PLAY, and nothing else on this screen.
  check(`${tag}: only PLAY is suggested on the menu`,
    fresh.keys.filter((k) => k.suggest).map((k) => k.id).join(',') === 'menu-play',
    fresh.keys.filter((k) => k.suggest).map((k) => k.id).join(','));

  if (vp.key === '390x844') {
    await page.screenshot({ path: join(SHOTS, 'menu-glass-glow-390x844.png') });
  }

  // ---- 2. the submenu: LEVEL 1 wears the same halo, on the same material ----
  const ghostMenu = await key(page, 'menu-settings');
  await page.click('#menu-play');
  await page.waitForSelector('#play-menu:not([hidden])', { timeout: 10_000 });
  await page.waitForTimeout(400);
  const level = await key(page, 'menu-campaign');
  const submenuGhost = await key(page, 'menu-new');
  check(`${tag}: LEVEL 1 is the suggested key in the submenu`,
    level?.text === 'LEVEL 1' && level?.suggest === true && level?.visible === true,
    `${String(level?.text)} / suggest ${String(level?.suggest)}`);
  const levelHalo = level?.halo.shadow ?? 'none';
  check(`${tag}: LEVEL 1 wears the same cream halo, with no filter and no animation`,
    levelHalo !== 'none' && CREAM_INK.test(levelHalo)
      && level?.filter === 'none' && level?.animation === 'none' && level?.running === 0,
    `${levelHalo} / ${level?.filter} / ${level?.animation}`);
  // THE OWNER'S WORDS IN ONE ASSERTION: the menu key and the submenu key are one material.
  check(`${tag}: the menu key's material MATCHES the submenu key's`,
    !!ghostMenu && !!submenuGhost && ghostMenu.background === submenuGhost.background && ghostMenu.backdrop === submenuGhost.backdrop,
    `menu ${ghostMenu?.background} / ${ghostMenu?.backdrop} vs submenu ${submenuGhost?.background} / ${submenuGhost?.backdrop}`);
  check(`${tag}: and that material is the game's dark glass in both menus`,
    ghostMenu?.background === GLASS && ghostMenu?.backdrop === GLASS_BLUR
      && submenuGhost?.background === GLASS && submenuGhost?.backdrop === GLASS_BLUR,
    `${ghostMenu?.background} / ${ghostMenu?.backdrop}`);
  check(`${tag}: LEVEL 1 stays cream`, level?.primary === true && level?.background === CREAM, `${level?.primary} / ${level?.background}`);

  if (vp.key === '390x844') {
    await page.screenshot({ path: join(SHOTS, 'play-submenu-glass-glow-390x844.png') });
  }

  // ---- 3. the tenth lesson ends the suggestion, for good ----
  await page.click('#play-back');
  await page.waitForSelector('#menu:not([hidden])', { timeout: 10_000 });
  await reopenWith(page, C1);
  const donePlay = await key(page, 'menu-play');
  const done = await menu(page);
  check(`${tag}: after c1-10 PLAY has no halo`,
    donePlay?.suggest === false && donePlay.halo.shadow === 'none',
    `${String(donePlay?.suggest)} / ${donePlay?.halo.shadow}`);
  check(`${tag}: and PLAY is just PLAY again, still ${KEY_H}px`,
    donePlay?.aria === 'Play' && donePlay?.text === 'Play' && donePlay.h === KEY_H, `${donePlay?.aria} ${donePlay?.h}px`);
  check(`${tag}: the suggested key set is empty`, done.keys.every((k) => !k.suggest));
  check(`${tag}: the spacing is unchanged by the halo coming off`,
    JSON.stringify(done.gaps) === JSON.stringify(fresh.gaps) && done.keys.every((k, i) => k.h === fresh.keys[i]?.h),
    `${JSON.stringify(fresh.gaps)} vs ${JSON.stringify(done.gaps)}`);
  await page.click('#menu-play');
  await page.waitForSelector('#play-menu:not([hidden])', { timeout: 10_000 });
  await page.waitForTimeout(400);
  const doneLevel = await key(page, 'menu-campaign');
  check(`${tag}: LEVEL 1 has no halo in the submenu either`, doneLevel?.suggest === false && doneLevel.halo.shadow === 'none',
    `${String(doneLevel?.suggest)} / ${doneLevel?.halo.shadow}`);
  await page.click('#play-back');
  await page.waitForSelector('#menu:not([hidden])', { timeout: 10_000 });
  const back = await key(page, 'menu-play');
  check(`${tag}: a round trip through the submenu cannot bring it back`, back?.suggest === false && back.halo.shadow === 'none');

  if (vp.key === '390x844') {
    await page.screenshot({ path: join(SHOTS, 'menu-glass-glow-done-390x844.png') });
  }

  check(`${tag}: no page errors`, errors.length === 0, errors[0] ?? '');
  await page.close();
}

// ---- 4. Reduce motion: the halo stays, every movement is absent ---------------------------
{
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, reducedMotion: 'reduce' });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await openFresh(page);
  const play = await key(page, 'menu-play');
  check('reduce motion: the halo is still there (a static, non-moving suggestion)',
    play?.suggest === true && play.halo.shadow !== 'none', String(play?.halo.shadow));
  check('reduce motion: no animation, no transition and nothing running',
    play?.animation === 'none' && play?.halo.animation === 'none' && play?.transition === '0s' && play?.running === 0,
    `${play?.animation} / ${play?.halo.animation} / ${play?.transition} / ${play?.running}`);
  check('reduce motion: still no filter on the key', play?.filter === 'none' && play?.halo.filter === 'none', `${play?.filter} / ${play?.halo.filter}`);
  check('reduce motion: the page logs no error', errors.length === 0, errors[0] ?? '');
  await context.close();
}

await browser.close();
await server.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} menu-suggestion checks passed`);
process.exit(failed.length ? 1 : 0);
