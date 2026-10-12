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
export const CORS_ALLOWED_HEADERS =
  'authorization, content-type, x-futasaku-client-version, x-futasaku-rules-version';

export const CORS_ALLOWED_METHODS = 'GET, POST, PATCH, OPTIONS';

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

/** A 204 CORS preflight response for `origin`. */
export const corsPreflight = (origin: string): Response =>
  new Response(null, { status: 204, headers: corsHeaders(origin) });
