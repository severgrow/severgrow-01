// Realtime ping transport: the broadcast frame parser, the no-dependency subscriber, and the
// server publisher. The ping is only a hint — these tests pin the shape so a silent regression
// (which would fall back to polling) is caught here instead of live.
import { describe, expect, it, vi } from 'vitest';
import { createRealtimeChannel, pingFromFrame } from '../src/online/channel.js';
import { broadcastBody, createSupabaseBroadcaster } from '../../server/src/broadcast-supabase.js';

type Handler = (ev: { data?: unknown }) => void;

class FakeSocket {
  readyState = 1;
  readonly sent: string[] = [];
  private readonly listeners = new Map<string, Handler[]>();
  constructor(readonly url: string) {}
  send(data: string): void {
    this.sent.push(data);
  }
  close(): void {
    this.readyState = 3;
  }
  addEventListener(type: string, cb: Handler): void {
    const list = this.listeners.get(type) ?? [];
    list.push(cb);
    this.listeners.set(type, list);
  }
  emit(type: string, ev: { data?: unknown } = {}): void {
    for (const cb of this.listeners.get(type) ?? []) cb(ev);
  }
}

describe('pingFromFrame', () => {
  it('reads the broadcast envelope and the inlined user event', () => {
    expect(
      pingFromFrame(
        { topic: 'realtime:match:1', event: 'broadcast', payload: { event: 'ping', payload: { revision: 7, status: 'active' } } },
        'realtime:match:1',
      ),
    ).toEqual({ revision: 7, status: 'active' });
    expect(
      pingFromFrame({ topic: 'realtime:match:1', event: 'ping', payload: { revision: 8, status: 'finished' } }, 'realtime:match:1'),
    ).toEqual({ revision: 8, status: 'finished' });
  });

  it('ignores other topics, events and malformed payloads', () => {
    expect(pingFromFrame({ topic: 'realtime:other', event: 'broadcast', payload: { event: 'ping', payload: { revision: 1, status: 'active' } } }, 'realtime:match:1')).toBeNull();
    expect(pingFromFrame({ topic: 'realtime:match:1', event: 'presence', payload: {} }, 'realtime:match:1')).toBeNull();
    expect(pingFromFrame({ topic: 'realtime:match:1', event: 'broadcast', payload: { event: 'ping', payload: { revision: 'x', status: 'active' } } }, 'realtime:match:1')).toBeNull();
  });
});

describe('createRealtimeChannel', () => {
  it('joins the match channel, delivers a ping, and leaves on unsubscribe', () => {
    const sockets: FakeSocket[] = [];
    const channel = createRealtimeChannel({
      url: 'wss://example.supabase.co/realtime/v1/websocket?apikey=k&vsn=1.0.0',
      socket: (url) => {
        const s = new FakeSocket(url);
        sockets.push(s);
        return s;
      },
      heartbeatMs: 1_000_000,
    });
    const pings: unknown[] = [];
    const off = channel.subscribe('match:1', { onPing: (p) => pings.push(p), onPresence: () => undefined });
    const socket = sockets[0]!;
    socket.emit('open');
    const join = JSON.parse(socket.sent[0]!) as { topic: string; event: string };
    expect(join).toMatchObject({ topic: 'realtime:match:1', event: 'phx_join' });

    socket.emit('message', { data: JSON.stringify({ topic: 'realtime:match:1', event: 'broadcast', payload: { event: 'ping', payload: { revision: 4, status: 'active' } } }) });
    expect(pings).toEqual([{ revision: 4, status: 'active' }]);

    off();
    expect(socket.sent.some((s) => JSON.parse(s).event === 'phx_leave')).toBe(true);
  });

  it('reconnects after the socket drops while someone is still listening', () => {
    vi.useFakeTimers();
    try {
      const sockets: FakeSocket[] = [];
      const channel = createRealtimeChannel({
        url: 'wss://example.supabase.co/realtime/v1/websocket',
        socket: (url) => {
          const s = new FakeSocket(url);
          sockets.push(s);
          return s;
        },
        heartbeatMs: 1_000_000,
      });
      channel.subscribe('match:2', { onPing: () => undefined, onPresence: () => undefined });
      expect(sockets).toHaveLength(1);
      sockets[0]!.emit('close');
      vi.advanceTimersByTime(600);
      expect(sockets.length).toBeGreaterThanOrEqual(2);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('createSupabaseBroadcaster', () => {
  it('posts the ping to the Realtime REST endpoint without blocking the caller', async () => {
    const calls: { url: string; init: { method?: string; headers?: Record<string, string>; body?: string } }[] = [];
    const broadcaster = createSupabaseBroadcaster({
      url: 'https://proj.supabase.co/',
      key: 'anon-key',
      fetch: (async (url: string, init: { method?: string; headers?: Record<string, string>; body?: string }) => {
        calls.push({ url, init });
        return { ok: true, status: 202 } as Response;
      }) as unknown as typeof fetch,
    });
    await broadcaster.publish('match:9', { revision: 3, status: 'active' });
    await broadcaster.flush();
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe('https://proj.supabase.co/realtime/v1/api/broadcast');
    expect(calls[0]!.init.method).toBe('POST');
    expect(calls[0]!.init.headers?.['apikey']).toBe('anon-key');
    expect(JSON.parse(calls[0]!.init.body!)).toEqual(broadcastBody('match:9', 'ping', { revision: 3, status: 'active' }));
  });

  it('never throws when the broadcast fails', async () => {
    const errors: unknown[] = [];
    const broadcaster = createSupabaseBroadcaster({
      url: 'https://proj.supabase.co',
      key: 'anon-key',
      fetch: (async () => {
        throw new Error('offline');
      }) as unknown as typeof fetch,
      onError: (e) => errors.push(e),
    });
    await expect(broadcaster.publish('match:9', { revision: 1, status: 'active' })).resolves.toBeUndefined();
    await broadcaster.flush();
    expect(errors).toHaveLength(1);
  });
});
