// FUTASAKU — the LOSER's real network path must show the end screen, in NORMAL online play.
//
//   npx tsx web/e2e/online-finish-loser-network.ts
//
// The owner, after the build before this one: "i was testing without 'go live' option and after KO
// win on 1 device, the other device still didint show end of game screen after opp device had its
// end of game screen after a KO win."
//
// Why `online-finish-both-devices.ts` passed while the real product failed:
//   * it drove EVERY move from the Node side (`duel.api.submitAction`), so neither page ever played
//     a turn. A real device plays its own moves through its own UI, and the game's LAST move is
//     played by the winner's page — the loser's page is a pure network observer, and at the moment
//     the finish lands it is usually already mid-reveal for the turn whose start it can see.
//   * it asserted the end screen only, never that the loser's page was in the state a real loser is
//     in (myTurn false on the server while its own session still believes it is waiting).
//
// This suite plays every turn THROUGH THE PAGES with real gestures (tap the deck, pick the card,
// tap the tile, throw), so the winning knockout is committed by the winner's own client and the
// loser learns about it only over the wire. Both devices must reach the end screen promptly, one as
// winner and one as loser.
import { mkdirSync } from 'node:fs';
import type { Action, Coord, Player } from '../../src/engine/index.js';
import { allNeighbors, coordKey, hexDistance, parseKey } from '../../src/engine/index.js';
import type { LocalDuel, SeatSession } from './helpers/local-duel.js';
import { endTurnViaPage, hexCentre, openDuel, openSeat, readOnline, sleep, startLocalDuel, touchTap } from './helpers/local-duel.js';
import { FINISH_DEBUG_SCRIPT, FINISH_STATE_SCRIPT } from './helpers/finish-debug.js';
import type { FinishLog } from './helpers/finish-debug.js';

const OUT = new URL('../../docs/screens/online/', import.meta.url).pathname;
const PORT = Number(process.env.PREVIEW_PORT ?? 4236);
/** A decision must reach BOTH devices well inside a turn deadline. */
const MAX_SKEW_MS = Number(process.env.MAX_SKEW_MS ?? 8_000);
const ROUNDS = Number(process.env.ROUNDS ?? 40);
mkdirSync(OUT, { recursive: true });

