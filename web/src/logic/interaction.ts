// Tap-to-play: what the player has picked so far (a card, a hex, a kind of move) and
// what that means on the board. Pure functions of the player's View and legal moves.
import { coordKey } from '../../../src/engine/index.js';
import type { Action, View } from '../../../src/engine/index.js';
import { simulate } from '../../../src/bots/evaluate.js';
import { moveCards, moveHexes, touchesHex } from '../../../src/playtest/names.js';

export type Sel = { card: number | null; hex: string | null; kind: string | null; option: number };
export const EMPTY_SEL: Sel = Object.freeze({ card: null, hex: null, kind: null, option: 0 }) as Sel;

export const isBoardAction = (a: Action): boolean =>
  a.t === 'MeldRun' || a.t === 'MeldSet' || a.t === 'Sprout' || a.t === 'Fruit' || a.t === 'RotPick';

/** "line-3", "clump-3", "sprout", "fruit" or "rot"; null for moves that are not on the board. */
export const kindOf = (a: Action): string | null => {
  switch (a.t) {
    case 'MeldRun':
      return `line-${a.cards.length}`;
    case 'MeldSet':
      return `clump-${a.cards.length}`;
    case 'Sprout':
      return 'sprout';
    case 'Fruit':
      return 'fruit';
    case 'RotPick':
      return 'rot';
    default:
      return null;
  }
};

export const kindLabel = (kind: string): string => {
  const [k, n] = kind.split('-');
  if (k === 'line') return `Grow a line of ${n}`;
  if (k === 'clump') return `Grow a clump of ${n}`;
  if (k === 'sprout') return 'Sprout one tile';
  if (k === 'fruit') return 'Use a fruit';
  return 'Pick a tile to rot';
};

/** True when card `b` is a copy of card `a` (same suit and number): copies play the same. */
const sameCard = (v: View, a: number, b: number) => {
  const x = v.hand.find((c) => c.id === a);
  const y = v.hand.find((c) => c.id === b);
  return !!x && !!y && x.suit === y.suit && x.rank === y.rank;
};

type Skip = 'card' | 'hex' | 'kind' | null;
const matching = (v: View, legal: readonly Action[], sel: Sel, skip: Skip = null): Action[] =>
  legal.filter(
    (a) =>
      isBoardAction(a) &&
      (skip === 'card' || sel.card === null || moveCards(a).some((id) => sameCard(v, sel.card!, id))) &&
      (skip === 'hex' || sel.hex === null || touchesHex(a, sel.hex)) &&
      (skip === 'kind' || sel.kind === null || kindOf(a) === sel.kind),
  );

/** Hexes worth tapping now: every hex the picked card (and kind) can grow on. */
export const targetHexes = (v: View, legal: readonly Action[], sel: Sel): Set<string> =>
  new Set(matching(v, legal, sel, 'hex').flatMap((a) => moveHexes(a).map(coordKey)));

/** Cards that can be used with the picked hex (and kind). */
export const usableCards = (v: View, legal: readonly Action[], sel: Sel): Set<number> => {
  const out = new Set<number>();
  const moves = matching(v, legal, sel, 'card');
  for (const c of v.hand) if (moves.some((a) => moveCards(a).some((id) => sameCard(v, c.id, id)))) out.add(c.id);
  if (legal.some((a) => a.t === 'Discard')) {
    for (const c of v.hand) if (legal.some((a) => a.t === 'Discard' && sameCard(v, c.id, a.card))) out.add(c.id);
  }
  return out;
};

const KIND_ORDER = (k: string) => (k.startsWith('line') ? 0 : k.startsWith('clump') ? 1 : k === 'sprout' ? 2 : 3);

/** The kinds of move still possible with what is picked, e.g. "Grow a line of 3 (4 ways)". */
export const kindsAvailable = (v: View, legal: readonly Action[], sel: Sel): { kind: string; label: string; count: number }[] => {
  const count = new Map<string, number>();
  for (const a of matching(v, legal, sel, 'kind')) count.set(kindOf(a)!, (count.get(kindOf(a)!) ?? 0) + 1);
  return [...count]
    .map(([kind, n]) => ({ kind, label: kindLabel(kind), count: n }))
    .sort((a, b) => KIND_ORDER(a.kind) - KIND_ORDER(b.kind) || a.kind.localeCompare(b.kind, 'en', { numeric: true }));
};

/** A quick "how good is it" score, so the best option is offered first. */
const quickScore = (v: View, a: Action): number => {
  const sim = simulate(v, a);
  if (!sim) return 0;
  return (sim.wins ? 1000 : 0) + sim.points + 0.5 * sim.botCut - 0.5 * sim.myLoss;
};

/** Every move that fits what is picked, best first (only once a hex is picked). */
export const options = (v: View, legal: readonly Action[], sel: Sel): Action[] => {
  if (sel.hex === null) return [];
  const list = matching(v, legal, sel).map((a, i) => ({ a, i, s: quickScore(v, a) }));
  return list.sort((x, y) => y.s - x.s || x.i - y.i).map((x) => x.a);
};

/** The move the Confirm button would play, or null. */
export const pendingAction = (v: View, legal: readonly Action[], sel: Sel): Action | null => {
  if (sel.card !== null && sel.hex === null) {
    const discard = legal.find((a) => a.t === 'Discard' && a.card === sel.card) ?? legal.find((a) => a.t === 'Discard' && sameCard(v, sel.card!, a.card));
    if (discard) return discard;
  }
  const opts = options(v, legal, sel);
  return opts.length ? opts[sel.option % opts.length]! : null;
};

/** The selection that makes `a` the pending move (for the coach's "Show me"). */
export const selFor = (v: View, legal: readonly Action[], a: Action): Sel => {
  const ids = moveCards(a);
  const hexes = moveHexes(a);
  const sel: Sel = { card: ids[0] ?? null, hex: hexes.length ? coordKey(hexes[0]!) : null, kind: kindOf(a), option: 0 };
  const i = options(v, legal, sel).findIndex((x) => JSON.stringify(x) === JSON.stringify(a));
  return { ...sel, option: Math.max(0, i) };
};

// ---------- taps ----------

export const tapCard = (v: View, legal: readonly Action[], sel: Sel, id: number): Sel => {
  if (sel.card === id) return { ...sel, card: null, option: 0 };
  const next: Sel = { ...sel, card: id, option: 0 };
  if (next.kind !== null && matching(v, legal, { ...next, hex: null }).length === 0) next.kind = null;
  if (next.hex !== null && matching(v, legal, next).length === 0) next.hex = null;
  return next;
};

export const tapHex = (v: View, legal: readonly Action[], sel: Sel, key: string): Sel => {
  if (sel.hex === key) return { ...sel, hex: null, option: 0 };
  if ((sel.card !== null || sel.kind !== null) && targetHexes(v, legal, sel).has(key)) return { ...sel, hex: key, option: 0 };
  return { card: null, kind: null, hex: key, option: 0 };
};

export const tapKind = (sel: Sel, kind: string): Sel => (sel.kind === kind ? { ...sel, kind: null, option: 0 } : { ...sel, kind, option: 0 });

/** The label of the button that switches between options: say what actually changes. */
export const optionsLabel = (opts: readonly Action[]): string => {
  const place = (a: Action) => moveHexes(a).map(coordKey).sort().join('|');
  const samePlace = opts.every((a) => place(a) === place(opts[0]!));
  if (!samePlace) return 'Other way';
  return opts.every((a) => moveCards(a).length === 1) ? 'Change card' : 'Change cards';
};
