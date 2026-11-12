// THE OFFLINE RECORD ACROSS DEVICES (owner, 2026-11-01): the profile's offline half "gets data from
// offline games from any devices on that account".
//
// Each device posts its own CUMULATIVE totals under a stable id it keeps in storage; the server sums
// the devices and takes the best run between them. These tests pin the client half: the device id
// (and its fallback when storage is blocked), the snapshot shape, and the all-time win total.
import { describe, expect, it } from 'vitest';
import { DEVICE_KEY, deviceIdFrom, isDeviceId, matchesWonEver, newDeviceId, offlineCounters } from '../src/logic/offline-sync.js';
import { EMPTY_STATS } from '../src/logic/stats.js';
import type { Stats } from '../src/logic/stats.js';

const stats = (over: Partial<Stats> = {}): Stats => ({ ...EMPTY_STATS, ...over });

describe('the device id', () => {
  it('accepts exactly what the server accepts: 8-64 of [A-Za-z0-9_-]', () => {
    expect(isDeviceId('abcdefgh')).toBe(true);
    expect(isDeviceId('A1_b-2c3d')).toBe(true);
    expect(isDeviceId('abcdefg')).toBe(false); // too short
    expect(isDeviceId('a'.repeat(65))).toBe(false); // too long
    expect(isDeviceId('has space')).toBe(false);
    expect(isDeviceId('emoji🙂🙂🙂🙂')).toBe(false);
    expect(isDeviceId(null)).toBe(false);
    expect(isDeviceId(42)).toBe(false);
  });

  it('mints an id inside that window, every time', () => {
    for (let i = 0; i < 200; i++) expect(isDeviceId(newDeviceId(Math.random)), newDeviceId(Math.random)).toBe(true);
  });

  it('treats a remembered but malformed id as none, so a bad value cannot poison the row', () => {
    expect(deviceIdFrom('abcdefgh')).toBe('abcdefgh');
    expect(deviceIdFrom('bad id')).toBeNull();
    expect(deviceIdFrom(null)).toBeNull();
    expect(DEVICE_KEY).toBe('severgrow.device.v1');
  });
});

describe('the snapshot a device posts', () => {
  it('is this device’s own cumulative totals — never the account’s', () => {
    const s = stats({ played: 24, wins: 14, losses: 8, draws: 2, bestStreak: 7 });
    expect(offlineCounters(s, 'abcdefgh')).toEqual({
      deviceId: 'abcdefgh',
      played: 24,
      wins: 14,
      losses: 8,
      draws: 2,
      bestStreak: 7,
    });
  });

  it('never sends a negative or fractional counter', () => {
    const s = stats({ played: -5, wins: 2.7, losses: Number.NaN, draws: -1, bestStreak: 3.9 });
    const c = offlineCounters(s, 'abcdefgh');
    expect(c).toEqual({ deviceId: 'abcdefgh', played: 0, wins: 2, losses: 0, draws: 0, bestStreak: 3 });
    for (const v of [c.played, c.wins, c.losses, c.draws, c.bestStreak]) {
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('matches won, ever', () => {
  it('adds the offline wins to the online wins', () => {
    expect(matchesWonEver({ games: 24, wins: 14, longestStreak: 7 }, { games: 9, wins: 4, longestStreak: 3 })).toBe(18);
  });

  it('is unknown when a half could not be read: a total that might be short is an em dash', () => {
    expect(matchesWonEver({ games: 24, wins: 14, longestStreak: 7 }, null)).toBeNull();
    expect(matchesWonEver(null, { games: 9, wins: 4, longestStreak: 3 })).toBeNull();
    expect(matchesWonEver(null, null)).toBeNull();
  });

  it('a real zero + zero is 0, not unknown', () => {
    expect(matchesWonEver({ games: 0, wins: 0, longestStreak: 0 }, { games: 0, wins: 0, longestStreak: 0 })).toBe(0);
  });
});