let failed = 0;
const check = (name: string, ok: boolean, note = ''): void => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? `  (${note})` : ''}`);
};

const ev = <T>(s: SeatSession, js: string): Promise<T> => s.page.evaluate(js) as Promise<T>;
const installDebug = (s: SeatSession): Promise<unknown> => ev(s, FINISH_DEBUG_SCRIPT);
const readDebug = (s: SeatSession): Promise<FinishLog[]> => ev(s, `(() => window.__finishDebug || [])()`);
const readState = (s: SeatSession): Promise<Record<string, unknown>> => ev(s, FINISH_STATE_SCRIPT);
const phase = (s: SeatSession): Promise<string> => ev(s, `(() => (window.__severgrow.state() || {}).phase || '')()`);
const legal = (s: SeatSession): Promise<Action[]> => ev(s, `(() => window.__severgrow.legal())()`);

type Tap = { x: number; y: number };
const centreOf = (s: SeatSession, selector: string): Promise<Tap | null> =>
  ev(
    s,
    `(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return null;
      const r = el.getBoundingClientRect();
      for (const yf of [0.5, 0.32, 0.68]) for (const xf of [0.5, 0.3, 0.7]) {
        const x = r.left + r.width * xf, y = r.top + r.height * yf;
        const hit = document.elementFromPoint(x, y);
        if (hit && (hit === el || el.contains(hit))) return { x, y };
      }
      return null;
    })()`,
  );

const tapSelector = async (s: SeatSession, selector: string): Promise<boolean> => {
  const p = await centreOf(s, selector);
  if (!p) return false;
  await touchTap(s, p);
  return true;
};

/** The opponent's home, as THIS seat draws it (homeEls[0] is mine, [1] is theirs). */
const oppHomeKey = (s: SeatSession): Promise<string | null> =>
  ev(s, `(() => { const h = document.querySelectorAll('#board .l-homes [data-key]'); return h.length > 1 ? h[1].getAttribute('data-key') : null; })()`);

const waitFor = async (s: SeatSession, want: (st: NonNullable<Awaited<ReturnType<typeof readOnline>>>) => boolean, timeout: number): Promise<boolean> => {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const st = await readOnline(s);
    if (st && want(st)) return true;
    if (st?.finished) return false;
    await sleep(120);
  }
  return false;
};

const drawThroughPage = async (s: SeatSession): Promise<boolean> => {
  if (!(await waitFor(s, (st) => st.myTurn && !st.revealing, 40_000))) return false;
  for (let i = 0; i < 10; i++) {
    if ((await phase(s)) === 'ACT') return true;
    if (!(await tapSelector(s, '#deck'))) {
      await sleep(250);
      continue;
    }
    await sleep(320);
  }
  return (await phase(s)) === 'ACT';
};

const hexesOf = (a: Action): Coord[] => (a.t === 'Sprout' ? [a.coord] : a.t === 'Bloom' ? a.hexes : []);

/**
 * The Grow the winner plays, chosen in Node from the page's own legal list: claim as many of the
 * enemy root's six neighbours as possible, then get closer to it, then use the most tiles.
 */
const chooseAdvance = (candidates: Action[], rootKey: string): Action | null => {
  if (!candidates.length) return null;
  const root = parseKey(rootKey);
  const ring = new Set(allNeighbors(root).map(coordKey));
  return [...candidates]
    .map((a) => {
      const hexes = hexesOf(a);
      return { a, onRing: hexes.filter((c) => ring.has(coordKey(c))).length, d: Math.min(...hexes.map((c) => hexDistance(c, root))) };
    })
    .sort((x, y) => y.onRing - x.onRing || x.d - y.d || hexesOf(y.a).length - hexesOf(x.a).length)[0]!.a;
};

/** Perform ONE chosen Grow through the page (tap the card, tap the tile / paint the Bloom). */
const playGrowThroughPage = async (s: SeatSession, chosen: Action): Promise<void> => {
  if (chosen.t === 'Sprout') {
    await tapSelector(s, `#hand [data-card="${chosen.card}"]`);
    await sleep(260);
    if ((await phase(s)) === 'ACT') {
      const centre = await hexCentre(s, coordKey(chosen.coord));
      if (centre) {
        await touchTap(s, centre);
        await sleep(350);
      }
    }
    return;
  }
  if (chosen.t !== 'Bloom') return;
  const cards = [...chosen.cards].sort((x, y) => x - y);
  const kind = `bloom-${cards.length}-${cards.join('.')}`;
  await ev(s, `(() => window.__severgrow.pickKind(${JSON.stringify(kind)}))()`);
  await sleep(260);
  const want = chosen.hexes.map(coordKey);
  for (let step = 0; step <= cards.length + 1; step++) {
    const painted = await ev<string[]>(s, `(() => Array.prototype.map.call(document.querySelectorAll('#board .l-draw .draw-ghost[data-key]'), function (el) { return el.getAttribute('data-key'); }))()`);
    if (painted.length >= cards.length) return;
    const lit = await ev<string[]>(s, `(() => Array.prototype.map.call(document.querySelectorAll('#board .l-over [data-key]'), function (el) { return el.getAttribute('data-key'); }))()`);
    const next = want.find((k) => lit.includes(k) && !painted.includes(k)) ?? lit.find((k) => !painted.includes(k));
    if (!next) return;
    const centre = await hexCentre(s, next);
    if (!centre) return;
    await touchTap(s, centre);
    await sleep(220);
  }
};

const finishedAt = (s: SeatSession, timeout: number): Promise<number> =>
  s.page
    .waitForFunction('(() => { const g = document.getElementById("gameover"); return !!g && !g.hidden; })()', undefined, { timeout })
    .then(() => Date.now())
    .catch(() => Number.NaN);

