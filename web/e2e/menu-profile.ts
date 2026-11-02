// THE MENU FOOTER + PLAYER PROFILE SKELETON in a real browser (owner brief, 2026-10-21).
//
//   PW_CHROMIUM="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" npx tsx web/e2e/menu-profile.ts
//   SHOTS=1 ... also writes docs/screens/menu-footer/*.png
//
// What it proves, against the built futa05 page (never a real Supabase project):
//   1. signed out, the bottom row is LOG IN (left) and Settings (right), both the owner's 50px key;
//   2. signed in (a local fixture: identity + Google account record), the SAME left key carries the
//      player's name, and its spoken label says whose profile it opens;
//   3. pressing that key opens the profile sheet with EXACTLY five rows, and — with no reachable
//      API in this build — Seeds, tiles and matches won are em dashes, never a fake 0;
//   4. the profile closes on Escape and hands focus back to the key, and it is reachable by
//      keyboard (focus the key, press Enter);
//   5. at 320x568 the profile fits without scrolling and the sheet traps nothing;
//   6. THE NAMEPLATE GUARD (owner, 2026-11-02: "profile frame ... next to logo looking ugly"):
//      the wordmark is >=64px wide (17.4% of 390 at the game's 22px wordmark), clears the plate's
//      rounded corner by >=18px on the arc and >=16px above, and clears the centred title and the
//      close key. The plate's radius is read from getComputedStyle, not assumed.
//   7. the one colour tile is always present for a signed-in player (deterministic colourIdFor when
//      no choice was ever stored), 20.5px, on the name's baseline — and the plate is dense enough
//      that the menu's ambient gradient cannot draw a wash across a row.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { chromium } from 'playwright-core';
import type { Browser, Page } from 'playwright-core';
import { PROFILE } from '../../src/strings.js';
import { colourById, colourFor, colourIdFor } from '../../src/tile-colours.js';
import { SEEDS_WORD } from '../src/online/seed-icon.js';

const DIST = process.env.FUTA_DIST ?? 'web/dist';
const SHOTS = process.env.SHOTS === '1';
// A LOCAL, unreachable target (the repo's convention for a build that must carry an online config
// without being able to reach a real project). Using a *.supabase.co literal here would mark this
// suite as real-capable in server/tests/quota-guard.test.ts and demand a classification it does
// not need: it only ever serves the local dist and fakes the wallet answer.
const SUPA = 'http://127.0.0.1:9';
const API = `${SUPA}/functions/v1/duel`;
// The colour the fixture player is born with. `fixture-player` NEVER POSTs a choice, so this is the
// deterministic assignment (FNV-1a → one of the twenty) — the exact player the owner's report is
// about. The profile must paint this without any server answer.
const derivedColour = colourFor('fixture-player');
const derivedName = colourById(colourIdFor('fixture-player')).name;
/** `hsl(h s% l%)` as the three 0-255 integers `getComputedStyle(...).fill` reports. */
const hslToRgb = (css: string): number[] => {
  const m = /^hsl\(\s*(-?[\d.]+)\s+([\d.]+)%\s+([\d.]+)%\s*\)$/.exec(css.trim());
  if (!m) throw new Error(`not an hsl() colour: ${css}`);
  const h = Number(m[1]) / 360, s = Number(m[2]) / 100, l = Number(m[3]) / 100;
  const f = (n: number) => {
    const k = (n + h * 12) % 12, a = s * Math.min(l, 1 - l);
    return Math.round((l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)))) * 255);
  };
  return [f(0), f(8), f(4)];
};
let failed = 0;
/** The alpha of a computed colour (`color(srgb … / a)`, `rgba(…)`), or 1 when it is opaque. */
const alphaOf = (css: string): number => {
  const slash = /\/\s*([\d.]+%?)\s*\)/.exec(css);
  if (slash) return slash[1]!.endsWith('%') ? Number(slash[1]!.slice(0, -1)) / 100 : Number(slash[1]);
  const rgba = /^rgba\([^)]*,\s*([\d.]+)\s*\)$/.exec(css);
  return rgba ? Number(rgba[1]) : 1;
};
const check = (name: string, ok: boolean, note = '') => {
  if (!ok) failed += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? `  (${note})` : ''}`);
};
const waitFor = async (cond: () => Promise<boolean> | boolean, timeout = 15_000): Promise<boolean> => {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      if (await cond()) return true;
    } catch {
      /* navigating */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  return false;
};

// ---- build the 0.5 product channel with accounts ON, against the placeholder project ----
// `FUTA_REUSE_DIST=1` reuses an existing web/dist (a local iteration speed-up when the machine is
// loaded); the default, and what CI runs, always builds.
if (process.env.FUTA_REUSE_DIST !== '1') await new Promise<void>((resolve, reject) => {
  const child = spawn(process.execPath, ['./node_modules/vite/bin/vite.js', 'build', '--config', 'web/vite.config.ts'], {
    env: {
      ...process.env,
      CHANNEL: 'futa05',
      VITE_ACCOUNTS: 'on',
      VITE_SUPABASE_URL: SUPA,
      VITE_SUPABASE_ANON_KEY: 'local',
      VITE_DUEL_API_URL: API,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let err = '';
  child.stderr?.on('data', (b) => (err += String(b)));
  child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(err))));
});

// ---- serve the built page ----
const types: Record<string, string> = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.webp': 'image/webp', '.webmanifest': 'application/manifest+json', '.json': 'application/json',
};
const server = createServer((req, res) => {
  const path = decodeURIComponent((req.url ?? '/').split('?')[0]!);
  let file = join(DIST, path || 'index.html');
  if (!existsSync(file) || file.endsWith('/')) file = join(DIST, 'index.html');
  res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' });
  res.end(readFileSync(file));
});
await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
if (SHOTS) mkdirSync('docs/screens/menu-footer', { recursive: true });

const browser: Browser = await chromium.launch({
  ...(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}),
  args: ['--no-sandbox'],
});

const shot = async (page: Page, name: string) => {
  if (!SHOTS) return;
  await page.screenshot({ path: `docs/screens/menu-footer/${name}.png` });
};

/** The nameplate and the plate's top corners together, so the curve and the mark are seen at 1:1. */
const shotHead = async (page: Page, name: string) => {
  if (!SHOTS) return;
  const box = (await page.evaluate(`(() => {
    const sheet = document.getElementById('sheet-profile');
    const s = sheet.getBoundingClientRect();
    const head = sheet.querySelector('.sp-head').getBoundingClientRect();
    // 14px of the backdrop above (the plate floats 10px off the screen edge, so the rounded corner
    // is legible) and 10px below the hairline: the corner, the mark and the title in one frame.
    return { x: Math.max(0, s.x - 14), y: Math.max(0, s.y - 14), width: s.width + 28, height: head.bottom - s.y + 24 };
  })()`)) as { x: number; y: number; width: number; height: number };
  await page.screenshot({ path: `docs/screens/menu-footer/${name}.png`, clip: box });
};

/** The nameplate and the name line alone — the two rows the owner's report is about, at 1:1. */
const shotNameRow = async (page: Page, name: string) => {
  if (!SHOTS) return;
  const box = (await page.evaluate(`(() => {
    const sheet = document.getElementById('sheet-profile');
    const head = sheet.querySelector('.sp-head').getBoundingClientRect();
    const row = sheet.querySelector('.sp-row-name').getBoundingClientRect();
    const s = sheet.getBoundingClientRect();
    return { x: s.x, y: head.top, width: s.width, height: row.bottom - head.top };
  })()`)) as { x: number; y: number; width: number; height: number };
  await page.screenshot({ path: `docs/screens/menu-footer/${name}.png`, clip: box });
};

/** The fake Supabase answers the ONE probe the accounts module makes; every API call fails fast. */
const fakeNetwork = (page: Page) =>
  page.route('**/*', (route) => {
    const url = route.request().url();
    if (!url.startsWith(SUPA)) return route.continue();
    if (url.includes('/auth/v1/settings')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ external: { google: true } }) });
    }
    // No reachable duel API: the wallet/world reads fail, which is exactly the unknown-value case.
    return route.fulfill({ status: 503, contentType: 'application/json', body: '{}' });
  });

/** The storage prefix a futa05 build installs (web/src/channel.ts). */
const PREFIX = 'futa05:';
const device = async (opts: { w: number; h: number; signedIn: boolean; largeText?: boolean | undefined; dpr?: number | undefined }) => {  const context = await browser.newContext({
    viewport: { width: opts.w, height: opts.h },
    hasTouch: opts.w < 800,
    isMobile: opts.w < 800,
    deviceScaleFactor: opts.dpr ?? 1,
    // A known country, so the flag in the name line is measurable on every runner (not host-clock).
    timezoneId: 'Europe/Warsaw',
  });
  const page = await context.newPage();
  await fakeNetwork(page);
  if (opts.signedIn) {
    await page.addInitScript(
      ([prefix, large]) => {
        localStorage.clear();
        localStorage.setItem(`${prefix}severgrow.duel.identity.v1`, JSON.stringify({ token: 'fixture-token', playerId: 'fixture-player', displayName: 'Ann', kind: 'account' }));
        localStorage.setItem(`${prefix}severgrow.stats.v1`, JSON.stringify({ played: 12, wins: 7, losses: 5, draws: 0, best: 31, streak: 2, bestStreak: 4 }));
        localStorage.setItem(`${prefix}severgrow.play.v1`, JSON.stringify({ grow: 140, bloom: 22, bomb: 9, blast: 2, longestBloom: 5 }));
        localStorage.setItem(`${prefix}futasaku.account.v1`, JSON.stringify({ provider: 'google', email: 'ann@gmail.com', playerId: 'fixture-player' }));
        if (large) localStorage.setItem(`${prefix}severgrow.settings.v1`, JSON.stringify({ largeText: true }));
      },
      [PREFIX, opts.largeText === true] as const,
    );
  } else {
    await page.addInitScript(() => localStorage.clear());
  }
  await page.goto(`${origin}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#menu:not([hidden]) .menu-inner', { timeout: 40_000 });
  // The accounts module is a late dynamic import; its probe must finish before reading the key.
  await waitFor(() => page.evaluate("document.body.classList.contains('acct-on')") as Promise<boolean>, 40_000);
  await page.waitForTimeout(300);
  return { context, page };
};

