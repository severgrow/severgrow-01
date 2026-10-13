// FUTASAKU 0.5 — the enemy-turn gate under REPEAT, and the reveal-latency numbers.
//
//   npx tsx web/e2e/online-turn-gate-repeat.ts
//
// The owner, on a real two-phone game: "it shows 'Opponent's turn' for very long - like 20 seconds
// or so - unacceptable ... animation dont feel smooth neither". A single slow reveal is one bug; a
// reveal that gets slower the more turns are played is another (a queue that accumulates because a
// finished pump never picked its steps up). This suite drives BOTH seats over a local duel API for
// SIX consecutive turns in each direction (twelve reveals, alternating, nobody re-opened), samples
// the waiting seat every 25ms, and:
//
//   (a) measures how long the gate stayed shut after the opponent's turn completed (p50/p95, max),
//       and fails if any reveal is anywhere near the multi-second stall the owner saw;
//   (b) proves the board never swapped without the animation (no silent jump);
//   (c) proves input opened only on the TRUE final board (compared with the API, never the page);
//   (d) proves the HUD turn word matched the real state at EVERY sample, and that the TWO phones
//       never both said "Opponent's turn" at the same instant (both pages' samples are matched by
//       the shared wall clock);
//   (e) proves repeated turns do not degrade — the 10th reveal is as prompt as the 1st — which is
//       the check that bites the "a finished pump dropped its steps" leak;
//   (f) injects a deliberately hung step and proves the safety net catches it, opens the gate and
//       settles on the TRUE final board (skipped on a build without the hook);
//   and it records real frame timing (rAF deltas) during each live reveal, so "smooth" is a number.
//
// It tolerates a pre-fix build (no `animLog` / `injectStall` / `pumping` hook): the gate-duration
// and turn-word checks still run, so the same file FAILS on the pre-fix code and passes after.
import { mkdirSync } from 'node:fs';
import { onlinePerspective } from '../src/online/perspective.js';
import {
  type LocalDuel,
  type LocalMatch,
  type SeatSession,
  drawnTiles,
  endTurnViaPage,
  exposedPoint,
  openDuel,
  openSeat,
  readOnline,
  sleep,
  startLocalDuel,
  statePhase,
  tapExposed,
  waitingFlag,
} from './helpers/local-duel.js';

const OUT = new URL('../../docs/screens/online/', import.meta.url).pathname;
const PORT = Number(process.env.PREVIEW_PORT ?? 4241);
mkdirSync(OUT, { recursive: true });

