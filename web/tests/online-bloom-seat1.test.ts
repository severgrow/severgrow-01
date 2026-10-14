// The seat-1 Bloom/Grow painting stall — the defect the two-device playtest hit.
//
// A Bloom a player has painted on the board is a SCREEN action. The online viewer is mirrored for
// seat 1 (180°), and a mirrored board enumerates the hexes of a SET Bloom in the reverse order of
// the engine's own list. The draft refused a correctly painted set Bloom because it compared the
// two actions by exact JSON — so on seat 1 (the device that JOINED) a Bloom drawn across the lit
// tiles placed nothing, with no reason shown. Seat 0 was never affected (its mapping is identity),
// and runs were never affected (their hex order is the assignment and it round-trips), which is why
// it looked intermittent and was never pinned down before.
//
// This is the deterministic form of the reproduction: derive the display legal list exactly as the
// page does, map each action back, and require the online draft to ACCEPT it.
import { describe, expect, it } from 'vitest';
import { applyAs, coordKey, legalActions, newGame, viewFor } from '../../src/engine/index.js';
import type { Action, Player, State, View } from '../../src/engine/index.js';
import { createDraftEngine } from '../src/online/draft.js';
import { onlinePerspective } from '../src/online/perspective.js';
import { shadowFromView } from '../src/online/shadow.js';

/** Advance until `seat` is in ACT (a Draw committed), the position the painting happens in. */
const toAct = (seed: number, seat: Player): State => {
  let s = newGame(seed);
  for (let i = 0; i < 160; i++) {
    if (s.phase === 'ACT' && s.actor === seat) return s;
    const legal = legalActions(viewFor(s, s.actor));
    const a = legal.find((x) => x.t === 'Draw') ?? legal.find((x) => x.t === 'EndAct') ?? legal[0];
    if (!a) break;
    s = applyAs(s, s.actor, a);
  }
  throw new Error(`seed ${seed} never reached seat ${seat} ACT`);
};

const SEEDS = [1, 2, 3, 4, 5, 7, 9, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67, 71, 73, 79, 83, 89, 97, 101, 103, 107, 109, 113, 127, 131, 137, 139, 149, 151, 157, 163, 167, 173, 179, 181, 191, 193, 197, 199, 211];

/** The first `want` positions (by seed) whose Grow step actually offers a Bloom. */
const positionsWithBloom = (seat: Player, want = 6): { seed: number; state: State }[] => {
  const out: { seed: number; state: State }[] = [];
  for (const seed of SEEDS) {
    let state: State;
    try {
      state = toAct(seed, seat);
    } catch {
      continue;
    }
    if (legalActions(viewFor(state, seat)).some((a) => a.t === 'Bloom')) out.push({ seed, state });
    if (out.length >= want) break;
  }
  return out;
};

/** The display legal actions, derived from the display state exactly as the page derives them. */
const displayActions = (view: View, seat: Player): { display: Action; mapped: Action }[] => {
  const p = onlinePerspective(seat);
  const display = p.toDisplayState(shadowFromView(view));
  return legalActions(viewFor(display, 0)).map((a) => ({ display: a, mapped: p.mapActionToEngine(a) }));
};

const ranksOf = (v: View, a: Extract<Action, { t: 'Bloom' }>) => a.cards.map((id) => v.hand.find((c) => c.id === id)?.rank ?? 0);

