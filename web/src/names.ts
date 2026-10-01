// Human-friendly names for hexes, cards and moves.
import { DIRECTIONS, SUIT_NAMES, coordKey } from '../../src/engine/index.js';
import type { Action, Card, Coord, View } from '../../src/engine/index.js';

/** Hex names like "C2": row letter (top to bottom), then position in the row. */
export const hexName = (c: Coord, radius: number): string => {
  const row = 'ABCDEFGHIJKLM'[c.r + radius] ?? '?';
  const firstQ = Math.max(-radius, -c.r - radius);
  return `${row}${c.q - firstQ + 1}`;
};

export const SUIT_ICONS = ['🌿', '🪨', '💧', '🔥'] as const;
export const cardName = (c: Card): string => `${SUIT_NAMES[c.suit]} ${c.rank}`;

/** Arrows match the screen layout used by the board (pointy-top hexes). */
export const DIR_ARROWS = ['→', '↗', '↖', '←', '↙', '↘'] as const;

const cardsOf = (v: View, ids: number[]): Card[] =>
  ids.map((id) => v.hand.find((c) => c.id === id)).filter((c): c is Card => c !== undefined);

/** One short line per legal move. */
export const moveLabel = (v: View, a: Action): string => {
  const R = v.config.boardRadius;
  const hn = (c: Coord) => hexName(c, R);
  switch (a.t) {
    case 'Draw':
      if (a.from === 'deck') return `Draw from the deck (${v.deckCount} left)`;
      return `Take ${cardName(v.discard.at(-1)!)} from the discard pile`;
    case 'MeldRun': {
      const cs = cardsOf(v, a.cards).sort((x, y) => x.rank - y.rank);
      return `Hypha ${SUIT_NAMES[cs[0]!.suit]} ${cs.map((c) => c.rank).join('-')} from ${hn(a.start)} ${DIR_ARROWS[a.dir]}`;
    }
    case 'MeldSet': {
      const cs = cardsOf(v, a.cards);
      return `Bloom of ${cs[0]!.rank}s on ${a.hexes.map(hn).join(' ')}`;
    }
    case 'Fruit':
      return `Fruit: give up ${a.sacrifice.map(hn).join(' ')}, destroy ${hn(a.target)}`;
    case 'EndAct':
      return 'Done playing cards';
    case 'Discard': {
      const c = v.hand.find((x) => x.id === a.card)!;
      return `Discard ${cardName(c)}`;
    }
    case 'Knock':
      return `Knock (your leftover cards total ${v.myDeadwood})`;
    case 'Continue':
      return 'Continue (end turn and refill)';
    case 'RotPick':
      return `Rot the bot's tile at ${hn(a.coord)}`;
  }
};

/** Hexes a move touches, for highlighting and for the hex filter. */
export const moveHexes = (a: Action): Coord[] => {
  switch (a.t) {
    case 'MeldRun':
      return Array.from({ length: a.cards.length }, (_, i) => ({
        q: a.start.q + DIRECTIONS[a.dir]!.q * i,
        r: a.start.r + DIRECTIONS[a.dir]!.r * i,
      }));
    case 'MeldSet':
      return a.hexes;
    case 'Fruit':
      return [...a.sacrifice, a.target];
    case 'RotPick':
      return [a.coord];
    default:
      return [];
  }
};

/** Card ids a move uses. */
export const moveCards = (a: Action): number[] => {
  if (a.t === 'MeldRun' || a.t === 'MeldSet') return a.cards;
  if (a.t === 'Discard') return [a.card];
  return [];
};

export const touchesHex = (a: Action, key: string): boolean => moveHexes(a).some((c) => coordKey(c) === key);
