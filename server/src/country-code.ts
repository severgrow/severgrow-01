// One validator for a country code, shared by the request-geo reader (geo.ts), the stored rows
// (accounts/country.ts) and the public profile shape. Kept dependency-free so the same module runs
// under Node and in the Deno Edge bundle.
//
// A country code is exactly two letters. Cloudflare reports 'XX' when it cannot place an address and
// 'T1' for Tor exits: neither is a country, so neither is stored or served. Everything else is
// uppercased and served as-is — the client's flag renderer already draws only a real pair of letters
// and prints nothing for anything else.
const ISO = /^[A-Za-z]{2}$/;

/** The canonical alpha-2 code, or null when the value is not a country code. */
export const normalizeCountry = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const code = value.trim().toUpperCase();
  if (!ISO.test(code)) return null;
  if (code === 'XX' || code === 'T1') return null;
  return code;
};

export const isCountryCode = (value: unknown): value is string => normalizeCountry(value) !== null;
