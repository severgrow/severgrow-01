// Shared helpers for the UI logic tests: real positions from bot-vs-bot play.
import { DIRECTIONS, addCoord, apply, coordKey, isOnBoard, newGame, rootCoord, viewFor } from '../../src/engine/index.js';
import type { Action, Coord, Player, RulesConfig, State, Tile } from '../../src/engine/index.js';
import { GreedyBot } from '../../src/bots/GreedyBot.js';

export type Played = { before: State; action: Action; after: State };

/** Plays GreedyBot vs GreedyBot from `seed`, calling `each` after every action. */
export const playGame = (seed: number, each?: (p: Played) => void, maxActions = 5000, config?: Partial<RulesConfig>): State => {
  let s = newGame(seed, config);
  for (let i = 0; i < maxActions && s.phase !== 'GAME_OVER'; i++) {
    const action = GreedyBot.chooseAction(viewFor(s, s.actor));
    const after = apply(s, action);
    each?.({ before: s, action, after });
    s = after;
  }
  return s;
};

/** The first state (from `seed`) where `pred` holds, or null. */
export const findState = (seed: number, pred: (s: State) => boolean): State | null => {
  let found: State | null = null;
  playGame(seed, ({ after }) => {
    if (!found && pred(after)) found = after;
  });
  return found;
};

/** A fresh game whose board is only the two roots plus `tiles`. */
export const customBoard = (tiles: Record<string, Tile>, seed = 1): State => {
  const s = newGame(seed);
  const board: Record<string, Tile | null> = {};
  for (const [k, t] of Object.entries(s.board)) board[k] = t?.root ? t : null;
  return { ...s, board: { ...board, ...tiles } };
};

/** Root plus a direction i where root+d_i, root+d_(i+1) and root+2*d_i are all on the board. */
export const rootFan = (s: State, p: Player): { root: Coord; a: Coord; b: Coord; c: Coord } => {
  const R = s.config.boardRadius;
  const root = rootCoord(p, s.config.rootStyle, R);
  for (let i = 0; i < 6; i++) {
    const a = addCoord(root, DIRECTIONS[i]!);
    const c = addCoord(root, DIRECTIONS[(i + 1) % 6]!);
    const b = addCoord(a, DIRECTIONS[i]!);
    const keys = [a, b, c].map(coordKey);
    if ([a, b, c].every((x) => isOnBoard(x, R)) && keys.every((k) => s.terrain[k] !== 'rock')) return { root, a, b, c };
  }
  throw new Error('no room next to the root');
};
