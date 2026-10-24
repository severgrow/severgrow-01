// Shared types for the online client layer (Phase 3). No screens — only the seam.
import type { Action, Event, Player, View } from '../../../src/engine/index.js';
import type { MatchStatus, MatchViewPayload, OnlineGameResult } from '../../../server/src/protocol.js';
import type { SettledSeeds } from '../ui/seed-reveal.js';

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
  /** Seat that moves first this match (shared-engine seeded lottery). */
  startingPlayer: Player;
  view: View;
  /**
   * The SERVER's own phase, never the local draft's shadow. A mid-turn Grow is only a local draft,
   * and one that ends the game (a Bloom that strangles) makes the draft's shadow GAME_OVER while
   * the match on the server is still active — so "the match is over" must be read from here, not
   * from `view`.
   */
  serverPhase: View['phase'];
  /** View with board/terrain hexes mapped for this seat's screen (Phase 3b). */
  screenView: View;
  legal: Action[];
  /** Legal actions with hexes in screen coords (map taps back before send). */
  screenLegal: Action[];
  events: Event[];
  /** Opponent / own events with hexes in screen coords for AnimQueue. */
  screenEvents: Event[];
  turnDeadlineAt: number | null;
  result: OnlineGameResult | null;
  /**
   * What this seat was PAID for this duel, if the server said. Absent today: `MatchViewPayload`
   * and `MatchSummary` both stop at `result: OnlineGameResult`, and `settleOnline`
   * (server/src/seeds/service.ts) returns void, discarding the `RewardResult` that `store.settle`
   * already produces.
   *
   * THE ONE SERVER CHANGE that turns the finish card's Seeds line on — nothing else is needed:
   *   1. add `seeds?: { awarded: number; reason: string | null }` to `MatchViewPayload`
   *      (server/src/protocol.ts), meaning "what THIS seat was paid";
   *   2. have `settleOnline` return the per-seat `RewardResult` map instead of void;
   *   3. carry it through `safeSettleOnline` (server/src/service.ts) into the finished-view path,
   *      so the response built for each seat includes its own award.
   * Until then the card shows NOTHING rather than guessing — a daily cap pays 0, and a resignation
   * or timeout pays nothing, so a client-side rate table would print money nobody received
   * (see `duelSeedsMessage` in ui/seed-reveal.ts).
   */
  seeds?: SettledSeeds;
  opponentName: string | null;
  connection: ConnectionStatus;
  presence: PresenceStatus;
  /** Remaining ms until deadline using the corrected clock; null when none. */
  remainingMs: number | null;
  /** True when a local Grow draft exists after a committed Draw. */
  hasDraft: boolean;
  /** Quiet line for the UI ("Reconnecting", "Reload to update FUTASAKU", …). */
  notice: string | null;
  /** Seat perspective: Me=moss bottom, Opponent=lava top. */
  perspective: {
    me: Player;
    opp: Player;
    rotated: boolean;
    coachEnabled: boolean;
    hiddenDeckHintsEnabled: boolean;
    /** Score-bar words — the same ones the offline bar uses (see `src/strings.ts`). */
    scoreMeLabel: string;
    scoreOpponentLabel: string;
  };
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
