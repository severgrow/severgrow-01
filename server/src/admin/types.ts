// The admin dashboard's data port (docs/ADMIN.md). Every method here is READ-ONLY except
// `writeSeen`, `triage` and `audit` — v1 has exactly one content mutation (report triage) plus the
// admin's own "last looked" cursor.
//
// Two implementations: `postgres.ts` (the real one; bounded SQL, every list `order by … limit …`)
// and `memory.ts` (dev servers and tests). Nothing here can read `matches.state`, `player_tokens`,
// invite codes or hidden hands — the field lists below are the whole contract, and the router
// returns exactly these.
import type { FeedbackKind } from '../feedback/feedback.js';
import type { AdminPlayers } from './players.js';

export type AdminTriageStatus = 'new' | 'reviewing' | 'resolved';

/** A day bucket keyed by UTC day (`YYYY-MM-DD`), the same key the Seeds economy stores. */
/** A day bucket keyed by UTC day (`YYYY-MM-DD`), the same key the Seeds economy stores. */
export type AdminDayCount = { day: string; n: number };
export type AdminValueCount = { value: string; n: number };

/**
 * Duel matches completed, split by the mode the MATCH table can actually distinguish.
 *
 * `matches` has no mode column: it records `open_queue` and the live-duel columns. So the honest
 * split is queue (Find Opponent / parked), friend (invite code) and live (a live-duel match).
 * Campaign and Training never create a `matches` row at all — they are counted from
 * `seed_reward_receipts` on the Campaign screen instead, and this type never pretends otherwise.
 */
export type AdminModeCounts = { queue: number; friend: number; live: number };

/** One shipped build, after normalising the compound build string (see `normalizeBuild`). */
export type AdminBuildRow = {
  /** The grouping key: `asset · version` (or `(no build)`). */
  key: string;
  /** The leading emitted asset name, e.g. `index-DYGB0cL9.js`, or null. */
  asset: string | null;
  /** The client version segment, e.g. `0.5.0`, or null. */
  version: string | null;
  /** Everything after the version (rules/channel label), or null. */
  label: string | null;
  crashes: number;
  reports: number;
  total: number;
};

export type AdminOverview = {
  serverNow: number;
  rulesVersion: string;
  matches: {
    finishedToday: { total: number; byMode: AdminModeCounts };
    finished7d: { total: number; byMode: AdminModeCounts };
    byStatus: { waiting: number; active: number; finished: number };
    finishedByDay: { day: string; queue: number; friend: number; live: number }[];
  };
  reports: {
    today: number;
    last7d: number;
    crashes7d: number;
    reports7d: number;
    byBuild: AdminBuildRow[];
  };
  seeds: { earned7d: number; spent7d: number; byDay: { day: string; earned: number; spent: number }[] };
  world: { totalClaims: number; claims7d: number; cellsTotal: number; owners: number };
  health: { dbOk: boolean; dbMs: number | null };
};

export type AdminReportRow = {
  id: string;
  createdAt: number;
  kind: FeedbackKind;
  playerId: string | null;
  playerName: string | null;
  /** The public 4-character tag for the linked player, when one is linked. */
  playerTag: string | null;
  message: string;
  context: Record<string, unknown>;
  build: string | null;
  /** Normalised build key, so the build filter and the build view agree. */
  buildKey: string;
  userAgent: string | null;
  status: AdminTriageStatus;
  note: string;
  triagedAt: number | null;
  triagedBy: string | null;
};

export type AdminReportFilter = {
  kind?: FeedbackKind;
  /** A normalised build key, as returned in `buildKey`. */
  build?: string;
  status?: AdminTriageStatus;
  since?: number;
  until?: number;
  /** Keyset cursor: `${createdAt}|${id}`, from a previous page's `nextCursor`. */
  cursor?: string;
  limit: number;
};

export type AdminPage<T> = { rows: T[]; total: number; nextCursor: string | null };

export type AdminAuditEntry = {
  id: string;
  actorId: string;
  action: string;
  targetType: string;
  targetId: string;
  detail: Record<string, unknown>;
  createdAt: number;
};

/** "What needs me": all three come from windows the live sweeper already enforces. */
export type AdminStuck = {
  expiredActive: { count: number; oldest: number | null; rows: AdminStuckMatch[] };
  expiredWaiting: { count: number; oldest: number | null; rows: AdminStuckMatch[] };
  cleanupEligibleGuests: { count: number; oldest: number | null };
  /** The real windows, read from the running config rather than guessed. */
  windows: { guestMaxAgeMs: number; waitingExpireMs: number; turnTimeoutMs: number };
};

export type AdminStuckMatch = {
  id: string;
  status: string;
  mode: 'queue' | 'friend' | 'live';
  createdAt: number;
  dueAt: number | null;
  seats: number;
};

