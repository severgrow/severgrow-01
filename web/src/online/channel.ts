// Match channel: Realtime pings are a hint; polling is truth (P-11). Fakes for unit tests.

import type { MatchChannel, MatchPing, PresenceSnapshot } from './types.js';

export type FakeChannelController = {
  channel: MatchChannel;
  emitPing: (matchId: string, ping: MatchPing) => void;
  emitPresence: (matchId: string, presence: PresenceSnapshot) => void;
  /** Drop all handlers (simulates Realtime outage). */
  goDown: () => void;
  /** Allow subscriptions again after goDown. */
  goUp: () => void;
  tracked: { matchId: string; online: boolean }[];
};

/** In-memory channel for unit tests (ordering, duplicates, dropped pings, presence). */
export const createFakeChannel = (): FakeChannelController => {
  type Handlers = {
    onPing: (ping: MatchPing) => void;
    onPresence: (presence: PresenceSnapshot) => void;
  };
  const subs = new Map<string, Set<Handlers>>();
  let down = false;
  const tracked: { matchId: string; online: boolean }[] = [];

  const channel: MatchChannel = {
    subscribe(matchId, handlers) {
      if (down) return () => undefined;
      let set = subs.get(matchId);
      if (!set) {
        set = new Set();
        subs.set(matchId, set);
      }
      set.add(handlers);
      return () => {
        set!.delete(handlers);
        if (set!.size === 0) subs.delete(matchId);
      };
    },
    track(matchId, online) {
      tracked.push({ matchId, online });
    },
  };

  return {
    channel,
    tracked,
    emitPing(matchId, ping) {
      if (down) return;
      for (const h of subs.get(matchId) ?? []) h.onPing(ping);
    },
    emitPresence(matchId, presence) {
      if (down) return;
      for (const h of subs.get(matchId) ?? []) h.onPresence(presence);
    },
    goDown() {
      down = true;
      subs.clear();
    },
    goUp() {
      down = false;
    },
  };
};

/**
 * Browser channel stub. Phase 6 wires real Supabase Realtime broadcast.
 * Until then this is a no-op subscribe so polling alone keeps the board fresh.
 */
export const createNoopChannel = (): MatchChannel => ({
  subscribe() {
    return () => undefined;
  },
  track() {
    /* intentional no-op until Realtime is wired */
  },
});

/** The wire shape of one Realtime frame we care about (v1.0.0 JSON protocol). */
export type RealtimeFrame = {
  topic?: string;
  event?: string;
  /** Either the broadcast envelope `{event, payload}` or the inlined user payload. */
  payload?: { event?: string; payload?: unknown; [key: string]: unknown } | null;
};

/** A ping payload we understand: `{ revision, status }`. Anything else is ignored. */
export const pingFromFrame = (
  frame: RealtimeFrame,
  topic: string,
): MatchPing | null => {
  if (frame.topic !== topic) return null;
  // Supabase delivers broadcasts as `event:"broadcast"` with payload `{event,payload,type}`.
  // Older servers inline the user event name directly, so accept both.
  const innerEvent = frame.event === 'broadcast' ? frame.payload?.event : frame.event;
  if (innerEvent !== 'ping') return null;
  const data = (frame.event === 'broadcast' ? frame.payload?.payload : frame.payload) as
    | { revision?: unknown; status?: unknown }
    | undefined;
  if (!data || typeof data.revision !== 'number' || typeof data.status !== 'string') return null;
  return { revision: data.revision, status: data.status };
};

export type RealtimeChannelOptions = {
  /** Full wss:// URL including the apikey query. */
  url: string;
  /** Inject a WebSocket constructor (tests). Default: the global WebSocket. */
  socket?: (url: string) => RealtimeSocket;
  /** Heartbeat period (defaults to 25s, per the Realtime protocol). */
  heartbeatMs?: number;
};

type RealtimeSocket = {
  readyState: number;
  send(data: string): void;
  close(): void;
  addEventListener(type: string, cb: (ev: { data?: unknown }) => void): void;
};

const OPEN = 1;

/**
 * A minimal Supabase Realtime broadcast subscriber (no dependency). It joins
 * `realtime:<matchId>` and turns a `ping` broadcast into `onPing`. The ping is only a hint:
 * if this channel is unavailable the sync engine's polling still keeps the board fresh (P-11).
 */
