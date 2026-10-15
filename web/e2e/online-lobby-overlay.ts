// Phase 9 regression — "Play online" must open a real SUBMENU screen, never a see-through layer
// stacked on the main menu.
//
// Bug (live /futa0.5/): the online screens rendered transparently on top of the main menu (the huge
// FUTASAKU wordmark, the tagline and the menu buttons painted straight through the invite panel) and
// the main menu was never hidden. Two independent browser contexts drive the creator and the joiner.
//
// For each of the three online submenu screens (#online-hub, #online-waiting, #online-join) and at
// four viewports this spec asserts:
//   1. the main menu is hidden and no menu element is the hit target over the screen,
//   2. the screen is opaque, covers the viewport and sits above the menu in z-order,
//   3. exactly one online screen is a visible view at a time (a distinct view, not a layer),
//   4. the header carries the small in-game wordmark (#online-brand, the #hud-brand asset) at the
//      top-right — not a big wordmark — at the same small size the game HUD uses,
//   5. the screen title, back button, brand and the screen's controls never overlap each other,
//   6. the online column matches #menu .menu-inner (same width, padding, rhythm and heading scale),
//   7. every back button is >= 44px and returns where it should (join/waiting → hub, hub → menu).
//
// Runs against the live site by default. Two other modes:
//   BASE_URL=http://localhost:4207 npx tsx web/e2e/online-lobby-overlay.ts       # any build
//   STUB=1 BASE_URL=http://localhost:4207 PHASE=before npx tsx web/e2e/online-lobby-overlay.ts
// STUB=1 answers the duel API locally (build with VITE_DUEL_API_URL=https://duel-stub.invalid/v1)
// so the layout can be checked with no network at all.
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
import type { Browser, BrowserContext, Page } from 'playwright-core';
import { DEFAULT_SERVER_CONFIG } from '../../server/src/config.js';
import { requireLocalOrRealProjectOptIn } from '../../server/scripts/real-project-guard.js';

const BASE_URL = (process.env.BASE_URL ?? 'https://severgrow.github.io/severgrow-01/futa0.5/').replace(/\/?$/, '/');
// The deployed site bakes the REAL Edge API into its bundle (STUB only intercepts the stub host, so
// it does not protect a remote BASE_URL). A non-loopback target spends real quota: refuse (exit 3)
// unless FUTASAKU_REAL_PROJECT=1. `BASE_URL=http://localhost:4207` stays free.
requireLocalOrRealProjectOptIn('online-lobby-overlay', BASE_URL);
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
  page.locator(selector).first().boundingBox().catch(() => null);
const shoot = async (page: Page, screen: string, tag: string) => {
  await page.screenshot({ path: `${OUT}lobby-overlay-${screen}-${PHASE}-${tag}.png` });
};

