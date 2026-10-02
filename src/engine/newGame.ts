import { allCoords, coordKey, rootCoord } from './board.js';
import { createCards } from './cards.js';
import { resolveConfig } from './config.js';
import { drawFromDeck, shuffleDeck } from './deck.js';
import { ConfigError } from './errors.js';
import { generateTerrain } from './terrain.js';
import type { Card, RulesConfig, State, Tile } from './types.js';

/**
 * The deal (spec 5): one seeded shuffle, handSize to P1 then P2 from the top, then one card
 * flipped to start the discard pile. Nothing is reordered, redealt or balanced.
 */
export const dealOpening = (seed: number, config: RulesConfig): { hands: [Card[], Card[]]; deck: Card[]; discard: Card[] } => {
  const deck = shuffleDeck(createCards(config), seed, config.unbiasedShuffle !== false);
  const p1 = drawFromDeck(deck, config.handSize);
  const p2 = drawFromDeck(p1.deck, config.handSize);
  const flip = drawFromDeck(p2.deck, 1);
  return { hands: [p1.drawn, p2.drawn], deck: flip.deck, discard: flip.drawn };
};

/**
 * Setup (spec 5): terrain, cards, seeded shuffle, deal handSize to P1 then P2,
 * flip one discard, place both roots. P1 to draw on turn 1.
 */
export const newGame = (seed: number, overrides: Partial<RulesConfig> = {}): State => {
  if (!Number.isSafeInteger(seed)) throw new ConfigError('INVALID_SEED', `seed must be an integer, got ${seed}`);
  const config = resolveConfig(overrides);

  const terrain = generateTerrain(seed, config);

  const board: Record<string, Tile | null> = {};
  for (const c of allCoords(config.boardRadius)) board[coordKey(c)] = null;
  for (const owner of [0, 1] as const) {
    board[coordKey(rootCoord(owner, config.rootStyle, config.boardRadius))] = { owner, strength: 0, root: true };
  }

  const deal = dealOpening(seed, config);

  return {
    seed,
    config,
    board,
    terrain,
    hands: deal.hands,
    deck: deal.deck,
    discard: deal.discard,
    turnPlayer: 0,
    actor: 0,
    phase: 'DRAW',
    drawnFromDiscard: null,
    fruitUsed: [0, 0],
    strengthenUsed: [0, 0],
    finalTurn: null,
    rotPick: null,
    turnNumber: 1,
    result: null,
    lastResolution: null,
    history: [],
    sproutsThisTurn: 0,
  };
};