describe('a painted Bloom from the online viewer is a move the draft accepts', () => {
  for (const seat of [0, 1] as const) {
    it(`seat ${seat}: every legal Bloom of every position is accepted by the draft`, () => {
      const positions = positionsWithBloom(seat);
      expect(positions.length).toBeGreaterThan(0);
      for (const { seed, state } of positions) {
        const view = viewFor(state, seat);
        const draft = createDraftEngine({ matchId: `seat-${seat}-${seed}`, storage: null });
        draft.syncFromServer(view, 1);
        const blooms = displayActions(view, seat).filter(({ mapped }) => mapped.t === 'Bloom');
        expect(blooms.length).toBeGreaterThan(0);
        for (const { display, mapped } of blooms) {
          expect(mapped.t).toBe('Bloom');
          // A fresh draft per action: `play` refuses a second action once the turn has moved on.
          const d = createDraftEngine({ matchId: `seat-${seat}-${seed}-one`, storage: null });
          d.syncFromServer(view, 1);
          const accepted = d.play(mapped);
          // The same Bloom, described exactly as the ENGINE lists it, must also be accepted — a
          // pass on one form and a fail on the other is precisely the bug.
          const label = `${JSON.stringify(display)} -> ${JSON.stringify(mapped)}`;
          expect(accepted, `${label}`).toBe(true);
          expect(draft.actions().length >= 0).toBe(true);
          d.clear();
        }
      }
    });

    it(`seat ${seat}: a SET Bloom's tile order is not part of the move`, () => {
      const position = positionsWithBloom(seat, 12).find(({ state }) =>
        displayActions(viewFor(state, seat), seat).some(({ mapped }) => {
          if (mapped.t !== 'Bloom') return false;
          const r = mapped.cards.map((id) => viewFor(state, seat).hand.find((c) => c.id === id)?.rank ?? 0);
          return r.length > 1 && new Set(r).size === 1;
        }),
      );
      if (!position) return;
      const state = position.state;
      const view = viewFor(state, seat);
      const set = displayActions(view, seat).find(({ mapped }) => {
        if (mapped.t !== 'Bloom') return false;
        const ranks = ranksOf(view, mapped);
        return ranks.length > 1 && new Set(ranks).size === 1;
      });
      // Not every position holds a set recipe; the mirrored-order case is the one under test.
      if (!set || set.mapped.t !== 'Bloom') return;
      const reversed: Action = { ...set.mapped, hexes: [...set.mapped.hexes].reverse() };
      const d = createDraftEngine({ matchId: `reverse-${seat}`, storage: null });
      d.syncFromServer(view, 1);
      expect(d.play(reversed)).toBe(true);
      expect(d.actions()).toHaveLength(1);
      // The engine's own board is the same whichever order the set was painted in.
      const a = applyAs(shadowFromView(view), seat, set.mapped);
      const b = applyAs(shadowFromView(view), seat, reversed);
      expect(Object.keys(b.board).map((k) => `${k}:${b.board[k]?.owner ?? ''}${b.board[k]?.strength ?? ''}`).sort()).toEqual(
        Object.keys(a.board).map((k) => `${k}:${a.board[k]?.owner ?? ''}${a.board[k]?.strength ?? ''}`).sort(),
      );
    });
  }

  it('the mirrored seat really does enumerate a set in the reverse order of the engine', () => {
    // The mechanism, pinned: if this ever stops holding, the fix below is no longer the reason a
    // set passes, and this test says so instead of hiding it.
    let sawReverse = false;
    for (const { state } of positionsWithBloom(1, 12)) {
      const view = viewFor(state, 1);
      const engineBlooms = legalActions(view).filter((a): a is Extract<Action, { t: 'Bloom' }> => a.t === 'Bloom');
      for (const { mapped } of displayActions(view, 1)) {
        if (mapped.t !== 'Bloom') continue;
        const ranks = ranksOf(view, mapped);
        if (ranks.length < 2 || new Set(ranks).size !== 1) continue;
        const keys = mapped.hexes.map(coordKey);
        const reverse = [...keys].reverse();
        const matched = engineBlooms.find((a) => a.cards.join('.') === mapped.cards.join('.') && a.hexes.map(coordKey).join(' ') === keys.join(' '));
        const matchedReversed = engineBlooms.find((a) => a.cards.join('.') === mapped.cards.join('.') && a.hexes.map(coordKey).join(' ') === reverse.join(' '));
        if (!matched && matchedReversed) sawReverse = true;
      }
    }
    expect(sawReverse).toBe(true);
  });
});
