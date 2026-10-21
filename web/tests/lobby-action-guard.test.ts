// One tap, one request: the lobby's in-flight guard.
//
// The server already ignores a duplicate find/create/join, but the client used to send it anyway:
// two taps on "Find opponent" (or Create a duel, or Join) dispatched two requests, and the lock
// only cleared when the first one happened to settle. The guard is DOM-free so it can be proved
// here without a browser; lobby-ui.ts is the only thing that paints the pending state.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLobbyActionGuard } from '../src/online/lobby-action.js';

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

afterEach(() => {
  vi.useRealTimers();
});

describe('the lobby action guard: a second tap cannot dispatch a second request', () => {
  it('declines a second action while the first is in flight, without calling its task', async () => {
    const guard = createLobbyActionGuard();
    const first = deferred<string>();
    const firstTask = vi.fn(() => first.promise);
    const secondTask = vi.fn(async () => 'second');

    const a = guard.run('find', firstTask);
    const b = guard.run('find', secondTask);

    await expect(b).resolves.toEqual({ started: false });
    expect(firstTask).toHaveBeenCalledTimes(1);
    expect(secondTask).not.toHaveBeenCalled();
    expect(guard.isBusy()).toBe(true);

    first.resolve('paired');
    await expect(a).resolves.toEqual({ started: true, value: 'paired' });
    expect(guard.isBusy()).toBe(false);
  });

  it('releases after success, so the next action can start', async () => {
    const guard = createLobbyActionGuard();
    await expect(guard.run('create', async () => 'ok')).resolves.toEqual({ started: true, value: 'ok' });
    await expect(guard.run('create', async () => 'again')).resolves.toEqual({ started: true, value: 'again' });
  });

  it('releases after failure, and hands the error to the caller', async () => {
    const guard = createLobbyActionGuard();
    const boom = new Error('offline');
    await expect(guard.run('join', async () => { throw boom; })).rejects.toBe(boom);
    expect(guard.isBusy()).toBe(false);
    await expect(guard.run('join', async () => 'recovered')).resolves.toEqual({ started: true, value: 'recovered' });
  });

  it('releases on timeout, even when the request never settles', async () => {
    vi.useFakeTimers();
    const guard = createLobbyActionGuard({ timeoutMs: 1000 });
    const hung = deferred<string>();
    const result = guard.run('join', () => hung.promise);
    await vi.advanceTimersByTimeAsync(1000);
    await expect(result).resolves.toEqual({ started: true, timedOut: true });
    expect(guard.isBusy()).toBe(false);
    // A late settlement of the abandoned request must not release a NEW action's lock.
    const next = deferred<string>();
    const after = guard.run('find', () => next.promise);
    hung.resolve('too late');
    await Promise.resolve();
    expect(guard.isBusy()).toBe(true);
    next.resolve('fresh');
    await expect(after).resolves.toEqual({ started: true, value: 'fresh' });
  });

  it('reports the pending action once, then null — the control can paint its pending state', async () => {
    const seen: (string | null)[] = [];
    const guard = createLobbyActionGuard({ onPending: (action) => seen.push(action) });
    await guard.run('find', async () => undefined);
    expect(seen).toEqual(['find', null]);
  });

  it('does not paint a pending state for the tap it refused', async () => {
    const seen: (string | null)[] = [];
    const guard = createLobbyActionGuard({ onPending: (action) => seen.push(action) });
    const hung = deferred<void>();
    const first = guard.run('create', () => hung.promise);
    await guard.run('create', async () => undefined);
    expect(seen).toEqual(['create']);
    hung.resolve();
    await first;
    expect(seen).toEqual(['create', null]);
  });

  it('names the action it is holding, so the guard is observable', async () => {
    const guard = createLobbyActionGuard();
    const hung = deferred<void>();
    const run = guard.run('join', () => hung.promise);
    expect(guard.current()).toBe('join');
    hung.resolve();
    await run;
    expect(guard.current()).toBeNull();
  });
});
