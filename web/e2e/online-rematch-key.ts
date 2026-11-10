// The Rematch key on a finished game in Your matches (owner, 2026-11-09: "make a button next to
// finished online matches to challenge this player again"). One player presses it, the other sees
// "Wants a rematch" with a gold key, presses it, and BOTH are in the new game.
// Run: node --import tsx web/e2e/online-rematch-key.ts
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import type { Page } from 'playwright-core';
import { startLocalDuel, openSeat } from './helpers/local-duel.js';
import { openMenuEntry } from './helpers/menu-nav.js';

const out = process.env.SHOTS ?? '/tmp/online-rematch-key';
mkdirSync(out, { recursive: true });
const duel = await startLocalDuel({ port: 4333 });
try {
  const match = await duel.newMatch();
  await duel.api.resign(match.guests[1].token, match.matchId);
  const errors: string[] = [];
  const openHub = async (seat: 0 | 1): Promise<Page> => {
    const s = await openSeat(duel, match, seat, { viewport: { width: 390, height: 844 }, isMobile: true });
    s.page.on('pageerror', (e) => errors.push(String(e)));
    await s.page.evaluate('window.__name = f => f;');
    await openMenuEntry(s.page, 'menu-online', { timeout: 40_000 });
    await s.page.waitForSelector('#online-hub:not([hidden])', { timeout: 25_000 });
    if (await s.page.locator('#online-first-ok').isVisible().catch(() => false)) await s.page.click('#online-first-ok');
    if (await s.page.locator('#online-matches-panel').isHidden().catch(() => false)) await s.page.click('#online-matches-toggle');
    return s.page;
  };
  const row = (page: Page) => page.locator(`#online-matches li[data-match-id="${match.matchId}"]`);

  // 1. Seat 0 presses the key on the finished game: it waits for the other player (and does not open the replay).
  const a = await openHub(0);
  const keyA = row(a).locator('.online-row-rematch');
  await keyA.waitFor({ state: 'visible', timeout: 25_000 });
  await a.waitForTimeout(600); // the list's entrance settles
  const box = (await keyA.boundingBox())!;
  console.log(`key ${box.width}x${box.height}`);
  assert(box.width >= 44 && box.height >= 44, 'the Rematch key is a 44px target');
  await keyA.click();
  const firstPress = await duel.api.listMatches(match.guests[0].token);
  const pending = firstPress.matches.find((m) => m.matchId === match.matchId);
  assert.equal(pending?.rematch, 'mine', 'the first press is waiting on the other player');
  console.log('seat 0 pressed Rematch: waiting for seat 1');

  // 2. Seat 1 sees "Wants a rematch" with the gold key, presses it, and lands in the new game.
  const b = await openHub(1);
  const keyB = row(b).locator('.online-row-rematch.is-theirs');
  await keyB.waitFor({ state: 'visible', timeout: 25_000 });
  assert.match(await row(b).innerText(), /Wants a rematch/);
  await b.screenshot({ path: `${out}/wants-a-rematch.png` });
  await keyB.click();
  await b.waitForSelector('#game:not([hidden])', { timeout: 25_000 });
  console.log('seat 1 accepted: in the new game');

  // 3. Both players share exactly one open game: the new one.
  const open = (await duel.api.listMatches(match.guests[0].token)).matches.filter((m) => m.status !== 'finished');
  assert.equal(open.length, 1, 'one open game between the pair');
  assert.notEqual(open[0]!.matchId, match.matchId);
  assert.deepEqual(errors, [], 'no page errors');
  console.log('PASS rematch key');
} finally { await duel.close(); }
