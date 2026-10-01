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

/** Thrown by `apply` for any illegal action. `code` is stable; the message is not. */
export class IllegalActionError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(`${code}: ${message}`);
    this.name = 'IllegalActionError';
    this.code = code;
  }
}
