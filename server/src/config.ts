// Server configuration. Times are epoch milliseconds and are always passed in by the caller
// (the service owns the clock), so the core logic stays testable and deterministic.
import { CURRENT_RULES_VERSION } from '../../src/engine/index.js';

export type ServerConfig = {
  /** The rules version every new match is created under. Immutable once a match exists. */
  rulesVersion: string;
  /** Hard cap on committed moves per match (guards storage and replay cost). */
  maxMovesPerMatch: number;
  /** Private invite-code length (Crockford base32, unambiguous alphabet). */
  inviteCodeLength: number;
  /** Maximum decoded JSON request body size in bytes. */
  maxBodyBytes: number;
  /** Open (waiting/active) matches a single player may own at once. */
  maxOpenMatchesPerPlayer: number;
  /**
   * Allowed browser origin for CORS, or '*' for local development only.
   * Production (Edge / deployed API) must be locked to https://severgrow.github.io
   * — the origin has no path (P-17).
   */
  corsOrigin: string;
  /** Per-match turn clock snapshot default (24h prod; tests pass seconds). */
  turnTimeoutMs: number;
  /** Waiting-for-a-friend matches expire after this many ms (48h). */
  waitingExpireMs: number;
  /** One-time device link codes expire after this many ms (10 min). */
  linkCodeTtlMs: number;
  /** Minimum client protocol version the API accepts. */
  minClientVersion: string;
  /** Actions allowed in one atomic batch submit. */
  maxBatchActions: number;
  /** Rate limits (Postgres-backed). */
  rateLimits: {
    guestPerIpPerHour: number;
    joinPerPlayerPerHour: number;
    joinPerIpPerHour: number;
    linkCodePerPlayerPerHour: number;
    linkRedeemPerIpPerHour: number;
    actionsPerPlayerPerMinute: number;
    sweepPerIpPerHour: number;
  };
};

/** The only production browser origin that may call the duel API. */
export const PRODUCTION_CORS_ORIGIN = 'https://severgrow.github.io';

const DAY_MS = 24 * 60 * 60 * 1000;

const envInt = (name: string, fallback: number): number => {
  const raw = (typeof process !== 'undefined' ? process.env?.[name] : undefined)?.trim();
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
};

export const DEFAULT_SERVER_CONFIG: ServerConfig = Object.freeze({
  rulesVersion: CURRENT_RULES_VERSION,
  maxMovesPerMatch: 10_000,
  inviteCodeLength: 8,
  maxBodyBytes: 64 * 1024,
  corsOrigin: '*',
  maxOpenMatchesPerPlayer: 10,
  turnTimeoutMs: envInt('TURN_TIMEOUT_MS', DAY_MS),
  waitingExpireMs: 48 * 60 * 60 * 1000,
  linkCodeTtlMs: 10 * 60 * 1000,
  minClientVersion: '0.5.0',
  maxBatchActions: 12,
  rateLimits: Object.freeze({
    guestPerIpPerHour: 30,
    joinPerPlayerPerHour: 60,
    joinPerIpPerHour: 60,
    linkCodePerPlayerPerHour: 10,
    linkRedeemPerIpPerHour: 20,
    actionsPerPlayerPerMinute: 120,
    sweepPerIpPerHour: 30,
  }),
});

/** True when `client` is at least `minimum` (simple dotted numeric compare). */
export const clientVersionOk = (client: string, minimum: string): boolean => {
  const parse = (v: string): number[] =>
    v
      .trim()
      .split('.')
      .map((p) => {
        const n = Number(p.replace(/[^0-9]/g, ''));
        return Number.isFinite(n) ? n : 0;
      });
  const a = parse(client);
  const b = parse(minimum);
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    if (av > bv) return true;
    if (av < bv) return false;
  }
  return true;
};