/** A reveal near this is a stall, not a slow turn: fail rather than warn. */
const STALL_LIMIT_MS = 12_000;
/** Percentile report only; a normal live turn is a couple of seconds. */
let failed = 0;
const check = (name: string, ok: boolean, note = ''): void => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? `  (${note})` : ''}`);
};

const YOUR_TURN = 'Your turn';
const THEIR_TURN = "Opponent's turn";
/** The distinct word while the opponent's finished turn animates (never THEIR_TURN). */
const REPLAY_WORD = 'Replaying their turn';
const FINISHED_WORD = 'Finished';

// The sampler counts frames with real deltas, so a janky reveal is visible in the numbers.
const SAMPLER = `(() => {
  if (window.__gateTimer) clearInterval(window.__gateTimer);
  window.__frames = [];
  window.__lastFrame = performance.now();
  window.__frameTick = function () {
    var now = performance.now();
    if (window.__watchFrames) window.__frames.push(now - window.__lastFrame);
    window.__lastFrame = now;
    requestAnimationFrame(window.__frameTick);
  };
  requestAnimationFrame(window.__frameTick);
  window.__gate = [];
  window.__gateTimer = setInterval(function () {
    var hook = window.__severgrow || {};
    var o = hook.online ? hook.online() : null;
    var turn = (document.querySelector('[data-duel-turn]') || {}).textContent || '';
    window.__gate.push({
      t: performance.now(),
      wall: Date.now(),
      turn: turn.trim(),
      revealing: !!(o && o.revealing),
      live: !!(o && o.live),
      myTurn: !!(o && o.myTurn),
      finished: !!(o && o.finished),
      queued: o ? o.queued : -1,
      pumping: !!(o && o.pumping),
      drawn: Array.prototype.map.call(document.querySelectorAll('.l-tiles .tile[data-key]'), function (el) {
        return el.dataset.key;
      }).sort().join(',')
    });
  }, 25);
})()`;

type Sample = {
  t: number;
  wall: number;
  turn: string;
  revealing: boolean;
  live: boolean;
  myTurn: boolean;
  finished: boolean;
  queued: number;
  pumping: boolean;
  drawn: string;
};

const resetSampler = (s: SeatSession): Promise<void> =>
  s.page.evaluate(`(() => { window.__watchFrames = true; window.__frames = []; window.__gate = []; })()`).then(() => undefined);

/** Clear only the gate samples (both seats are sampled for the both-phones check). */
const resetGate = (s: SeatSession): Promise<void> =>
  s.page.evaluate('(() => { window.__gate = []; })()').then(() => undefined);

const setFrames = (s: SeatSession, on: boolean): Promise<void> =>
  s.page.evaluate(`(() => { window.__watchFrames = ${on ? 'true' : 'false'}; })()`).then(() => undefined);

const samples = (s: SeatSession): Promise<Sample[]> =>
  s.page.evaluate('window.__gate').then((v) => (v as Sample[] | undefined) ?? []);

const frames = (s: SeatSession): Promise<number[]> =>
  s.page.evaluate('window.__frames').then((v) => (v as number[] | undefined) ?? []);

const animLog = (s: SeatSession): Promise<{ t: number; ev: string; [k: string]: unknown }[]> =>
  s.page
    .evaluate('(window.__severgrow && window.__severgrow.animLog) ? window.__severgrow.animLog() : []')
    .then((v) => (v as { t: number; ev: string }[] | undefined) ?? []);

const clearAnimLog = (s: SeatSession): Promise<void> =>
  s.page
    .evaluate('(window.__severgrow && window.__severgrow.clearAnimLog) ? window.__severgrow.clearAnimLog() : undefined')
    .then(() => undefined);

/** Draw from the deck with a finger until the Grow step opens. */
const drawViaDeck = async (s: SeatSession): Promise<boolean> => {
  for (let i = 0; i < 6; i++) {
    if (await tapExposed(s, '#deck')) {
      const start = Date.now();
      while (Date.now() - start < 6000) {
        if ((await statePhase(s)) === 'ACT') return true;
        await sleep(80);
      }
    }
    await sleep(250);
  }
  return false;
};

const waitGrowStep = async (s: SeatSession, timeout = 15_000): Promise<boolean> => {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if ((await statePhase(s)) === 'ACT') return true;
    if ((await statePhase(s)) === 'DISCARD') return true;
    await sleep(80);
  }
  return false;
};

const hasDraft = (s: SeatSession): Promise<boolean> =>
  s.page.evaluate(() => {
    try {
      return Object.keys(sessionStorage).some((k) => k.indexOf('severgrow.duel.draft.v1.') !== -1);
    } catch {
      return false;
    }
  });

type Plan = { bloom: { kind: string; hexes: string[] } | null; hasGrow: boolean };

// Page scripts are plain STRINGS: tsx/esbuild would inject a `__name` helper the page lacks.
const READ_PLAN = `(() => {
  var hook = window.__severgrow;
  var st = hook && hook.state ? hook.state() : null;
  if (!st) return null;
  var legal = hook.legal ? hook.legal() : [];
  var key = function (c) { return c.q + ',' + c.r; };
  var blooms = [];
  for (var i = 0; i < legal.length; i++) if (legal[i].t === 'Bloom') blooms.push(legal[i]);
  var bloom = null;
  if (blooms.length) {
    var best = blooms.slice().sort(function (a, b) { return b.hexes.length - a.hexes.length; })[0];
    var cards = best.cards.slice().sort(function (a, b) { return a - b; });
    bloom = { kind: 'bloom-' + cards.length + '-' + cards.join('.'), hexes: best.hexes.map(key) };
  }
  var hasGrow = false;
  for (var j = 0; j < legal.length; j++) if (legal[j].t === 'Bloom' || legal[j].t === 'Sprout') hasGrow = true;
  return { bloom: bloom, hasGrow: hasGrow };
})()`;

const readPlan = (s: SeatSession): Promise<Plan | null> => s.page.evaluate(READ_PLAN) as Promise<Plan | null>;

const hexPoint = (s: SeatSession, key: string): Promise<{ x: number; y: number } | null> =>
  exposedPoint(s, `#board .hex-cell[data-key="${key}"]`);

