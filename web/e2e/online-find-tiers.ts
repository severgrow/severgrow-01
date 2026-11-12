// FIND OPPONENT IN TIERS, IN A REAL BROWSER (owner, 2026-11-12). Someone opened a game and left (no
// heartbeat). A new searcher first looks only for players here right now, so for the first seconds it
// says so and does NOT join the away player's game; after the live window its own heartbeat joins
// that game and the page opens the duel.
// Run: node --import tsx web/e2e/online-find-tiers.ts
import assert from 'node:assert/strict';
import { sleep, startLocalDuel, openSeat } from './helpers/local-duel.js';
import { openMenuEntry } from './helpers/menu-nav.js';
import { ONLINE } from '../../src/strings.js';

const duel = await startLocalDuel({ port: 4338 });
try {
  const match = await duel.newMatch();
  // C opens a game and goes away: no page, so no heartbeat. Wait until C is no longer "present".
  const away = await duel.api.createGuest();
  const parked = await duel.api.findOpponent(away.token);
  assert.equal(parked.paired, false, 'the away player parked an open game');
  await sleep(11_000);

  const errors: string[] = [];
  const s = await openSeat(duel, match, 0, { viewport: { width: 390, height: 844 }, isMobile: true });
  s.page.on('pageerror', (e) => errors.push(String(e)));
  await s.page.evaluate('window.__name = f => f;');
  await openMenuEntry(s.page, 'menu-online', { timeout: 40_000 });
  await s.page.waitForSelector('#online-hub:not([hidden])', { timeout: 25_000 });
  if (await s.page.locator('#online-first-ok').isVisible().catch(() => false)) await s.page.click('#online-first-ok');
  const t0 = Date.now();
  await s.page.click('#online-find');
  await s.page.waitForSelector('#online-waiting:not([hidden])', { timeout: 15_000 });
  const body = await s.page.textContent('#online-waiting-body');
  console.log(`searching: "${body}"`);
  assert.equal(body, ONLINE.searchLiveBody, 'the first seconds say it looks for players online right now');
  await sleep(3_000);
  assert(await s.page.locator('#game').isHidden(), 'the away player\'s game is not joined in the live window');
  await s.page.waitForSelector('#game:not([hidden])', { timeout: 20_000 });
  const took = Date.now() - t0;
  console.log(`joined the open game after ${took} ms`);
  assert(took >= 7_000, 'not before the live window ended');
  const mine = (await duel.api.listMatches(match.guests[0].token)).matches.filter((m) => m.status === 'active').map((m) => m.matchId);
  assert(mine.includes(parked.match.matchId), 'the page is seated in the away player\'s game');
  assert.deepEqual(errors, [], 'no page errors');
  console.log('PASS find opponent tiers');
} finally { await duel.close(); }