/** Minimal, deterministic duel API so the layout can be exercised without the network. */
const installStubApi = async (page: Page): Promise<void> => {
  const now = Date.now();
  const matchId = 'stub-match-0001';
  const inviteCode = 'XFVND7Y4';
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

const newPage = async (browser: Browser, vp: (typeof viewports)[number]): Promise<{ ctx: BrowserContext; page: Page }> => {
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
  return { ctx, page };
};

const openHub = async (page: Page): Promise<boolean> => {
  await page.waitForSelector('#menu-online:not([hidden])', { timeout: 25_000 });
  await page.click('#menu-online');
  await page.waitForSelector('#online-hub:not([hidden])', { timeout: 20_000 });
  if (await page.locator('#online-first-ok').isVisible().catch(() => false)) await page.click('#online-first-ok');
  return page.locator('#online-hub:not([hidden])').isVisible().catch(() => false);
};

const openWaiting = async (page: Page): Promise<boolean> => {
  await page.click('#online-create');
  await page.waitForSelector('#online-waiting:not([hidden])', { timeout: 25_000 });
  await page
    .waitForFunction(
      () => new RegExp(`^[0-9A-HJKMNP-TV-Z]{${DEFAULT_SERVER_CONFIG.inviteCodeLength}}$`).test((document.getElementById('online-invite-code')?.textContent ?? '').trim()),
      { timeout: 15_000 },
    )
    .catch(() => undefined);
  return page.locator('#online-waiting:not([hidden])').isVisible().catch(() => false);
};

const openJoin = async (page: Page): Promise<boolean> => {
  await page.click('#online-join-open');
  await page.waitForSelector('#online-join:not([hidden])', { timeout: 15_000 });
  return page.locator('#online-join:not([hidden])').isVisible().catch(() => false);
};

const SCREENS = ['online-hub', 'online-waiting', 'online-join'] as const;

/** The shared per-screen assertions: a distinct, opaque, menu-free view with the HUD brand mark. */
const assertScreen = async (page: Page, screen: (typeof SCREENS)[number], vp: (typeof viewports)[number]) => {
  const tag = vp.tag;
  const shell = await page.evaluate((id) => {
    const menu = document.getElementById('menu') as HTMLElement | null;
    const el = document.getElementById(id) as HTMLElement | null;
    if (!el) return null;
    const cs = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    const menuCs = menu ? getComputedStyle(menu) : null;
    const visibleScreens = ['online-hub', 'online-waiting', 'online-join'].filter((s) => {
      const e = document.getElementById(s) as HTMLElement | null;
      return !!e && !e.hidden && getComputedStyle(e).display !== 'none';
    });
    // Sample a grid of points over the screen: if any resolves to a #menu node, the menu is painted
    // over the online view (the original bug).
    let leaks = 0;
    for (let i = 1; i < 6; i++) {
      for (let j = 1; j < 6; j++) {
        const x = rect.left + (rect.width * i) / 6;
        const y = rect.top + (rect.height * j) / 6;
        const top = document.elementFromPoint(x, y) as HTMLElement | null;
        if (top && menu && menu.contains(top) && top !== el) leaks++;
      }
    }
    return {
      menuHidden: !!menu && (menu.hasAttribute('hidden') || menuCs?.display === 'none'),
      menuZ: menuCs ? Number(menuCs.zIndex) || 0 : 0,
      leaks,
      visibleScreens,
      bg: cs.backgroundColor,
      opacity: Number(cs.opacity),
      z: Number(cs.zIndex) || 0,
      w: rect.width,
      h: rect.height,
    };
  }, screen);

  check(`[${tag}] ${screen} is open`, !!shell);
  if (!shell) return;
  check(`[${tag}] ${screen}: main menu hidden`, shell.menuHidden, `hidden=${shell.menuHidden}`);
  check(`[${tag}] ${screen}: no menu pixels painted over the view`, shell.leaks === 0, `${shell.leaks} leak point(s)`);
  check(`[${tag}] ${screen}: exactly one online screen visible`, shell.visibleScreens.length === 1 && shell.visibleScreens[0] === screen, shell.visibleScreens.join(','));
  const opaque = /^rgba?\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*(?:,\s*1\s*)?\)$/.test(shell.bg) && shell.opacity === 1;
  check(`[${tag}] ${screen}: background is opaque`, opaque, `${shell.bg} opacity=${shell.opacity}`);
  check(`[${tag}] ${screen}: covers the viewport`, shell.w >= vp.width - 1 && shell.h >= vp.height - 1, `${Math.round(shell.w)}x${Math.round(shell.h)}`);
  check(`[${tag}] ${screen}: sits above the menu (z-order)`, shell.z > shell.menuZ, `screen z=${shell.z} menu z=${shell.menuZ}`);

  // The header shows the small in-game wordmark (#hud-brand asset), top-right.
  const brand = await page.evaluate(
    (id) => {
      const el = document.getElementById('online-brand') as unknown as SVGSVGElement | null;
      const screen = document.getElementById(id) as HTMLElement | null;
      if (!el || !screen) return null;
      const r = el.getBoundingClientRect();
      const head = el.closest('.online-head') as HTMLElement | null;
      const hr = head?.getBoundingClientRect();
      return {
        visible: r.width > 0 && r.height > 0,
        w: r.width,
        h: r.height,
        cx: r.x + r.width / 2,
        inHead: !!head && !!screen.contains(head),
        headRight: hr ? hr.right : 0,
        headTop: hr ? hr.top : 0,
        top: r.top,
        src: el.querySelector('image')?.getAttribute('href') ?? '',
      };
    },
    screen,
  );
  check(`[${tag}] ${screen}: in-game brand mark present`, !!brand?.visible, brand ? `${Math.round(brand.w)}x${Math.round(brand.h)}` : 'missing');
  check(`[${tag}] ${screen}: brand is the small HUD-sized wordmark`, !!brand && brand.h >= 14 && brand.h <= 30, brand ? `h=${brand.h.toFixed(1)}` : 'missing');
  check(`[${tag}] ${screen}: brand sits top-right of the header`, !!brand && brand.inHead && brand.cx > vp.width / 2 && brand.top <= brand.headTop + 44, brand ? `cx=${Math.round(brand.cx)} top=${Math.round(brand.top)}` : 'missing');
  check(`[${tag}] ${screen}: no big wordmark in the header`, !(await page.locator(`#${screen} .title, #${screen} .logo`).count()), 'found .title/.logo');

  // The online column matches #menu .menu-inner: same width, padding, rhythm and heading scale.
  const col = await page.evaluate((id) => {
    const inner = document.querySelector(`#${id} .online-inner`) as HTMLElement | null;
    const h2 = document.querySelector(`#${id} .online-head h2`) as HTMLElement | null;
    if (!inner || !h2) return null;
    const ics = getComputedStyle(inner);
    const hcs = getComputedStyle(h2);
    return { width: inner.getBoundingClientRect().width, paddingTop: parseFloat(ics.paddingTop), gap: parseFloat(ics.rowGap || ics.gap || '0'), h2: parseFloat(hcs.fontSize) };
  }, screen);
  const expectWidth = Math.min(420, vp.width - 32);
  check(`[${tag}] ${screen}: column width matches the menu`, !!col && Math.abs(col.width - expectWidth) <= 2, col ? `${col.width.toFixed(1)} vs ${expectWidth}` : 'missing');
  check(`[${tag}] ${screen}: column padding matches the menu`, !!col && Math.abs(col.paddingTop - 32) <= 1, col ? `padding-top=${col.paddingTop}` : 'missing');
  check(`[${tag}] ${screen}: column rhythm matches the menu`, !!col && Math.abs(col.gap - 14) <= 1, col ? `gap=${col.gap}` : 'missing');
  check(`[${tag}] ${screen}: heading uses the menu type scale`, !!col && Math.abs(col.h2 - 22.4) <= 1.2, col ? `h2=${col.h2}px` : 'missing');
};

