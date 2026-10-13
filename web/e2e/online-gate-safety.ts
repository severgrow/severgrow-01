// FUTASAKU 0.5 — the input gate can NEVER stay shut forever, and the enemy-turn word can never
// contradict the server. Two deterministic proofs over a local duel API (real page + real engine).
//
//   npx tsx web/e2e/online-gate-safety.ts
//
// 1. STUCK-GATE SAFETY. A step that never settles (an injected, permanently-pending animation) is
//    exactly the class of failure the owner hit as "Opponent's turn" for ~20 seconds. The gate's
//    absolute budget must release it: the queue is flushed to the TRUE final board, the gate opens,
//    and it is logged. The board is then compared with the API's own view, never the page's copy.
// 2. THE TURN WORD. While the enemy turn replays, the phone reads "Replaying their turn" — never
//    "Opponent's turn". Sampled at 25ms on BOTH seats, so the two-phone confusion cannot come back.
import { mkdirSync } from 'node:fs';
import { onlinePerspective } from '../src/online/perspective.js';
import {
  type LocalDuel,
  type LocalMatch,
  type SeatSession,
  drawnTiles,
  openDuel,
  openSeat,
  readOnline,
  sleep,
  startLocalDuel,
  waitingFlag,
} from './helpers/local-duel.js';

const OUT = new URL('../../docs/screens/online/', import.meta.url).pathname;
const PORT = Number(process.env.PREVIEW_PORT ?? 4247);
mkdirSync(OUT, { recursive: true });

const YOUR_TURN = 'Your turn';
const THEIR_TURN = "Opponent's turn";
const REPLAYING = 'Replaying their turn';

