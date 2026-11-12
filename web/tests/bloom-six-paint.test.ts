// Painting a six-card Bloom must commit exactly the painted tiles and must never throw. The
// owner's crash report (2026-10-25) also demanded that a half-chosen six-card assignment be a calm
// refusal, not an unhandled `IllegalActionError` from `apply`.
import { describe, expect, it } from 'vitest';
import { coordKey, legalActions, newGame, viewFor } from '../../src/engine/index.js';
import type { Action, Card, State } from '../../src/engine/index.js';
import { comboFor, drawNext, drawStarts, paintEnter, paintMatch, rankAt } from '../src/logic/draw.js';
import type { Combo } from '../src/logic/draw.js';
import { EMPTY_SEL, kindOf } from '../src/logic/interaction.js';
import { Session } from '../src/logic/session.js';

function sixCard(): { state: State; combo: Combo; order: string[]; action: Extract<Action, { t: 'Bloom' }> } {
  const start = newGame(11);
  const terrain = { ...start.terrain };
  for (const key of Object.keys(terrain)) terrain[key] = 'normal';
  const hand: Card[] = [1, 2, 3, 4, 5, 6].map((rank, id) => ({ id: 900 + id, suit: 0 as const, rank }));
  const state: State = { ...start, terrain, phase: 'ACT', actor: 0, turnPlayer: 0, hands: [hand, start.hands[1]] };
  const v = viewFor(state, 0);
  const legal = legalActions(v);
  const six = legal.find((a) => a.t === 'Bloom' && a.cards.length === 6 && a.cards.every((id) => hand.some((c) => c.id === id))) as Extract<typeof legal[number], { t: 'Bloom' }>;
  const combo = comboFor(v, legal, { ...EMPTY_SEL, kind: kindOf(six)! })!;
  let order: string[] = [];
  for (const s of drawStarts(combo)) {
    order = [s];
    while (order.length < 6) {
      const next = [...drawNext(combo, order)][0];
      if (!next) break;
      order.push(next);
    }
    if (order.length === 6 && paintMatch(combo, order)) break;
  }
  const action = paintMatch(combo, order)!;
  return { state, combo, order, action };
}

const pos = sixCard();

describe('painting a six-card Bloom', () => {
  it('the painted order is the committed order: exact tiles, exact numbers', () => {
    const { state, combo, order, action } = pos;
    const session = new Session(state, 0);
    let shape: string[] = [];
    for (const key of order) shape = paintEnter(combo, shape, key);
    expect(shape).toEqual(order);
    const played = session.play(action)!;
    expect(played).not.toBeNull();
    expect(session.state.hands[0]).toHaveLength(0);
    order.forEach((key, i) => {
      expect(coordKey(action.hexes[i]!)).toBe(key);
      expect(session.state.board[key]?.owner).toBe(0);
      expect(session.state.board[key]?.strength).toBe(rankAt(combo, i, false));
    });
  });

  it('an illegal six-card assignment is refused calmly, never thrown', () => {
    const { state, action } = pos;
    const session = new Session(state, 0);
    // The cards are a legal six-card group, but these tiles are not one connected cluster.
    const far = action.hexes.map((h, i) => ({ q: h.q + (i === 1 ? 5 : 0), r: h.r + (i === 1 ? 3 : 0) }));
    const bad: Extract<Action, { t: 'Bloom' }> = { ...action, hexes: far };
    let result: unknown;
    expect(() => { result = session.play(bad); }).not.toThrow();
    expect(result).toBeNull();
    // The game is untouched: the cards are still in hand and the board has not changed.
    expect(session.state).toBe(state);
    expect(session.state.hands[0]).toHaveLength(6);
  });

  it('the same refusal is quiet for a wrong-count placement', () => {
    const { state, action } = pos;
    const session = new Session(state, 0);
    const bad: Extract<Action, { t: 'Bloom' }> = { ...action, hexes: action.hexes.slice(0, 5) as typeof action.hexes };
    let result: unknown;
    expect(() => { result = session.play(bad); }).not.toThrow();
    expect(result).toBeNull();
    expect(session.state.hands[0]).toHaveLength(6);
  });
});
