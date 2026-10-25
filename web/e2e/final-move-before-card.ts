// THE FINAL MOVE IS SEEN BEFORE THE RESULT — proven on two real seats in Chromium.
//
//   npx tsx web/e2e/final-move-before-card.ts
//
// The owner (2026-10-25): "when playing game online - if i have the last move of the game and do it
// and win -- opponent doesn't get to see my final move because they get the 'you lost' end of game
// screen straight away -- it should always show the final move first and then show the end of game
// screen".
//
// For every way a duel can finish (a KO on the board, the winner's OWN winning move through the
// page, a timeout, a resignation, a draw, and Reduce motion) this suite measures, on BOTH seats:
//
//   * the last visual step the animation pump played (its `step` mark) and when it landed;
//   * the first frame `#gameover` was not hidden;
//   * that the move really was on screen first (a mid-move frame, and `.landmark.strangled`);
//   * the wait from the move landing to the plate (must be a render, not a fixed delay);
//   * that a reconnect that opens a FINISHED match cold shows the card at once.
//
// Artifacts: /tmp/final-move (override with SHOTS=…).
import { appendFileSync, mkdirSync } from 'node:fs';
import type { Action, Coord, Player, View } from '../../src/engine/index.js';
import { apply, coordKey, hexDistance, homeCoord, isStrangled } from '../../src/engine/index.js';
import { shadowFromView } from '../src/online/shadow.js';
import type { LocalDuel, LocalMatch, SeatSession } from './helpers/local-duel.js';
import { exposedPoint, openDuel, openSeat, sleep, startLocalDuel, touchTap, waitIdle } from './helpers/local-duel.js';

const OUT = process.env.SHOTS ?? '/tmp/final-move';
const PORT = Number(process.env.PREVIEW_PORT ?? 5262);
const PORT_SHORT = Number(process.env.PREVIEW_PORT_SHORT ?? 5263);
/** The plate must follow the move within this. A render is a frame or two; 400 ms is generous. */
const MAX_AFTER_MOVE_MS = 400;
/** A finish with no move at all (timeout, resignation) must not wait for one. */
const MAX_AFTER_DECISION_MS = 400;
mkdirSync(OUT, { recursive: true });

let failed = 0;
let checks = 0;
/** Node buffers stdout when it is a file, so progress is also appended (watch it with `tail -f`). */
const PROGRESS = `${OUT}/run.log`;
const say = (line: string): void => {
  console.log(line);
  try {
    appendFileSync(PROGRESS, `${line}\n`);
  } catch {
    /* the run still works without the progress file */
  }
};
const check = (name: string, ok: boolean, note = ''): void => {
  if (!ok) failed++;
  else checks++;
  say(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? `  (${note})` : ''}`);
};

/** One broken scenario must not hide the others' evidence. */
const guard = async (label: string, fn: () => Promise<void>): Promise<void> => {
  try {
    await fn();
  } catch (error) {
    failed++;
    say(`FAIL  ${label} threw: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
  }
};

type Mark = { t: number; ev: string } & Record<string, number | string | boolean>;
type Watch = {
  finishedAt: number | null;
  veilAt: number | null;
  strangledAt: number | null;
  wonAt: number | null;
  events: { at: number; veil: boolean; queued: number; pumping: boolean }[];
};

/** Runs in the page from now on: when the page learned the result, and the frame the plate rose. */
const WATCH = `(() => {
  const log = { finishedAt: null, veilAt: null, strangledAt: null, wonAt: null, events: [], lastVeil: null, lastFinished: null };
  window.__finalMove = log;
  const step = function () {
    const g = document.getElementById('gameover');
    const hook = window.__severgrow;
    const o = hook && hook.online ? hook.online() : null;
    const veil = !!g && !g.hidden;
    const now = performance.now();
    if (o && o.finished && log.finishedAt === null) log.finishedAt = now;
    if (veil && log.veilAt === null) log.veilAt = now;
    if (veil !== log.lastVeil) {
      log.lastVeil = veil;
      log.events.push({ at: Math.round(now), veil: veil, queued: o ? o.queued : -1, pumping: o ? !!o.pumping : false });
    }
    if (log.strangledAt === null && document.querySelector('.landmark.strangled')) log.strangledAt = now;
    if (log.wonAt === null && document.querySelector('.landmark.won')) log.wonAt = now;
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
  return true;
})()`;

