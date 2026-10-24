// AUTHORED POSITIONS — the exact opening of a teaching level, built from real cards on a real board.
//
// A lesson must be able to promise its moment ("this Bloom WILL be in your hand"), so its opening is
// authored: the terrain, the tiles already grown, both hands, the order of the Draw pile and the
// Throw pile. Nothing here is a rule. Every card is a real card taken from the engine's own deck
// (never invented, never duplicated); the cards a lesson does not name are simply left out of play,
// which is how a short lesson gets a short Draw pile without changing the deck rules. From the first
// move on, everything is the engine's: apply, legalActions, scoring, deck end and the strangle.
//
// Shared by the levels and (later, when it is retired) independent of the old Tutorial.
import { allCoords, coordKey, createCards, newGame, rootCoord } from '../../../src/engine/index.js';
import type { BoardSpec, Card, RulesConfig, State, Suit, Tile } from '../../../src/engine/index.js';
import { SMALL_BOARD_RADIUS } from '../../../src/campaign/small-board.js';

/** A card by suit and rank; suit `null` with rank 0 is a Bomb. */
export type CardSpec = readonly [Suit | null, number];
/** A tile already on the board: hex key, owner (0 = you, 1 = them), strength. */
export type TileSpec = readonly [string, 0 | 1, number];

export type PositionSpec = {
  /** Seeds the engine's own streams (none of them is read after the opening, but the state keeps it). */
  seed: number;
  rock?: readonly string[];
  gold?: readonly string[];
  tiles?: readonly TileSpec[];
  /** Your hand and theirs. */
  hand: readonly CardSpec[];
  opponent: readonly CardSpec[];
  /** The Draw pile, top card first. Its length is the lesson's clock. */
  deck: readonly CardSpec[];
  /** The Throw pile, bottom first; its last card is the one on top. */
  discard?: readonly CardSpec[];
  /**
   * Engine overrides this lesson withholds (never invents). Used by level 1 to turn Overgrow off
   * until level 2 explains it; every other lesson leaves it out, so its rules are the defaults.
   */
  rules?: Partial<RulesConfig>;
};

/** Your home and theirs on the small map (the engine's own ring2 roots). */
export const SMALL_HOMES: readonly [string, string] = Object.freeze([
  coordKey(rootCoord(0, 'ring2', SMALL_BOARD_RADIUS)),
  coordKey(rootCoord(1, 'ring2', SMALL_BOARD_RADIUS)),
]);

/** The small map's board spec with this position's terrain. */
export const smallBoard = (rock: readonly string[] = [], gold: readonly string[] = []): BoardSpec => ({
  cells: allCoords(SMALL_BOARD_RADIUS).map(coordKey),
  rock: [...rock],
  gold: [...gold],
  homes: [SMALL_HOMES[0], SMALL_HOMES[1]],
});

/** The rules overrides a position plays under: the small map and its terrain, plus any rule the
 *  lesson withholds on purpose. The board always wins over `rules`, so a lesson cannot replace it. */
export const positionConfig = (p: Pick<PositionSpec, 'rock' | 'gold' | 'rules'>): Partial<RulesConfig> => ({
  ...(p.rules ?? {}),
  boardRadius: SMALL_BOARD_RADIUS,
  rootStyle: 'ring2',
  board: smallBoard(p.rock, p.gold),
});

/** Takes named cards out of a pool, one physical card each. Throws on a card the deck does not have. */
const taker = (pool: Card[]) => ([suit, rank]: CardSpec): Card => {
  const i = pool.findIndex((c) => c.suit === suit && c.rank === rank);
  if (i < 0) throw new Error(`Authored card missing from the deck: ${suit === null ? 'Bomb' : `${suit}:${rank}`}`);
  return pool.splice(i, 1)[0]!;
};

/**
 * The opening state of a position: your turn, Draw step, turn 1, you start. Built on the engine's
 * own `newGame` for the board, homes, config and every bookkeeping field, then the authored parts
 * are laid on top.
 */
export const authoredState = (p: PositionSpec): State => {
  const opening = newGame(p.seed, positionConfig(p));
  const pool = createCards(opening.config);
  const take = taker(pool);
  const hand = p.hand.map(take);
  const opponent = p.opponent.map(take);
  const deck = p.deck.map(take);
  const discard = (p.discard ?? []).map(take);
  const board: Record<string, Tile | null> = { ...opening.board };
  for (const [key, owner, strength] of p.tiles ?? []) {
    if (!(key in board)) throw new Error(`Authored tile off the board: ${key}`);
    if (board[key]?.root) throw new Error(`Authored tile on a home: ${key}`);
    if (opening.terrain[key] === 'rock') throw new Error(`Authored tile on a rock: ${key}`);
    board[key] = { owner, strength };
  }
  return {
    ...opening,
    board,
    hands: [hand, opponent],
    deck,
    discard,
    phase: 'DRAW',
    turnPlayer: 0,
    actor: 0,
    startingPlayer: 0,
    turnNumber: 1,
    deckFinal: null,
    history: [],
  };
};
