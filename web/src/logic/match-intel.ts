import { createCards, dealOpening } from '../../../src/engine/index.js';
import type { Card, Event, State, View } from '../../../src/engine/index.js';
import { INTEL } from '../../../src/strings.js';
import { homeSides } from './home.js';

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
  /** How many cards the player is holding (the opponent's count is public too). */
  handCount: number;
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
    // `who` is the seat the event names. Most events name the actor (the drawer, grower, thrower,
    // bomder). Sever and Strangle are the exception: the engine names the seat whose tiles were
    // cut, or whose home was surrounded — the victim/loser. `opposite` is the attacker/winner.
    const who: 'you' | 'opp' = event.t === 'RotPick' ? (event.picker === me ? 'you' : 'opp')
      : 'player' in event ? (event.player === me ? 'you' : 'opp')
      : 'you';
    const opposite: 'you' | 'opp' = who === 'you' ? 'opp' : 'you';
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
        // The event names the cut player; the beat belongs to whoever did the cutting.
        out.push({ who: opposite, verb: 'CUT', detail: String(event.coords.length) });
        break;
      case 'Strangle':
        // The event names the loser. Both homes surrounded is a draw: nobody won, so no WIN beat.
        if (view.result?.reason !== 'double_strangle') out.push({ who: opposite, verb: 'WIN', detail: 'HOME' });
        break;
      default:
        break;
    }
  }
  return out;
};

/** The single strategic read of the position (Now's line under the score; Tips leads with its own
 *  most urgent read). Public information only: homes, land and the Draw pile. Home danger outranks
 *  everything — a match can end on the next Grow. */
export const matchObservation = (view: View): string => {
  const me = view.player;
  const mine = homeSides(view, me);
  const theirs = homeSides(view, me === 0 ? 1 : 0);
  const myLeft = mine.openSides - mine.taken;
  const theirLeft = theirs.openSides - theirs.taken;
  if (mine.taken > 0 && myLeft > 0 && myLeft <= 2) return INTEL.observation.home(myLeft, mine.taken);
  if (theirs.taken > 0 && theirLeft > 0 && theirLeft <= 2) return INTEL.observation.theirHome(theirLeft);
  if (view.deckCount > 0 && view.deckCount <= 4) return INTEL.observation.deck(view.deckCount);
  const tiles = (owner: 0 | 1): number => Object.values(view.board).filter((t) => t?.owner === owner).length;
  const mineTiles = tiles(me);
  const theirTiles = tiles(me === 0 ? 1 : 0);
  if (mineTiles > theirTiles) return INTEL.observation.lead(mineTiles - theirTiles, view.deckCount);
  if (mineTiles < theirTiles) return INTEL.observation.behind(theirTiles - mineTiles, view.deckCount);
  if (view.discard.length > 0) return INTEL.observation.level(mineTiles);
  return INTEL.observation.open(view.deckCount);
};

export const matchIntel = (view: View, history: readonly Event[], opening: readonly Card[]): MatchIntel => {
  const territory: [number, number] = [0, 0];
  for (const tile of Object.values(view.board)) if (tile) territory[tile.owner]++;
  const blooms: [number, number] = [0, 0], bombs: [number, number] = [0, 0], cuts: [number, number] = [0, 0];
  for (const event of history) {
    if (event.t === 'Bloom') blooms[event.player]++;
    else if (event.t === 'FruitCard') bombs[event.player]++;
    else if (event.t === 'MegaBomb') bombs[event.player] += 2;
    else if (event.t === 'Sever') cuts[1 - event.player as 0 | 1] += event.coords.length; // the event names the victim; the cut is credited to the other seat
  }
  const discarded = publicDiscardHistory(view, history, opening);
  return {
    discarded,
    score: [view.score, view.opponentScore],
    territory,
    blooms,
    cuts,
    bombs,
    turn: Math.ceil(view.turnNumber / 2),
    observation: matchObservation(view),
    moves: publicIntelMoves(view, history),
    deckCount: view.deckCount,
    oppHand: view.opponentHandCount,
    handCount: view.hand.length,
    fruitUnseen: view.fruitUnseen,
  };
};