export type AdminPlayerRow = {
  id: string;
  tag: string;
  kind: 'guest' | 'account';
  displayName: string | null;
  createdAt: number;
  upgradedAt: number | null;
  /** How the account is linked, e.g. ['google']. Never the subject or the email. */
  providers: string[];
};

export type AdminPlayerQuery = { id?: string; name?: string; tag?: string };

export type AdminPlayerResult = {
  player: AdminPlayerRow;
  /** Which field matched: an exact id, a name, or a tag found by scanning recent players. */
  matchedBy: 'id' | 'name' | 'tag';
  matches: { total: number; finished: number; wins: number; losses: number; draws: number; recent: AdminPlayerMatch[] };
  wallet: { balance: number; lifetimeEarned: number; lifetimeSpent: number };
  ledger: AdminLedgerRow[];
  rewards: { awarded: number; denied: number; deniedByReason: AdminValueCount[] };
  tiles: { total: number; recent: { cellId: string; claimedAt: number }[] };
  /** Set when a tag search could only consider the most recent N players (the tag is a hash). */
  tagScanLimit: number | null;
};

export type AdminPlayerMatch = {
  id: string;
  mode: 'queue' | 'friend' | 'live';
  status: string;
  createdAt: number;
  finishedAt: number | null;
  outcome: 'win' | 'loss' | 'draw' | null;
  opponentName: string | null;
};

export type AdminMatchRow = {
  id: string;
  mode: 'queue' | 'friend' | 'live';
  status: string;
  rulesVersion: string;
  revision: number;
  createdAt: number;
  updatedAt: number;
  finishedAt: number | null;
  turnDeadlineAt: number | null;
  finishReason: string | null;
  winnerSeat: number | null;
  players: { seat: number; playerId: string; name: string | null }[];
  moveCount: number;
};

export type AdminMatchFilter = {
  mode?: 'queue' | 'friend' | 'live';
  status?: 'waiting' | 'active' | 'finished';
  playerId?: string;
  since?: number;
  until?: number;
  cursor?: string;
  limit: number;
};

export type AdminMatchDetail = {
  match: AdminMatchRow;
  /** A textual timeline: committed moves with their action name and time. Never hidden state. */
  moves: { revision: number; seat: number; playerId: string; action: string; createdAt: number; events: number }[];
  /** The recorded event kinds per move, in order — enough to read the game, no private payloads. */
  truncated: boolean;
};

export type AdminLedgerRow = {
  id: string;
  playerId: string;
  playerName: string | null;
  delta: number;
  balanceAfter: number;
  category: string;
  sourceKey: string;
  createdAt: number;
};

export type AdminLedgerFilter = {
  playerId?: string;
  category?: string;
  since?: number;
  until?: number;
  cursor?: string;
  limit: number;
};

export type AdminEconomy = {
  serverNow: number;
  totals: { balance: number; lifetimeEarned: number; lifetimeSpent: number; wallets: number };
  byCategory: { category: string; entries: number; minted: number; spent: number; net: number }[];
  receipts: { awarded: number; denied: number; byDenial: AdminValueCount[]; byMode: AdminValueCount[] };
  /** lifetimeEarned / lifetimeSpent — how much has been minted per Seed actually spent. */
  inflationRatio: number | null;
  caps: { tileCost: number; utcDailyRepeatableCap: number; economies: string[] };
};

export type AdminWorld = {
  serverNow: number;
  revision: number;
  cellsTotal: number;
  /** Every cell id in the frozen v1 landmass, so the map can draw hexes nobody has claimed. */
  cellIds: string[];
  totalClaims: number;
  owners: number;
  claimsByDay: AdminDayCount[];
  recentClaims: { cellId: string; ownerId: string; ownerName: string | null; claimedAt: number; source: string }[];
  /** Claims keyed by UTC day, for the world-growth replay's day picker. */
  claimsByDayIndex: { day: string; claims: { cellId: string; ownerId: string; claimedAt: number }[] }[];
  replayDays: string[];
};

export type AdminCampaign = {
  /** Every verified campaign result the server recorded (`seed_reward_receipts`, mode 'campaign'). */
  attempts: number;
  /** Receipts that actually awarded Seeds — a first clear for that player on that level. */
  firstClears: number;
  /** Total Seeds paid out by campaign first clears. */
  awarded: number;
  denials: { count: number; byReason: AdminValueCount[] };
  /** Per OPAQUE level id, with the level number the server recorded when it paid a clear. */
  byLevel: { levelId: string; level: number | null; firstClears: number; awarded: number; attempts: number; denials: number }[];
  /** Rolled up only from levels whose recorded number is known (see `completeLevelListKnown`). */
  byChapter: { chapter: number; firstClears: number; awarded: number }[];
  sessions: { day: string; clears: number }[];
  /** The levels the Seed economy pays a chapter bonus at (10, 20, 30, 40, 50 today). */
  chapterBoundaries: number[];
  /**
   * Deliberately FALSE, always. The dashboard reads recorded receipts, not the campaign authoring
   * table, so it cannot enumerate levels nobody has ever reached: such a level leaves no row. The
   * UI must say this rather than imply the list is complete.
   */
  completeLevelListKnown: false;
};

