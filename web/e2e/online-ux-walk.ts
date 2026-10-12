// PHASE D — two-browser UI/UX walk on REAL flows, with screenshots at 1280x800 and 390x844.
// Drives the live site (or BASE_URL) end to end: menu → hub → create → waiting → join → duel →
// starter banner → a full played turn → catch-up → resign → finished. Saves PNGs to
// docs/screens/online/ and prints machine-checkable findings.
//
//   npx tsx web/e2e/online-ux-walk.ts
//   BASE_URL=http://localhost:4207 npx tsx web/e2e/online-ux-walk.ts
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
import type { Browser, Page } from 'playwright-core';

const BASE_URL = (process.env.BASE_URL ?? 'https://severgrow.github.io/severgrow-01/futa0.5/').replace(/\/?$/, '/');
const OUT = new URL('../../docs/screens/online/', import.meta.url).pathname;
const CHROME =
  process.env.PW_CHROMIUM ??
  '/Users/patryk/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';

mkdirSync(OUT, { recursive: true });
let failed = 0;
const check = (name: string, ok: boolean, note = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? `  (${note})` : ''}`);
};
const findings: string[] = [];
const finding = (level: 'FIX' | 'DECIDE' | 'INFO', text: string) => findings.push(`${level}: ${text}`);

const errors: string[] = [];
const watch = (page: Page, label: string) => {
  page.on('pageerror', (e) => errors.push(`[${label} pageerror] ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`[${label} console] ${m.text()}`);
  });
};

const shoot = async (page: Page, name: string) => {
  await page.screenshot({ path: `${OUT}${name}.png` });
};

/** Text that overflows its box is clipped (no ellipsis by default on these panels). */
const clipped = (page: Page, selector: string) =>
  page
    .locator(selector)
    .evaluateAll((els) =>
      els
        .filter((el) => el instanceof HTMLElement && el.offsetParent !== null && el.scrollWidth > el.clientWidth + 1)
        .map((el) => (el.textContent ?? '').trim().slice(0, 40)),
    )
    .catch(() => [] as string[]);

const hudTurn = (page: Page) => page.locator('[data-duel-turn]').textContent().catch(() => '');

/** Best-effort UI turn: Draw → end the Grow step → pick a card and confirm the Discard. */
const playTurnViaUi = async (page: Page): Promise<boolean> => {
  const before = ((await hudTurn(page)) ?? '').trim();
  if (before !== 'Your turn') return false;
  // Draw
  const deck = page.locator('#deck');
  if (await deck.isEnabled().catch(() => false)) {
    await deck.click().catch(() => undefined);
    await page.waitForTimeout(400);
  }
  // End the Grow step (throw) — the Skip/end control in the moves row.
  const end = page.locator('#moves .futa04-skip, #moves .end').first();
  if (await end.isVisible().catch(() => false)) {
    await end.click().catch(() => undefined);
    await page.waitForTimeout(500);
  }
  // Discard: pick a card, then confirm if the confirm box appears.
  const card = page.locator('#hand .card').first();
  if (await card.isVisible().catch(() => false)) {
    await card.click().catch(() => undefined);
    await page.waitForTimeout(250);
    const confirm = page.locator('#confirm:not([hidden]) #confirm-play, #confirm-play');
    if (await confirm.isVisible().catch(() => false)) {
      await confirm.click().catch(() => undefined);
      await page.waitForTimeout(600);
    }
  }
  // Wait for the turn to leave this page.
  for (let i = 0; i < 20; i++) {
    const now = ((await hudTurn(page)) ?? '').trim();
    if (now !== 'Your turn') return true;
    await page.waitForTimeout(300);
  }
  return false;
};

