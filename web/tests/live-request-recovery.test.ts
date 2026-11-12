import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLiveApi } from '../src/online/live/api.js';

afterEach(() => vi.useRealTimers());
describe('presence transport recovery', () => {
  for (const route of ['presence', 'status'] as const) it(`releases a hung ${route} request so a reconnect can retry`, async () => {
    vi.useFakeTimers();
    let attempts = 0;
    const api = createLiveApi({ baseUrl: 'https://unused.invalid', token: () => 'test', fetch: async (_url, init) => {
      if (++attempts > 1) return { status: 200, json: async () => ({ live: { matchId: 'm' } }) };
      return new Promise((_resolve, reject) => init.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true }));
    } });
    const send = () => route === 'presence' ? api.presence('in_match', 'm', true) : api.status('m');
    let failed = false;
    const pending = send().catch(() => { failed = true; });
    await vi.advanceTimersByTimeAsync(12000);
    expect(failed).toBe(true);
    await pending;
    await send();
    expect(attempts).toBe(2);
    expect(vi.getTimerCount()).toBe(0);
  });
});
