// THE OFFLINE RECORD, TAKEN ACROSS DEVICES (owner, 2026-11-01: the profile's offline half "gets data
// from offline games from any devices on that account").
//
// Offline games are played with no server, so the only place they were counted is this browser. To
// show one number on every device, each device posts its own CUMULATIVE totals under a stable id it
// keeps in storage, and the server sums the devices and takes the best run between them (see
// `server/src/offline.ts`). This module owns the client half of that: the device's id, the snapshot
// it sends, and the "matches won, ever" total the profile's top block shows.
//
// Pure. No storage, no request, no clock: the caller reads and writes, so every rule here is
// unit-testable.
import type { OfflineCounters } from '../../../server/src/protocol.js';
import type { Record3 } from './match-record.js';
import type { Stats } from './stats.js';

/** This browser's own name for itself, so two devices on one account stay two rows. */
export const DEVICE_KEY = 'severgrow.device.v1';

/** The server's own rule for a device id (`server/src/offline.ts`): 8-64 of [A-Za-z0-9_-]. */
export const isDeviceId = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(value);

/** A remembered device id, or null when there is none (or it is not one the server would accept). */
export const deviceIdFrom = (raw: string | null): string | null => (isDeviceId(raw) ? raw : null);

/**
 * A fresh device id. `rand` is injected so the shape is testable without a browser: sixteen bytes of
 * randomness in the base36 alphabet, always inside the server's length window.
 */
export const newDeviceId = (rand: () => number): string => {
  let out = '';
  while (out.length < 22) out += Math.floor(rand() * 0x100000000).toString(36).padStart(7, '0');
  return out.slice(0, 22);
};

/**
 * A counter as the wire wants it: a whole, non-negative number. Anything else (NaN, a fraction, a
 * negative, Infinity) becomes 0 — the server rejects those, and one bad value must not stop the
 * device from reporting the rest of its record.
 */
const counter = (value: number): number => (Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0);

/**
 * The snapshot this device sends: its own totals, never the account's. Cumulative, because the
 * server replaces the row (and never lowers a counter), so a delayed or retried request is harmless.
 */
export const offlineCounters = (stats: Stats, deviceId: string): OfflineCounters => ({
  deviceId,
  played: counter(stats.played),
  wins: counter(stats.wins),
  losses: counter(stats.losses),
  draws: counter(stats.draws),
  bestStreak: counter(stats.bestStreak),
});

/**
 * "Matches won" for the top block: every win ever, offline and online added together (owner:
 * "matches won should be summary of any matches ever"). An online half we could not read is not
 * zero — it is unknown, and a total that might be missing matches is an em dash, not a guess.
 */
export const matchesWonEver = (offline: Record3 | null, online: Record3 | null): number | null =>
  offline && online ? offline.wins + online.wins : null;
