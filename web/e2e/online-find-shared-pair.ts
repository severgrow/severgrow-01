// FIND OPPONENT ON TWO DEVICES THAT ALREADY SHARE A GAME (owner, 2026-11-11: "find an opponent pressed
// on 2 devices does not connect"). One game per pair: the second searcher goes into their existing
// game, and the first device — whose search the server ended — opens that same game. No second game.
// Run: node --import tsx web/e2e/online-find-shared-pair.ts
import assert from 'node:assert/strict';
import { startLocalDuel, openSeat } from './helpers/local-duel.js';
import { openMenuEntry } from './helpers/menu-nav.js';
import type { Page } from 'playwright-core';

const duel = await startLocalDuel({ port: 4336 });
try {
  const match = await duel.newMatch(); // A and B already share this open game
  const errors: string[] = [];
  const toHub = async (seat: 0 | 1): Promise<Page> => {
    const s = await openSeat(duel, match, seat, { viewport: { width: 390, height: 844 }, isMobile: true });
    s.page.on('pageerror', (e) => errors.push(String(e)));
    await s.page.evaluate('window.__name = f => f;');
    await openMenuEntry(s.page, 'menu-online', { timeout: 40_000 });
    await s.page.waitForSelector('#online-hub:not([hidden])', { timeout: 25_000 });
    if (await s.page.locator('#online-first-ok').isVisible().catch(() => false)) await s.page.click('#online-first-ok');
    return s.page;
  };
  const a = await toHub(0);
  const b = await toHub(1);
  await a.click('#online-find');
  await a.waitForSelector('#online-waiting:not([hidden])', { timeout: 15_000 });
  console.log('A is searching');
  await a.waitForTimeout(1_500);
  const t0 = Date.now();
  await b.click('#online-find');
  await b.waitForSelector('#game:not([hidden])', { timeout: 15_000 });
  console.log(`B went into the shared game (${Date.now() - t0} ms)`);
  await a.waitForSelector('#game:not([hidden])', { timeout: 15_000 });
  console.log(`A followed into it (${Date.now() - t0} ms)`);
  assert(Date.now() - t0 < 10_000, 'both are in the game within 10 s');
  const open = (await duel.api.listMatches(match.guests[0].token)).matches.filter((m) => m.status !== 'finished');
  assert.deepEqual(open.map((m) => m.matchId), [match.matchId], 'still exactly one open game between them: the shared one');
  assert.deepEqual(errors, [], 'no page errors');
  console.log('PASS find opponent with a shared game');
} finally { await duel.close(); }
