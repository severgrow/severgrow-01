// v0.7: the two homes (my tree, the opponent's volcano). How many of a home's six sides are
// blocked (off the board, rock, or an enemy tile: the Strangle rule) and whether it is in
// danger (3 or more blocked, at least one by an enemy tile). Public information only.
import { allNeighbors, coordKey, homeCoord } from '../../../src/engine/index.js';
import type { Player, RulesConfig, Terrain, Tile } from '../../../src/engine/index.js';

type Ctx = { config: RulesConfig; board: Record<string, Tile | null>; terrain: Record<string, Terrain> };
/** `sides[i]`: the side in engine direction i is blocked. `enemy[i]`: it is blocked by an enemy tile. */
export type HomeSides = {
  key: string;
  blocked: number;
  byEnemy: number;
  danger: boolean;
  sides: boolean[];
  enemy: boolean[];
  /**
   * The sides that can actually be taken: on the board and not rock. A corner home has three, the
   * middle of the full board has six — so "surround all six sides" is only true in the middle.
   */
  openSides: number;
  /** How many of those the opponent already holds. */
  taken: number;
};

export const DANGER_SIDES = 3;

export const homeSides = (s: Ctx, owner: Player): HomeSides => {
  const home = homeCoord(owner, s.config);
  let byEnemy = 0;
  let openSides = 0;
  let taken = 0;
  const enemy: boolean[] = [];
  const sides = allNeighbors(home).map((n, i) => {
    const k = coordKey(n);
    enemy[i] = false;
    // Off the board: it can never be taken, so it is neither open nor a side to defend.
    if (!(k in s.board)) return true;
    if (s.terrain[k] === 'rock') return true;
    openSides++;
    if (s.board[k] && s.board[k]!.owner !== owner) {
      byEnemy++;
      taken++;
      enemy[i] = true;
      return true;
    }
    return false;
  });
  const blocked = sides.filter(Boolean).length;
  return { key: coordKey(home), blocked, byEnemy, danger: blocked >= DANGER_SIDES && byEnemy > 0, sides, enemy, openSides, taken };
};
