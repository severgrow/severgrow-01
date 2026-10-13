// FUTASAKU 0.5 — invite flow: link-first waiting screen, link-arrival confirm, typed-code fast path,
// and a bad-link that explains itself. Starts a local duel API + Vite preview (real MemoryStorage),
// so the joins are real two-context joins, not stubs.
//   npx tsx web/e2e/online-invite-flow.ts                # PHASE=after (screenshots + asserts)
//   PHASE=before npx tsx web/e2e/online-invite-flow.ts   # same spec against an older build
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { chromium } from 'playwright-core';
import type { Browser, BrowserContext, Page } from 'playwright-core';
import { preview } from 'vite';
import { DEFAULT_SERVER_CONFIG } from '../../server/src/config.js';
import { createHttpServer } from '../../server/src/http.js';
import { MatchService } from '../../server/src/service.js';
import { MemoryStorage } from '../../server/src/storage/memory.js';
import { ONLINE } from '../../src/strings.js';

const OUT = new URL('../../docs/screens/online/', import.meta.url).pathname;
const PHASE = process.env.PHASE ?? 'after';
const CHROME =
  process.env.PW_CHROMIUM ??
  '/Users/patryk/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const PORT = Number(process.env.PREVIEW_PORT ?? 4210);

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
const box = async (page: Page, sel: string): Promise<Box | null> =>
  page.locator(sel).first().boundingBox().catch(() => null);

const shoot = async (page: Page, kind: string, vp: string) => {
  await page.screenshot({ path: `${OUT}invite-${kind}-${PHASE}-${vp}.png` });
};

const settingsInit = () => {
  localStorage.clear();
  localStorage.setItem(
    'main2:severgrow.settings.v1',
    JSON.stringify({ sound: false, music: false, coach: false, speed: 'skip', reduceMotion: true, eyeCandy: false }),
  );
};

const buildWithApi = async (apiBase: string): Promise<void> =>
  new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ['./node_modules/vite/bin/vite.js', 'build', '--config', 'web/vite.config.ts'],
      {
        env: { ...process.env, PATH: process.env.PATH, CHANNEL: 'futa04', VITE_DUEL_API_URL: apiBase },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    let err = '';
    child.stderr?.on('data', (b) => {
      err += String(b);
    });
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`web:build failed: ${err}`))));
  });

const waitVisible = async (page: Page, sel: string, ms = 15_000) => {
  await page.waitForSelector(`${sel}:not([hidden])`, { timeout: ms });
};

const newContext = async (browser: Browser, origin: string): Promise<{ ctx: BrowserContext; page: Page }> => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin });
  const page = await ctx.newPage();
  await page.addInitScript(settingsInit);
  return { ctx, page };
};

const openHub = async (page: Page, label: string): Promise<void> => {
  await waitVisible(page, '#menu-online');
  await page.click('#menu-online');
  await waitVisible(page, '#online-hub');
  if (await page.locator('#online-first-ok').isVisible().catch(() => false)) await page.click('#online-first-ok');
  check(`${label}: online hub open`, true);
};

const inviteCodeOf = async (page: Page): Promise<string> => {
  await page.waitForFunction(
    () => new RegExp(`^[0-9A-HJKMNP-TV-Z]{${DEFAULT_SERVER_CONFIG.inviteCodeLength}}$`).test((document.getElementById('online-invite-code')?.textContent ?? '').trim()),
    { timeout: 20_000 },
  );
  return ((await page.locator('#online-invite-code').textContent()) ?? '').trim();
};

const assertNoOverlap = async (page: Page, tag: string, screen: string, selectors: readonly string[]) => {
  const boxes: Record<string, Box | null> = {};
  for (const sel of selectors) boxes[sel] = await box(page, sel);
  const present = selectors.filter((s) => boxes[s]);
  for (let i = 0; i < present.length; i++) {
    for (let j = i + 1; j < present.length; j++) {
      const area = overlapArea(boxes[present[i]!]!, boxes[present[j]!]!);
      check(`[${tag}] ${screen}: ${present[i]} / ${present[j]} do not overlap`, area === 0, area ? `${Math.round(area)}px²` : '');
    }
  }
};

