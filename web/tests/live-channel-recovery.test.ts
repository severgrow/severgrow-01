import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPlayerChannel } from '../src/online/live/channel.js';

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
const setup = () => {
  vi.useFakeTimers();
  const sockets: ReturnType<typeof make>[] = [];
  function make() {
    const callbacks = new Map<string, ((e: { data?: unknown }) => void)[]>();
    const sent: { topic: string; event: string; ref: string }[] = [];
    return { readyState: 1, send: (s: string) => { sent.push(JSON.parse(s)); }, sent,
      close: vi.fn(), addEventListener: (t: string, cb: (e: { data?: unknown }) => void) => callbacks.set(t, [...callbacks.get(t) ?? [], cb]),
      emit: (t: string, data?: unknown) => { for (const cb of callbacks.get(t) ?? []) cb({ data }); },
    };
  }
  const channel = createPlayerChannel(() => { const s = make(); sockets.push(s); return s; }, { url: 'https://unused.invalid', key: 'test' });
  const ping = vi.fn();
  const stop = channel.subscribe('p', ping);
  const join = () => { const s = sockets.at(-1)!; s.emit('open'); s.emit('message', JSON.stringify({ topic: 'realtime:player:p', event: 'phx_reply', payload: { status: 'ok' } })); return s; };
  return { channel, sockets, ping, stop, join };
};
describe('mobile Realtime transport repair', () => {
  it('retries a socket that remains connecting without ever opening', async () => {
    const t = setup();
    await vi.advanceTimersByTimeAsync(14000);
    expect(t.sockets[0]!.close).toHaveBeenCalledTimes(1);
    expect(t.sockets.length).toBe(2);
    t.join(); expect(t.channel.connected?.()).toBe(true);
    t.stop(); expect(vi.getTimerCount()).toBe(0);
  });
  for (const event of ['phx_error', 'phx_close']) it(`repairs a ${event} without waiting for a socket close`, async () => {
    const t = setup(); const first = t.join();
    expect(t.channel.connected?.()).toBe(true);
    first.emit('message', JSON.stringify({ topic: 'realtime:player:p', event }));
    expect(t.channel.connected?.()).toBe(false);
    await vi.advanceTimersByTimeAsync(1000);
    t.join(); expect(t.ping.mock.calls.map(c=>c[0])).toEqual(['connected','disconnected','connected']);
    t.stop(); expect(vi.getTimerCount()).toBe(0);
  });
  it('repairs an open socket whose subscription never joins', async () => {
    const t = setup(); t.sockets[0]!.emit('open');
    await vi.advanceTimersByTimeAsync(14000);
    expect(t.sockets.length).toBe(2);
    t.join(); expect(t.channel.connected?.()).toBe(true);
    t.stop(); expect(vi.getTimerCount()).toBe(0);
  });
  it('repairs a silently dead socket and ignores acknowledgements from its old connection', async () => {
    const t = setup(); const first = t.join();
    await vi.advanceTimersByTimeAsync(25000);
    const heartbeat = first.sent.at(-1)!;
    expect(heartbeat.event).toBe('heartbeat');
    await vi.advanceTimersByTimeAsync(14000);
    expect(t.sockets.length).toBe(2);
    t.join();
    first.emit('message', JSON.stringify({ topic: 'phoenix', ref: heartbeat.ref, event: 'phx_reply', payload: { status: 'ok' } }));
    expect(t.channel.connected?.()).toBe(true);
    t.stop(); expect(vi.getTimerCount()).toBe(0);
  });
  it('closes a hidden tab socket and reconnects immediately on return, with no hidden heartbeat',async()=>{
    const doc=Object.assign(new EventTarget(),{hidden:false}), win=new EventTarget();
    vi.stubGlobal('document',doc);vi.stubGlobal('window',win);
    const t=setup(), first=t.join();
    doc.hidden=true;doc.dispatchEvent(new Event('visibilitychange'));
    expect(first.close).toHaveBeenCalledTimes(1);expect(t.channel.connected?.()).toBe(false);
    const sent=first.sent.length;await vi.advanceTimersByTimeAsync(120000);
    expect(first.sent).toHaveLength(sent);expect(vi.getTimerCount()).toBe(0);
    doc.hidden=false;doc.dispatchEvent(new Event('visibilitychange'));
    expect(t.sockets).toHaveLength(2);t.join();expect(t.channel.connected?.()).toBe(true);
    t.stop();doc.dispatchEvent(new Event('visibilitychange'));win.dispatchEvent(new Event('online'));
    expect(t.sockets).toHaveLength(2);expect(vi.getTimerCount()).toBe(0);
  });
  it('online retries after exhausting the bounded reconnect attempts',async()=>{
    const doc=Object.assign(new EventTarget(),{hidden:false}),win=new EventTarget();
    vi.stubGlobal('document',doc);vi.stubGlobal('window',win);
    const t=setup();await vi.advanceTimersByTimeAsync(180000);
    const count=t.sockets.length;expect(vi.getTimerCount()).toBe(0);
    win.dispatchEvent(new Event('online'));expect(t.sockets).toHaveLength(count+1);
    t.join();expect(t.channel.connected?.()).toBe(true);t.stop();
  });
});

// THE BOUNDED BURST (debug pass, 2026-11-18). The soak's "retries converge" check failed on CI
// because it waited a fixed 60 s while a burst on a slow runner legitimately ran longer. Its window is
// now derived from these exported limits, so the limits themselves are pinned here: a refused
// Realtime transport is tried at most REALTIME_RETRY.maxAttempts times, then polling carries it.
describe('a refused transport stops after a bounded burst', () => {
  it('at most REALTIME_RETRY.maxAttempts sockets, then no timer is left armed', async () => {
    const { REALTIME_RETRY, realtimeBurstBoundMs } = await import('../src/online/live/channel.js');
    const t = setup();
    // every attempt is refused at once
    for (let i = 0; i < 20; i++) { t.sockets.at(-1)?.emit('error'); await vi.advanceTimersByTimeAsync(16_000); }
    expect(t.sockets.length).toBe(REALTIME_RETRY.maxAttempts);
    expect(vi.getTimerCount()).toBe(0);
    // ...and the documented worst case covers delays plus every attempt hanging to its deadline.
    expect(realtimeBurstBoundMs()).toBe(1000 + 2000 + 4000 + 8000 + 15000 + REALTIME_RETRY.maxAttempts * 12_000);
    t.stop();
  });
});
