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
  /** Revision of the last completed turn boundary. */
  turnStartRevision: number;
  /** Authoritative state at the last turn boundary (server-only; drives opponent views). */
  turnStartState: State | null;
  /** When a waiting match expires unused. */
  expiresAt: number | null;
  /** Phase 7: waiting match is in the Find Opponent pool (not invite-only). */
  openQueue: boolean;
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
   * Caller then joins via addParticipant + activateMatch.
   */
  findOpenQueueMatch(playerId: string): Promise<MatchRecord | null>;
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
