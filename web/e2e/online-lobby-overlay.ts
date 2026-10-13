// Phase 9 regression — the online lobby must be a real full-screen VIEW, never a see-through
// layer stacked on the main menu.
//
// Bug (live /futa0.5/): the "Waiting for a friend" screen rendered transparently on top of the
// main menu (the huge FUTASAKU title, tagline and the menu buttons painted straight through the
// invite panel) and the main menu was never hidden. This test fails on that build:
//   1. the menu must be hidden while an online screen is open,
//   2. the online screen must be opaque, cover the viewport, and sit above the menu in z-order,
//   3. the screen title, invite code, Share / Copy link / Cancel and the expiry text must not
//      overlap each other (bounding-box intersection = 0),
//   4. the invite code must be the element on top at its own centre (nothing painted over it),
//   5. the key controls must stay >= 44px (iOS) at 360x640 and 390x844,
//   6. the screen must scroll internally so its bottom controls stay reachable.
//
// Runs against the live site by default. Two other modes:
//   BASE_URL=http://localhost:4207 npx tsx web/e2e/online-lobby-overlay.ts       # any build
//   STUB=1 BASE_URL=http://localhost:4207 PHASE=before npx tsx web/e2e/online-lobby-overlay.ts
// STUB=1 answers the duel API locally (build with VITE_DUEL_API_URL=https://duel-stub.invalid/v1)
// so the layout can be checked with no network at all.
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
import type { Browser, Page } from 'playwright-core';

const BASE_URL = (process.env.BASE_URL ?? 'https://severgrow.github.io/severgrow-01/futa0.5/').replace(/\/?$/, '/');
const OUT = new URL('../../docs/screens/online/', import.meta.url).pathname;
const PHASE = process.env.PHASE ?? 'after';
const STUB = process.env.STUB === '1';
const STUB_HOST = 'duel-stub.invalid';
const CHROME =
  process.env.PW_CHROMIUM ??
  '/Users/patryk/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';

