// The Players screen: every player the server knows, and the last thing it RECORDED about each.
//
// "Where did they leave the game?" is answered only from rows the database already holds, and each
// answer names its source, so nothing is guessed:
//   * an online match                 → the newest `matches.updated_at` they take part in
//   * a verified campaign clear       → the newest campaign `seed_reward_receipts` row (level 11+:
//                                       levels 1-10 pay no Seeds, so they leave no row)
//   * a world tile, a report          → `world_claims.claimed_at`, `feedback_reports.created_at`
//   * the live-duel presence ping     → `players.presence_at`
// What the server never sees — a lesson or campaign level played offline without a paid clear — is
// not here, and the screen says so. Neither is a sign-in: the dashboard never reads `player_tokens`.
//
// Both stores (memory, Postgres) collect the same `PlayerFacts` and hand them to `shapePlayers`, so
// the dev server and production cannot disagree about a label or a count.
import { playerTag } from '../../../src/player-tag.js';

/** Raw facts a store collects for one player. Times are epoch ms, or null when nothing was recorded. */
export type PlayerFacts = {
  id: string;
  displayName: string | null;
  kind: 'guest' | 'account';
  createdAt: number;
  google: boolean;
  presenceAt: number | null;
  matches: { played: number; finished: number; wins: number; lastAt: number | null; lastStatus: string | null };
  campaign: { highest: number | null; clears: number; lastAt: number | null; lastLevel: number | null };
  reports: { count: number; lastAt: number | null };
  tiles: { count: number; lastAt: number | null };
  seeds: number;
};

export type PlayerActivity =
  | 'joined'
  | 'online-now'
  | 'match-waiting'
  | 'match-active'
  | 'match-finished'
  | 'campaign-clear'
  | 'tile'
  | 'report';

export type AdminPlayersRow = {
  id: string;
  tag: string;
  displayName: string | null;
  kind: 'guest' | 'account';
  google: boolean;
  createdAt: number;
  /** The newest recorded activity of any kind (never earlier than `createdAt`). */
  lastSeenAt: number;
  /** What that newest activity was, and a plain sentence for the table. */
  lastActivity: PlayerActivity;
  lastActivityText: string;
  matches: { played: number; finished: number; wins: number };
  /** The highest campaign level the server verified a win on, or null when it has none. */
  campaignHighest: number | null;
  campaignClears: number;
  seeds: number;
  tiles: number;
  reports: number;
};

export type AdminPlayersSummary = {
  players: number;
  accounts: number;
  guests: number;
  google: number;
  /** "Seen" = newest recorded activity of any kind inside the window. */
  seen24h: number;
  seen7d: number;
  seen30d: number;
  joined7d: number;
  /** The journey, each step a subset of the one before it only where the data makes it so. */
  funnel: { label: string; n: number }[];
  /** Players by the highest campaign level the server verified (levels with nobody are absent). */
  highestLevel: { level: number; n: number }[];
  /** Players by the kind of their newest recorded activity. */
  leftAt: { activity: PlayerActivity; label: string; n: number }[];
};

export type AdminPlayers = {
  summary: AdminPlayersSummary;
  rows: AdminPlayersRow[];
  /** How many players exist; `rows` holds at most `limit` of them (newest activity first). */
  total: number;
  limit: number;
};

/** The most players the screen lists in one response. */
export const PLAYERS_LIMIT = 2000;
const DAY = 24 * 60 * 60 * 1000;
/** A presence ping this recent means the player has the game open right now. */
const ONLINE_NOW_MS = 2 * 60 * 1000;

export const ACTIVITY_LABEL: Record<PlayerActivity, string> = {
  joined: 'Joined, nothing recorded since',
  'online-now': 'Online right now',
  'match-waiting': 'Waiting for an opponent',
  'match-active': 'In an online match',
  'match-finished': 'Finished an online match',
  'campaign-clear': 'Cleared a campaign level',
  tile: 'Claimed a world tile',
  report: 'Sent a report',
};