const tag = (name: string) => name.replace(/[^a-z0-9]+/gi, '-').toLowerCase();

try {
  // ---- 1. signed out: LOG IN left, Settings right, one 50px row ----
  {
    const { context, page } = await device({ w: 360, h: 640, signedIn: false });
    const foot = await page.evaluate(`(() => {
      const el = document.getElementById('menu-foot');
      const login = document.getElementById('menu-login');
      const settings = document.getElementById('menu-settings');
      const b = (n) => { const r = n.getBoundingClientRect(); return { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1), right: +r.right.toFixed(1), bottom: +r.bottom.toFixed(1) }; };
      return {
        role: el.getAttribute('role'),
        label: el.getAttribute('aria-label'),
        loginHidden: login.hidden,
        loginText: (login.textContent || '').trim(),
        loginAria: login.getAttribute('aria-label'),
        login: b(login),
        settings: b(settings),
      };
    })()`) as {
      role: string; label: string; loginHidden: boolean; loginText: string; loginAria: string;
      login: { x: number; y: number; w: number; h: number; right: number; bottom: number };
      settings: { x: number; y: number; w: number; h: number; right: number; bottom: number };
    };
    check('signed out: the footer is one labelled group', foot.role === 'group' && foot.label === 'Account and settings', `${foot.role}/${foot.label}`);
    check('signed out: the left key reads LOG IN', !foot.loginHidden && foot.loginText === 'LOG IN', JSON.stringify(foot.loginText));
    check('signed out: its spoken name is LOG IN', foot.loginAria === 'LOG IN', foot.loginAria ?? '');
    check('signed out: LOG IN is the LEFT key', foot.login.right <= foot.settings.x + 0.5, `${foot.login.right} ≤ ${foot.settings.x}`);
    check('signed out: Settings is the RIGHT key', foot.settings.x > foot.login.x, `${foot.settings.x} > ${foot.login.x}`);
    check('signed out: both keys are on one row', Math.abs(foot.login.y - foot.settings.y) <= 0.5, `${foot.login.y}/${foot.settings.y}`);
    check('signed out: both keys are 50px', Math.abs(foot.login.h - 50) <= 0.5 && Math.abs(foot.settings.h - 50) <= 0.5, `${foot.login.h}/${foot.settings.h}`);
    // Every key on the menu is the same 50px instrument.
    const heights = (await page.evaluate(`[...document.querySelectorAll('#menu .menu-buttons .btn')].filter((b) => b.offsetParent !== null).map((b) => +b.getBoundingClientRect().height.toFixed(1))`)) as number[];
    check('signed out: every menu key is 50px', heights.length >= 3 && heights.every((h) => Math.abs(h - 50) <= 0.5), heights.join(','));
    // DOM order is tab order: the footer is last.
    const ids = (await page.evaluate(`[...document.querySelectorAll('#menu button')].filter((b) => b.offsetParent !== null).map((b) => b.id)`)) as string[];
    check('signed out: the tab order ends with the footer', JSON.stringify(ids.slice(-2)) === JSON.stringify(['menu-login', 'menu-settings']), ids.join(' → '));
    await shot(page, `menu-signed-out-${tag('360x640')}`);
    await context.close();
  }

  // ---- 2. signed in: the SAME key carries the name, and opens the five-line profile ----
  // `large` runs the same measurements with the game's Large text (html.large-text = 118%), which
  // is where a name line and a nameplate are most likely to collide or clip.
  type Size = { w: number; h: number; large?: boolean; dpr?: number };
  const sizes: Size[] = [
    { w: 360, h: 640 },
    { w: 320, h: 568 },
    { w: 390, h: 844, dpr: 3 },
    { w: 844, h: 390 },
    { w: 320, h: 568, large: true },
    { w: 390, h: 844, large: true },
    // Landscape is a centred dialog with all FOUR corners rounded, and Large text grows the
    // nameplate's title: the corner guard has to hold there too, not just on the tall phone.
    { w: 844, h: 390, large: true },
    // THE OWNER'S PHONE (2026-11-02): his report's image is 464x1004, the CSS width of a large
    // iPhone at the screenshot's scale. Same pass, so the after-shot can be compared 1:1.
    { w: 464, h: 1004 },
  ];
  for (const size of sizes) {
    const label = `${size.w}x${size.h}${size.large ? ' large text' : ''}`;
    const { context, page } = await device({ w: size.w, h: size.h, largeText: size.large, dpr: size.dpr, signedIn: true });
    const name = ((await page.locator('#menu-login').textContent()) ?? '').trim();
    check(`${label}: the left key shows the player's name`, name.startsWith('Ann #') && name.length > 5, name);
    const aria = (await page.locator('#menu-login').getAttribute('aria-label')) ?? '';
    check(`${label}: the key names the profile it opens`, aria === PROFILE.open(name), aria);

    await page.click('#menu-login');
    const open = await waitFor(() => page.locator('#sheet-profile').isVisible());
    check(`${label}: pressing it opens the profile`, open);
    // The sheet slides in on the acknowledgement beat; measure the settled sheet, not mid-slide.
    await page.waitForTimeout(400);
    const rows = (await page.evaluate(`(() => {
      const sheet = document.getElementById('sheet-profile');
      const ids = ['profile-name', 'profile-seeds', 'profile-tiles', 'profile-wins'];
      const tiles = (id) => [...(document.getElementById(id)?.querySelectorAll('.sp-tile') ?? [])]
        .map((t) => [t.querySelector('dt')?.textContent.trim(), t.querySelector('dd')?.textContent.trim()]);
      return {
        n: sheet.querySelectorAll('.sp-row').length,
        labels: [...sheet.querySelectorAll('.sp-row dt')].map((d) => d.textContent.trim()),
        values: ids.map((id) => (document.getElementById(id)?.textContent ?? '').trim()),
        offline: tiles('profile-play-offline'),
        online: tiles('profile-play-online'),
        sides: [...sheet.querySelectorAll('.sp-play-side')].map((s) => s.textContent.trim()),
        note: sheet.querySelector('.sp-play-note') ? 1 : 0,
        signIn: /sign.?in/i.test(sheet.textContent ?? '') ? 1 : 0,
        brand: sheet.querySelector('#profile-brand svg') ? 1 : 0,
        // THE WORDMARK (owner, 2026-11-01: "make sure the logo in profile isnt too small too").
        // It used to be width:22px = 22x7.14 (a stamp). The game's own wordmark size is 22px HIGH
        // (#hud-brand at >=660px tall, .online-brand always): 67.69x22 at the asset's 2200:715 ratio.
        brandMark: (() => {
          const r = sheet.querySelector('#profile-brand svg').getBoundingClientRect();
          return { w: +r.width.toFixed(2), h: +r.height.toFixed(2), right: +r.right.toFixed(1) };
        })(),
        // THE CORNER (owner, 2026-11-02: "the profile frame ... next to logo looking ugly"). The
        // plate's corners are 32px on the product channel (the active theme's --radius 16px,
        // doubled by the product sheet rule), and all four are rounded in landscape where the sheet
        // becomes a centred dialog. Every mark in the header is measured against the arc itself:
        // markAir / closeAir are the distance from that element's top-left / top-right corner to
        // the corner arc (0 = on the curve, negative = under it, r - hypot(r - dx, r - dy)).
        corner: (() => {
          const cs = getComputedStyle(sheet);
          const rr = cs.borderTopLeftRadius.split(/\s+/).map((v) => parseFloat(v));
          const rx = rr[0], ry = rr[1] ?? rr[0];
          const s = sheet.getBoundingClientRect();
          const b = sheet.querySelector('#profile-brand svg').getBoundingClientRect();
          const t = document.getElementById('profile-title').getBoundingClientRect();
          const c = sheet.querySelector('.sp-close').getBoundingClientRect();
          // The close key's GLYPH, not its 44px target: the target is deliberately larger than the
          // mark it draws, and the eye reads the ink.
          const ci = (sheet.querySelector('.sp-close .i') ?? sheet.querySelector('.sp-close')).getBoundingClientRect();
          const row = sheet.querySelector('.sp-row').getBoundingClientRect();
          // Distance from a point to the rounded corner: outside the corner square it is just the
          // inset on the narrow axis; inside it, the gap to the arc.
          const gap = (dx, dy) =>
            dx >= rx || dy >= ry ? Math.min(dx, dy) : rx - Math.hypot(rx - dx, ry - dy);
          return {
            radius: +rx.toFixed(2), radiusY: +ry.toFixed(2),
            markLeftAir: +(b.left - s.left).toFixed(2),
            markTopAir: +(b.top - s.top).toFixed(2),
            markAir: +gap(b.left - s.left, b.top - s.top).toFixed(2),
            // THE NAME STILL READS AS ONE LINE (owner, 2026-11-02): the 22px mark and the centred
            // word must share the nameplate's centre line, not merely both be "inside" the row.
            markCentre: +(b.top + b.height / 2).toFixed(2),
            titleCentreY: +(t.top + t.height / 2).toFixed(2),
            closeAir: +gap(s.right - ci.right, ci.top - s.top).toFixed(2),
            closeRight: +(s.right - c.right).toFixed(2),
            titleInsetLeft: +(t.left - s.left).toFixed(2),
            titleInsetRight: +(s.right - t.right).toFixed(2),
            rowTopInset: +(row.top - s.top).toFixed(2),
          };
        })(),
        // THE BOTTOM CORNERS. In landscape the sheet is a centred dialog and ALL four corners are
        // rounded (32px); the record is then the lowest content, so its two bottom corners are the
        // ones that could be tucked under the curve. Measure the two lowest blocks (the identity
        // rows and the record), not the sheet, so the check means "the content clears the arc".
        bottomBlocks: [...sheet.querySelectorAll('.sp-rows, .sp-play')].map((el) => {
          const r = el.getBoundingClientRect();
          const s = sheet.getBoundingClientRect();
          return {
            left: +(r.left - s.left).toFixed(2), right: +(s.right - r.right).toFixed(2),
            bottom: +(s.bottom - r.bottom).toFixed(2),
          };
        }),
        // The title's INK, not its grid box: the mark may overhang its 44px cell, but must never
        // touch the centred word.
        titleInkLeft: (() => {
          const t = document.getElementById('profile-title');
          const tn = [...t.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim());
          const rg = document.createRange();
          rg.selectNodeContents(tn);
          return +rg.getBoundingClientRect().left.toFixed(1);
        })(),
        titleCentre: (() => {
          const t = document.getElementById('profile-title').getBoundingClientRect();
          const s = sheet.getBoundingClientRect();
          return +((t.x + t.width / 2) - (s.x + s.width / 2)).toFixed(2);
        })(),
        headH: +sheet.querySelector('.sp-head').getBoundingClientRect().height.toFixed(1),
        close: (() => {
          const r = sheet.querySelector('.sp-close').getBoundingClientRect();
          return { left: +r.left.toFixed(1), right: +r.right.toFixed(1), top: +r.top.toFixed(1), bottom: +r.bottom.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) };
        })(),
        // ONE BASELINE for the name, the flag and the tile. A zero-size inline-block appended inside
        // an element rests its bottom edge exactly on that element's text baseline, so it measures
        // the line the eye reads along; a baseline-aligned <svg> rests its box's bottom edge there.
        nameBaseline: (() => {
          const p = document.createElement('span');
          p.style.cssText = 'display:inline-block;width:0;height:0;margin:0;padding:0;border:0';
          const n = document.getElementById('profile-name');
          n.append(p);
          const b = p.getBoundingClientRect().bottom;
          p.remove();
          return +b.toFixed(2);
        })(),
        flagBaseline: (() => {
          const p = document.createElement('span');
          p.style.cssText = 'display:inline-block;width:0;height:0;margin:0;padding:0;border:0';
          const f = document.getElementById('profile-flag');
          f.append(p);
          const b = p.getBoundingClientRect().bottom;
          p.remove();
          return +b.toFixed(2);
        })(),
        flagShown: !document.getElementById('profile-flag').hidden,
        flagTop: +document.getElementById('profile-flag').getBoundingClientRect().top.toFixed(2),
        flagBottom: +document.getElementById('profile-flag').getBoundingClientRect().bottom.toFixed(2),
        nameTop: +document.getElementById('profile-name').getBoundingClientRect().top.toFixed(2),
        nameBottom: +document.getElementById('profile-name').getBoundingClientRect().bottom.toFixed(2),
        // THE ONE TILE — read as it actually renders, never with its hidden attribute forced off.
        // The owner could not see it ("i cant see the color hex in profile"), and the two causes
        // were: an SVG hidden attribute that swatch.hidden = … never cleared (so the UA's
        // [hidden] display:none won forever), and a 13x15 box whose ink was 10.79x12.46.
        hex: (() => {
          const sw = document.getElementById('profile-colour');
          const face = sw.querySelector('.sp-swatch-face');
          const rb = sw.getBoundingClientRect();
          const rf = face.getBoundingClientRect();
          const cs = getComputedStyle(sw);
          const fs = getComputedStyle(face);
          const rowValue = document.getElementById('profile-wins').getBoundingClientRect();
          return {
            hiddenAttr: sw.hasAttribute('hidden'),
            display: cs.display,
            boxW: +rb.width.toFixed(2), boxH: +rb.height.toFixed(2),
            inkW: +rf.width.toFixed(2), inkH: +rf.height.toFixed(2),
            boxTop: +rb.top.toFixed(2), boxBottom: +rb.bottom.toFixed(2), inkBottom: +rf.bottom.toFixed(2),
            fill: fs.fill, stroke: fs.stroke, strokeWidth: parseFloat(fs.strokeWidth) || 0,
            tile: sw.style.getPropertyValue('--tile').trim(),
            aria: sw.getAttribute('aria-label'),
            right: +rb.right.toFixed(2), rowRight: +rowValue.right.toFixed(2),
          };
        })(),
        // A real 8-character name plus its 4-character tag: the widest legitimate identity line.
        // (At Large text on 320px it does clip; the task list records that separately.)
        nameStress: (() => {
          const n = document.getElementById('profile-name');
          const before = n.textContent;
          n.textContent = 'ABCDEFGH #7QK2';
          void n.offsetWidth;
          const out = {
            clientW: n.clientWidth, scrollW: n.scrollWidth, clipped: n.scrollWidth > n.clientWidth,
            ddW: +(n.parentElement.getBoundingClientRect().width).toFixed(1),
            rowW: +(n.closest('.sp-row').getBoundingClientRect().width).toFixed(1),
          };
          n.textContent = before;
          return out;
        })(),
        // The type scale, measured (not assumed): the root is what Large text scales (118%).
        rootFont: getComputedStyle(document.documentElement).fontSize,
        titleFont: getComputedStyle(document.getElementById('profile-title')).fontSize,
        labelFont: getComputedStyle(sheet.querySelector('.sp-row dt')).fontSize,
        nameFont: getComputedStyle(document.getElementById('profile-name')).fontSize,
        largeText: document.documentElement.classList.contains('large-text'),
        tileOverflow: Math.max(0, ...[...sheet.querySelectorAll('.sp-tile dd')].map((d) => d.scrollWidth - d.clientWidth)),
        rowRightSpread: (() => {
          const r = [...sheet.querySelectorAll('.sp-row dd')].map((d) => d.getBoundingClientRect().right);
          return +(Math.max(...r) - Math.min(...r)).toFixed(2);
        })(),
        // The row words are rotated, so they can overflow sideways in a way a vertical scroll check
        // would never see: measure that each stays inside the sheet and inside its own row band.
        sides: [...sheet.querySelectorAll('.sp-play-side')].map((s) => {
          const r = s.getBoundingClientRect();
          const sheetR = sheet.getBoundingClientRect();
          return {
            text: s.textContent.trim(),
            insideX: r.left >= sheetR.left - 0.5 && r.right <= sheetR.right + 0.5,
            insideY: r.top >= sheetR.top - 0.5 && r.bottom <= sheetR.bottom + 0.5,
            w: +r.width.toFixed(1),
            h: +r.height.toFixed(1),
          };
        }),
        hScroll: Math.max(0, sheet.scrollWidth - sheet.clientWidth),
        role: sheet.getAttribute('role'),
        modal: sheet.getAttribute('aria-modal'),
        // THE PLATE'S GROUND (owner, 2026-11-02): a soft bright band ran through the MATCHES WON
        // row because the plate was 0.42 alpha and the menu behind it showed through. It is 0.982
        // now; the browser suite asserts that computed alpha rather than trusting the source.
        sheetBg: getComputedStyle(sheet).backgroundColor,
        scroll: Math.max(0, sheet.scrollHeight - sheet.clientHeight),
        pageScroll: Math.max(0, document.documentElement.scrollHeight - innerHeight),
        bottom: +sheet.getBoundingClientRect().bottom.toFixed(1),
        vh: innerHeight,
      };
    })()`)) as {
      n: number; labels: string[]; values: string[]; offline: [string, string][]; online: [string, string][];
      sides: { text: string; insideX: boolean; insideY: boolean; w: number; h: number }[];
      hScroll: number; note: number; signIn: number; brand: number; role: string; modal: string | null;
      sheetBg: string;
      scroll: number; pageScroll: number; bottom: number; vh: number;
      brandMark: { w: number; h: number; right: number };
      corner: {
        radius: number; radiusY: number; markLeftAir: number; markTopAir: number; markAir: number;
        markCentre: number; titleCentreY: number;
        closeAir: number; closeRight: number; titleInsetLeft: number; titleInsetRight: number; rowTopInset: number;
      };
      bottomBlocks: { left: number; right: number; bottom: number }[];
      titleInkLeft: number; titleCentre: number; headH: number;
      close: { left: number; right: number; top: number; bottom: number; w: number; h: number };
      nameBaseline: number; flagBaseline: number; flagShown: boolean;
      flagTop: number; flagBottom: number; nameTop: number; nameBottom: number;
      hex: {
        hiddenAttr: boolean; display: string; boxW: number; boxH: number; inkW: number; inkH: number;
        boxTop: number;
        boxBottom: number; inkBottom: number; fill: string; stroke: string; strokeWidth: number;
        tile: string; aria: string | null; right: number; rowRight: number;
      };
      nameStress: { clientW: number; scrollW: number; clipped: boolean; ddW: number; rowW: number };
      rootFont: string; titleFont: string; labelFont: string; nameFont: string; largeText: boolean;
      tileOverflow: number; rowRightSpread: number;
    };
    check(`${label}: the identity block is four rows`, rows.n === 4, String(rows.n));
    check(`${label}: the rows are name & tag, Seeds, tiles, matches won`,
      JSON.stringify(rows.labels) === JSON.stringify([PROFILE.nameTag, SEEDS_WORD, PROFILE.tiles, PROFILE.matchesWon]), rows.labels.join(' | '));
    check(`${label}: the first row is the player's name`, rows.values[0] === name, rows.values[0] ?? '');
    // No API in this build: all three numbers are unknown, so all three are em dashes — never 0.
    check(`${label}: unknown Seeds are an em dash`, rows.values[1] === PROFILE.unknown, rows.values[1] ?? '');
    check(`${label}: unknown tiles are an em dash`, rows.values[2] === PROFILE.unknown, rows.values[2] ?? '');
    check(`${label}: an unknowable matches-won count is an em dash (never an invented 0)`, rows.values[3] === PROFILE.unknown, rows.values[3] ?? '');
    // Two records of the same three tiles: offline above, online below, each with its word on the edge.
    const labels3 = [PROFILE.games, PROFILE.winRate, PROFILE.longestStreak];
    check(`${label}: the offline row is games / win rate / longest streak`,
      JSON.stringify(rows.offline.map((t) => t[0])) === JSON.stringify(labels3), JSON.stringify(rows.offline));
    check(`${label}: the online row is the same three tiles`,
      JSON.stringify(rows.online.map((t) => t[0])) === JSON.stringify(labels3), JSON.stringify(rows.online));
    check(`${label}: each row is named down its edge`,
      JSON.stringify(rows.sides.map((s) => s.text)) === JSON.stringify([PROFILE.offline, PROFILE.online]), rows.sides.map((s) => s.text).join(' | '));
    check(`${label}: the row words stay inside the sheet`,
      rows.sides.every((s) => s.insideX && s.insideY), JSON.stringify(rows.sides.map((s) => [s.w, s.h])));
    check(`${label}: the profile never scrolls sideways`, rows.hScroll <= 1, String(rows.hScroll));
    check(`${label}: the old footer note is gone and nothing replaced it`, rows.note === 0);
    check(`${label}: the sign-in line is gone`, rows.signIn === 0);
    // THE WASH GUARD. Nothing faded over the row: at the shared 0.42-alpha glass a blurred menu key
    // behind the plate drew a soft bright band through MATCHES WON (5/255 in the rebuilt sheet,
    // 51/255 in the owner's screenshot). The plate now reads 0.982 opaque, so anything back under
    // 0.95 — the shared glass included — lets the background paint through a row again and fails.
    check(`${label}: the plate ground is dense enough to be even`, alphaOf(rows.sheetBg) >= 0.95, rows.sheetBg);
    check(`${label}: the Futasaku mark is in the nameplate`, rows.brand === 1);
    // THE MARK'S WIDTH IS THE GUARD AGAINST THE SMUDGE. The owner's live screenshot showed a
    // 29px-wide mark in a 464px-wide image (~6.1% of the screen): the CJK wordmark read as a grey
    // smear. The game's own 22px-high wordmark is 67.69px wide at the asset's 2200:715 ratio, which
    // is 17.4% of a 390pt screen (~2.8x the reported stamp). A future edit may not shrink it back:
    // the floor is 64px (16.4% of 390).
    const WORDMARK_RATIO = 2200 / 715;
    const WORDMARK_MIN_W = 64;
    check(`${label}: the nameplate wordmark is the game's 22px wordmark`,
      Math.abs(rows.brandMark.h - 22) <= 0.5 && Math.abs(rows.brandMark.w - rows.brandMark.h * WORDMARK_RATIO) <= 1,
      `${rows.brandMark.w}x${rows.brandMark.h}`);
    check(`${label}: the wordmark is at least 64px wide (16.4% of 390)`,
      rows.brandMark.w >= WORDMARK_MIN_W, `${rows.brandMark.w} ≥ ${WORDMARK_MIN_W}`);
    // THE CORNER GUARD — THE ONE THAT CATCHES THE OWNER'S SCREENSHOT. `markAir` is the distance
    // from the wordmark's own top-left corner to the plate's corner ARC, read from the sheet's own
    // getComputedStyle radius (32px today; asserted to be a real rounded corner, so a theme change
    // is measured rather than assumed). A mark merely "inside the sheet" still passes while it is
    // tucked under the curve; this does not. MEASURED on the evidence: the live build's mark sat at
    // ~25px in / ~11px down in a 464-wide shot with a ~33px radius — 9.9px of air — and the first
    // (left-aligned) attempt at 320x568 measured 12.5px. 16px is the floor; this build measures
    // 17.5-20.5px in portrait and far more in landscape.
    const c = rows.corner;
    check(`${label}: the wordmark clears the top-left corner arc by >=16px`,
      c.radius >= 20 && c.markAir >= 16 && c.markTopAir >= 16,
      `${c.markAir}px from the arc, ${c.markTopAir}px down, ${c.markLeftAir}px in (r=${c.radius}/${c.radiusY})`);
    // THE SAME RULE FOR THE OTHER END OF THE ROW ("this or any similar"): the close key's GLYPH
    // clears the top-right arc by >=12px. Its 44px target is wider than its ink, so the ink is what
    // is measured — a key pushed flush to the plate's edge would put its glyph ~7px from the arc.
    check(`${label}: the close key's glyph clears the top-right corner arc by >=12px`,
      c.closeAir >= 12, `${c.closeAir}px from the arc, ${c.closeRight}px in`);
    // Nothing else may land in a corner band either: the centred title sits a whole radius in from
    // both side edges (so it can never meet a top curve), and the first hairline row starts below
    // the corner band, with the sheet's own padding under it.
    check(`${label}: the title and the first hairline row stay out of the corner band`,
      c.titleInsetLeft >= c.radius && c.titleInsetRight >= c.radius && c.rowTopInset >= c.radiusY,
      `title ${c.titleInsetLeft}/${c.titleInsetRight}, row top ${c.rowTopInset}, r=${c.radius}/${c.radiusY}`);
    // ONE LINE: the 22px mark and the centred title share the nameplate's centre line. The mark is
    // a replaced box centred by `align-items: center`; the title is a text box centred in the same
    // row, so their centres must coincide (a mark nudged up or down reads as a second line).
    check(`${label}: the wordmark sits on the nameplate's centre line`,
      Math.abs(c.markCentre - c.titleCentreY) <= 1,
      `mark ${c.markCentre} vs title ${c.titleCentreY}`);
    // THE BOTTOM CORNERS (`844x390` is a centred dialog with ALL FOUR corners rounded). Each lowest
    // content block must clear both bottom arcs; cornerAir() is the distance from a block's corner
    // to the plate's corner arc. 10px is a visible margin, not a technicality: the live build's
    // 14px bottom padding measured 7.9px here, which is why it is now 22px.
    const cornerAir = (h: number, v: number, r: number) =>
      h >= r || v >= r ? Math.min(h, v) : r - Math.hypot(r - h, r - v);
    const bottomAir = rows.bottomBlocks.flatMap((b) => [
      cornerAir(b.left, b.bottom, c.radius), cornerAir(b.right, b.bottom, c.radius),
    ]);
    check(`${label}: the record clears the bottom corner arcs by >=10px`,
      bottomAir.length > 0 && Math.min(...bottomAir) >= 10,
      `${Math.min(...bottomAir).toFixed(1)}px over ${JSON.stringify(rows.bottomBlocks)}`);
    // It overhangs its own left cell; it must still clear the centred word's INK and the close key.
    check(`${label}: the wordmark clears the centred title`, rows.brandMark.right + 8 <= rows.titleInkLeft,
      `${rows.brandMark.right} + 8 ≤ ${rows.titleInkLeft}`);
    check(`${label}: the wordmark clears the close key`, rows.brandMark.right + 8 <= rows.close.left,
      `${rows.brandMark.right} + 8 ≤ ${rows.close.left}`);
    check(`${label}: the nameplate keeps its 44/46px row and its centred title`,
      rows.headH >= 43.5 && rows.headH <= 46.5 && Math.abs(rows.titleCentre) <= 0.5, `${rows.headH}/${rows.titleCentre}`);
    // THE MARKS ARE CENTRED ON THE NAME (owner, 2026-11-02: "the color hex is aligned by bottom edge -
    // make it centered vertically to name and flag instead"). So the assertion is the VERTICAL
    // CENTRE of the flag and of the tile box against the name's own box centre — a bottom-edge check
    // would now fail a correct layout, and a centre check fails the old bottom-aligned one.
    check(`${label}: the flag and the tile are centred on the name`,
      rows.flagShown &&
        Math.abs((rows.flagTop + rows.flagBottom) / 2 - (rows.nameTop + rows.nameBottom) / 2) <= 1.5 &&
        Math.abs((rows.hex.boxTop + rows.hex.boxBottom) / 2 - (rows.nameTop + rows.nameBottom) / 2) <= 1.5,
      `flag c ${((rows.flagTop + rows.flagBottom) / 2).toFixed(1)} / hex c ${((rows.hex.boxTop + rows.hex.boxBottom) / 2).toFixed(1)} / name c ${((rows.nameTop + rows.nameBottom) / 2).toFixed(1)}`);
    // THE ONE TILE, as it actually renders. Present (the `hidden` attribute is really gone), the
    // map's hex silhouette, sized to read as a hexagon, and painted in the player's own colour.
    check(`${label}: the colour tile is present and painted`, !rows.hex.hiddenAttr && rows.hex.display !== 'none' && rows.hex.boxW > 0,
      `hidden=${rows.hex.hiddenAttr} display=${rows.hex.display} ${rows.hex.boxW}x${rows.hex.boxH}`);
    check(`${label}: the colour tile is the map's hex at 20.5px (ink 17 x 19.65)`,
      Math.abs(rows.hex.boxW - 20.5) <= 0.1 && Math.abs(rows.hex.boxH - 20.5) <= 0.1 &&
      Math.abs(rows.hex.inkW - 17.02) <= 0.1 && Math.abs(rows.hex.inkH - 19.65) <= 0.1 &&
      Math.abs(rows.hex.inkH / rows.hex.inkW - 2 / Math.sqrt(3)) <= 0.01,
      `${rows.hex.boxW}x${rows.hex.boxH}, ink ${rows.hex.inkW}x${rows.hex.inkH}`);
    // A player who never chose still has the colour the game derived for them: the tile is that
    // colour (so it is never absent), and it names itself for a screen reader.
    const wantRgb = hslToRgb(derivedColour);
    const gotRgb = (rows.hex.fill.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
    check(`${label}: the tile is painted in the player's derived colour`,
      rows.hex.tile === derivedColour && gotRgb.length === 3 && gotRgb.every((v, i) => Math.abs(v - wantRgb[i]!) <= 1) &&
      rows.hex.aria === derivedName,
      `${rows.hex.fill} vs ${derivedColour} (${rows.hex.aria})`);
    // It closes the name line on the same right edge as every other row's value.
    check(`${label}: the tile closes the name row on the values' right edge`,
      Math.abs(rows.hex.right - rows.hex.rowRight) <= 0.5, `${rows.hex.right}/${rows.hex.rowRight}`);
    // THE WIDEST LEGAL IDENTITY. DISPLAY_NAME_MAX is 8, so "ABCDEFGH #7QK2" is the longest name a
    // real account can wear. It fits exactly at 360, 390 and 844 in BOTH type scales. At 320 it does
    // not: the row is 272px, the label takes 79.2 (93.6 with Large text), and the flag + the 20.5px
    // hex + two 8px gaps take 55.8 — the name is ellipsized by 15px at standard text and 55px at
    // Large text. Closing that budget is a task in the report; pinned here so it cannot get worse.
    const nameBudget = size.w <= 320 ? (size.large ? 56 : 16) : 0;
    check(`${label}: the widest legal name fits (320 allows a measured ellipsis)`,
      rows.nameStress.scrollW - rows.nameStress.clientW <= nameBudget,
      `${rows.nameStress.scrollW}/${rows.nameStress.clientW} in dd ${rows.nameStress.ddW} of row ${rows.nameStress.rowW}`);
    // The pass really is what its label says: Large text is html.large-text (118% root).
    check(`${label}: the type scale is ${size.large ? 'Large text' : 'standard'}`, rows.largeText === (size.large === true),
      `root ${rows.rootFont}, title ${rows.titleFont}, label ${rows.labelFont}, name ${rows.nameFont}`);
    check(`${label}: the record tiles never overflow`, rows.tileOverflow <= 1, String(rows.tileOverflow));
    check(`${label}: the identity values share one right edge`, rows.rowRightSpread <= 0.5, String(rows.rowRightSpread));
    check(`${label}: the profile reads as a dialog that traps nothing`, rows.role === 'dialog' && rows.modal === null, `${rows.role}/${rows.modal}`);
    check(`${label}: the profile does not scroll`, rows.scroll <= 1 && rows.pageScroll <= 1, `${rows.scroll}/${rows.pageScroll}`);
    check(`${label}: the profile is fully inside the screen`, rows.bottom <= rows.vh + 0.5, `${rows.bottom} ≤ ${rows.vh}`);
    if (label === '360x640') await shot(page, 'profile-signed-in-360x640');
    if (label === '844x390') await shot(page, 'profile-landscape-844x390');
    if (label === '390x844') await shotHead(page, 'profile-header-390x844');
    if (label === '390x844') await shotNameRow(page, 'profile-name-row-390x844');
    if (label === '320x568') await shotNameRow(page, 'profile-name-row-320x568');
    if (label === '464x1004') {
      await shot(page, 'profile-signed-in-464x1004');
      await shotHead(page, 'profile-header-464x1004');
      await shotNameRow(page, 'profile-name-row-464x1004');
    }
    // The DPR 3 pass exists to state the tile's size in device pixels: an ink 17.02 x 19.65 CSS px
    // is 51.1 x 59.0 device px, which is what a real phone actually paints.
    if (size.dpr) {
      const dpr = (await page.evaluate('devicePixelRatio')) as number;
      check(`${label}: the tile is 51 x 59 device px at DPR ${size.dpr}`,
        Math.abs(rows.hex.inkW * dpr - 51.06) <= 0.5 && Math.abs(rows.hex.inkH * dpr - 58.95) <= 0.5,
        `${(rows.hex.inkW * dpr).toFixed(2)} x ${(rows.hex.inkH * dpr).toFixed(2)}`);
    }

    // Escape closes it and hands focus back to the key that opened it.
    await page.keyboard.press('Escape');
    const closed = await waitFor(async () => !(await page.locator('#sheet-profile').isVisible()));
    const focus = (await page.evaluate('document.activeElement && document.activeElement.id')) as string;
    check(`${label}: Escape closes the profile`, closed);
    check(`${label}: closing returns focus to the account key`, focus === 'menu-login', focus);

    // It is reachable by keyboard, with no pointer at all.
    await page.locator('#menu-login').focus();
    await page.keyboard.press('Enter');
    check(`${label}: keyboard Enter opens the profile`, await waitFor(() => page.locator('#sheet-profile').isVisible()));
    await page.keyboard.press('Escape');
    await waitFor(async () => !(await page.locator('#sheet-profile').isVisible()));

    // The scrim is a way out too (a tap outside closes; nothing is trapped).
    if (size.w > 400) {
      await page.click('#menu-login');
      await waitFor(() => page.locator('#sheet-profile').isVisible());
      await page.locator('#profile-scrim').click({ position: { x: 5, y: 5 } });
      check(`${label}: a scrim tap closes the profile`, await waitFor(async () => !(await page.locator('#sheet-profile').isVisible())));
    }
    await shot(page, `menu-signed-in-${tag(label)}`);
    await context.close();
  }

  // ---- 2b. the rest of the sheet, measured once, at the tightest screen ----
  // These are the numbers the design audit's answers rest on: the close key's tap target, the muted
  // label's contrast, the record rows' equal weight, the rotated row words, the em dash's shape,
  // and a five-digit record that must not break the grid.
  {
    const { context, page } = await device({ w: 320, h: 568, signedIn: true });
    await page.click('#menu-login');
    await waitFor(() => page.locator('#sheet-profile').isVisible());
    await page.waitForTimeout(400);
    const a = (await page.evaluate(`(() => {      const sheet = document.getElementById('sheet-profile');
      const box = (el) => { const r = el.getBoundingClientRect(); return { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1), right: +r.right.toFixed(1), bottom: +r.bottom.toFixed(1) }; };
      const cs = (el) => getComputedStyle(el);
      const close = sheet.querySelector('[data-profile-close]');
      const dt = sheet.querySelector('.sp-row dt');
      const side = sheet.querySelector('.sp-play-side');
      const rowEls = [...sheet.querySelectorAll('.sp-play-row')];
      const grids = rowEls.map((r) => r.querySelector('.sp-play-grid'));
      const tilesOf = (g) => [...g.querySelectorAll('.sp-tile')].map((t) => ({ b: box(t), dd: box(t.querySelector('dd')) }));
      const off = tilesOf(grids[0]), on = tilesOf(grids[1]);
      // A lifetime record printed with separators: the widest number the three tiles must hold.
      const dds = [...grids[0].querySelectorAll('.sp-tile dd')];
      const before = dds.map((d) => d.textContent);
      const hBefore = [...grids[0].querySelectorAll('.sp-tile')].map((t) => +t.getBoundingClientRect().height.toFixed(1));
      dds.forEach((d) => { d.textContent = '12,345'; });
      const five = dds.map((d) => ({ clientW: d.clientWidth, scrollW: d.scrollWidth }));
      const fiveRights = dds.map((d) => +d.getBoundingClientRect().right.toFixed(1));
      const hAfter = [...grids[0].querySelectorAll('.sp-tile')].map((t) => +t.getBoundingClientRect().height.toFixed(1));
      dds.forEach((d, i) => { d.textContent = before[i]; });
      const seeds = document.getElementById('profile-seeds');
      const was = seeds.textContent;
      // Muted label contrast from the COMPUTED colours. The sheet's own surface is 42% opaque, so
      // the ground is the surface composited over the page — not the raw rgb() in the token.
      const num = (c) => (c.match(/[\\d.]+/g) || []).map(Number);
      const lum = (p) => { const q = p.slice(0, 3).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * q[0] + 0.7152 * q[1] + 0.0722 * q[2]; };
      const sheetBg = num(cs(sheet).backgroundColor);
      const pageBg = num(cs(document.documentElement).backgroundColor);
      const alpha = sheetBg.length > 3 ? sheetBg[3] : 1;
      const ground = [0, 1, 2].map((i) => Math.round(sheetBg[i] * alpha + pageBg[i] * (1 - alpha)));
      const la = lum(num(cs(dt).color)), lb = lum(ground);
      const contrast = +((Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)).toFixed(2);
      // INK, not advance: the em dash and a zero have the same 9.7px advance in this face, so the
      // difference that matters is the painted SHAPE. A canvas read of the actual glyph settles it.
      const ink = (ch) => {
        const c = document.createElement('canvas');
        c.width = 48; c.height = 32;
        const g = c.getContext('2d');
        g.font = cs(seeds).font || ('500 ' + cs(seeds).fontSize + ' ' + cs(seeds).fontFamily);
        g.fillStyle = '#fff'; g.textBaseline = 'alphabetic';
        g.fillText(ch, 4, 24);
        const d = g.getImageData(0, 0, 48, 32).data;
        let minX = 99, maxX = -1, minY = 99, maxY = -1, pixels = 0;
        for (let y = 0; y < 32; y++) for (let x = 0; x < 48; x++) {
          if (d[(y * 48 + x) * 4 + 3] > 40) { pixels++; minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
        }
        return { w: maxX - minX + 1, h: maxY - minY + 1, pixels };
      };
      return {
        close: box(close), vw: innerWidth, vh: innerHeight,
        label: { color: cs(dt).color, bg: cs(sheet).backgroundColor, ground: 'rgb(' + ground.join(', ') + ')', size: cs(dt).fontSize, contrast },
        side: { text: side.textContent.trim(), w: box(side).w, h: box(side).h, size: cs(side).fontSize, writing: cs(side).writingMode, transform: cs(side).transform },
        records: { offH: box(rowEls[0]).h, onH: box(rowEls[1]).h,
          offGridH: box(grids[0]).h, onGridH: box(grids[1]).h,
          offTileW: off.map((t) => t.b.w), onTileW: on.map((t) => t.b.w),
          tileH: off.map((t) => t.b.h), gap: cs(grids[0]).gap, valueFont: cs(grids[0].querySelector('dd')).fontSize },
        five: { rows: five, rights: fiveRights, overflow: five.map((f) => f.scrollW - f.clientW), hBefore, hAfter },
        dash: { code: (was || '').codePointAt(0), inkDash: ink('—'), inkZero: ink('0') },
        decorative: [...sheet.querySelectorAll('[aria-hidden="true"]')].map((e) => e.id || e.getAttribute('class') || e.tagName),
        swatchAria: {
          hidden: document.getElementById('profile-colour').getAttribute('aria-hidden'),
          role: document.getElementById('profile-colour').getAttribute('role'),
          label: document.getElementById('profile-colour').getAttribute('aria-label'),
        },
        buttons: sheet.querySelectorAll('button:not([disabled])').length,
        focusOnClose: document.activeElement?.hasAttribute('data-profile-close') === true,
      };
    })()`)) as {
      close: { x: number; y: number; w: number; h: number; right: number; bottom: number }; vw: number; vh: number;
      label: { color: string; bg: string; ground: string; size: string; contrast: number };
      side: { text: string; w: number; h: number; size: string; writing: string; transform: string };
      records: { offH: number; onH: number; offGridH: number; onGridH: number; offTileW: number[]; onTileW: number[]; tileH: number[]; gap: string; valueFont: string };
      five: { rows: { clientW: number; scrollW: number }[]; rights: number[]; overflow: number[]; hBefore: number[]; hAfter: number[] };
      dash: { code: number; inkDash: { w: number; h: number; pixels: number }; inkZero: { w: number; h: number; pixels: number } };
      decorative: string[]; buttons: number; focusOnClose: boolean;
      swatchAria: { hidden: string | null; role: string | null; label: string | null };
    };
    // Q11: the one control is a >=44px target, wholly inside the viewport (safe insets are 0 here).
    check('audit 320x568: the close key is >=44x44 and inside the screen',
      a.close.w >= 44 && a.close.h >= 44 && a.close.x >= 0 && a.close.y >= 0 && a.close.right <= a.vw && a.close.bottom <= a.vh,
      `${a.close.w}x${a.close.h} at ${a.close.x},${a.close.y}`);
    // Q13: the 9.92px tracked-caps label on the ground the sheet actually paints.
    check('audit 320x568: the muted label clears 4.5:1', a.label.contrast >= 4.5,
      `${a.label.color} on ${a.label.ground} = ${a.label.contrast}:1 at ${a.label.size}`);
    // Q6/Q18: the two records are the same instrument (the 9px between the row BOXES is the
    // separator hairline + its 8px gap, which row 2 carries inside itself), and a five-digit
    // number neither wraps nor grows the tiles.
    check('audit 320x568: the two record rows are equal weight',
      Math.abs(a.records.offGridH - a.records.onGridH) <= 0.5 &&
      JSON.stringify(a.records.offTileW) === JSON.stringify(a.records.onTileW) &&
      a.records.tileH.every((h) => Math.abs(h - a.records.tileH[0]!) <= 0.5),
      `grids ${a.records.offGridH}/${a.records.onGridH} (rows ${a.records.offH}/${a.records.onH}), tile w ${a.records.offTileW.join('/')}, gap ${a.records.gap}, value ${a.records.valueFont}`);
    check('audit 320x568: a five-digit record stays inside its tiles',
      a.five.overflow.every((n) => n <= 1) &&
      JSON.stringify(a.five.hBefore) === JSON.stringify(a.five.hAfter),
      `overflow ${a.five.overflow.join('/')}, tile heights ${a.five.hBefore.join('/')} → ${a.five.hAfter.join('/')}`);
    // Q8: the row word is set down the edge, bottom-to-top (vertical-rl + 180deg).
    check('audit 320x568: the row word runs bottom-to-top',
      a.side.writing === 'vertical-rl' && a.side.transform === 'matrix(-1, 0, 0, -1, 0, 0)' && a.side.text === PROFILE.offline,
      `${a.side.writing} / ${a.side.transform} / ${a.side.w}x${a.side.h} at ${a.side.size}`);
    // Q9: an em dash is U+2014, painted as a bar 1-2px tall; a zero has the same 9.7px advance but
    // 11px of ink. The canvas read is the proof that the two can never be confused on screen.
    check('audit 320x568: the unknown value is a real em dash, not a 0',
      a.dash.code === 0x2014 && a.dash.inkDash.h <= 4 && a.dash.inkZero.h >= 9 && a.dash.inkDash.h < a.dash.inkZero.h / 2,
      `U+${a.dash.code.toString(16)} ink ${a.dash.inkDash.w}x${a.dash.inkDash.h} vs 0 at ${a.dash.inkZero.w}x${a.dash.inkZero.h}`);
    // Q15: one control, focused on open, nothing trapped (the sheet is not aria-modal).
    check('audit 320x568: the only control is Close, and it takes focus on open',
      a.buttons === 1 && a.focusOnClose, `${a.buttons} button(s), focused=${a.focusOnClose}`);
    // Q19: what is purely decorative is declared to assistive tech as such — and the ONE colour,
    // which is information, is named instead of hidden (the markup's aria-hidden must be cleared
    // when the swatch becomes an img).
    check('audit 320x568: decoration is declared, and the one colour is named aloud',
      a.decorative.includes('profile-brand') && a.decorative.filter((d) => d.includes('profile-play-')).length === 2 &&
      a.swatchAria.hidden === null && a.swatchAria.role === 'img' && a.swatchAria.label === derivedName,
      `${a.decorative.join(' | ')}; swatch aria-hidden=${a.swatchAria.hidden} ${a.swatchAria.role}/${a.swatchAria.label}`);
    await context.close();
  }

  // ---- 3. no page errors on the way through ----
  {
    const { context, page } = await device({ w: 390, h: 844, signedIn: true });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.click('#menu-login');
    await waitFor(() => page.locator('#sheet-profile').isVisible());
    await page.keyboard.press('Escape');
    assert.deepEqual(errors, [], `no page errors: ${errors.join(' | ')}`);
    check('390x844: no page errors while opening and closing the profile', errors.length === 0);
    await context.close();
  }
} finally {
  await browser.close().catch(() => undefined);
  server.close();
}
console.log(`\n${failed === 0 ? 'ALL PASS' : `${failed} FAILED`}`);
process.exit(failed === 0 ? 0 : 1);
