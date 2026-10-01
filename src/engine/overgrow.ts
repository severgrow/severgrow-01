import { coordKey, isOnBoard } from './board.js';
import type { IllegalActionCode } from './errors.js';
import type { Coord, Player, RulesConfig, Terrain, Tile } from './types.js';

/** The parts of State (or View) that board rules read. */
export type BoardCtx = {
  config: RulesConfig;
  board: Record<string, Tile | null>;
  terrain: Record<string, Terrain>;
};

/** Overgrowth (spec 8.4): only enemy non-root tiles strictly weaker than the new tile. */
export const canOvergrow = (existing: Tile, player: Player, strength: number): boolean =>
  existing.owner !== player && !existing.root && strength > existing.strength;

/**
 * Why `player` may not claim `coord` with a tile of `strength` (spec 8.1), or null
 * when the claim is legal (empty hex, or an overgrowable enemy tile).
 */
export const claimBlocker = (ctx: BoardCtx, player: Player, coord: Coord, strength: number): IllegalActionCode | null => {
  if (!isOnBoard(coord, ctx.config.boardRadius)) return 'OFF_BOARD';
  const key = coordKey(coord);
  if (ctx.terrain[key] === 'rock') return 'ROCK';
  const existing = ctx.board[key];
  if (!existing) return null;
  if (existing.owner === player) return 'OWN_TILE';
  if (existing.root) return 'ROOT_IMMUNE';
  return canOvergrow(existing, player, strength) ? null : 'NOT_STRONGER';
};
