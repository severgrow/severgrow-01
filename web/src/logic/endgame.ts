// So the end of a game is never a surprise: short warnings near the end, and how the
// final score was made.
import type { BoardCtx, Player, View } from '../../../src/engine/index.js';

/**
 * Step 3 item 9: how many of my turns are left (this one included), from public information:
 * whichever clock ends the game first, the turn limit or the deck (each round takes at least
 * one card from the deck per player, so the deck lasts at most half its cards in my turns).
 */
export const turnsLeft = (v: Pick<View, 'config' | 'turnNumber' | 'deckCount'>): number => {
  const max = v.config.maxTurnsPerPlayer;
  const byLimit = max > 0 ? max - Math.ceil(v.turnNumber / 2) + 1 : Infinity;
  // the Lab: with reshuffle on the deck never runs out, so the turn limit is the only clock
  const byDeck = v.config.reshuffleDiscard ? Infinity : Math.max(1, Math.ceil(v.deckCount / 2));
  const left = Math.max(1, Math.min(byLimit, byDeck));
  return Number.isFinite(left) ? left : 99;
};

/** Overhaul item 15: how near the end is (at most this many of my turns are left, by the turn limit). */
export const FINAL_TURNS = 3;
/** ... or the deck has this many cards or fewer (the deck's end can't be counted in turns: it depends on the cards played). */
export const FINAL_DECK = 6;

export type FinalTurns = { final: boolean; turnsLeft: number | null; reason: 'limit' | 'deck' | null; banner: string | null };

/** The calm final-turns state: when it starts, and its short banner. */
export const finalTurns = (v: Pick<View, 'config' | 'turnNumber' | 'deckCount'>): FinalTurns => {
  const max = v.config.maxTurnsPerPlayer;
  const left = max > 0 ? max - Math.ceil(v.turnNumber / 2) + 1 : null; // this turn included
  if (left !== null && left <= FINAL_TURNS) return { final: true, turnsLeft: left, reason: 'limit', banner: left <= 1 ? 'Last turn' : `Last ${left} turns` };
  if (!v.config.reshuffleDiscard && v.deckCount <= FINAL_DECK) return { final: true, turnsLeft: null, reason: 'deck', banner: v.deckCount === 0 ? 'Deck empty: last turn' : 'The deck is running low' };
  return { final: false, turnsLeft: left, reason: null, banner: null };
};

/** A player's tiles and how many of them sit on gold (each gold tile scores 2). */
export const scoreBreakdown = (ctx: BoardCtx, p: Player): { tiles: number; gold: number } => {
  let tiles = 0;
  let gold = 0;
  for (const [key, t] of Object.entries(ctx.board)) {
    if (!t || t.owner !== p || t.root) continue;
    tiles++;
    if (ctx.terrain[key] === 'rich') gold++;
  }
  return { tiles, gold };
};
