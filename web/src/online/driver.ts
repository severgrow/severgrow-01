// OnlineDriver seam: Views + filtered events only; never full authoritative State.
// Board / hand / AnimQueue / sounds are wired in Phase 5; this layer feeds them.

import type { Action, Event, Player, View } from '../../../src/engine/index.js';
import { DuelClient } from '../../../server/src/client.js';
import type { MatchViewPayload } from '../../../server/src/protocol.js';
import { CURRENT_RULES_VERSION } from '../../../src/engine/index.js';
import { remainingMs } from './clock.js';
import type { ClockState } from './clock.js';
import { createDraftEngine } from './draft.js';
import type { DraftEngine } from './draft.js';
import { createNoopChannel } from './channel.js';
import { onlinePerspective } from './perspective.js';
import type { Perspective } from './perspective.js';
import { newRequestId, submitWithRetries } from './retries.js';
import { createSyncEngine } from './sync.js';
import type { SyncEngine } from './sync.js';
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

  const applyView = (next: MatchViewPayload, _serverNow: number) => {
    if (player && next.revision > player.revision && next.events.length > 0) {
      // Opponent turns: buffer all public events for catch-up replay.
      // Own Draw: skip (local buildSteps already animates).
      // Own Throw: only sever/rot/end aftermath — draft grows were already shown.
      if (catchUpMode === 'all') {
        pendingEvents = [...pendingEvents, ...next.events];
      } else if (catchUpMode === 'aftermath') {
        pendingEvents = [...pendingEvents, ...next.events.filter(isAftermath)];
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
    // page replays them (at 2x) through the same AnimQueue as a live opponent turn.
    if (player.events.length > 0) pendingEvents = [...player.events];
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
    onView: (p, serverNow) => applyView(p, serverNow),
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
      screenView,
      legal,
      screenLegal,
      events: player.events,
      screenEvents,
      turnDeadlineAt: player.turnDeadlineAt,
      result: player.result,
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
    applyView(res.player, res.serverNow);
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
      if (!player || submitting) return { ok: false, message: 'Busy' };
      if (action.t !== 'Draw') {
        return { ok: false, message: 'Only a Draw commits immediately.' };
      }
      submitting = true;
      try {
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
      if (!player || submitting) return { ok: false, message: 'Busy' };
      // A turn ends with EndAct (Grow step done, or empty hand) and, when there is a card
      // left, the Discard that finishes it. Both are submitted as the same atomic batch.
      if (endAct.t !== 'EndAct' && endAct.t !== 'Discard') {
        return { ok: false, message: 'Throw must be EndAct or Discard.' };
      }
      submitting = true;
      const requestId = newRequestId();
      const actions = [...draft.actions(), endAct];
      try {
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
            notice = "That turn didn't go through. Your cards are back.";
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
        const message = error instanceof Error ? error.message : 'Resign failed.';
        return { ok: false, message };
      }
    },

    skipCatchUp() {
      pendingEvents = [];
      emit();
    },

    pendingEvents: () => pendingEvents,

    toEngineAction: (screenAction) => perspective.mapActionToEngine(screenAction),

    perspective: () => perspective,

    draft: () => draft,

    sync: () => sync,
  };
};

/** LocalDriver marker type so Phase 5 can switch on kind (offline Session stays as today). */
export type LocalDriverMarker = { kind: 'local'; viewer: Player };
