// The storage port. Every implementation must provide the same atomicity contract for
// `commitMove`: no two moves may be applied on the same revision, and a repeated requestId must
// return the original outcome without applying again.
import type { Action, Event, Player, RulesConfig, State } from '../../../src/engine/index.js';
import type { MatchStatus, OnlineGameResult, PlayerSummary } from '../protocol.js';

export type PlayerRecord = {
  id: string;
  kind: 'guest' | 'account';
  displayName: string | null;
  createdAt: number;
  upgradedAt: number | null;
  /**
   * Permanent "test/verification traffic" marker (migration 0013). Read-only here: the game never
   * sets it, the admin dashboard hides marked rows, and only `server/scripts` tooling flips it by
   * direct SQL. Absent/false means a real player.
   */
  isTest?: boolean;
};

export type TokenRecord = {
  id: string;
  playerId: string;
  tokenHash: string;
  createdAt: number;
  revokedAt: number | null;
};

export type MatchRecord = {
  id: string;
  inviteCode: string;
  /** Immutable: the ruleset this match was created under. Never reinterpreted later. */
  rulesVersion: string;
  /** Immutable: server-chosen seed the deal follows from. */
  seed: number;
  /** Immutable: the opening configuration snapshot. */
  config: RulesConfig;
  /** Immutable: the seat that moves first, from the engine lottery. */
  startingPlayer: Player;
  status: MatchStatus;
  /** Monotonic revision; incremented by exactly one per committed move. */
  revision: number;
  /** AUTHORITATIVE state. Never sent to a client; only `viewFor` projections are. */
  state: State;
  result: OnlineGameResult | null;
  createdAt: number;
  updatedAt: number;
  finishedAt: number | null;
  /** Epoch ms when the acting seat's clock expires; null when waiting/finished. */
  turnDeadlineAt: number | null;
  /** Snapshot of the turn timeout used for this match (config changes never alter it). */
  turnTimeoutMs: number;
  /** Per-seat count of grace periods already spent in this match (index = seat). */
  graceUsed: [number, number];
  /** Snapshot of the per-player grace allowance for this match. */
  gracePeriods: number;
  /** Snapshot of how far one grace extends the deadline (defaults to turnTimeoutMs). */
  graceExtensionMs: number;
  /** Revision of the last completed turn boundary. */
  turnStartRevision: number;
  /** Authoritative state at the last turn boundary (server-only; drives opponent views). */
  turnStartState: State | null;
  /** When a waiting match expires unused. */
  expiresAt: number | null;
  /** Phase 7: waiting match is in the Find Opponent pool (not invite-only). */
  openQueue: boolean;
  /** Live duels own this match's deadline (server/src/live/): the 24-hour grace/timeout rule skips it. */
  liveManaged?: boolean;
  /**
   * Permanent "test/verification traffic" marker (migration 0013). Same rules as
   * `PlayerRecord.isTest`: never written by the game, only read by the admin dashboard.
   */
  isTest?: boolean;
  /**
   * What kind of duel this is (migration 0014): `duel` is the ordinary match, `territory` is the
   * linked duel a Territory challenge creates. Absent on historical rows means `duel`.
   */
  kind?: 'duel' | 'territory';
};

export type Participant = {
  matchId: string;
  playerId: string;
  seat: Player;
  joinedAt: number;
  lastSeenAt: number;
};

export type MoveRecord = {
  matchId: string;
  revision: number;
  seat: Player;
  playerId: string;
  action: Action;
  /** The raw events of this move (server-side). Filtered per player before sending. */
  events: Event[];
  requestId: string;
  createdAt: number;
};

export type DeviceLinkCode = {
  id: string;
  codeHash: string;
  playerId: string;
  createdAt: number;
  expiresAt: number;
  usedAt: number | null;
};

export type Fail = { ok: false; code: string; reason: string };

/**
 * The outcome of one atomic Find-Opponent step (Phase 7 open queue).
 *
 * `paired` is true when the player joined an existing parked search; false when they parked
 * (a brand-new parked match) or were already parked (their own match is returned unchanged, so a
 * repeated tap is idempotent and never creates a second entry).
 */