const browser: Browser = await chromium.launch({ executablePath: CHROME });
try {
  console.log(`UI walk against ${BASE_URL}`);
  const ctxA = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const ctxB = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const A = await ctxA.newPage();
  const B = await ctxB.newPage();
  watch(A, 'desktop');
  watch(B, 'phone');
  for (const p of [A, B]) await p.addInitScript(() => localStorage.clear());

  // --- menu ---
  await A.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await A.waitForSelector('#menu:not([hidden])', { timeout: 25_000 });
  await shoot(A, '01-menu-desktop-1280x800');
  check('menu: Play online visible', await A.locator('#menu-online:not([hidden])').isVisible());
  check('menu: no clipped text', (await clipped(A, '#menu .title, #menu-tagline, #menu-online, #menu-new')).length === 0);

  await B.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await B.waitForSelector('#menu:not([hidden])', { timeout: 25_000 });
  await shoot(B, '02-menu-phone-390x844');

  // --- hub ---
  await A.click('#menu-online');
  await A.waitForSelector('#online-hub:not([hidden])', { timeout: 20_000 });
  if (await A.locator('#online-first-ok').isVisible().catch(() => false)) await A.click('#online-first-ok');
  await shoot(A, '03-hub-desktop');
  const hubClip = await clipped(A, '#online-hub h2, #online-create, #online-find, #online-join-open, .online-row-status');
  if (hubClip.length) finding('FIX', `hub text clipped: ${hubClip.join(' | ')}`);

  await B.click('#menu-online');
  await B.waitForSelector('#online-hub:not([hidden])', { timeout: 20_000 });
  if (await B.locator('#online-first-ok').isVisible().catch(() => false)) await B.click('#online-first-ok');
  await shoot(B, '04-hub-phone');

  // --- create + waiting ---
  await A.click('#online-create');
  await A.waitForSelector('#online-waiting:not([hidden])', { timeout: 25_000 });
  const invite = ((await A.locator('#online-invite-code').textContent()) ?? '').trim();
  check('waiting: invite code shown', /^[0-9A-HJKMNP-TV-Z]{8}$/.test(invite), invite);
  await shoot(A, '05-waiting-desktop');
  await shoot(B, '06-hub-phone-before-join');

  // --- join ---
  await B.click('#online-join-open');
  await B.waitForSelector('#online-join:not([hidden])', { timeout: 15_000 });
  await B.fill('#online-join-code', invite);
  await shoot(B, '07-join-phone');
  await B.click('#online-join-submit');

  // --- duel + starter banner ---
  await B.waitForSelector('#game:not([hidden])', { timeout: 30_000 });
  await A.waitForSelector('#game:not([hidden])', { timeout: 30_000 });

  // catch the starter lottery on whichever page shows it first
  for (const [page, tag] of [
    [A, 'desktop'] as const,
    [B, 'phone'] as const,
  ]) {
    const lottery = page.locator('#starter-lottery:not([hidden])');
    if (await lottery.isVisible().catch(() => false)) {
      const title = ((await page.locator('#lottery-title').textContent()) ?? '').trim();
      await shoot(page, `08-starter-lottery-${tag}`);
      check(`starter: banner shows You/Opponent start (${tag})`, /start/i.test(title), title);
      finding('INFO', `starter banner (${tag}): "${title}"`);
    }
  }
  await A.waitForTimeout(2500);

  await shoot(A, '09-duel-desktop');
  await shoot(B, '10-duel-phone');
  check('duel: A HUD visible', await A.locator('#duel-hud:not([hidden])').isVisible());
  check('duel: B HUD visible', await B.locator('#duel-hud:not([hidden])').isVisible());
  const hudClip = await clipped(A, '#duel-hud [data-duel-opponent], #duel-hud [data-duel-turn], #duel-hud [data-duel-deadline]');
  if (hudClip.length) finding('FIX', `duel HUD text clipped: ${hudClip.join(' | ')}`);

  // --- play a full turn through the UI, both seats if needed ---
  const turnTextA = ((await hudTurn(A)) ?? '').trim();
  const turnTextB = ((await hudTurn(B)) ?? '').trim();
  finding('INFO', `turn at start: A="${turnTextA}" B="${turnTextB}"`);
  const actor = turnTextA === 'Your turn' ? A : turnTextB === 'Your turn' ? B : null;
  const waiter = actor === A ? B : A;
  check('duel: exactly one side has the turn', (turnTextA === 'Your turn') !== (turnTextB === 'Your turn'), `A=${turnTextA} B=${turnTextB}`);
  if (actor) {
    const moved = await playTurnViaUi(actor);
    check('turn completes in the UI (turn passes to the opponent)', moved, `before="${actor === A ? turnTextA : turnTextB}"`);
    await shoot(actor, '11-after-turn-actor');
    const waiterNow = ((await hudTurn(waiter)) ?? '').trim();
    check('opponent sees the turn arrive (catch-up)', waiterNow === 'Your turn', waiterNow);
    await shoot(waiter, '12-opponent-turn');
  }

  // --- resign -> finished ---
  await A.evaluate(() => {
    (window as unknown as { confirm: () => boolean }).confirm = () => true;
  });
  await A.evaluate(() => (document.getElementById('duel-resign') as HTMLButtonElement).click());
  await A.waitForFunction(() => {
    const go = document.getElementById('gameover');
    const title = document.getElementById('go-title')?.textContent ?? '';
    return !!(go && !go.hidden && /won|lost|draw/i.test(title));
  }, { timeout: 25_000 }).catch(() => undefined);
  await shoot(A, '13-finished-desktop');
  await B.waitForFunction(() => {
    const go = document.getElementById('gameover');
    const title = document.getElementById('go-title')?.textContent ?? '';
    return !!(go && !go.hidden && /won|lost|draw/i.test(title));
  }, { timeout: 25_000 }).catch(() => undefined);
  await shoot(B, '14-finished-phone');
  const aTitle = ((await A.locator('#go-title').textContent()) ?? '').trim();
  const bTitle = ((await B.locator('#go-title').textContent()) ?? '').trim();
  check('finished: A shows a result', /won|lost|draw/i.test(aTitle), aTitle);
  check('finished: B shows the opposite result', /won|lost|draw/i.test(bTitle) && bTitle !== aTitle, bTitle);
  const finishedClip = await clipped(A, '#go-title, #go-sub, #go-rematch');
  if (finishedClip.length) finding('FIX', `finished text clipped: ${finishedClip.join(' | ')}`);

  check('no console errors during the walk', errors.length === 0, errors.slice(0, 3).join(' | '));
} finally {
  await browser.close();
}

console.log('\nFindings:');
for (const f of findings) console.log(`  ${f}`);
if (failed) {
  console.error(`\n${failed} UI walk checks failed`);
  process.exit(1);
}
console.log('\nUI walk passed.');