const ev = <T>(s: SeatSession, js: string): Promise<T> => s.page.evaluate(js) as Promise<T>;
const watch = (s: SeatSession) => ev<boolean>(s, WATCH);
const readWatch = (s: SeatSession) => ev<Watch | null>(s, 'window.__finalMove || null');
const animTrace = (s: SeatSession) => ev<Mark[]>(s, 'window.__severgrow.animLog()');
const titleOf = (s: SeatSession) =>
  ev<string>(s, '(() => { const el = document.getElementById("go-title"); return el ? (el.textContent || "").trim() : ""; })()');
const goOtherVisible = (s: SeatSession) =>
  ev<boolean>(s, '(() => { const b = document.getElementById("go-other"); return !!b && b.getClientRects().length > 0 && !b.hidden; })()');
const onlineNow = (s: SeatSession) =>
  ev<{ queued: number; pumping: boolean; finished: boolean; revealing: boolean } | null>(s, `(() => {
    const o = window.__severgrow && window.__severgrow.online ? window.__severgrow.online() : null;
    return o ? { queued: o.queued, pumping: o.pumping, finished: o.finished, revealing: o.revealing } : null;
  })()`);

const shot = async (s: SeatSession, name: string): Promise<boolean> => {
  try {
    await s.page.screenshot({ path: `${OUT}/${name}.png` });
    return true;
  } catch {
    return false;
  }
};

/** Keep the seats abreast of the API driver, so the last turn is watched live (not a backlog). */
const settleSeats = async (seats: readonly SeatSession[], cap = 2_500): Promise<void> => {
  await Promise.all(seats.map((s) => waitIdle(s, cap)));
};

const SETTLED = new Set(['end', 'turn', 'sync']);
const lastVisualStep = (marks: readonly Mark[], before: number | null): Mark | null => {
  let last: Mark | null = null;
  for (const m of marks) {
    if (m.ev !== 'step') continue;
    if (SETTLED.has(String(m.k))) continue;
    if (before !== null && m.t > before + 1) continue;
    last = m;
  }
  return last;
};

type Ending = {
  label: string;
  viewport: string;
  seats: [SeatSession, SeatSession];
  winnerSeat: 0 | 1 | null;
  /** Frame the plate rose on each seat, in page time (null = never). */
  watchers: [Watch | null, Watch | null];
};

/** The measurement every scenario reports, for each seat. */
const reportSeat = (ending: Ending, seat: 0 | 1, marks: readonly Mark[], role: string): void => {
  const w = ending.watchers[seat];
  const seatLabel = `${ending.label} · ${ending.viewport} · ${role}`;
  if (!w) {
    check(`${seatLabel}: the page was instrumented`, false, 'no watch log');
    return;
  }
  check(`${seatLabel}: the result plate arrived`, w.veilAt !== null, `veilAt=${w.veilAt === null ? 'never' : Math.round(w.veilAt)}`);
  const last = lastVisualStep(marks, w.veilAt);
  const afterMove = last && w.veilAt !== null ? w.veilAt - last.t : null;
  const afterDecision = w.finishedAt !== null && w.veilAt !== null ? w.veilAt - w.finishedAt : null;
  if (last) {
    check(
      `${seatLabel}: the final move landed BEFORE the plate`,
      w.veilAt !== null && last.t <= w.veilAt,
      `move ${last.k} at ${Math.round(last.t)} ms, plate at ${w.veilAt === null ? 'never' : Math.round(w.veilAt)} ms`,
    );
    check(
      `${seatLabel}: the plate was actually HELD for that move (not luck)`,
      marks.some((m) => m.ev === 'result:hold'),
      'result:hold in the animation trace',
    );
    check(
      `${seatLabel}: plate followed the move immediately (≤ ${MAX_AFTER_MOVE_MS} ms)`,
      afterMove !== null && afterMove <= MAX_AFTER_MOVE_MS,
      `${afterMove === null ? 'n/a' : Math.round(afterMove)} ms after the ${last.k} step (step played ${last.ms} ms)`,
    );
  } else {
    // A finish decided without a move on the board (timeout, resignation): the plate is the whole
    // event, so there is nothing to wait for.
    check(
      `${seatLabel}: no move to show, so the plate did not wait`,
      afterDecision !== null && afterDecision <= MAX_AFTER_DECISION_MS,
      `${afterDecision === null ? 'n/a' : Math.round(afterDecision)} ms after the page learned the result`,
    );
  }
  if (afterMove !== null) {
    say(`      ${seatLabel}: last visual step ${String(last!.k)} (${Math.round(Number(last!.ms))} ms) → plate ${Math.round(afterMove)} ms later`);
  } else if (afterDecision !== null) {
    say(`      ${seatLabel}: page learned the result → plate ${Math.round(afterDecision)} ms`);
  }
};