export type OpenQueueSeat =
  | { ok: true; match: MatchRecord; seat: Player; paired: boolean }
  | Fail;

/** What the rules layer decided for one submitted action, computed inside the atomic section. */
export type Decision =
  | { kind: 'reject'; code: string; reason: string }
  | {
      kind: 'apply';
      nextState: State;
      events: Event[];
      action: Action;
      status: MatchStatus;
      result: OnlineGameResult | null;
      /** When true, refresh turn_deadline_at from now + turnTimeoutMs for the new actor. */
      refreshDeadline: boolean;
      /** When true, replace turn_start_state/revision with the post-action state. */
      advanceTurnBoundary: boolean;
    };

export type CommitInput = {
  matchId: string;
  playerId: string;
  expectedRevision: number;
  /** Base request id (batch uses `${requestId}#${index}` for each move row). */
  requestId: string;
  now: number;
  /**
   * Called inside the lock after the participant, idempotency and revision checks. Must be
   * synchronous so the whole decision+write is one atomic step.
   */
  decide: (ctx: { match: MatchRecord; seat: Player }) => Decision;
};

export type CommitBatchInput = {
  matchId: string;
  playerId: string;
  expectedRevision: number;
  requestId: string;
  now: number;
  actions: readonly Action[];
  decideOne: (ctx: { match: MatchRecord; seat: Player; action: Action }) => Decision;
};

export type CommitResult =
  | { ok: true; replayed: boolean; match: MatchRecord; move: MoveRecord; moves: MoveRecord[] }
  | Fail;

export type SweepResult = {
  timedOut: number;
  expiredWaiting: number;
  deletedGuests: number;
  /** Active matches whose deadline was pushed forward by a spent grace (not finished). */
  graceExtended: number;
  /** The ids of those matches, so the caller can publish the state change. */
  graceExtendedIds: string[];
  /**
   * The ids of the matches this sweep just FINISHED by timeout, so the caller publishes the terminal
   * status on the same ping path a completed turn uses. Without it a timeout is only discovered by
   * each device's own poll, so a device could sit on a stale board until its next fetch.
   */
  timedOutIds: string[];
};

export type MatchListRow = {
  match: MatchRecord;
  mySeat: Player;
  lastSeenAt: number;
  opponentId: string | null;
  opponentName: string | null;
};

export interface Storage {
  createPlayer(player: PlayerRecord): Promise<void>;
  playerById(id: string): Promise<PlayerRecord | null>;
  updatePlayer(player: PlayerRecord): Promise<void>;
  issueToken(token: TokenRecord): Promise<void>;
  playerByTokenHash(tokenHash: string): Promise<PlayerRecord | null>;

  createMatch(match: MatchRecord): Promise<{ ok: true } | Fail>;
  /**
   * Oldest waiting open-queue match that `playerId` is not already in, or null.
   * Read-only helper (used to assert the pool is empty); the pairing itself goes through
   * `claimOpenQueueOrPark`, which is one atomic step.
   */
  findOpenQueueMatch(playerId: string): Promise<MatchRecord | null>;

  /**
   * Phase 7 Find Opponent, atomic and race-safe. Inside one serialized section (in Postgres, a
   * transaction holding an advisory lock; in memory, a synchronous critical section):
   *
   *   1. the player's own `waiting` open-queue match, if any — returned as-is so a repeated tap
   *      never creates a second parked entry (pairing with self is impossible);
   *   2. else the oldest `waiting` open-queue match with one free seat (FIFO) — the player is
   *      seated in the free seat and the match is activated in the same step, so two simultaneous
   *      searchers can never both claim it or both end up waiting;
   *   3. else `parked` is inserted and the player is seated in seat 0.
   *
   * `maxOpenMatches` is the per-player cap on unfinished matches; a player at the cap is refused
   * (case 2 and 3) rather than silently parked or matched. `expiresAt` on `parked` is the
   * parked-search expiry, set by the caller from `waitingExpireMs`.
   */
  claimOpenQueueOrPark(input: {
    playerId: string;
    parked: MatchRecord;
    now: number;
    turnTimeoutMs: number;
    maxOpenMatches: number;
  }): Promise<OpenQueueSeat>;

