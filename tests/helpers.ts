import { allCoords, coordKey, resolveConfig, rootCoord } from '../src/engine/index.js';
import type { Card, Player, RulesConfig, Suit, Terrain, Tile } from '../src/engine/index.js';

export type Fixture = {
  config: RulesConfig;
  board: Record<string, Tile | null>;
  terrain: Record<string, Terrain>;
};

/**
 * Hand-built board for rule tests. Terrain is all normal unless listed; roots are
 * placed per config; `tiles` maps coord keys to [owner, strength].
 */
export const fixture = (
  opts: {
    tiles?: Record<string, [Player, number]>;
    rock?: string[];
    rich?: string[];
    config?: Partial<RulesConfig>;
  } = {},
): Fixture => {
  const config = resolveConfig(opts.config);
  const terrain: Record<string, Terrain> = {};
  const board: Record<string, Tile | null> = {};
  for (const c of allCoords(config.boardRadius)) {
    terrain[coordKey(c)] = 'normal';
    board[coordKey(c)] = null;
  }
  for (const k of opts.rock ?? []) terrain[k] = 'rock';
  for (const k of opts.rich ?? []) terrain[k] = 'rich';
  for (const owner of [0, 1] as const) {
    board[coordKey(rootCoord(owner, config.rootStyle, config.boardRadius))] = {
      owner,
      strength: 0,
      root: true,
    };
  }
  for (const [k, [owner, strength]] of Object.entries(opts.tiles ?? {})) {
    if (!(k in board)) throw new Error(`fixture tile off board: ${k}`);
    board[k] = { owner, strength };
  }
  return { config, board, terrain };
};

export const card = (id: number, suit: Suit, rank: number): Card => ({ id, suit, rank });

/** Asserts fn throws an error with the given stable code. */
export const codeOf = (fn: () => unknown): string | undefined => {
  try {
    fn();
  } catch (e) {
    return (e as { code?: string }).code;
  }
  return undefined;
};

/** Keys of all non-null tiles owned by player, sorted. */
export const tilesOf = (board: Record<string, Tile | null>, player: Player): string[] =>
  Object.entries(board)
    .filter(([, t]) => t?.owner === player)
    .map(([k]) => k)
    .sort();

export const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

import { apply as applyAction, legalActions as legal, mulberry32 as rng32, newGame as fresh, viewFor as view } from '../src/engine/index.js';
import type { Action as Act, State as St } from '../src/engine/index.js';

/**
 * Seeded random legal play. Calls `visit` on every state reached (including the
 * first). Stops at game over or after maxActions.
 */
export const randomPlay = (seed: number, maxActions: number, visit: (s: St, i: number) => void): St => {
  const rand = rng32(seed ^ 0x5eed);
  let s = fresh(seed);
  for (let i = 0; i < maxActions; i++) {
    visit(s, i);
    if (s.phase === 'GAME_OVER') break;
    const acts: Act[] = legal(view(s, s.actor));
    if (acts.length === 0) throw new Error(`no legal actions in ${s.phase}`);
    s = applyAction(s, acts[Math.floor(rand() * acts.length)]!);
  }
  return s;
};