// ---------------------------------------------------------------------------- driving the API

const winPolicy = (seat: Player, legal: readonly Action[], view: View): Action | undefined => {
  if (seat !== 0) return undefined;
  const oppHome: Coord = homeCoord(1, view.config);
  const tilesOf = (a: Action): Coord[] => (a.t === 'Sprout' ? [a.coord] : a.t === 'Bloom' ? a.hexes : []);
  return legal
    .filter((a) => a.t === 'Sprout' || a.t === 'Bloom')
    .map((a) => ({ a, d: Math.min(...tilesOf(a).map((c) => hexDistance(c, oppHome))) }))
    .sort((x, y) => x.d - y.d)[0]?.a;
};

const passPolicy = (): undefined => undefined;

/** Stage the winner's own finish: place anything EXCEPT a move that would already win. */
const stagingPolicy = (seat: Player, legal: readonly Action[], view: View): Action | undefined => {
  if (seat !== 0) return undefined;
  const shadow = shadowFromView(view);
  const oppHome: Coord = homeCoord(1, view.config);
  const tilesOf = (a: Action): Coord[] => (a.t === 'Sprout' ? [a.coord] : a.t === 'Bloom' ? a.hexes : []);
  return legal
    .filter((a) => (a.t === 'Sprout' || a.t === 'Bloom') && !isStrangled(apply(shadow, a), 1))
    .map((a) => ({ a, d: Math.min(...tilesOf(a).map((c) => hexDistance(c, oppHome))) }))
    .sort((x, y) => x.d - y.d)[0]?.a;
};

/** One API step: whoever can act submits the policy's pick (or Draw / EndAct / Discard). */
const submitOne = async (duel: LocalDuel, match: LocalMatch, policy: typeof winPolicy, batch: boolean): Promise<boolean> => {
  const views = await Promise.all(([0, 1] as const).map((s) => duel.api.getState(match.guests[s].token, match.matchId).then((r) => r.player)));
  if (views.some((v) => v.status === 'finished' || v.view.phase === 'GAME_OVER')) return false;
  const actorSeat = views.findIndex((v) => v.legalActions.length > 0);
  if (actorSeat < 0) return true;
  const view = views[actorSeat]!;
  const chosen = policy(actorSeat as Player, view.legalActions, view.view);
  const next =
    chosen ??
    view.legalActions.find((a) => a.t === 'Draw') ??
    view.legalActions.find((a) => a.t === 'EndAct') ??
    view.legalActions.find((a) => a.t === 'Discard');
  if (!next) return true;
  const placement = next.t === 'Sprout' || next.t === 'Bloom';
  const actions: Action[] = batch && placement ? [next, { t: 'EndAct' } as Action] : [next];
  try {
    await duel.api.submitAction(match.guests[actorSeat as 0 | 1].token, match.matchId, {
      expectedRevision: view.revision,
      requestId: `final-${Date.now()}-${Math.round(Math.random() * 1e6)}`,
      actions,
    });
  } catch {
    // A batched EndAct is refused when the placement itself already ended the match: the
    // placement alone is then the winning move, exactly as the winner's own page sends it.
    await duel.api.submitAction(match.guests[actorSeat as 0 | 1].token, match.matchId, {
      expectedRevision: view.revision,
      requestId: `final-retry-${Date.now()}-${Math.round(Math.random() * 1e6)}`,
      actions: [next],
    });
  }
  return true;
};

