// The timed-out turn the server plays: legal by construction, hidden-information safe, and
// deterministic — checked across 200 random late-game positions (including empty-deck turns).
import { describe, expect, it } from 'vitest';
import {
  CURRENT_RULES_VERSION,
  applyAs,
  legalActionsForState,
  matchSetup,
  mulberry32,
  randomInt,
  shuffle,
  stateFromSetup,
} from '../../src/engine/index.js';
import type { Player, State } from '../../src/engine/index.js';
import { autoPlayTurn } from '../src/live/autoplay.js';

/** Play random legal moves from a seeded deal until the deck is low (a late-game position). */
const latePosition = (seed: number): State | null => {
  const rng = mulberry32(seed);
  let s = stateFromSetup(matchSetup(seed, CURRENT_RULES_VERSION));
  const stopAt = randomInt(rng, 6); // deck size to stop at: 0..5
  for (let i = 0; i < 2000; i++) {
    if (s.phase === 'GAME_OVER') return null;
    if (s.phase === 'DRAW' && s.deck.length <= stopAt) return s;
    const legal = legalActionsForState(s);
    if (legal.length === 0) return null;
    // Prefer short turns so we reach the late game quickly.
    const quick = legal.filter((a) => a.t === 'Draw' || a.t === 'EndAct' || a.t === 'Discard' || a.t === 'Continue');
    const pool = quick.length > 0 && randomInt(rng, 4) !== 0 ? quick : legal;
    s = applyAs(s, s.actor, pool[randomInt(rng, pool.length)]!);
  }
  return null;
};

const positions = (): { state: State; midTurn: boolean }[] => {
  const out: { state: State; midTurn: boolean }[] = [];
  for (let seed = 1; out.length < 200 && seed < 5000; seed++) {
    const s = latePosition(seed * 7919);
    if (!s) continue;
    // Every third position: the player already drew (a timeout mid-turn).
    if (out.length % 3 === 1) {
      const draw = legalActionsForState(s).find((a) => a.t === 'Draw');
      if (draw) {
        out.push({ state: applyAs(s, s.actor, draw), midTurn: true });
        continue;
      }
    }
    // Every fifth position: an empty deck (the throw pile is the only draw).
    if (out.length % 5 === 0 && s.discard.length > 0) {
      const empty: State = { ...s, deck: [] };
      out.push({ state: empty, midTurn: false });
      continue;
    }
    out.push({ state: s, midTurn: false });
  }
  return out;
};

const ALL = positions();

describe('live auto-play', () => {
  it('found 200 late-game positions, including empty-deck and mid-turn ones', () => {
    expect(ALL).toHaveLength(200);
    expect(ALL.filter((p) => p.state.deck.length === 0).length).toBeGreaterThan(20);
    expect(ALL.filter((p) => p.midTurn).length).toBeGreaterThan(20);
  });

  it('never produces an illegal action and always finishes the turn (or the game)', () => {
    for (const { state } of ALL) {
      const seat = state.actor;
      const actions = autoPlayTurn(state, seat, null);
      expect(actions.length).toBeGreaterThan(0);
      let s = state;
      for (const a of actions) {
        const legal = legalActionsForState(s);
        expect(legal).toContainEqual(a);
        s = applyAs(s, seat, a);
      }
      expect(s.phase === 'GAME_OVER' || s.turnNumber === state.turnNumber + 1).toBe(true);
      // Never a Grow: the auto-play skips the Grow step.
      expect(actions.some((a) => a.t === 'Sprout' || a.t === 'Bloom' || a.t === 'PlayFruit' || a.t === 'MegaBomb')).toBe(false);
    }
  });

  it('throws the drawn card when the rules allow it', () => {
    let checked = 0;
    for (const { state } of ALL) {
      if (state.phase !== 'DRAW' || state.deck.length === 0) continue;
      const seat = state.actor;
      const actions = autoPlayTurn(state, seat, null);
      const drawn = state.deck[0]!;
      const thrown = actions.find((a) => a.t === 'Discard');
      if (thrown && thrown.t === 'Discard') {
        const all = [...state.hands[seat], drawn];
        const card = all.find((c) => c.id === thrown.card)!;
        expect([card.suit, card.rank]).toEqual([drawn.suit, drawn.rank]);
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(50);
  });

  it('is hidden-information safe: the choice does not change when the opponent hand and the deck order change', () => {
    const rng = mulberry32(42);
    for (const { state } of ALL) {
      const seat: Player = state.actor;
      const opp: Player = seat === 0 ? 1 : 0;
      const base = autoPlayTurn(state, seat, null);
      // Swap the opponent's hand with unseen deck cards and reshuffle the rest of the deck (below the
      // top card the player is about to draw, which the rules give them).
      const top = state.deck.slice(0, 1);
      const pool = shuffle([...state.deck.slice(1), ...state.hands[opp]], rng);
      const oppHand = pool.slice(0, state.hands[opp].length);
      const rest = pool.slice(state.hands[opp].length);
      const hands: [typeof state.hands[0], typeof state.hands[1]] = seat === 0 ? [state.hands[0], oppHand] : [oppHand, state.hands[1]];
      const other: State = { ...state, hands, deck: [...top, ...rest] };
      expect(autoPlayTurn(other, seat, null)).toEqual(base);
    }
  });

  it('is deterministic', () => {
    for (const { state } of ALL.slice(0, 50)) {
      expect(autoPlayTurn(state, state.actor, null)).toEqual(autoPlayTurn(structuredClone(state), state.actor, null));
    }
  });
});
