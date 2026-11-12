import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPlayerChannel } from '../src/online/live/channel.js';

afterEach(() => vi.useRealTimers());
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
    t.join(); expect(t.ping).toHaveBeenCalledTimes(2);
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
});
