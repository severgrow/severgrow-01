// Stable error codes for live duels. They ride on the shared ApiError so the existing HTTP layer
// turns them into `{ ok:false, code, message }` with the right status, without touching errors.ts.
import { ApiError } from '../errors.js';

export type LiveErrorCode =
  | 'BUSY_LIVE'
  | 'BUSY'
  | 'NOT_AVAILABLE'
  | 'OFFLINE'
  | 'COOLDOWN'
  | 'TOO_MANY_PENDING'
  | 'RATE_LIMITED'
  | 'CHALLENGE_NOT_FOUND'
  | 'CHALLENGE_CLOSED'
  | 'NOT_LIVE'
  | 'MATCH_NOT_ACTIVE'
  | 'TOO_MANY_MATCHES';

const STATUS: Record<LiveErrorCode, number> = {
  BUSY_LIVE: 409,
  BUSY: 409,
  NOT_AVAILABLE: 409,
  OFFLINE: 409,
  COOLDOWN: 429,
  TOO_MANY_PENDING: 409,
  RATE_LIMITED: 429,
  CHALLENGE_NOT_FOUND: 404,
  CHALLENGE_CLOSED: 409,
  NOT_LIVE: 409,
  MATCH_NOT_ACTIVE: 409,
  TOO_MANY_MATCHES: 409,
};

/** Player-safe default messages (no ids, no hidden information). */
export const LIVE_MESSAGES: Record<LiveErrorCode, string> = {
  BUSY_LIVE: 'In a live game.',
  BUSY: 'Busy right now.',
  NOT_AVAILABLE: 'Not available for live games.',
  OFFLINE: 'Not online right now.',
  COOLDOWN: 'You left live play recently. Try again a little later.',
  TOO_MANY_PENDING: 'A challenge is already waiting in this match.',
  RATE_LIMITED: 'Too many challenges. Try again later.',
  CHALLENGE_NOT_FOUND: 'That challenge is gone.',
  CHALLENGE_CLOSED: 'That challenge is no longer open.',
  NOT_LIVE: 'This match is not live.',
  MATCH_NOT_ACTIVE: 'This match is not in play.',
  TOO_MANY_MATCHES: 'Finish or leave a match before starting another.',
};

export class LiveError extends ApiError {
  constructor(code: LiveErrorCode, message: string = LIVE_MESSAGES[code]) {
    super('INVALID_REQUEST', message);
    Object.defineProperty(this, 'code', { value: code, enumerable: true });
    Object.defineProperty(this, 'status', { value: STATUS[code], enumerable: true });
  }
}

export const isLiveError = (e: unknown, code?: LiveErrorCode): boolean =>
  e instanceof LiveError && (code === undefined || (e.code as string) === code);
