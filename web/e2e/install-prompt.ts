// The install invitation, end to end.
//
//   npx tsx web/e2e/install-prompt.ts
//
// Proves the owner's exact worry is fixed: an ONLINE win (the only kind the two-phone player has)
// raises the invitation — because online finishes go through the same counter as offline ones.
// Also proves the menu has no install button, the iOS face is the Share instruction (never a dead
// native button), and "Don't show again" is written to the device. Writes screenshots to
// docs/screens/install-prompt/ at 390x844 and 1280x800.
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { startLocalDuel, openSeat, openDuel, waitIdle } from './helpers/local-duel.js';
import type { LocalDuel, LocalMatch, SeatSession } from './helpers/local-duel.js';

const OUT = resolve('docs/screens/install-prompt');
mkdirSync(OUT, { recursive: true });

let checks = 0;
const check = (ok: unknown, name: string) => {
  assert(ok, name);
  checks++;
  console.log(`PASS  ${name}`);
};

const PORT = Number(process.env.INSTALL_PROMPT_PORT ?? 5231);
const PROMPT = '#install-prompt:not([hidden])';

const duel: LocalDuel = await startLocalDuel({ port: PORT, turnTimeoutMs: 24 * 3_600_000 });

/** Open a match with both seats, seat 1 resigns, and return the winner's page (seat 0). */
const playAndWin = async (match: LocalMatch, viewport: { width: number; height: number }): Promise<SeatSession> => {
  const seat0 = await openSeat(duel, match, 0, { viewport });
  const seat1 = await openSeat(duel, match, 1, { viewport });
  await openDuel(seat0, match.matchId);
  await openDuel(seat1, match.matchId);
  await waitIdle(seat0);
  await waitIdle(seat1);
  // Resign on seat 1: seat 0 wins. (The API is the authoritative path the page itself uses.)
  await duel.api.resign(match.guests[1].token, match.matchId);
  await seat0.page.waitForSelector('#gameover:not([hidden])', { timeout: 30_000 });
  return seat0;
};

try {
  // ---- 1. an ONLINE win raises the invitation -------------------------------------------------
  const mobile = await duel.newMatch();
  const winner = await playAndWin(mobile, { width: 390, height: 844 });
  await winner.page.waitForSelector(PROMPT, { timeout: 30_000 });
  check(await winner.page.locator('#install-title').innerText().then((t) => t.length > 0), 'online win: invitation shows with a headline');
  check(await winner.page.locator('#install-why li').count() >= 2, 'online win: invitation lists what the player gets');
  check(await winner.page.locator('#install-never').isVisible(), 'online win: "Don\'t show again" is offered');
  // Screenshot the way it actually appears: over the finish screen.
  await winner.page.screenshot({ path: `${OUT}/first-online-win-390x844.png` });
  // channel.ts prefixes every storage key, so read it unprefixed inside the page.
  check((await winner.page.evaluate(() => localStorage.getItem('severgrow.install-prompt.v1'))) !== null, 'online win: the count is written to the device');
  await winner.page.click('#install-never');
  await winner.page.waitForSelector(PROMPT, { state: 'attached', timeout: 5_000 }).catch(() => undefined);
  check(await winner.page.locator('#install-prompt').isHidden(), 'dismissing closes the invitation');
  const saved = await winner.page.evaluate(() => localStorage.getItem('severgrow.install-prompt.v1') ?? '');
  check(saved.includes('"never":true'), '"Don\'t show again" is saved forever on the device');
  await winner.context.close();

  // ---- 2. desktop size -----------------------------------------------------------------------
  const desktop = await duel.newMatch();
  const big = await playAndWin(desktop, { width: 1280, height: 800 });
  await big.page.waitForSelector(PROMPT, { timeout: 30_000 });
  await big.page.screenshot({ path: `${OUT}/first-online-win-1280x800.png` });
  await big.context.close();

  // ---- 3. iOS face: Share -> Add to Home Screen, never a dead native button -------------------
  const iosMatch = await duel.newMatch();
  const ios = await openSeat(duel, iosMatch, 0, {
    viewport: { width: 390, height: 844 },
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  });
  // Wait until the app has booted (the invitation module is mounted), then ask for it.
  await ios.page.waitForFunction(
    () => (window as unknown as { __severgrow?: { ready?: () => boolean } }).__severgrow?.ready?.() === true,
    { timeout: 40_000 },
  );
  await ios.page.evaluate(() => (window as unknown as { __severgrow?: { showInstall?: () => void } }).__severgrow?.showInstall?.());
  await ios.page.waitForSelector(PROMPT, { timeout: 10_000 });
  check(await ios.page.locator('#install-steps').isVisible(), 'iOS: the two-step instruction is shown');
  const stepText = (await ios.page.locator('#install-steps').innerText()).toLowerCase();
  check(stepText.includes('share') && stepText.includes('add to home screen'), 'iOS: it names Share and Add to Home Screen');
  check((await ios.page.locator('#install-accept').innerText()).trim().length > 0, 'iOS: the primary control does something real (it is not a dead install button)');
  await ios.page.screenshot({ path: `${OUT}/ios-instructions-390x844.png` });
  await ios.context.close();

  // ---- 4. the menu has no install button (both sizes) ----------------------------------------
  for (const [w, h, tag] of [
    [390, 844, '390x844'],
    [1280, 800, '1280x800'],
  ] as const) {
    const context = await duel.browser.newContext({ viewport: { width: w, height: h }, hasTouch: w < 700, isMobile: w < 700 });
    await context.addInitScript(() => localStorage.clear());
    const page = await context.newPage();
    await page.goto(duel.origin, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#menu:not([hidden])', { timeout: 20_000 });
    check(await page.locator('#menu-install').count() === 0, `menu (${tag}): no install button`);
    check(await page.locator('#menu-install-hint').count() === 0, `menu (${tag}): no install hint`);
    await page.screenshot({ path: `${OUT}/menu-without-button-${tag}.png` });
    await context.close();
  }

  console.log(`install-prompt: ${checks} checks passed`);
} finally {
  await duel.close();
}
