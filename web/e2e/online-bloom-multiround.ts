// FUTASAKU 0.5 — the seat-1 Bloom/Grow stall, reproduced the way the playtest hit it.
//
//   npx tsx web/e2e/online-bloom-multiround.ts
//
// The owner: "tested on 2 devices … the device that JOINED the duel — after 2 or 3 rounds wasn't
// able to bloom or grow during grow turn. I would pick the bloom icon, draw the path on board and
// it wouldn't place it."
//
// Seat 1 is the JOINED device, and its board is mirrored 180°. A mirrored board enumerates a SET
// Bloom's hexes in the reverse order of the engine's own list, so the local draft refused a
// correctly painted set Bloom (it compared the two actions by exact JSON) and the shape vanished
// with no reason — the "it wouldn't place it" report. Seat 0 was never affected.
//
// This drives BOTH seats' real pages, with real touch input, painting a Bloom on FIVE CONSECUTIVE
// turns each — not one — and asserts every painted Bloom reaches the local draft AND, after the
// Throw, the server board. It failed on seat 1 before the fix, on every set recipe.
import { mkdirSync } from 'node:fs';
import type { Action } from '../../src/engine/index.js';
import { coordKey, hexDistance, homeCoord } from '../../src/engine/index.js';
import type { LocalDuel, LocalMatch, SeatSession } from './helpers/local-duel.js';
import { endTurnViaPage, openDuel, openSeat, readOnline, sleep, startLocalDuel } from './helpers/local-duel.js';

const OUT = new URL('../../docs/screens/online/', import.meta.url).pathname;
const PORT = Number(process.env.PREVIEW_PORT ?? 4233);
const ROUNDS = Number(process.env.ROUNDS ?? 5);
mkdirSync(OUT, { recursive: true });

