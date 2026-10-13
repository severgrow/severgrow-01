// Server configuration. Times are epoch milliseconds and are always passed in by the caller
// (the service owns the clock), so the core logic stays testable and deterministic.
import { CURRENT_RULES_VERSION } from '../../src/engine/index.js';
import { INVITE_CODE_LENGTH } from '../../src/invite-code.js';

export type ServerConfig = {
  /** The rules version every new match is created under. Immutable once a match exists. */
  rulesVersion: string;
  /** Hard cap on committed moves per match (guards storage and replay cost). */
  maxMovesPerMatch: number;
  /**
   * Private invite-code length (Crockford base32, unambiguous alphabet).
   *
   * The value lives in ONE place — `INVITE_CODE_LENGTH` in `src/invite-code.ts` — and is re-exported
   * here so the service keeps reading it from its config. The player-facing format hint
   * (`ONLINE.errCodeFormat` in `src/strings.ts`) derives from the same constant, so the two can
   * never drift.
   *
   * Codes are PERMANENT: the unique index on `matches.invite_code` spans every match ever created
   * (a finished duel never releases its code), so the usable pool only shrinks as the game grows —
   * this is why 4 characters is only safe together with the bounded collision retry in
   * `MatchService` (`createMatch` and the parked Find-Opponent path), not on its own. The join
   * endpoint is also rate-limited per player AND per IP (P-13). To lengthen the codes later, change
   * `INVITE_CODE_LENGTH` in `src/invite-code.ts` — the one line both layers read.
   */
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
  /**
   * Grace periods each player gets per match before a missed deadline loses. Default 1: the first
   * timeout warns and extends, the next loses. 0 disables grace (the old behaviour).
   */
  gracePeriodsPerPlayer: number;
  /** How far one grace extends the deadline. Defaults to `TURN_TIMEOUT_MS` (one full turn window). */
  graceExtensionMs: number;
  /** Waiting-for-a-friend matches expire after this many ms (48h). */
  waitingExpireMs: number;
  /** One-time device link codes expire after this many ms (10 min). */
  linkCodeTtlMs: number;
  /** Minimum client protocol version the API accepts. */
  minClientVersion: string;
  /** Actions allowed in one atomic batch submit. */
  maxBatchActions: number;
  /**
   * Optional shared secret a cron/CI caller presents as `x-futasaku-cron` on `/v1/sweep`.
   * When set and matched, the sweep uses a dedicated bucket so player per-IP budgets never block
   * routine housekeeping. Unset (default) means every sweep uses the normal per-IP bucket.
   * Set with the `SWEEP_CRON_TOKEN` environment variable / Edge secret.
   */
  sweepCronToken?: string | null;
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

/** Reads an environment variable from Node (process.env) or Deno (Deno.env), without logging it. */
const readEnv = (name: string): string | undefined => {
  if (typeof process !== 'undefined' && process.env) {
    const fromNode = process.env[name];
    if (fromNode !== undefined) return fromNode;
  }
  const deno = (globalThis as { Deno?: { env?: { get?: (key: string) => string | undefined } } }).Deno;
  return deno?.env?.get?.(name);
};

const envInt = (name: string, fallback: number): number => {
  const raw = readEnv(name)?.trim();
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
};

/** Like `envInt`, but 0 is a meaningful value (e.g. disabling timeout grace). */
const envCount = (name: string, fallback: number): number => {
  const raw = readEnv(name)?.trim();
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : fallback;
};

const envStr = (name: string): string | null => {
  const raw = readEnv(name)?.trim();
  return raw && raw.length > 0 ? raw : null;
};

export const DEFAULT_SERVER_CONFIG: ServerConfig = Object.freeze({
  rulesVersion: CURRENT_RULES_VERSION,
  maxMovesPerMatch: 10_000,
  inviteCodeLength: INVITE_CODE_LENGTH,
  maxBodyBytes: 64 * 1024,
  corsOrigin: '*',
  maxOpenMatchesPerPlayer: 10,
  turnTimeoutMs: envInt('TURN_TIMEOUT_MS', DAY_MS),
  // One grace per player per match by default; the extension is one full turn window.
  gracePeriodsPerPlayer: envCount('TURN_GRACE_PER_PLAYER', 1),
  graceExtensionMs: envInt('TURN_GRACE_MS', envInt('TURN_TIMEOUT_MS', DAY_MS)),
  waitingExpireMs: 48 * 60 * 60 * 1000,
  linkCodeTtlMs: 10 * 60 * 1000,
  minClientVersion: '0.5.0',
  maxBatchActions: 12,
  sweepCronToken: envStr('SWEEP_CRON_TOKEN'),
  // Per-IP limits are deliberately generous: a household/cafe/office/carrier NAT shares one public
  // address, so tight per-IP budgets punished real players. The per-PLAYER limits (keyed by token)
  // are the real anti-abuse control because they cannot be shared between players. Every value is
  // overridable at runtime with the RATE_* environment variable named next to it.
  rateLimits: Object.freeze({
    guestPerIpPerHour: envInt('RATE_GUEST_PER_IP_PER_HOUR', 200),
    joinPerPlayerPerHour: envInt('RATE_JOIN_PER_PLAYER_PER_HOUR', 60),
    joinPerIpPerHour: envInt('RATE_JOIN_PER_IP_PER_HOUR', 400),
    linkCodePerPlayerPerHour: envInt('RATE_LINK_CODE_PER_PLAYER_PER_HOUR', 10),
    linkRedeemPerIpPerHour: envInt('RATE_LINK_REDEEM_PER_IP_PER_HOUR', 20),
    actionsPerPlayerPerMinute: envInt('RATE_ACTIONS_PER_PLAYER_PER_MINUTE', 120),
    sweepPerIpPerHour: envInt('RATE_SWEEP_PER_IP_PER_HOUR', 120),
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