const twoSeats = async (
  duel: LocalDuel,
  match: LocalMatch,
  viewport: { width: number; height: number },
  options: { reduceMotion?: boolean; speed?: 'slow' | 'normal' | 'fast' | 'skip' } = {},
): Promise<[SeatSession, SeatSession]> => {
  const device = viewport.width >= 700 ? { hasTouch: false, isMobile: false } : {};
  const a = await openSeat(duel, match, 0, { viewport, ...device, ...(options.reduceMotion ? { reduceMotion: true } : {}), ...(options.speed ? { speed: options.speed } : {}) });
  const b = await openSeat(duel, match, 1, { viewport, ...device, ...(options.reduceMotion ? { reduceMotion: true } : {}), ...(options.speed ? { speed: options.speed } : {}) });
  await openDuel(a, match.matchId);
  say('      seat 0 is on the board');
  await openDuel(b, match.matchId);
  say('      seat 1 is on the board');
  await waitIdle(a);
  await waitIdle(b);
  await watch(a);
  await watch(b);
  return [a, b];
};

const waitVeil = async (s: SeatSession, timeout = 60_000): Promise<boolean> => {
  try {
    await s.page.waitForSelector('#gameover:not([hidden])', { timeout });
    return true;
  } catch {
    return false;
  }
};

/** The hex keys the board is drawing right now (the animation's own truth, in any perspective). */
const drawnKeys = (s: SeatSession): Promise<string[]> =>
  ev<string[]>(s, 'Array.from(document.querySelectorAll(".l-tiles .tile[data-key]")).map(function (el) { return el.getAttribute("data-key"); }).sort()');

/** A page expression that is true once the drawn board differs from `base` (the move, mid-flight). */
const boardChangedFrom = (base: readonly string[]): string =>
  `(function () { var now = Array.from(document.querySelectorAll(".l-tiles .tile[data-key]")).map(function (el) { return el.getAttribute("data-key"); }).sort(); return now.join("|") !== ${JSON.stringify(base.join('|'))}; })()`;

/**
 * A frame of the deciding move while the plate is still away, then the plate. The predicate is
 * page JS; the plate's own hidden state is checked again just before the shot, so a screenshot can
 * never be reported as "the move was visible first" if the plate had already covered it.
 */
const midMoveShot = async (s: SeatSession, predicate: string, name: string, timeout = 45_000): Promise<boolean> => {
  try {
    await s.page.waitForFunction(
      `(() => { const g = document.getElementById('gameover'); return !!g && g.hidden && (${predicate}); })()`,
      undefined,
      { timeout, polling: 25 },
    );
    // The plate must not be up while the move is on screen — that is the whole bug.
    const stillHidden = await ev<boolean>(s, '(() => { const g = document.getElementById("gameover"); return !!g && g.hidden; })()');
    await s.page.screenshot({ path: `${OUT}/${name}.png` });
    return stillHidden;
  } catch {
    return false;
  }
};

const closeSeats = async (seats: readonly SeatSession[]): Promise<void> => {
  for (const s of seats) await s.context.close().catch(() => undefined);
};

// ---------------------------------------------------------------------------- scenarios

say('      building the /futa0.5/ page and starting the local duel (about 40 s)…');
const duel = await startLocalDuel({ port: PORT, turnTimeoutMs: 24 * 3_600_000 });
say(`      local duel up on ${duel.origin}`);

