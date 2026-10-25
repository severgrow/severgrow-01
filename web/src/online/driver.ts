// OnlineDriver seam: Views + filtered events only; never full authoritative State.
// Board / hand / AnimQueue / sounds are wired in Phase 5; this layer feeds them.

import type { Action, Event, Player, View } from '../../../src/engine/index.js';
import { DuelClient } from '../../../server/src/client.js';
import type { MatchViewPayload, ReplayPayload } from '../../../server/src/protocol.js';
import { CURRENT_RULES_VERSION } from '../../../src/engine/index.js';
import { ONLINE } from '../../../src/strings.js';
import { mark } from '../logic/timing.js';
import type { SettledSeeds } from '../ui/seed-reveal.js';
import { remainingMs } from './clock.js';
import type { ClockState } from './clock.js';
import { createDraftEngine } from './draft.js';
import type { DraftEngine } from './draft.js';
import { createNoopChannel } from './channel.js';
import { onlinePerspective } from './perspective.js';
import type { Perspective } from './perspective.js';
import { newRequestId, submitWithRetries } from './retries.js';
import { createSyncEngine } from './sync.js';
import type { SyncEngine, ViewReason } from './sync.js';
import type {
  ConnectionStatus,
  MatchChannel,
  MatchDriverSnapshot,
  PresenceStatus,
} from './types.js';

export type OnlineDriverOptions = {
  client: DuelClient;
  token: string;
  matchId: string;
  channel?: MatchChannel;
  /** Initial view from create/join/reconnect. */
  initial?: MatchViewPayload;
  initialServerNow?: number;
  now?: () => number;
  isVisible?: () => boolean;
  isOnline?: () => boolean;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (id: unknown) => void;
  onChange?: (snap: MatchDriverSnapshot) => void;
};

export type OnlineDriver = {
  kind: 'online';
  start(): Promise<void>;
  stop(): void;
  snapshot(): MatchDriverSnapshot;
  /** Commit Draw immediately to the server. */
  draw(action: Action): Promise<{ ok: boolean; message?: string }>;
  /** Local draft mid-turn move (Grow / Bloom / …). */
  draftPlay(action: Action): boolean;
  draftUndo(): boolean;
  /** Send draft + the ending action (EndAct, or Discard during the DISCARD step) as one batch. */
  throwTurn(endAct: Action): Promise<{ ok: boolean; message?: string }>;
  /** Resign (not an engine action). */
  resign(): Promise<{ ok: boolean; message?: string }>;
  /** Skip catch-up replay (Phase 5 uses this; here it only clears pending events buffer). */
  skipCatchUp(): void;
  /** Pending opponent events for the animation pipeline (catch-up at 2x in Phase 5). */
  pendingEvents(): readonly Event[];
  /**
   * Where the pending events came from: 'live' = the enemy turn this device was waiting for
   * (a poll/ping while visible), 'gap' = turns missed while away (a resume/return), null = none.
   * Only a live reveal gets the full, readable pace; a gap keeps its 2x + Skip.
   */
  pendingOrigin(): 'live' | 'gap' | null;
  /**
   * The match's whole public event history, in one fetch (no `since`), for the finish screen's
   * highlights. Never replays or changes the live view; the caller decides when to ask.
   */
  history(): Promise<readonly Event[]>;
  /**
   * The finished duel's replay payload — one fetch, and the deterministic engine rebuilds every
   * position from it. Refused by the server while the duel is still being played.
   */
  replay(): Promise<ReplayPayload>;
  /** Map screen taps / draft hexes back to engine coords before send. */
  toEngineAction(screenAction: Action): Action;
  /** Perspective for this seat (Me=moss, Opponent=lava). */
  perspective(): Perspective;
  draft(): DraftEngine;
  sync(): SyncEngine;
};

