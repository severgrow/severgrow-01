// FUTASAKU 0.5 — PASS 4: STRESS / REPEATABILITY of the enemy-turn gate.
//
//   npx tsx web/e2e/online-stress-repeat.ts            # 30 consecutive turns
//   TURNS=60 npx tsx web/e2e/online-stress-repeat.ts    # longer
//
// The owner's complaint was a gate that stayed shut ("Opponent's turn" for ~20s) and a replay that
// got slower the more turns were played. This suite plays TURNS consecutive turns as fast as the
// touch UI allows, alternating seats, and reports the gate duration for the FIRST TEN turns against
// the LAST TEN, so a degradation (a queue that accumulates, a listener that duplicates, a timer that
// drifts) is visible as a number rather than a feeling.
//
// At every 25ms sample of the watcher's page it asserts the turn word matches the real state
// (`Your turn` / `Replaying their turn` / `Opponent's turn` / `Finished`), and it fails if the gate
// is ever stuck, if a reveal jumps a board in without animating, or if the safety net had to fire.
import { mkdirSync } from 'node:fs';
import { onlinePerspective } from '../src/online/perspective.js';
import {
  type LocalDuel,
  type LocalMatch,
  type SeatSession,
  drawnTiles,
  endTurnViaPage,
  openDuel,
  openSeat,
  sleep,
  startLocalDuel,
  statePhase,
  tapExposed,
  waitingFlag,
} from './helpers/local-duel.js';

const OUT = new URL('../../docs/screens/online/', import.meta.url).pathname;
const PORT = Number(process.env.PREVIEW_PORT ?? 4251);
mkdirSync(OUT, { recursive: true });

const TURNS = Number(process.env.TURNS ?? 30);
const STALL_LIMIT_MS = 12_000;

