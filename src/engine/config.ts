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
  // Futasaku 0.4: any hand card may be thrown, including one just taken from the throw pile.
  forbidRedundantDiscard: false,
  bloomMustTouchNetwork: true,
  rootsScore: false,
  maxRank: 9,
  sproutsPerTurn: 1,
  maxTurnsPerPlayer: 30,
  allowStrengthen: true,
  strengthenLimitPerGame: -1,
  fruitCardCount: 4,
  fruitRootCountsAsTouch: true,
  fruitUsesSprout: true,
  strengthTiebreak: true,
  // Futasaku 0.4: the engine decides the starting seat from the match seed.
  startingPlayerLottery: true,
  rotEnabled: false,
  knockEnabled: false,
  board: null,
  reshuffleDiscard: false,
  deckFinalTurns: true,
  expandedBloom: true,
});

/**
 * The small-map preset (owner request, 2026-10-14). It is a CONFIG preset only — not a rule
 * change: the small map is one ring smaller (19 hexes, the tutorial's radius), the deck keeps
 * ONE copy of every (suit, number) instead of two, only TWO Bombs (Fruit cards) are dealt, and
 * the turn limit is half the classic one. Every value derives from DEFAULT_CONFIG so the small
 * map and the classic board can never drift apart. Generated terrain is used (no Lab `board`):
 * radius 2 has 5 eligible mirrored terrain pairs and this preset needs 4, so it validates.
 */
export const SMALL_MAP_CONFIG: Readonly<Partial<RulesConfig>> = Object.freeze({
  boardRadius: 2,
  copiesPerCard: 1,
  fruitCardCount: 2,
  maxTurnsPerPlayer: DEFAULT_CONFIG.maxTurnsPerPlayer / 2,
});

/** The two duel maps the player can choose between. */
export type BoardChoice = 'small' | 'classic';

/** The config overrides for a chosen map: 'small' is the preset, 'classic' is the untouched game. */
export const boardChoiceConfig = (choice: BoardChoice): Partial<RulesConfig> =>
  choice === 'small' ? { ...SMALL_MAP_CONFIG } : {};

/** Which map a config plays on. A smaller-than-classic board is the small map. */
export const boardChoiceOf = (config: Pick<RulesConfig, 'boardRadius'>): BoardChoice =>
  config.boardRadius < DEFAULT_CONFIG.boardRadius ? 'small' : 'classic';

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
  maxRank: MIN_MAX_RANK,
  sproutsPerTurn: 0,
  maxTurnsPerPlayer: 0,
  strengthenLimitPerGame: -1,
  fruitCardCount: 0,
};

const BOOLEAN_KEYS = [
  'knockGivesFinalTurn',
  'forbidRedundantDiscard',
  'bloomMustTouchNetwork',
  'rootsScore',
  'allowStrengthen',
  'fruitRootCountsAsTouch',
  'fruitUsesSprout',
  'strengthTiebreak',
  'startingPlayerLottery',
  'rotEnabled',
  'knockEnabled',
  'reshuffleDiscard',
  'deckFinalTurns',
  'expandedBloom',
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

  const deckSize = SUITS.length * (c.maxRank - MIN_RANK + 1) * c.copiesPerCard + c.fruitCardCount;
  // Two hands, a starting discard, and at least one card left to draw.
  if (deckSize < 2 * c.handSize + 2) {
    throw new ConfigError('DECK_TOO_SMALL', `${deckSize} cards cannot deal two hands of ${c.handSize}, a discard, and leave a card to draw`);
  }

  // Lab: a board of any shape brings its own cells, terrain and homes
  if (c.board !== null) {
    const b = c.board as unknown;
    const keys = (x: unknown) => Array.isArray(x) && x.every((k) => typeof k === 'string' && /^-?\d+,-?\d+$/.test(k));
    const ok = typeof b === 'object' && b !== null && keys((b as { cells: unknown }).cells) && keys((b as { rock: unknown }).rock) && keys((b as { gold: unknown }).gold) && keys((b as { homes: unknown }).homes);
    if (!ok || c.board.cells.length < 2 || c.board.homes.length !== 2) throw new ConfigError('INVALID_BOARD', 'board must list cells, rock, gold and two homes');
    const cells = new Set(c.board.cells);
    const [h0, h1] = c.board.homes;
    if (!cells.has(h0) || !cells.has(h1) || h0 === h1) throw new ConfigError('INVALID_BOARD', 'both homes must be different board cells');
    if ([...c.board.rock, ...c.board.gold].some((k) => !cells.has(k) || k === h0 || k === h1)) throw new ConfigError('INVALID_BOARD', 'rock and gold must be board cells, never a home');
    return c;
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
