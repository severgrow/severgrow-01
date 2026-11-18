// "Could not create a FUTASAKU guest" (owner screenshot, 2026-11-18, /test, Find opponent while
// signed out). Measured the same hour: the real server sometimes leaves a guest creation with no
// answer at all (two of three silent for 20 s; the third answered in 0.5 s). One silent request
// must not reach the player as an error: a guest creation that got no answer is tried once more.
// A real refusal (rate limit, any 4xx) is final and is said as it is.
import { describe, expect, it, vi } from 'vitest';
import { DuelClient } from '../../server/src/client.js';
import type { KeyValue } from '../../server/src/client.js';
import { createIdentityStore } from '../src/online/identity.js';

const mem = (): KeyValue => {
  const map = new Map<string, string>();
  return { get: (k) => map.get(k) ?? null, set: (k, v) => void map.set(k, v), remove: (k) => void map.delete(k) };
};
const guest = (n: number) => ({ ok: true, status: 201, json: async () => ({ ok: true, player: { id: `p${n}`, kind: 'guest', displayName: 'G' }, token: `t${n}`, serverNow: 0 }) }) as never;

describe('guest creation that gets no answer is tried again', () => {
  it('a silent first attempt: the second attempt creates the guest, no error reaches the player', async () => {
    vi.useFakeTimers();
    try {
      let calls = 0;
      // The first attempt's two copies stay silent; the next attempt answers.
      const client = new DuelClient({ baseUrl: 'https://api.example', storage: mem(),
        fetch: async () => (++calls <= 2 ? new Promise(() => {}) : guest(calls)) });
      const store = createIdentityStore({ client, storage: mem() });
      const status = store.ensure();
      await vi.advanceTimersByTimeAsync(13_000);
      await expect(status).resolves.toMatchObject({ ok: true, identity: { token: 't3' } });
    } finally { vi.useRealTimers(); }
  });

  it('a real refusal is final, said as it is, and not repeated', async () => {
    let calls = 0;
    const client = new DuelClient({ baseUrl: 'https://api.example', storage: mem(),
      fetch: async () => { calls++; return { ok: false, status: 429, json: async () => ({ ok: false, code: 'RATE_LIMITED', message: 'Too many requests. Try again in a moment.' }) } as never; } });
    const status = await createIdentityStore({ client, storage: mem() }).ensure();
    expect(status).toMatchObject({ ok: false, message: 'Too many requests. Try again in a moment.' });
    expect(calls).toBe(1);
  });

  it('when the server stays silent, the message says so, not "check your connection"', async () => {
    vi.useFakeTimers();
    try {
      const client = new DuelClient({ baseUrl: 'https://api.example', storage: mem(), fetch: async () => new Promise(() => {}) });
      const status = createIdentityStore({ client, storage: mem() }).ensure();
      await vi.advanceTimersByTimeAsync(30_000);
      const out = await status;
      expect(out.ok).toBe(false);
      expect((out as { message: string }).message).not.toMatch(/connection/i);
      expect((out as { message: string }).message).toMatch(/server/i);
    } finally { vi.useRealTimers(); }
  });
});
