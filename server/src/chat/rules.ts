import { ApiError } from '../errors.js';
import { QUICK_PHRASES, type ChatContent } from './types.js';
export const CHAT_PAGE_SIZE = 40;
export const CHAT_MAX_LENGTH = 280;
export const CHAT_MATCH_LIMIT = 2000;
export const CHAT_DAILY_LIMIT = 200;
export const CHAT_RETENTION_MS = 90 * 86400_000;
export const validId = (v: unknown): v is string =>
  typeof v === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
export const contentFrom = (body: Record<string, unknown>): ChatContent => {
  if (body.phrase != null) {
    if (body.text != null || !QUICK_PHRASES.includes(body.phrase as never))
      throw new ApiError('INVALID_REQUEST', 'Invalid quick phrase.');
    return {
      text: null,
      phrase: body.phrase as ChatContent['phrase'] & string,
    };
  }
  if (typeof body.text !== 'string')
    throw new ApiError('INVALID_REQUEST', 'Message text is required.');
  const text = body.text.normalize('NFC').trim();
  // One compact plain-text line. Reject control/bidi overrides; Unicode letters and emoji are fine.
  if (
    !text ||
    [...text].length > CHAT_MAX_LENGTH ||
    /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u.test(text)
  )
    throw new ApiError('INVALID_REQUEST', 'Use 1–280 characters on one line.');
  return { text, phrase: null };
};
export const assertSendAllowed = (
  ctx: {
    status: string;
    phase: string;
    actor: number;
    seat: number;
    turnRevision: number;
    deadline: number | null;
    blocked: boolean;
  },
  expected: number,
  now: number,
): void => {
  if (ctx.blocked) throw new ApiError('FORBIDDEN', 'Chat is blocked.');
  if (ctx.status !== 'active' || ctx.phase === 'GAME_OVER')
    throw new ApiError('MATCH_NOT_ACTIVE', 'This chat is read-only.');
  // A due clock is deliberately refused, not advanced here: only the existing live/async
  // authority may spend grace, auto-play or finish a match. Chat never changes timers or state.
  if (
    ctx.actor === ctx.seat ||
    ctx.turnRevision !== expected ||
    (ctx.deadline != null && ctx.deadline <= now)
  )
    throw new ApiError(
      'STALE_REVISION',
      'Chat is available on the opponent’s turn.',
    );
};
