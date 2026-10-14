// FUTASAKU — a finished match must reach BOTH devices at the same time.
//
//   npx tsx web/e2e/online-finish-both-devices.ts
//
// The owner: "when 1 player wins and gets 'finished' end of game screen - the player device he won
// against is not getting it straight away - its waiting for the turn to time out … if 1 player wins
// through KO - both players get end of game screen, 1 as winner, 1 as loser … same through
// traditional deck ran out".
//
// This drives each ending with both devices open on their own page and measures the skew between
// the two end-of-game screens: surround/KO (including a winning move inside a Throw batch), the
// deck running out (the fair-last-turn ending), and a resign. Neither device may be left on the
// board waiting.
import { mkdirSync } from 'node:fs';
import type { Action, Coord, Player, View } from '../../src/engine/index.js';
import { hexDistance, homeCoord } from '../../src/engine/index.js';
import type { LocalDuel, LocalMatch, SeatSession } from './helpers/local-duel.js';
import { openDuel, openSeat, sleep, startLocalDuel } from './helpers/local-duel.js';

const OUT = new URL('../../docs/screens/online/', import.meta.url).pathname;
const PORT = Number(process.env.PREVIEW_PORT ?? 4235);
/** A decision must reach both devices within this: nowhere near a turn deadline. */
const MAX_SKEW_MS = 6_000;
mkdirSync(OUT, { recursive: true });