let failed = 0;
const check = (name: string, ok: boolean, note = ''): void => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? `  (${note})` : ''}`);
};

const ev = <T>(s: SeatSession, js: string): Promise<T> => s.page.evaluate(js) as Promise<T>;

const litHexes = (s: SeatSession): Promise<string[]> =>
  ev(s, `(() => Array.prototype.map.call(document.querySelectorAll('#board .l-over [data-key]'), function (el) { return el.getAttribute('data-key'); }))()`);

const ghostTiles = (s: SeatSession): Promise<number> =>
  ev(s, `(() => document.querySelectorAll('#board .l-draw .draw-ghost[data-key]').length)()`);

const drawInfo = (s: SeatSession): Promise<string> =>
  ev(s, `(() => { const b = document.getElementById('draw-info'); return b && !b.hidden ? (b.textContent || '').trim() : ''; })()`);

const pointOfHex = (s: SeatSession, key: string): Promise<{ x: number; y: number } | null> =>
  ev(s, `(() => { const el = document.querySelector('#board .hex-cell[data-key="${key}"]'); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);

const draftActions = (s: SeatSession, matchId: string): Promise<Action[] | null> =>
  s.page.evaluate((id) => {
    try {
      const raw = sessionStorage.getItem(`severgrow.duel.draft.v1.${id}`);
      return raw ? (JSON.parse(raw) as { actions: Action[] }).actions : null;
    } catch {
      return null;
    }
  }, matchId);

const draftBloom = async (s: SeatSession, matchId: string): Promise<Extract<Action, { t: 'Bloom' }> | null> =>
  ((await draftActions(s, matchId)) ?? []).find((a): a is Extract<Action, { t: 'Bloom' }> => a.t === 'Bloom') ?? null;

/** Press the page's own Bloom control for `kind` (the owner's gesture: pick bloom, then paint). */
const pressBloomControl = (s: SeatSession, kind: string): Promise<boolean> =>
  ev(s, `(() => {
    const k = ${JSON.stringify(kind)};
    const visible = function (el) { return !!el && el.offsetParent !== null; };
    let btn = document.querySelector('#moves [data-kind="' + k + '"]');
    if (visible(btn)) { btn.click(); return true; }
    const toggle = document.querySelector('#moves .bloom-toggle');
    if (toggle) { toggle.click(); btn = document.querySelector('#moves [data-kind="' + k + '"]'); if (btn) { btn.click(); return true; } }
    return false;
  })()`);

/** Advance the duel through the API until `seat` is in the Grow step holding a legal Bloom. */
const advanceToBloom = async (duel: LocalDuel, match: LocalMatch, seat: 0 | 1, maxSteps = 240): Promise<{ cards: number[]; hexes: { q: number; r: number }[]; set: boolean } | null> => {
  for (let step = 0; step < maxSteps; step++) {
    const views = await Promise.all(([0, 1] as const).map((s) => duel.api.getState(match.guests[s].token, match.matchId).then((r) => r.player)));
    const mine = views[seat]!;
    if (mine.status === 'finished' || mine.view.phase === 'GAME_OVER') return null;
    if (mine.view.actor === seat && mine.view.phase === 'ACT') {
      const blooms = mine.legalActions.filter((a): a is Extract<Action, { t: 'Bloom' }> => a.t === 'Bloom');
      const rankOf = (id: number) => mine.view.hand.find((c) => c.id === id)?.rank ?? 0;
      const isSet = (a: Extract<Action, { t: 'Bloom' }>) => a.cards.length > 1 && new Set(a.cards.map(rankOf)).size === 1;
      // A SET recipe is the case the playtest hit (the page enumerates its hexes in the reverse of
      // the engine's order on the mirrored seat), so the run paints a set whenever the hand allows
      // one; a run-only hand is painted too, and reported.
      const sets = blooms.filter(isSet);
      const pool = sets.length ? sets : blooms;
      // Avoid ending the game early: prefer a Bloom that does not press on the opponent's home,
      // so the run really does reach five consecutive rounds (the surround is not what is tested).
      const oppHome = homeCoord(seat === 0 ? 1 : 0, mine.view.config);
      const safe = pool.filter((a) => a.hexes.every((c) => hexDistance(c, oppHome) > 1));
      const bloom = safe[0] ?? pool[0];
      if (bloom) return { cards: bloom.cards, hexes: bloom.hexes, set: isSet(bloom) };
    }
    // When it is the OTHER seat's turn, play it out idly (draw / end): nothing is placed, so the
    // position under test is exactly the one the report describes.
    if (mine.view.actor === seat) {
      const step = mine.legalActions.find((a) => a.t === 'Draw') ?? mine.legalActions.find((a) => a.t === 'EndAct');
      if (step) {
        await duel.api.submitAction(match.guests[seat].token, match.matchId, {
          expectedRevision: mine.revision,
          requestId: `multi-own-${step}-${Date.now()}`,
          actions: [step],
        });
        continue;
      }
    }
    const actorSeat = views.findIndex((v) => v.legalActions.length > 0);
    if (actorSeat < 0) return null;
    const view = views[actorSeat]!;
    const next =
      view.legalActions.find((a) => a.t === 'Draw') ?? view.legalActions.find((a) => a.t === 'EndAct') ?? view.legalActions.find((a) => a.t === 'Discard');
    if (!next) return null;
    await duel.api.submitAction(match.guests[actorSeat as 0 | 1].token, match.matchId, {
      expectedRevision: view.revision,
      requestId: `multi-${step}-${Date.now()}`,
      actions: [next],
    });
  }
  return null;
};

/** Paint like the player: keep tapping the hexes the page itself lights until a Bloom lands. */
const paintFollowingLights = async (session: SeatSession, matchId: string, steps: number): Promise<string[] | null> => {
  const painted: string[] = [];
  for (let step = 0; step <= steps; step++) {
    if (await draftBloom(session, matchId)) return painted;
    const options = (await litHexes(session)).filter((k) => !painted.includes(k));
    let advanced = false;
    for (const key of options) {
      const before = await ghostTiles(session);
      const p = await pointOfHex(session, key);
      if (!p) continue;
      await session.page.touchscreen.tap(p.x, p.y);
      await sleep(200);
      if (await draftBloom(session, matchId)) {
        painted.push(key);
        return painted;
      }
      if ((await ghostTiles(session)) > before) {
        painted.push(key);
        advanced = true;
        break;
      }
    }
    if (!advanced) return null;
  }
  return null;
};

/**
 * The page's OWN Grow step: ACT, idle, and a Bloom in the page's legal list. (`waitingFlag` alone
 * is not enough: it is true during the Draw step too, when no Bloom control is on screen yet.)
 */
const waitForGrowStep = async (session: SeatSession, timeout = 45_000): Promise<boolean> => {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const ready = await ev<boolean>(
      session,
      `(() => {
        const g = window.__severgrow;
        const o = g.online ? g.online() : null;
        if (!o || !o.myTurn || o.revealing || o.pumping || o.finished) return false;
        if ((g.state() || {}).phase !== 'ACT') return false;
        return g.legal().some(function (a) { return a.t === 'Bloom'; });
      })()`,
    );
    if (ready) return true;
    await sleep(150);
  }
  return false;
};

