// Tap-to-play: what the player has picked so far (a card, a hex, a kind of move) and
// what that means on the board. Pure functions of the player's View and legal moves.
import { coordKey } from '../../../src/engine/index.js';
import type { Action, Card, View } from '../../../src/engine/index.js';
import { BLOOM, FRUIT, SPROUT } from '../../../src/strings.js';
import { simulate } from '../../../src/bots/evaluate.js';
import { moveCards, moveHexes, touchesHex } from '../../../src/playtest/names.js';

export type Sel = { card: number | null; hex: string | null; kind: string | null; option: number };
export const EMPTY_SEL: Sel = Object.freeze({ card: null, hex: null, kind: null, option: 0 }) as Sel;

export const isBoardAction = (a: Action): boolean =>
  a.t === 'Bloom' || a.t === 'MegaBomb' || a.t === 'Sprout' || a.t === 'PlayFruit' || a.t === 'RotPick';

/**
 * "bloom-3-4.9.17" (a Bloom: its size and its card ids), "sprout", "fruit" or "rot"; null for
 * moves that are not on the board. Each card group that can bloom is its own kind.
 */
export const kindOf = (a: Action): string | null => {
  switch (a.t) {
    case 'Bloom':
      return `bloom-${a.cards.length}-${[...a.cards].sort((x, y) => x - y).join('.')}`;
    case 'MegaBomb':
      return `bloom-mega-${[...a.cards].sort((x, y) => x - y).join('.')}`;
    case 'Sprout':
      return 'sprout';
    case 'PlayFruit':
      return 'fruit';
    case 'RotPick':
      return 'rot';
    default:
      return null;
  }
};

export const kindLabel = (kind: string): string => {
  const [k, n] = kind.split('-');
  if (k === 'bloom') return n === 'mega' ? 'Mega Bomb' : BLOOM.button(Number(n));
  if (k === 'sprout') return `${SPROUT.Name} one tile`;
  if (k === 'fruit') return `Use a ${FRUIT.card}`;
  return 'Pick a tile to rot';
};

/** The short label for a move button when several share the row (the full words stay its accessible name). */
export const shortKindLabel = (kind: string): string => kindLabel(kind);

/** The card ids of a Bloom kind. */
export const kindCards = (kind: string): number[] => (kind.startsWith('bloom-') ? kind.split('-')[2]!.split('.').map(Number) : []);

/** True when card `b` is a copy of card `a` (same suit and number): copies play the same. */
const sameCard = (v: View, a: number, b: number) => {
  const x = v.hand.find((c) => c.id === a);
  const y = v.hand.find((c) => c.id === b);
  return !!x && !!y && x.suit === y.suit && x.rank === y.rank;
};

type Skip = 'card' | 'hex' | 'kind' | null;
// v0.6: a Fruit card is picked and played like any card (card, then its target).
const matching = (v: View, legal: readonly Action[], sel: Sel, skip: Skip = null): Action[] =>
  legal.filter(
    (a) =>
      isBoardAction(a) &&
      (skip === 'card' || sel.card === null || moveCards(a).some((id) => sameCard(v, sel.card!, id))) &&
      (skip === 'hex' || sel.hex === null || touchesHex(a, sel.hex)) &&
      (skip === 'kind' || (sel.kind === null ? !(a.t === 'MegaBomb' && sel.card !== null) : kindOf(a) === sel.kind)),
  );

/** v0.5: the three kinds of Sprout target, each with its own words (not colour alone). */
export type TargetKind = 'grow' | 'replace' | 'strengthen' | 'fruit';
export const TARGET_LABEL: Record<TargetKind, string> = {
  grow: 'Grow on an empty hex',
  replace: 'Replace an enemy tile',
  strengthen: 'Strengthen my tile',
  fruit: 'Remove with a Fruit card',
};

/** What a Sprout does to its hex: grow on empty, replace an enemy tile, or strengthen mine. */
export const sproutKind = (v: View, a: Action): TargetKind | null => {
  if (a.t !== 'Sprout') return null;
  const t = v.board[coordKey(a.coord)];
  return !t ? 'grow' : t.owner === v.player ? 'strengthen' : 'replace';
};

/** Each target hex and its kind (for any growing move: an empty hex grows, an enemy tile is replaced). */
export const targetKinds = (v: View, legal: readonly Action[], sel: Sel): Map<string, TargetKind> => {
  const out = new Map<string, TargetKind>();
  const fruit = sel.card !== null && v.hand.find((c) => c.id === sel.card)?.suit === null;
  for (const key of targetHexes(v, legal, sel)) {
    if (fruit) {
      out.set(key, 'fruit');
      continue;
    }
    const t = v.board[key];
    out.set(key, !t ? 'grow' : t.owner === v.player ? 'strengthen' : 'replace');
  }
  return out;
};

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

