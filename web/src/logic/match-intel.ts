import { createCards, dealOpening } from '../../../src/engine/index.js';
import type { Card, Event, State, View } from '../../../src/engine/index.js';

/** One public beat the player may step through in the glass. Newest last. */
export type IntelMove = {
  who: 'you' | 'opp';
  /** Short TE-style verb label, e.g. THREW, GREW, BLOOM. */
  verb: string;
  /** Optional mono detail (card, hex count…). */
  detail: string | null;
};

export type MatchIntel = {
  discarded: Card[];
  score: [number, number];
  territory: [number, number];
  blooms: [number, number];
  bombs: [number, number];
  cuts: [number, number];
  turn: number;
  observation: string | null;
  /** Chronological public moves (oldest → newest). */
  moves: IntelMove[];
  deckCount: number;
  oppHand: number;
  fruitUnseen: number;
};

/** History is public information: the opening face and cards thrown face up.
 * Draws from the pile do not erase what the player already saw there. */
export const publicDiscardHistory = (view: View, history: readonly Event[], opening: readonly Card[]): Card[] => {
  const byId = new Map(createCards(view.config).map((card) => [card.id, card]));
  const ids = [...opening.map((card) => card.id), ...history.flatMap((event) => (event.t === 'Discard' ? [event.card] : []))];
  return ids.map((id) => byId.get(id)).filter((card): card is Card => !!card);
};

export const openingPublicDiscard = (state: State, base: State | null): Card[] =>
  base ? [...base.discard] : dealOpening(state.seed, state.config).discard;

const cardLabel = (card: Card | undefined): string => {
  if (!card) return '';
  if (card.suit === null) return 'BOMB';
  return `${card.rank}`;
};

/** Public-safe history beats (no hidden deck draws). */
export const publicIntelMoves = (view: View, history: readonly Event[], me = 0): IntelMove[] => {
  const byId = new Map(createCards(view.config).map((card) => [card.id, card]));
  const out: IntelMove[] = [];
  for (const event of history) {
    const who: 'you' | 'opp' = event.t === 'RotPick' ? (event.picker === me ? 'you' : 'opp')
      : 'player' in event ? (event.player === me ? 'you' : 'opp')
      : 'you';
    switch (event.t) {
      case 'Draw':
        if (event.from === 'discard' && event.card !== undefined) {
          out.push({ who, verb: 'TOOK', detail: cardLabel(byId.get(event.card)) || 'PILE' });
        } else if (event.from === 'deck' && event.player === me && event.card !== undefined) {
          out.push({ who, verb: 'DREW', detail: cardLabel(byId.get(event.card)) });
        } else if (event.from === 'deck' && event.player !== me) {
          out.push({ who, verb: 'DREW', detail: null });
        }
        break;
      case 'Sprout':
        out.push({ who, verb: 'GREW', detail: cardLabel(byId.get(event.card)) });
        break;
      case 'Strengthen':
        out.push({ who, verb: 'UP', detail: `${event.oldStrength}→${event.newStrength}` });
        break;
      case 'Bloom':
        out.push({ who, verb: 'BLOOM', detail: String(event.cards.length) });
        break;
      case 'FruitCard':
        out.push({ who, verb: 'BOMB', detail: cardLabel(byId.get(event.card)) || null });
        break;
      case 'MegaBomb':
        out.push({ who, verb: 'BLAST', detail: String(event.destroyed.length) });
        break;
      case 'Discard':
        out.push({ who, verb: 'THREW', detail: cardLabel(byId.get(event.card)) });
        break;
      case 'Sever':
        out.push({ who, verb: 'CUT', detail: String(event.coords.length) });
        break;
      case 'Strangle':
        out.push({ who, verb: 'WIN', detail: 'HOME' });
        break;
      default:
        break;
    }
  }
  return out;
};

export const matchIntel = (view: View, history: readonly Event[], opening: readonly Card[]): MatchIntel => {
  const territory: [number, number] = [0, 0];
  for (const tile of Object.values(view.board)) if (tile) territory[tile.owner]++;
  const blooms: [number, number] = [0, 0], bombs: [number, number] = [0, 0], cuts: [number, number] = [0, 0];
  for (const event of history) {
    if (event.t === 'Bloom') blooms[event.player]++;
    else if (event.t === 'FruitCard') bombs[event.player]++;
    else if (event.t === 'MegaBomb') bombs[event.player] += 2;
    else if (event.t === 'Sever') cuts[1 - event.player as 0 | 1] += event.coords.length;
  }
  const discarded = publicDiscardHistory(view, history, opening);
  const bombsInHand = view.hand.filter((card) => card.suit === null).length;
  const observation = bombsInHand >= 2 ? 'TWO BOMBS CAN BLOOM.'
    : view.phase === 'ACT' && view.sproutsThisTurn === 0 ? 'GROW CAN BE SKIPPED.'
    : view.discard.length ? 'WATCH THE DISCARD.' : null;
  return {
    discarded,
    score: [view.score, view.opponentScore],
    territory,
    blooms,
    cuts,
    bombs,
    turn: Math.ceil(view.turnNumber / 2),
    observation,
    moves: publicIntelMoves(view, history),
    deckCount: view.deckCount,
    oppHand: view.opponentHandCount,
    fruitUnseen: view.fruitUnseen,
  };
};