/**
 * One seat's proof: a fresh duel, then a Bloom painted with real touch on this seat's own page on
 * every one of its turns. Returns the longest run of CONSECUTIVE turns that each placed a Bloom.
 * A duel can end on its own (a surround, the deck); a retry uses a fresh duel so five consecutive
 * rounds are always reachable — the run, not the test, is what has to survive a game ending.
 */
const proveSeat = async (seat: 0 | 1): Promise<number> => {
  const label = `seat ${seat}${seat === 1 ? ' (the joined device)' : ''}`;
  let best = 0;
  let setsSeen = 0;
  for (let attempt = 1; attempt <= 4 && best < ROUNDS; attempt++) {
    const match = await duel.newMatch();
    const session = await openSeat(duel, match, seat, { hasTouch: true, isMobile: true });
    try {
      await openDuel(session, match.matchId);
      let painted = 0;
      for (let round = 1; round <= ROUNDS; round++) {
        const bloom = await advanceToBloom(duel, match, seat);
        if (!bloom) {
          if (attempt === 4) console.log(`    ${label}: attempt ${attempt} ended after ${painted} round(s)`);
          break;
        }
        if (!(await waitForGrowStep(session))) {
          check(`${label}: the Grow step opened on the board (attempt ${attempt} round ${round})`, false, JSON.stringify(await readOnline(session)));
          break;
        }
        const cards = [...bloom.cards].sort((a, b) => a - b);
        const kind = `bloom-${cards.length}-${cards.join('.')}`;
        if (!bloom.set) setsSeen++; // reported below: a run-only hand cannot show the set defect
        if (!(await pressBloomControl(session, kind))) {
          check(`${label}: the Bloom control opened the recipe (attempt ${attempt} round ${round})`, false, kind);
          break;
        }
        await sleep(220);
        const lit = await litHexes(session);
        const path = await paintFollowingLights(session, match.matchId, cards.length);
        const draft = await draftBloom(session, match.matchId);
        const good = !!draft && draft.hexes.length === cards.length;
        if (!good) {
          check(
            `${label}: the painted Bloom lands (round ${round} of the run)`,
            false,
            `nothing placed after ${path?.join(' -> ') || 'no hex'}; info=${JSON.stringify(await drawInfo(session))} lit=${lit.length} kind=${kind}`,
          );
          break;
        }
        painted++;
        best = Math.max(best, painted);
        if (!(await endTurnViaPage(session))) {
          check(`${label}: the turn throws through the page (round ${round})`, false);
          break;
        }
        await sleep(600);
        const view = (await duel.api.getState(match.guests[seat].token, match.matchId)).player;
        const placed = draft.hexes.filter((c) => view.view.board[coordKey(c)]?.owner === seat).length;
        if (placed !== draft.hexes.length || placed === 0) {
          check(
            `${label}: the Bloom is on the server board (round ${round})`,
            false,
            `${placed}/${draft.hexes.length} at ${draft.hexes.map(coordKey).join(' ')}`,
          );
          break;
        }
        if (seat === 1 && painted === ROUNDS) {
          await session.page.screenshot({ path: `${OUT}bloom-multiround-seat1.jpg`, type: 'jpeg', quality: 80 });
        }
      }
      if (best >= ROUNDS) {
        console.log(`    ${label}: ${best} consecutive rounds each painted and committed a Bloom${attempt > 1 ? ` (attempt ${attempt})` : ''}`);
        break;
      }
    } finally {
      await session.context.close();
    }
  }
  check(
    `${label}: FIVE consecutive rounds each placed and committed a Bloom`,
    best >= ROUNDS,
    `best run ${best}/${ROUNDS}${setsSeen ? ` (${setsSeen} round(s) were runs: a run-only hand)` : ''}`,
  );
  return best;
};

const duel: LocalDuel = await startLocalDuel({ port: PORT });
try {
  await proveSeat(1);
  await proveSeat(0);
} finally {
  await duel.close();
}

if (failed) {
  console.error(`\n${failed} multi-round Bloom checks failed`);
  process.exit(1);
}
console.log('\nA painted Bloom lands on BOTH seats across five consecutive rounds.');
