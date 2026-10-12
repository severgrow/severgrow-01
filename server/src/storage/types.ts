// The storage port. Every implementation must provide the same atomicity contract for
// `commitMove`: no two moves may be applied on the same revision, and a repeated requestId must
// return the original outcome without applying again.
import type { Action, Event, GameResult, Player, RulesConfig, State } from '../../../src/engine/index.js';
import type { MatchStatus, PlayerSummary } from '../protocol.js';

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
  result: GameResult | null;
  createdAt: number;
  updatedAt: number;
  finishedAt: number | null;
};

export type Participant = { matchId: string; playerId: string; seat: Player; joinedAt: number };

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
      result: GameResult | null;
    };

export type CommitInput = {
  matchId: string;
  playerId: string;
  expectedRevision: number;
  requestId: string;
  now: number;
  /**
   * Called inside the lock after the participant, idempotency and revision checks. Must be
   * synchronous so the whole decision+write is one atomic step.
   */
  decide: (ctx: { match: MatchRecord; seat: Player }) => Decision;
};

export type CommitResult =
  | { ok: true; replayed: boolean; match: MatchRecord; move: MoveRecord }
  | Fail;

export interface Storage {
  createPlayer(player: PlayerRecord): Promise<void>;
  playerById(id: string): Promise<PlayerRecord | null>;
  updatePlayer(player: PlayerRecord): Promise<void>;
  issueToken(token: TokenRecord): Promise<void>;
  playerByTokenHash(tokenHash: string): Promise<PlayerRecord | null>;

  createMatch(match: MatchRecord): Promise<{ ok: true } | Fail>;
  matchById(id: string): Promise<MatchRecord | null>;
  matchByInviteCode(code: string): Promise<MatchRecord | null>;
  /** Every match the player is a participant of (any status). */
  matchesOfPlayer(playerId: string): Promise<MatchRecord[]>;
  addParticipant(participant: Participant): Promise<{ ok: true } | Fail>;
  /** Moves a waiting match to active once both seats are filled. Returns the updated match. */
  activateMatch(matchId: string, now: number): Promise<MatchRecord | null>;
  participantsOf(matchId: string): Promise<Participant[]>;
  participantOf(matchId: string, playerId: string): Promise<Participant | null>;

  /** Committed moves with `revision > sinceRevision`, in ascending revision order. */
  movesOf(matchId: string, sinceRevision: number): Promise<MoveRecord[]>;
  /** The whole atomic pipeline: participant → idempotency → revision → decide → persist. */
  commitMove(input: CommitInput): Promise<CommitResult>;
}

export const openMatchCount = (matches: readonly MatchRecord[]): number =>
  matches.filter((m) => m.status !== 'finished').length;

export const playerSummary = (p: PlayerRecord): PlayerSummary => ({
  id: p.id,
  kind: p.kind,
  displayName: p.displayName,
});
