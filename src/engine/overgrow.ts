import { coordKey, onBoard } from './board.js';
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
  if (!onBoard(coord, ctx.config)) return 'OFF_BOARD';
  const key = coordKey(coord);
  if (ctx.terrain[key] === 'rock') return 'ROCK';
  const existing = ctx.board[key];
  if (!existing) return null;
  if (existing.owner === player) return 'OWN_TILE';
  if (existing.root) return 'ROOT_IMMUNE';
  // A level may withhold Overgrow until it is taught. Off means it is off for every growth path
  // (Sprout and Bloom alike): none of my tiles may land on the opponent's ground. Only an explicit
  // `false` withholds it, so a config saved before this key existed (an old match, an archived
  // rules version) keeps the rule it was played under.
  if (ctx.config.allowOvergrow === false) return 'OVERGROW_FORBIDDEN';
  return canOvergrow(existing, player, strength) ? null : 'NOT_STRONGER';
};
