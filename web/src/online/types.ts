// Shared types for the online client layer (Phase 3). No screens — only the seam.
import type { Action, Event, Player, View } from '../../../src/engine/index.js';
import type { MatchStatus, MatchViewPayload, OnlineGameResult } from '../../../server/src/protocol.js';

/** Connection / sync status shown quietly in the UI (Phase 5). */
export type ConnectionStatus = 'online' | 'reconnecting' | 'offline' | 'client_too_old';

/** Opponent presence is display-only (P-11). */
export type PresenceStatus = 'online' | 'away' | 'unknown';

export type MatchPing = { revision: number; status: string };

export type PresenceSnapshot = { opponent: PresenceStatus };

/** Tiny Realtime channel contract; tests inject a fake. */
export type MatchChannel = {
  /** Subscribe to pings + presence for one match. Returns an unsubscribe. */
  subscribe(
    matchId: string,
    handlers: {
      onPing: (ping: MatchPing) => void;
      onPresence: (presence: PresenceSnapshot) => void;
    },
  ): () => void;
  /** Tell the channel we are on the page (optional; fakes may no-op). */
  track?(matchId: string, online: boolean): void;
};

/** What the UI needs from either LocalDriver or OnlineDriver (Phase 0 seam). */
export type MatchDriverSnapshot = {
  kind: 'online';
  matchId: string;
  seat: Player;
  status: MatchStatus;
  revision: number;
  turnStartRevision: number;
  view: View;
  legal: Action[];
  events: Event[];
  turnDeadlineAt: number | null;
  result: OnlineGameResult | null;
  opponentName: string | null;
  connection: ConnectionStatus;
  presence: PresenceStatus;
  /** Remaining ms until deadline using the corrected clock; null when none. */
  remainingMs: number | null;
  /** True when a local Grow draft exists after a committed Draw. */
  hasDraft: boolean;
  /** Quiet line for the UI ("Reconnecting", "Reload to update FUTASAKU", …). */
  notice: string | null;
};

export type OnlineIdentityRecord = {
  token: string;
  playerId: string;
  displayName: string | null;
  kind: 'guest' | 'account';
};

/** Payload that arrives from the sync engine. */
export type SyncedView = {
  player: MatchViewPayload;
  serverNow: number;
  /** Wall time when this payload was applied (for offset). */
  receivedAt: number;
};