/** 1. A KO on the board, both seats watching the same real finish at phone size. */
const koScenario = async (viewport = { width: 390, height: 844 }, viewportLabel = '390x844', reduceMotion = false): Promise<void> => {
  const label = reduceMotion ? 'KO (reduce motion)' : 'KO (surround)';
  const match = await duel.newMatch();
  const seats = await twoSeats(duel, match, viewport, { ...(reduceMotion ? { reduceMotion: true } : {}) });
  say(`      ${label} ${viewportLabel}: both seats playing`);
  try {
    let driven = 0;
    let base: [string[], string[]] = [[], []];
    let winnerMid: Promise<boolean> = Promise.resolve(false);
    let loserMid: Promise<boolean> = Promise.resolve(false);
    for (let step = 0; step < 220; step++) {
      // The board as the two seats are DRAWING it before this submission: the deciding move must
      // change it while the plate is still away, which is what the mid-move frame proves.
      base = [await drawnKeys(seats[0]), await drawnKeys(seats[1])];
      const alive = await submitOne(duel, match, winPolicy, true);
      driven++;
      if (!alive) break;
      const views = await Promise.all(([0, 1] as const).map((s) => duel.api.getState(match.guests[s].token, match.matchId).then((r) => r.player)));
      if (views.some((v) => v.status === 'finished' || v.view.phase === 'GAME_OVER')) {
        // This submission decided the duel. Its replay is about to reach both seats: watch now.
        if (!reduceMotion) {
          winnerMid = midMoveShot(seats[0], boardChangedFrom(base[0]), `win-mid-move-${viewportLabel}`);
          loserMid = midMoveShot(seats[1], boardChangedFrom(base[1]), `loss-mid-move-${viewportLabel}`);
        }
        break;
      }
      // Keep the pages current: the deciding turn must be a live replay, not a backlog flush.
      if (step % 2 === 0) await settleSeats(seats, 1_200);
    }
    say(`      ${label} ${viewportLabel}: the server finished after ${driven} API actions`);
    const [shownA, shownB] = await Promise.all([waitVeil(seats[0]), waitVeil(seats[1])]);
    const [midA, midB] = await Promise.all([winnerMid, loserMid]);
    check(`${label} ${viewportLabel}: both seats reached the plate`, shownA && shownB);
    if (!reduceMotion) {
      check(`${label} ${viewportLabel}: the WINNER's frame shows the move with the plate still away`, midA, `win-mid-move-${viewportLabel}.png`);
      check(`${label} ${viewportLabel}: the LOSER's frame shows the move with the plate still away`, midB, `loss-mid-move-${viewportLabel}.png`);
    }
    await sleep(250);
    await shot(seats[0], `win-card-${viewportLabel}`);
    await shot(seats[1], `loss-card-${viewportLabel}`);
    const watchers: [Watch | null, Watch | null] = [await readWatch(seats[0]), await readWatch(seats[1])];
    const marks: [Mark[], Mark[]] = [await animTrace(seats[0]), await animTrace(seats[1])];
    const titles: [string, string] = [await titleOf(seats[0]), await titleOf(seats[1])];
    const result = (await duel.api.getState(match.guests[0].token, match.matchId)).player.result;
    check(`${label} ${viewportLabel}: the finish really was a KO`, result?.reason === 'strangle', String(result?.reason));
    check(`${label} ${viewportLabel}: one winner and one loser`, /won/i.test(titles[0]) && /lost/i.test(titles[1]), `${titles[0]} / ${titles[1]}`);
    check(`${label} ${viewportLabel}: the loser's plate still offers the way back`, await goOtherVisible(seats[1]));
    if (reduceMotion) {
      for (const [i, w] of watchers.entries()) {
        const wait = w && w.finishedAt !== null && w.veilAt !== null ? w.veilAt - w.finishedAt : null;
        check(
          `${label} ${viewportLabel} · ${i === 0 ? 'winner' : 'loser'}: Reduce motion does not wait for a flight`,
          wait !== null && wait <= MAX_AFTER_DECISION_MS,
          wait === null ? 'n/a' : `${Math.round(wait)} ms after the page learned the result`,
        );
      }
    }
    reportSeat({ label, viewport: viewportLabel, seats, winnerSeat: 0, watchers }, 0, marks[0], 'winner');
    reportSeat({ label, viewport: viewportLabel, seats, winnerSeat: 0, watchers }, 1, marks[1], 'loser');
  } finally {
    await closeSeats(seats);
  }
};

