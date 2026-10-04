// Positions for the Fruit card browser tests (web/e2e/fruitcards.ts).
import { isFruitCard, newGame } from '../../src/engine/index.js';
import type { Card, Player, State } from '../../src/engine/index.js';
import { fixture } from '../../tests/helpers.js';

/** My Grow step with a hand-built board; `fruit` Fruit cards plus the given numbered cards (real cards, each once). */
export const fruitPosition = (tiles: Record<string, [Player, number]>, numbers: [0 | 1 | 2 | 3, number][], fruit: number): State => {
  const g = newGame(5);
  const f = fixture({ tiles });
  const pool = [...g.hands[0], ...g.hands[1], ...g.deck, ...g.discard];
  const take = (pred: (c: Card) => boolean) => pool.splice(pool.findIndex(pred), 1)[0]!;
  const hand: Card[] = [];
  for (let i = 0; i < fruit; i++) hand.push(take(isFruitCard));
  for (const [su, r] of numbers) hand.push(take((c) => c.suit === su && c.rank === r));
  const other = pool.filter((c) => !isFruitCard(c)).slice(0, 7);
  const rest = pool.filter((c) => !other.includes(c));
  return { ...g, board: f.board, terrain: f.terrain, hands: [hand, other], deck: rest.slice(1), discard: [rest[0]!], phase: 'ACT', turnPlayer: 0, actor: 0 };
};
// mine: root (-2,2) - (-1,1) - (0,0); theirs: root (2,-2) - (1,-1)=9 - (1,0)=9 - (2,0)=5 - (3,-1)=4 hanging on (1,0)
export const NINE_CHAIN: Record<string, [Player, number]> = { '-1,1': [0, 3], '0,0': [0, 3], '1,-1': [1, 9], '1,0': [1, 9], '2,0': [1, 5], '3,-1': [1, 4] };

// the same, but their 9s are also joined to their root through (2,-1): removing one 9 leaves the other
export const NINE_PAIR: Record<string, [Player, number]> = { ...NINE_CHAIN, '2,-1': [1, 6] };
