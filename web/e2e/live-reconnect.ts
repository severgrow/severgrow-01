// FUTASAKU — the real-time RECONNECT ladder, in two real browsers against a local live API.
//
//   npx tsx web/e2e/live-reconnect.ts
//
// The owner's rules (2026-10-14), all in real-time mode only:
//   * the first drop EXTENDS the turn clock (it does not burn the turn) and the OPPONENT sees
//     "Opponent reconnecting" with an animated ellipsis in the header strip;
//   * still gone at the end of the grace → that ONE turn is auto-played (the existing autoplayer)
//     and the match continues;
//   * the next turn gets a shorter grace, and then the disconnected player LOSES (`timeout`) — the
//     connected player must reach the end screen promptly, not sit on the board;
//   * nothing here is triggered by closing a tab: only the SERVER clock ends a duel.
//
// A dropped connection is simulated the honest way: the browser context goes OFFLINE, so its
// heartbeat never reaches the server and its presence goes stale exactly as a lost phone's would.
// The remaining player is driven through the real API for their own turns.
import { mkdirSync } from 'node:fs';
import type { Action, Player } from '../../src/engine/index.js';
import type { LocalDuel, SeatSession } from './helpers/local-duel.js';
import { openDuel, openSeat, sleep, startLocalDuel } from './helpers/local-duel.js';

const OUT = new URL('../../docs/screens/live/', import.meta.url).pathname;
const PORT = Number(process.env.PREVIEW_PORT ?? 4237);
const SHOTS = process.env.SHOTS === '1';

// Fast, deterministic numbers (the production defaults are 60 s / 10 s / 5 s / 60 s).
const TURN_MS = 5_000;
const ENTRY_MS = 2_000;
const REPLAY_MS = 1_000;
const STALE_MS = 2_000;
const GRACE_MS = 1_500;
const SHORT_MS = 1_000;