/** 2. The WINNER plays the deciding move on its own page (desktop size). */
const ownWinningMove = async (viewport = { width: 1280, height: 800 }, viewportLabel = '1280x800'): Promise<void> => {
  const match = await duel.newMatch();
  const seats = await twoSeats(duel, match, viewport);
  const [me, them] = seats;
  try {
    // Stage a position where seat 0 has a winning Sprout whose card is NOT in a Bloom recipe
    // (the documented two-tap Grow: pick the card, then the hex).
    let staged: { card: number; key: string } | null = null;
    for (let step = 0; step < 400 && !staged; step++) {
      const views = await Promise.all(([0, 1] as const).map((s) => duel.api.getState(match.guests[s].token, match.matchId).then((r) => r.player)));
      if (views.some((v) => v.status === 'finished' || v.view.phase === 'GAME_OVER')) break;
      const actorSeat = views.findIndex((v) => v.legalActions.length > 0);
      if (actorSeat < 0) {
        await sleep(120);
        continue;
      }
      const view = views[actorSeat]!;
      if (actorSeat === 0 && view.view.phase === 'ACT') {
        const shadow = shadowFromView(view.view);
        const inBloom = new Set<number>();
        for (const a of view.legalActions) if (a.t === 'Bloom') for (const c of a.cards) inBloom.add(c);
        const wins = view.legalActions.filter(
          (a): a is Extract<Action, { t: 'Sprout' }> => a.t === 'Sprout' && !inBloom.has(a.card) && !!isStrangled(apply(shadow, a), 1),
        );
        if (wins.length) {
          staged = { card: wins[0]!.card, key: coordKey(wins[0]!.coord) };
          break;
        }
      }
      await submitOne(duel, match, stagingPolicy, true);
      await waitIdle(me, 20_000);
      await waitIdle(them, 20_000);
    }
    check('own winning move: a winning placement was staged for the winner', !!staged, staged ? `card ${staged.card} at ${staged.key}` : 'not found');
    if (!staged) return;
    await waitIdle(me);
    // The board each seat is drawing before the winner's own move: it must change while the plate
    // is still away (that frame is the owner's own case — the winner sees their move land too).
    const baseWin = await drawnKeys(me);
    const baseLoss = await drawnKeys(them);
    const midWin = midMoveShot(me, boardChangedFrom(baseWin), `win-own-move-mid-${viewportLabel}`);
    const midLoss = midMoveShot(them, boardChangedFrom(baseLoss), `loss-mid-move-${viewportLabel}`);
    // The owner's own gesture: pick the card, tap the hex, throw the turn.
    const cardPoint = await exposedPoint(me, `#hand [data-card="${staged.card}"]`);
    check('own winning move: the winning card is tappable on the winner page', !!cardPoint);
    if (!cardPoint) return;
    await touchTap(me, cardPoint);
    await sleep(350);
    const hexPoint = await exposedPoint(me, `#board .hex-cell[data-key="${staged.key}"]`);
    check('own winning move: the winning hex is tappable on the winner page', !!hexPoint);
    if (!hexPoint) return;
    await touchTap(me, hexPoint);
    await sleep(900);
    // A winning placement that ends the match is committed at once; if the turn is still ACT,
    // throw it through the page's own control (the same batch a normal turn sends).
    for (let i = 0; i < 12; i++) {
      const phase = await ev<string>(me, '(() => { const s = window.__severgrow.state(); return s ? s.phase : ""; })()');
      const o = await onlineNow(me);
      if (o?.finished || phase === 'GAME_OVER') break;
      if (phase === 'ACT') {
        await ev<boolean>(me, '(() => { const b = document.querySelector("#moves .end, #moves .futa04-skip, .futa04-skip, .end"); if (!b || b.disabled) return false; b.click(); return true; })()');
      } else if (phase === 'DISCARD') {
        const card = await ev<number | null>(me, '(() => { const d = window.__severgrow.legal().filter(function (a) { return a.t === "Discard"; })[0]; return d ? d.card : null; })()');
        if (card === null) break;
        const p = await exposedPoint(me, `#hand [data-card="${card}"]`);
        if (!p) break;
        await touchTap(me, p);
      }
      await sleep(500);
    }
    const [shownA, shownB] = await Promise.all([waitVeil(me), waitVeil(them)]);
    const [midA, midB] = await Promise.all([midWin, midLoss]);
    check(`${`own winning move`} ${viewportLabel}: both seats reached the plate`, shownA && shownB);
    check(`${`own winning move`} ${viewportLabel}: the winner's own move was on screen first`, midA, `win-own-move-mid-${viewportLabel}.png`);
    check(`${`own winning move`} ${viewportLabel}: the loser saw the move with the plate still away`, midB, `loss-mid-move-${viewportLabel}.png`);
    await sleep(250);
    await shot(me, `win-own-move-card-${viewportLabel}`);
    await shot(them, `loss-card-${viewportLabel}`);
    const watchers: [Watch | null, Watch | null] = [await readWatch(me), await readWatch(them)];
    const marks: [Mark[], Mark[]] = [await animTrace(me), await animTrace(them)];
    reportSeat({ label: 'own winning move', viewport: viewportLabel, seats, winnerSeat: 0, watchers }, 0, marks[0], 'winner');
    reportSeat({ label: 'own winning move', viewport: viewportLabel, seats, winnerSeat: 0, watchers }, 1, marks[1], 'loser');
  } finally {
    await closeSeats(seats);
  }
};

