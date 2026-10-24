// The Players screen's filter and sort, kept pure so they are tested without a browser.
//
// `traffic` is the human/bot split (owner, 2026-10-24): the default is HUMANS, so an automated test
// account is never mistaken for a person. A human is never hidden by what their name looks like —
// guest names are generated from the id, so name shape is not evidence of anything.
import type { AdminPlayersRow } from '../../server/src/admin/players.js';

export type PlayersSort = 'seen' | 'joined' | 'level' | 'matches';
export type PlayersKind = 'all' | 'account' | 'guest' | 'google';
/** Which side of the human/bot split to list. `humans` is the default on every people-facing view. */
export type PlayersTraffic = 'humans' | 'bots' | 'all';

export type PlayersFilter = { q: string; kind: PlayersKind; traffic: PlayersTraffic; sort: PlayersSort; quiet: 'all' | '7' | '30' };

export const DEFAULT_PLAYERS_FILTER: PlayersFilter = { q: '', kind: 'all', traffic: 'humans', sort: 'seen', quiet: 'all' };

export const readPlayersFilter = (params: URLSearchParams): PlayersFilter => {
  const kind = params.get('kind');
  const sort = params.get('sort');
  const traffic = params.get('traffic');
  const quiet = params.get('quiet');
  return {
    q: (params.get('q') ?? '').trim().slice(0, 80),
    kind: kind === 'account' || kind === 'guest' || kind === 'google' ? kind : 'all',
    traffic: traffic === 'bots' || traffic === 'all' ? traffic : 'humans',
    sort: sort === 'joined' || sort === 'level' || sort === 'matches' ? sort : 'seen',
    quiet: quiet === '7' || quiet === '30' ? quiet : 'all',
  };
};

const DAY = 24 * 60 * 60 * 1000;

/** Name, tag (with or without #) or the start of an id; case-insensitive. */
const matchesQuery = (row: AdminPlayersRow, q: string): boolean => {
  if (!q) return true;
  const needle = q.toLowerCase().replace(/^#/, '');
  return (
    (row.displayName ?? '').toLowerCase().includes(needle) ||
    row.tag.toLowerCase() === needle ||
    row.id.toLowerCase().startsWith(needle)
  );
};

/** Everything except the traffic split. Shared by `filterPlayers` and `playersCounts`. */
const matchesFilters = (row: AdminPlayersRow, filter: PlayersFilter, now: number): boolean => {
  if (filter.kind === 'account' && row.kind !== 'account') return false;
  if (filter.kind === 'guest' && row.kind !== 'guest') return false;
  if (filter.kind === 'google' && !row.google) return false;
  // "Gone quiet": nothing recorded for at least this many days.
  if (filter.quiet !== 'all' && now - row.lastSeenAt < Number(filter.quiet) * DAY) return false;
  return matchesQuery(row, filter.q);
};

export const filterPlayers = (rows: readonly AdminPlayersRow[], filter: PlayersFilter, now: number): AdminPlayersRow[] => {
  const out = rows.filter((row) => {
    if (filter.traffic === 'humans' && row.classification === 'bot') return false;
    if (filter.traffic === 'bots' && row.classification !== 'bot') return false;
    return matchesFilters(row, filter, now);
  });
  const by: Record<PlayersSort, (a: AdminPlayersRow, b: AdminPlayersRow) => number> = {
    seen: (a, b) => b.lastSeenAt - a.lastSeenAt,
    joined: (a, b) => b.createdAt - a.createdAt,
    level: (a, b) => (b.campaignHighest ?? 0) - (a.campaignHighest ?? 0) || b.lastSeenAt - a.lastSeenAt,
    matches: (a, b) => b.matches.played - a.matches.played || b.lastSeenAt - a.lastSeenAt,
  };
  return out.sort((a, b) => by[filter.sort](a, b) || a.id.localeCompare(b.id));
};

/**
 * The arithmetic behind "1,204 players · 37 bots hidden". Every number here is counted against the
 * SAME search and quiet filters, so the pair always adds up to what the filters really select — a bot
 * the search excludes is not reported as hidden.
 */
export const playersCounts = (
  rows: readonly AdminPlayersRow[],
  filter: PlayersFilter,
  now: number,
): { shown: number; humans: number; bots: number; hiddenBots: number } => {
  const matching = rows.filter((row) => matchesFilters(row, filter, now));
  const bots = matching.filter((row) => row.classification === 'bot').length;
  const humans = matching.length - bots;
  const shown = filter.traffic === 'bots' ? bots : filter.traffic === 'all' ? matching.length : humans;
  return { shown, humans, bots, hiddenBots: filter.traffic === 'humans' ? bots : 0 };
};
