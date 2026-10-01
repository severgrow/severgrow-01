import { allCoords, coordKey, rootCoord } from './board.js';
import { createCards } from './cards.js';
import { resolveConfig } from './config.js';
import { bestMeldPartition } from './deadwood.js';
import { drawFromDeck, shuffleDeck } from './deck.js';
import { ConfigError, DealError } from './errors.js';
import { generateTerrain } from './terrain.js';
import type { Card, RulesConfig, State, Tile } from './types.js';

/** Most redeals tried for the opening-combo guarantee (v0.4). */
export const MAX_DEAL_ATTEMPTS = 200;

const hasCombo = (hand: readonly Card[]) => bestMeldPartition(hand).melds.length > 0;

/**
 * Deals handSize to P1 then P2 and flips one discard. With guaranteeOpeningMeld, redeals
 * (seed + attempt counter) until both hands hold a combo, up to MAX_DEAL_ATTEMPTS, then
 * throws DealError. `ok` is injectable for tests.
 */
export const dealOpening = (
  seed: number,
  config: RulesConfig,
  ok: (hands: [Card[], Card[]]) => boolean = ([a, b]) => hasCombo(a) && hasCombo(b),
): { hands: [Card[], Card[]]; deck: Card[]; discard: Card[]; attempt: number } => {
  const cards = createCards(config);
  for (let attempt = 0; attempt < MAX_DEAL_ATTEMPTS; attempt++) {
    const deck = shuffleDeck(cards, seed, attempt);
    const p1 = drawFromDeck(deck, config.handSize);
    const p2 = drawFromDeck(p1.deck, config.handSize);
    const flip = drawFromDeck(p2.deck, 1);
    const hands: [Card[], Card[]] = [p1.drawn, p2.drawn];
    if (!config.guaranteeOpeningMeld || ok(hands)) return { hands, deck: flip.deck, discard: flip.drawn, attempt };
  }
  throw new DealError(`no deal in ${MAX_DEAL_ATTEMPTS} attempts gave both hands a combo (seed ${seed})`);
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
    finalTurn: null,
    rotPick: null,
    turnNumber: 1,
    result: null,
    lastResolution: null,
    history: [],
    sproutsThisTurn: 0,
    dealAttempt: deal.attempt,
  };
};