const KIND_ORDER = (k: string) => (k.startsWith('bloom') ? 0 : k === 'sprout' ? 2 : 3);

/** The kinds of move still possible with what is picked, e.g. "Grow a line of 3 (4 ways)". */
export const kindsAvailable = (v: View, legal: readonly Action[], sel: Sel): { kind: string; label: string; count: number }[] => {
  const count = new Map<string, number>();
  for (const a of matching(v, legal, sel, 'kind')) count.set(kindOf(a)!, (count.get(kindOf(a)!) ?? 0) + 1);
  return [...count]
    .map(([kind, n]) => ({ kind, label: kindLabel(kind), count: n }))
    .sort((a, b) => KIND_ORDER(a.kind) - KIND_ORDER(b.kind) || a.kind.localeCompare(b.kind, 'en', { numeric: true }));
};

/** A card group's family: the number of a set ("s5") or the suit of a run ("r2"). */
const familyOf = (cards: readonly Card[]) => (cards.every((c) => c.rank === cards[0]!.rank) ? `s${cards[0]!.rank}` : `r${cards[0]!.suit}`);

/**
 * The move buttons above the hand: Blooms only (sprouting needs no button: tapping a card
 * picks Sprout). One button per family and size ("Bloom 4 tiles", "Bloom 3 tiles, keep the
 * other"): a set keeps the card that best fits the rest of the hand; a run blooms its highest
 * numbers (a picked card narrows it to the groups holding that card).
 */
export const moveButtons = (v: View, legal: readonly Action[], sel: Sel, showEveryRecipe = false) => {
  const byId = new Map(v.hand.map((c) => [c.id, c]));
  const kinds = kindsAvailable(v, legal, sel).filter((k) => k.kind.startsWith('bloom-'));
  if (showEveryRecipe) return kinds.map(k=>({...k,kinds:[k.kind]}));
  const fam = new Map<string, { kind: string; label: string; count: number; score: number; kinds: string[] }>();
  for (const k of kinds) {
    const cards = kindCards(k.kind).map((id) => byId.get(id)!).filter(Boolean);
    if (cards.length !== kindCards(k.kind).length) continue;
    if (k.kind.startsWith('bloom-mega-')) {
      fam.set('mega', { kind:k.kind,label:'Mega Bomb',count:k.count,score:Infinity,kinds:[k.kind] });
      continue;
    }
    const family = familyOf(cards);
    // how many cards of that family the hand holds (a longer run, a four of a kind)
    const holding = v.hand.filter((c) => (family.startsWith('s') ? c.rank === cards[0]!.rank : c.suit === cards[0]!.suit && c.suit !== null));
    const set = family.startsWith('s');
    const kept = set ? holding.length - cards.length : 0;
    // a set: keep the card that fits the rest of the hand best; a run: the highest numbers
    const keptCards = holding.filter((c) => !cards.some((x) => x.id === c.id));
    const fit = keptCards.reduce((n, c) => n + v.hand.filter((h) => h.suit === c.suit && h.id !== c.id && Math.abs(h.rank - c.rank) <= 2).length, 0);
    const score = set ? fit : Math.max(...cards.map((c) => c.rank));
    const label = kept > 0 ? BLOOM.buttonKeep(cards.length, kept) : runLeft(holding, cards) > 0 ? BLOOM.buttonKeep(cards.length, runLeft(holding, cards)) : BLOOM.button(cards.length);
    const key = `${family}-${cards.length}`;
    const old = fam.get(key);
    const kinds = [...(old?.kinds ?? []), k.kind];
    if (!old || score > old.score) fam.set(key, { kind: k.kind, label, count: k.count, score, kinds });
    else old.kinds = kinds;
  }
  return [...fam.values()]
    .sort((a, b) => kindCards(b.kind).length - kindCards(a.kind).length || a.kind.localeCompare(b.kind, 'en', { numeric: true }))
    .map(({ kind, label, count, kinds }) => ({ kind, label, count, kinds }));
};

/** Cards of a run's suit that stay in hand after blooming `cards` (only the ones joined to it count). */
const runLeft = (holding: readonly Card[], cards: readonly Card[]): number => {
  const lo = Math.min(...cards.map((c) => c.rank));
  const hi = Math.max(...cards.map((c) => c.rank));
  const ranks = new Set(holding.map((c) => c.rank));
  let n = 0;
  for (let r = lo - 1; ranks.has(r); r--) n++;
  for (let r = hi + 1; ranks.has(r); r++) n++;
  return cards.every((c) => c.rank === cards[0]!.rank) ? 0 : n;
};

