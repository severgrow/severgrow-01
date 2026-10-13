// FUTASAKU 0.5 — painting a Bloom with a FINGER on BOTH seats.
//
//   npx tsx web/e2e/online-touch-bloom.ts
//
// The owner's two-phone playtest: on one phone, pressing the Bloom control and drawing across the
// lit hexes placed nothing. This drives the real online page on each seat (0 and 1) and paints a
// legal Bloom with real touch input, following the hexes the page itself lights — the owner's own
// gesture — then asserts the Bloom reaches the local draft and, after the Throw, the server board.
//
// It also proves the dead end is no longer silent: a tap on a hex that cannot come next says so
// (the counter line carries the reason) instead of doing nothing at all.
import { mkdirSync } from 'node:fs';
import type { Action, Coord } from '../../src/engine/index.js';
import { coordKey } from '../../src/engine/index.js';
import type { LocalDuel, LocalMatch, SeatSession } from './helpers/local-duel.js';
import { endTurnViaPage, openDuel, openSeat, readOnline, sleep, startLocalDuel, waitingFlag } from './helpers/local-duel.js';

const OUT = new URL('../../docs/screens/online/', import.meta.url).pathname;
const PORT = Number(process.env.PREVIEW_PORT ?? 4232);
mkdirSync(OUT, { recursive: true });

