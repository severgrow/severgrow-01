import { allCoords, coordKey, rootCoord } from './board.js';
import { createCards } from './cards.js';
import { resolveConfig } from './config.js';
import { drawFromDeck, shuffleDeck } from './deck.js';
import { ConfigError } from './errors.js';
import { generateTerrain } from './terrain.js';
import type { RulesConfig, State, Tile } from './types.js';

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

  let deck = shuffleDeck(createCards(config), seed);
  const p1 = drawFromDeck(deck, config.handSize);
  const p2 = drawFromDeck(p1.deck, config.handSize);
  const flip = drawFromDeck(p2.deck, 1);
  deck = flip.deck;

  return {
    seed,
    config,
    board,
    terrain,
    hands: [p1.drawn, p2.drawn],
    deck,
    discard: flip.drawn,
    turnPlayer: 0,
    actor: 0,
    phase: 'DRAW',
    drawnFromDiscard: null,
    fruitUsed: [0, 0],
    finalTurn: null,
    rotPick: null,
    turnNumber: 1,
    result: null,
    lastResolution: null,
  };
};
