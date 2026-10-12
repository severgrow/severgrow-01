// API errors carry a stable machine code (used by tests and clients) and an HTTP status.
// Messages are safe to return to the caller: they never contain tokens, seats, hidden cards
// or internal details.

export type ApiErrorCode =
  // authentication / authorization
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  // request shape
  | 'INVALID_REQUEST'
  | 'NOT_FOUND'
  // match lifecycle
  | 'MATCH_NOT_FOUND'
  | 'MATCH_FULL'
  | 'MATCH_FINISHED'
  | 'MATCH_NOT_ACTIVE'
  | 'MATCH_EXPIRED'
  | 'NOT_A_PARTICIPANT'
  | 'TOO_MANY_MATCHES'
  // concurrency / idempotency
  | 'STALE_REVISION'
  | 'REQUEST_ID_CONFLICT'
  | 'TOO_MANY_MOVES'
  // rules / clock
  | 'NOT_YOUR_TURN'
  | 'ILLEGAL_ACTION'
  | 'TIMED_OUT'
  // abuse / version
  | 'RATE_LIMITED'
  | 'CLIENT_TOO_OLD'
  | 'UNSUPPORTED_RULES'
  // everything else
  | 'INTERNAL';

const STATUS: Record<ApiErrorCode, number> = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  INVALID_REQUEST: 400,
  NOT_FOUND: 404,
  MATCH_NOT_FOUND: 404,
  MATCH_FULL: 409,
  MATCH_FINISHED: 409,
  MATCH_NOT_ACTIVE: 409,
  MATCH_EXPIRED: 409,
  NOT_A_PARTICIPANT: 403,
  TOO_MANY_MATCHES: 409,
  STALE_REVISION: 409,
  REQUEST_ID_CONFLICT: 409,
  TOO_MANY_MOVES: 409,
  NOT_YOUR_TURN: 409,
  ILLEGAL_ACTION: 422,
  TIMED_OUT: 409,
  RATE_LIMITED: 429,
  CLIENT_TOO_OLD: 426,
  UNSUPPORTED_RULES: 409,
  INTERNAL: 500,
};

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;

  constructor(code: ApiErrorCode, message: string) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = STATUS[code];
  }
}

/** Maps engine codes to API codes: the server never leaks an engine code as an HTTP error name. */
export const engineCodeToApi = (engineCode: string): { code: ApiErrorCode; message: string } =>
  engineCode === 'NOT_ACTOR'
    ? { code: 'NOT_YOUR_TURN', message: 'It is not your turn.' }
    : { code: 'ILLEGAL_ACTION', message: 'That move is not legal right now.' };