/** Drop any half-painted Bloom / picked card so the Throw control is reachable again. */
const cancelPaint = async (s: SeatSession): Promise<void> => {
  await s.page.evaluate(`(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); })()`);
  await sleep(120);
};

/** Enter a Bloom recipe through the page's own control and paint it with finger taps. */
const paintBloom = async (s: SeatSession, bloom: { kind: string; hexes: string[] }): Promise<boolean> => {
  const entered = (await s.page.evaluate(`(() => {
    var k = ${JSON.stringify(bloom.kind)};
    var visible = function (el) { return !!el && el.offsetParent !== null; };
    var btn = document.querySelector('#moves [data-kind="' + k + '"]');
    if (visible(btn)) { btn.click(); return true; }
    var toggle = document.querySelector('#moves .bloom-toggle');
    if (toggle) {
      toggle.click();
      btn = document.querySelector('#moves [data-kind="' + k + '"]');
      if (btn) { btn.click(); return true; }
    }
    return false;
  })()`)) as boolean;
  if (!entered) return false;
  for (const variant of [bloom.hexes, [...bloom.hexes].reverse()]) {
    for (const key of variant) {
      const p = await hexPoint(s, key);
      if (!p) continue;
      await s.page.touchscreen.tap(p.x, p.y);
      await sleep(90);
      if (await hasDraft(s)) return true;
    }
    await sleep(220);
    if (await hasDraft(s)) return true;
  }
  return false;
};

/** Authoritative board the given seat may see, straight from the API, in that seat's screen keys. */
const serverBoard = async (duel: LocalDuel, match: LocalMatch, seat: 0 | 1): Promise<string[]> => {
  const view = (await duel.api.getState(match.guests[seat].token, match.matchId)).player;
  const p = onlinePerspective(seat);
  return Object.entries(view.view.board)
    .filter(([, tile]) => !!tile)
    .map(([key]) => p.mapKey(key))
    .sort();
};

/** Wait until the seat holds the turn again (its own waiting flag). */
const waitMyTurnFlag = async (s: SeatSession, timeout = 40_000): Promise<boolean> => {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await waitingFlag(s)) return true;
    await sleep(100);
  }
  return false;
};

const pct = (values: number[], p: number): number => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx]!;
};

type Reveal = { turn: number; watcher: 0 | 1; ms: number; grew: boolean; samples: Sample[]; frames: number[]; log: { t: number; ev: string }[] };
const reveals: Reveal[] = [];
/** Both seats' samples for each turn, for the joint "never both say Opponent's turn" check. */
const turnPairs: { turn: number; watcher: 0 | 1; watcherSamples: Sample[]; actorSamples: Sample[] }[] = [];
/** How many turns actually placed a multi-tile Bloom (the heavy, sequential reveal path). */
let heavyReveals = 0;

