// FUTASAKU 0.5 — online Undo must take back a DRAFTED mid-turn move, exactly as offline does.
//
//   npx tsx web/e2e/online-undo-draft.ts
//
// The report: online, once you had drafted a Grow/Bloom/Bomb/Blast, the Undo button LIT UP but
// tapping it did nothing — no board change, no draft change, no POST. The ENABLE line read the
// OnlineSession's draft; the CLICK handler read the offline Session the page rebuilds after every
// move, whose undo stack is always empty online, so the tap fell through to a no-op "replay the
// opponent". This drives a real local duel on BOTH seats end to end: reach the Grow step, draft one
// Sprout with a real touch, tap #tool-undo, and assert the draft is gone and the board reverted —
// asserted on the button's disabled state and the draft itself (NOT the offline `canUndo()` hook
// that mis-read it). It also checks the button is dark with nothing to undo, that taking a draft
// back stays local (no server revision change), and that the button is inert after the Throw.
import { mkdirSync } from 'node:fs';
import type { Action } from '../../src/engine/index.js';
import type { LocalDuel, LocalMatch, SeatSession } from './helpers/local-duel.js';
import { endTurnViaPage, openDuel, openSeat, readOnline, sleep, startLocalDuel, tapExposed, waitIdle } from './helpers/local-duel.js';

const OUT = new URL('../../docs/screens/online/', import.meta.url).pathname;
const PORT = Number(process.env.PREVIEW_PORT ?? 4241);
mkdirSync(OUT, { recursive: true });

let failed = 0;
const check = (name: string, ok: boolean, note = ''): void => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? `  (${note})` : ''}`);
};

const ev = <T>(s: SeatSession, js: string): Promise<T> => s.page.evaluate(js) as Promise<T>;

type GrowPlan = { phase: string; actor: number; legalCount: number; sproutCount: number; card: number | null; key: string | null; empty: boolean };

/** The Grow step's own view, and a legal Sprout to draft (an empty target preferred: it shows best). */
const plan = (s: SeatSession): Promise<GrowPlan | null> =>
  ev<GrowPlan | null>(s, `(() => {
    const g = window.__severgrow;
    const st = g.state ? g.state() : null;
    if (!st) return null;
    const legal = g.legal ? g.legal() : [];
    const sprouts = legal.filter(function (a) { return a.t === 'Sprout'; });
    // A card that is ALSO part of a Bloom recipe starts a paint when tapped, not a Grow; avoid it.
    const bloomCards = new Set();
    for (const a of legal) if (a.t === 'Bloom' || a.t === 'MegaBomb') for (const c of a.cards) bloomCards.add(c);
    const keyOf = function (a) { return a.coord.q + ',' + a.coord.r; };
    let pick = null;
    for (const a of sprouts) { const k = keyOf(a); if (!st.board[k] && !bloomCards.has(a.card)) { pick = { card: a.card, key: k, empty: true }; break; } }
    if (!pick) for (const a of sprouts) { const k = keyOf(a); if (!st.board[k]) { pick = { card: a.card, key: k, empty: true }; break; } }
    if (!pick && sprouts[0]) { pick = { card: sprouts[0].card, key: keyOf(sprouts[0]), empty: false }; }
    return {
      phase: st.phase, actor: st.actor,
      legalCount: legal.length, sproutCount: sprouts.length,
      card: pick ? pick.card : null, key: pick ? pick.key : null, empty: pick ? pick.empty : false,
    };
  })()`);

/** A stable signature of the whole display board (placed tiles; empty cells are null). */
const boardSig = (s: SeatSession): Promise<string> =>
  ev<string>(s, `(() => { const st = window.__severgrow.state(); return st ? JSON.stringify(st.board) : ''; })()`);

/** The Undo control's own disabled state — the enable line under test, never the offline hook. */
const undoDisabled = (s: SeatSession): Promise<boolean> =>
  ev<boolean>(s, `(() => { const b = document.getElementById('tool-undo'); return !b || b.disabled === true; })()`);

const draftActions = (s: SeatSession, matchId: string): Promise<Action[] | null> =>
  s.page.evaluate((id) => {
    try {
      const raw = sessionStorage.getItem(`severgrow.duel.draft.v1.${id}`);
      return raw ? (JSON.parse(raw) as { actions: Action[] }).actions : null;
    } catch {
      return null;
    }
  }, matchId);

const shot = async (s: SeatSession, name: string): Promise<string> => {
  const path = `${OUT}${name}.jpg`;
  await sleep(350); // let the last render's paint land before capturing evidence
  await s.page.screenshot({ path, type: 'jpeg', quality: 80 });
  return path;
};

/** A real finger tap on Undo; a DOM click is the fallback when nothing is exposed to touch. */
const pressUndo = async (s: SeatSession): Promise<void> => {
  const tapped = await tapExposed(s, '#tool-undo');
  if (!tapped) {
    await ev(s, `(() => { const b = document.getElementById('tool-undo'); if (b && !b.disabled) b.click(); })()`);
  }
  await sleep(400);
};

/** Wait for the draft to be gone AND the button dark again. */
const waitNoDraft = async (s: SeatSession, matchId: string, timeout = 12_000): Promise<boolean> => {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const acts = await draftActions(s, matchId);
    if ((!acts || acts.length === 0) && (await undoDisabled(s))) return true;
    await sleep(150);
  }
  return false;
};

/** The first legal Sprout, retrying across polls (the view is rebuilt on every poll). */
const waitGrowPlan = async (s: SeatSession, timeout = 25_000): Promise<GrowPlan | null> => {
  const start = Date.now();
  let last: GrowPlan | null = null;
  while (Date.now() - start < timeout) {
    last = await plan(s);
    if (last && last.card !== null && last.key !== null) return last;
    await sleep(200);
  }
  if (last) console.log('    (no Sprout: last plan = ' + JSON.stringify(last) + ')');
  return last;
};

/** Diagnostics: what is picked and offered right now (only used when a draft fails to land). */
const selOf = (s: SeatSession): Promise<Record<string, unknown>> =>
  ev<Record<string, unknown>>(
    s,
    `(() => {
    const g = window.__severgrow;
    const st = g.state ? g.state() : null;
    return { phase: st ? st.phase : null, sel: g.sel ? g.sel() : null, legal: g.legal ? g.legal().length : -1, pending: g.pending ? !!g.pending() : null };
  })()`,
  );

/** Tap a drawn hex; fall back to its centre when nothing in it is exposed to touch. */
const tapHex = async (s: SeatSession, key: string): Promise<void> => {
  const tapped = await tapExposed(s, `#board .hex-cell[data-key="${key}"]`);
  if (!tapped) {
    const p = await ev<{ x: number; y: number } | null>(
      s,
      `(() => { const el = document.querySelector('#board .hex-cell[data-key="${key}"]'); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`,
    );
    if (p) await s.page.touchscreen.tap(p.x, p.y);
  }
  await sleep(250);
};