mkdirSync(OUT, { recursive: true });
let failed = 0;
const check = (name: string, ok: boolean, note = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? `  (${note})` : ''}`);
};

type Box = { x: number; y: number; width: number; height: number };
const overlapArea = (a: Box, b: Box): number => {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return w > 0.5 && h > 0.5 ? w * h : 0;
};
const box = async (page: Page, selector: string): Promise<Box | null> =>
  page.locator(selector).boundingBox().catch(() => null);
const shoot = async (page: Page, name: string, tag: string) => {
  await page.screenshot({ path: `${OUT}${name}-${PHASE}-${tag}.png` });
};

/** Minimal, deterministic duel API so the layout can be exercised without the network. */
const installStubApi = async (page: Page): Promise<void> => {
  const now = Date.now();
  const matchId = 'stub-match-0001';
  const inviteCode = 'XFVND7Y4P';
  const summary = {
    matchId,
    inviteCode,
    status: 'waiting',
    revision: 1,
    turnStartRevision: 1,
    turnDeadlineAt: null,
    expiresAt: now + 48 * 3600_000,
    seats: [{ seat: 0, playerId: 'p1', displayName: null }],
    result: null,
    serverNow: now,
  };
  const view = {
    matchId,
    rulesVersion: 'test',
    status: 'waiting',
    revision: 1,
    turnStartRevision: 1,
    seat: 0,
    startingPlayer: 0,
    turnPlayer: 0,
    actor: 0,
    view: {},
    legalActions: [],
    events: [],
    turnDeadlineAt: null,
    opponent: null,
    result: null,
    serverNow: now,
  };
  await page.route(`**/${STUB_HOST}/**`, (route) => {
    const path = new URL(route.request().url()).pathname;
    const body = path.endsWith('/guests')
      ? { ok: true, player: { id: 'p1', kind: 'guest', displayName: null }, token: 'stub-token', serverNow: now }
      : path.endsWith('/players/me/matches')
        ? { ok: true, matches: [], serverNow: now }
        : path.endsWith('/matches')
          ? { ok: true, match: summary, player: view, serverNow: now }
          : { ok: true, player: view, match: summary, serverNow: now };
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
};

const viewports: { tag: string; width: number; height: number; touch: boolean }[] = [
  { tag: '1280x800', width: 1280, height: 800, touch: false },
  { tag: '768x1024', width: 768, height: 1024, touch: true },
  { tag: '390x844', width: 390, height: 844, touch: true },
  { tag: '360x640', width: 360, height: 640, touch: true },
];

const openWaiting = async (page: Page): Promise<boolean> => {
  await page.waitForSelector('#menu-online:not([hidden])', { timeout: 25_000 });
  await page.click('#menu-online');
  await page.waitForSelector('#online-hub:not([hidden])', { timeout: 20_000 });
  if (await page.locator('#online-first-ok').isVisible().catch(() => false)) await page.click('#online-first-ok');
  await page.click('#online-create');
  await page.waitForSelector('#online-waiting:not([hidden])', { timeout: 25_000 });
  await page
    .waitForFunction(
      () => /^[0-9A-HJKMNP-TV-Z]{8}$/.test((document.getElementById('online-invite-code')?.textContent ?? '').trim()),
      { timeout: 15_000 },
    )
    .catch(() => undefined);
  return page.locator('#online-waiting:not([hidden])').isVisible().catch(() => false);
};

const browser: Browser = await chromium.launch({ executablePath: CHROME });
try {
  console.log(`Lobby overlay regression against ${BASE_URL} (phase=${PHASE}${STUB ? ', stubbed API' : ''})`);
  for (const vp of viewports) {
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      hasTouch: vp.touch,
      isMobile: vp.touch,
      deviceScaleFactor: 1,
    });
    const page = await ctx.newPage();
    await page.addInitScript(() => localStorage.clear());
    if (STUB) await installStubApi(page);
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    const opened = await openWaiting(page).catch(() => false);
    check(`[${vp.tag}] waiting screen opens`, opened);
    if (!opened) {
      await shoot(page, 'lobby-overlay-waiting', vp.tag);
      await ctx.close();
      continue;
    }
    await page.waitForTimeout(600); // let the first-card / toast states settle
    await shoot(page, 'lobby-overlay-waiting', vp.tag);

    // 1 + 2. The online screen is a view, not a layer: menu hidden, screen opaque, above the menu.
    const shell = await page.evaluate(() => {
      const menu = document.getElementById('menu') as HTMLElement | null;
      const el = document.getElementById('online-waiting') as HTMLElement | null;
      if (!el) return null;
      const cs = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      const menuCs = menu ? getComputedStyle(menu) : null;
      const menuRect = menu?.getBoundingClientRect();
      const menuTitle = menu?.querySelector('.title') as HTMLElement | null;
      const t = menuTitle?.getBoundingClientRect();
      // When a menu element is painted over the online screen, elementFromPoint returns it.
      const points: [number, number][] = t && t.width > 0
        ? [
            [t.x + t.width / 2, t.y + t.height / 2],
            [t.x + 2, t.y + 2],
          ]
        : [];
      const leaks = points.filter(([x, y]) => {
        const top = document.elementFromPoint(Math.max(1, x), Math.max(1, y));
        return !!top && !!menu && top !== el && menu.contains(top);
      }).length;
      return {
        menuHidden: !!menu && (menu.hasAttribute('hidden') || menuCs?.display === 'none'),
        menuZ: menuCs ? Number(menuCs.zIndex) || 0 : 0,
        menuVisible: !!menuRect && menuRect.width > 0 && menuRect.height > 0 && menuCs?.display !== 'none',
        leaks,
        bg: cs.backgroundColor,
        opacity: Number(cs.opacity),
        z: Number(cs.zIndex) || 0,
        overflowY: cs.overflowY,
        w: rect.width,
        h: rect.height,
      };
    });
    check(`[${vp.tag}] menu hidden while online screen is open`, !!shell?.menuHidden, shell ? `hidden=${shell.menuHidden}` : 'missing');
    check(`[${vp.tag}] no menu pixels painted over the online screen`, shell?.leaks === 0, `${shell?.leaks ?? '?'} leak point(s)`);
    const opaque = !!shell && /^rgba?\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*(?:,\s*1\s*)?\)$/.test(shell.bg) && shell.opacity === 1;
    check(`[${vp.tag}] online screen background is opaque`, opaque, shell ? `${shell.bg} opacity=${shell.opacity}` : 'missing');
    check(
      `[${vp.tag}] online screen covers the viewport`,
      !!shell && shell.w >= vp.width - 1 && shell.h >= vp.height - 1,
      shell ? `${Math.round(shell.w)}x${Math.round(shell.h)}` : 'missing',
    );
    check(`[${vp.tag}] online screen sits above the menu (z-order)`, !!shell && shell.z > shell.menuZ, shell ? `online z=${shell.z} menu z=${shell.menuZ}` : 'missing');

    // 3. Key controls must not overlap each other or the screen title.
    const labelled = [
      ['title', '#online-waiting-title'],
      ['invite code', '#online-invite-code'],
      ['Share', '#online-share'],
      ['Copy link', '#online-copy'],
      ['Cancel', '#online-cancel-match'],
      ['expiry', '#online-waiting-expiry'],
    ] as const;
    const boxes: Record<string, Box | null> = {};
    for (const [label, sel] of labelled) boxes[label] = await box(page, sel);
    const pairs: [string, string][] = [];
    for (let i = 0; i < labelled.length; i++) {
      for (let j = i + 1; j < labelled.length; j++) pairs.push([labelled[i]![0], labelled[j]![0]]);
    }
    for (const [aLabel, bLabel] of pairs) {
      const a = boxes[aLabel] ?? null;
      const b = boxes[bLabel] ?? null;
      const area = a && b ? overlapArea(a, b) : 0;
      check(`[${vp.tag}] ${aLabel} / ${bLabel} do not overlap`, area === 0, area ? `overlap ${Math.round(area)}px²` : '');
    }

    // 4. Nothing may be painted over the invite code.
    const codeTop = await page.evaluate(() => {
      const code = document.getElementById('online-invite-code') as HTMLElement | null;
      if (!code) return '';
      const r = code.getBoundingClientRect();
      const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) as HTMLElement | null;
      return top ? `${top.id || top.className || top.tagName}` : '';
    });
    check(`[${vp.tag}] invite code is on top at its centre`, /online-invite-code/.test(codeTop), codeTop);

    // 5. Tap targets and clipped text.
    for (const [label, sel] of [
      ['Back', '#online-waiting-back'],
      ['Share', '#online-share'],
      ['Copy link', '#online-copy'],
      ['Cancel', '#online-cancel-match'],
    ] as const) {
      const b = await box(page, sel);
      check(`[${vp.tag}] ${label} tap target >= 44px`, !!b && b.height >= 44 && b.width >= 44, b ? `${Math.round(b.width)}x${Math.round(b.height)}` : 'missing');
    }
    const clippedText = await page
      .locator('#online-waiting-title, #online-invite-code, #online-waiting-expiry, #online-waiting-body')
      .evaluateAll((els) =>
        els
          .filter((el) => el instanceof HTMLElement && el.offsetParent !== null && el.scrollWidth > el.clientWidth + 1)
          .map((el) => (el.textContent ?? '').trim().slice(0, 30)),
      )
      .catch(() => [] as string[]);
    check(`[${vp.tag}] no clipped text on the waiting screen`, clippedText.length === 0, clippedText.join(' | '));

    // 6. The bottom of the screen must be reachable (own scroll container when content is tall).
    const scrollable = await page.evaluate(() => {
      const el = document.getElementById('online-waiting') as HTMLElement | null;
      const last = document.getElementById('online-waiting-notice') as HTMLElement | null;
      if (!el) return null;
      const cs = getComputedStyle(el);
      return { overflowY: cs.overflowY, lastBottom: last ? last.getBoundingClientRect().bottom : 0, viewport: window.innerHeight, scrollHeight: el.scrollHeight, clientHeight: el.clientHeight };
    });
    if (scrollable) {
      const scrolls = scrollable.overflowY === 'auto' || scrollable.overflowY === 'scroll';
      const reachable = scrollable.lastBottom <= scrollable.viewport + 1 || scrolls;
      check(`[${vp.tag}] bottom controls reachable`, reachable, `lastBottom=${Math.round(scrollable.lastBottom)} viewport=${scrollable.viewport} overflow=${scrollable.overflowY}`);
      check(`[${vp.tag}] online screen is its own scroll container`, scrolls, `overflowY=${scrollable.overflowY}`);
    }

    await ctx.close();
  }
} finally {
  await browser.close();
}

if (failed) {
  console.error(`\n${failed} lobby overlay checks failed`);
  process.exit(1);
}
console.log('\nLobby overlay checks passed.');