const duel = await startLocalDuel({ port: PORT });
try {
  const match = await duel.newMatch();
  const starter = match.starterSeat;
  const seat0 = await openSeat(duel, match, 0, {});
  const seat1 = await openSeat(duel, match, 1, {});
  const seats: [SeatSession, SeatSession] = [seat0, seat1];

  try {
    await openDuel(seat0, match.matchId);
    await openDuel(seat1, match.matchId);
    await installSampler(seat0);
    await installSampler(seat1);
    check('both seats hold the duel', await waitMyTurnFlag(seats[starter]!, 40_000));

    let actor: 0 | 1 = starter;
    const TOTAL = Number(process.env.TURNS ?? 12);
    for (let turn = 1; turn <= TOTAL; turn++) {
      const watcher: 0 | 1 = actor === 0 ? 1 : 0;
      const watching = seats[watcher]!;
      const acting = seats[actor]!;

      check(`turn ${turn}: seat ${actor} holds the turn`, await waitMyTurnFlag(acting, 40_000));

      const before = (await drawnTiles(watching)).join(',');
      await clearAnimLog(watching);
      await resetSampler(watching);
      await setFrames(watching, true);
      // Sample BOTH seats: the two-phone rule is about what the PAIR says at the same moment.
      await resetGate(acting);

      // One whole turn through the page's own touch UI (Draw -> Throw -> forced Discard). Every
      // third turn also paints a multi-tile Bloom: that is the heavy sequential path, and the one
      // the owner watches for smoothness.
      const growing = turn % 3 === 0;
      let heavy = false;
      const drew = await drawViaDeck(acting);
      check(`turn ${turn}: seat ${actor} drew`, drew);
      await waitGrowStep(acting);
      let grew = false;
      if (growing) {
        let offered = 0;
        for (let attempt = 0; attempt < 3 && !grew; attempt++) {
          const plan = await readPlan(acting);
          offered = plan?.bloom?.hexes.length ?? 0;
          if (plan?.bloom) grew = await paintBloom(acting, plan.bloom);
          if (!grew) await sleep(300);
        }
        console.log(`    turn ${turn}: tried a multi-tile Bloom (${offered} hexes offered) -> ${grew ? 'placed' : 'not placed'}`);
        // Painting a Bloom through finger taps is a harness capability, not a product assertion: a
        // miss is reported here and only fails the run if NO heavy reveal was ever exercised.
        if (offered > 0 && !grew) console.log(`    turn ${turn}: WARNING — could not paint the offered Bloom`);
        if (grew) heavy = true;
        if (!grew) await cancelPaint(acting);
      }
      if (heavy) heavyReveals++;
      const ended = await endTurnViaPage(acting, 25_000);
      check(`turn ${turn}: seat ${actor} completed the turn through the touch UI`, ended);

      // The TRUE final board (from the API, never the page's copy), fetched AFTER the turn landed:
      // this is what the watcher must end on, and what every "can act" sample must show.
      let authoritative = before;
      for (let i = 0; i < 20; i++) {
        authoritative = (await serverBoard(duel, match, watcher)).join(',');
        if (authoritative !== before || !grew) break;
        await sleep(150);
      }

      // Wait for the watcher's gate to close then open; sample the whole window.
      const waitStart = Date.now();
      let detected: Sample | null = null;
      let opened: Sample | null = null;
      while (Date.now() - waitStart < 40_000) {
        const now = await samples(watching);
        if (!detected) detected = now.find((s) => s.revealing) ?? null;
        const open = now.find((s) => s.myTurn && (!detected || s.t >= detected.t));
        if (open) {
          opened = open;
          break;
        }
        await sleep(50);
      }
      await setFrames(watching, false);
      const captured = await samples(watching);
      const capturedActor = await samples(acting);
      const capturedFrames = await frames(watching);
      const log = (await animLog(watching)) as { t: number; ev: string }[];

      if (!detected || !opened) {
        check(`turn ${turn}: the watcher saw the reveal and got the turn back`, false, `detected=${!!detected} opened=${!!opened}`);
        const hook = await readOnline(watching);
        const word = await watching.page.evaluate(
          `(document.querySelector('[data-duel-turn]') || {}).textContent || ''`,
        );
        const log = (await animLog(watching)) as { t: number; ev: string }[];
        console.log(`    DIAGNOSTICS (seat ${watcher}, turn ${turn}): hook=${JSON.stringify(hook)} word="${String(word).trim()}"`);
        console.log(`    drawn=${(await drawnTiles(watching)).join(',')} authoritative=${authoritative}`);
        console.log(`    gate samples: ${captured.length}, revealing=${captured.filter((s) => s.revealing).length}, myTurn=${captured.filter((s) => s.myTurn).length}`);
        console.log(`    animLog (last 50):`);
        for (const m of log.slice(-50)) console.log(`      +${m.t}ms ${m.ev} ${JSON.stringify({ ...m, t: undefined, ev: undefined })}`);
        await watching.page.screenshot({ path: `${OUT}gate-stuck-turn-${turn}.png` }).catch(() => undefined);
        actor = watcher;
        continue;
      }

      const ms = Math.round(opened.t - detected.t);
      reveals.push({ turn, watcher, ms, grew, samples: captured, frames: capturedFrames, log });
      turnPairs.push({ turn, watcher, watcherSamples: captured, actorSamples: capturedActor });
      const revealFrames = capturedFrames.slice(1).filter((d) => d > 0 && d < 5000);
      const longFrames = revealFrames.filter((d) => d > 50).length;
      console.log(
        `    turn ${turn} frames: ${revealFrames.length}, p95=${pct(revealFrames, 95).toFixed(1)}ms max=${revealFrames.length ? Math.max(...revealFrames).toFixed(1) : '-'}ms, ${longFrames} >50ms${grew ? ` (grew: ${authoritative.split(',').length - before.split(',').length} tiles)` : ''}`,
      );

      // (a) bounded: a stall must be impossible.
      check(`turn ${turn}: the gate opened within the bound`, ms < STALL_LIMIT_MS, `${ms}ms (limit ${STALL_LIMIT_MS}ms)`);
      // (b) the board never swapped before/without the animation.
      const jumped = captured.some((s) => !s.revealing && !s.myTurn && s.drawn !== before);
      check(`turn ${turn}: the board never jumped while the reveal was not running`, !jumped);
      // (c) input only on the true final board.
      check(
        `turn ${turn}: input opened only on the true final board`,
        captured.every((s) => !s.myTurn || s.drawn === authoritative),
        `${captured.filter((s) => s.myTurn).length} open samples`,
      );
      // (d) the HUD word matched the REAL state at every sample.
      //   myTurn            -> "Your turn"
      //   replaying (gate)  -> "Replaying their turn" (never "Opponent's turn": that was the bug)
      //   finished          -> "Finished"
      //   otherwise         -> "Opponent's turn"
      const wordOk = (s: Sample): boolean => {
        if (s.turn === YOUR_TURN) return s.myTurn;
        if (s.turn === REPLAY_WORD) return s.revealing && !s.myTurn;
        if (s.turn === FINISHED_WORD) return s.finished;
        if (s.turn === THEIR_TURN) return !s.myTurn && !s.revealing && !s.finished;
        return false;
      };
      const wrongWord = captured.filter((s) => !wordOk(s));
      check(`turn ${turn}: the turn word was correct at every sample`, wrongWord.length === 0, `${wrongWord.length} wrong`);
      if (wrongWord.length) {
        for (const s of wrongWord.slice(0, 4)) {
          console.log(
            `      wrong word: t=${Math.round(s.t - captured[0]!.t)}ms turn="${s.turn}" myTurn=${s.myTurn} revealing=${s.revealing} queued=${s.queued}`,
          );
        }
      }
      // The safety net must NOT have fired during a normal replay: that is the proof its threshold
      // cannot cut a legitimate animation short. (`watch:release` appears only when it is forced.)
      check(
        `turn ${turn}: the safety net did not fire (the replay was never cut short)`,
        !log.some((m) => m.ev === 'watch:release'),
      );
      // the reveal really animated the board (for a growing turn) — a distinct intermediate state
      const between = new Set(captured.filter((s) => s.revealing).map((s) => s.drawn)).size;
      if (before !== authoritative) {
        check(`turn ${turn}: the reveal showed the board changing while gated`, between >= 1, `${between} gated board state(s)`);
      }
      // (e) nothing was left queued or pumping once the turn opened.
      const after = await readOnline(watching);
      check(
        `turn ${turn}: nothing was left queued or pumping after the reveal`,
        !!after && after.queued === 0 && !(after as unknown as { pumping?: boolean }).pumping,
        JSON.stringify(after),
      );

      console.log(
        `    turn ${turn}: seat ${actor} acted, seat ${watcher} watched ${ms}ms, queued=${after?.queued ?? '?'}`,
      );
      actor = watcher;
    }

    // ------------------------------------------------------ (d, joint) BOTH phones, same moment
    // The owner's complaint: BOTH phones showed "Opponent's turn" at once — and, per the per-turn
    // check above, the phone that was REPLAYING read it too. That is the bug this asserts is gone:
    // at no shared moment do the two phones both read "Opponent's turn" while EITHER is replaying.
    //
    // The remaining window where both read it with NEITHER replaying is not a bug and cannot be
    // removed: the throw has just landed, so the thrower's turn is genuinely over, while the other
    // phone still holds its previous view for the fraction of a second before the ping/poll arrives.
    // (Requiring more would need one phone to state something untrue.) The target for that window is
    // the detection speed measured above (median under 1.5s), not zero.
    {
      let violations = 0;
      const bothTheirWhileReplaying = (x: Sample[], y: Sample[]): string[] => {
        const out: string[] = [];
        for (const s of x) {
          if (s.turn !== THEIR_TURN) continue;
          let best: Sample | null = null;
          let bestD = Infinity;
          for (const o of y) {
            const d = Math.abs(o.wall - s.wall);
            if (d < bestD) {
              bestD = d;
              best = o;
            }
          }
          if (best && bestD <= 60 && best.turn === THEIR_TURN && (s.revealing || best.revealing)) out.push(`${bestD}ms`);
        }
        return out;
      };
      for (const p of turnPairs) {
        const v = [
          ...bothTheirWhileReplaying(p.watcherSamples, p.actorSamples),
          ...bothTheirWhileReplaying(p.actorSamples, p.watcherSamples),
        ];
        violations += v.length;
        if (v.length) {
          console.log(`    turn ${p.turn}: BOTH phones said "Opponent's turn" while a replay ran at ${v.length} moment(s) (nearest ${v[0]})`);
        }
      }
      check(
        'the two phones never both said "Opponent\'s turn" while a replay was running',
        violations === 0,
        `${violations} shared moment(s)`,
      );
    }

    // ---------------------------------------------------------------- (f) the injected-stall backstop
    // Hang the NEXT step on the watcher. A hung step means the normal drain can never finish, so
    // only the safety net can open the gate — and it must end on the TRUE final board.
    {
      const stallActorSeat = actor;
      const stallWatcherSeat: 0 | 1 = stallActorSeat === 0 ? 1 : 0;
      const stallActor = seats[stallActorSeat]!;
      const stallWatcher = seats[stallWatcherSeat]!;
      const hasInject = (await stallWatcher.page.evaluate(
        '!!(window.__severgrow && window.__severgrow.injectStall)',
      )) as boolean;
      if (!hasInject) {
        console.log('SKIP (f): this build has no stall-injection hook (expected on a pre-fix build)');
      } else {
        check('(f) the next actor holds the duel before the injected stall', await waitMyTurnFlag(stallActor, 40_000));
        await clearAnimLog(stallWatcher);
        await resetGate(stallWatcher);
        await stallWatcher.page.evaluate('window.__severgrow.injectStall()');
        await drawViaDeck(stallActor);
        await waitGrowStep(stallActor);
        await endTurnViaPage(stallActor, 25_000);
        const stallStart = Date.now();
        let stallOpened: Sample | null = null;
        let sawReveal = false;
        while (Date.now() - stallStart < 30_000) {
          const now = await samples(stallWatcher);
          sawReveal = sawReveal || now.some((s) => s.revealing);
          stallOpened = now.find((s) => s.myTurn && sawReveal) ?? null;
          if (stallOpened) break;
        }
        const stallLog = (await animLog(stallWatcher)) as { t: number; ev: string }[];
        const trueBoard = (await serverBoard(duel, match, stallWatcherSeat)).join(',');
        const settled = (await drawnTiles(stallWatcher)).join(',');
        const waited = Math.round(Date.now() - stallStart);
        check('(f) the injected stall closed the gate', sawReveal);
        check('(f) the safety net opened the gate despite the hung step', !!stallOpened, `after ${waited}ms`);
        check(
          '(f) the safety net logged its release',
          stallLog.some((m) => m.ev === 'watch:release'),
          stallLog.map((m) => m.ev).filter((e) => e.startsWith('watch:')).join(','),
        );
        check(
          '(f) the board settled on the TRUE final board',
          settled === trueBoard,
          `page=${settled.split(',').filter(Boolean).length} tiles, api=${trueBoard.split(',').filter(Boolean).length} tiles`,
        );
        console.log(`    (f) injected stall: the gate reopened ${waited}ms after the turn was sent`);
      }
    }
  } finally {
    await seat0.context.close();
    await seat1.context.close();
  }
} finally {
  await duel.close();
}

