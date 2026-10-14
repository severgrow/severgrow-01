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
import { DEFAULT_SERVER_CONFIG } from '../../server/src/config.js';

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
  const log = (...a: unknown[]) => {
    if (process.env.UX_DEBUG) console.log('   [ui]', ...a);
  };
  const dump = async (tag: string) => {
    if (!process.env.UX_DEBUG) return;
    const moves = ((await page.locator('#moves').innerText().catch(() => '')) ?? '').replace(/\s+/g, ' ').slice(0, 160);
    const movesHtml = await page.locator('#moves').evaluate((el) => el.innerHTML.length).catch(() => 0);
    const smart = ((await page.locator('#smart-context').innerText().catch(() => '')) ?? '').replace(/\s+/g, ' ').slice(0, 80);
    const smartDisabled = await page.locator('#smart-context').isDisabled().catch(() => true);
    const playable = await page.locator('#hand .card.playable').count().catch(() => 0);
    const confirmHidden = await page.locator('#confirm').evaluate((el) => (el as HTMLElement).hidden).catch(() => true);
    log(
      tag,
      'turn=', await hudTurn(page),
      'deckEnabled=', await page.locator('#deck').isEnabled().catch(() => false),
      'hand=', await page.locator('#hand .card').count(),
      'playable=', playable,
      'movesHtmlLen=', movesHtml,
      'movesHtml=', JSON.stringify(((await page.locator('#moves').evaluate((el) => el.innerHTML).catch(() => '')) ?? '').replace(/\s+/g, ' ').slice(0, 320)),
      'moves=', JSON.stringify(moves),
      'smartCtx=', JSON.stringify(smart),
      'smartDisabled=', smartDisabled,
      'confirmHidden=', confirmHidden,
    );
  };
  const before = ((await hudTurn(page)) ?? '').trim();
  if (before !== 'Your turn') return false;
  const waitFor = async (fn: () => Promise<boolean>, ms = 8000) => {
    for (let t = 0; t < ms / 200; t++) {
      if (await fn().catch(() => false)) return true;
      await page.waitForTimeout(200);
    }
    return false;
  };
  await dump('start');
  // Draw — call the handler directly so an overlay can never swallow the click.
  const deck = page.locator('#deck');
  if (await deck.isEnabled().catch(() => false)) {
    await page.evaluate(() => (document.getElementById('deck') as HTMLButtonElement).click());
    await waitFor(async () => !(await page.locator('#deck').isEnabled().catch(() => true)));
    await dump('after-draw');
  }
  // The Grow step: play one suggested move if the UI offers one, then end the step (Throw).
  const endSel = '#moves .futa04-skip, #moves .end';
  const hasEnd = async () => (await page.locator(endSel).count()) > 0;
  if (!(await hasEnd())) {
    const smart = page.locator('#smart-context');
    if (await smart.isEnabled().catch(() => false)) {
      await smart.evaluate((el) => (el as HTMLButtonElement).click()).catch(() => undefined);
      await page.waitForTimeout(900);
      await dump('after-smart');
    }
  }
  if (await waitFor(hasEnd, 6000)) {
    await page.locator(endSel).first().evaluate((el) => (el as HTMLButtonElement).click());
    await page.waitForTimeout(900);
    await dump('after-end');
  } else {
    log('no end button in the moves row');
  }
  // Discard: Futa04 keeps the Confirm box hidden (tap-again or drag to the Throw pile).
  const card = page.locator('#hand .card.playable, #hand .card').first();
  if ((await card.count().catch(() => 0)) > 0) {
    await card.evaluate((el) => (el as HTMLButtonElement).click());
    await page.waitForTimeout(400);
    await card.evaluate((el) => (el as HTMLButtonElement).click());
    await page.waitForTimeout(900);
    await dump('after-card');
    if (((await hudTurn(page)) ?? '').trim() === 'Your turn') {
      // Fall back to a drag onto the Throw pile (the other supported gesture).
      await card.dragTo(page.locator('#discard')).catch(() => undefined);
      await page.waitForTimeout(900);
      await dump('after-drag');
    }
    const confirm = page.locator('#confirm-play');
    if (await confirm.isVisible().catch(() => false)) {
      await confirm.evaluate((el) => (el as HTMLButtonElement).click());
      await page.waitForTimeout(900);
      await dump('after-confirm');
    }
  }
  // Wait for the turn to leave this page.
  const gone = await waitFor(async () => ((await hudTurn(page)) ?? '').trim() !== 'Your turn', 8000);
  if (!gone) await dump('gave-up');
  return gone;
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
  await A.waitForSelector('#menu-online:not([hidden])', { timeout: 25_000 });
  await shoot(A, '01-menu-desktop-1280x800');
  check('menu: Play online visible', await A.locator('#menu-online:not([hidden])').isVisible());
  // `#menu-tagline` was in this list; the owner removed the tagline from the menu on 2026-10-14, so
  // there is no such element to clip-check any more (asserting a hidden one would be hollow).
  check('menu: no clipped text', (await clipped(A, '#menu .title, #menu-online, #menu-new')).length === 0);

  await B.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await B.waitForSelector('#menu:not([hidden])', { timeout: 25_000 });
  await B.waitForSelector('#menu-online:not([hidden])', { timeout: 25_000 });
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
  check('waiting: invite code shown', new RegExp(`^[0-9A-HJKMNP-TV-Z]{${DEFAULT_SERVER_CONFIG.inviteCodeLength}}$`).test(invite), invite);
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

  // catch the starter lottery on both pages (it resolves to "You start"/"Opponent starts")
  const pages: [Page, string][] = [
    [A, 'desktop'],
    [B, 'phone'],
  ];
  await Promise.all(
    pages.map(([page]) =>
      page
        .waitForFunction(() => /start/i.test(document.getElementById('lottery-title')?.textContent ?? ''), { timeout: 6000 })
        .catch(() => undefined),
    ),
  );
  for (const [page, tag] of pages) {
    const title = ((await page.locator('#lottery-title').textContent().catch(() => '')) ?? '').trim();
    if (await page.locator('#starter-lottery:not([hidden])').isVisible().catch(() => false)) {
      await shoot(page, `08-starter-lottery-${tag}`);
    }
    check(`starter: banner shows You/Opponent start (${tag})`, /start/i.test(title), title);
    finding('INFO', `starter banner (${tag}): "${title}"`);
  }
  await A.waitForTimeout(2500);

  await shoot(A, '09-duel-desktop');
  await shoot(B, '10-duel-phone');
  check('duel: A HUD visible', await A.locator('#duel-hud:not([hidden])').isVisible());
  check('duel: B HUD visible', await B.locator('#duel-hud:not([hidden])').isVisible());
  const oppName = ((await A.locator('[data-duel-opponent]').textContent().catch(() => '')) ?? '').trim();
  const presenceWord = ((await A.locator('[data-duel-presence]').textContent().catch(() => '')) ?? '').trim();
  check('duel: opponent name shown', oppName.length > 0, oppName);
  check('duel: presence status shown', /online|away|unknown/i.test(presenceWord), presenceWord);
  // The strip was trimmed: Resign, who-starts and the deadline are gone from the duel screen.
  check('duel: the removed chips are gone from the strip', (await A.locator('#duel-hud [data-duel-deadline], #duel-hud [data-duel-starter], #duel-hud #duel-resign').count()) === 0);
  const hudClip = await clipped(A, '#duel-hud [data-duel-opponent], #duel-hud [data-duel-turn], #duel-hud [data-duel-presence]');
  if (hudClip.length) finding('FIX', `duel HUD text clipped: ${hudClip.join(' | ')}`);

  // The deadline now lives only in the match list; open the pause menu -> Main menu -> matches and
  // check the row still shows the time left (a duration, never a wall-clock time — P-19).
  await A.click('#hud-menu');
  await A.waitForSelector('#sheet-menu:not([hidden])', { timeout: 6_000 });
  await A.click('#gm-main');
  await A.waitForSelector('#menu:not([hidden])', { timeout: 15_000 });
  await A.click('#menu-online');
  await A.waitForSelector('#online-hub:not([hidden])', { timeout: 25_000 });
  const rowTime = ((await A.locator('#online-matches .online-row-time').first().textContent().catch(() => '')) ?? '').trim();
  check('lobby: the deadline is still in the match list as a duration', /\d+\s*(d|h|m)/i.test(rowTime) && !/\d:\d\d/.test(rowTime), rowTime);
  await A.locator('#online-matches li').first().click();
  await A.waitForSelector('#game:not([hidden])', { timeout: 25_000 });
  await A.waitForSelector('#duel-hud:not([hidden])', { timeout: 20_000 });

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
    // The non-acting tab polls (Realtime is a hint); make it visible so it refreshes promptly.
    await waiter.bringToFront().catch(() => undefined);
    await waiter.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))).catch(() => undefined);
    let arrived = false;
    for (let i = 0; i < 70 && !arrived; i++) {
      arrived = ((await hudTurn(waiter)) ?? '').trim() === 'Your turn';
      if (!arrived) await waiter.waitForTimeout(500);
    }
    check('opponent sees the turn arrive (catch-up)', arrived, ((await hudTurn(waiter)) ?? '').trim());
    await shoot(waiter, '12-opponent-turn');
    await actor.bringToFront().catch(() => undefined);
  }

  // --- resign from the pause menu -> finished (the top-row Resign control is gone) ---
  await A.evaluate(() => {
    (window as unknown as { confirm: () => boolean }).confirm = () => true;
  });
  await A.click('#hud-menu');
  await A.waitForSelector('#sheet-menu:not([hidden])', { timeout: 6_000 });
  await A.evaluate(() => {
    const btn = document.getElementById('gm-resign') as HTMLButtonElement | null;
    if (btn && !btn.hidden) btn.click();
  });
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