/**
 * What the Grow step offers. While a sprout is possible the player sprouts first: the bar
 * says "Pick a card to sprout", there is no Throw button, only a small "Skip sprout" link
 * (sprouting stays optional in the rules). After the sprout, "Throw a card" means "done".
 */
export const growControls = (legal: readonly Action[]) => {
  const canSprout = legal.some((a) => a.t === 'Sprout');
  return { sproutNote: canSprout, throwButton: !canSprout, skipLink: canSprout };
};

/** A quick "how good is it" score, so the best option is offered first. */
const quickScore = (v: View, a: Action): number => {
  const sim = simulate(v, a);
  if (!sim) return 0;
  return (sim.wins ? 1000 : 0) + sim.points + 0.5 * sim.botCut - 0.5 * sim.myLoss;
};

/** `moves` ordered best first by the same quick score as the options list (stable). */
export const bestFirst = (v: View, moves: readonly Action[]): Action[] =>
  moves.map((a, i) => ({ a, i, s: quickScore(v, a) })).sort((x, y) => y.s - x.s || x.i - y.i).map((x) => x.a);

/** Every move that fits what is picked, best first (only once a hex is picked). */
export const options = (v: View, legal: readonly Action[], sel: Sel): Action[] => {
  if (sel.hex === null) return [];
  const list = matching(v, legal, sel).map((a, i) => ({ a, i, s: quickScore(v, a) }));
  // v0.7: a Bloom kind offers only its best Bloom on this hex (there can be hundreds)
  const seen = new Set<string>();
  return list
    .sort((x, y) => y.s - x.s || x.i - y.i)
    .filter((x) => {
      if (x.a.t !== 'Bloom') return true;
      const k = kindOf(x.a)!;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .map((x) => x.a);
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

/**
 * The move to play straight away, or null. A picked spot that allows exactly one move
 * plays at once (no Confirm: Undo can take it back). With several different moves on
 * that spot, the preview stays (another card, or a line or clump button, picks another move).
 */
export const playNow = (v: View, legal: readonly Action[], sel: Sel): Action | null => {
  // Only a picked card plus a spot plays at once. A spot tapped on its own just previews
  // (so a stray or double tap on the board can never play a move by itself).
  if (sel.hex === null || sel.card === null) return null;
  const opts = options(v, legal, sel);
  // A Strengthen always shows its preview ("Strengthen 5 → 9") and waits for Confirm.
  return opts.length === 1 && sproutKind(v, opts[0]!) !== 'strengthen' ? opts[0]! : null;
};

/** The one move on the picked card and spot (a Strengthen included), or null (overhaul item 8: "Confirm moves: Never"). */
export const onlyChoice = (v: View, legal: readonly Action[], sel: Sel): Action | null => {
  if (sel.hex === null || sel.card === null) return null;
  const opts = options(v, legal, sel);
  return opts.length === 1 ? opts[0]! : null;
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

/**
 * Tapping a card. In the Grow step a card picks Sprout by default (only its sprout spots
 * glow), unless a line or clump was chosen first or a hex was tapped first. Tapping the
 * same card again clears it.
 */
export const tapCard = (v: View, legal: readonly Action[], sel: Sel, id: number): Sel => {
  if (sel.card === id) return { ...sel, card: null, kind: sel.kind === 'sprout' ? null : sel.kind, option: 0 };
  const next: Sel = { ...sel, card: id, option: 0 };
  if (next.kind !== null && matching(v, legal, { ...next, hex: null }).length === 0) next.kind = null;
  if (next.hex !== null && matching(v, legal, next).length === 0) next.hex = null;
  if (next.kind === null && next.hex === null && matching(v, legal, { ...next, kind: 'sprout' }).length > 0) next.kind = 'sprout';
  return next;
};

export const tapHex = (v: View, legal: readonly Action[], sel: Sel, key: string): Sel => {
  if (sel.hex === key) return { ...sel, hex: null, option: 0 };
  if ((sel.card !== null || sel.kind !== null) && targetHexes(v, legal, sel).has(key)) return { ...sel, hex: key, option: 0 };
  return { card: null, kind: null, hex: key, option: 0 };
};

export const tapKind = (sel: Sel, kind: string): Sel => (sel.kind === kind ? { ...sel, kind: null, option: 0 } : { ...sel, kind, option: 0 });
