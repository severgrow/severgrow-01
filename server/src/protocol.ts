// The wire format shared by the server and its TypeScript client. These are the ONLY shapes
// that cross the network: a match summary and a player-specific view. The authoritative engine
// `State` (deck order, both hands, seed) is never part of any payload.
import type { Action, EndReason, Event, GameResult, Player, View } from '../../src/engine/index.js';

export type MatchStatus = 'waiting' | 'active' | 'finished';

/** Server-only end reasons for resign / timeout — engine EndReason stays untouched. */
export type OnlineEndReason = EndReason | 'timeout' | 'resigned';

export type OnlineGameResult = {
  winner: Player | null;
  reason: OnlineEndReason;
  scores: [number, number];
  undercut?: boolean;
  deadwood?: [number, number];
  strengths?: [number, number];
};

export const fromEngineResult = (result: GameResult): OnlineGameResult => ({
  winner: result.winner,
  reason: result.reason,
  scores: result.scores,
  ...(result.undercut !== undefined ? { undercut: result.undercut } : {}),
  ...(result.deadwood !== undefined ? { deadwood: result.deadwood } : {}),
  ...(result.strengths !== undefined ? { strengths: result.strengths } : {}),
});

/** A player-safe snapshot. `view` is the engine's `viewFor(state, seat)`; `events` are filtered. */
export type MatchViewPayload = {
  matchId: string;
  rulesVersion: string;
  status: MatchStatus;
  revision: number;
  /** Public revision at the last completed turn boundary (for gated clients). */
  turnStartRevision: number;
  seat: Player;
  /** The shared-engine starting-player contract: the seat that moves first (seeded lottery). */
  startingPlayer: Player;
  /** Whose turn it is (public), so the client can show the correct waiting state. */
  turnPlayer: Player;
  /** Seat that must act right now (may differ during Rot). */
  actor: Player;
  view: View;
  /** Legal actions for this seat, or [] when it is not this seat's turn or the match is over. */
  legalActions: Action[];
  /** Public-safe events since the requested revision (opponent deck draws are hidden). */
  events: Event[];
  /** Epoch ms when this seat's turn clock expires; null when finished/waiting. */
  turnDeadlineAt: number | null;
  /** Per-seat grace periods already spent (index = seat). Public: grace is not a secret. */
  graceUsed: [number, number];
  /** Grace periods each player gets in this match. */
  gracePeriods: number;
  opponent: { seat: Player; playerId: string; displayName: string | null } | null;
  result: OnlineGameResult | null;
  /**
   * What THIS seat was paid for a finished duel, when the server knows it. Present only on a
   * finished match that actually settled (`settleOnline` returns before settling a resignation or
   * a timeout, so those carry no field). It is a REPORT, never a promise: `awarded` is what the
   * receipt says, which is 0 when a daily cap denied the reward — the client shows nothing for 0
   * rather than "+0".
   */
  seeds?: { awarded: number; reason: string | null };
  serverNow: number;
};

export type PlayerSummary = {
  id: string;
  kind: 'guest' | 'account';
  displayName: string | null;
};

export type CreateGuestResponse = { ok: true; player: PlayerSummary; token: string; serverNow: number };

export type MatchSummary = {
  matchId: string;
  inviteCode: string;
  status: MatchStatus;
  revision: number;
  turnStartRevision: number;
  turnDeadlineAt: number | null;
  expiresAt: number | null;
  /** Per-seat grace periods already spent (index = seat). Public: grace is not a secret. */
  graceUsed: [number, number];
  gracePeriods: number;
  seats: { seat: Player; playerId: string; displayName: string | null }[];
  result: OnlineGameResult | null;
  serverNow: number;
};

export type MatchListEntry = {
  matchId: string;
  status: MatchStatus;
  mySeat: Player;
  turnPlayer: Player | null;
  turnDeadlineAt: number | null;
  opponentName: string | null;
  /** "7QK2": tells two players with the same nature name apart (src/player-tag.ts). */
  opponentTag?: string | null;
  lastActivityAt: number;
  unseenTurn: boolean;
  revision: number;
  /** Per-seat grace periods already spent (index = seat), so the list can explain a warning. */
  graceUsed: [number, number];
  gracePeriods: number;
  result: OnlineGameResult | null;
};

export type CreateMatchResponse = { ok: true; match: MatchSummary; player: MatchViewPayload; serverNow: number };

export type JoinMatchRequest = { inviteCode: string };
export type JoinMatchResponse = { ok: true; match: MatchSummary; player: MatchViewPayload; serverNow: number };

/** Phase 7 Find Opponent — paired=true when joined an existing open-queue match. */
export type FindOpponentResponse = {
  ok: true;
  match: MatchSummary;
  player: MatchViewPayload;
  paired: boolean;
  serverNow: number;
};

/** Phase 7 Find Opponent — stop a parked search (retires the waiting open-queue match). */
export type CancelSearchResponse = { ok: true; cancelled: boolean; serverNow: number };

/** Cancel a WAITING match you own (the invite screen's "Cancel match"; owner-only, idempotent). */
export type CancelMatchResponse = { ok: true; cancelled: boolean; serverNow: number };

export type SubmitActionRequest = {
  expectedRevision: number;
  requestId: string;
  /** One action, or an ordered batch (max 12) applied atomically. */
  action?: Action;
  actions?: Action[];
};

export type SubmitActionResponse = {
  ok: true;
  /** true when an earlier identical request was replayed instead of applying the move again. */
  replayed: boolean;
  player: MatchViewPayload;
  serverNow: number;
};

export type ReconnectRequest = { sinceRevision?: number };

export type GetViewResponse = { ok: true; player: MatchViewPayload; serverNow: number };
export type ReconnectResponse = { ok: true; player: MatchViewPayload; serverNow: number };
export type MatchSummaryResponse = { ok: true; match: MatchSummary; serverNow: number };
export type UpgradeResponse = { ok: true; player: PlayerSummary; serverNow: number };
export type MeResponse = { ok: true; player: PlayerSummary; serverNow: number };
export type MatchListResponse = { ok: true; matches: MatchListEntry[]; serverNow: number };
export type ResignResponse = { ok: true; match: MatchSummary; player: MatchViewPayload; serverNow: number };
export type LinkCodeResponse = { ok: true; code: string; expiresAt: number; serverNow: number };
export type LinkRedeemResponse = { ok: true; player: PlayerSummary; token: string; serverNow: number };
export type SweepResponse = {
  ok: true;
  timedOut: number;
  expiredWaiting: number;
  deletedGuests: number;
  graceExtended: number;
  serverNow: number;
};

/**
 * One tile on the PUBLIC shared world map. Deliberately carries only what a visitor needs: the
 * cell, the holder's display name, when it was placed and whether it was taken by beating the
 * previous holder. No player id, no match id — the map is a public read.
 */
export type WorldMapPayload = {
  world: {
    version: number;
    revision: number;
    cells: { id: string; q: number; r: number }[];
    claims: { cellId: string; ownerId: string; ownerName: string | null; ownerLevel: number | null; ownerTag: string; colour: string; claimedAt: number }[];
    cost: number;
    /** What one Territory challenge costs to send. Its own price, never the tile's. */
    challengeStake: number;
  };
};
export type WorldMapResponse = { ok: true } & WorldMapPayload;

export type ApiFailure = { ok: false; code: string; message: string };