let failed = 0;
const check = (name: string, ok: boolean, note = ''): void => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? `  (${note})` : ''}`);
};

/**
 * Advance the duel through the API until `seat` is in the Grow step holding a legal Bloom (the
 * state the owner was in when they pressed the Bloom control). Returns it in ENGINE coordinates.
 */
const advanceToBloom = async (duel: LocalDuel, match: LocalMatch, seat: 0 | 1, maxSteps = 200): Promise<{ cards: number[]; hexes: Coord[] }> => {
  for (let step = 0; step < maxSteps; step++) {
    const views = await Promise.all(
      ([0, 1] as const).map((s) => duel.api.getState(match.guests[s].token, match.matchId).then((r) => r.player)),
    );
    const mine = views[seat]!;
    if (mine.status === 'finished' || mine.view.phase === 'GAME_OVER') throw new Error('the duel finished before a Bloom appeared');
    if (mine.view.actor === seat && mine.view.phase === 'ACT') {
      const bloom = mine.legalActions.find((a): a is Extract<Action, { t: 'Bloom' }> => a.t === 'Bloom');
      if (bloom) return { cards: bloom.cards, hexes: bloom.hexes };
    }
    const actorSeat = views.findIndex((v) => v.legalActions.length > 0);
    if (actorSeat < 0) throw new Error('nobody could act');
    const view = views[actorSeat]!;
    const next =
      view.legalActions.find((a) => a.t === 'Draw') ??
      view.legalActions.find((a) => a.t === 'EndAct') ??
      view.legalActions.find((a) => a.t === 'Discard');
    if (!next) throw new Error(`no step to play in ${view.view.phase}`);
    await duel.api.submitAction(match.guests[actorSeat as 0 | 1].token, match.matchId, {
      expectedRevision: view.revision,
      requestId: `bloom-${step}-${Date.now()}`,
      actions: [next],
    });
  }
  throw new Error('no legal Bloom appeared within the step budget');
};

const legalBloomOnPage = (session: SeatSession): Promise<Action[]> =>
  session.page.evaluate(
    `(() => window.__severgrow.legal().filter(function (a) { return a.t === 'Bloom'; }))()`,
  ) as Promise<Action[]>;

/** Press the page's Bloom control for `kind` (the owner's gesture), opening the list if needed. */
const pressBloomControl = (session: SeatSession, kind: string): Promise<boolean> =>
  session.page.evaluate(`(() => {
    const k = ${JSON.stringify(kind)};
    const visible = function (el) { return !!el && el.offsetParent !== null; };
    let btn = document.querySelector('#moves [data-kind="' + k + '"]');
    if (visible(btn)) { btn.click(); return true; }
    const toggle = document.querySelector('#moves .bloom-toggle');
    if (toggle) {
      toggle.click();
      btn = document.querySelector('#moves [data-kind="' + k + '"]');
      if (btn) { btn.click(); return true; }
    }
    return false;
  })()`) as Promise<boolean>;

/** The hexes the page is lighting right now (what the finger is told to touch). */
const litHexes = (session: SeatSession): Promise<string[]> =>
  session.page.evaluate(
    `(() => Array.prototype.map.call(document.querySelectorAll('#board .l-over [data-key]'), function (el) { return el.getAttribute('data-key'); }))()`,
  ) as Promise<string[]>;

/** Every drawn hex key (so a dead tap can pick one that is NOT lit). */
const allHexKeys = (session: SeatSession): Promise<string[]> =>
  session.page.evaluate(
    `(() => Array.prototype.map.call(document.querySelectorAll('#board .hex-cell[data-key]'), function (el) { return el.getAttribute('data-key'); }))()`,
  ) as Promise<string[]>;

const pointOfHex = (session: SeatSession, key: string): Promise<{ x: number; y: number } | null> =>
  session.page.evaluate(
    `(() => {
      const el = document.querySelector('#board .hex-cell[data-key="${key}"]');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    })()`,
  ) as Promise<{ x: number; y: number } | null>;

const paintedOnBoard = (session: SeatSession): Promise<number> =>
  session.page.evaluate('document.querySelectorAll(".draw-ghost .ghost-tile").length') as Promise<number>;

const drawInfoText = (session: SeatSession): Promise<string> =>
  session.page.evaluate(
    `(() => { const b = document.getElementById('draw-info'); return b && !b.hidden ? (b.textContent || '').trim() : ''; })()`,
  ) as Promise<string>;

/** The draft the page persisted for this match (engine-coord actions), or null. */
const draftActions = (session: SeatSession, matchId: string): Promise<Action[] | null> =>
  session.page.evaluate((id) => {
    try {
      const raw = sessionStorage.getItem(`severgrow.duel.draft.v1.${id}`);
      if (!raw) return null;
      return (JSON.parse(raw) as { actions: Action[] }).actions;
    } catch {
      return null;
    }
  }, matchId);

const draftBloom = async (session: SeatSession, matchId: string): Promise<Extract<Action, { t: 'Bloom' }> | null> => {
  const actions = (await draftActions(session, matchId)) ?? [];
  return (actions.find((a) => a.t === 'Bloom') as Extract<Action, { t: 'Bloom' }> | undefined) ?? null;
};

/**
 * Paint like a player: press the recipe, then keep tapping a hex the page is lighting until the
 * recipe is complete. This is the owner's own gesture — the page lights the valid next hexes — and
 * it must reach a real placement on BOTH seats.
 */
const paintFollowingLights = async (session: SeatSession, matchId: string, steps: number): Promise<string[]> => {
  const painted: string[] = [];
  for (let step = 0; step < steps + 1; step++) {
    if (await draftBloom(session, matchId)) return painted;
    const options = (await litHexes(session)).filter((k) => !painted.includes(k));
    let advanced = false;
    for (const key of options) {
      const before = await paintedOnBoard(session);
      const p = await pointOfHex(session, key);
      if (!p) continue;
      await session.page.touchscreen.tap(p.x, p.y);
      await sleep(200);
      if (await draftBloom(session, matchId)) {
        painted.push(key);
        return painted;
      }
      if ((await paintedOnBoard(session)) > before) {
        painted.push(key);
        advanced = true;
        break;
      }
    }
    if (!advanced) {
      console.log(`      (no lit hex advanced the shape at step ${step + 1}; info=${JSON.stringify(await drawInfoText(session))})`);
      return painted;
    }
  }
  await sleep(400);
  return painted;
};

/** One seat's whole proof. */
const proveSeat = async (duel: LocalDuel, seat: 0 | 1): Promise<void> => {
  const label = `seat ${seat}`;
  const match = await duel.newMatch();
  // Reach the state the owner was in: this seat's Grow step, at least one Bloom legal.
  await advanceToBloom(duel, match, seat);
  const session = await openSeat(duel, match, seat, { hasTouch: true, isMobile: true });
  try {
    await openDuel(session, match.matchId);
    // The page resumes mid-turn: let its catch-up replay drain and the Grow step open.
    const start = Date.now();
    while (Date.now() - start < 40_000) {
      if (await waitingFlag(session)) break;
      await sleep(120);
    }
    check(`${label}: the seat holds the Grow step`, await waitingFlag(session), JSON.stringify(await readOnline(session)));

    const onPage = await legalBloomOnPage(session);
    check(`${label}: the page offers a legal Bloom`, onPage.length > 0, `${onPage.length} placement(s)`);

    // The recipe to press comes from the PAGE's own legal list: the biggest one it offers.
    const biggest = [...onPage].sort(
      (a, b) =>
        ((b as Extract<Action, { t: 'Bloom' }>).hexes.length) - ((a as Extract<Action, { t: 'Bloom' }>).hexes.length),
    )[0] as Extract<Action, { t: 'Bloom' }>;
    const cards = [...biggest.cards].sort((a, b) => a - b);
    const kind = `bloom-${cards.length}-${cards.join('.')}`;
    check(`${label}: the Bloom control opens the recipe`, await pressBloomControl(session, kind));

    const lit = await litHexes(session);
    check(`${label}: the recipe lights hexes to paint on`, lit.length > 0, `lit=${lit.length} kind=${kind}`);

    // A dead tap (a hex that is NOT lit) must answer the finger instead of doing nothing.
    const dead = (await allHexKeys(session)).find((k) => !lit.includes(k));
    if (dead) {
      const p = await pointOfHex(session, dead);
      if (p) await session.page.touchscreen.tap(p.x, p.y);
      await sleep(350);
      check(
        `${label}: a tap on a hex that cannot come next explains itself`,
        (await drawInfoText(session)).length > 0 && !(await draftBloom(session, match.matchId)),
        `info=${JSON.stringify(await drawInfoText(session))} hex=${dead}`,
      );
    } else {
      console.log(`    ${label}: no unlit hex to test a dead tap on`);
    }

    // Now the real gesture: keep tapping a lit hex until the recipe is complete.
    if (!(await draftBloom(session, match.matchId))) {
      const painted = await paintFollowingLights(session, match.matchId, cards.length);
      console.log(`    ${label}: tapping the lit hexes painted ${painted.length ? painted.join(' -> ') : 'NOTHING'}`);
    }

    const draft = await draftBloom(session, match.matchId);
    check(
      `${label}: tapping the lit hexes places the Bloom`,
      !!draft && draft.hexes.length === cards.length,
      draft ? JSON.stringify(draft) : 'no draft',
    );
    check(
      `${label}: it is the recipe the control was pressed for`,
      !!draft && [...draft.cards].sort((a, b) => a - b).join('.') === cards.join('.'),
      draft ? `cards ${[...draft.cards].join('.')} vs ${cards.join('.')}` : 'no draft',
    );

    // Commit through the page (its EndAct carries the local draft) and read the server board.
    check(`${label}: the turn throws through the page`, await endTurnViaPage(session));
    await sleep(700);
    const view = (await duel.api.getState(match.guests[seat].token, match.matchId)).player;
    const placed = (draft?.hexes ?? []).filter((c) => view.view.board[coordKey(c)]?.owner === seat).length;
    check(
      `${label}: the painted Bloom is on the board after the Throw`,
      !!draft && placed === draft.hexes.length && placed > 0,
      `${placed}/${draft?.hexes.length ?? 0} at ${(draft?.hexes ?? []).map((c) => coordKey(c)).join(' ')}`,
    );
    await session.page.screenshot({ path: `${OUT}touch-bloom-seat${seat}.jpg`, type: 'jpeg', quality: 80 });
  } finally {
    await session.context.close();
  }
};

const duel = await startLocalDuel({ port: PORT });
try {
  await proveSeat(duel, 0);
  await proveSeat(duel, 1);
} finally {
  await duel.close();
}

if (failed) {
  console.error(`\n${failed} touch-Bloom checks failed`);
  process.exit(1);
}
console.log('\nTouch Bloom painting works on both seats.');
