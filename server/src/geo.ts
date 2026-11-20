// WHERE A PLAYER'S REQUEST CAME FROM (owner, 2026-11-20: "country flag should be shown on each
// player profile publicly in the planet or elsewhere tapped. just like in the player profile on main
// menu").
//
// The OWN profile already derives a flag from the device (web/src/logic/country.ts). A VISITOR cannot
// do that: their browser knows their own zone, not the other player's. So the server records the
// country ONCE, at sign-in, from the request's geo header, and every later profile read serves the
// stored value. That is one column of data per player, never a per-viewer lookup, never a third-party
// call.
//
// WHY THESE HEADERS. The API runs as a Supabase Edge Function behind Cloudflare, which is the same
// edge `client-ip.ts` already trusts for `cf-connecting-ip` (Cloudflare rejects forged cf-* values at
// the edge). `cf-ipcountry` is that edge's own answer; the two fallbacks are here for the same
// reasoning if the deployment front changes. Nothing else is consulted.
//
// HONESTY. An absent, malformed or non-ISO answer is `null` — the player then simply has no flag
// (web/src/logic/country.ts renders NOTHING, never a guessed country). Cloudflare's own "unknown"
// markers ('XX' for an unplaceable address, 'T1' for Tor) are not countries and are rejected.
import { normalizeCountry } from './country-code.js';

type HeaderReader = { get(name: string): string | null };

/** In order of trustworthiness. The first plausible answer wins. */
export const COUNTRY_HEADERS: readonly string[] = Object.freeze([
  'cf-ipcountry',
  'x-vercel-ip-country',
  'x-country-code',
]);

/**
 * The ISO 3166-1 alpha-2 country this request came from, or null when the platform does not say.
 * Never throws; a header the edge did not set is simply skipped.
 */
export const requestCountry = (headers: HeaderReader): string | null => {
  for (const name of COUNTRY_HEADERS) {
    const country = normalizeCountry(headers.get(name));
    if (country) return country;
  }
  return null;
};
