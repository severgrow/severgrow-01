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

export const createPlayerChannel = (socketCtor?: (url: string) => Socket, config?: { url: string; key: string }): PlayerChannel => {
  const env = (import.meta as { env?: Record<string, string | undefined> }).env;
  const url = (config?.url ?? env?.VITE_SUPABASE_URL)?.trim();
  const key = (config?.key ?? env?.VITE_SUPABASE_ANON_KEY)?.trim();
  if (!url || !key) return { subscribe: () => () => undefined, connected: () => false };
  const wsUrl = `${url.replace(/^http/i, 'ws').replace(/\/+$/, '')}/realtime/v1/websocket?apikey=${encodeURIComponent(key)}&vsn=1.0.0`;
  const make = socketCtor ?? ((u: string) => new (globalThis as unknown as { WebSocket: new (u: string) => Socket }).WebSocket(u));
  let joined = 0; // subscriptions whose channel join the server confirmed
  return {
    connected: () => joined > 0,
    subscribe(playerId, onPing) {
      const topic = `realtime:player:${playerId}`;
      let socket: Socket | null = null;
      let beat: ReturnType<typeof setInterval> | null = null;
      let retry: ReturnType<typeof setTimeout> | null = null;
      let deadline: ReturnType<typeof setTimeout> | null = null;
      let heartbeatRef: string | null = null;
      let failures = 0;
      let closed = false;
      let ref = 0;
      let joinRef: string | null = null;
      let isJoined = false;
      const setJoined = (on: boolean) => {
        if (on === isJoined) return;
        isJoined = on;
        joined += on ? 1 : -1;
      };
      const send = (t: string, event: string, payload: unknown) => {
        if (socket?.readyState !== 1) return;
        ref += 1;
        if (event === 'phx_join') joinRef = String(ref);
        socket.send(JSON.stringify({ topic: t, event, payload, ref: String(ref), join_ref: t === 'phoenix' ? null : joinRef }));
        return String(ref);
      };
      const open = () => {
        if (closed) return;
        try {
          socket = make(wsUrl);
        } catch {
          return schedule();
        }
        const attempt = socket;
        const clearDeadline = () => {
          if (deadline) clearTimeout(deadline);
          deadline = null;
        };
        const down = () => {
          if (closed || socket !== attempt) return;
          setJoined(false);
          clearDeadline();
          heartbeatRef = null;
          if (beat) clearInterval(beat);
          beat = null;
          socket = null;
          try { attempt.close(); } catch { /* already disconnected */ }
          schedule();
        };
        socket.addEventListener('open', () => {
          if (closed || socket !== attempt) return;
          clearDeadline();
          send(topic, 'phx_join', { config: { broadcast: { ack: false, self: false }, presence: { enabled: false }, private: false } });
          deadline = setTimeout(down, 12000);
          beat = setInterval(() => {
            if (!isJoined || heartbeatRef) return;
            heartbeatRef = send('phoenix', 'heartbeat', {}) ?? null;
            deadline = setTimeout(down, 12000);
          }, 25_000);
        });
        socket.addEventListener('message', (ev) => {
          if (closed || socket !== attempt) return;
          try {
            const frame = JSON.parse(String(ev.data)) as { topic?: unknown; event?: unknown; ref?: unknown; payload?: { status?: unknown } };
            if (frame.topic === 'phoenix' && frame.event === 'phx_reply' && frame.ref === heartbeatRef && frame.payload?.status === 'ok') {
              heartbeatRef = null;
              clearDeadline();
            }
            if (frame.topic === topic && (frame.event === 'phx_error' || frame.event === 'phx_close' ||
                (frame.event === 'phx_reply' && frame.payload?.status === 'error'))) {
              down();
              return;
            }
            // Only a confirmed join counts as "connected" (a socket that opens but cannot join does not).
            if (!isJoined && frame.topic === topic && frame.event === 'phx_reply' && frame.payload?.status === 'ok') {
              setJoined(true);
              failures = 0;
              clearDeadline();
              // Recover changes made before this join (or while disconnected), without waiting
              // for the slow connected-channel safety poll.
              onPing('connected');
            }
            if (isChallengeFrame(frame, topic)) onPing('notification');
          } catch {
            /* non-JSON frame */
          }
        });
        socket.addEventListener('close', down);
        socket.addEventListener('error', down);
        // A suspended connection can stay CONNECTING without an open/error event.
        deadline = setTimeout(down, 12000);
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
        setJoined(false);
        if (beat) clearInterval(beat);
        if (retry) clearTimeout(retry);
        if (deadline) clearTimeout(deadline);
        try {
          socket?.close();
        } catch {
          /* gone */
        }
      };
    },
  };
};
