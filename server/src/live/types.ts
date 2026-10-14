// Live duels — data shapes and the storage port. Two adapters implement it: memory (dev/tests)
// and Postgres (production). Each `transact` call is ONE atomic step: in Postgres a transaction
// holding row locks, in memory a serialized section whose writes are applied all at once.
import type { Player, State } from '../../../src/engine/index.js';
import type { MatchStatus, OnlineGameResult } from '../protocol.js';

/** What the app tells the server it is doing (heartbeat every 20 s while visible). */
export type PresenceStatus = 'idle' | 'offline_game' | 'in_match' | 'in_live' | 'tutorial';
export const PRESENCE_STATUSES: readonly PresenceStatus[] = ['idle', 'offline_game', 'in_match', 'in_live', 'tutorial'];

export type LivePlayer = {
  playerId: string;
  /** The ONE live match this player is in, or null. */
  liveMatchId: string | null;
  /** Settings switch "Allow live challenges" (default on). */
  challengesEnabled: boolean;
  presence: PresenceStatus | null;
  presenceAt: number | null;
  presenceMatchId: string | null;
};

export const defaultLivePlayer = (playerId: string): LivePlayer => ({
  playerId,
  liveMatchId: null,
  challengesEnabled: true,
  presence: null,
  presenceAt: null,
  presenceMatchId: null,
});

/**
 * Why the last live session ended. `strikes` is LEGACY read-only tolerance (the old "two strikes →
 * back to 24-hour turns" escape hatch): nothing produces it any more, but a finished row written
 * before this change may still carry it. Only `finished` (match over — resignation, timeout or a
 * normal end) and `left` (legacy leave) can be produced now.
 */
export type LiveEndReason = 'finished' | 'left' | 'strikes';

/** Live-mode columns of one match (matches.live_*). */
export type LiveMatch = {
  matchId: string;
  /** Epoch ms when the current live session started; null when not live. */
  liveSince: number | null;
  /** Live turn length snapshot for the session. */
  limitMs: number | null;
  /** Seat that last pressed Leave live (a record only; leaving now forfeits the match). */
  leftBy: Player | null;
  /** LEGACY (never set now): the turn (turnStartRevision) an old leave would have auto-played. */
  tailRev: number | null;
  /** LEGACY (never set now): the revision an old timeout was decided for. */
  autoplayRev: number | null;
  /** The match's normal (24-hour) turn timeout, restored when live ends. */
  normalTimeoutMs: number | null;
  endedReason: LiveEndReason | null;
  endedAt: number | null;
  /** Seat whose timeout or strikes ended the last session (for the end window), null otherwise. */
  endedBySeat: Player | null;
};

export const defaultLiveMatch = (matchId: string): LiveMatch => ({
  matchId,
  liveSince: null,
  limitMs: null,
  leftBy: null,
  tailRev: null,
  autoplayRev: null,
  normalTimeoutMs: null,
  endedReason: null,
  endedAt: null,
  endedBySeat: null,
});

/** True while the live layer (not the 24-hour grace/timeout rule) owns this match's deadline. */
export const liveManaged = (live: LiveMatch): boolean =>
  live.liveSince !== null || live.tailRev !== null || live.autoplayRev !== null;

export type ChallengeKind = 'live' | 'rematch';
export type ChallengeStatus = 'pending' | 'accepted' | 'declined' | 'expired' | 'cancelled';

export type Challenge = {
  id: string;
  matchId: string;
  fromPlayer: string;
  toPlayer: string;
  kind: ChallengeKind;
  limitMs: number;
  status: ChallengeStatus;
  createdAt: number;
  expiresAt: number;
  respondedAt: number | null;
  /** Rematch only: the new (already live) match. */
  newMatchId: string | null;
};

/** The few match fields the live layer needs, read under the match row lock. */
export type MatchCore = {
  id: string;
  status: MatchStatus;
  revision: number;
  state: State;
  turnDeadlineAt: number | null;
  turnTimeoutMs: number;
  turnStartRevision: number;
};

export type ParticipantCore = { playerId: string; seat: Player };

export type LockedMatch = { match: MatchCore; live: LiveMatch; participants: ParticipantCore[] };

/** One atomic unit of work. Lock order is always: challenge → match → players. */
export interface LiveTx {
  /** Lock and read a match with its live columns and seats. */
  match(matchId: string): Promise<LockedMatch | null>;
  /** Lock and read players (rows are created lazily with defaults). Sorted by id. */
  players(ids: readonly string[]): Promise<LivePlayer[]>;
  /** Lock and read one challenge. */
  challenge(id: string): Promise<Challenge | null>;
  pendingForMatch(matchId: string): Promise<Challenge[]>;
  /** Challenges sent by `fromPlayer` in `matchId` created at or after `since`. */
  sentSince(matchId: string, fromPlayer: string, since: number): Promise<Challenge[]>;
  saveLive(live: LiveMatch): Promise<void>;
  /** Write the match clock (turn_timeout_ms / turn_deadline_at). */
  saveClock(matchId: string, clock: { turnTimeoutMs: number; turnDeadlineAt: number | null }): Promise<void>;
  /**
   * Finish the match in the SAME row-locked step (the match row is already locked by `match()`):
   * used by the real-time forfeit, where leaving ends the duel with the leaver as the loser and
   * reason `resigned`. Idempotent — a match already `finished` is left untouched, and the revision
   * is NOT bumped (exactly like the base `resignMatch`).
   */
  finishMatch(matchId: string, playerId: string, result: OnlineGameResult, now: number): Promise<void>;
  savePlayer(player: LivePlayer): Promise<void>;
  insertChallenge(challenge: Challenge): Promise<void>;
  saveChallenge(challenge: Challenge): Promise<void>;
}

export interface LiveStore {
  transact<T>(fn: (tx: LiveTx) => Promise<T>): Promise<T>;
  /** Unlocked reads. */
  player(playerId: string): Promise<LivePlayer>;
  liveOf(matchId: string): Promise<LiveMatch>;
  /** Presence heartbeat (single-row write, no lock needed). */
  setPresence(playerId: string, status: PresenceStatus, matchId: string | null, now: number): Promise<void>;
  setChallengesEnabled(playerId: string, enabled: boolean): Promise<void>;
  /** Pending challenges to this player plus challenges from this player created since `since`. */
  challengesInvolving(playerId: string, since: number): Promise<Challenge[]>;
  /** Live-managed active matches whose deadline is past (for the sweeper). */
  dueMatchIds(now: number): Promise<string[]>;
  /** Cheap pre-check: is a live decision due (deadline past, or finished while live-managed)? */
  needsTick(matchId: string, now: number): Promise<boolean>;
}
