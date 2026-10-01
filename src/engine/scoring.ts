import type { BoardCtx } from './overgrow.js';
import type { Player } from './types.js';

/** Spec 11: 1 per normal non-root tile, 2 per rich; +1 for the root if rootsScore. */
export const score = (ctx: BoardCtx, player: Player): number => {
  let total = 0;
  for (const [key, tile] of Object.entries(ctx.board)) {
    if (!tile || tile.owner !== player) continue;
    if (tile.root) total += ctx.config.rootsScore ? 1 : 0;
    else total += ctx.terrain[key] === 'rich' ? 2 : 1;
  }
  return total;
};

export const scores = (ctx: BoardCtx): [number, number] => [score(ctx, 0), score(ctx, 1)];

