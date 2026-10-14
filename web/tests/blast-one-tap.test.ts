// The Blast is ONE tap (owner's rule, 2026-10-14), and its special animation really is wired.
//
// Before this pass a Blast was the only Futa04 board move that asked for a second confirmation
// tap: `asksConfirm` exempted Bloom, Sprout and a Fruit card but not MegaBomb, and `maybeAutoPlay`
// deliberately skipped it. Grow and Bloom place on the tap with Undo as the safety net; the Blast
// now does exactly the same, offline and online.
import { describe, expect, it } from 'vitest';
import { allNeighbors, apply, coordKey, legalActions, newGame, viewFor } from '../../src/engine/index.js';
import type { Event, Player, State } from '../../src/engine/index.js';
import { buildSteps } from '../src/logic/anim.js';
import { futa04OneTap } from '../src/logic/interaction.js';
import { createDraftEngine } from '../src/online/draft.js';
import { stepsFromEvents } from '../src/online/steps-from-events.js';
import { onlinePerspective } from '../src/online/perspective.js';

/** A position with a legal Blast: two Bomb cards in hand, an enemy tile and its neighbours. */
const blastPosition = (): { state: State; target: { q: number; r: number } } => {
  const base = newGame(3107);
  const target = { q: -1, r: 2 };
  const board = { ...base.board, [coordKey(target)]: { owner: 1 as Player, strength: 9 } };
  for (const neighbour of allNeighbors(target)) {
    if (board[coordKey(neighbour)] === null) board[coordKey(neighbour)] = { owner: 1, strength: 4 };
  }
  const state: State = {
    ...base,
    phase: 'ACT',
    actor: 0,
    turnPlayer: 0,
    board,
    hands: [
      [
        { id: 1000, suit: null, rank: 0 },
        { id: 1001, suit: null, rank: 0 },
        { id: 1002, suit: 0, rank: 3 },
      ],
      base.hands[1],
    ],
  };
  return { state, target };
};

describe('the Blast is a single tap', () => {
  it('Futa04 places every board move on one tap (Throw still asks)', () => {
    expect(futa04OneTap({ t: 'MegaBomb', cards: [1000, 1001], target: { q: 0, r: 0 } })).toBe(true);
    expect(futa04OneTap({ t: 'Bloom', cards: [1, 2, 3], hexes: [] })).toBe(true);
    expect(futa04OneTap({ t: 'Sprout', card: 1, coord: { q: 0, r: 0 } })).toBe(true);
    expect(futa04OneTap({ t: 'PlayFruit', card: 7, target: { q: 0, r: 0 } })).toBe(true);
    // The Throw still asks (its Discard ends the turn), and so does a plain end of step.
    expect(futa04OneTap({ t: 'Discard', card: 3 })).toBe(false);
    expect(futa04OneTap({ t: 'EndAct' })).toBe(false);
  });

  it('ONLINE: one tap adds the Blast to the local draft batch — it is not sent to the server', () => {
    const { state, target } = blastPosition();
    const view = viewFor(state, 0);
    const blast =
      legalActions(view).find((a) => a.t === 'MegaBomb' && coordKey(a.target) === coordKey(target)) ??
      legalActions(view).find((a) => a.t === 'MegaBomb');
    expect(blast, 'the position offers a legal Blast').toBeTruthy();
    if (!blast || blast.t !== 'MegaBomb') return;

    const draft = createDraftEngine({ matchId: 'blast-one-tap', storage: null });
    draft.syncFromServer(view, 1);
    // The single tap: the move is accepted into the draft.
    expect(draft.play(blast)).toBe(true);
    // The draft/batch conclusion: nothing has been sent — the Blast waits with the turn and is
    // submitted as one atomic batch when the player Throws.
    expect(draft.hasDraft()).toBe(true);
    expect(draft.actions()).toHaveLength(1);
    // Undo is the safety net the owner relies on instead of a confirmation tap.
    expect(draft.canUndo()).toBe(true);
    expect(draft.undo()).toBe(true);
    expect(draft.hasDraft()).toBe(false);
    expect(draft.actions()).toHaveLength(0);
  });

  // The mirrored seat's board-move round trip is covered by `online-bloom-seat1.test.ts`, where
  // the same one-tap rule (`sameMove`) is what makes a painted move reach the draft.
});

describe('the special Blast animation is wired (the owner asked)', () => {
  it('OFFLINE: a Blast produces its own `megaBomb` step, not a grow/bloom one', () => {
    const { state, target } = blastPosition();
    const blast =
      legalActions(viewFor(state, 0)).find((a) => a.t === 'MegaBomb' && coordKey(a.target) === coordKey(target)) ??
      legalActions(viewFor(state, 0)).find((a) => a.t === 'MegaBomb');
    expect(blast?.t).toBe('MegaBomb');
    if (!blast || blast.t !== 'MegaBomb') return;
    const after = apply(state, blast);
    const steps = buildSteps(state, blast, after, 0);
    const step = steps.find((s) => s.k === 'megaBomb');
    expect(step, 'buildSteps emits a megaBomb step').toBeTruthy();
    if (step?.k === 'megaBomb') {
      expect(step.player).toBe(0);
      expect(step.target).toBe(coordKey(blast.target));
      expect(step.destroyed.length).toBeGreaterThan(0);
    }
    // No generic grow step is emitted for it.
    expect(steps.some((s) => s.k === 'grow')).toBe(false);
  });

  it('ONLINE: the same Blast event becomes the same `megaBomb` step', () => {
    const { state, target } = blastPosition();
    const found = legalActions(viewFor(state, 0)).filter((a) => a.t === 'MegaBomb');
    const blast = found.find((a) => coordKey(a.target) === coordKey(target)) ?? found[0];
    if (!blast || blast.t !== 'MegaBomb') throw new Error('no Blast');
    const steps = stepsFromEvents(
      [{ t: 'MegaBomb', player: 0, cards: [1000, 1001], target: blast.target, destroyed: [blast.target] } as Event],
      onlinePerspective(0),
    );
    const step = steps.find((s) => s.k === 'megaBomb');
    expect(step).toBeTruthy();
    if (step?.k === 'megaBomb') {
      expect(step.player).toBe(0);
      expect(step.target).toBe(coordKey(blast.target));
    }
  });
});
