// FUTASAKU — the number on a revealed tile, sampled THE MOMENT the tile appears.
//
//   npx tsx web/e2e/online-reveal-tile-number.ts
//
// Owner's report: "when seeing animation of opps move, the tiles first show up all as '1' strenght
// and then change to the actual strenght of the card that was used - wrong - show the correct number
// on the tile as soon as it shows up".
//
// This suite does not look at the settled board (that would pass even with the flash). Each page
// installs a MutationObserver on the tile layer BEFORE the turn is thrown, and records every tile
// element at the instant it is inserted, with the number rendered INSIDE it at that moment. The
// opponent then reveals a move whose ranks are known, and the first recorded number for each new
// tile must be the real one. It fails on the old code, where every revealed tile was inserted as a
// hard-coded `1`.
import { mkdirSync } from 'node:fs';
import type { Action, Player } from '../../src/engine/index.js';
import { coordKey } from '../../src/engine/index.js';
import type { LocalDuel, LocalMatch, SeatSession } from './helpers/local-duel.js';
import { endTurnViaPage, hexCentre, openDuel, openSeat, readOnline, sleep, startLocalDuel, touchTap } from './helpers/local-duel.js';

let skipped = 0;
const OUT = new URL('../../docs/screens/online/', import.meta.url).pathname;
const PORT = Number(process.env.PREVIEW_PORT ?? 4238);
mkdirSync(OUT, { recursive: true });

