// REOPENING A MATCH REPLAYS ONLY WHAT HAPPENED WHILE AWAY (owner report, 2026-10-27: "leaving the
// game, and coming back to it to see opp's move he did in the meantime, it behaved glitchy, showing
// more moves than the last one only and it kept on flashing").
//
// Cause: a match opened from the list fetched its WHOLE event history, and the page replays every
// event a payload carries — so the entire game replayed over the current board. Now each match
// remembers how far this device has seen it, and a reopen asks only for that gap.
//
// The suite plays a few turns through the API, opens seat 0 while seat 1 is to move, leaves to the
// menu, lets seat 1 play one turn, reopens from the list and checks the page received only seat 1's
// new turn, then that the board settles with the gate open.
//
//   npx tsx web/e2e/reopen-catchup.ts     (builds the 0.5 channel against a local server)
import type { Action } from '../../src/engine/index.js';
import { openDuel, openSeat, readOnline, sleep, startLocalDuel, waitIdle } from './helpers/local-duel.js';
import type { LocalDuel, LocalMatch } from './helpers/local-duel.js';

let failed = 0;
const check = (name: string, ok: boolean, note = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? `  (${note})` : ''}`);
};

/** One API step for whoever can act: a Grow when there is one (batched with EndAct), else Draw / EndAct / Discard. */
const step = async (duel: LocalDuel, match: LocalMatch): Promise<0 | 1 | null> => {
  const views = await Promise.all(([0, 1] as const).map((s) => duel.api.getState(match.guests[s].token, match.matchId).then((r) => r.player)));
  const found = views.findIndex((v) => v.legalActions.length > 0);
  if (found < 0) return null;
  const seat = found as 0 | 1;
  const view = views[seat]!;
  const legal = view.legalActions;
  const grow = legal.find((a) => a.t === 'Sprout');
  const next = grow ?? legal.find((a) => a.t === 'Draw') ?? legal.find((a) => a.t === 'EndAct') ?? legal.find((a) => a.t === 'Discard');
  if (!next) return null;
  const actions: Action[] = grow ? [grow, { t: 'EndAct' }] : [next];
  await duel.api.submitAction(match.guests[seat].token, match.matchId, {
    expectedRevision: view.revision,
    requestId: `reopen-${Date.now()}-${Math.round(Math.random() * 1e6)}`,
    actions,
  });
  return seat;
};
/** Steps until seat `who` must act. */
const until = async (duel: LocalDuel, match: LocalMatch, who: 0 | 1) => {
  for (let i = 0; i < 60; i++) {
    const v = (await duel.api.getState(match.guests[who].token, match.matchId)).player;
    if (v.legalActions.length > 0) return;
    await step(duel, match);
  }
};

const duel = await startLocalDuel({ port: Number(process.env.REOPEN_PORT ?? 5281), turnTimeoutMs: 24 * 3_600_000 });
try {
  const match = await duel.newMatch();
  // some history: a few full turns each
  for (let i = 0; i < 14; i++) await step(duel, match);
  await until(duel, match, 1); // seat 1 to move: seat 0 opens while waiting
  const seat0 = await openSeat(duel, match, 0, { speed: 'normal' });
  const views: { url: string; events: number }[] = [];
  seat0.page.on('response', async (res) => {
    if (!/\/v1\/matches\/[^/]+\/view/.test(res.url())) return;
    try {
      const body = (await res.json()) as { player?: { events?: unknown[] } };
      views.push({ url: res.url(), events: body.player?.events?.length ?? -1 });
    } catch {
      /* not JSON */
    }
  });
  await openDuel(seat0, match.matchId);
  await waitIdle(seat0, 30_000);
  await sleep(1500);
  const seenBefore = (await duel.api.getState(match.guests[0].token, match.matchId)).player.revision;
  const total = (await duel.api.getState(match.guests[0].token, match.matchId)).player.events.length;

  // leave to the menu
  await seat0.page.evaluate(() => document.getElementById('hud-menu')?.click());
  await seat0.page.waitForSelector('#gm-main', { state: 'visible', timeout: 10_000 });
  await seat0.page.click('#gm-main');
  await seat0.page.waitForSelector('#game', { state: 'hidden', timeout: 10_000 });

  // the opponent plays one whole turn while seat 0 is away
  await until(duel, match, 1);
  for (let i = 0; i < 8; i++) {
    const v = (await duel.api.getState(match.guests[1].token, match.matchId)).player;
    if (v.legalActions.length === 0) break;
    await step(duel, match);
  }
  const gap = (await duel.api.getState(match.guests[0].token, match.matchId, seenBefore)).player.events.length;
  check('the opponent played a turn while away', gap > 0, `${gap} events`);

  // reopen from the list
  views.length = 0;
  await openDuel(seat0, match.matchId);
  await sleep(300);
  const first = views[0];
  check('the reopen asks only for the gap since this device last looked', !!first && first.url.includes(`since=${seenBefore}`), first?.url ?? 'no view request');
  check('it receives exactly the turn played while away, not the whole game', !!first && first.events === gap && gap < total, `${first?.events} of ${total}`);
  const settled = await waitIdle(seat0, 40_000);
  const online = await readOnline(seat0);
  check('the replay ends and the board is the player\'s again', settled && !!online && !online.revealing, JSON.stringify(online));
  await seat0.page.screenshot({ path: `${process.env.SHOTS ?? '/tmp'}/reopen-catchup-390x844.png` });
  await seat0.context.close();
} finally {
  await duel.close();
}
if (failed) {
  console.log(`${failed} reopen-catchup checks failed`);
  process.exit(1);
}
console.log('reopen-catchup checks passed');
process.exit(0);
