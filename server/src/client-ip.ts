// Deriving a trustworthy client IP behind a proxy (Supabase Edge / Cloudflare / any reverse proxy).
//
// Why this file exists: rate limits are bucketed per IP. If the derivation falls back to a shared
// constant (for example "unknown") every player on the planet shares one bucket and a single busy
// household can exhaust it for everyone. If it blindly trusts the leftmost `x-forwarded-for` entry,
// an internal proxy hop (a private address such as 198.19.9.x) can also collapse many players into
// one bucket.
//
// The rules here are deliberately small and dependency-free so the same module runs under Node and
// in the Deno Edge bundle:
//
//   1. Prefer `cf-connecting-ip` — Cloudflare sets it to the real client and rejects requests that
//      try to forge it (a spoofed value comes back as HTTP 403 from the edge).
//   2. Then `x-real-ip`.
//   3. Then the leftmost address of `x-forwarded-for` that is a syntactically valid public IP.
//      When the proxy replaces the header (the observed Supabase Edge behaviour) the leftmost entry
//      IS the client and a client-supplied value never survives.
//   4. If every candidate is private/loopback (a pure internal call), fall back to the first valid
//      address so those callers still get their own bucket instead of sharing the global one.
//   5. If nothing is valid, return null and let the caller bucket to "unknown".

/** Matches a dotted-quad IPv4 address with each octet 0-255. */
const IPV4_RE = /^(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/;

const isIpv4 = (value: string): boolean => IPV4_RE.test(value);

/** True for a valid IPv6 literal (optionally with a `%zone` suffix); no brackets expected. */
const isIpv6 = (value: string): boolean => {
  let body = value;
  const percent = body.indexOf('%');
  if (percent !== -1) {
    if (body.indexOf('%', percent + 1) !== -1) return false;
    if (percent === body.length - 1) return false;
    body = body.slice(0, percent);
  }
  if (body.length === 0 || !body.includes(':')) return false;

  // An embedded IPv4 tail (e.g. ::ffff:1.2.3.4) counts as two 16-bit groups.
  let normalized = body;
  if (body.includes('.')) {
    const lastColon = body.lastIndexOf(':');
    if (lastColon === -1) return false;
    const tail = body.slice(lastColon + 1);
    if (!isIpv4(tail)) return false;
    normalized = `${body.slice(0, lastColon)}:0:0`;
  }

  const halves = normalized.split('::');
  if (halves.length > 2) return false;
  const groups = (value: string): string[] => (value === '' ? [] : value.split(':'));
  const all = [...groups(halves[0] ?? ''), ...(halves.length === 2 ? groups(halves[1] ?? '') : [])];
  if (all.some((group) => !/^[0-9a-fA-F]{1,4}$/.test(group))) return false;
  // `::` stands for at least one omitted group, so 8 explicit groups would be too many.
  return halves.length === 2 ? all.length <= 7 : all.length === 8;
};

/** Strips surrounding brackets and an optional `:port`, then validates. Returns null when invalid. */
export const normalizeIp = (raw: string | null | undefined): string | null => {
  if (typeof raw !== 'string') return null;
  let value = raw.trim();
  if (value.length === 0) return null;
  // "[2001:db8::1]:443" or "[2001:db8::1]"
  if (value.startsWith('[')) {
    const close = value.indexOf(']');
    if (close === -1) return null;
    value = value.slice(1, close);
  } else if (value.includes('.') && value.includes(':')) {
    // "1.2.3.4:443" — a single trailing colon-port.
    const lastColon = value.lastIndexOf(':');
    const maybePort = value.slice(lastColon + 1);
    if (/^\d{1,5}$/.test(maybePort)) value = value.slice(0, lastColon);
  }
  const lower = value.toLowerCase();
  if (isIpv4(lower)) return lower;
  if (isIpv6(lower)) return lower;
  return null;
};

const ipv4Octets = (value: string): number[] => value.split('.').map((part) => Number(part));

/** The embedded IPv4 of an IPv4-mapped IPv6 address (`::ffff:a.b.c.d`), or null. */
const mappedIpv4 = (value: string): string | null => {
  if (!value.toLowerCase().startsWith('::ffff:')) return null;
  const tail = value.slice(7);
  return isIpv4(tail) ? tail : null;
};

/**
 * Public = routable on the internet. Private, loopback, link-local, carrier-grade NAT, benchmarking,
 * documentation and multicast/reserved ranges are not public, because bucketing every player behind
 * one of them into the same bucket is exactly the bug this module prevents.
 */
export const isPublicIp = (ip: string): boolean => {
  const normalized = normalizeIp(ip);
  if (!normalized) return false;
  const mapped = mappedIpv4(normalized);
  const candidate = mapped ?? normalized;

  if (isIpv4(candidate)) {
    const [a, b] = ipv4Octets(candidate);
    if (a === undefined || b === undefined) return false;
    if (a === 0 || a === 10 || a === 127) return false; // "this network", private, loopback
    if (a === 100 && b >= 64 && b <= 127) return false; // 100.64.0.0/10 carrier-grade NAT
    if (a === 169 && b === 254) return false; // link-local
    if (a === 172 && b >= 16 && b <= 31) return false; // private
    if (a === 192 && b === 0) return false; // 192.0.0.0/24 (incl. TEST-NET-1) + 192.0.2.0/24
    if (a === 192 && b === 88) return false; // 6to4 relay anycast
    if (a === 192 && b === 168) return false; // private
    if (a === 198 && (b === 18 || b === 19)) return false; // 198.18.0.0/15 benchmarking (observed proxy hop)
    if (a === 198 && b === 51) return false; // TEST-NET-2
    if (a === 203 && b === 0) return false; // TEST-NET-3
    if (a >= 224) return false; // multicast + reserved
    return true;
  }

  // IPv6 (anything still starting with `::` is a special/reserved address, e.g. ::1, ::ffff:x)
  if (candidate.startsWith('::')) return false;
  const firstGroup = candidate.split(':')[0] ?? '';
  const firstByte = firstGroup.length === 0 ? 0 : Number.parseInt(firstGroup.padStart(4, '0').slice(0, 2), 16);
  if ((firstByte & 0xfe) === 0xfc) return false; // fc00::/7 unique local
  if ((firstByte & 0xff) === 0xfe) return false; // fe80::/10 link-local (fe80-febf)
  if ((firstByte & 0xff) === 0xff) return false; // ff00::/8 multicast
  if (candidate.startsWith('2001:db8:')) return false; // 2001:db8::/32 documentation
  return true;
};

/** Splits `x-forwarded-for` into validated IPs, left (closest to the client) to right. */
export const parseForwardedFor = (value: string | null | undefined): string[] => {
  if (typeof value !== 'string') return [];
  return value
    .split(',')
    .map((entry) => normalizeIp(entry))
    .filter((ip): ip is string => ip !== null);
};

type HeaderReader = { get(name: string): string | null };

/**
 * The real client IP, or null when nothing trustworthy is present.
 * Never throws; unknown/malformed headers are ignored.
 */
export const pickClientIp = (headers: HeaderReader): string | null => {
  const single = normalizeIp(headers.get('cf-connecting-ip'));
  if (single) return single;

  const real = normalizeIp(headers.get('x-real-ip'));
  if (real) return real;

  const chain = parseForwardedFor(headers.get('x-forwarded-for'));
  if (chain.length === 0) return null;
  return chain.find((ip) => isPublicIp(ip)) ?? chain[0] ?? null;
};
