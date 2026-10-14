// Server configuration. Times are epoch milliseconds and are always passed in by the caller
// (the service owns the clock), so the core logic stays testable and deterministic.
import { CURRENT_RULES_VERSION } from '../../src/engine/index.js';
import { INVITE_CODE_LENGTH, LINK_CODE_LENGTH } from '../../src/invite-code.js';

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
  /**
   * One-time DEVICE LINK-code length (Crockford base32, unambiguous alphabet).
   *
   * Deliberately a SEPARATE value from `inviteCodeLength` — redeeming a link code mints a new token
   * for another player (account takeover), while a match invite code only joins a duel. The value
   * lives in ONE place — `LINK_CODE_LENGTH` in `src/invite-code.ts` — and is re-exported here so the
   * service keeps reading it from its config. The player-facing hint (`ONLINE.linkCodeHelp` in
   * `src/strings.ts`) derives from the same constant. Never couple this to `inviteCodeLength`.
   */
  linkCodeLength: number;
  /** Maximum decoded JSON request body size in bytes. */
  maxBodyBytes: number;
  /** Open (waiting/active) matches a single player may own at once. */
  maxOpenMatchesPerPlayer: number;
  /**
   * Browser origins allowed to call the duel API. A LIST because the site can legitimately be
   * reachable at more than one front-end origin at a time (the move to a custom domain keeps
   * both `https://severgrow.github.io` and the new domain working during the switch). `'*'` is
   * the local-development wildcard and must never be used in production.
   *
   * Every entry is an ORIGIN: scheme + host + optional port, never a path (P-17). See
   * {@link productionCorsOrigins} for the production default and the `CORS_ORIGINS` override.
   */
  corsOrigins: readonly string[];
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

/**
 * The GitHub Pages origin that serves the FUTASAKU site today. It stays in the allow-list for as
 * long as GitHub Pages hosts the site — including after a custom domain is pointed at it — so the
 * existing `severgrow.github.io` link never breaks.
 */
export const PRODUCTION_CORS_ORIGIN = 'https://severgrow.github.io';

/**
 * The custom domain FUTASAKU is reached at (Cloudflare DNS → the same GitHub Pages site), and the
 * bare/apex variant. Both are allowed: owners routinely end up with `www.` and the bare domain both
 * resolving, and a visitor landing on the one that was not allow-listed would get every API call
 * blocked. An ORIGIN has no path, so the site's `/futa0.5/` path never appears here.
 */
export const CUSTOM_DOMAIN_CORS_ORIGINS: readonly string[] = Object.freeze([
  'https://www.futasaku.com',
  'https://futasaku.com',
]);

/**
 * The production CORS allow-list used when `CORS_ORIGINS` is not set: the long-standing GitHub Pages
 * origin plus the custom domain, so the site works at the old and the new address at once and a
 * fresh deploy needs NO secret set.
 *
 * `CORS_ORIGINS` (comma-separated ORIGINS) still overrides this whole list when it is set — use it
 * to add or remove a domain later without a rebuild:
 *   CORS_ORIGINS=https://severgrow.github.io,https://www.futasaku.com,https://futasaku.com
 * Format: scheme + host + optional port, NO path, NO trailing slash. See docs/CUSTOM-DOMAIN.md.
 */
export const DEFAULT_PRODUCTION_CORS_ORIGINS: readonly string[] = Object.freeze([
  PRODUCTION_CORS_ORIGIN,
  ...CUSTOM_DOMAIN_CORS_ORIGINS,
]);

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

/**
 * One entry of a CORS allow-list, normalised to an origin, or null when it can never match.
 *
 * A browser's `Origin` header is scheme + host + optional port with NO path, so an entry carrying a
 * path (`https://game.example.com/futa0.5`) or a trailing slash can never match a real request and
 * would silently lock the whole site out. Such entries are dropped here rather than stored.
 */
const normalizeCorsOrigin = (entry: string): string | null => {
  const value = entry.trim().replace(/\/+$/, '');
  if (value === '') return null;
  if (value === '*') return '*';
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
  if (parsed.pathname !== '/' || parsed.search !== '' || parsed.hash !== '') return null;
  return parsed.origin;
};

/** Parse a comma-separated CORS allow-list. Blank and unusable entries are dropped. */
export const parseCorsOriginList = (raw: string | null | undefined): string[] => {
  if (!raw) return [];
  return raw
    .split(',')
    .map((entry) => normalizeCorsOrigin(entry))
    .filter((origin): origin is string => origin !== null);
};

/**
 * The effective production allow-list.
 *
 * `CORS_ORIGINS` (comma-separated) wins when it parses to at least one usable origin; otherwise the
 * built-in {@link DEFAULT_PRODUCTION_CORS_ORIGINS} applies. The dev wildcard is filtered out here so
 * a stray `CORS_ORIGINS=*` can never open production to every website.
 *
 * Example Edge secret / env var:
 *   CORS_ORIGINS=https://severgrow.github.io,https://game.example.com
 */
export const productionCorsOrigins = (): string[] => {
  const fromEnv = parseCorsOriginList(envStr('CORS_ORIGINS')).filter((origin) => origin !== '*');
  return fromEnv.length > 0 ? fromEnv : [...DEFAULT_PRODUCTION_CORS_ORIGINS];
};

/**
 * The CORS override for the Node dev/deployed server, read from `CORS_ORIGINS` (list) or the older
 * `CORS_ORIGIN` (single value, kept working for the documented dev commands). Returns nothing when
 * neither is set, so the config keeps its local wildcard default.
 */
export const corsOriginsFromEnv = (): { corsOrigins?: string[] } => {
  const list = parseCorsOriginList(envStr('CORS_ORIGINS') ?? envStr('CORS_ORIGIN'));
  return list.length > 0 ? { corsOrigins: list } : {};
};

export const DEFAULT_SERVER_CONFIG: ServerConfig = Object.freeze({
  rulesVersion: CURRENT_RULES_VERSION,
  maxMovesPerMatch: 10_000,
  inviteCodeLength: INVITE_CODE_LENGTH,
  linkCodeLength: LINK_CODE_LENGTH,
  maxBodyBytes: 64 * 1024,
  corsOrigins: ['*'],
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
