// Live duels — the per-player Realtime channel `player:<id>` (broadcast event `challenge`).
// A ping is only a hint to poll now; the polling fallback (every 4 s while visible) is the truth.
// Without the public Supabase URL/key in the build this is a no-op and polling alone carries it.
import type { PlayerChannel } from './center.js';

type Socket = {
  readyState: number;
  send(data: string): void;
  close(): void;
  addEventListener(type: string, cb: (ev: { data?: unknown }) => void): void;
};

/** True when a Realtime frame is a `challenge` broadcast on this topic. */
export const isChallengeFrame = (frame: unknown, topic: string): boolean => {
  const f = frame as { topic?: unknown; event?: unknown; payload?: { event?: unknown } | null } | null;
  if (!f || f.topic !== topic) return false;
  const inner = f.event === 'broadcast' ? f.payload?.event : f.event;
  return inner === 'challenge';
};

export const createPlayerChannel = (socketCtor?: (url: string) => Socket): PlayerChannel => {
  const env = (import.meta as { env?: Record<string, string | undefined> }).env;
  const url = env?.VITE_SUPABASE_URL?.trim();
  const key = env?.VITE_SUPABASE_ANON_KEY?.trim();
  if (!url || !key) return { subscribe: () => () => undefined };
  const wsUrl = `${url.replace(/^http/i, 'ws').replace(/\/+$/, '')}/realtime/v1/websocket?apikey=${encodeURIComponent(key)}&vsn=1.0.0`;
  const make = socketCtor ?? ((u: string) => new (globalThis as unknown as { WebSocket: new (u: string) => Socket }).WebSocket(u));
  return {
    subscribe(playerId, onPing) {
      const topic = `realtime:player:${playerId}`;
      let socket: Socket | null = null;
      let beat: ReturnType<typeof setInterval> | null = null;
      let retry: ReturnType<typeof setTimeout> | null = null;
      let failures = 0;
      let closed = false;
      let ref = 0;
      const send = (t: string, event: string, payload: unknown) => {
        if (socket?.readyState !== 1) return;
        ref += 1;
        socket.send(JSON.stringify({ topic: t, event, payload, ref: String(ref), join_ref: String(ref) }));
      };
      const open = () => {
        if (closed) return;
        try {
          socket = make(wsUrl);
        } catch {
          return schedule();
        }
        socket.addEventListener('open', () => {
          failures = 0;
          send(topic, 'phx_join', { config: { broadcast: { ack: false, self: false }, presence: { enabled: false }, private: false } });
          beat = setInterval(() => send('phoenix', 'heartbeat', {}), 25_000);
        });
        socket.addEventListener('message', (ev) => {
          try {
            if (isChallengeFrame(JSON.parse(String(ev.data)), topic)) onPing();
          } catch {
            /* non-JSON frame */
          }
        });
        const down = () => {
          if (beat) clearInterval(beat);
          beat = null;
          socket = null;
          schedule();
        };
        socket.addEventListener('close', down);
        socket.addEventListener('error', down);
      };
      const schedule = () => {
        if (closed || retry || (failures += 1) > 5) return; // give up quietly: polling carries it
        retry = setTimeout(() => {
          retry = null;
          open();
        }, Math.min(15_000, 500 * 2 ** failures));
      };
      open();
      return () => {
        closed = true;
        if (beat) clearInterval(beat);
        if (retry) clearTimeout(retry);
        try {
          socket?.close();
        } catch {
          /* gone */
        }
      };
    },
  };
};
