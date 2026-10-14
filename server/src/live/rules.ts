// Live duels — the pure rules (no I/O, no clock of their own). Every decision about who may
// challenge and what a timeout does to strikes lives here and is tested with a fake clock.
import type { Player } from '../../../src/engine/index.js';
import type { LiveConfig } from './config.js';
import type { LiveErrorCode } from './errors.js';
import type { Challenge, LiveMatch, LivePlayer } from './types.js';

/** Presence is "Online" only while a heartbeat is fresh. */
export const presenceFresh = (p: LivePlayer, now: number, config: LiveConfig): boolean =>
  p.presence !== null && p.presenceAt !== null && now - p.presenceAt <= config.presenceStaleMs;

/** The coarse word the opponent may see: online / busy (tutorial) / offline. */
export const presenceWord = (p: LivePlayer, now: number, config: LiveConfig): 'online' | 'busy' | 'offline' => {
  if (!presenceFresh(p, now, config)) return 'offline';
  return p.presence === 'tutorial' ? 'busy' : 'online';
};

/** A pending challenge past its expiry is expired, whatever the row still says. */
export const effectiveStatus = (c: Challenge, now: number): Challenge['status'] =>
  c.status === 'pending' && now > c.expiresAt ? 'expired' : c.status;

/**
 * Why `from` may not challenge `to` in this match right now, or null when allowed.
 * `pending` are the match's open challenges; `sentRecently` are this sender's challenges in this
 * match inside the decline window. A pending challenge FROM `to` is not a block (the caller turns
 * a mutual challenge into an accept).
 */
export const challengeBlock = (input: {
  now: number;
  config: LiveConfig;
  kind: 'live' | 'rematch';
  matchStatus: 'waiting' | 'active' | 'finished';
  live: LiveMatch;
  from: LivePlayer;
  to: LivePlayer;
  pending: readonly Challenge[];
  sentRecently: readonly Challenge[];
}): LiveErrorCode | null => {
  const { now, config } = input;
  if (input.kind === 'live' && input.matchStatus !== 'active') return 'MATCH_NOT_ACTIVE';
  if (input.kind === 'rematch' && (input.matchStatus !== 'finished' || input.live.endedReason !== 'finished')) {
    return 'MATCH_NOT_ACTIVE';
  }
  if (input.from.liveMatchId !== null || input.to.liveMatchId !== null || input.live.liveSince !== null) return 'BUSY_LIVE';
  if (!input.to.challengesEnabled) return 'NOT_AVAILABLE';
  if (!presenceFresh(input.to, now, config)) return 'OFFLINE';
  if (input.to.presence === 'tutorial') return 'BUSY';
  const open = input.pending.filter((c) => effectiveStatus(c, now) === 'pending');
  if (open.some((c) => c.fromPlayer === input.from.playerId)) return 'TOO_MANY_PENDING';
  // A pending challenge from the other player is a mutual challenge: allowed (it becomes an accept).
  if (open.some((c) => c.fromPlayer !== input.to.playerId)) return 'TOO_MANY_PENDING';
  const declined = input.sentRecently.filter((c) => c.status === 'declined');
  const lastDecline = declined.reduce<number>((m, c) => Math.max(m, c.respondedAt ?? c.createdAt), -Infinity);
  if (now - lastDecline < config.notNowCooldownMs) return 'RATE_LIMITED';
  const inWindow = declined.filter((c) => now - (c.respondedAt ?? c.createdAt) < config.declineWindowMs);
  if (inWindow.length >= config.declineLimit) return 'RATE_LIMITED';
  return null;
};

/** The live record when a session starts (end info cleared). */
export const startLive = (live: LiveMatch, now: number, limitMs: number, normalTimeoutMs: number): LiveMatch => ({
  ...live,
  liveSince: now,
  limitMs,
  leftBy: null,
  tailRev: null,
  autoplayRev: null,
  normalTimeoutMs,
  endedReason: null,
  endedAt: null,
  endedBySeat: null,
});

/** The live record when a session ends. Keeps `limitMs` so the end window can say what it was. */
export const endLive = (
  live: LiveMatch,
  now: number,
  reason: 'finished' | 'left' | 'strikes',
  bySeat: Player | null,
): LiveMatch => ({
  ...live,
  liveSince: null,
  endedReason: reason,
  endedAt: now,
  endedBySeat: bySeat,
  ...(reason === 'finished' ? { tailRev: null } : {}),
});
