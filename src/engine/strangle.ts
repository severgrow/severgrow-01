import { allNeighbors, coordKey, isOnBoard, rootCoord } from './board.js';
import type { BoardCtx } from './overgrow.js';
import type { Player } from './types.js';

/**
 * Strangle (spec 8.6): all six root neighbours are off-board, rock or enemy tiles,
 * and at least one is an enemy tile. Terrain alone never strangles.
 */
export const isStrangled = (ctx: BoardCtx, player: Player): boolean => {
  const { boardRadius, rootStyle } = ctx.config;
  let enemy = 0;
  for (const n of allNeighbors(rootCoord(player, rootStyle, boardRadius))) {
    if (!isOnBoard(n, boardRadius)) continue;
    const k = coordKey(n);
    if (ctx.terrain[k] === 'rock') continue;
    const tile = ctx.board[k];
    if (!tile || tile.owner === player) return false;
    enemy++;
  }
  return enemy > 0;
};

export const strangledPlayers = (ctx: BoardCtx): Player[] =>
  ([0, 1] as const).filter((p) => isStrangled(ctx, p));

export type StrangleOutcome = { reason: 'strangle'; loser: Player } | { reason: 'double_strangle' };

/** Exactly one strangled root loses; both is a double strangle; none is null. */
export const strangleOutcome = (ctx: BoardCtx): StrangleOutcome | null => {
  const s = strangledPlayers(ctx);
  if (s.length === 2) return { reason: 'double_strangle' };
  const loser = s[0];
  return loser === undefined ? null : { reason: 'strangle', loser };
};
