import { addCoord, allNeighbors, coordKey, isConnected, isOnBoard, normalizeCoord, scaleCoord } from './board.js';
import { DIRECTIONS } from './constants.js';
import { IllegalActionError } from './errors.js';
import type { IllegalActionCode } from './errors.js';
import { validateRun, validateSet, takeCards } from './melds.js';
import { claimBlocker } from './overgrow.js';
import { rulesetOf, sproutStrength } from './ruleset.js';
import type { BoardCtx } from './overgrow.js';
import type { Card, Coord, Player, Tile } from './types.js';

/** `seed`: a Seed tile (Seed ruleset), marked on the board until it is strengthened. */
export type PlannedTile = { coord: Coord; strength: number; seed?: true };

/** A fully validated meld, ready for applyPlacement. `strengthen`: a Sprout on my own tile (v0.5). */
export type Placement = { player: Player; cards: Card[]; tiles: PlannedTile[]; strengthen?: { from: number } };

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

/** Why a Strengthen of my own tile is illegal, or null (v0.5). `used` = my Strengthens so far. */
export const strengthenBlocker = (ctx: BoardCtx, player: Player, coord: Coord, rank: number, used: number): IllegalActionCode | null => {
  const tile = ctx.board[coordKey(coord)];
  if (!tile || tile.owner !== player) return 'OWN_TILE';
  if (!ctx.config.allowStrengthen) return 'OWN_TILE';
  if (tile.root) return 'ROOT_IMMUNE';
  if (rank <= tile.strength) return 'NOT_STRONGER';
  const limit = ctx.config.strengthenLimitPerGame;
  if (limit >= 0 && used >= limit) return 'STRENGTHEN_LIMIT';
  return null;
};

/**
 * Validates a Sprout (v0.4): one card becomes one tile with strength = its rank, on a
 * hex touching the player's network (root included) that is empty or holds a strictly
 * weaker enemy tile. v0.5 Strengthen: or on one of my own non-root tiles weaker than the
 * card (`strengthenUsed` = my Strengthens so far). Changes nothing.
 */
export const planSprout = (ctx: BoardCtx, player: Player, hand: readonly Card[], cardId: number, coord: Coord, strengthenUsed = 0): Placement => {
  const [card] = takeCards(hand, [cardId]);
  const c = assertCoord(coord);
  const own = ctx.board[coordKey(c)];
  if (own && own.owner === player && isOnBoard(c, ctx.config.boardRadius)) {
    const code = strengthenBlocker(ctx, player, c, card!.rank, strengthenUsed);
    if (code) throw new IllegalActionError(code, `cannot strengthen ${coordKey(c)}`);
    return { player, cards: [card!], tiles: [{ coord: c, strength: card!.rank }], strengthen: { from: own.strength } };
  }
  if (!touchesNetwork(ctx.board, player, c)) throw new IllegalActionError('NOT_ADJACENT', 'a sprout must touch your network');
  // Seed ruleset: the tile is worth 1 whatever the card (the card is still used up).
  const tiles: PlannedTile[] = [rulesetOf(ctx.config) === 'seed' ? { coord: c, strength: sproutStrength(ctx.config, card!.rank), seed: true } : { coord: c, strength: card!.rank }];
  assertClaims(ctx, player, tiles);
  return { player, cards: [card!], tiles };
};

/** Writes a validated placement onto a copy of the board. Does not Sever. */
export const applyPlacement = (
  board: Record<string, Tile | null>,
  placement: Placement,
): { board: Record<string, Tile | null>; placed: Coord[]; overgrown: OvergrowInfo[] } => {
  const next = { ...board };
  const overgrown: OvergrowInfo[] = [];
  for (const { coord, strength, seed } of placement.tiles) {
    const key = coordKey(coord);
    const old = next[key];
    if (old && old.owner !== placement.player) overgrown.push({ coord: { ...coord }, oldOwner: old.owner, oldStrength: old.strength, newStrength: strength });
    next[key] = seed ? { owner: placement.player, strength, seed } : { owner: placement.player, strength };
  }
  return { board: next, placed: placement.tiles.map((t) => ({ ...t.coord })), overgrown };
};