/** Draft one Grow with the page's own touch path (tap the card, its tile, then Confirm if asked). */
const draftOneSprout = async (s: SeatSession, matchId: string): Promise<GrowPlan | null> => {
  const p = await waitGrowPlan(s);
  if (!p || p.card === null || p.key === null) return null;
  const drafted = async (): Promise<boolean> => {
    const acts = await draftActions(s, matchId);
    return !!acts && acts.length >= 1;
  };
  await tapExposed(s, `#hand [data-card="${p.card}"]`);
  await sleep(250);
  if (!(await drafted())) {
    // If the card also carried a Bloom recipe, the tap did not pick the Grow: force the Sprout kind.
    const picked = (await selOf(s)).sel as { card?: number | null; kind?: string | null } | null;
    if (picked && picked.card !== null && picked.kind !== 'sprout') {
      await ev(s, `(() => { const g = window.__severgrow; if (g.pickKind) g.pickKind('sprout'); })()`);
      await sleep(150);
    }
    await tapHex(s, p.key);
  }
  if (!(await drafted())) {
    await ev(s, `(() => { const b = document.getElementById('confirm-play'); if (b && !b.hidden) b.click(); })()`);
    await sleep(300);
  }
  for (let i = 0; i < 60; i++) {
    if (await drafted()) return p;
    await sleep(150);
  }
  console.log('    (no draft landed: ' + JSON.stringify({ plan: await plan(s), ...(await selOf(s)) }) + ')');
  return null;
};

/** Reach this seat's Grow step: commit its Draw (if that is the step), then wait for ACT + my turn. */
const reachGrowStep = async (duel: LocalDuel, match: LocalMatch, session: SeatSession, seat: 0 | 1): Promise<boolean> => {
  const guest = match.guests[seat];
  for (let i = 0; i < 150; i++) {
    const p = await plan(session);
    const on = await readOnline(session);
    if (!on) {
      await sleep(200);
      continue;
    }
    if (on.finished) return false;
    if (p && p.actor === 0 && p.phase === 'ACT' && on.myTurn && !on.revealing) return true;
    if (p && p.actor === 0 && p.phase === 'DRAW' && on.myTurn) {
      const st = await duel.api.getState(guest.token, match.matchId);
      const draw = st.player.legalActions.find((a) => a.t === 'Draw');
      if (draw) {
        await duel.api.submitAction(guest.token, match.matchId, {
          expectedRevision: st.player.revision,
          requestId: `undo-draw-${seat}-${i}-${Date.now()}`,
          actions: [draw],
        });
      }
    }
    await sleep(200);
  }
  return false;
};