/** All pairs of the given selectors must not overlap (bounding-box intersection = 0). */
const assertNoOverlap = async (page: Page, tag: string, screen: string, selectors: readonly string[]) => {
  const boxes: Record<string, Box | null> = {};
  for (const sel of selectors) boxes[sel] = await box(page, sel);
  const present = selectors.filter((s) => boxes[s]);
  for (let i = 0; i < present.length; i++) {
    for (let j = i + 1; j < present.length; j++) {
      const a = boxes[present[i]!]!;
      const b = boxes[present[j]!]!;
      const area = overlapArea(a, b);
      check(`[${tag}] ${screen}: ${present[i]} / ${present[j]} do not overlap`, area === 0, area ? `overlap ${Math.round(area)}px²` : '');
    }
  }
};

const assertBack = async (page: Page, tag: string, sel: string) => {
  const b = await box(page, sel);
  check(`[${tag}] back button ${sel} is >= 44x44`, !!b && b.height >= 44 && b.width >= 44, b ? `${Math.round(b.width)}x${Math.round(b.height)}` : 'missing');
};

const visibleOnline = (page: Page) =>
  page.evaluate(() => ['online-hub', 'online-waiting', 'online-join'].find((s) => !(document.getElementById(s) as HTMLElement)?.hidden) ?? 'none');

