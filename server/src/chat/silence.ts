// A SILENCED PLAYER (launch readiness, 2026-11-12). The owner can pause a player's chat from /admin
// (24 hours, 7 days, or for good). The time is stored on the player row (`chat_silenced_until`,
// migration 0025) and arrives with the authenticated player, so the check costs no extra read.
// A silenced player still plays every game; only sending chat (duel and Territory) is refused.
import { ApiError } from '../errors.js';
import type { PlayerRecord } from '../storage/types.js';

/** "For good": far enough that no clock reaches it, and still a safe integer for bigint. */
export const SILENCE_FOREVER = 8_640_000_000_000_000;

export const chatSilenced = (player: Pick<PlayerRecord, 'chatSilencedUntil'>, now: number): boolean =>
  typeof player.chatSilencedUntil === 'number' && now < player.chatSilencedUntil;

export const assertNotSilenced = (player: Pick<PlayerRecord, 'chatSilencedUntil'>, now: number): void => {
  if (chatSilenced(player, now)) throw new ApiError('FORBIDDEN', 'Chat is paused for your account.');
};
