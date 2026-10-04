import { allNeighbors, coordKey, isConnected, isOnBoard, normalizeCoord } from './board.js';
import { IllegalActionError } from './errors.js';
import type { IllegalActionCode } from './errors.js';
import { takeCards, validateBloom } from './melds.js';
import { claimBlocker } from './overgrow.js';
import type { BoardCtx } from './overgrow.js';
import type { Card, Coord, Player, Tile } from './types.js';

export type PlannedTile = { coord: Coord; strength: number };

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
 * Validates a Bloom (v0.7) without changing anything: `hexes[i]` receives `cards[i]` with that
 * card's own number. The cards are a set or a run of 3-4; the hexes are distinct, one connected
 * cluster of any shape, at least one touching my network on the board before the move
 * (`bloomMustTouchNetwork`), and each claimable by the number it receives.
 */
export const planBloom = (
  ctx: BoardCtx,
  player: Player,
  hand: readonly Card[],
  cardIds: readonly number[],
  hexes: readonly Coord[],
): Placement => {
  const given = takeCards(hand, cardIds);
  validateBloom(given);
  if (!Array.isArray(hexes)) throw new IllegalActionError('MALFORMED_ACTION', 'hexes must be an array');
  if (hexes.length !== given.length) throw new IllegalActionError('HEX_COUNT_MISMATCH', 'a bloom claims exactly one hex per card');
  const coords = hexes.map(assertCoord);
  if (new Set(coords.map(coordKey)).size !== coords.length) throw new IllegalActionError('DUPLICATE_HEX', 'bloom hexes must be distinct');
  if (!isConnected(coords)) throw new IllegalActionError('HEXES_NOT_CONNECTED', 'bloom hexes must form one cluster');
  if (ctx.config.bloomMustTouchNetwork && !coords.some((c) => touchesNetwork(ctx.board, player, c))) {
    throw new IllegalActionError('NOT_ADJACENT', 'a bloom must touch your network');
  }
  const tiles = coords.map((coord, i) => ({ coord, strength: given[i]!.rank }));
  assertClaims(ctx, player, tiles);
  // cards in ascending order, each still paired with its hex
  const pairs = given.map((card, i) => ({ card, tile: tiles[i]! })).sort((x, y) => x.card.rank - y.card.rank || x.card.id - y.card.id);
  return { player, cards: pairs.map((x) => x.card), tiles: pairs.map((x) => x.tile) };
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
  // v0.6: a Fruit card has no number: it never sprouts or strengthens
  if (card!.suit === null) throw new IllegalActionError('NOT_A_NUMBER_CARD', 'a Fruit card cannot sprout or strengthen');
  const c = assertCoord(coord);
  const own = ctx.board[coordKey(c)];
  if (own && own.owner === player && isOnBoard(c, ctx.config.boardRadius)) {
    const code = strengthenBlocker(ctx, player, c, card!.rank, strengthenUsed);
    if (code) throw new IllegalActionError(code, `cannot strengthen ${coordKey(c)}`);
    return { player, cards: [card!], tiles: [{ coord: c, strength: card!.rank }], strengthen: { from: own.strength } };
  }
  if (!touchesNetwork(ctx.board, player, c)) throw new IllegalActionError('NOT_ADJACENT', 'a sprout must touch your network');
  const tiles: PlannedTile[] = [{ coord: c, strength: card!.rank }];
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
  for (const { coord, strength } of placement.tiles) {
    const key = coordKey(coord);
    const old = next[key];
    if (old && old.owner !== placement.player) overgrown.push({ coord: { ...coord }, oldOwner: old.owner, oldStrength: old.strength, newStrength: strength });
    next[key] = { owner: placement.player, strength };
  }
  return { board: next, placed: placement.tiles.map((t) => ({ ...t.coord })), overgrown };
};