/** 3. A timeout: no move exists, so the plate must not wait for one. */
const timeoutScenario = async (): Promise<void> => {
  say('      timeout: building a short-turn duel (its own API + page build)…');
  const short = await startLocalDuel({ port: PORT_SHORT, turnTimeoutMs: 3_200 });
  const match = await short.newMatch();
  const seats = await twoSeats(short, match, { width: 390, height: 844 });
  try {
    const [shownA, shownB] = await Promise.all([waitVeil(seats[0], 90_000), waitVeil(seats[1], 90_000)]);
    check('timeout 390x844: both seats reached the plate', shownA && shownB);
    await sleep(250);
    await shot(seats[0], 'timeout-card-390x844');
    const watchers: [Watch | null, Watch | null] = [await readWatch(seats[0]), await readWatch(seats[1])];
    const marks: [Mark[], Mark[]] = [await animTrace(seats[0]), await animTrace(seats[1])];
    const titles: [string, string] = [await titleOf(seats[0]), await titleOf(seats[1])];
    say(`      timeout: titles ${JSON.stringify(titles)}`);
    reportSeat({ label: 'timeout', viewport: '390x844', seats, winnerSeat: 0, watchers }, 0, marks[0], 'winner');
    reportSeat({ label: 'timeout', viewport: '390x844', seats, winnerSeat: 0, watchers }, 1, marks[1], 'loser');
  } finally {
    await closeSeats(seats);
    await short.close();
  }
};

/** 4. A resignation: no move exists, and it must never hang. */
const resignScenario = async (): Promise<void> => {
  const match = await duel.newMatch();
  const seats = await twoSeats(duel, match, { width: 390, height: 844 });
  const [winner, loser] = seats;
  try {
    loser.page.once('dialog', (d) => void d.accept());
    await loser.page.click('#hud-menu');
    await loser.page.waitForSelector('#sheet-menu:not([hidden])', { timeout: 8_000 });
    await ev<boolean>(loser, '(() => { const x = document.getElementById("gm-resign"); if (x) { x.click(); return true; } return false; })()');
    const [shownA, shownB] = await Promise.all([waitVeil(winner, 45_000), waitVeil(loser, 45_000)]);
    check('resign 390x844: both seats reached the plate', shownA && shownB);
    await sleep(250);
    await shot(winner, 'resign-win-card-390x844');
    await shot(loser, 'resign-loss-card-390x844');
    const watchers: [Watch | null, Watch | null] = [await readWatch(winner), await readWatch(loser)];
    const marks: [Mark[], Mark[]] = [await animTrace(winner), await animTrace(loser)];
    reportSeat({ label: 'resign', viewport: '390x844', seats, winnerSeat: 0, watchers }, 0, marks[0], 'winner');
    reportSeat({ label: 'resign', viewport: '390x844', seats, winnerSeat: 0, watchers }, 1, marks[1], 'loser');
  } finally {
    await closeSeats(seats);
  }
};

/** 5. A draw: nobody places anything, so both decks run out / the turn limit is reached. */
const drawScenario = async (): Promise<void> => {
  const match = await duel.newMatch();
  const seats = await twoSeats(duel, match, { width: 390, height: 844 }, { speed: 'fast' });
  try {
    for (let step = 0; step < 400; step++) {
      const alive = await submitOne(duel, match, passPolicy, false);
      if (!alive) break;
      // Keep the seats current, so the finish is a real turn and not a backlog replay.
      if (step % 4 === 0) {
        await waitIdle(seats[0], 6_000);
        await waitIdle(seats[1], 6_000);
      }
    }
    const [shownA, shownB] = await Promise.all([waitVeil(seats[0], 90_000), waitVeil(seats[1], 90_000)]);
    check('draw 390x844: both seats reached the plate', shownA && shownB);
    await sleep(250);
    await shot(seats[0], 'draw-card-390x844');
    await shot(seats[1], 'draw-card-loser-seat-390x844');
    const titles: [string, string] = [await titleOf(seats[0]), await titleOf(seats[1])];
    const reasons: [string, string] = [
      await ev<string>(seats[0], '(() => { const el = document.getElementById("go-reason"); return el ? (el.textContent || "").trim() : ""; })()'),
      await ev<string>(seats[1], '(() => { const el = document.getElementById("go-reason"); return el ? (el.textContent || "").trim() : ""; })()'),
    ];
    say(`      draw: titles ${JSON.stringify(titles)} reasons ${JSON.stringify(reasons)}`);
    const watchers: [Watch | null, Watch | null] = [await readWatch(seats[0]), await readWatch(seats[1])];
    const marks: [Mark[], Mark[]] = [await animTrace(seats[0]), await animTrace(seats[1])];
    reportSeat({ label: `draw (${reasons[0] || 'no reason'})`, viewport: '390x844', seats, winnerSeat: null, watchers }, 0, marks[0], 'seat 0');
    reportSeat({ label: `draw (${reasons[0] || 'no reason'})`, viewport: '390x844', seats, winnerSeat: null, watchers }, 1, marks[1], 'seat 1');
  } finally {
    await closeSeats(seats);
  }
};