/** One seat's whole proof: nothing to undo -> draft -> Undo takes it back -> Throw disables it. */
const runSeat = async (duel: LocalDuel, match: LocalMatch, session: SeatSession, seat: 0 | 1): Promise<void> => {
  const label = `seat ${seat}`;
  const matchId = match.matchId;
  const revision = async (): Promise<number> => (await duel.api.getState(match.guests[seat].token, matchId)).player.revision;

  const reached = await reachGrowStep(duel, match, session, seat);
  check(`${label}: reached the Grow step on my turn`, reached);
  if (!reached) return;
  await waitIdle(session);

  // (A) With nothing drafted the control is dark: there is nothing to take back.
  check(`${label}: Undo is DISABLED with nothing to undo`, await undoDisabled(session));
  check(`${label}: the online hook also reports no undo`, (await readOnline(session))?.canUndo === false);
  const sigBefore = await boardSig(session);

  // (B) Draft one Grow with a real touch.
  const p = await draftOneSprout(session, matchId);
  check(`${label}: a Grow was drafted locally`, !!p, p ? `card ${p.card} -> hex ${p.key}${p.empty ? ' (empty)' : ''}` : 'no Sprout was offered');
  if (!p || p.key === null) return; // nothing to take back: the rest would be vacuous
  await waitIdle(session);
  const acts = await draftActions(session, matchId);
  check(`${label}: the draft holds exactly the Grow`, !!acts && acts.length === 1, JSON.stringify(acts));
  check(`${label}: the draft changed the board`, (await boardSig(session)) !== sigBefore);
  check(`${label}: Undo is LIT once a move is drafted`, !(await undoDisabled(session)));
  check(`${label}: the online hook reports the draft can be undone`, (await readOnline(session))?.canUndo === true);
  await shot(session, `undo-draft-lit-seat${seat}`);

  // (C) Tap Undo: the draft must be gone, the board reverted, and nothing sent to the server.
  const revBefore = await revision();
  await pressUndo(session);
  const undone = await waitNoDraft(session, matchId);
  check(`${label}: tapping Undo TAKES THE DRAFTED MOVE BACK (draft gone)`, undone);
  check(`${label}: the board reverted exactly to its pre-draft state`, (await boardSig(session)) === sigBefore);
  check(`${label}: taking a draft back stayed local (server revision unchanged)`, (await revision()) === revBefore, `${revBefore} -> ${await revision()}`);
  check(`${label}: the online hook reports nothing left to undo`, (await readOnline(session))?.canUndo === false);
  await waitIdle(session);
  check(`${label}: Undo goes DARK again after the take-back`, await undoDisabled(session));
  await shot(session, `undo-draft-taken-back-seat${seat}`);

  // (D) Undo must not fire after the Throw: the turn is committed, so nothing can be taken back.
  const threw = await endTurnViaPage(session);
  check(`${label}: the turn throws through the page`, threw);
  await waitIdle(session);
  check(`${label}: Undo is DISABLED after the Throw`, await undoDisabled(session));
  const revAfterThrow = await revision();
  await pressUndo(session); // a dark button must be inert
  await sleep(400);
  check(
    `${label}: tapping Undo after the Throw does nothing (no draft, no POST)`,
    (await draftActions(session, matchId)) === null && (await revision()) === revAfterThrow,
  );
};

const duel: LocalDuel = await startLocalDuel({ port: PORT });
try {
  const match = await duel.newMatch();
  const other = (match.starterSeat === 0 ? 1 : 0) as 0 | 1;
  console.log(`    match ${match.matchId}: starting seat ${match.starterSeat}`);
  const first = await openSeat(duel, match, match.starterSeat, { hasTouch: true, isMobile: true, reduceMotion: true, speed: 'skip' });
  const second = await openSeat(duel, match, other, { hasTouch: true, isMobile: true, reduceMotion: true, speed: 'skip' });
  try {
    await openDuel(first, match.matchId);
    await openDuel(second, match.matchId);
    // The starter acts first; the other seat picks up after the starter's Throw.
    await runSeat(duel, match, first, match.starterSeat);
    await runSeat(duel, match, second, other);
  } finally {
    await first.context.close();
    await second.context.close();
  }
} finally {
  await duel.close();
}

if (failed) {
  console.error(`\n${failed} online Undo checks failed`);
  process.exit(1);
}
console.log('\nOnline Undo takes back a drafted move on both seats, stays local, and never fires after the Throw.');