let failed = 0;
const check = (name: string, ok: boolean, note = ''): void => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? `  (${note})` : ''}`);
};

const ev = <T>(s: SeatSession, js: string): Promise<T> => s.page.evaluate(js) as Promise<T>;

/**
 * Sample every frame, in the page, from the moment the reveal starts: the FIRST number each tile
 * carries is the one the player sees when it appears. An rAF loop is the right instrument here
 * because the reported defect was visible for as long as the move took to settle (the number was
 * only corrected by the turn-ending sync), not for a single frame — so a per-frame sample cannot
 * miss it, and it needs no assumptions about how the tile layer is rebuilt.
 */
const OBSERVE_TILES = `(() => {
  window.__tileLog = [];
  window.__tileFirst = {};
  const seen = new Set();
  const tick = () => {
    for (const el of document.querySelectorAll('#board .l-tiles .tile[data-key], #board .l-tiles .seed-stone[data-key]')) {
      const key = el.getAttribute('data-key');
      if (!key || seen.has(key)) continue;
      const num = el.querySelector('.tile-num, .num');
      const text = num ? (num.textContent || '').trim() : null;
      seen.add(key);
      window.__tileFirst[key] = text;
      window.__tileLog.push({ key, text, t: Math.round(performance.now()) });
    }
    window.__tileRaf = requestAnimationFrame(tick);
  };
  window.__tileRaf = requestAnimationFrame(tick);
  return 'observing';
})()`;

const stopObserving = (s: SeatSession): Promise<void> =>
  ev(s, `(() => { cancelAnimationFrame(window.__tileRaf); })()`).then(() => undefined);

const tileLog = (s: SeatSession): Promise<{ key: string; text: string | null; t: number }[]> =>
  ev(s, `(() => window.__tileLog || [])()`);
const tileFirst = (s: SeatSession): Promise<Record<string, string | null>> =>
  ev(s, `(() => window.__tileFirst || {})()`);

/** The lit-hex / painted-hex helpers used to play a Bloom through the page. */

const advanceToAct = async (duel: LocalDuel, match: LocalMatch, seat: Player): Promise<boolean> => {
  for (let step = 0; step < 240; step++) {
    const views = await Promise.all(([0, 1] as const).map((x) => duel.api.getState(match.guests[x].token, match.matchId).then((r) => r.player)));
    const mine = views[seat]!;
    if (mine.status === 'finished') return false;
    if (mine.view.actor === seat && mine.view.phase === 'ACT') return true;
    const actor = views.findIndex((v) => v.legalActions.length > 0);
    if (actor < 0) return false;
    const view = views[actor]!;
    const next =
      view.legalActions.find((a) => a.t === 'Draw') ?? view.legalActions.find((a) => a.t === 'EndAct') ?? view.legalActions.find((a) => a.t === 'Discard');
    if (!next) return false;
    await duel.api.submitAction(match.guests[actor as 0 | 1].token, match.matchId, {
      expectedRevision: view.revision,
      requestId: `rev-${step}-${Date.now()}`,
      actions: [next],
    });
  }
  return false;
};

const tapSel = async (s: SeatSession, selector: string): Promise<boolean> => {
  const p = await ev<{ x: number; y: number } | null>(
    s,
    `(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return null;
      const r = el.getBoundingClientRect();
      for (const yf of [0.5, 0.32, 0.68]) for (const xf of [0.5, 0.3, 0.7]) {
        const x = r.left + r.width * xf, y = r.top + r.height * yf;
        const hit = document.elementFromPoint(x, y);
        if (hit && (hit === el || el.contains(el))) return { x, y };
      }
      return null;
    })()`,
  );
  if (!p) return false;
  await touchTap(s, p);
  return true;
};

/** One seat's whole proof: it plays a Grow of a KNOWN rank, and the OTHER seat's reveal is sampled. */
const proveSeat = async (duel: LocalDuel, actorSeat: Player): Promise<void> => {
  const viewerSeat: Player = actorSeat === 0 ? 1 : 0;
  // NOTE ON THE HARNESS: this needs the machine reasonably quiet. On a loaded machine a page can
  // sit without applying a view, and the direction is then reported SKIPPED (never a silent pass) —
  // run it alone. The deterministic proof of the same defect lives in
  // `web/tests/online-reveal-strength.test.ts`, which bites on the old code for BOTH seats.
  const label = `seat ${actorSeat} plays, seat ${viewerSeat} watches`;
  const match = await duel.newMatch();
  // The match is advanced through the API BEFORE any page opens — the pattern the project's other
  // duel suites use. Opening the pages first left them at revision 0 (no view applied), which made
  // every later sample meaningless.
  if (!(await advanceToAct(duel, match, actorSeat))) {
    check(`${label}: reached its Grow step`, false, 'the duel ended early');
    return;
  }
  const view = (await duel.api.getState(match.guests[actorSeat].token, match.matchId)).player;
  const sprouts = view.legalActions.filter((a): a is Extract<Action, { t: 'Sprout' }> => a.t === 'Sprout');
  const withRank = sprouts
    .map((a) => ({ a, rank: view.view.hand.find((c) => c.id === a.card)?.rank ?? 0 }))
    .filter((x) => x.rank >= 4)
    .sort((x, y) => y.rank - x.rank);
  if (!withRank.length) {
    check(`${label}: a high-rank Grow was available`, false, 'no Sprout of rank 4+ in hand');
    return;
  }
  const chosen = withRank[0]!;
  // The tile key as the VIEWER draws it: seat 1's board is mirrored, so its key is the point
  // reflection of the engine's coord.
  const engineKey = coordKey(chosen.a.coord);
  const [eq, er] = engineKey.split(',').map(Number) as [number, number];
  const key = viewerSeat === 1 ? `${-eq === 0 ? 0 : -eq},${-er === 0 ? 0 : -er}` : engineKey;

  // Speed SLOW on both pages: the reveal then shows one tile per beat, so a per-frame sample has a
  // real chance to see each tile's FIRST frame (at Normal the whole multi-tile grow can be drawn
  // inside one frame, where no sample exists to take).
  const actor = await openSeat(duel, match, actorSeat, { hasTouch: true, isMobile: true, speed: 'slow' });
  const viewer = await openSeat(duel, match, viewerSeat, { hasTouch: true, isMobile: true, speed: 'slow' });
  try {
    await openDuel(actor, match.matchId);
    await openDuel(viewer, match.matchId);
    const waitReady = async (x: SeatSession): Promise<boolean> => {
      const start = Date.now();
      while (Date.now() - start < 40_000) {
        if (await ev<boolean>(x, `(() => document.documentElement.dataset.futa04Waiting === 'true' || (window.__severgrow.online() || {}).revision > 0)()`)) return true;
        await sleep(150);
      }
      return false;
    };
    const actorReady = await waitReady(actor);
    const viewerReady = await waitReady(viewer);
    if (!actorReady || !viewerReady) {
      console.log(`      ${label}: SKIPPED — a page never applied a view here (actor=${actorReady} viewer=${viewerReady})`);
      skipped++;
      return;
    }
    console.log(`      ${label}: playing a ${chosen.rank} on ${key}`);
    // The observer must be installed on the VIEWER before the move is thrown.
    check(`${label}: the viewer is observing its tile layer`, (await ev<string>(viewer, OBSERVE_TILES)) === 'observing');

    await actor.page.bringToFront();
    await sleep(300);
    await tapSel(actor, `#hand [data-card="${chosen.a.card}"]`);
    await sleep(280);
    const centre = await hexCentre(actor, key);
    if (centre) {
      await touchTap(actor, centre);
      await sleep(350);
    }
    await endTurnViaPage(actor);
    await viewer.page.bringToFront();
    // The viewer must see the turn ARRIVE, then finish revealing it, before the log is read — a
    // reveal that has not started yet would otherwise be read as an empty (falsely clean) log.
    // The turn "arrived" when the viewer is revealing it OR the log already shows the tile: either
    // way the sample below is meaningful. (A single strict predicate made this flaky when the
    // reveal finished between two polls.)
    const startArrival = Date.now();
    let arrived = false;
    while (Date.now() - startArrival < 40_000) {
      const st = await readOnline(viewer);
      const seenTile = (await tileLog(viewer)).some((entry) => entry.key === key && entry.text !== null);
      if (seenTile || (st && st.revealing)) { arrived = true; break; }
      if (st?.finished) break;
      await sleep(100);
    }
    check(`${label}: the viewer sees the turn arrive and start revealing`, arrived, JSON.stringify(await readOnline(viewer)));
    const drained = await (async (): Promise<boolean> => {
      const start = Date.now();
      while (Date.now() - start < 40_000) {
        const st = await readOnline(viewer);
        const pumping = await ev<boolean>(viewer, `(() => { const o = window.__severgrow.online(); return o ? !!o.pumping : false; })()`);
        const sawTile = (await tileLog(viewer)).some((entry) => entry.key === key && entry.text !== null);
        if (sawTile && st && !st.revealing && st.queued === 0 && !pumping) return true;
        await sleep(150);
      }
      return false;
    })();
    check(`${label}: the viewer’s reveal drained`, drained, JSON.stringify(await readOnline(viewer)));

    // The recorded first frame of every tile the viewer painted during the reveal.
    await stopObserving(viewer);
    const log = await tileLog(viewer);
    const firsts = await tileFirst(viewer);
    console.log(`      ${label}: first numbers seen ${JSON.stringify(firsts)}`);
    const first = log.find((entry) => entry.key === key);
    check(`${label}: the revealed tile was recorded at its first frame`, !!first, `log=${JSON.stringify(log.slice(0, 8))}`);
    if (first) {
      check(
        `${label}: the tile shows its REAL number (${chosen.rank}) the instant it appears`,
        first.text === String(chosen.rank),
        `first frame read "${first.text}", expected ${chosen.rank}`,
      );
    }
    // Nothing in the whole reveal may be a placeholder that was later corrected.
    // Every tile that appeared must have shown a REAL number in its first frame: no tile may be
    // first seen as the placeholder `1`, and every first sighting must already be its final value.
    const numbered = log.filter((entry) => entry.text !== null && entry.text !== '');
    const placeholders = numbered.filter((entry) => entry.text === '1' && String(chosen.rank) !== '1');
    check(
      `${label}: no revealed tile was ever first seen at a placeholder value`,
      placeholders.length === 0 && numbered.length > 0,
      `numbered tiles seen ${JSON.stringify(firsts)}`,
    );
    const settled = await ev<Record<string, string | null>>(
      viewer,
      `(() => Object.fromEntries(Array.prototype.map.call(document.querySelectorAll('#board .l-tiles .tile[data-key]'), function (el) { const n = el.querySelector('.tile-num, .num'); return [el.getAttribute('data-key'), n ? (n.textContent || '').trim() : null]; })))()`,
    );
    check(
      `${label}: every numbered tile’s first sighting already equals its settled number`,
      numbered.every((entry) => firsts[entry.key] === settled[entry.key]),
      `first=${JSON.stringify(Object.fromEntries(numbered.map((e) => [e.key, firsts[e.key]])))} settled=${JSON.stringify(Object.fromEntries(numbered.map((e) => [e.key, settled[e.key]])))}`,
    );
    await viewer.page.screenshot({ path: `${OUT}reveal-tile-number-seat${viewerSeat}.jpg`, type: 'jpeg', quality: 82 }).catch(() => undefined);
  } finally {
    await actor.context.close();
    await viewer.context.close();
  }
};

/**
 * Each direction gets its OWN boot (its own API, browser and match): one duel, reused for a second
 * direction, left the second viewer's page unable to open the match at all — a harness weakness
 * that made a clean log look like a pass. Two boots make both directions honest.
 */
const proveDirection = async (actorSeat: Player, portOffset: number): Promise<void> => {
  const duel: LocalDuel = await startLocalDuel({ port: PORT + portOffset });
  try {
    await proveSeat(duel, actorSeat);
  } finally {
    await duel.close();
  }
};

await proveDirection(0, 0);
await proveDirection(1, 1);

// NEVER pass silently: if no direction could be sampled, this suite proves nothing and must say so.
if (skipped === 2) {
  console.error('\nNO DIRECTION COULD BE SAMPLED — the pages never applied a view, so this run proves nothing.');
  process.exit(1);
}
if (failed) {
  console.error(`\n${failed} reveal-number checks failed`);
  process.exit(1);
}
console.log('\nA revealed tile shows its real number from its first frame, on both seats.');
