import { allCoords, allNeighbors, coordKey } from './board.js';
import type { BoardCtx } from './overgrow.js';
import type { Coord, Player, RotPickState, RulesConfig, Tile } from './types.js';

/** Spec 9.2: 0 up to the threshold, then +1 per `rotStep` (first step starts at T+1). */
export const rotCount = (dw: number, config: RulesConfig): number =>
  dw <= config.rotThreshold ? 0 : 1 + Math.floor((dw - config.rotThreshold - 1) / config.rotStep);

/**
 * Spec 9.3: player's non-root tiles with at least one neighbour that is off-board,
 * empty, rock or an enemy tile (i.e. not an own tile). Board order.
 */
export const borderTiles = (ctx: BoardCtx, player: Player): Coord[] =>
  allCoords(ctx.config.boardRadius).filter((c) => {
    const t = ctx.board[coordKey(c)];
    if (!t || t.owner !== player || t.root) return false;
    return allNeighbors(c).some((n) => ctx.board[coordKey(n)]?.owner !== player);
  });

export type RotPlan = { auto: Coord[]; pick: RotPickState | null };

/**
 * Selects Rot victims from a snapshot of the board (spec 9.3). Tiles below the
 * boundary strength rot automatically; at the boundary, a tied group that fits the
 * remaining slots also rots automatically, otherwise the opponent picks.
 */
export const planRot = (ctx: BoardCtx, player: Player, count: number): RotPlan => {
  const strengthOf = (c: Coord) => ctx.board[coordKey(c)]!.strength;
  // Stable sort keeps board order inside equal strengths.
  const eligible = [...borderTiles(ctx, player)].sort((a, b) => strengthOf(a) - strengthOf(b));
  const k = Math.min(count, eligible.length);
  if (k === 0) return { auto: [], pick: null };

  const boundary = strengthOf(eligible[k - 1]!);
  const auto = eligible.filter((c) => strengthOf(c) < boundary);
  const tied = eligible.filter((c) => strengthOf(c) === boundary);
  const slots = k - auto.length;
  if (tied.length <= slots) return { auto: [...auto, ...tied], pick: null };
  return { auto, pick: { remaining: slots, candidates: tied } };
};

/** Empties the given hexes on a copy of the board. */
export const removeTiles = (board: Record<string, Tile | null>, coords: readonly Coord[]): Record<string, Tile | null> => {
  const next = { ...board };
  for (const c of coords) next[coordKey(c)] = null;
  return next;
};
