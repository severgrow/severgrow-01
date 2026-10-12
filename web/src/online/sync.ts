// Sync engine: ping hint + poll safety net (P-11). Missed pings never leave the board stale.

import { DuelClient, DuelError } from '../../../server/src/client.js';
import type { MatchViewPayload } from '../../../server/src/protocol.js';
import { emptyClock, noteServerNow } from './clock.js';
import type { ClockState } from './clock.js';
import type { ConnectionStatus, MatchChannel, MatchPing, PresenceSnapshot, PresenceStatus } from './types.js';

export const POLL_ACTIVE_MS = 2_000;
export const POLL_HIDDEN_MS = 30_000;

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
  onView?: (player: MatchViewPayload, serverNow: number) => void;
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

  const setConnection = (status: ConnectionStatus, nextNotice: string | null = null) => {
    connection = status;
    notice = nextNotice;
    options.onConnection?.(status, notice);
  };

  const applyPayload = (player: MatchViewPayload, serverNow: number) => {
    revision = player.revision;
    clock = noteServerNow(clock, serverNow, now());
    options.onView?.(player, serverNow);
  };

  const fetchView = async (): Promise<void> => {
    if (stopped) return;
    if (inFlight) {
      await inFlight;
      return;
    }
    inFlight = (async () => {
      try {
        const res = await options.client.getState(options.token, options.matchId, revision);
        applyPayload(res.player, res.serverNow);
        if (connection !== 'client_too_old') setConnection('online', null);
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
      } finally {
        inFlight = null;
      }
    })();
    await inFlight;
  };

  const pollMs = (): number => (visible ? POLL_ACTIVE_MS : POLL_HIDDEN_MS);

  const schedule = () => {
    if (stopped) return;
    if (timer !== null) clearTimer(timer);
    timer = setTimer(() => {
      void fetchView().then(schedule);
    }, pollMs());
  };

  const onPing = (_ping: MatchPing) => {
    void fetchView();
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
      await fetchView();
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

    refresh: () => fetchView(),

    revision: () => revision,

    clock: () => clock,

    connection: () => connection,

    presence: () => presence,

    setVisible(next) {
      visible = next;
      if (visible) void fetchView();
      schedule();
    },

    setOnline(next) {
      networkOnline = next;
      if (next) {
        setConnection('reconnecting', 'Reconnecting');
        void fetchView();
      } else {
        setConnection('offline', 'Reconnecting');
      }
    },
  };
};
