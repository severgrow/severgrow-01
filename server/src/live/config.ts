// FUTASAKU live duels — server settings. Every value can be tuned with an environment variable /
// Edge secret of the same name, without a code change. Times are milliseconds.
//
// The one most people will tune is LIVE_TURN_MS (the per-turn clock, default 45 s).

export type LiveConfig = {
  /** Per-turn clock in live mode. */
  turnMs: number;
  /** Time the receiving player is given to watch the previous turn's replay before the clock runs. */
  replayAllowanceMs: number;
  /** Extra time for the current actor at the moment both players agree to go live. */
  entryAllowanceMs: number;
  /** Extra time on the leaver's current turn after "Leave live" (never more than this). */
  leaveGraceMs: number;
  /** How long a challenge waits for an answer. */
  challengeTtlMs: number;
  /** Presence older than this counts as offline. */
  presenceStaleMs: number;
  /** After a "Not now", the same sender must wait this long before challenging again. */
  notNowCooldownMs: number;
  /** After this many declines in one match... */
  declineLimit: number;
  /** ...no more challenges in that match for this long. */
  declineWindowMs: number;
  /** A leaver cannot challenge again for this long... */
  leaveCooldownMs: number;
  /** ...or this many of their own turns, whichever comes first. */
  leaveCooldownTurns: number;
  /** Consecutive timeouts by one player that end live mode. */
  strikesToEnd: number;
  /** Per-player hourly cap on challenges sent (abuse guard). */
  challengesPerPlayerPerHour: number;
  /** Per-player per-minute cap on presence heartbeats. */
  presencePerPlayerPerMinute: number;
};

const readEnv = (name: string): string | undefined => {
  if (typeof process !== 'undefined' && process.env) {
    const v = process.env[name];
    if (v !== undefined) return v;
  }
  const deno = (globalThis as { Deno?: { env?: { get?: (key: string) => string | undefined } } }).Deno;
  try {
    return deno?.env?.get?.(name);
  } catch {
    return undefined;
  }
};

const envMs = (name: string, fallback: number): number => {
  const raw = readEnv(name)?.trim();
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
};

const SECOND = 1000;
const MINUTE = 60 * SECOND;

export const liveConfigFromEnv = (): LiveConfig => ({
  turnMs: envMs('LIVE_TURN_MS', 45 * SECOND),
  replayAllowanceMs: envMs('LIVE_REPLAY_ALLOWANCE_MS', 6 * SECOND),
  entryAllowanceMs: envMs('LIVE_ENTRY_ALLOWANCE_MS', 15 * SECOND),
  leaveGraceMs: envMs('LIVE_LEAVE_GRACE_MS', 60 * SECOND),
  challengeTtlMs: envMs('LIVE_CHALLENGE_TTL_MS', 45 * SECOND),
  presenceStaleMs: envMs('LIVE_PRESENCE_STALE_MS', 45 * SECOND),
  notNowCooldownMs: envMs('LIVE_NOT_NOW_COOLDOWN_MS', 2 * MINUTE),
  declineLimit: envMs('LIVE_DECLINE_LIMIT', 3),
  declineWindowMs: envMs('LIVE_DECLINE_WINDOW_MS', 30 * MINUTE),
  leaveCooldownMs: envMs('LIVE_LEAVE_COOLDOWN_MS', 10 * MINUTE),
  leaveCooldownTurns: envMs('LIVE_LEAVE_COOLDOWN_TURNS', 3),
  strikesToEnd: envMs('LIVE_STRIKES_TO_END', 2),
  challengesPerPlayerPerHour: envMs('LIVE_CHALLENGES_PER_PLAYER_PER_HOUR', 30),
  presencePerPlayerPerMinute: envMs('LIVE_PRESENCE_PER_PLAYER_PER_MINUTE', 12),
});

export const DEFAULT_LIVE_CONFIG: LiveConfig = Object.freeze(liveConfigFromEnv());
