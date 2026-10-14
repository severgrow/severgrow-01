// Single source of truth for CORS on the duel API.
//
// The browser sends two custom headers on every duel request
// (`x-futasaku-client-version`, `x-futasaku-rules-version`), plus
// `authorization` and `content-type`. Because `content-type: application/json`
// is not CORS-safelisted, the browser always sends a preflight OPTIONS request
// and will BLOCK the real request unless these exact headers appear in
// `access-control-allow-headers`. Keep every OPTIONS path (Node http adapter and
// the Supabase Edge entry) on this one list — a divergent list silently breaks
// guest creation from the live site (P-17).
import { PRODUCTION_CORS_ORIGIN } from './config.js';

export const CORS_ALLOWED_HEADERS =
  'authorization, content-type, x-futasaku-client-version, x-futasaku-rules-version';

export const CORS_ALLOWED_METHODS = 'GET, POST, PATCH, OPTIONS';

/**
 * The origin to put in `access-control-allow-origin` for a request that arrived with
 * `requestOrigin`.
 *
 * - `'*'` in the allow-list is the LOCAL-DEVELOPMENT wildcard and answers `*` to everyone.
 * - An allow-listed request origin is ECHOED BACK, so the site can be served from more than one
 *   front-end domain at once — the custom-domain move keeps both the old GitHub Pages origin and
 *   the new domain working while the switch happens.
 * - Anything else — a foreign origin, or no `Origin` header at all — gets the FIRST configured
 *   origin, never an echo. Echoing an unlisted origin would let any website in the world drive the
 *   duel API with a player's stored token, so this refusal is deliberate (P-17).
 */
export const corsOriginFor = (allowed: readonly string[], requestOrigin: string | null): string => {
  if (allowed.includes('*')) return '*';
  if (requestOrigin !== null && allowed.includes(requestOrigin)) return requestOrigin;
  return allowed[0] ?? PRODUCTION_CORS_ORIGIN;
};

export const corsHeaders = (origin: string): Record<string, string> => {
  const headers: Record<string, string> = {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': CORS_ALLOWED_METHODS,
    'access-control-allow-headers': CORS_ALLOWED_HEADERS,
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  };
  if (origin !== '*') headers.vary = 'origin';
  return headers;
};

/** The shared CORS headers for a request, resolving the allow-list per request. */
export const corsHeadersForRequest = (allowed: readonly string[], request: Request): Record<string, string> =>
  corsHeaders(corsOriginFor(allowed, request.headers.get('origin')));

/** A 204 CORS preflight response for `origin`. */
export const corsPreflight = (origin: string): Response =>
  new Response(null, { status: 204, headers: corsHeaders(origin) });
