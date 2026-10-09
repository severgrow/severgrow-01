import { createCards, dealOpening } from '../../../src/engine/index.js';
import type { Card, Event, State, View } from '../../../src/engine/index.js';

export type MatchIntel = {
  discarded: Card[];
  score: [number,number];
  territory: [number,number];
  blooms: [number,number];
  bombs: [number,number];
  cuts: [number,number];
  turn: number;
  observation: string | null;
};

/** History is public information: the opening face and cards thrown face up.
 * Draws from the pile do not erase what the player already saw there. */
export const publicDiscardHistory = (view: View, history: readonly Event[], opening: readonly Card[]): Card[] => {
  const byId = new Map(createCards(view.config).map(card=>[card.id,card]));
  const ids = [...opening.map(card=>card.id),...history.flatMap(event=>event.t==='Discard' ? [event.card] : [])];
  return ids.map(id=>byId.get(id)).filter((card):card is Card=>!!card);
};

export const openingPublicDiscard = (state: State, base: State | null): Card[] =>
  base ? [...base.discard] : dealOpening(state.seed,state.config).discard;

export const matchIntel = (view: View, history: readonly Event[], opening: readonly Card[]): MatchIntel => {
  const territory: [number,number] = [0,0];
  for (const tile of Object.values(view.board)) if (tile) territory[tile.owner]++;
  const blooms: [number,number] = [0,0], bombs: [number,number] = [0,0], cuts: [number,number] = [0,0];
  for (const event of history) {
    if (event.t==='Bloom') blooms[event.player]++;
    else if (event.t==='FruitCard') bombs[event.player]++;
    else if (event.t==='MegaBomb') bombs[event.player]+=2;
    else if (event.t==='Sever') cuts[1-event.player as 0|1]+=event.coords.length;
  }
  const discarded = publicDiscardHistory(view,history,opening);
  const bombsInHand = view.hand.filter(card=>card.suit===null).length;
  const observation = bombsInHand>=2 ? 'TWO BOMBS CAN BLOOM.'
    : view.phase==='ACT' && view.sproutsThisTurn===0 ? 'GROW CAN BE SKIPPED.'
    : view.discard.length ? 'WATCH THE DISCARD.' : null;
  return {discarded,score:[view.score,view.opponentScore],territory,
    blooms,cuts,bombs,turn:Math.ceil(view.turnNumber/2),observation};
};