/** 6. A client that opens an ALREADY-FINISHED match cold has nothing to animate. */
const coldScenario = async (): Promise<void> => {
  const match = await duel.newMatch();
  const seats = await twoSeats(duel, match, { width: 390, height: 844 });
  const [winner, loser] = seats;
  try {
    await duel.api.resign(match.guests[1].token, match.matchId);
    check('cold: the match really finished', await waitVeil(winner, 45_000));
    await loser.context.close();
    // A fresh page for the same seat, opening the finished match from the list.
    const again = await openSeat(duel, match, 1, { viewport: { width: 390, height: 844 } });
    try {
      await watch(again);
      const t0 = Date.now();
      await openDuel(again, match.matchId);
      const shown = await waitVeil(again, 20_000);
      const elapsed = Date.now() - t0;
      const w = await readWatch(again);
      const seen = w && w.veilAt !== null ? w.veilAt : null;
      check('cold 390x844: a finished match opened cold shows the plate', shown, `${elapsed} ms from the lobby row to the plate`);
      check('cold 390x844: it does not wait for a move it never saw', shown && elapsed < 5_000, `${elapsed} ms`);
      // Nothing was queued: the board was already final, so there was nothing to replay.
      const o = await onlineNow(again);
      check('cold 390x844: nothing is left animating', !!o && o.queued === 0 && !o.pumping, JSON.stringify(o));
      check('cold 390x844: the plate is on screen now', seen !== null);
      await shot(again, 'cold-reconnect-card-390x844');
      // The Seeds line and the ways out are still on the cold card.
      const parts = await ev<{ other: boolean; score: string; seedsHidden: boolean }>(again, `(() => {
        const other = document.getElementById('go-other');
        const score = document.getElementById('go-score');
        const seeds = document.getElementById('go-seeds');
        return { other: !!other && !other.hidden, score: score ? (score.textContent || '').trim() : '', seedsHidden: seeds ? !!seeds.hidden : true };
      })()`);
      check('cold 390x844: the card is complete (back control + score)', parts.other && parts.score.length > 0, JSON.stringify(parts));
    } finally {
      await again.context.close();
    }
  } finally {
    await closeSeats([winner]);
  }
};

try {
  // Fastest first, so the evidence arrives early; the timeout rebuilds the page, so it is last.
  await guard('resign', resignScenario);
  await guard('KO 390x844', () => koScenario({ width: 390, height: 844 }, '390x844'));
  await guard('own winning move 1280x800', () => ownWinningMove({ width: 1280, height: 800 }, '1280x800'));
  await guard('draw 390x844', drawScenario);
  await guard('KO reduce motion 390x844', () => koScenario({ width: 390, height: 844 }, '390x844', true));
  await guard('cold reconnect 390x844', coldScenario);
  // Last, because it rebuilds the served page for its own short-turn API (see the note above).
  await guard('timeout 390x844', timeoutScenario);
} catch (error) {
  failed++;
  console.error('FAIL  the suite threw:', error instanceof Error ? error.stack ?? error.message : String(error));
} finally {
  await duel.close();
}

say(`\n${failed ? `${failed} checks failed` : 'Every finish showed the move first, on both seats.'}  (${checks} checks passed)`);
if (failed) process.exit(1);
