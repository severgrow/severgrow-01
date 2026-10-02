// The coach's "Show me": which one thing to tap next to make the suggested move.
// An arrow points at it (a card, a hex, Confirm, a pile or a button), step by step.
import type { Action, View } from '../../../src/engine/index.js';
import { moveCards, moveHexes } from '../../../src/playtest/names.js';
import { coordKey } from '../../../src/engine/index.js';
import { isBoardAction, kindOf, options, pendingAction, selFor } from './interaction.js';
import type { Sel } from './interaction.js';

export type GuideTarget =
  | { kind: 'card'; id: number }
  | { kind: 'hex'; key: string }
  | { kind: 'confirm' }
  | { kind: 'other'; option: number }
  | { kind: 'cancel' }
  | { kind: 'deck' }
  | { kind: 'discard' }
  | { kind: 'end' }
  | { kind: 'button' }
  | { kind: 'kind'; move: string };

const same = (a: Action | null, b: Action) => !!a && JSON.stringify(a) === JSON.stringify(b);

/** The next tap towards `goal`, or null if `goal` is not a legal move right now. */
export const guideTarget = (v: View, legal: readonly Action[], sel: Sel, goal: Action): GuideTarget | null => {
  if (!legal.some((a) => same(a, goal))) return null;
  if (goal.t === 'Draw') return { kind: goal.from };
  if (goal.t === 'EndAct') return { kind: 'end' };
  const pending = pendingAction(v, legal, sel);
  if (same(pending, goal)) return { kind: 'confirm' };
  if (goal.t === 'Discard') return { kind: 'card', id: goal.card };
  if (!isBoardAction(goal)) return { kind: 'button' };
  // A line or clump: tap its button first (a plain card tap would pick Sprout).
  const goalKind = kindOf(goal)!;
  if (goalKind !== 'sprout' && sel.kind !== goalKind && sel.hex === null) return { kind: 'kind', move: goalKind };
  if (sel.kind !== null && sel.kind !== goalKind) return { kind: 'cancel' };

  const want = selFor(v, legal, goal);
  const copy = (id: number) => {
    const c = v.hand.find((h) => h.id === id);
    return (x: number) => {
      const d = v.hand.find((h) => h.id === x);
      return !!c && !!d && c.suit === d.suit && c.rank === d.rank;
    };
  };
  const goalCards = moveCards(goal);
  const cardOk = sel.card !== null && goalCards.some(copy(sel.card));
  if (!cardOk) return sel.card === null && sel.hex !== null ? { kind: 'cancel' } : { kind: 'card', id: want.card ?? goalCards[0]! };
  const hexes = moveHexes(goal).map(coordKey);
  if (sel.hex === null || !hexes.includes(sel.hex)) return { kind: 'hex', key: want.hex! };
  // Right card and hex, another way to grow there: the guide switches to it directly
  // (its place in the list the player is looking at right now).
  const i = options(v, legal, sel).findIndex((a) => same(a, goal));
  return i >= 0 ? { kind: 'other', option: i } : { kind: 'cancel' };
};
