// Pure presentation helpers for the dashboard. No DOM, no network — so they are unit-testable in
// `admin/tests/format.test.ts` and cannot hide a bug behind a browser.
//
// `normalizeBuild` and the export caps are imported from the SERVER module that defines them
// (`server/src/admin/types.ts`). That is deliberate: the dashboard's build groups and the API's
// build filter must agree exactly, and the only way to guarantee that is one implementation. The
// dependency points admin → server (never the reverse), so nothing here can reach the game bundle.

export { MAX_PAGE, CSV_MAX_ROWS, TAG_SCAN_LIMIT, normalizeBuild } from '../../server/src/admin/types.js';

/** Thousands separators, or an em dash for a value that is genuinely absent (never a fake 0). */
export const formatNumber = (value: number | null | undefined): string =>
  value === null || value === undefined || !Number.isFinite(value) ? '—' : value.toLocaleString('en-GB');

/** A signed delta, so a ledger row reads `+30` / `−100`. */
export const formatDelta = (value: number): string => (value > 0 ? `+${formatNumber(value)}` : formatNumber(value));

/** `2026-10-15` → `15 Oct`. UTC, because every stored day is a UTC day. */
export const formatDay = (day: string): string => {
  const ms = Date.parse(`${day}T00:00:00.000Z`);
  if (!Number.isFinite(ms)) return day;
  return new Date(ms).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', timeZone: 'UTC' });
};

/** Epoch ms → `15 Oct 14:03` (local to the viewer, with UTC as the storage truth beside it). */
export const formatDateTime = (ms: number | null | undefined): string => {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return '—';
  return new Date(ms).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
};

export const formatTime = (ms: number | null | undefined): string => {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return '—';
  return new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
};

/** A compact duration for a window constant ("48h", "30d", "24h"). */
export const formatDuration = (ms: number): string => {
  const hours = ms / 3_600_000;
  if (hours < 1) return `${Math.round(ms / 60_000)}m`;
  if (hours < 48) return `${Math.round(hours)}h`;
  return `${Math.round(hours / 24)}d`;
};

/**
 * How long ago, in the honest register this dashboard uses: "just now", "12m ago", "3h ago",
 * "6d ago", or a date once it is older than a month.
 */
export const formatAgo = (ms: number | null | undefined, now: number): string => {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return '—';
  const delta = now - ms;
  if (delta < 0) return 'in the future';
  if (delta < 60_000) return 'just now';
  if (delta < 3_600_000) return `${Math.floor(delta / 60_000)}m ago`;
  if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)}h ago`;
  if (delta < 30 * 86_400_000) return `${Math.floor(delta / 86_400_000)}d ago`;
  return formatDateTime(ms);
};

/** `2000-01-01` style ISO for a CSV-independent display of a stored day. */
export const formatIsoDay = (day: string): string => day;

/** A ratio as `x.xx`, or an em dash when there is no denominator (never "0" or a guess). */
export const formatRatio = (ratio: number | null | undefined): string =>
  ratio === null || ratio === undefined || !Number.isFinite(ratio) ? '—' : ratio.toFixed(2);

/** A share of a total, as a percentage. `null` when the total is 0 — that is not "0%". */
export const formatShare = (part: number, total: number): string | null =>
  total > 0 ? `${Math.round((part / total) * 100)}%` : null;

/** The percent of the way through a series (for a bar fill), clamped to 0–100. */
export const percentOf = (value: number, max: number): number => (max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0);

/**
 * The share of `value` against the largest value in a series. Used by the small bars on Overview:
 * a bar with no scale next to it would be decoration, so the maximum is always labelled too.
 */
export const seriesMax = (values: readonly number[]): number => values.reduce((max, value) => Math.max(max, value), 0);

/** A stable, human label for a match mode. */
export const modeLabel = (mode: string): string => (mode === 'queue' ? 'Find opponent' : mode === 'friend' ? 'Invite a friend' : mode === 'live' ? 'Live duel' : mode);

/**
 * The world-growth replay: the set of claimed cells at the END of `day`.
 *
 * Claims are cumulative, so the replay at day D is every claim whose `claimedAt` is on or before the
 * end of D. Cells claimed BEFORE the earliest recorded day are always present, which is why this
 * takes the whole claim list rather than a single day's slice: a later day can never show FEWER
 * tiles than an earlier one.
 */
export const claimsUpToDay = (
  claims: readonly { cellId: string; ownerId: string; claimedAt: number }[],
  day: string,
): { cellId: string; ownerId: string; claimedAt: number }[] => {
  const end = Date.parse(`${day}T23:59:59.999Z`);
  if (!Number.isFinite(end)) return [];
  return claims.filter((claim) => claim.claimedAt <= end);
};

/** The number of distinct owners in a set of claims. */
export const distinctOwners = (claims: readonly { ownerId: string }[]): number => new Set(claims.map((claim) => claim.ownerId)).size;

/**
 * Where a level sits relative to the rest, for the Campaign screen's falloff reading. Returns the
 * share of the best-cleared level, or null when nothing has been cleared at all.
 */
export const completionShare = (clears: number, best: number): number | null => (best > 0 ? (clears / best) * 100 : null);

/** Turn a query object into an ordered query string, dropping empty values. */
export const queryString = (params: Record<string, string | number | undefined | null>): string => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : '';
};

/**
 * Read the hash into `{ route, rest, params }`:
 *   `#/reports?kind=crash` → route `reports`, rest ``, params `{kind:'crash'}`
 *   `#/match/<id>`         → route `match`,   rest `<id>`
 */
export const parseHash = (hash: string): { route: string; rest: string; params: URLSearchParams } => {
  const raw = hash.replace(/^#\/?/, '');
  const qIndex = raw.indexOf('?');
  const path = (qIndex === -1 ? raw : raw.slice(0, qIndex)).replace(/\/+$/, '');
  const params = new URLSearchParams(qIndex === -1 ? '' : raw.slice(qIndex + 1));
  const slash = path.indexOf('/');
  const route = slash === -1 ? path : path.slice(0, slash);
  const rest = slash === -1 ? '' : path.slice(slash + 1);
  return { route: route === '' ? 'overview' : route, rest, params };
};

/** A short id for a table cell: the first 8 characters, which is unique within a session's view. */
export const shortId = (id: string): string => (id.length > 12 ? `${id.slice(0, 8)}…` : id);
