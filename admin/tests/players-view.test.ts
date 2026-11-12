import { describe, expect, it } from 'vitest';
import type { AdminPlayersRow } from '../../server/src/admin/players.js';
import { DEFAULT_PLAYERS_FILTER, filterPlayers, playersCounts, readPlayersFilter } from '../src/players-view.js';

const NOW = 1_760_000_000_000;
const DAY = 24 * 60 * 60 * 1000;
const row = (id: string, over: Partial<AdminPlayersRow> = {}): AdminPlayersRow => ({
  id,
  tag: 'ABCD',
  displayName: id,
  kind: 'guest',
  google: false,
  classification: 'human',
  classificationReason: 'No test marker: treated as a real player.',
  testReason: null,
  testOverridden: false,
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
    expect(readPlayersFilter(new URLSearchParams('kind=google&sort=level&quiet=30&q=%20fox%20'))).toEqual({
      q: 'fox',
      kind: 'google',
      traffic: 'humans',
      sort: 'level',
      quiet: '30',
    });
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

// ------------------------------------------------------------------ bots vs real people
// The owner: "i mainly care about not confusing bots with real players who are testing the game".
// Default is HUMANS; a human is NEVER hidden by anything a name looks like.
describe('the human/bot split', () => {
  const rows = [
    // A real person testing the game, with a name that looks exactly like a generated guest name.
    row('a-human', { displayName: 'AmberFox', lastSeenAt: NOW - 60_000 }),
    row('b-human', { displayName: 'CedarOwl', kind: 'account', google: true, lastSeenAt: NOW - 2 * DAY }),
    // An automated account: marked, with a reason.
    row('c-bot', {
      displayName: 'CoralBear',
      classification: 'bot',
      classificationReason: 'Backfill: burst of 8+ accounts, no activity ever.',
      lastSeenAt: NOW - 30 * DAY,
    }),
    // An automated account the owner has explicitly kept as a real person.
    row('d-bot-kept', {
      displayName: 'JadeCreek',
      classification: 'human',
      classificationReason: 'Owner override: this is a real person, always shown.',
      testOverridden: true,
      lastSeenAt: NOW - 3 * DAY,
    }),
  ];

  it('a human with a bot-looking name is NOT hidden', () => {
    expect(rows[0]!.classification).toBe('human');
    const shown = filterPlayers(rows, DEFAULT_PLAYERS_FILTER, NOW).map((r) => r.id);
    expect(shown).toContain('a-human');
  });

  it('a marked test account is hidden by the default (humans) view', () => {
    const shown = filterPlayers(rows, DEFAULT_PLAYERS_FILTER, NOW).map((r) => r.id);
    expect(shown).not.toContain('c-bot');
    expect(DEFAULT_PLAYERS_FILTER.traffic).toBe('humans');
  });

  it('the hidden-bot count matches exactly the bots the same filters would show', () => {
    const counts = playersCounts(rows, DEFAULT_PLAYERS_FILTER, NOW);
    expect(counts.humans).toBe(3); // two real + one owner-kept
    expect(counts.bots).toBe(1);
    expect(counts.hiddenBots).toBe(1);
    expect(counts.shown).toBe(3);
    expect(counts.humans + counts.bots).toBe(rows.length);

    // The search is part of the arithmetic, not applied afterwards.
    const searched = playersCounts(rows, { ...DEFAULT_PLAYERS_FILTER, q: 'coral' }, NOW);
    expect(searched.shown).toBe(0);
    expect(searched.hiddenBots).toBe(1);
    const missing = playersCounts(rows, { ...DEFAULT_PLAYERS_FILTER, q: 'nobody' }, NOW);
    expect(missing.hiddenBots).toBe(0);
    expect(missing.humans + missing.bots).toBe(0);
  });

  it('traffic=all shows everyone; traffic=bots shows only the bots', () => {
    expect(filterPlayers(rows, { ...DEFAULT_PLAYERS_FILTER, traffic: 'all' }, NOW)).toHaveLength(4);
    expect(filterPlayers(rows, { ...DEFAULT_PLAYERS_FILTER, traffic: 'bots' }, NOW).map((r) => r.id)).toEqual(['c-bot']);
    const counts = playersCounts(rows, { ...DEFAULT_PLAYERS_FILTER, traffic: 'bots' }, NOW);
    expect(counts.shown).toBe(1);
    expect(counts.hiddenBots).toBe(0);
  });

  it("an owner's override moves the account between the lists (the row is human, not a bot)", () => {
    const humans = filterPlayers(rows, DEFAULT_PLAYERS_FILTER, NOW).map((r) => r.id);
    const bots = filterPlayers(rows, { ...DEFAULT_PLAYERS_FILTER, traffic: 'bots' }, NOW).map((r) => r.id);
    expect(humans).toContain('d-bot-kept');
    expect(bots).not.toContain('d-bot-kept');
    expect(bots).toEqual(['c-bot']);
  });

  it('reads the traffic view from the address, and never invents one', () => {
    expect(readPlayersFilter(new URLSearchParams('traffic=bots')).traffic).toBe('bots');
    expect(readPlayersFilter(new URLSearchParams('traffic=all')).traffic).toBe('all');
    expect(readPlayersFilter(new URLSearchParams('traffic=everyone')).traffic).toBe('humans');
    expect(readPlayersFilter(new URLSearchParams('')).traffic).toBe('humans');
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