let failed = 0;
const check = (name: string, ok: boolean, note = ''): void => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? `  (${note})` : ''}`);
};

const finishedAt = (s: SeatSession, timeout: number): Promise<number> =>
  s.page
    .waitForFunction('(() => { const g = document.getElementById("gameover"); return !!g && !g.hidden; })()', undefined, { timeout })
    .then(() => Date.now())
    .catch(() => Number.NaN);

const title = (s: SeatSession): Promise<string> =>
  s.page.evaluate('(() => { const el = document.getElementById("go-title"); return el ? (el.textContent || "").trim() : ""; })()') as Promise<string>;

const onBoard = (s: SeatSession): Promise<boolean> =>
  s.page.evaluate('(() => { const g = document.getElementById("gameover"); return !!document.getElementById("game") && !document.getElementById("game").hidden && (!g || g.hidden); })()') as Promise<boolean>;

type Ending = { reason: string; skewMs: number; titles: [string, string]; shot: string };

/** Play the match through the API with a policy, timing both devices' end screens. */
const playToEnd = async (
  duel: LocalDuel,
  match: LocalMatch,
  seats: [SeatSession, SeatSession],
  policy: (seat: Player, legal: readonly Action[], view: View) => Action | undefined,
  batch: boolean,
): Promise<{ reason: string; shown: [number, number] } | null> => {
  const shown: [number, number] = [Number.NaN, Number.NaN];
  const timers = [finishedAt(seats[0], 240_000), finishedAt(seats[1], 240_000)];
  const timersApplied = timers.map((p, i) =>
    p.then((at) => {
      shown[i] = at;
    }),
  );
  let reason = '';
  for (let step = 0; step < 800; step++) {
    const views = await Promise.all(([0, 1] as const).map((s) => duel.api.getState(match.guests[s].token, match.matchId).then((r) => r.player)));
    const finished = views.find((v) => v.status === 'finished' || v.view.phase === 'GAME_OVER');
    if (finished) {
      reason = String(finished.result?.reason ?? 'unknown');
      break;
    }
    const actorSeat = views.findIndex((v) => v.legalActions.length > 0);
    if (actorSeat < 0) {
      await sleep(200);
      continue;
    }
    const view = views[actorSeat]!;
    const chosen = policy(actorSeat as Player, view.legalActions, view.view);
    const next =
      chosen ??
      (view.legalActions.find((a) => a.t === 'Draw') ?? view.legalActions.find((a) => a.t === 'EndAct') ?? view.legalActions.find((a) => a.t === 'Discard'));
    if (!next) {
      await sleep(200);
      continue;
    }
    const isPlacement = next.t === 'Sprout' || next.t === 'Bloom';
    const actions: Action[] = batch && isPlacement ? [next, { t: 'EndAct' } as Action] : [next];
    try {
      await duel.api.submitAction(match.guests[actorSeat as 0 | 1].token, match.matchId, {
        expectedRevision: view.revision,
        requestId: `finish-${step}-${Date.now()}`,
        actions,
      });
    } catch {
      // The batched EndAct can be refused when the placement already ended the match; the
      // placement alone is then the winning move, exactly as the winner's own device sends it.
      await duel.api.submitAction(match.guests[actorSeat as 0 | 1].token, match.matchId, {
        expectedRevision: view.revision,
        requestId: `finish-retry-${step}-${Date.now()}`,
        actions: [next],
      });
    }
    if (Number.isFinite(shown[0]) || Number.isFinite(shown[1])) break;
  }
  await Promise.race([Promise.all(timersApplied), sleep(120_000)]);
  if (!reason) return null;
  return { reason, shown };
};

const report = (label: string, ending: Ending | null): void => {
  if (!ending) {
    check(`${label}: the duel reached a finish`, false);
    return;
  }
  const [a, b] = ending.titles;
  const skew = ending.skewMs;
  check(`${label}: BOTH devices reached the end screen`, Number.isFinite(ending.skewMs), `titles ${JSON.stringify(ending.titles)}`);
  check(`${label}: neither device was left on the board`, a.length > 0 && b.length > 0, `titles ${JSON.stringify(ending.titles)}`);
  // A decided match shows one winner and one loser; a match that runs out level shows the draw
  // word on both. Either way neither device may sit on the board.
  const opposite = /won/i.test(a) && /lost/i.test(b) || /lost/i.test(a) && /won/i.test(b);
  const drawn = a === b && /draw/i.test(a);
  check(`${label}: one as winner and one as loser (or a draw on both)`, opposite || drawn, `${a} / ${b}`);
  check(`${label}: the two screens arrived within ${MAX_SKEW_MS} ms`, Number.isFinite(skew) && skew <= MAX_SKEW_MS, `skew ${Math.round(skew)} ms`);
  console.log(`      ${label}: reason=${ending.reason} skew=${Math.round(skew)} ms titles=${JSON.stringify(ending.titles)}`);
};

const withMatch = async (
  duel: LocalDuel,
  label: string,
  policy: (seat: Player, legal: readonly Action[], view: View) => Action | undefined,
  batch: boolean,
  shot: string,
): Promise<void> => {
  const match = await duel.newMatch();
  const a = await openSeat(duel, match, 0, { hasTouch: true, isMobile: true });
  const b = await openSeat(duel, match, 1, { hasTouch: true, isMobile: true });
  try {
    await openDuel(a, match.matchId);
    await openDuel(b, match.matchId);
    const started = Date.now();
    const end = await playToEnd(duel, match, [a, b], policy, batch);
    const titles: [string, string] = [await title(a), await title(b)];
    const shown: [number, number] = [end?.shown[0] ?? Number.NaN, end?.shown[1] ?? Number.NaN];
    report(label, end ? { reason: end.reason, skewMs: Math.abs(shown[0] - shown[1]), titles, shot } : null);
    await openSeatScreenshot(a, shot);
    console.log(`      (played for ${Math.round((Date.now() - started) / 1000)} s)`);
  } finally {
    await a.context.close();
    await b.context.close();
  }
};

const openSeatScreenshot = async (s: SeatSession, name: string): Promise<void> => {
  await s.page.screenshot({ path: `${OUT}${name}.jpg`, type: 'jpeg', quality: 82 }).catch(() => undefined);
};

const duel: LocalDuel = await startLocalDuel({ port: PORT });
try {
  // ---------------- 1. KO (surround): the winner marches on the enemy home, one Throw batch at a
  // time. This is the owner's "1 player wins through KO".
  await withMatch(
    duel,
    'KO (surround, a winning move inside a Throw batch)',
    (seat, legal, view) => {
      if (seat !== 0) return undefined;
      const oppHome: Coord = homeCoord(1, view.config);
      const tilesOf = (a: Action): Coord[] => (a.t === 'Sprout' ? [a.coord] : a.t === 'Bloom' ? a.hexes : []);
      const best = legal
        .filter((a) => a.t === 'Sprout' || a.t === 'Bloom')
        .map((a) => ({ a, d: Math.min(...tilesOf(a).map((c) => hexDistance(c, oppHome))) }))
        .sort((x, y) => x.d - y.d)[0];
      return best?.a;
    },
    true,
    'finish-both-ko',
  );

  // ---------------- 2. the deck runs out (the fair-last-turn ending): nobody places anything.
  await withMatch(duel, 'deck ran out (turn limit)', () => undefined, false, 'finish-both-deck');

  // ---------------- 3. resigned, from the loser's own pause menu.
  {
    const match = await duel.newMatch();
    const a = await openSeat(duel, match, 0, { hasTouch: true, isMobile: true });
    const b = await openSeat(duel, match, 1, { hasTouch: true, isMobile: true });
    try {
      await openDuel(a, match.matchId);
      await openDuel(b, match.matchId);
      // Resigning asks for a confirmation the owner's own dialog answers; accept it here.
      a.page.once('dialog', (d) => void d.accept());
      const tA = finishedAt(a, 60_000);
      const tB = finishedAt(b, 60_000);
      await a.page.click('#hud-menu');
      await a.page.waitForSelector('#sheet-menu:not([hidden])', { timeout: 8_000 });
      await a.page.evaluate(`(() => { const x = document.getElementById('gm-resign'); if (x) x.click(); })()`);
      const [atA, atB] = await Promise.all([tA, tB]);
      report('resigned', { reason: 'resigned', skewMs: Math.abs(atA - atB), titles: [await title(a), await title(b)], shot: 'finish-both-resign' });
      await openSeatScreenshot(b, 'finish-both-resign');
    } finally {
      await a.context.close();
      await b.context.close();
    }
  }

  // ---------------- 4. the loser is never left on the board once the match is over ------------
  {
    const match = await duel.newMatch();
    const a = await openSeat(duel, match, 0, { hasTouch: true, isMobile: true });
    const b = await openSeat(duel, match, 1, { hasTouch: true, isMobile: true });
    try {
      await openDuel(a, match.matchId);
      await openDuel(b, match.matchId);
      const end = await playToEnd(
        duel,
        match,
        [a, b],
        (seat, legal, view) => {
          if (seat !== 0) return undefined;
          const oppHome: Coord = homeCoord(1, view.config);
          const tilesOf = (x: Action): Coord[] => (x.t === 'Sprout' ? [x.coord] : x.t === 'Bloom' ? x.hexes : []);
          const best = legal
            .filter((x) => x.t === 'Sprout' || x.t === 'Bloom')
            .map((x) => ({ x, d: Math.min(...tilesOf(x).map((c) => hexDistance(c, oppHome))) }))
            .sort((p, q) => p.d - q.d)[0];
          return best?.x;
        },
        true,
      );
      check('the deciding move was a surround', end?.reason === 'strangle', String(end?.reason));
      check('neither device is left on the board after the finish', !(await onBoard(a)) && !(await onBoard(b)), `A on board ${await onBoard(a)}, B on board ${await onBoard(b)}`);
    } finally {
      await a.context.close();
      await b.context.close();
    }
  }
} finally {
  await duel.close();
}

if (failed) {
  console.error(`\n${failed} symmetric-finish checks failed`);
  process.exit(1);
}
console.log('\nEvery ending reached both devices together, one winner and one loser.');