export const createRealtimeChannel = (options: RealtimeChannelOptions): MatchChannel => {
  const topicFor = (matchId: string): string => `realtime:${matchId}`;
  const subs = new Map<string, Set<{ onPing: (p: MatchPing) => void; onPresence: (p: PresenceSnapshot) => void }>>();
  const socketCtor = options.socket ?? ((url: string) => new (globalThis as unknown as { WebSocket: new (u: string) => RealtimeSocket }).WebSocket(url));
  let socket: RealtimeSocket | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let ref = 0;
  let reconnectDelay = 500;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  /** Consecutive failed connection attempts. After a few, Realtime is treated as unavailable. */
  let failures = 0;
  const MAX_ATTEMPTS = 5;

  const send = (topic: string, event: string, payload: unknown): void => {
    if (socket?.readyState !== OPEN) return;
    ref += 1;
    socket.send(JSON.stringify({ topic, event, payload, ref: String(ref), join_ref: String(ref) }));
  };

  const stopSocket = (): void => {
    if (heartbeat !== null) {
      clearInterval(heartbeat);
      heartbeat = null;
    }
    try {
      socket?.close();
    } catch {
      /* already gone */
    }
    socket = null;
  };

  const joinAll = (): void => {
    for (const matchId of subs.keys()) {
      send(topicFor(matchId), 'phx_join', {
        config: { broadcast: { ack: false, self: false }, presence: { enabled: false }, private: false },
      });
    }
  };

  const scheduleReconnect = (): void => {
    if (reconnectTimer !== null || subs.size === 0) return;
    failures += 1;
    // Realtime is a hint, not the truth (P-11): if it cannot connect, stop trying and let the
    // sync engine's polling carry the match. Never churn a socket for a ping that may not exist.
    if (failures > MAX_ATTEMPTS) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      open();
    }, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 2, 15_000);
  };

  const open = (): void => {
    if (socket || subs.size === 0) return;
    let next: RealtimeSocket;
    try {
      next = socketCtor(options.url);
    } catch {
      socket = null;
      scheduleReconnect();
      return;
    }
    socket = next;
    next.addEventListener('open', () => {
      reconnectDelay = 500;
      failures = 0;
      joinAll();
      if (heartbeat === null) {
        heartbeat = setInterval(() => send('phoenix', 'heartbeat', {}), options.heartbeatMs ?? 25_000);
      }
    });
    next.addEventListener('message', (ev) => {
      let frame: RealtimeFrame;
      try {
        frame = JSON.parse(String(ev.data)) as RealtimeFrame;
      } catch {
        return; // heartbeats / non-JSON frames
      }
      if (typeof frame.topic !== 'string') return;
      for (const [matchId, handlers] of subs) {
        const ping = pingFromFrame(frame, topicFor(matchId));
        if (ping) for (const h of handlers) h.onPing(ping);
      }
    });
    next.addEventListener('close', () => {
      stopSocket();
      scheduleReconnect();
    });
    next.addEventListener('error', () => {
      stopSocket();
      scheduleReconnect();
    });
  };

  return {
    subscribe(matchId, handlers) {
      let set = subs.get(matchId);
      if (!set) {
        set = new Set();
        subs.set(matchId, set);
      }
      set.add(handlers);
      if (socket?.readyState === OPEN) {
        send(topicFor(matchId), 'phx_join', {
          config: { broadcast: { ack: false, self: false }, presence: { enabled: false }, private: false },
        });
      } else {
        open();
      }
      return () => {
        const current = subs.get(matchId);
        if (!current) return;
        current.delete(handlers);
        if (current.size === 0) {
          subs.delete(matchId);
          if (socket?.readyState === OPEN) send(topicFor(matchId), 'phx_leave', {});
          if (subs.size === 0) {
            if (reconnectTimer !== null) {
              clearTimeout(reconnectTimer);
              reconnectTimer = null;
            }
            stopSocket();
          }
        }
      };
    },
    track() {
      /* presence is display-only and stays Unknown until presence is wired (options in ONLINE-SIMULATION.md) */
    },
  };
};

/**
 * The production channel when the build carries the public Supabase URL + anon key, else a no-op
 * (so local/dev/test builds keep working and polling alone keeps the board fresh).
 */
export const realtimeChannelFromEnv = (): MatchChannel => {
  const env = (import.meta as { env?: Record<string, string | undefined> }).env;
  const url = env?.VITE_SUPABASE_URL?.trim();
  const key = env?.VITE_SUPABASE_ANON_KEY?.trim();
  if (!url || !key) return createNoopChannel();
  const wsBase = url.replace(/^http/i, 'ws').replace(/\/+$/, '');
  return createRealtimeChannel({
    url: `${wsBase}/realtime/v1/websocket?apikey=${encodeURIComponent(key)}&vsn=1.0.0`,
  });
};
