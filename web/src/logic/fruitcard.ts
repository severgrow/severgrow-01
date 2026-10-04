// Step 4 (Fruit cards task): what the page shows for Fruit cards. Pure functions of the
// player's View and legal moves. Playing one uses the same card-then-target taps as a Sprout.
import { coordKey } from '../../../src/engine/index.js';
import type { Action, View } from '../../../src/engine/index.js';
import { FRUIT } from '../../../src/strings.js';
import { targetHexes } from './interaction.js';
import type { Sel } from './interaction.js';

type PlayFruit = Extract<Action, { t: 'PlayFruit' }>;
const fruitMoves = (legal: readonly Action[]): PlayFruit[] => legal.filter((a): a is PlayFruit => a.t === 'PlayFruit');

/**
 * A Fruit card in my hand: `ready` (it glows) when it has a legal target now; otherwise a
 * one-line reason, except in the Throw step (there it is a card like any other).
 */
export const fruitCardState = (v: View, legal: readonly Action[], cardId: number): { ready: boolean; reason: string | null } => {
  const card = v.hand.find((c) => c.id === cardId);
  if (!card || card.suit !== null) return { ready: false, reason: null };
  if (fruitMoves(legal).length > 0) return { ready: true, reason: null };
  if (v.phase === 'DISCARD' && v.actor === v.player) return { ready: false, reason: null };
  if (v.phase !== 'ACT' || v.actor !== v.player) return { ready: false, reason: FRUIT.notNow };
  // v0.8: a Fruit card uses the turn's sprout; once that is used, it waits for the next turn
  if (v.config.fruitUsesSprout && v.sproutsThisTurn >= v.config.sproutsPerTurn) return { ready: false, reason: FRUIT.used };
  return { ready: false, reason: FRUIT.noTarget };
};

/** The tile card's shortcut on hex `key`: "Use Fruit card" (a note on a top-rank tile), or null. */
export const fruitOffer = (v: View, legal: readonly Action[], key: string): { label: string; note: string | null; action: PlayFruit } | null => {
  const action = fruitMoves(legal).find((a) => coordKey(a.target) === key);
  if (!action) return null;
  const top = (v.board[key]?.strength ?? 0) >= v.config.maxRank;
  return { label: FRUIT.use, note: top ? FRUIT.topRank : null, action };
};

/**
 * What a tap on hex `key` means in my Grow step: `tilecard` opens the tile card (an opponent
 * tile the picked card cannot reach, or any opponent tile with nothing picked: its card offers
 * "Use Fruit card"); `pick` goes on with the normal card-then-hex taps.
 */
export const hexTapIntent = (v: View, legal: readonly Action[], sel: Sel, key: string): 'tilecard' | 'pick' => {
  const t = v.board[key];
  if (!t || t.owner === v.player) return 'pick';
  if (sel.card === null && sel.kind === null) return 'tilecard';
  return targetHexes(v, legal, sel).has(key) ? 'pick' : 'tilecard';
};
