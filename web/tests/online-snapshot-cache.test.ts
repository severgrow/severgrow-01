// Entering an online game asked "is it my turn?", "is it finished?" and "is the board blocked?"
// many times per render, and each answer rebuilt the whole board view and re-ran the move
// generator (measured 2026-11-10: ~0.3 s of a 2 s entry at 4x CPU; CI's slow runners tipped the
// presence journey over its limit). Asking again with nothing changed must reuse the same answer;
// any real change must give a fresh one.
import { describe, expect, it } from 'vitest';
import { applyAs, legalActions, newGame, viewFor } from '../../src/engine/index.js';
import { createDraftEngine } from '../src/online/draft.js';

const memoryStore = () => {
  const m = new Map<string, string>();
  return { get: (k: string) => m.get(k) ?? null, set: (k: string, v: string) => void m.set(k, v), remove: (k: string) => void m.delete(k) };
};

const actPosition = () => {
  let s = newGame(11);
  const draw = legalActions(viewFor(s, s.actor)).find((a) => a.t === 'Draw')!;
  s = applyAs(s, s.actor, draw);
  return viewFor(s, s.actor);
};

describe('the draft answers again without recomputing', () => {
  it('view() and legal() are the same objects until something changes', () => {
    const draft = createDraftEngine({ matchId: 'cache1', storage: memoryStore() });
    draft.syncFromServer(actPosition(), 3);
    expect(draft.view()).toBe(draft.view());
    expect(draft.legal()).toBe(draft.legal());
  });

  it('a move gives a fresh view and fresh moves, and those are reused in turn', () => {
    const draft = createDraftEngine({ matchId: 'cache2', storage: memoryStore() });
    draft.syncFromServer(actPosition(), 3);
    const before = { view: draft.view(), legal: draft.legal() };
    const grow = before.legal.find((a) => a.t === 'Sprout')!;
    expect(draft.play(grow)).toBe(true);
    const after = draft.view();
    expect(after).not.toBe(before.view);
    expect(draft.legal()).not.toBe(before.legal);
    expect(draft.view()).toBe(after);
    expect(draft.legal()).toBe(draft.legal());
    // undo returns to an equal position with fresh answers that are correct
    draft.undo();
    expect(draft.legal()).toEqual(before.legal);
  });

  it('a new server view replaces the cached answers', () => {
    const draft = createDraftEngine({ matchId: 'cache3', storage: memoryStore() });
    const v = actPosition();
    draft.syncFromServer(v, 3);
    const first = draft.legal();
    const s2 = { ...v };
    draft.syncFromServer(s2, 4);
    expect(draft.view()).toBe(s2);
    expect(draft.legal()).not.toBe(first);
    expect(draft.legal()).toEqual(first);
  });
});
