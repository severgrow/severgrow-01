// v0.7: the two homes (my tree, the opponent's volcano). How many of a home's six sides are
// blocked (off the board, rock, or an enemy tile: the Strangle rule) and whether it is in
// danger (4 or more blocked, at least one by an enemy tile). Public information only.
import { allNeighbors, coordKey, rootCoord } from '../../../src/engine/index.js';
import type { Player, RulesConfig, Terrain, Tile } from '../../../src/engine/index.js';

type Ctx = { config: RulesConfig; board: Record<string, Tile | null>; terrain: Record<string, Terrain> };
export type HomeSides = { key: string; blocked: number; byEnemy: number; danger: boolean };

export const DANGER_SIDES = 4;

export const homeSides = (s: Ctx, owner: Player): HomeSides => {
  const home = rootCoord(owner, s.config.rootStyle, s.config.boardRadius);
  let blocked = 0;
  let byEnemy = 0;
  for (const n of allNeighbors(home)) {
    const k = coordKey(n);
    if (!(k in s.board) || s.terrain[k] === 'rock') blocked++;
    else if (s.board[k] && s.board[k]!.owner !== owner) {
      blocked++;
      byEnemy++;
    }
  }
  return { key: coordKey(home), blocked, byEnemy, danger: blocked >= DANGER_SIDES && byEnemy > 0 };
};
