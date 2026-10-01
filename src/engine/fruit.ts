import { coordKey, isAdjacent, isConnected } from './board.js';
import { IllegalActionError } from './errors.js';
import type { IllegalActionCode } from './errors.js';
import type { BoardCtx } from './overgrow.js';
import { assertCoord } from './placement.js';
import { removeTiles } from './rot.js';
import type { Coord, Player, Tile } from './types.js';

export type FruitPlan = { sacrifice: Coord[]; target: Coord };

/** Spec 10: species powers are pluggable; exactly one ships. */
export interface SpeciesPower {
  id: string;
  /** Why this Fruit is illegal, or null when legal. */
  canFruit(ctx: BoardCtx, player: Player, used: number, sacrifice: readonly Coord[], target: Coord): IllegalActionCode | null;
  /** Board after the Fruit's removals (before Sever). */
  resolveFruit(board: Record<string, Tile | null>, plan: FruitPlan): Record<string, Tile | null>;
}

const fail = (code: IllegalActionCode, msg: string): never => {
  throw new IllegalActionError(code, msg);
};

/**
 * Validates a Fruit (spec 10): uses left; exactly 3 distinct, connected, own non-root
 * tiles; target an enemy non-root tile adjacent to a sacrificed tile. Target strength
 * is ignored. Returns normalised coords; changes nothing.
 */
export const planFruit = (
  ctx: BoardCtx,
  player: Player,
  used: number,
  sacrifice: readonly Coord[],
  target: Coord,
): FruitPlan => {
  if (used >= ctx.config.fruitPerPlayer) fail('FRUIT_EXHAUSTED', 'no Fruit uses left');
  if (!Array.isArray(sacrifice)) fail('MALFORMED_ACTION', 'sacrifice must be an array');
  if (sacrifice.length !== 3) fail('FRUIT_SACRIFICE_COUNT', 'Fruit sacrifices exactly 3 tiles');
  const sac = sacrifice.map(assertCoord);
  const t = assertCoord(target);
  if (new Set(sac.map(coordKey)).size !== 3) fail('DUPLICATE_HEX', 'sacrifice hexes must be distinct');
  for (const c of sac) {
    const tile = ctx.board[coordKey(c)];
    if (!tile || tile.owner !== player) fail('FRUIT_SACRIFICE_NOT_OWN', `${coordKey(c)} is not your tile`);
    if (tile!.root) fail('FRUIT_SACRIFICE_ROOT', 'the root cannot be sacrificed');
  }
  if (!isConnected(sac)) fail('FRUIT_SACRIFICE_NOT_CONNECTED', 'sacrifice tiles must be connected');
  const victim = ctx.board[coordKey(t)];
  if (!victim || victim.owner === player) fail('FRUIT_TARGET_NOT_ENEMY', 'target must be an enemy tile');
  if (victim!.root) fail('FRUIT_TARGET_ROOT', 'roots cannot be Fruited');
  if (!sac.some((c) => isAdjacent(c, t))) fail('FRUIT_TARGET_NOT_ADJACENT', 'target must touch a sacrificed tile');
  return { sacrifice: sac, target: t };
};

/** Removes the sacrifice and the target. Run Sever and the Strangle check after. */
export const applyFruit = (board: Record<string, Tile | null>, plan: FruitPlan): Record<string, Tile | null> =>
  removeTiles(board, [...plan.sacrifice, plan.target]);

export const SEVERGROW_SPECIES: SpeciesPower = {
  id: 'severgrow',
  canFruit(ctx, player, used, sacrifice, target) {
    try {
      planFruit(ctx, player, used, sacrifice, target);
      return null;
    } catch (e) {
      if (e instanceof IllegalActionError) return e.code;
      throw e;
    }
  },
  resolveFruit: applyFruit,
};
