import { describe, expect, it } from 'vitest';
import type { AdminPlayersRow } from '../../server/src/admin/players.js';
import { DEFAULT_PLAYERS_FILTER, filterPlayers, readPlayersFilter } from '../src/players-view.js';

const NOW = 1_760_000_000_000;
const DAY = 24 * 60 * 60 * 1000;
const row = (id: string, over: Partial<AdminPlayersRow> = {}): AdminPlayersRow => ({
  id,
  tag: 'ABCD',
  displayName: id,
  kind: 'guest',
  google: false,
  createdAt: NOW - 40 * DAY,
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

describe('the Players screen filter', () => {
  const rows = [
    row('a-maplefox', { displayName: 'MapleFox', tag: '7QK2', lastSeenAt: NOW - 2 * DAY, campaignHighest: 12 }),
    row('b-owner', { displayName: 'Owner', kind: 'account', google: true, lastSeenAt: NOW - 60_000, matches: { played: 9, finished: 8, wins: 5 } }),
    row('c-quiet', { displayName: 'QuietOak', lastSeenAt: NOW - 45 * DAY, campaignHighest: 20 }),
  ];

  it('reads only known values from the address', () => {
    expect(readPlayersFilter(new URLSearchParams('kind=evil&sort=drop&quiet=9'))).toEqual(DEFAULT_PLAYERS_FILTER);
    expect(readPlayersFilter(new URLSearchParams('kind=google&sort=level&quiet=30&q=%20fox%20'))).toEqual({ q: 'fox', kind: 'google', sort: 'level', quiet: '30' });
  });

  it('finds a player by part of a name, a tag with or without #, or the start of an id', () => {
    const ids = (q: string) => filterPlayers(rows, { ...DEFAULT_PLAYERS_FILTER, q }, NOW).map((r) => r.id);
    expect(ids('maple')).toEqual(['a-maplefox']);
    expect(ids('#7qk2')).toEqual(['a-maplefox']);
    expect(ids('b-ow')).toEqual(['b-owner']);
  });

  it('sorts by last seen by default, and by level or matches on request', () => {
    expect(filterPlayers(rows, DEFAULT_PLAYERS_FILTER, NOW).map((r) => r.id)).toEqual(['b-owner', 'a-maplefox', 'c-quiet']);
    expect(filterPlayers(rows, { ...DEFAULT_PLAYERS_FILTER, sort: 'level' }, NOW).map((r) => r.id)).toEqual(['c-quiet', 'a-maplefox', 'b-owner']);
    expect(filterPlayers(rows, { ...DEFAULT_PLAYERS_FILTER, sort: 'matches' }, NOW)[0]!.id).toBe('b-owner');
  });

  it('"gone quiet" keeps only players with nothing recorded for that long; kinds filter exactly', () => {
    expect(filterPlayers(rows, { ...DEFAULT_PLAYERS_FILTER, quiet: '30' }, NOW).map((r) => r.id)).toEqual(['c-quiet']);
    expect(filterPlayers(rows, { ...DEFAULT_PLAYERS_FILTER, kind: 'google' }, NOW).map((r) => r.id)).toEqual(['b-owner']);
    expect(filterPlayers(rows, { ...DEFAULT_PLAYERS_FILTER, kind: 'guest' }, NOW)).toHaveLength(2);
  });
});

describe('dashboard sign-in picks its token in a safe order', () => {
  it('own Google sign-in first, then the game token unless signed out, then a pasted one', async () => {
    const { pickToken } = await import('../src/api.js');
    const t = (c: string) => c.repeat(20);
    expect(pickToken({ own: t('o'), game: t('g'), pasted: t('p'), signedOut: false })?.source).toBe('google');
    expect(pickToken({ own: null, game: t('g'), pasted: t('p'), signedOut: false })?.source).toBe('game');
    expect(pickToken({ own: null, game: t('g'), pasted: t('p'), signedOut: true })?.source).toBe('pasted');
    expect(pickToken({ own: null, game: t('g'), pasted: null, signedOut: true })).toBeNull();
    expect(pickToken({ own: 'short', game: null, pasted: null, signedOut: false })).toBeNull();
  });
});
