import { addCoord, allNeighbors, coordKey, isConnected, normalizeCoord, scaleCoord } from './board.js';
import { DIRECTIONS } from './constants.js';
import { IllegalActionError } from './errors.js';
import { validateRun, validateSet, takeCards } from './melds.js';
import { claimBlocker } from './overgrow.js';
import type { BoardCtx } from './overgrow.js';
import type { Card, Coord, Player, Tile } from './types.js';

export type PlannedTile = { coord: Coord; strength: number };

/** A fully validated meld, ready for applyPlacement. */
export type Placement = { player: Player; cards: Card[]; tiles: PlannedTile[] };

export type OvergrowInfo = { coord: Coord; oldOwner: Player; oldStrength: number; newStrength: number };

const isCoord = (c: unknown): c is Coord =>
  typeof c === 'object' &&
  c !== null &&
  Number.isInteger((c as Coord).q) &&
  Number.isInteger((c as Coord).r);

export const assertCoord = (c: unknown): Coord => {
  if (!isCoord(c)) throw new IllegalActionError('INVALID_COORD', 'coordinates must be integer {q, r}');
  return normalizeCoord(c);
};

/** start, start+dir, start+2*dir, ... (n hexes). */
export const runLine = (start: Coord, dir: number, n: number): Coord[] => {
  const d = DIRECTIONS[dir];
  if (!d) throw new IllegalActionError('INVALID_DIR', `dir must be an integer 0-5, got ${dir}`);
  return Array.from({ length: n }, (_, i) => addCoord(start, scaleCoord(d, i)));
};

/** True when coord touches one of player's tiles (root included) on the current board. */
export const touchesNetwork = (board: BoardCtx['board'], player: Player, coord: Coord): boolean =>
  allNeighbors(coord).some((n) => board[coordKey(n)]?.owner === player);

const assertClaims = (ctx: BoardCtx, player: Player, tiles: PlannedTile[]): void => {
  for (const t of tiles) {
    const code = claimBlocker(ctx, player, t.coord, t.strength);
    if (code) throw new IllegalActionError(code, `cannot claim ${coordKey(t.coord)}`);
  }
};

/**
 * Validates a Hypha (spec 8.2) without changing anything. Cards are ordered by
 * ascending rank; the lowest lands on `start`, strength rising to the tip.
 */
export const planRun = (
  ctx: BoardCtx,
  player: Player,
  hand: readonly Card[],
  cardIds: readonly number[],
  start: Coord,
  dir: number,
): Placement => {
  const cards = validateRun(takeCards(hand, cardIds));
  if (!Number.isInteger(dir) || !DIRECTIONS[dir]) {
    throw new IllegalActionError('INVALID_DIR', `dir must be an integer 0-5, got ${dir}`);
  }
  const s = assertCoord(start);
  if (!touchesNetwork(ctx.board, player, s)) {
    throw new IllegalActionError('NOT_ADJACENT', 'hypha must start adjacent to your network');
  }
  const line = runLine(s, dir, cards.length);
  const tiles = line.map((coord, i) => ({ coord, strength: cards[i]!.rank }));
  assertClaims(ctx, player, tiles);
  return { player, cards, tiles };
};

/** Validates a Bloom (spec 8.3) without changing anything. */
export const planSet = (
  ctx: BoardCtx,
  player: Player,
  hand: readonly Card[],
  cardIds: readonly number[],
  hexes: readonly Coord[],
): Placement => {
  const cards = validateSet(takeCards(hand, cardIds));
  if (!Array.isArray(hexes)) throw new IllegalActionError('MALFORMED_ACTION', 'hexes must be an array');
  if (hexes.length !== cards.length) {
    throw new IllegalActionError('HEX_COUNT_MISMATCH', 'a bloom claims exactly one hex per card');
  }
  const coords = hexes.map(assertCoord);
  if (new Set(coords.map(coordKey)).size !== coords.length) {
    throw new IllegalActionError('DUPLICATE_HEX', 'bloom hexes must be distinct');
  }
  if (!isConnected(coords)) throw new IllegalActionError('HEXES_NOT_CONNECTED', 'bloom hexes must form one cluster');
  if (!coords.some((c) => touchesNetwork(ctx.board, player, c))) {
    throw new IllegalActionError('NOT_ADJACENT', 'bloom must touch your network');
  }
  const strength = cards[0]!.rank;
  const tiles = coords.map((coord) => ({ coord, strength }));
  assertClaims(ctx, player, tiles);
  return { player, cards, tiles };
};

/** Writes a validated placement onto a copy of the board. Does not Sever. */
export const applyPlacement = (
  board: Record<string, Tile | null>,
  placement: Placement,
): { board: Record<string, Tile | null>; placed: Coord[]; overgrown: OvergrowInfo[] } => {
  const next = { ...board };
  const overgrown: OvergrowInfo[] = [];
  for (const { coord, strength } of placement.tiles) {
    const key = coordKey(coord);
    const old = next[key];
    if (old) overgrown.push({ coord: { ...coord }, oldOwner: old.owner, oldStrength: old.strength, newStrength: strength });
    next[key] = { owner: placement.player, strength };
  }
  return { board: next, placed: placement.tiles.map((t) => ({ ...t.coord })), overgrown };
};
