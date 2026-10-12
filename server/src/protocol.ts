// The wire format shared by the server and its TypeScript client. These are the ONLY shapes
// that cross the network: a match summary and a player-specific view. The authoritative engine
// `State` (deck order, both hands, seed) is never part of any payload.
import type { Action, Event, GameResult, Player, View } from '../../src/engine/index.js';

export type MatchStatus = 'waiting' | 'active' | 'finished';

/** A player-safe snapshot. `view` is the engine's `viewFor(state, seat)`; `events` are filtered. */
export type MatchViewPayload = {
  matchId: string;
  rulesVersion: string;
  status: MatchStatus;
  revision: number;
  seat: Player;
  /** Whose turn it is (public), so the client can show the correct waiting state. */
  turnPlayer: Player;
  view: View;
  /** Legal actions for this seat, or [] when it is not this seat's turn or the match is over. */
  legalActions: Action[];
  /** Public-safe events since the requested revision (opponent deck draws are hidden). */
  events: Event[];
};

export type PlayerSummary = {
  id: string;
  kind: 'guest' | 'account';
  displayName: string | null;
};

export type CreateGuestResponse = { ok: true; player: PlayerSummary; token: string };

export type MatchSummary = {
  matchId: string;
  inviteCode: string;
  status: MatchStatus;
  revision: number;
  seats: { seat: Player; playerId: string; displayName: string | null }[];
  result: GameResult | null;
};

export type CreateMatchResponse = { ok: true; match: MatchSummary; player: MatchViewPayload };

export type JoinMatchRequest = { inviteCode: string };
export type JoinMatchResponse = { ok: true; match: MatchSummary; player: MatchViewPayload };

export type SubmitActionRequest = {
  expectedRevision: number;
  requestId: string;
  action: Action;
};

export type SubmitActionResponse = {
  ok: true;
  /** true when an earlier identical request was replayed instead of applying the move again. */
  replayed: boolean;
  player: MatchViewPayload;
};

export type ReconnectRequest = { sinceRevision?: number };

export type GetViewResponse = { ok: true; player: MatchViewPayload };
export type ReconnectResponse = { ok: true; player: MatchViewPayload };
export type MatchSummaryResponse = { ok: true; match: MatchSummary };
export type UpgradeResponse = { ok: true; player: PlayerSummary };

export type ApiFailure = { ok: false; code: string; message: string };