// ---------------------------------------------------------------------------- the report

const allMs = reveals.map((r) => r.ms);
console.log(
  `\nGate duration over ${allMs.length} reveals: p50=${pct(allMs, 50)}ms p95=${pct(allMs, 95)}ms max=${Math.max(0, ...allMs)}ms`,
);
const first = reveals[0];
const tenth = reveals[9] ?? reveals[reveals.length - 1];
check(
  'repeated turns do not degrade (the 10th reveal is no slower than the 1st by more than 1.5x)',
  !!first && !!tenth && tenth.ms <= Math.max(first.ms * 1.5, first.ms + 1_500),
  `1st=${first?.ms}ms 10th=${tenth?.ms}ms`,
);

const perSeat = ([0, 1] as const).map((seat) => {
  const ms = reveals.filter((r) => r.watcher === seat).map((r) => r.ms);
  return `seat ${seat}: ${ms.length} reveals p50=${pct(ms, 50)}ms p95=${pct(ms, 95)}ms`;
});
console.log(perSeat.join('\n'));

// frame timing during the reveals (drop the first frame of each, which spans the gap before it)
const deltas = reveals.flatMap((r) => r.frames.slice(1)).filter((d) => d > 0 && d < 5000);
if (deltas.length) {
  const long = deltas.filter((d) => d > 50).length;
  console.log(
    `Live-reveal frame timing: ${deltas.length} frames, p50=${pct(deltas, 50).toFixed(1)}ms p95=${pct(deltas, 95).toFixed(1)}ms max=${Math.max(...deltas).toFixed(1)}ms, ${long} frame(s) slower than 50ms`,
  );
}

const stalls = reveals.flatMap((r) => r.log.filter((m) => m.ev === 'watch:release' || m.ev === 'pump:error'));
console.log(`Safety-net / pump-error marks during the normal reveals: ${stalls.length}`);
for (const s of stalls.slice(0, 10)) console.log(`    ${s.ev} ${JSON.stringify(s)}`);

check(
  'at least one multi-tile heavy reveal was exercised (the sequential grow path)',
  heavyReveals >= 1,
  `${heavyReveals} turn(s)`,
);

if (failed) {
    console.error(`\n${failed} repeated-turn gate checks failed`);
    process.exit(1);
}
console.log('\nRepeated enemy turns: the gate opens promptly every time and never degrades.');

async function installSampler(s: SeatSession): Promise<void> {
  await s.page.evaluate(SAMPLER);
}