const activityOf = (f: PlayerFacts, now: number): { at: number; activity: PlayerActivity; text: string } => {
  const candidates: { at: number | null; activity: PlayerActivity; text: string }[] = [
    { at: f.createdAt, activity: 'joined', text: ACTIVITY_LABEL.joined },
    {
      at: f.matches.lastAt,
      activity: f.matches.lastStatus === 'waiting' ? 'match-waiting' : f.matches.lastStatus === 'active' ? 'match-active' : 'match-finished',
      text: f.matches.lastStatus === 'waiting' ? ACTIVITY_LABEL['match-waiting'] : f.matches.lastStatus === 'active' ? ACTIVITY_LABEL['match-active'] : ACTIVITY_LABEL['match-finished'],
    },
    {
      at: f.campaign.lastAt,
      activity: 'campaign-clear',
      text: f.campaign.lastLevel === null ? ACTIVITY_LABEL['campaign-clear'] : `Cleared campaign level ${f.campaign.lastLevel}`,
    },
    { at: f.tiles.lastAt, activity: 'tile', text: ACTIVITY_LABEL.tile },
    { at: f.reports.lastAt, activity: 'report', text: ACTIVITY_LABEL.report },
  ];
  // Later entries win a tie: a match written in the same millisecond as the player row says more
  // about where the player was than "joined" does.
  let best = { at: f.createdAt, activity: 'joined' as PlayerActivity, text: ACTIVITY_LABEL.joined };
  for (const c of candidates) if (c.at !== null && c.at >= best.at) best = { at: c.at, activity: c.activity, text: c.text };
  // Presence is a heartbeat, not a place: it only decides the label when it is live right now.
  if (f.presenceAt !== null && f.presenceAt > best.at) {
    if (now - f.presenceAt <= ONLINE_NOW_MS) best = { at: f.presenceAt, activity: 'online-now', text: ACTIVITY_LABEL['online-now'] };
    else best = { ...best, at: f.presenceAt };
  }
  return best;
};

export const shapePlayers = (facts: readonly PlayerFacts[], now: number, limit = PLAYERS_LIMIT): AdminPlayers => {
  const rows: AdminPlayersRow[] = facts.map((f) => {
    const last = activityOf(f, now);
    return {
      id: f.id,
      tag: playerTag(f.id),
      displayName: f.displayName,
      kind: f.kind,
      google: f.google,
      createdAt: f.createdAt,
      lastSeenAt: last.at,
      lastActivity: last.activity,
      lastActivityText: last.text,
      matches: { played: f.matches.played, finished: f.matches.finished, wins: f.matches.wins },
      campaignHighest: f.campaign.highest,
      campaignClears: f.campaign.clears,
      seeds: f.seeds,
      tiles: f.tiles.count,
      reports: f.reports.count,
    };
  });
  rows.sort((a, b) => b.lastSeenAt - a.lastSeenAt || b.createdAt - a.createdAt || a.id.localeCompare(b.id));

  const within = (ms: number) => rows.filter((r) => now - r.lastSeenAt <= ms).length;
  const levels = new Map<number, number>();
  for (const r of rows) if (r.campaignHighest !== null) levels.set(r.campaignHighest, (levels.get(r.campaignHighest) ?? 0) + 1);
  const left = new Map<PlayerActivity, number>();
  for (const r of rows) left.set(r.lastActivity, (left.get(r.lastActivity) ?? 0) + 1);

  const summary: AdminPlayersSummary = {
    players: rows.length,
    accounts: rows.filter((r) => r.kind === 'account').length,
    guests: rows.filter((r) => r.kind === 'guest').length,
    google: rows.filter((r) => r.google).length,
    seen24h: within(DAY),
    seen7d: within(7 * DAY),
    seen30d: within(30 * DAY),
    joined7d: rows.filter((r) => now - r.createdAt <= 7 * DAY).length,
    funnel: [
      { label: 'Known to the server', n: rows.length },
      { label: 'Played an online match', n: rows.filter((r) => r.matches.played > 0).length },
      { label: 'Finished an online match', n: rows.filter((r) => r.matches.finished > 0).length },
      { label: 'Won an online match', n: rows.filter((r) => r.matches.wins > 0).length },
      { label: 'Cleared a campaign level (11+)', n: rows.filter((r) => r.campaignHighest !== null).length },
      { label: 'Claimed a world tile', n: rows.filter((r) => r.tiles > 0).length },
    ],
    highestLevel: [...levels.entries()].sort((a, b) => a[0] - b[0]).map(([level, n]) => ({ level, n })),
    leftAt: [...left.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([activity, n]) => ({ activity, label: ACTIVITY_LABEL[activity], n })),
  };
  return { summary, rows: rows.slice(0, limit), total: rows.length, limit };
};