let failed = 0;
const check = (name: string, ok: boolean, note = ''): void => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? `  (${note})` : ''}`);
};

type Action = { t: string; [k: string]: unknown };

const SAMPLER = `(() => {
  if (window.__gateTimer) clearInterval(window.__gateTimer);
  window.__gate = [];
  window.__gateTimer = setInterval(function () {
    var hook = window.__severgrow || {};
    var o = hook.online ? hook.online() : null;
    var el = document.querySelector('[data-duel-turn]');
    window.__gate.push({
      t: performance.now(),
      wall: Date.now(),
      word: el ? (el.textContent || '').trim() : '',
      revealing: !!(o && o.revealing),
      myTurn: !!(o && o.myTurn),
      serverTurn: o ? o.serverTurn : null,
      queued: o ? o.queued : -1,
      pumping: !!(o && o.pumping),
      watchdog: !!(o && o.watchdog),
      drawn: Array.prototype.map.call(document.querySelectorAll('.l-tiles .tile[data-key]'), function (e) { return e.dataset.key; }).sort().join(',')
    });
  }, 25);
})()`;

type Sample = { t: number; wall: number; word: string; revealing: boolean; myTurn: boolean; serverTurn: string | null; queued: number; pumping: boolean; watchdog: boolean; drawn: string };

const samples = (s: SeatSession): Promise<Sample[]> => s.page.evaluate('window.__gate').then((v) => (v as Sample[]) ?? []);
const install = (s: SeatSession): Promise<void> => s.page.evaluate(SAMPLER).then(() => undefined);

/** Authoritative board for a seat, straight from the API, in that seat's screen keys. */
const serverBoard = async (duel: LocalDuel, match: LocalMatch, seat: 0 | 1): Promise<string> => {
  const view = (await duel.api.getState(match.guests[seat].token, match.matchId)).player;
  const p = onlinePerspective(seat);
  return Object.entries(view.view.board as Record<string, unknown>)
    .filter(([, tile]) => !!tile)
    .map(([key]) => p.mapKey(key))
    .sort()
    .join(',');
};

/** One whole growing turn for the seat whose turn it is, through the server. */
const playTurn = async (duel: LocalDuel, match: LocalMatch, seat: 0 | 1): Promise<{ grew: number }> => {
  const token = match.guests[seat].token;
  let grew = 0;
  for (let step = 0; step < 14; step++) {
    const v = (await duel.api.getState(token, match.matchId)).player;
    if (v.status !== 'active' || v.actor !== v.seat) break;
    const legal = v.legalActions ?? [];
    const bloom = (legal as Action[])
      .filter((a) => a.t === 'Bloom')
      .sort((x, y) => ((y.hexes as unknown[] | undefined)?.length ?? 0) - ((x.hexes as unknown[] | undefined)?.length ?? 0))[0];
    const pick =
      bloom ??
      (legal as Action[]).find((a) => a.t === 'Sprout') ??
      (legal as Action[]).find((a) => a.t === 'Draw') ??
      (legal as Action[]).find((a) => a.t === 'EndAct') ??
      (legal as Action[]).find((a) => a.t === 'Discard');
    if (!pick) break;
    if (bloom) grew = (bloom.hexes as unknown[] | undefined)?.length ?? 1;
    await duel.api.submitAction(token, match.matchId, {
      expectedRevision: v.revision,
      requestId: `g-${Date.now()}-${Math.random()}`,
      action: pick as never,
    });
  }
  return { grew };
};

const waitMyTurn = async (s: SeatSession, timeout = 40_000): Promise<boolean> => {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await waitingFlag(s)) return true;
    await sleep(100);
  }
  return false;
};

const duel = await startLocalDuel({ port: PORT });
try {
  const match = await duel.newMatch();
  const starter = match.starterSeat;
  const watcherSeat: 0 | 1 = starter === 0 ? 1 : 0;
  const actorSeat: 0 | 1 = starter;

  const watcher = await openSeat(duel, match, watcherSeat, {});
  const actor = await openSeat(duel, match, actorSeat, {});
  try {
    await openDuel(actor, match.matchId);
    await openDuel(watcher, match.matchId);
    await install(watcher);
    await install(actor);
    check('the actor holds the turn', await waitMyTurn(actor, 40_000));

    // ---- 1. THE INJECTED STALL: the next pump step never resolves ----------------------------
    const before = (await drawnTiles(watcher)).join(',');
    await watcher.page.evaluate('window.__severgrow.injectStall()');
    const injectAt = Date.now();
    const played = await playTurn(duel, match, actorSeat);
    console.log(`    the actor played a growing turn (grew ${played.grew}); the watcher's next step is frozen`);

    // Wait for the gate to open by itself (the absolute budget: replay length + 3s, plus margin).
    const released = await waitMyTurn(watcher, 30_000);
    const releasedAfter = Date.now() - injectAt;
    await sleep(300);
    // Unblock the orphaned promise so the page can finish cleanly.
    await watcher.page.evaluate('window.__severgrow.releaseStall()');
    await sleep(200);

    const captured = await samples(watcher);
    const log = (await watcher.page.evaluate('window.__severgrow.animLog()')) as { ev: string; [k: string]: unknown }[];
    const authoritative = await serverBoard(duel, match, watcherSeat);
    const finalDrawn = (await drawnTiles(watcher)).join(',');
    const after = await readOnline(watcher);

    check('the injected stall did NOT freeze the gate (it released)', released, `released after ${releasedAfter}ms`);
    check('the gate released within the budget (replay length + 3s, generous ceiling 20s)', releasedAfter < 20_000, `${releasedAfter}ms`);
    check('the release was logged loudly', log.some((m) => m.ev === 'watch:release'), JSON.stringify(log.filter((m) => m.ev.startsWith('watch:')).slice(-3)));
    check('input opened only on the TRUE final board', finalDrawn === authoritative, `${finalDrawn} vs ${authoritative}`);
    check('the board is no longer the pre-turn board', finalDrawn !== before, `${before} -> ${finalDrawn}`);
    check('nothing is left queued or pumping', !!after && after.queued === 0 && !(after as unknown as { pumping?: boolean }).pumping, JSON.stringify(after));
    check('my turn is open and the gate is shut', !!after && after.myTurn === true && after.revealing === false, JSON.stringify(after));

    // ---- 2. THE TURN WORD, on BOTH seats, at every sample ------------------------------------
    const wordsOn = (s: Sample[]) => s.filter((x) => x.revealing).map((x) => x.word);
    const watcherReplayWords = [...new Set(wordsOn(captured))];
    check(
      'while replaying, the watcher reads "Replaying their turn"',
      watcherReplayWords.length > 0 && watcherReplayWords.every((w) => w === REPLAYING),
      JSON.stringify(watcherReplayWords),
    );
    check(
      'the watcher NEVER reads "Opponent\'s turn" while the enemy turn replays',
      !captured.some((x) => x.revealing && x.word === THEIR_TURN),
      `${captured.filter((x) => x.revealing && x.word === THEIR_TURN).length} sample(s)`,
    );
    check(
      'the watcher NEVER reads "Opponent\'s turn" when the server says it is its turn',
      !captured.some((x) => x.serverTurn === 'mine' && !x.revealing && x.word === THEIR_TURN),
      `${captured.filter((x) => x.serverTurn === 'mine' && !x.revealing && x.word === THEIR_TURN).length} sample(s)`,
    );
    check(
      'once the replay drains, the watcher reads "Your turn" before it can act',
      captured.some((x) => x.myTurn && x.word === YOUR_TURN),
      `open samples with "Your turn": ${captured.filter((x) => x.myTurn && x.word === YOUR_TURN).length}`,
    );

    // The TWO-SCREEN rule, checked across pages on the shared wall clock: at no sampled instant do
    // both phones read "Opponent's turn" while either phone is replaying. (The legit window where
    // both read it and NEITHER is replaying — the throw has just landed, this phone is still on its
    // previous view — is allowed; the bug was the replaying phone reading it for the whole replay.)
    const actorSamples = await samples(actor);
    const near = (list: Sample[], wall: number) => list.find((s) => Math.abs(s.wall - wall) <= 60);
    let bothWrong = 0;
    for (const w of captured) {
      if (w.word !== THEIR_TURN) continue;
      const a = near(actorSamples, w.wall);
      if (!a || a.word !== THEIR_TURN) continue;
      if (w.revealing || a.revealing) bothWrong++;
    }
    check('the two phones never both read "Opponent\'s turn" while a replay is running', bothWrong === 0, `${bothWrong} instant(s)`);

    await watcher.page.screenshot({ path: `${OUT}gate-safety-release.png` }).catch(() => undefined);
  } finally {
    await watcher.context.close();
    await actor.context.close();
  }
} finally {
  await duel.close();
}

if (failed) {
  console.error(`\n${failed} gate-safety check(s) failed`);
  process.exit(1);
}
console.log('\nGate safety: a hung replay always releases on the true board, and the turn word never lies.');
