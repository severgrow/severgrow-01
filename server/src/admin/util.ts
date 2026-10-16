// Shared value helpers for the admin stores. Small and dependency-free, so the Postgres store, the
// in-memory store and the router all read a database row the same way.
import { MAX_PAGE } from './types.js';

export const DAY_MS = 86_400_000;

export const num = (value: unknown): number => Number(value ?? 0);
export const nnum = (value: unknown): number | null => (value === null || value === undefined ? null : Number(value));
export const str = (value: unknown): string => String(value);
export const nstr = (value: unknown): string | null => (value === null || value === undefined ? null : String(value));
export const bool = (value: unknown): boolean => value === true || value === 't' || value === 1;

export const json = <T>(value: unknown, fallback: T): T => {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return value as T;
};

/** UTC day key (`YYYY-MM-DD`) — the same key `seed_reward_receipts.utc_day` uses. */
export const utcDay = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

/** The `n` UTC days ending with (and including) `now`'s day, oldest first. */
export const lastDays = (now: number, n: number): string[] => {
  const today = Math.floor(now / DAY_MS) * DAY_MS;
  return Array.from({ length: n }, (_, i) => utcDay(today - (n - 1 - i) * DAY_MS));
};

/**
 * The mode `matches` can actually distinguish. There is no mode column: a live-duel match carries
 * the live columns, a Find-Opponent/parked match sets `open_queue`, everything else came from an
 * invite code. Campaign and Training never create a `matches` row.
 */
export const modeOf = (row: { live_since?: unknown; open_queue?: unknown }): 'queue' | 'friend' | 'live' =>
  row.live_since !== null && row.live_since !== undefined ? 'live' : bool(row.open_queue) ? 'queue' : 'friend';

/** `${createdAt}|${id}` keyset cursors, decoded defensively (a junk cursor is simply ignored). */
export const encodeCursor = (createdAt: number, id: string): string => `${createdAt}|${id}`;
export const decodeCursor = (cursor: string | undefined): { at: number; id: string } | null => {
  if (!cursor) return null;
  const sep = cursor.indexOf('|');
  if (sep < 1) return null;
  const at = Number.parseInt(cursor.slice(0, sep), 10);
  const id = cursor.slice(sep + 1);
  return Number.isInteger(at) && id.length > 0 ? { at, id } : null;
};

/** A page size that is always a positive integer and never above the hard cap. */
export const clampLimit = (limit: number, fallback = 25): number =>
  Number.isInteger(limit) && limit > 0 ? Math.min(limit, MAX_PAGE) : fallback;

/** The page wrapper both stores share, so pagination cannot drift between them. */
export const pageOf = <T>(rows: T[], total: number, limit: number, key: (row: T) => { at: number; id: string }) => {
  const last = rows[rows.length - 1];
  return {
    rows,
    total,
    nextCursor: rows.length === limit && last !== undefined ? encodeCursor(key(last).at, key(last).id) : null,
  };
};