const assertTarget = async (page: Page, tag: string, sel: string) => {
  const b = await box(page, sel);
  check(`[${tag}] ${sel} is >= 44x44`, !!b && b.height >= 44 && b.width >= 44, b ? `${Math.round(b.width)}x${Math.round(b.height)}` : 'missing');
};

const service = new MatchService({
  storage: new MemoryStorage(),
  config: { ...DEFAULT_SERVER_CONFIG, corsOrigin: '*', turnTimeoutMs: 3_600_000 },
});
const apiServer = createHttpServer({ service, config: { ...DEFAULT_SERVER_CONFIG, corsOrigin: '*' } });
await new Promise<void>((resolve) => apiServer.listen(0, '127.0.0.1', resolve));
const apiBase = `http://127.0.0.1:${(apiServer.address() as AddressInfo).port}`;
console.log(`local duel API on ${apiBase}`);
await buildWithApi(apiBase);

const previewServer = await preview({
  configFile: 'web/vite.config.ts',
  preview: { host: '127.0.0.1', port: PORT, strictPort: true },
  logLevel: 'error',
});
const origin =
  previewServer.resolvedUrls?.local?.[0]?.replace(/\/$/, '') ??
  `http://127.0.0.1:${(previewServer.httpServer?.address() as AddressInfo | null)?.port ?? PORT}`;
console.log(`preview at ${origin}`);
for (let i = 0; i < 40; i++) {
  try {
    const res = await fetch(`${origin}/`);
    if (res.ok || res.status === 404) break;
  } catch {
    await new Promise((r) => setTimeout(r, 100));
  }
}

const VIEWPORTS = [
  { tag: '360x640', width: 360, height: 640 },
  { tag: '390x844', width: 390, height: 844 },
  { tag: '1280x800', width: 1280, height: 800 },
];

