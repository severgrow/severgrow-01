// THE FINAL MOVE IS SEEN BEFORE THE RESULT (owner, 2026-10-25).
//
//   "when playing game online - if i have the last move of the game and do it and win -- opponent
//    doesn't get to see my final move because they get the 'you lost' end of game screen straight
//    away -- it should always show the final move first and then show the end of game screen"
//
// The result plate may cover the board ONLY once the board has applied and settled the move that
// decided the match. That decision is a pure function (`boardHasSettled`), so it is pinned here
// without a browser; the browser proof (a real two-seat duel, ordering asserted) is
// `web/e2e/final-move-before-card.ts`.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { newGame, viewFor } from '../../src/engine/index.js';
import type { Event } from '../../src/engine/index.js';
import type { Step } from '../src/logic/anim.js';
import { AnimQueue } from '../src/logic/anim.js';
import { OnlineSession } from '../src/online/duel-session.js';
import type { OnlineDriver } from '../src/online/driver.js';
import { onlinePerspective } from '../src/online/perspective.js';
import {
  RESULT_HOLD_STALL_MS,
  boardHasSettled,
  isSettledStep,
  resultHoldStalled,
} from '../src/logic/result-hold.js';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const mainSource = read('../src/main.ts');

const kinds = (...k: Step['k'][]): Step['k'][] => k;

describe('may the result plate cover the board?', () => {
  it('holds while a move that changes the board is still waiting to play', () => {
    // Every way a duel can be decided puts one of these in the queue: a placement, a cut, a
    // throw/draw, the KO's own landmark beat. None of them may be veiled.
    for (const k of ['grow', 'sever', 'remove', 'strengthen', 'fruit', 'megaBomb', 'strangle', 'draw', 'discard'] as const) {
      expect(boardHasSettled({ waiting: kinds(k, 'end', 'sync'), playing: null, reducedMotion: false }), k).toBe(false);
    }
  });

  it('holds while a board change is mid-flight even when nothing is queued', () => {
    // A single-tile grow consumes its queue slot at the START of its 336 ms pop: the queue looks
    // empty while the tile is still landing. Only the pump knows what is playing.
    expect(boardHasSettled({ waiting: kinds(), playing: 'grow', reducedMotion: false })).toBe(false);
    expect(boardHasSettled({ waiting: kinds(), playing: 'strangle', reducedMotion: false })).toBe(false);
  });

  it('shows the moment the last board change has landed, with only the outcome cue + sync left', () => {
    // `end` is the result's own sound/flourish (no board change) and `sync` writes the truth the
    // steps have already applied, so neither may hold the plate.
    expect(boardHasSettled({ waiting: kinds('end', 'sync'), playing: 'end', reducedMotion: false })).toBe(true);
    expect(boardHasSettled({ waiting: kinds('sync'), playing: 'sync', reducedMotion: false })).toBe(true);
    expect(boardHasSettled({ waiting: kinds('turn', 'end', 'sync'), playing: null, reducedMotion: false })).toBe(true);
    expect(boardHasSettled({ waiting: kinds(), playing: null, reducedMotion: false })).toBe(true);
  });

  it('does not wait for a flight that will never play: Reduce motion shows at once', () => {
    expect(boardHasSettled({ waiting: kinds('grow', 'strangle', 'end', 'sync'), playing: 'grow', reducedMotion: true })).toBe(true);
    expect(boardHasSettled({ waiting: kinds('draw'), playing: null, reducedMotion: true })).toBe(true);
  });

  it('names exactly the steps that can wait: the outcome cue, the hand-over, the closing sync', () => {
    for (const k of ['end', 'turn', 'sync'] as const) expect(isSettledStep(k), k).toBe(true);
    for (const k of ['grow', 'sever', 'remove', 'strengthen', 'fruit', 'megaBomb', 'strangle', 'draw', 'discard'] as const) {
      expect(isSettledStep(k), k).toBe(false);
    }
  });

  it('has one fallback, and it is a stall — not a delay a moving board can trip', () => {
    expect(resultHoldStalled(RESULT_HOLD_STALL_MS - 1)).toBe(false);
    expect(resultHoldStalled(RESULT_HOLD_STALL_MS)).toBe(true);
    // It must be longer than the slowest single beat a real finish can play at Slow speed (the
    // KO's landmark: ~2.9 s of beats + the 0.6 s tail = ~3.5 s), so it can never cut one short.
    expect(RESULT_HOLD_STALL_MS).toBeGreaterThan(4_000);
  });
});

