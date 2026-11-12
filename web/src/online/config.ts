// Public online config (no secrets). API base comes from the web build Variable.

declare const __CHANNEL__: string;

/** The run-time env bag the bundler injects (`import.meta.env`). */
const buildEnv = (): Record<string, string | undefined> | undefined =>
  (import.meta as { env?: Record<string, string | undefined> }).env;

/**
 * The deployed duel API base, resolved from a build's env bag. Pure, so the resolution itself can be
 * pinned by a unit test (the built-bundle half is checked by `web/e2e/seeds-campaign-33.ts`).
 */
export const duelApiUrlFrom = (env: Record<string, string | undefined> | undefined): string | null => {
  const raw = env?.VITE_DUEL_API_URL?.trim();
  if (!raw) return null;
  return raw.replace(/\/+$/, '');
};

/** Deployed duel API base URL, or null when this build has no online endpoint. */
export const duelApiUrl = (): string | null => (artFrame() ? null : duelApiUrlFrom(buildEnv()));
/** The Art Lab's phone frame plays offline only (no guests, no presence, no traffic to the server). */
const artFrame = () => typeof location !== 'undefined' && /(^|[?&])artlab=1(&|$)/.test(location.search);

export const onlineBuildEnabled = (): boolean => duelApiUrl() !== null;

/**
 * Phase 7 Find Opponent — off by default; on when VITE_FIND_OPPONENT=1 or preview channel futa05.
 * Product futa04 builds keep this hidden.
 */
export const findOpponentEnabled = (): boolean => {
  const env = (import.meta as { env?: Record<string, string | undefined> }).env;
  if (env?.VITE_FIND_OPPONENT?.trim() === '1') return true;
  const channel = typeof __CHANNEL__ !== 'undefined' ? __CHANNEL__ : '';
  return channel === 'futa05';
};

/**
 * How long a parked Find-opponent search waits before offering a game against the computer.
 * Owner, 2026-11-08: 5 seconds (was three minutes); 2026-11-12, with the tiers (players here now for
 * the first 7 s, then open games, then your own open game): 12 seconds, after the tiers have run.
 * The search keeps running. A build may override it (VITE_PARKED_OFFER_MS); the e2e walk shortens it.
 */
export const PARKED_OFFER_MS = 12_000;
/** The first seconds of a search look only for players who are here now (server FIND_LIVE_WINDOW_MS). */
export const SEARCH_LIVE_MS = 7_000;
/** While the search screen is open, the page re-sends Find this often: "I am here" (the heartbeat). */
export const SEARCH_HEARTBEAT_MS = 4_000;
export const parkedOfferMs = (): number => {
  const env = (import.meta as { env?: Record<string, string | undefined> }).env;
  const raw = Number(env?.VITE_PARKED_OFFER_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : PARKED_OFFER_MS;
};

/** Public site base used in invite links (Pages). */
export const publicAppOrigin = (): string => {
  if (typeof location !== 'undefined' && location.origin) return location.origin + (location.pathname.replace(/\/+$/, '') || '');
  return 'https://severgrow.github.io/futa0.5';
};

/**
 * The AWS region to pin the Edge Function to, or null to let the platform pick the region closest
 * to the caller. The FUTASAKU database lives in `eu-west-1`, so pinning the function there removes
 * a cross-region hop on EVERY database round trip (measured: db.ms 162 -> 83, total 331 -> 269ms).
 * Only the project's own Supabase Edge URL is pinned; local/dev/test servers are left alone.
 * Override with VITE_DUEL_REGION (an empty string disables the pin).
 */
export const duelRegion = (): string | null => {
  const env = (import.meta as { env?: Record<string, string | undefined> }).env;
  const override = env?.VITE_DUEL_REGION;
  if (typeof override === 'string') return override.trim() || null;
  const api = duelApiUrl();
  if (!api) return null;
  try {
    const host = new URL(api).host;
    return host.endsWith('.supabase.co') ? 'eu-west-1' : null;
  } catch {
    return null;
  }
};
