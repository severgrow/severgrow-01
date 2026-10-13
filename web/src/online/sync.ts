// Sync engine: ping hint + poll safety net (P-11). Missed pings never leave the board stale.

import { DuelClient, DuelError } from '../../../server/src/client.js';
import type { MatchViewPayload } from '../../../server/src/protocol.js';
import { emptyClock, noteServerNow } from './clock.js';
import type { ClockState } from './clock.js';
import { mark } from '../logic/timing.js';
import type { ConnectionStatus, MatchChannel, MatchPing, PresenceSnapshot, PresenceStatus } from './types.js';

export const POLL_ACTIVE_MS = 2_000;
export const POLL_HIDDEN_MS = 30_000;
/**
 * While it is the opponent's turn, we are waiting for a whole turn to complete. Poll faster than
 * the idle cadence so their finished turn appears (and replays) almost at once. A live Realtime
 * ping still arrives first when the transport is configured; this is the safety net that makes the
 * wait feel immediate even when the ping is unavailable.
 */
export const POLL_WAITING_MS = 900;

/**
 * Why a view was fetched. The driver uses this to tell the LIVE enemy turn (a poll or ping while
 * the tab is visible, which must animate slowly and clearly) from turns missed while away (a
 * resume or a return to the tab, which keep the fast, skippable catch-up).
 */
export type ViewReason = 'initial' | 'poll' | 'ping' | 'visible' | 'online' | 'refresh';

export type SyncEngineOptions = {
  client: DuelClient;
  token: string;
  matchId: string;
  channel: MatchChannel;
  /** Injected clock for tests. */
  now?: () => number;
  /** Injected visibility (tests). Default: document.visibilityState. */
  isVisible?: () => boolean;
  /** Injected online flag (tests). Default: navigator.onLine. */
  isOnline?: () => boolean;
  /** Schedule a timer; tests inject a fake. */
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (id: unknown) => void;
  onView?: (player: MatchViewPayload, serverNow: number, reason: ViewReason) => void;
  onConnection?: (status: ConnectionStatus, notice: string | null) => void;
  onPresence?: (presence: PresenceStatus) => void;
};

export type SyncEngine = {
  /** Starts polling + channel; resolves after the first fetch attempt. */
  start(): Promise<void>;
  stop(): void;
  /** Force a fetch (ping, visibility, network return, manual). */
  refresh(): Promise<void>;
  /** Last known revision (for ?since=). */
  revision(): number;
  clock(): ClockState;
  connection(): ConnectionStatus;
  presence(): PresenceStatus;
  /** Tell the engine the tab visibility changed. */
  setVisible(visible: boolean): void;
  /** Tell the engine the network came back / went away. */
  setOnline(online: boolean): void;
  /** True while we are waiting for the opponent (polls faster so their turn replays promptly). */
  setWaiting(waiting: boolean): void;
};

const defaultVisible = (): boolean => {
  const doc = (globalThis as { document?: { visibilityState?: string } }).document;
  return !doc || doc.visibilityState !== 'hidden';
};

const defaultOnline = (): boolean => {
  const nav = (globalThis as { navigator?: { onLine?: boolean } }).navigator;
  return nav?.onLine !== false;
};

