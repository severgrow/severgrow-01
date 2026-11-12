// THE TURN GUIDE — the pure half (owner, 2026-11-11). "?" in the context key lights the rest of the
// player's turn, one step at a time, with the lesson glow and NO words: this says what to light for
// the position on screen. The page (player/turn-guide.ts) turns it into lit elements.
import { coordKey } from '../../../src/engine/index.js';
import type { Action, View } from '../../../src/engine/index.js';

export type TurnGuideStep = {
  /** Draw: the piles a card may be drawn from. */
  piles: ('deck' | 'discard')[];
  /** Grow: the cards that can be played now; Throw: the cards that may be thrown. */
  cards: number[];
  /** A card picked: the tiles it may go to. */
  hexes: string[];
  /** A Bloom is possible now: light the Bloom key too. */
  bloom: boolean;
  /** Nothing to play: the step is Skip. */
  skip: boolean;
};

const EMPTY: TurnGuideStep = { piles: [], cards: [], hexes: [], bloom: false, skip: false };
const uniq = <T,>(xs: T[]): T[] => [...new Set(xs)];

/** What to light now, or null when it is not this player's move (or there are no moves yet). */
export const turnGuideStep = (view: View, legal: readonly Action[], selectedCard: number | null): TurnGuideStep | null => {
  if (view.phase === 'GAME_OVER' || view.actor !== view.player || legal.length === 0) return null;
  if (view.phase === 'DRAW') {
    const piles = uniq(legal.flatMap((a) => (a.t === 'Draw' ? [a.from === 'discard' ? 'discard' as const : 'deck' as const] : [])));
    return { ...EMPTY, piles: piles.sort() };
  }
  if (view.phase === 'DISCARD') {
    return { ...EMPTY, cards: uniq(legal.flatMap((a) => (a.t === 'Discard' ? [a.card] : []))) };
  }
  // ACT
  if (selectedCard !== null) {
    const hexes = uniq(legal.flatMap((a) => (a.t === 'Sprout' && a.card === selectedCard ? [coordKey(a.coord)]
      : a.t === 'PlayFruit' && a.card === selectedCard ? [coordKey(a.target)]
        : a.t === 'MegaBomb' && a.cards.includes(selectedCard) ? [coordKey(a.target)] : [])));
    if (hexes.length) return { ...EMPTY, hexes };
  }
  const cards = uniq(legal.flatMap((a) => (a.t === 'Sprout' || a.t === 'PlayFruit' ? [a.card] : a.t === 'MegaBomb' ? a.cards : [])));
  const bloom = legal.some((a) => a.t === 'Bloom');
  if (cards.length || bloom) return { ...EMPTY, cards, bloom };
  return { ...EMPTY, skip: legal.some((a) => a.t === 'EndAct') };
};
