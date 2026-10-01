import { MAX_RANK, MIN_RANK, SUITS } from './constants.js';
import type { Card } from './types.js';

// Deadwood (spec 9.1): the minimum rank-sum left after splitting the hand into valid
// melds (runs of 3+, sets of 3-4), each card in at most one meld. Exhaustive search.
// Identical copies are interchangeable, so the search works on (suit, rank) counts.

type Cell = [suit: number, rank: number];
type Found = { dw: number; melds: Cell[][] };

const RANKS = MAX_RANK - MIN_RANK + 1;
const idx = (suit: number, rank: number) => suit * RANKS + (rank - MIN_RANK);

const search = (counts: number[], memo: Map<string, Found>): Found => {
  const key = counts.join('');
  const cached = memo.get(key);
  if (cached) return cached;

  // Lowest remaining card in suit order: nothing below it in its suit remains,
  // so any run containing it must start at it.
  const first = counts.findIndex((n) => n > 0);
  if (first === -1) return { dw: 0, melds: [] };
  const suit = Math.floor(first / RANKS);
  const rank = (first % RANKS) + MIN_RANK;

  const take = (cells: Cell[]): Found => {
    const next = [...counts];
    for (const [s, r] of cells) next[idx(s, r)]!--;
    return search(next, memo);
  };

  // Option 1: the card is deadwood.
  const dead = take([[suit, rank]]);
  let best: Found = { dw: dead.dw + rank, melds: dead.melds };
  const consider = (meld: Cell[]) => {
    const rest = take(meld);
    if (rest.dw < best.dw) best = { dw: rest.dw, melds: [meld, ...rest.melds] };
  };

  // Option 2: runs starting at this card.
  const run: Cell[] = [[suit, rank]];
  for (let r = rank + 1; r <= MAX_RANK && counts[idx(suit, r)]! > 0; r++) {
    run.push([suit, r]);
    if (run.length >= 3) consider([...run]);
  }

  // Option 3: sets with 2 or 3 cards of the same rank in other suits.
  const others = SUITS.filter((s) => s !== suit && counts[idx(s, rank)]! > 0);
  for (let mask = 1; mask < 1 << others.length; mask++) {
    const chosen = others.filter((_, i) => (mask >> i) & 1);
    if (chosen.length === 2 || chosen.length === 3) {
      consider([[suit, rank], ...chosen.map((s): Cell => [s, rank])]);
    }
  }

  memo.set(key, best);
  return best;
};

export type MeldPartition = { deadwood: number; melds: Card[][]; leftover: Card[] };

/** Optimal partition (diagnostic). Copies are assigned lowest id first. */
export const bestMeldPartition = (hand: readonly Card[]): MeldPartition => {
  const counts = new Array<number>(SUITS.length * RANKS).fill(0);
  for (const c of hand) counts[idx(c.suit, c.rank)]!++;
  const found = search(counts, new Map());

  const pool = [...hand].sort((a, b) => a.id - b.id);
  const pick = ([s, r]: Cell): Card => {
    const i = pool.findIndex((c) => c.suit === s && c.rank === r);
    return pool.splice(i, 1)[0]!;
  };
  const melds = found.melds.map((m) => m.map(pick));
  return { deadwood: found.dw, melds, leftover: pool };
};

export const deadwood = (hand: readonly Card[]): number => bestMeldPartition(hand).deadwood;
