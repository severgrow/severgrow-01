// The Players screen's filter and sort, kept pure so they are tested without a browser.
import type { AdminPlayersRow } from '../../server/src/admin/players.js';

export type PlayersSort = 'seen' | 'joined' | 'level' | 'matches';
export type PlayersKind = 'all' | 'account' | 'guest' | 'google';

export type PlayersFilter = { q: string; kind: PlayersKind; sort: PlayersSort; quiet: 'all' | '7' | '30' };

export const DEFAULT_PLAYERS_FILTER: PlayersFilter = { q: '', kind: 'all', sort: 'seen', quiet: 'all' };

export const readPlayersFilter = (params: URLSearchParams): PlayersFilter => {
  const kind = params.get('kind');
  const sort = params.get('sort');
  const quiet = params.get('quiet');
  return {
    q: (params.get('q') ?? '').trim().slice(0, 80),
    kind: kind === 'account' || kind === 'guest' || kind === 'google' ? kind : 'all',
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

export const filterPlayers = (rows: readonly AdminPlayersRow[], filter: PlayersFilter, now: number): AdminPlayersRow[] => {
  const out = rows.filter((row) => {
    if (filter.kind === 'account' && row.kind !== 'account') return false;
    if (filter.kind === 'guest' && row.kind !== 'guest') return false;
    if (filter.kind === 'google' && !row.google) return false;
    // "Gone quiet": nothing recorded for at least this many days.
    if (filter.quiet !== 'all' && now - row.lastSeenAt < Number(filter.quiet) * DAY) return false;
    return matchesQuery(row, filter.q);
  });
  const by: Record<PlayersSort, (a: AdminPlayersRow, b: AdminPlayersRow) => number> = {
    seen: (a, b) => b.lastSeenAt - a.lastSeenAt,
    joined: (a, b) => b.createdAt - a.createdAt,
    level: (a, b) => (b.campaignHighest ?? 0) - (a.campaignHighest ?? 0) || b.lastSeenAt - a.lastSeenAt,
    matches: (a, b) => b.matches.played - a.matches.played || b.lastSeenAt - a.lastSeenAt,
  };
  return out.sort((a, b) => by[filter.sort](a, b) || a.id.localeCompare(b.id));
};