const title = (s: SeatSession): Promise<string> =>
  ev<string>(s, `(() => { const el = document.getElementById('go-title'); return el ? (el.textContent || '').trim() : ''; })()`);
const reasonText = (s: SeatSession): Promise<string> =>
  ev<string>(s, `(() => { const el = document.getElementById('go-reason'); return el ? (el.textContent || '').trim() : ''; })()`);

const duel: LocalDuel = await startLocalDuel({ port: PORT });
try {
  const match = await duel.newMatch();
  console.log(`match ${match.matchId} starter=${match.starterSeat}`);
  const a = await openSeat(duel, match, 0, { hasTouch: true, isMobile: true });
  const b = await openSeat(duel, match, 1, { hasTouch: true, isMobile: true });
  const seats: [SeatSession, SeatSession] = [a, b];
  try {
    await openDuel(a, match.matchId);
    await openDuel(b, match.matchId);
    await installDebug(a);
    await installDebug(b);

    const shown: [number, number] = [Number.NaN, Number.NaN];
    const watch = seats.map((s, i) =>
      finishedAt(s, 300_000).then((at) => {
        shown[i] = at;
      }),
    );

    let ended = '';
    let winner: Player | null = null;
    let lastActor: Player | null = null;
    for (let round = 1; round <= ROUNDS; round++) {
      const views = await Promise.all(([0, 1] as const).map((x) => duel.api.getState(match.guests[x].token, match.matchId).then((r) => r.player)));
      const done = views.find((v) => v.status === 'finished' || v.view.phase === 'GAME_OVER');
      if (done) {
        ended = String(done.result?.reason ?? '');
        winner = done.result ? (done.result.winner as Player | null) : null;
        break;
      }
      if (views[0]!.status !== 'active') {
        await sleep(250);
        continue;
      }
      const actorSeat = views[0]!.view.actor;
      const session = seats[actorSeat];
      lastActor = actorSeat;
      if (!(await drawThroughPage(session))) {
        console.log(`    round ${round}: seat ${actorSeat} never reached its Draw step`);
        break;
      }
      const home = actorSeat === 0 ? await oppHomeKey(session) : null;
      const candidates = (await legal(session)).filter(
        (x): x is Extract<Action, { t: 'Sprout' | 'Bloom' }> => x.t === 'Sprout' || x.t === 'Bloom',
      );
      if (home) {
        const root = parseKey(home);
        const ring = new Set(allNeighbors(root).map(coordKey));
        const board = await ev<Record<string, { owner: number } | null>>(session, `(() => window.__severgrow.state().board)()`);
        const owned = [...ring].filter((k) => board[k]?.owner === 0).length;
        const chosen = chooseAdvance(candidates, home);
        console.log(`    round ${round}: seat ${actorSeat} holds ${owned}/${ring.size} of the enemy root ring; grow=${chosen ? chosen.t : 'none'}`);
        if (chosen) await playGrowThroughPage(session, chosen);
        // Give the page time to paint + (for a winning move) auto-commit the batch.
        await sleep(400);
      }
      // Keep going until the SERVER says the match is over — never the page's own draft phase,
      // which is GAME_OVER for a moment whenever a Grow ends the game (that is the fix under test).
      const landed = await ev<boolean>(session, `(() => window.__severgrow.canUndo())()`);
      if (!landed) console.log(`    round ${round}: seat ${actorSeat} placed no Grow (draft empty)`);
      const thrown = await endTurnViaPage(session);
      if (!thrown) {
        // Expected once the winning move has auto-committed and finished the match.
        console.log(`    round ${round}: seat ${actorSeat} could not throw its turn (match may be over)`);
      }
      await sleep(300);
    }
    await Promise.race([Promise.all(watch), sleep(90_000)]);
    await sleep(500);

    // The ending itself, read from the server: the loop above can exit as soon as a PAGE is over.
    if (!ended) {
      const finalViews = await Promise.all(([0, 1] as const).map((x) => duel.api.getState(match.guests[x].token, match.matchId).then((r) => r.player)));
      const done = finalViews.find((v) => v.status === 'finished' || v.view.phase === 'GAME_OVER');
      ended = String(done?.result?.reason ?? '');
      winner = done?.result ? (done.result.winner as Player | null) : winner;
    }

    // The decisive evidence: what the SERVER actually holds for each seat after the winner's screen
    // appeared. If the winning move never reached the server, both seats stay `active` forever.
    for (let i = 0; i < 6; i++) {
      const vs = await Promise.all(([0, 1] as const).map((x) => duel.api.getState(match.guests[x].token, match.matchId).then((r) => r.player)));
      const line = ([0, 1] as const)
        .map((x) => {
          const p = vs[x]!;
          return `seat${x}: status=${p.status} rev=${p.revision} turnStartRev=${p.turnStartRevision} phase=${p.view.phase} actor=${p.view.actor} result=${p.result ? p.result.reason : 'null'} events=${p.events.length}`;
        })
        .join(' | ');
      console.log(`      server[${i}] ${line}`);
      if (vs[0]!.status === 'finished') break;
      await sleep(2_000);
    }
    const winnerState = await readState(seats[0]);
    const winnerLog = (await readDebug(seats[0])).slice(-6);
    console.log(`      winner page: ${JSON.stringify(winnerState)}`);
    for (const entry of winnerLog) console.log(`      winner +${entry.t}ms ${entry.what} ${entry.detail ? JSON.stringify(entry.detail) : ''}`);

    const skew = Number.isFinite(shown[0]) && Number.isFinite(shown[1]) ? Math.abs(shown[0] - shown[1]) : Number.NaN;
    const titles: [string, string] = [await title(a), await title(b)];
    const reasons: [string, string] = [await reasonText(a), await reasonText(b)];
    const loserSeat: Player = winner === null ? (lastActor === 0 ? 1 : 0) : ((1 - winner) as Player);
    console.log(`      ending=${ended || 'none'} lastActor=${lastActor} winner=${winner} skew=${Number.isFinite(skew) ? Math.round(skew) : 'n/a'} ms`);
    console.log(`      titles=${JSON.stringify(titles)}`);
    console.log(`      reasons=${JSON.stringify(reasons.map((r) => r.slice(0, 70)))}`);
    console.log(`      loserSeat=${loserSeat}`);

    check('the match ended by knockout (strangle)', ended === 'strangle', ended || 'no ending reached');
    check(
      'BOTH devices reached the end screen',
      Number.isFinite(shown[0]) && Number.isFinite(shown[1]),
      `a=${Number.isFinite(shown[0]) ? 'yes' : 'NO'} b=${Number.isFinite(shown[1]) ? 'yes' : 'NO'}`,
    );
    check('one device reads a win and the other a loss', /won/i.test(titles[0]) !== /won/i.test(titles[1]), JSON.stringify(titles));
    check(`the two screens arrived within ${MAX_SKEW_MS} ms`, Number.isFinite(skew) && skew <= MAX_SKEW_MS, `${Number.isFinite(skew) ? Math.round(skew) : 'n/a'} ms`);

    const loser = seats[loserSeat];
    const log = await readDebug(loser);
    console.log(`\n      --- seat ${loserSeat} (the LOSER) network timeline (${log.length} entries, last 40) ---`);
    for (const entry of log.slice(-40)) console.log(`      +${entry.t}ms ${entry.what} ${entry.detail ? JSON.stringify(entry.detail) : ''}`);
    console.log('      --- final state of the loser ---');
    console.log(`      ${JSON.stringify(await readState(loser))}`);
    await loser.page.screenshot({ path: `${OUT}finish-loser-seat${loserSeat}.jpg`, type: 'jpeg', quality: 82 }).catch(() => undefined);
  } finally {
    await a.context.close();
    await b.context.close();
  }
} finally {
  await duel.close();
}

if (failed) {
  console.error(`\n${failed} loser-network finish checks failed`);
  process.exit(1);
}
console.log('\nThe loser reaches the end screen over its own network path.');
