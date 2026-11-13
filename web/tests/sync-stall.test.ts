// A VIEW THAT NEVER ANSWERS MUST NOT FREEZE THE MATCH (owner, 2026-11-13: two phones on a Blitz duel,
// "on 1 device i couldnt move, and on the other it was showing the other device was away even tho it
// was online"). A phone's request can stall with no answer and no error (a dead connection after a
// network switch or a short sleep). The view fetch used to wait for it forever: it owned the one
// in-flight slot, so every later poll and ping joined the stalled request and the board never moved
// on. Each view now has a deadline; past it the request is abandoned and the next poll goes out.
import { describe, expect, it } from 'vitest';
import { DuelClient, createFakeChannel, createSyncEngine, VIEW_TIMEOUT_MS, submitWithRetries } from '../src/online/index.js';
import type { KeyValue } from '../src/online/index.js';

const memoryStore = (): KeyValue => {
  const map = new Map<string, string>();
  return { get: (k) => map.get(k) ?? null, set: (k, v) => void map.set(k, v), remove: (k) => void map.delete(k) };
};

const player = (revision: number) => ({ revision, events: [] }) as never;

describe('a stalled match view', () => {
  it('is abandoned after VIEW_TIMEOUT_MS, and the next fetch reaches the server', async () => {
    let calls = 0;
    const fetchImpl = (_url: string, init?: { signal?: AbortSignal }) => {
      calls++;
      if (calls === 1)
        // The first request never answers; only the abort ends it.
        return new Promise<never>((_, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))));
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ ok: true, player: player(5), serverNow: 1 }) });
    };
    const timers: { fn: () => void; ms: number; id: number }[] = [];
    const views: number[] = [];
    const states: string[] = [];
    const sync = createSyncEngine({
      client: new DuelClient({ baseUrl: 'https://api.example', fetch: fetchImpl as never, storage: memoryStore(), retryDelaysMs: [] }),
      token: 't', matchId: 'm1', channel: createFakeChannel().channel,
      isVisible: () => true, isOnline: () => true,
      setTimer: (fn, ms) => { const id = timers.length + 1; timers.push({ fn, ms, id }); return id; },
      clearTimer: (id) => { const i = timers.findIndex((t) => t.id === id); if (i >= 0) timers.splice(i, 1); },
      onView: (p) => views.push(p.revision),
      onConnection: (s) => states.push(s),
    });
    const started = sync.start();
    await Promise.resolve();
    const deadline = timers.find((t) => t.ms === VIEW_TIMEOUT_MS);
    expect(deadline).toBeDefined();
    deadline!.fn();
    await started;
    expect(states.at(-1)).toBe('reconnecting');
    await sync.refresh();
    expect(views).toEqual([5]);
    expect(states.at(-1)).toBe('online');
    sync.stop();
  });

  it('a move whose request stalls is sent again with the SAME request id', async () => {
    const ids: string[] = [];
    let calls = 0;
    const client = {
      submitAction: (_t: string, _m: string, body: { requestId: string }, options?: { signal?: AbortSignal }) => {
        ids.push(body.requestId);
        calls++;
        if (calls === 1) return new Promise((_, reject) => options?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))));
        return Promise.resolve({ ok: true });
      },
    };
    const pending: (() => void)[] = [];
    const out = submitWithRetries({
      client: client as never, token: 't', matchId: 'm', expectedRevision: 1, requestId: 'r-1',
      actions: [{ type: 'skip' } as never], rulesVersion: '', sleep: async () => undefined,
      setTimer: (fn: () => void) => { pending.push(fn); return pending.length; }, clearTimer: () => undefined,
    } as never);
    await Promise.resolve();
    pending[0]!();
    expect((await out).ok).toBe(true);
    expect(ids).toEqual(['r-1', 'r-1']);
  });
});