let failed = 0;
const check = (name: string, ok: boolean, note = ''): void => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? `  (${note})` : ''}`);
};

const waitFor = async (cond: () => Promise<boolean> | boolean, timeout = 25_000): Promise<boolean> => {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      if (await cond()) return true;
    } catch {
      /* the page may be mid-navigation */
    }
    await sleep(120);
  }
  return false;
};

type LiveDebug = { status: null | { live: boolean; matchId: string; actor: 0 | 1; mySeat: 0 | 1; endedReason: string | null }; popup: boolean };
const dbg = (s: SeatSession): Promise<LiveDebug | null> =>
  s.page.evaluate(() => (window as unknown as { __futasakuLive?: () => unknown }).__futasakuLive?.() ?? null).catch(() => null) as Promise<LiveDebug | null>;
const vis = (s: SeatSession, sel: string) => s.page.locator(sel).first().isVisible().catch(() => false);
const textOf = (s: SeatSession, sel: string) => s.page.locator(sel).first().textContent().then((t) => (t ?? '').trim()).catch(() => '');

const duel: LocalDuel = await startLocalDuel({
  port: PORT,
  liveConfig: {
    turnMs: TURN_MS,
    entryAllowanceMs: ENTRY_MS,
    replayAllowanceMs: REPLAY_MS,
    presenceStaleMs: STALE_MS,
    reconnectGraceMs: GRACE_MS,
    reconnectShortMs: SHORT_MS,
    challengeTtlMs: 10_000,
  },
});
mkdirSync(OUT, { recursive: true });

let a: SeatSession | null = null;
let b: SeatSession | null = null;
try {
  const m = await duel.newMatch();
  console.log(`match ${m.matchId}`);
  const seatA = await openSeat(duel, m, 0, { reduceMotion: false });
  const seatB = await openSeat(duel, m, 1, { reduceMotion: false });
  a = seatA;
  b = seatB;
  await openDuel(seatA, m.matchId);
  await openDuel(seatB, m.matchId);

  // ---- go live through the real controls ----
  const ready = await waitFor(async () => (await seatA.page.locator('[data-live="pill"]').getAttribute('data-state')) === 'ready', 25_000);
  check('the real-time pill is ready', ready);
  await seatA.page.locator('[data-live="pill"]').click();
  check('the challenge reaches the other device', await waitFor(() => vis(seatB, '[data-mode="challenge"]'), 15_000));
  await seatB.page.locator('[data-live="accept"]').click();
  check('both devices are live', await waitFor(async () => !!(await dbg(seatA))?.status?.live && !!(await dbg(seatB))?.status?.live, 20_000));

  const st = (await dbg(seatA))!.status!;
  const gone = st.actor === st.mySeat ? seatA : seatB;
  const here = gone === seatA ? seatB : seatA;

  // ---- the dropped player's connection goes away for real ----
  await gone.context.setOffline(true);
  console.log('    the disconnected device is offline (its heartbeat cannot reach the server)');

  // The remaining player must be TOLD, in the header strip, before anything else happens.
  const noticed = await waitFor(() => vis(here, '[data-live="reconnect"]'), 25_000);
  check('the opponent sees the reconnecting state in the strip', noticed);
  if (noticed) {
    check('the strip says "Opponent reconnecting"', (await textOf(here, '[data-live="reconnect"]')).startsWith('Opponent reconnecting'));
    check('the reconnecting state carries the SHARED animated dots', (await here.page.locator('[data-live="reconnect"] .futasaku-wait-dots i').count()) === 3);
    if (SHOTS) await here.page.screenshot({ path: `${OUT}reconnect-notice.png` });
  }

  // ---- the grace ends → that ONE turn is auto-played and the match CONTINUES ----
  const autoPlayed = await waitFor(async () => {
    const s = (await dbg(here))?.status;
    return !!s && s.live && s.actor === s.mySeat; // the turn came back to the present player
  }, 30_000);
  check('the missed turn is auto-played and the match continues', autoPlayed);
  const afterAuto = await duel.api.getState(m.guests[here.seat].token, m.matchId);
  check('the server still has an ACTIVE match', afterAuto.player.status === 'active', afterAuto.player.status);
  check('the auto-played turn is on the board (a draw happened)', afterAuto.player.events.some((e) => e.t === 'Draw') || afterAuto.player.view.turnNumber > 1);

  // ---- the present player plays a real turn, so the absent player is on the clock again ----
  const seatOf = (p: Player): SeatSession => (here.seat === p ? here : gone);
  const myTurnNow = afterAuto.player.view.actor;
  check('it is the present player’s turn', seatOf(myTurnNow) === here);
  for (let i = 0; i < 8; i++) {
    const v = await duel.api.getState(m.guests[here.seat].token, m.matchId);
    if (v.player.status !== 'active' || v.player.view.actor !== v.player.seat || v.player.legalActions.length === 0) break;
    const action = v.player.legalActions[0] as Action;
    await duel.api.submitAction(m.guests[here.seat].token, m.matchId, {
      expectedRevision: v.player.revision,
      requestId: `e2e-reconnect-${i}`,
      action,
    });
    const after = await duel.api.getState(m.guests[here.seat].token, m.matchId);
    if (after.player.view.actor !== after.player.seat) break;
  }

  // ---- the absent player's short grace runs out → they LOSE, and the winner is told promptly ----
  const finished = await waitFor(async () => {
    const s = (await dbg(here))?.status;
    return !!s && s.endedReason === 'finished';
  }, 40_000);
  check('the disconnected player loses when the ladder runs out', finished, JSON.stringify((await dbg(here))?.status ?? null));
  const final = await duel.api.getState(m.guests[here.seat].token, m.matchId);
  const loserSeat: Player = gone.seat;
  check('the server finished the match', final.player.status === 'finished', final.player.status);
  check('the reason is the existing `timeout`', final.player.result?.reason === 'timeout', String(final.player.result?.reason));
  check('the LOSER is the disconnected player', final.player.result?.winner === (loserSeat === 0 ? 1 : 0), JSON.stringify(final.player.result ?? null));
  check('the winner reaches the end screen promptly', await waitFor(() => vis(here, '[data-live="end"]'), 20_000));
  if (SHOTS) await here.page.screenshot({ path: `${OUT}reconnect-loss-end.png` });
} finally {
  for (const s of [a, b]) {
    if (!s) continue;
    await s.context.setOffline(false).catch(() => undefined);
    await s.context.close().catch(() => undefined);
  }
  await duel.close();
}

if (failed) {
  console.error(`\n${failed} real-time reconnect checks failed`);
  process.exit(1);
}
console.log('\nThe reconnect ladder, the auto-played turn and the timeout loss all hold in real browsers.');
