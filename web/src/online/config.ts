// Public online config (no secrets). API base comes from the web build Variable.

declare const __CHANNEL__: string;

/** Deployed duel API base URL, or null when this build has no online endpoint. */
export const duelApiUrl = (): string | null => {
  const env = (import.meta as { env?: Record<string, string | undefined> }).env;
  const raw = env?.VITE_DUEL_API_URL?.trim();
  if (!raw) return null;
  return raw.replace(/\/+$/, '');
};

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
 * How long a parked Find-opponent search waits before offering the honest computer fallback.
 * Defaults to the product three-minute window; a build may override it (VITE_PARKED_OFFER_MS),
 * which the e2e walk uses so it never has to wait three real minutes.
 */
export const parkedOfferMs = (): number => {
  const env = (import.meta as { env?: Record<string, string | undefined> }).env;
  const raw = Number(env?.VITE_PARKED_OFFER_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : 3 * 60 * 1000;
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
