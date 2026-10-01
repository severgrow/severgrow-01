export type ConfigErrorCode =
  | 'UNKNOWN_KEY'
  | 'INVALID_NUMBER'
  | 'INVALID_BOOLEAN'
  | 'INVALID_ROOT_STYLE'
  | 'INVALID_SEED'
  | 'RICH_COUNT_NOT_ODD'
  | 'ROCK_COUNT_NOT_EVEN'
  | 'HAND_SIZE_TOO_SMALL'
  | 'DECK_TOO_SMALL'
  | 'ROOT_OFF_BOARD'
  | 'TERRAIN_INFEASIBLE'
  | 'NOT_IMPLEMENTED';

/** Thrown by `newGame` / `resolveConfig` for invalid configuration or seed. */
export class ConfigError extends Error {
  readonly code: ConfigErrorCode;
  constructor(code: ConfigErrorCode, message: string) {
    super(`${code}: ${message}`);
    this.name = 'ConfigError';
    this.code = code;
  }
}

export type IllegalActionCode =
  // malformed input
  | 'MALFORMED_ACTION'
  | 'INVALID_COORD'
  | 'INVALID_DIR'
  // cards
  | 'CARD_NOT_IN_HAND'
  | 'DUPLICATE_CARD'
  | 'RUN_TOO_SHORT'
  | 'RUN_MIXED_SUITS'
  | 'RUN_NOT_CONSECUTIVE'
  | 'SET_WRONG_SIZE'
  | 'SET_MIXED_RANKS'
  | 'SET_DUPLICATE_SUIT'
  // placement
  | 'OFF_BOARD'
  | 'ROCK'
  | 'OWN_TILE'
  | 'ROOT_IMMUNE'
  | 'NOT_STRONGER'
  | 'NOT_ADJACENT'
  | 'HEX_COUNT_MISMATCH'
  | 'DUPLICATE_HEX'
  | 'HEXES_NOT_CONNECTED'
  // fruit
  | 'FRUIT_EXHAUSTED'
  | 'FRUIT_SACRIFICE_COUNT'
  | 'FRUIT_SACRIFICE_NOT_OWN'
  | 'FRUIT_SACRIFICE_ROOT'
  | 'FRUIT_SACRIFICE_NOT_CONNECTED'
  | 'FRUIT_TARGET_NOT_ENEMY'
  | 'FRUIT_TARGET_ROOT'
  | 'FRUIT_TARGET_NOT_ADJACENT';

/** Thrown by `apply` for any illegal action. `code` is stable; the message is not. */
export class IllegalActionError extends Error {
  readonly code: IllegalActionCode;
  constructor(code: IllegalActionCode, message: string) {
    super(`${code}: ${message}`);
    this.name = 'IllegalActionError';
    this.code = code;
  }
}
