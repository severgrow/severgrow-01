// The coach's "Show me": which one thing to tap next to make the suggested move.
// An arrow points at it (a card, a hex, Confirm, a pile or a button), step by step.
import type { Action, View } from '../../../src/engine/index.js';
import { moveCards, moveHexes } from '../../../src/playtest/names.js';
import { coordKey } from '../../../src/engine/index.js';
import { isBoardAction, kindOf, options, pendingAction, selFor } from './interaction.js';
import type { Sel } from './interaction.js';
import { fruitAction } from './fruitflow.js';
import type { FruitFlow } from './fruitflow.js';

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
  | { kind: 'kind'; move: string }
  /** polish pass 3: "Fruit this tile" in the tile card, then Change / Next in the Fruit flow */
  | { kind: 'fruit' }
  | { kind: 'change' }
  | { kind: 'next' };

const same = (a: Action | null, b: Action) => !!a && JSON.stringify(a) === JSON.stringify(b);

/**
 * The next tap towards `goal`, or null if `goal` is not a legal move right now. A Fruit is
 * guided through its own flow (`flow`, polish pass 3): the target (its tile card opens,
 * `card`), "Fruit this tile", then Change and the tiles only if the suggested set differs,
 * Next, and Confirm.
 */
export const guideTarget = (v: View, legal: readonly Action[], sel: Sel, goal: Action, flow: FruitFlow | null = null, card: string | null = null): GuideTarget | null => {
  if (!legal.some((a) => same(a, goal))) return null;
  if (goal.t === 'Fruit') {
    const target = coordKey(goal.target);
    if (!flow) return card === target ? { kind: 'fruit' } : { kind: 'hex', key: target };
    if (flow.target !== target) return { kind: 'cancel' };
    const want = goal.sacrifice.map(coordKey);
    const right = flow.picks.length === want.length && want.every((k) => flow.picks.includes(k));
    if (flow.step === 2) return same(fruitAction(legal, flow), goal) ? { kind: 'confirm' } : { kind: 'cancel' };
    if (!flow.changing) return right ? { kind: 'next' } : { kind: 'change' };
    const wrong = flow.picks.find((k) => !want.includes(k));
    return { kind: 'hex', key: wrong ?? want.find((k) => !flow.picks.includes(k))! };
  }
  if (flow) return { kind: 'cancel' };
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