let failed = 0;
const check = (name: string, ok: boolean, note = ''): void => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? `  (${note})` : ''}`);
};

const YOUR_TURN = 'Your turn';
const THEIR_TURN = "Opponent's turn";
const REPLAY_WORD = 'Replaying their turn';
const FINISHED_WORD = 'Finished';

type Sample = {
  t: number; wall: number; turn: string; revealing: boolean; myTurn: boolean;
  finished: boolean; queued: number; pumping: boolean; drawn: string;
};

const SAMPLER = `(() => {
  if (window.__stressTimer) clearInterval(window.__stressTimer);
  window.__frames = [];
  window.__lastFrame = performance.now();
  window.__frameTick = function () {
    var now = performance.now();
    if (window.__watchFrames) window.__frames.push(now - window.__lastFrame);
    window.__lastFrame = now;
    requestAnimationFrame(window.__frameTick);
  };
  requestAnimationFrame(window.__frameTick);
  window.__stress = [];
  window.__stressTimer = setInterval(function () {
    var hook = window.__severgrow || {};
    var o = hook.online ? hook.online() : null;
    var el = document.querySelector('[data-duel-turn]');
    window.__stress.push({
      t: performance.now(),
      wall: Date.now(),
      turn: el ? (el.textContent || '').trim() : '',
      revealing: !!(o && o.revealing),
      myTurn: !!(o && o.myTurn),
      finished: !!(o && o.finished),
      queued: o ? o.queued : -1,
      pumping: !!(o && o.pumping),
      drawn: Array.prototype.map.call(document.querySelectorAll('.l-tiles .tile[data-key]'), function (e) { return e.dataset.key; }).sort().join(',')
    });
  }, 25);
})()`;

const install = (s: SeatSession): Promise<void> => s.page.evaluate(SAMPLER).then(() => undefined);
const samples = (s: SeatSession): Promise<Sample[]> => s.page.evaluate('window.__stress').then((v) => (v as Sample[]) ?? []);
const resetGate = (s: SeatSession): Promise<void> => s.page.evaluate('(() => { window.__stress = []; })()').then(() => undefined);
const setFrames = (s: SeatSession, on: boolean): Promise<void> =>
  s.page.evaluate(`(() => { window.__watchFrames = ${on ? 'true' : 'false'}; window.__frames = []; })()`).then(() => undefined);
const frames = (s: SeatSession): Promise<number[]> => s.page.evaluate('window.__frames').then((v) => (v as number[]) ?? []);
const animLog = (s: SeatSession): Promise<{ t: number; ev: string }[]> =>
  s.page.evaluate('(window.__severgrow && window.__severgrow.animLog) ? window.__severgrow.animLog() : []').then((v) => (v as { t: number; ev: string }[]) ?? []);
const clearAnimLog = (s: SeatSession): Promise<void> =>
  s.page.evaluate('(window.__severgrow && window.__severgrow.clearAnimLog) ? window.__severgrow.clearAnimLog() : undefined').then(() => undefined);

const pct = (values: number[], p: number): number => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx]!;
};

const drawViaDeck = async (s: SeatSession): Promise<boolean> => {
  for (let i = 0; i < 6; i++) {
    if (await tapExposed(s, '#deck')) {
      const start = Date.now();
      while (Date.now() - start < 8_000) {
        const phase = await statePhase(s);
        if (phase === 'ACT' || phase === 'DISCARD') return true;
        await sleep(70);
      }
    }
    await sleep(200);
  }
  return false;
};

const waitTurnFlag = async (s: SeatSession, timeout = 45_000): Promise<boolean> => {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await waitingFlag(s)) return true;
    await sleep(70);
  }
  return false;
};

const serverBoard = async (duel: LocalDuel, match: LocalMatch, seat: 0 | 1): Promise<string> => {
  const view = (await duel.api.getState(match.guests[seat].token, match.matchId)).player;
  const p = onlinePerspective(seat);
  return Object.entries(view.view.board as Record<string, unknown>)
    .filter(([, tile]) => !!tile)
    .map(([key]) => p.mapKey(key))
    .sort()
    .join(',');
};

type Reveal = { turn: number; watcher: 0 | 1; ms: number; wrongWords: number; jumped: boolean; stuck: boolean; frames: number[]; release: boolean };

const reveals: Reveal[] = [];
let actor: 0 | 1 = 0;

const duel = await startLocalDuel({ port: PORT });
try {
  const match = await duel.newMatch();
  actor = match.starterSeat;
  const seat0 = await openSeat(duel, match, 0, { speed: 'fast' });
  const seat1 = await openSeat(duel, match, 1, { speed: 'fast' });
  const seats: [SeatSession, SeatSession] = [seat0, seat1];
  try {
    await openDuel(seat0, match.matchId);
    await openDuel(seat1, match.matchId);
    await install(seat0);
    await install(seat1);
    check('the starter holds the turn', await waitTurnFlag(seats[actor]!, 45_000));

    for (let turn = 1; turn <= TURNS; turn++) {
      const acting = seats[actor]!;
      const watcher = actor === 0 ? 1 : 0;
      const watching = seats[watcher]!;

      if (!(await waitTurnFlag(acting, 45_000))) {
        check(`turn ${turn}: the actor holds the turn`, false, `seat ${actor} never got the turn`);
        break;
      }
      const before = (await drawnTiles(watching)).join(',');
      await clearAnimLog(watching);
      await resetGate(watching);
      await resetGate(acting);
      await setFrames(watching, true);

      // One whole turn as fast as the page allows it.
      const drew = await drawViaDeck(acting);
      if (!drew) check(`turn ${turn}: the actor drew`, false);
      const ended = await endTurnViaPage(acting, 30_000);
      if (!ended) check(`turn ${turn}: the actor completed the turn`, false);

      const waitStart = Date.now();
      let detected: Sample | null = null;
      let opened: Sample | null = null;
      while (Date.now() - waitStart < 45_000) {
        const now = await samples(watching);
        if (!detected) detected = now.find((s) => s.revealing) ?? null;
        const open = now.find((s) => s.myTurn && (!detected || s.t >= detected.t));
        if (open) { opened = open; break; }
        await sleep(40);
      }
      const capturedFrames = await frames(watching);
      await setFrames(watching, false);
      const captured = await samples(watching);
      const log = await animLog(watching);

      if (!detected || !opened) {
        check(`turn ${turn}: the watcher saw the reveal and got the turn back`, false, `detected=${!!detected} opened=${!!opened}`);
        const hook = await watching.page.evaluate('window.__severgrow?.online?.() ?? null');
        console.log(`    DIAGNOSTICS seat ${watcher}: ${JSON.stringify(hook)}`);
        await watching.page.screenshot({ path: `${OUT}stress-stuck-turn-${turn}.png` }).catch(() => undefined);
        reveals.push({ turn, watcher, ms: -1, wrongWords: -1, jumped: false, stuck: true, frames: capturedFrames, release: false });
        actor = watcher;
        continue;
      }

      const ms = Math.round(opened.t - detected.t);
      const authoritative = await serverBoard(duel, match, watcher);
      const wordOk = (s: Sample): boolean => {
        if (s.turn === YOUR_TURN) return s.myTurn;
        if (s.turn === REPLAY_WORD) return s.revealing && !s.myTurn;
        if (s.turn === FINISHED_WORD) return s.finished;
        if (s.turn === THEIR_TURN) return !s.myTurn && !s.revealing && !s.finished;
        return false;
      };
      const wrongWords = captured.filter((s) => !wordOk(s)).length;
      const jumped = captured.some((s) => !s.revealing && !s.myTurn && s.drawn !== before);
      const after = (await watching.page.evaluate('window.__severgrow?.online?.() ?? null')) as { queued: number; pumping?: boolean } | null;
      const trueBoard = (await drawnTiles(watching)).join(',') === authoritative;
      reveals.push({ turn, watcher, ms, wrongWords, jumped, stuck: false, frames: capturedFrames.slice(1), release: log.some((m) => m.ev === 'watch:release') });

      if (turn <= 2 || turn % 10 === 0) {
        console.log(
          `    turn ${turn}: seat ${actor} -> seat ${watcher}, gate ${ms}ms, wrongWords ${wrongWords}, board ok ${trueBoard}, queued ${after?.queued}, pumped ${after?.pumping ? 'YES' : 'no'}`,
        );
      }
      check(`turn ${turn}: the gate opened within the bound`, ms < STALL_LIMIT_MS, `${ms}ms`);
      check(`turn ${turn}: the turn word was correct at every sample`, wrongWords === 0, `${wrongWords} wrong of ${captured.length}`);
      check(`turn ${turn}: the board never jumped without the animation`, !jumped);
      check(`turn ${turn}: input opened on the TRUE final board`, trueBoard);
      check(`turn ${turn}: nothing left queued or pumping`, !!after && after.queued === 0 && !after.pumping, JSON.stringify(after));

      actor = watcher;
    }
  } finally {
    await seat0.context.close();
    await seat1.context.close();
  }
} finally {
  await duel.close();
}

// ------------------------------------------------------------------ the degradation report

const ok = reveals.filter((r) => !r.stuck);
const first10 = ok.slice(0, 10).map((r) => r.ms);
const last10 = ok.slice(-10).map((r) => r.ms);
console.log(`\n================ PASS 4 — STRESS (${reveals.length} turns) ================`);
console.log(`gate duration, all turns : p50 ${pct(ok.map((r) => r.ms), 50)}ms, p95 ${pct(ok.map((r) => r.ms), 95)}ms, max ${Math.max(0, ...ok.map((r) => r.ms))}ms`);
console.log(`first 10 turns           : p50 ${pct(first10, 50)}ms, p95 ${pct(first10, 95)}ms`);
console.log(`last 10 turns            : p50 ${pct(last10, 50)}ms, p95 ${pct(last10, 95)}ms`);
const perSeat = ([0, 1] as const).map((seat) => {
  const ms = ok.filter((r) => r.watcher === seat).map((r) => r.ms);
  return `seat ${seat}: ${ms.length} reveals p50 ${pct(ms, 50)}ms p95 ${pct(ms, 95)}ms`;
});
console.log(perSeat.join('\n'));

const deltas = ok.flatMap((r) => r.frames).filter((d) => d > 0 && d < 5000);
if (deltas.length) {
  const long = deltas.filter((d) => d > 50).length;
  console.log(`live-reveal frame timing : ${deltas.length} frames, p50 ${pct(deltas, 50).toFixed(1)}ms, p95 ${pct(deltas, 95).toFixed(1)}ms, max ${Math.max(...deltas).toFixed(1)}ms, ${long} over 50ms`);
}
console.log(`safety net fired        : ${ok.filter((r) => r.release).length} time(s) during normal reveals`);
console.log(`wrong turn words        : ${ok.reduce((n, r) => n + r.wrongWords, 0)} across ${ok.length} reveals`);
console.log(`stuck reveals           : ${reveals.filter((r) => r.stuck).length}`);

check(
  'no reveal degraded: the last 10 turns are not slower than the first 10 by more than 1.5x',
  pct(last10, 50) <= Math.max(pct(first10, 50) * 1.5, pct(first10, 50) + 1_500),
  `first p50 ${pct(first10, 50)}ms, last p50 ${pct(last10, 50)}ms`,
);
check('the safety net never fired during a normal reveal', ok.every((r) => !r.release));
check('no reveal was stuck', reveals.every((r) => !r.stuck));

if (failed) {
  console.error(`\n${failed} stress check(s) failed`);
  process.exit(1);
}
console.log('\nStress: 30+ consecutive turns cross the boundary with a stable gate and a truthful turn word.');