  /** The player's own `waiting` open-queue match, or null. Used by cancel and idempotent re-taps. */
  openQueueMatchOfPlayer(playerId: string): Promise<MatchRecord | null>;

  /**
   * Cancel a parked search: delete the player's `waiting` open-queue match when they are its only
   * participant, so no later searcher can be matched into it. Never touches an `active`/`finished`
   * match. Returns true when a parked search was retired.
   */
  cancelOpenQueueMatch(playerId: string, now: number): Promise<boolean>;

  /**
   * Cancel (retire) ONE of the player's own `waiting` matches by id — the invite screen's
   * "Cancel match" (an invite nobody ever joined, or a parked search). Only the owner may cancel,
   * and only while the match is `waiting` with that player as its SOLE participant, so an `active`
   * or `finished` match (or someone else's match) is never touched. The match row is deleted, so
   * its invite code no longer resolves and a later join cannot land in it. Idempotent: a repeat
   * call — or a match that already activated — is a calm `false` and changes nothing.
   */
  cancelWaitingMatch(playerId: string, matchId: string): Promise<boolean>;
  matchById(id: string): Promise<MatchRecord | null>;
  matchByInviteCode(code: string): Promise<MatchRecord | null>;
  /** Every match the player is a participant of (any status). */
  matchesOfPlayer(playerId: string): Promise<MatchRecord[]>;
  /** One-query match list with opponent names (P-15). */
  listMatchesForPlayer(playerId: string): Promise<MatchListRow[]>;
  addParticipant(participant: Participant): Promise<{ ok: true } | Fail>;
  /** Moves a waiting match to active once both seats are filled. Returns the updated match. */
  activateMatch(matchId: string, now: number, turnTimeoutMs: number): Promise<MatchRecord | null>;
  participantsOf(matchId: string): Promise<Participant[]>;
  participantOf(matchId: string, playerId: string): Promise<Participant | null>;
  touchParticipant(matchId: string, playerId: string, now: number): Promise<void>;

  /** Committed moves with `revision > sinceRevision`, in ascending revision order. */
  movesOf(matchId: string, sinceRevision: number): Promise<MoveRecord[]>;
  /** The whole atomic pipeline: participant → idempotency → revision → decide → persist. */
  commitMove(input: CommitInput): Promise<CommitResult>;
  /** Atomic multi-action commit (max 12). Same requestId replays the whole batch. */
  commitBatch(input: CommitBatchInput): Promise<CommitResult>;

  /**
   * ONE decision point for expiry (P-8): inside a row lock, finish an overdue active match
   * (timeout) or an expired waiting match. Idempotent. Returns the (possibly updated) match.
   */
  applyExpiry(matchId: string, now: number): Promise<MatchRecord | null>;

  /** Finish by resign (not an engine action). */
  resignMatch(matchId: string, playerId: string, now: number, result: OnlineGameResult): Promise<MatchRecord | null>;

  /** Housekeeping: timeouts, waiting expiry, stale guest cleanup. Idempotent. */
  sweep(now: number, guestMaxAgeMs: number): Promise<SweepResult>;

  /** Postgres rate limit: increment bucket in the current window; ok=false when over max. */
  hitRateLimit(bucket: string, windowStart: number, max: number): Promise<{ ok: boolean; count: number }>;

  createLinkCode(code: DeviceLinkCode): Promise<void>;
  /** Redeem a valid unused code; returns player id or null (same error for wrong/expired). */
  redeemLinkCode(codeHash: string, now: number): Promise<{ playerId: string } | null>;

  /** A real round-trip used by `/v1/health?db=1` (keep-alive / pause detection). */
  ping(): Promise<void>;
}

export const openMatchCount = (matches: readonly MatchRecord[]): number =>
  matches.filter((m) => m.status !== 'finished').length;

export const playerSummary = (p: PlayerRecord): PlayerSummary => ({
  id: p.id,
  kind: p.kind,
  displayName: p.displayName,
});