const browser: Browser = await chromium.launch({ executablePath: CHROME });
try {
  console.log(`Lobby submenu regression against ${BASE_URL} (phase=${PHASE}${STUB ? ', stubbed API' : ''})`);
  for (const vp of viewports) {
    // --- Context A: the creator (hub + waiting) -------------------------------------------------
    const a = await newPage(browser, vp);
    try {
      const hubOpen = await openHub(a.page).catch(() => false);
      check(`[${vp.tag}] hub opens from the menu`, hubOpen && (await visibleOnline(a.page)) === 'online-hub');
      if (hubOpen) {
        await a.page.waitForTimeout(400);
        await shoot(a.page, 'hub', vp.tag);
        await assertScreen(a.page, 'online-hub', vp);
        await assertNoOverlap(a.page, vp.tag, 'hub', ['#online-back', '#online-brand', '#online-hub-title', '#online-create', '#online-find', '#online-join-open', '#online-matches-title']);
        await assertBack(a.page, vp.tag, '#online-back');
      }
      const waitingOpen = hubOpen && (await openWaiting(a.page).catch(() => false));
      check(`[${vp.tag}] waiting opens from the hub`, waitingOpen && (await visibleOnline(a.page)) === 'online-waiting');
      if (waitingOpen) {
        await a.page.waitForTimeout(400);
        await shoot(a.page, 'waiting', vp.tag);
        await assertScreen(a.page, 'online-waiting', vp);
        await assertNoOverlap(a.page, vp.tag, 'waiting', ['#online-waiting-back', '#online-brand', '#online-waiting-title', '#online-invite-code', '#online-share', '#online-copy', '#online-cancel-match', '#online-waiting-expiry']);
        await assertBack(a.page, vp.tag, '#online-waiting-back');
        // waiting → hub
        await a.page.click('#online-waiting-back');
        await a.page.waitForTimeout(200);
        check(`[${vp.tag}] waiting back returns to the hub`, (await visibleOnline(a.page)) === 'online-hub');
      }
      // hub → menu
      if (hubOpen) {
        await a.page.click('#online-back');
        await a.page.waitForTimeout(300);
        const menuBack = await a.page.evaluate(() => {
          const menu = document.getElementById('menu') as HTMLElement | null;
          return { online: ['online-hub', 'online-waiting', 'online-join'].some((s) => !(document.getElementById(s) as HTMLElement)?.hidden), menuVisible: !!menu && !menu.hidden };
        });
        check(`[${vp.tag}] hub back returns to the main menu`, !menuBack.online && menuBack.menuVisible);
      }
    } finally {
      await a.ctx.close();
    }

    // --- Context B: the joiner (join screen) ----------------------------------------------------
    const b = await newPage(browser, vp);
    try {
      const hubOpen = await openHub(b.page).catch(() => false);
      const joinOpen = hubOpen && (await openJoin(b.page).catch(() => false));
      check(`[${vp.tag}] join opens from the hub`, joinOpen && (await visibleOnline(b.page)) === 'online-join');
      if (joinOpen) {
        await b.page.waitForTimeout(400);
        await shoot(b.page, 'join', vp.tag);
        await assertScreen(b.page, 'online-join', vp);
        await assertNoOverlap(b.page, vp.tag, 'join', ['#online-join-back', '#online-brand', '#online-join-title', '#online-join-prompt', '#online-join-code', '#online-join-submit']);
        await assertBack(b.page, vp.tag, '#online-join-back');
        await b.page.click('#online-join-back');
        await b.page.waitForTimeout(200);
        check(`[${vp.tag}] join back returns to the hub`, (await visibleOnline(b.page)) === 'online-hub');
      }
    } finally {
      await b.ctx.close();
    }
  }
} finally {
  await browser.close();
}

if (failed) {
  console.error(`\n${failed} lobby submenu checks failed`);
  process.exit(1);
}
console.log('\nLobby submenu checks passed.');