const browser: Browser = await chromium.launch({ executablePath: CHROME });
try {
  console.log(`Invite-flow spec (phase=${PHASE})`);

  // ---------------------------------------------------------------------------------------------
  // 1) Waiting screen: Share is primary, the code is a smaller tappable fallback.
  // ---------------------------------------------------------------------------------------------
  const A = await newContext(browser, origin);
  await A.page.goto(`${origin}/`);
  await openHub(A.page, 'A');
  await A.page.click('#online-create');
  await waitVisible(A.page, '#online-waiting', 25_000);
  const codeA = await inviteCodeOf(A.page);
  check('A: invite code shown', new RegExp(`^[0-9A-HJKMNP-TV-Z]{${DEFAULT_SERVER_CONFIG.inviteCodeLength}}$`).test(codeA), codeA);

  // Share is the primary action; the code is not a primary button.
  const sharePrimary = await A.page.evaluate(() => {
    const share = document.getElementById('online-share');
    const code = document.getElementById('online-invite-code');
    return {
      shareClass: share?.className ?? '',
      codeClass: code?.className ?? '',
      codeRole: code?.getAttribute('role'),
      codeTab: code?.getAttribute('tabindex'),
      hint: (document.getElementById('online-code-hint')?.textContent ?? '').trim(),
    };
  });
  check('waiting: Share is the primary action', /\bprimary\b/.test(sharePrimary.shareClass), sharePrimary.shareClass);
  check('waiting: Share is the big headline action', /\bbig\b/.test(sharePrimary.shareClass), sharePrimary.shareClass);
  check('waiting: code is the secondary chip, not a primary button', /\bonline-code\b/.test(sharePrimary.codeClass) && !/\bprimary\b/.test(sharePrimary.codeClass), sharePrimary.codeClass);
  check('waiting: code is tappable (role=button, focusable)', sharePrimary.codeRole === 'button' && sharePrimary.codeTab === '0');
  check('waiting: code hint explains the tap', sharePrimary.hint === ONLINE.codeTapCopy, sharePrimary.hint);

  // Tap the code → copies just the code, with a brief confirmation.
  await A.page.click('#online-invite-code');
  await A.page.waitForFunction((expected) => (document.getElementById('online-waiting-notice')?.textContent ?? '').includes(expected), ONLINE.codeCopied, { timeout: 5000 }).catch(() => undefined);
  const clip = await A.page.evaluate(() => navigator.clipboard.readText().catch(() => '')).then((t) => (t ?? '').trim());
  const noticeText = ((await A.page.locator('#online-waiting-notice').textContent()) ?? '').trim();
  check('waiting: tapping the code copies the code', clip === codeA, `clip=${clip}`);
  check('waiting: tapping the code confirms briefly', noticeText === ONLINE.codeCopied, noticeText);

  for (const vp of VIEWPORTS) {
    await A.page.setViewportSize({ width: vp.width, height: vp.height });
    await A.page.waitForTimeout(150);
    await shoot(A.page, 'waiting', vp.tag);
    await assertTarget(A.page, vp.tag, '#online-invite-code');
    await assertTarget(A.page, vp.tag, '#online-share');
    await assertNoOverlap(A.page, vp.tag, 'waiting', [
      '#online-waiting-back',
      '#online-waiting-title',
      '#online-waiting-body',
      '#online-share',
      '#online-copy',
      '#online-cancel-match',
      '#online-invite-code',
      '#online-code-hint',
      '#online-waiting-expiry',
    ]);
  }
  await A.page.setViewportSize({ width: 390, height: 844 });

  // ---------------------------------------------------------------------------------------------
  // 2) Link arrival: a confirm before joining (Join / Cancel), then the join.
  // ---------------------------------------------------------------------------------------------
  const B = await newContext(browser, origin);
  await B.page.goto(`${origin}/#/join/${codeA}`);
  await waitVisible(B.page, '#online-join', 20_000);
  const confirm = await B.page.evaluate(() => {
    const c = document.getElementById('online-join-confirm') as HTMLElement | null;
    const cancel = document.getElementById('online-join-cancel') as HTMLElement | null;
    const input = document.getElementById('online-join-code') as HTMLInputElement | null;
    const field = input?.closest('.online-field') as HTMLElement | null;
    return {
      confirmVisible: !!c && !c.hidden,
      confirmText: (c?.textContent ?? '').trim(),
      cancelVisible: !!cancel && !cancel.hidden,
      fieldHidden: field !== null && field.hidden === true,
    };
  });
  check('link: arrive shows the confirm', confirm.confirmVisible && confirm.confirmText.length > 0, confirm.confirmText);
  check('link: confirm offers Join / Cancel', confirm.cancelVisible);
  check('link: the code field is hidden on a link arrival', confirm.fieldHidden);

  for (const vp of VIEWPORTS) {
    await B.page.setViewportSize({ width: vp.width, height: vp.height });
    await B.page.waitForTimeout(150);
    if (vp.tag === '390x844' || vp.tag === '1280x800') await shoot(B.page, 'confirm', vp.tag);
    await assertTarget(B.page, vp.tag, '#online-join-cancel');
    await assertTarget(B.page, vp.tag, '#online-join-submit');
    await assertNoOverlap(B.page, vp.tag, 'confirm', ['#online-join-back', '#online-join-title', '#online-join-confirm', '#online-join-submit', '#online-join-cancel']);
  }
  await B.page.setViewportSize({ width: 390, height: 844 });
  await B.page.click('#online-join-submit');
  await waitVisible(B.page, '#game', 25_000);
  check('link: Join enters the duel', true);
  await waitVisible(A.page, '#game', 25_000);
  check('link: creator opened the duel after the join', true);
  await A.ctx.close();
  await B.ctx.close();

  // ---------------------------------------------------------------------------------------------
  // 3) Typed code: joins straight away, no confirm (and a pasted link still lands).
  // ---------------------------------------------------------------------------------------------
  const C = await newContext(browser, origin);
  await C.page.goto(`${origin}/`);
  await openHub(C.page, 'C');
  await C.page.click('#online-create');
  await waitVisible(C.page, '#online-waiting', 25_000);
  const codeC = await inviteCodeOf(C.page);
  check('C: invite code shown', new RegExp(`^[0-9A-HJKMNP-TV-Z]{${DEFAULT_SERVER_CONFIG.inviteCodeLength}}$`).test(codeC), codeC);

  const D = await newContext(browser, origin);
  await D.page.goto(`${origin}/`);
  await openHub(D.page, 'D');
  await D.page.click('#online-join-open');
  await waitVisible(D.page, '#online-join');
  const typedIsFast = await D.page.evaluate(() => ({
    confirmHidden: (document.getElementById('online-join-confirm') as HTMLElement | null)?.hidden !== false,
    fieldVisible: !(document.getElementById('online-join-code') as HTMLInputElement | null)?.closest('.online-field')?.hasAttribute('hidden'),
  }));
  check('typed: no confirm on the typed-code screen', typedIsFast.confirmHidden && typedIsFast.fieldVisible);
  // Grouped, lower-case paste (how people read a code aloud) must still land on the bare code.
  const grouped = `${codeC.slice(0, 4)} ${codeC.slice(4)}`.toLowerCase();
  await D.page.fill('#online-join-code', grouped);
  await D.page.click('#online-join-submit');
  await waitVisible(D.page, '#game', 25_000);
  check('typed: joins straight away (no confirm)', true);
  await waitVisible(C.page, '#game', 25_000);
  check('typed: creator opened the duel after the join', true);
  await C.ctx.close();
  await D.ctx.close();

  const E = await newContext(browser, origin);
  await E.page.goto(`${origin}/`);
  await openHub(E.page, 'E');
  await E.page.click('#online-join-open');
  await waitVisible(E.page, '#online-join');
  await E.page.fill('#online-join-code', 'zz-!!');
  await E.page.click('#online-join-submit');
  const malformed = ((await E.page.locator('#online-join-notice').textContent()) ?? '').trim();
  check('typed: a malformed code is refused with its own short message', malformed === ONLINE.errCodeFormat, malformed);
  await E.ctx.close();

  // ---------------------------------------------------------------------------------------------
  // 4) Bad link: lands on the join screen and explains itself (never a blank screen).
  // ---------------------------------------------------------------------------------------------
  const F = await newContext(browser, origin);
  await F.page.goto(`${origin}/#/join/x`);
  const badVisible = await waitVisible(F.page, '#online-join', 20_000).then(
    () => true,
    () => false,
  );
  const badNotice = ((await F.page.locator('#online-join-notice').textContent().catch(() => '')) ?? '').trim();
  check('bad link: lands on the join screen (not blank)', badVisible);
  check('bad link: explains itself briefly', badNotice === ONLINE.errLinkBroken, badNotice);
  const badFieldVisible = await F.page.locator('#online-join-code').isVisible().catch(() => false);
  check('bad link: offers the code field', badFieldVisible);
  for (const vp of VIEWPORTS) {
    if (vp.tag !== '390x844' && vp.tag !== '1280x800') continue;
    await F.page.setViewportSize({ width: vp.width, height: vp.height });
    await F.page.waitForTimeout(150);
    await shoot(F.page, 'badlink', vp.tag);
  }
  await F.ctx.close();
} finally {
  await browser.close();
  await previewServer.close();
  await new Promise<void>((resolve) => apiServer.close(() => resolve()));
}

if (failed) {
  console.error(`\n${failed} invite-flow checks failed`);
  process.exit(1);
}
console.log('\nInvite-flow checks passed.');