describe('the queue the gate reads', () => {
  it('kinds() reports the waiting steps in play order, without consuming them', () => {
    const q = new AnimQueue({});
    const steps: Step[] = [
      { k: 'draw', player: 0, from: 'deck' },
      { k: 'strangle', loser: 1 },
      { k: 'end', result: { winner: 0, reason: 'strangle', scores: [3, 1] } },
    ];
    q.push(steps);
    expect(q.kinds()).toEqual(['draw', 'strangle', 'end']);
    expect(q.pending).toBe(3);
    q.next();
    expect(q.kinds()).toEqual(['strangle', 'end']);
  });
});

describe('the online finish screen asks the gate', () => {
  it('main.ts uses the shared decision in the online branch', () => {
    // A source-level pin: the online branch must not go back to "show as soon as the view lands".
    expect(mainSource).toMatch(/const settled = wanted && !os\?\.isPreparingCatchUp && boardHasSettled\(\{/);
    expect(mainSource).toMatch(/const show = wanted && \(!wasHidden \|\| settled\)/);
    // ...and it must hold (with the stall net armed), not just return silently, while it waits.
    expect(mainSource).toMatch(/if \(wanted\) armResultHold\(\);/);
  });

  it('holds through the render that runs INSIDE consumeCatchUp, before the steps are queued', () => {
    // The real race (measured on two Chromium seats, 2026-10-25): `consumeCatchUp` calls
    // `driver.skipCatchUp()`, which emits; that emit runs a full onChange + render BEFORE the
    // caller receives the steps. At that render the queue is empty, so a queue-only gate showed
    // the loser's plate 143 ms before the final turn's replay started.
    const view = viewFor(newGame(7), 0);
    const persp = onlinePerspective(0);
    let session!: OnlineSession;
    const events: Event[] = [{ t: 'GameEnd', result: { winner: 0, reason: 'strangle', scores: [12, 4] } }];
    let pending: Event[] = [...events];
    let sawPreparing = false;
    let sawStepsQueued = false;
    const driver = {
      snapshot: () => ({
        kind: 'online',
        matchId: 'm',
        seat: 0,
        status: 'finished',
        revision: 9,
        turnStartRevision: 8,
        startingPlayer: 0,
        view,
        serverPhase: view.phase,
        screenView: view,
        legal: [],
        screenLegal: [],
        events: [],
        screenEvents: [],
        turnDeadlineAt: null,
        result: { winner: 0, reason: 'strangle', scores: [12, 4] },
        opponentName: null,
        connection: 'online',
        presence: 'unknown',
        remainingMs: 0,
        hasDraft: false,
        notice: null,
        perspective: { me: 0, opp: 1, rotated: false, coachEnabled: false, hiddenDeckHintsEnabled: false, scoreMeLabel: '', scoreOpponentLabel: '' },
      }),
      perspective: () => persp,
      draft: () => ({ shadow: () => null }),
      pendingEvents: () => pending,
      pendingOrigin: () => 'live' as const,
      // The real driver clears the buffer then emits; the page's onChange calls consumeCatchUp
      // (empty now) and renders — the window this test is about.
      skipCatchUp: () => {
        pending = [];
        sawPreparing = session.isPreparingCatchUp;
        sawStepsQueued = session.consumeCatchUp().length > 0;
      },
    } as unknown as OnlineDriver;
    session = new OnlineSession(driver);
    const steps = session.consumeCatchUp();
    expect(steps.map((s) => s.k)).toEqual(['end', 'sync']);
    expect(sawPreparing, 'the re-entrant render must see the catch-up being prepared').toBe(true);
    expect(sawStepsQueued, 'the re-entrant call must not steal the events').toBe(false);
    expect(session.isPreparingCatchUp, 'the flag must be clear once the steps are handed over').toBe(false);
  });
});