export type AdminFunnel = {
  serverNow: number;
  playersCreatedByDay: { day: string; guests: number; accounts: number }[];
  /** Exact: how many Google accounts were linked per day, from `player_identities`. */
  accountsLinkedByDay: AdminDayCount[];
  totals: { players: number; guests: number; accounts: number; withUpgradedAt: number };
  /** True when at least one account predates the `upgraded_at` column (its value cannot be trusted). */
  upgradedAtMayBeUnpopulated: boolean;
};

export type AdminSeedGrant = { playerId: string; amount: number; reason: string; actorId: string; requestId: string; now: number };
/** The largest single grant, so a slipped digit can never mint a fortune. */
export const ADMIN_GRANT_MAX = 1000;
export const ADMIN_GRANT_REASON_MAX = 200;

export interface AdminStore {
  readSeen(adminId: string): Promise<number | null>;
  writeSeen(adminId: string, at: number): Promise<void>;
  /** New rows since `since`, for the "since you last looked" counters. */
  countsSince(since: number, now: number): Promise<{ reports: number; crashes: number; claims: number; matches: number }>;
  overview(now: number): Promise<AdminOverview>;
  reports(filter: AdminReportFilter): Promise<AdminPage<AdminReportRow>>;
  triage(input: { reportId: string; status: AdminTriageStatus; note: string; actorId: string; now: number }): Promise<{ changed: boolean; previous: AdminTriageStatus | null } | null>;
  audit(entry: AdminAuditEntry): Promise<void>;
  /**
   * The dashboard's one Seeds write (owner, 2026-10-24): add Seeds to a player's wallet, recorded in
   * the ledger as `admin_grant` under `admin:<requestId>` (so a repeated request never pays twice),
   * with the reason and the admin's id in its metadata. Null when the player does not exist.
   */
  grantSeeds(input: AdminSeedGrant): Promise<{ balance: number; replayed: boolean } | null>;
  stuck(now: number, windows: { guestMaxAgeMs: number; waitingExpireMs: number; turnTimeoutMs: number }): Promise<AdminStuck>;
  rulesVersionCounts(): Promise<AdminValueCount[]>;
  funnel(now: number): Promise<AdminFunnel>;
  economy(now: number): Promise<AdminEconomy>;
  playerLookup(query: AdminPlayerQuery): Promise<AdminPlayerResult | null>;
  matches(filter: AdminMatchFilter): Promise<AdminPage<AdminMatchRow>>;
  matchDetail(id: string, moveLimit: number): Promise<AdminMatchDetail | null>;
  ledger(filter: AdminLedgerFilter): Promise<AdminPage<AdminLedgerRow>>;
  world(now: number): Promise<AdminWorld>;
  campaign(): Promise<AdminCampaign>;
  /** Every player the server knows, with the last recorded activity of each (players.ts). */
  players(now: number): Promise<AdminPlayers>;
}

/** Bounded scan for a tag search: the tag is a hash of the id, so it is not indexable. */
export const TAG_SCAN_LIMIT = 2000;
/** Hard cap on rows a CSV export will return. */
export const CSV_MAX_ROWS = 5000;
/** Never return more than this many rows for one page. */
export const MAX_PAGE = 200;

/**
 * Normalise a report's compound build string into a stable grouping key.
 *
 * Real values look like `index-DYGB0cL9.js · 0.5.0 · futasaku0.4-strength-draw`. Grouping on the
 * raw string fragments: every deploy has a new asset hash. So the key is the FIRST TWO segments
 * (emitted asset + client version) — which is what "the worst shipped build" means — and the third
 * segment (the rules/channel label) is kept beside it, not inside the key.
 */
export const normalizeBuild = (raw: string | null | undefined): { key: string; asset: string | null; version: string | null; label: string | null } => {
  const value = (raw ?? '').trim();
  if (value === '') return { key: '(no build)', asset: null, version: null, label: null };
  const parts = value.split('·').map((part) => part.trim()).filter((part) => part !== '');
  const asset = parts[0] ?? null;
  const version = parts[1] ?? null;
  const label = parts.length > 2 ? parts.slice(2).join(' · ') : null;
  const key = [asset, version].filter((part): part is string => part !== null).join(' · ');
  return { key: key === '' ? '(no build)' : key, asset, version, label };
};
