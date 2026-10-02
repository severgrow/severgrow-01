import { coordKey, isOnBoard, rootCoord } from './board.js';
import { CENTRE, MAX_RANK, MIN_RANK, SUITS } from './constants.js';
import { ConfigError } from './errors.js';
import { eligibleTerrainPairs, rootZone } from './terrain.js';
import type { RulesConfig } from './types.js';

export const DEFAULT_CONFIG: Readonly<RulesConfig> = Object.freeze({
  boardRadius: 3,
  rootStyle: 'ring2',
  handSize: 7,
  copiesPerCard: 2,
  rockCount: 4,
  richCount: 5,
  knockDeadwood: 10,
  knockGivesFinalTurn: true,
  rotThreshold: 20,
  rotStep: 8,
  forbidRedundantDiscard: true,
  allowHyphaOneBend: false,
  fruitPerPlayer: 1,
  rootsScore: false,
  maxRank: 9,
  sproutsPerTurn: 1,
  maxTurnsPerPlayer: 30,
  unbiasedShuffle: true,
  allowStrengthen: true,
  strengthenLimitPerGame: 2,
  fruitSacrifice: 3,
  fruitOnlyWhenBehind: false,
  rotEnabled: false,
  knockEnabled: false,
});

/** Lowest allowed maxRank (v0.4). */
const MIN_MAX_RANK = 5;

/** Minimum value for each numeric key (all must be finite integers). */
const NUMBER_MIN: Record<string, number> = {
  boardRadius: 1,
  handSize: 0,
  copiesPerCard: 1,
  rockCount: 0,
  richCount: 0,
  knockDeadwood: 0,
  rotThreshold: 0,
  rotStep: 1,
  fruitPerPlayer: 0,
  maxRank: MIN_MAX_RANK,
  sproutsPerTurn: 0,
  maxTurnsPerPlayer: 0,
  strengthenLimitPerGame: -1,
  fruitSacrifice: 1,
};

const BOOLEAN_KEYS = [
  'knockGivesFinalTurn',
  'forbidRedundantDiscard',
  'allowHyphaOneBend',
  'rootsScore',
  'unbiasedShuffle',
  'allowStrengthen',
  'fruitOnlyWhenBehind',
  'rotEnabled',
  'knockEnabled',
] as const;


/** Merges overrides onto the defaults and validates. Throws ConfigError. */
export const resolveConfig = (overrides: Partial<RulesConfig> = {}): RulesConfig => {
  for (const key of Object.keys(overrides)) {
    if (!(key in DEFAULT_CONFIG)) throw new ConfigError('UNKNOWN_KEY', `unknown config key "${key}"`);
  }
  const c: RulesConfig = { ...DEFAULT_CONFIG, ...overrides };

  for (const [key, min] of Object.entries(NUMBER_MIN)) {
    const v: unknown = c[key as keyof RulesConfig];
    if (typeof v !== 'number' || !Number.isInteger(v) || v < min) {
      throw new ConfigError('INVALID_NUMBER', `${key} must be an integer >= ${min}, got ${String(v)}`);
    }
  }
  for (const key of BOOLEAN_KEYS) {
    if (typeof c[key] !== 'boolean') throw new ConfigError('INVALID_BOOLEAN', `${key} must be a boolean`);
  }
  if (c.maxRank > MAX_RANK) throw new ConfigError('INVALID_NUMBER', `maxRank must be ${MIN_MAX_RANK}-${MAX_RANK}, got ${c.maxRank}`);
  if (c.rootStyle !== 'ring2' && c.rootStyle !== 'corner') {
    throw new ConfigError('INVALID_ROOT_STYLE', `rootStyle must be 'ring2' or 'corner'`);
  }
  if (c.richCount % 2 !== 1) {
    throw new ConfigError('RICH_COUNT_NOT_ODD', `richCount must be odd (centre + pairs), got ${c.richCount}`);
  }
  if (c.rockCount % 2 !== 0) {
    throw new ConfigError('ROCK_COUNT_NOT_EVEN', `rockCount must be even (pairs), got ${c.rockCount}`);
  }
  if (c.handSize < 3) throw new ConfigError('HAND_SIZE_TOO_SMALL', `handSize must be >= 3`);
  if (c.allowHyphaOneBend) {
    throw new ConfigError('NOT_IMPLEMENTED', 'allowHyphaOneBend is not implemented until Milestone C');
  }

  const deckSize = SUITS.length * (c.maxRank - MIN_RANK + 1) * c.copiesPerCard;
  // Two hands, a starting discard, and at least one card left to draw.
  if (deckSize < 2 * c.handSize + 2) {
    throw new ConfigError('DECK_TOO_SMALL', `${deckSize} cards cannot deal two hands of ${c.handSize}, a discard, and leave a card to draw`);
  }


  for (const p of [0, 1] as const) {
    if (!isOnBoard(rootCoord(p, c.rootStyle, c.boardRadius), c.boardRadius)) {
      throw new ConfigError('ROOT_OFF_BOARD', `${c.rootStyle} roots do not fit radius ${c.boardRadius}`);
    }
  }

  const pairsNeeded = c.rockCount / 2 + (c.richCount - 1) / 2;
  const pairsAvailable = eligibleTerrainPairs(c.rootStyle, c.boardRadius).length;
  if (pairsNeeded > pairsAvailable || rootZone(c.rootStyle, c.boardRadius).has(coordKey(CENTRE))) {
    throw new ConfigError(
      'TERRAIN_INFEASIBLE',
      `need ${pairsNeeded} eligible terrain pairs, only ${pairsAvailable} available`,
    );
  }
  return c;
};
