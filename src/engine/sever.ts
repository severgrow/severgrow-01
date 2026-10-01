import { allCoords, allNeighbors, coordKey, rootCoord } from './board.js';
import type { Coord, Player, RulesConfig, Tile } from './types.js';

type Board = Record<string, Tile | null>;

/** Keys of player's tiles reachable from their root through their own tiles. */
export const connectedKeys = (board: Board, config: RulesConfig, player: Player): Set<string> => {
  const root = rootCoord(player, config.rootStyle, config.boardRadius);
  const rootTile = board[coordKey(root)];
  if (!rootTile?.root || rootTile.owner !== player) {
    throw new Error(`invariant: player ${player} root missing at ${coordKey(root)}`);
  }
  const seen = new Set<string>([coordKey(root)]);
  const stack: Coord[] = [root];
  while (stack.length > 0) {
    for (const n of allNeighbors(stack.pop()!)) {
      const k = coordKey(n);
      if (!seen.has(k) && board[k]?.owner === player) {
        seen.add(k);
        stack.push(n);
      }
    }
  }
  return seen;
};

/**
 * Sever (spec 8.5): every tile not connected to its owner's root through the
 * owner's own tiles becomes empty. Each player depends only on their own tiles, so
 * one pass suffices. The mover's opponent is listed first; empty entries are omitted;
 * coords follow board order.
 */
export const sever = (
  board: Board,
  config: RulesConfig,
  mover: Player,
): { board: Board; severed: { player: Player; coords: Coord[] }[] } => {
  const next = { ...board };
  const severed: { player: Player; coords: Coord[] }[] = [];
  for (const player of [(1 - mover) as Player, mover]) {
    const keep = connectedKeys(board, config, player);
    const coords = allCoords(config.boardRadius).filter((c) => {
      const k = coordKey(c);
      return board[k]?.owner === player && !keep.has(k);
    });
    for (const c of coords) next[coordKey(c)] = null;
    if (coords.length > 0) severed.push({ player, coords });
  }
  return { board: next, severed };
};
