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
  it('reports topic acknowledgement, late subscribers and disconnection accurately', () => {
    const socket = new FakeSocket('wss://test');
    const channel = createRealtimeChannel({ url: socket.url, socket: () => socket });
    const health = vi.fn();
    const off = channel.subscribe('match:health', { onPing() {}, onPresence() {}, onConnection: health });
    expect(health).toHaveBeenLastCalledWith(false);
    socket.emit('open');
    expect(health).toHaveBeenLastCalledWith(false);
    socket.emit('message', { data: JSON.stringify({ topic: 'realtime:match:health', event: 'phx_reply', payload: { status: 'ok' } }) });
    expect(health).toHaveBeenLastCalledWith(true);
    const late = vi.fn();
    const offLate = channel.subscribe('match:health', { onPing() {}, onPresence() {}, onConnection: late });
    expect(late).toHaveBeenLastCalledWith(true);
    socket.emit('error');
    expect(health).toHaveBeenLastCalledWith(false);
    expect(late).toHaveBeenLastCalledWith(false);
    offLate();
    off();
  });

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

  it('gives up (and keeps polling) when Realtime never connects', () => {
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
      channel.subscribe('match:3', { onPing: () => undefined, onPresence: () => undefined });
      // Every attempt opens a socket that immediately drops, up to the retry budget.
      for (let i = 0; i < 8; i++) {
        sockets.at(-1)!.emit('close');
        vi.advanceTimersByTime(20_000);
      }
      const settled = sockets.length;
      sockets.at(-1)!.emit('close');
      vi.advanceTimersByTime(120_000);
      expect(sockets.length).toBe(settled);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('the channel wakes with the page (a phone back from sleep, the network back)', () => {
  const make = (now: () => number) => {
    const sockets: FakeSocket[] = [];
    let wake: () => void = () => undefined;
    const channel = createRealtimeChannel({
      url: 'wss://example.supabase.co/realtime/v1/websocket',
      socket: (url) => { const s = new FakeSocket(url); sockets.push(s); return s; },
      heartbeatMs: 25_000,
      wake: (cb) => { wake = cb; return () => undefined; },
      now,
    });
    return { sockets, channel, wake: () => wake() };
  };

  it('after giving up, a wake connects again at once (no waiting, a fresh retry budget)', () => {
    vi.useFakeTimers();
    try {
      const { sockets, channel, wake } = make(() => Date.now());
      channel.subscribe('match:w1', { onPing: () => undefined, onPresence: () => undefined });
      for (let i = 0; i < 8; i++) { sockets.at(-1)!.emit('close'); vi.advanceTimersByTime(20_000); }
      const settled = sockets.length;
      wake();
      expect(sockets.length).toBe(settled + 1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('a socket silent for longer than two heartbeats is replaced on wake; a live one is kept', () => {
    let t = 0;
    const { sockets, channel, wake } = make(() => t);
    channel.subscribe('match:w2', { onPing: () => undefined, onPresence: () => undefined });
    sockets[0]!.emit('open');
    sockets[0]!.emit('message', { data: JSON.stringify({ topic: 'realtime:match:w2', event: 'phx_reply', payload: { status: 'ok' } }) });
    t = 10_000;
    wake();
    expect(sockets).toHaveLength(1); // heard from recently: kept
    t = 10_000 + 60_000; // the phone slept: nothing heard for a minute
    wake();
    expect(sockets).toHaveLength(2);
    expect(sockets[0]!.readyState).toBe(3);
  });

  it('the wake listener is attached only while someone listens', () => {
    let attached = 0;
    const channel = createRealtimeChannel({
      url: 'wss://example.supabase.co/realtime/v1/websocket',
      socket: (url) => new FakeSocket(url),
      wake: () => { attached += 1; return () => { attached -= 1; }; },
    });
    expect(attached).toBe(0);
    const off1 = channel.subscribe('match:w4', { onPing: () => undefined, onPresence: () => undefined });
    const off2 = channel.subscribe('match:w5', { onPing: () => undefined, onPresence: () => undefined });
    expect(attached).toBe(1);
    off1();
    expect(attached).toBe(1);
    off2();
    expect(attached).toBe(0);
  });

  it('nobody listening: a wake opens nothing', () => {
    const { sockets, wake } = make(() => 0);
    wake();
    expect(sockets).toHaveLength(0);
  });
});

describe('createSupabaseBroadcaster', () => {
  it('registers unfinished delivery with the Edge runtime without delaying the response', async () => {
    const tasks:Promise<unknown>[]=[];let release!:(response:Response)=>void;
    vi.stubGlobal('EdgeRuntime',{waitUntil:(task:Promise<unknown>)=>tasks.push(task)});
    try {
      const broadcaster=createSupabaseBroadcaster({url:'https://proj.supabase.co',key:'anon',fetch:(()=>new Promise<Response>(resolve=>{release=resolve;})) as typeof fetch});
      await broadcaster.publish('m1',{revision:1,status:'active'});
      expect(tasks).toHaveLength(1);let finished=false;void tasks[0]!.then(()=>{finished=true;});
      await Promise.resolve();expect(finished).toBe(false);
      release(new Response(null,{status:202}));await tasks[0];expect(finished).toBe(true);
    } finally {vi.unstubAllGlobals();}
  });

  it('reports rejected REST delivery as an error without failing the committed request', async () => {
    const errors:unknown[]=[];
    const broadcaster=createSupabaseBroadcaster({url:'https://proj.supabase.co',key:'anon',fetch:(async()=>new Response(null,{status:401})) as typeof fetch,onError:error=>errors.push(error)});
    await broadcaster.publish('m1',{revision:1,status:'active'});await broadcaster.flush();
    expect(errors).toHaveLength(1);
  });
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