export const createOnlineDriver = (options: OnlineDriverOptions): OnlineDriver => {
  const channel = options.channel ?? createNoopChannel();
  const now = options.now ?? (() => Date.now());
  const draft = createDraftEngine({ matchId: options.matchId });

  let player: MatchViewPayload | null = options.initial ?? null;
  let connection: ConnectionStatus = 'online';
  let presence: PresenceStatus = 'unknown';
  let notice: string | null = null;
  let pendingEvents: Event[] = [];
  /** See `pendingOrigin()`: how the buffered events arrived. */
  let pendingOrigin: 'live' | 'gap' | null = null;
  let submitting = false;
  /** When set, applyView does not buffer events (own Draw) or only buffers aftermath (own Throw). */
  let catchUpMode: 'all' | 'none' | 'aftermath' = 'all';
  let perspective: Perspective = onlinePerspective(options.initial?.seat ?? 0);

  const emit = () => options.onChange?.(snapshot());

  const refreshPerspective = () => {
    if (player) perspective = onlinePerspective(player.seat);
  };
  refreshPerspective();

  const isAftermath = (e: Event): boolean =>
    e.t === 'Sever' || e.t === 'Rot' || e.t === 'Strangle' || e.t === 'GameEnd' || e.t === 'Discard';

  const applyView = (next: MatchViewPayload, _serverNow: number, reason: ViewReason = 'refresh') => {
    if (player && next.revision > player.revision && next.events.length > 0) {
      // Opponent turns: buffer all public events for catch-up replay.
      // Own Draw: skip (local buildSteps already animates).
      // Own Throw: only sever/rot/end aftermath — draft grows were already shown.
      // A ping/poll while the tab is visible is the live enemy turn; anything else is a gap
      // (a resume, a return to the tab, a network comeback) and keeps the 2x catch-up.
      const origin = reason === 'poll' || reason === 'ping' ? 'live' : 'gap';
      if (catchUpMode === 'all') {
        pendingEvents = [...pendingEvents, ...next.events];
        pendingOrigin = origin;
      } else if (catchUpMode === 'aftermath') {
        pendingEvents = [...pendingEvents, ...next.events.filter(isAftermath)];
        pendingOrigin = origin;
      }
    }
    player = next;
    refreshPerspective();
    draft.syncFromServer(next.view, next.revision);
    draft.persist();
    emit();
  };

  if (player) {
    draft.syncFromServer(player.view, player.revision);
    // A reconnect/resume payload carries only the turns missed while away. Buffer them so the
    // page replays them (at 2x, skippable) through the same AnimQueue as a live opponent turn.
    if (player.events.length > 0) {
      pendingEvents = [...player.events];
      pendingOrigin = 'gap';
    }
  }

  const sync = createSyncEngine({
    client: options.client,
    token: options.token,
    matchId: options.matchId,
    channel,
    now,
    ...(options.isVisible ? { isVisible: options.isVisible } : {}),
    ...(options.isOnline ? { isOnline: options.isOnline } : {}),
    ...(options.setTimer ? { setTimer: options.setTimer } : {}),
    ...(options.clearTimer ? { clearTimer: options.clearTimer } : {}),
    onView: (p, serverNow, reason) => applyView(p, serverNow, reason),
    onConnection: (status, nextNotice) => {
      connection = status;
      notice = nextNotice;
      emit();
    },
    onPresence: (p) => {
      presence = p;
      emit();
    },
  });

  /**
   * The award this seat was paid for the duel, if the server told us. Read DEFENSIVELY: the field is
   * not in `MatchViewPayload` today, so this is normally absent and the finish card shows no Seeds
   * line (see `MatchDriverSnapshot.seeds` for the one server change that fills it). Never inferred
   * from the mode or the outcome — a daily cap pays 0 and a resignation pays nothing.
   */
  const readSettledSeeds = (view: MatchViewPayload): Pick<MatchDriverSnapshot, 'seeds'> => {
    const reported = (view as MatchViewPayload & { seeds?: SettledSeeds }).seeds;
    if (!reported || typeof reported.awarded !== 'number') return {};
    return { seeds: { awarded: reported.awarded, reason: reported.reason ?? null } };
  };

  const snapshot = (): MatchDriverSnapshot => {
    if (!player) {
      throw new Error('OnlineDriver has no view yet.');
    }
    const clock: ClockState = sync.clock();
    const view: View = draft.hasDraft() ? draft.view() : player.view;
    const legal: Action[] = draft.hasDraft() || player.actor === player.seat ? draft.legal() : [];
    const screenView = perspective.toScreenView(view);
    const screenLegal = legal.map((a) => perspective.mapActionToScreen(a));
    const screenEvents = player.events.map((e) => perspective.mapEventToScreen(e));
    return {
      kind: 'online',
      matchId: player.matchId,
      seat: player.seat,
      status: player.status,
      revision: player.revision,
      turnStartRevision: player.turnStartRevision,
      startingPlayer: player.startingPlayer ?? player.view.turnPlayer,
      view,
      serverPhase: player.view.phase,
      screenView,
      legal,
      screenLegal,
      events: player.events,
      screenEvents,
      turnDeadlineAt: player.turnDeadlineAt,
      result: player.result,
      ...readSettledSeeds(player),
      opponentName: player.opponent?.displayName ?? null,
      connection,
      presence,
      remainingMs: remainingMs(clock, player.turnDeadlineAt, now()),
      hasDraft: draft.hasDraft(),
      notice,
      perspective: {
        me: perspective.me,
        opp: perspective.opp,
        rotated: perspective.rotated,
        coachEnabled: perspective.coachEnabled,
        hiddenDeckHintsEnabled: perspective.hiddenDeckHintsEnabled,
        scoreMeLabel: perspective.labels.scoreMe,
        scoreOpponentLabel: perspective.labels.scoreOpponent,
      },
    };
  };

  const refetch = async () => {
    const res = await options.client.getState(options.token, options.matchId);
    // A recovery re-sync: treat whatever it carries as a gap (fast, skippable), never the live turn.
    applyView(res.player, res.serverNow, 'refresh');
    return res;
  };

  return {
    kind: 'online',

    start() {
      return sync.start();
    },

    stop() {
      sync.stop();
      draft.persist();
    },

    snapshot,

    async draw(action) {
      if (!player || submitting) return { ok: false, message: ONLINE.errBusy };
      if (action.t !== 'Draw') {
        return { ok: false, message: ONLINE.errDrawOnly };
      }
      submitting = true;
      try {
        mark('req:sent', { kind: 'draw' });
        const outcome = await submitWithRetries({
          client: options.client,
          token: options.token,
          matchId: options.matchId,
          expectedRevision: player.revision,
          requestId: newRequestId(),
          actions: [action],
          rulesVersion: player.rulesVersion || CURRENT_RULES_VERSION,
          refetch,
        });
        if (!outcome.ok) {
          if (outcome.player) applyView(outcome.player, outcome.player.serverNow);
          notice = outcome.message;
          emit();
          return { ok: false, message: outcome.message };
        }
        catchUpMode = 'none';
        try {
          applyView(outcome.response.player, outcome.response.serverNow);
        } finally {
          catchUpMode = 'all';
        }
        mark('res:got', { kind: 'draw', ok: true });
        mark('server:commit', { kind: 'draw', serverNow: outcome.response.serverNow });
        return { ok: true };
      } finally {
        submitting = false;
      }
    },

    draftPlay(action) {
      // Engine coords only — UI maps taps with toEngineAction first.
      const ok = draft.play(action);
      if (ok) {
        draft.persist();
        emit();
      }
      return ok;
    },

    draftUndo() {
      const ok = draft.undo();
      if (ok) {
        draft.persist();
        emit();
      }
      return ok;
    },

    async throwTurn(endAct) {
      if (!player || submitting) return { ok: false, message: ONLINE.errBusy };
      // A turn ends with EndAct (Grow step done, or empty hand) and, when there is a card
      // left, the Discard that finishes it. Both are submitted as the same atomic batch.
      if (endAct.t !== 'EndAct' && endAct.t !== 'Discard') {
        return { ok: false, message: ONLINE.errThrowShape };
      }
      submitting = true;
      const requestId = newRequestId();
      const actions = [...draft.actions(), endAct];
      try {
        mark('req:sent', { kind: 'throw', actions: actions.length });
        const outcome = await submitWithRetries({
          client: options.client,
          token: options.token,
          matchId: options.matchId,
          expectedRevision: draft.baseRevision() || player.revision,
          requestId,
          actions,
          rulesVersion: player.rulesVersion || CURRENT_RULES_VERSION,
          refetch,
        });
        if (!outcome.ok) {
          if (!outcome.keepDraft) {
            draft.clear();
            if (outcome.player) applyView(outcome.player, outcome.player.serverNow);
            notice = ONLINE.errTurnFailed;
          } else {
            notice = outcome.message;
          }
          emit();
          return { ok: false, message: notice ?? outcome.message };
        }
        draft.clear();
        catchUpMode = 'aftermath';
        try {
          applyView(outcome.response.player, outcome.response.serverNow);
        } finally {
          catchUpMode = 'all';
        }
        mark('res:got', { kind: 'throw', ok: true });
        mark('server:commit', { kind: 'throw', serverNow: outcome.response.serverNow });
        notice = null;
        emit();
        return { ok: true };
      } finally {
        submitting = false;
      }
    },

    async resign() {
      try {
        const res = await options.client.resign(options.token, options.matchId);
        catchUpMode = 'none';
        try {
          applyView(res.player, res.serverNow);
        } finally {
          catchUpMode = 'all';
        }
        return { ok: true };
      } catch (error) {
        const message = error instanceof Error ? error.message : ONLINE.errResignFailed;
        return { ok: false, message };
      }
    },

    /** One fetch of the whole public event history (no `since`) — used only by the finish screen. */
    async history() {
      const res = await options.client.getState(options.token, options.matchId);
      return res.player.events;
    },

    /**
     * The finished duel's REPLAY payload (owner brief, 2026-10-25): rules snapshot, seed, starting
     * seat and the ordered action log. One fetch; the engine rebuilds every position from it. The
     * server refuses this for an unfinished match, so the finish screen is its only caller.
     */
    async replay() {
      const res = await options.client.replay(options.token, options.matchId);
      return res.replay;
    },

    skipCatchUp() {
      pendingEvents = [];
      pendingOrigin = null;
      emit();
    },

    pendingEvents: () => pendingEvents,

    pendingOrigin: () => pendingOrigin,

    toEngineAction: (screenAction) => perspective.mapActionToEngine(screenAction),

    perspective: () => perspective,

    draft: () => draft,

    sync: () => sync,
  };
};

/** LocalDriver marker type so Phase 5 can switch on kind (offline Session stays as today). */
export type LocalDriverMarker = { kind: 'local'; viewer: Player };