export const createSyncEngine = (options: SyncEngineOptions): SyncEngine => {
  const now = options.now ?? (() => Date.now());
  let visible = options.isVisible?.() ?? defaultVisible();
  let networkOnline = options.isOnline?.() ?? defaultOnline();
  const setTimer = options.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = options.clearTimer ?? ((id) => clearTimeout(id as ReturnType<typeof setTimeout>));

  let revision = 0;
  let clock = emptyClock();
  let connection: ConnectionStatus = 'online';
  let presence: PresenceStatus = 'unknown';
  let notice: string | null = null;
  let timer: unknown = null;
  let unsub: (() => void) | null = null;
  let stopped = true;
  let inFlight: Promise<void> | null = null;
  /** Waiting on the opponent: poll faster so their finished turn appears almost at once. */
  let waiting = false;

  const setConnection = (status: ConnectionStatus, nextNotice: string | null = null) => {
    connection = status;
    notice = nextNotice;
    options.onConnection?.(status, notice);
  };

  const applyPayload = (player: MatchViewPayload, serverNow: number, reason: ViewReason) => {
    revision = player.revision;
    clock = noteServerNow(clock, serverNow, now());
    options.onView?.(player, serverNow, reason);
  };

  const fetchView = async (reason: ViewReason): Promise<void> => {
    if (stopped) return;
    if (inFlight) {
      await inFlight;
      return;
    }
    inFlight = (async () => {
      let res: Awaited<ReturnType<typeof options.client.getState>>;
      try {
        mark('view:sent', { reason, since: revision });
        res = await options.client.getState(options.token, options.matchId, revision);
      } catch (error) {
        if (error instanceof DuelError && error.code === 'CLIENT_TOO_OLD') {
          setConnection('client_too_old', 'Reload to update FUTASAKU');
          return;
        }
        if (!networkOnline) {
          setConnection('offline', 'Reconnecting');
        } else {
          setConnection('reconnecting', 'Reconnecting');
        }
        return;
      } finally {
        inFlight = null;
      }
      // Apply the payload OUTSIDE the network try/catch. An exception while applying a view (a
      // render/replay bug) used to be caught here and reported as "Reconnecting" — which hid the
      // real fault AND could leave the enemy-turn gate shut. It must surface, not be disguised.
      mark('view:recv', { reason, revision: res.player.revision, events: res.player.events.length });
      applyPayload(res.player, res.serverNow, reason);
      if (connection !== 'client_too_old') setConnection('online', null);
    })();
    await inFlight;
  };

  const pollMs = (): number => {
    if (!visible) return POLL_HIDDEN_MS;
    return waiting ? POLL_WAITING_MS : POLL_ACTIVE_MS;
  };

  /**
   * An exception while APPLYING a view is a real bug and must be loud — but it must never stop the
   * poll. Previously `schedule` was `fetchView('poll').then(schedule)`: a rejected fetch skipped
   * `schedule`, so one bad frame killed the safety net for the rest of the match (a stale board with
   * no recovery). Log it and keep the cadence alive instead.
   */
  const logApplyError = (error: unknown): void => {
    console.error('[FUTASAKU] could not apply a match view; the poll keeps running', error);
  };

  const schedule = () => {
    if (stopped) return;
    if (timer !== null) clearTimer(timer);
    timer = setTimer(() => {
      // A scheduled poll while the tab is visible is how the LIVE enemy turn arrives.
      void fetchView('poll').then(schedule, (error) => {
        logApplyError(error);
        schedule();
      });
    }, pollMs());
  };

  const onPing = (ping: MatchPing) => {
    mark('ping:recv', { revision: ping.revision, status: ping.status });
    void fetchView('ping').catch(logApplyError);
  };

  const onPresence = (snap: PresenceSnapshot) => {
    presence = snap.opponent;
    options.onPresence?.(presence);
  };

  return {
    async start() {
      if (!stopped) return;
      stopped = false;
      unsub = options.channel.subscribe(options.matchId, { onPing, onPresence });
      options.channel.track?.(options.matchId, true);
      await fetchView('initial');
      schedule();
    },

    stop() {
      stopped = true;
      options.channel.track?.(options.matchId, false);
      unsub?.();
      unsub = null;
      if (timer !== null) {
        clearTimer(timer);
        timer = null;
      }
    },

    refresh: () => fetchView('refresh'),

    revision: () => revision,

    clock: () => clock,

    connection: () => connection,

    presence: () => presence,

    setVisible(next) {
      visible = next;
      // Coming back to the tab is a gap: the missed turns replay fast and stay skippable.
      if (visible) void fetchView('visible').catch(logApplyError);
      schedule();
    },

    setOnline(next) {
      networkOnline = next;
      if (next) {
        setConnection('reconnecting', 'Reconnecting');
        void fetchView('online').catch(logApplyError);
      } else {
        setConnection('offline', 'Reconnecting');
      }
    },

    setWaiting(next) {
      if (waiting === next) return;
      waiting = next;
      // Re-arm at the new cadence straight away so the wait feels prompt.
      if (!stopped) schedule();
    },
  };
};
