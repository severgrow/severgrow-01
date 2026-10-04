import { allNeighbors, coordKey, isOnBoard, normalizeCoord } from './board.js';
import { isFruitCard } from './cards.js';
import { IllegalActionError } from './errors.js';
import type { IllegalActionCode } from './errors.js';
import type { BoardCtx } from './overgrow.js';
import { assertCoord } from './placement.js';
import type { Card, Coord, Player } from './types.js';

// v0.6 Fruit cards. A Fruit card has no suit and no number. In the Grow step it removes one
// opponent non-root tile that touches one of my tiles (my root counts when
// fruitRootCountsAsTouch is on), whatever its strength. The card then leaves the game.
// The cut check (both players) and the Strangle check follow, as after any board change.

export type FruitCardPlan = { card: Card; target: Coord; strength: number };

const fail = (code: IllegalActionCode, msg: string): never => {
  throw new IllegalActionError(code, msg);
};

/** Does one of my tiles touch `target`? My root counts when fruitRootCountsAsTouch is on. */
export const fruitTouches = (ctx: BoardCtx, player: Player, target: Coord): boolean =>
  allNeighbors(target).some((n) => {
    const t = ctx.board[coordKey(n)];
    return !!t && t.owner === player && (!t.root || ctx.config.fruitRootCountsAsTouch);
  });

/** Why a Fruit card cannot be played on `target`, or null when it can (the card aside). */
export const fruitTargetBlocker = (ctx: BoardCtx, player: Player, target: Coord): IllegalActionCode | null => {
  if (!isOnBoard(target, ctx.config.boardRadius)) return 'OFF_BOARD';
  const tile = ctx.board[coordKey(target)];
  if (!tile || tile.owner === player) return 'FRUIT_TARGET_NOT_ENEMY';
  if (tile.root) return 'FRUIT_TARGET_ROOT';
  if (!fruitTouches(ctx, player, target)) return 'FRUIT_TARGET_NOT_TOUCHED';
  return null;
};

/** Validates PlayFruit: a Fruit card in my hand and a legal target. Changes nothing. */
export const planFruitCard = (ctx: BoardCtx, player: Player, hand: readonly Card[], cardId: unknown, target: unknown): FruitCardPlan => {
  const card = hand.find((c) => c.id === cardId) ?? fail('CARD_NOT_IN_HAND', `card ${String(cardId)} is not in hand`);
  if (!isFruitCard(card)) fail('NOT_A_FRUIT_CARD', `card ${card.id} is not a Fruit card`);
  const t = normalizeCoord(assertCoord(target));
  const code = fruitTargetBlocker(ctx, player, t);
  if (code) fail(code, `a Fruit card cannot be played on ${coordKey(t)}`);
  return { card, target: t, strength: ctx.board[coordKey(t)]!.strength };
};
