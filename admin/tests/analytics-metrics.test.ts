import { describe, expect, it } from 'vitest';
import type { AdminPlayersRow } from '../../server/src/admin/players.js';
import {
  cohortRetention,
  funnelConversions,
  joinsByUtcDay,
  repeatOnlinePlayers,
  utcDayKey,
} from '../src/analytics-metrics.js';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-11-08T12:00:00.000Z');

const human = (id: string, over: Partial<AdminPlayersRow> = {}): AdminPlayersRow => ({
  id,
  tag: 'ABCD',
  displayName: id,
  kind: 'guest',
  google: false,
  classification: 'human',
  classificationReason: 'No test marker: treated as a real player.',
  testReason: null,
  testOverridden: false,
  createdAt: NOW - 20 * DAY,
  lastSeenAt: NOW - DAY,
  lastActivity: 'joined',
  lastActivityText: 'Joined',
  matches: { played: 0, finished: 0, wins: 0 },
  campaignHighest: null,
  campaignClears: 0,
  seeds: 0,
  tiles: 0,
  reports: 0,
  ...over,
});

describe('utcDayKey', () => {
  it('uses the UTC calendar day', () => {
    expect(utcDayKey(Date.parse('2026-11-07T23:30:00.000Z'))).toBe('2026-11-07');
    expect(utcDayKey(Date.parse('2026-11-08T00:30:00.000Z'))).toBe('2026-11-08');
  });
});

describe('joinsByUtcDay', () => {
  it('counts new humans per day for the last N UTC days, newest last', () => {
    const rows = [
      human('a', { createdAt: Date.parse('2026-11-06T10:00:00.000Z') }),
      human('b', { createdAt: Date.parse('2026-11-06T18:00:00.000Z') }),
      human('c', { createdAt: Date.parse('2026-11-08T08:00:00.000Z') }),
    ];
    const days = joinsByUtcDay(rows, NOW, 3);
    expect(days).toEqual([
      { day: '2026-11-06', n: 2 },
      { day: '2026-11-07', n: 0 },
      { day: '2026-11-08', n: 1 },
    ]);
  });
});

describe('cohortRetention', () => {
  it('counts only players old enough for each window, and only humans who recorded activity after it', () => {
    const rows = [
      human('returned-d1', {
        createdAt: NOW - 5 * DAY,
        lastSeenAt: NOW - 3 * DAY,
      }),
      human('same-day-only', {
        createdAt: NOW - 5 * DAY,
        lastSeenAt: NOW - 5 * DAY + 60_000,
      }),
      human('too-young', {
        createdAt: NOW - DAY,
        lastSeenAt: NOW - 12 * 60 * 60 * 1000,
      }),
      human('returned-d7', {
        createdAt: NOW - 14 * DAY,
        lastSeenAt: NOW - 5 * DAY,
      }),
      human('stale-d7', {
        createdAt: NOW - 14 * DAY,
        lastSeenAt: NOW - 13 * DAY,
      }),
    ];
    const windows = cohortRetention(rows, NOW);
    const d1 = windows.find((row) => row.key === 'd1');
    const d7 = windows.find((row) => row.key === 'd7');
    expect(d1).toMatchObject({ eligible: 4, returned: 3 });
    expect(d7).toMatchObject({ eligible: 2, returned: 1 });
    expect(d1!.rate).toBe(75);
    expect(d7!.rate).toBe(50);
  });

  it('says rate is unknown when nobody is old enough', () => {
    const windows = cohortRetention([human('new', { createdAt: NOW - DAY, lastSeenAt: NOW })], NOW);
    expect(windows.every((row) => row.rate === null && row.eligible === 0)).toBe(true);
  });
});

describe('funnelConversions', () => {
  it('labels each step with a share of the one before it', () => {
    const steps = funnelConversions([
      { label: 'Known', n: 100 },
      { label: 'Played', n: 40 },
      { label: 'Finished', n: 30 },
    ]);
    expect(steps.map((row) => row.fromPrevious)).toEqual([null, '40%', '75%']);
  });
});

describe('repeatOnlinePlayers', () => {
  it('counts humans with at least two finished online matches', () => {
    expect(
      repeatOnlinePlayers([
        human('a', { matches: { played: 2, finished: 2, wins: 1 } }),
        human('b', { matches: { played: 1, finished: 1, wins: 0 } }),
        human('c', { matches: { played: 0, finished: 0, wins: 0 } }),
      ]),
    ).toBe(1);
  });
});
