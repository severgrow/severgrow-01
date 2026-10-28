// The dashboard asks the server ONE THING AT A TIME (owner report, 2026-10-28: "Seeds & world" sat on
// "Loading the economy… / Loading the world…" forever). Through the deployed Edge runtime, database
// queries issued together can hang until the platform's 150 s idle timeout (server/src/admin/postgres.ts,
// `world`); the page fired four requests at once. And a request that never answers ends with a clear
// message instead of an endless "Loading".
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdminApi, ADMIN_REQUEST_TIMEOUT_MS } from '../src/api.js';

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('the admin client', () => {
  it('sends one request at a time, in the order asked', async () => {
    const started: string[] = [];
    const finish: (() => void)[] = [];
    vi.stubGlobal('fetch', (url: string) => {
      started.push(new URL(url).pathname);
      return new Promise<Response>((resolve) => finish.push(() => resolve(json({ ok: true }))));
    });
    const api = new AdminApi('https://api.test', 't');
    const a = api.get('/v1/admin/economy');
    const b = api.get('/v1/admin/world');
    const c = api.post('/v1/admin/world/cell', {});
    await Promise.resolve(); await Promise.resolve();
    expect(started).toEqual(['/v1/admin/economy']);
    finish[0]!(); await a;
    await vi.waitFor(() => expect(started).toEqual(['/v1/admin/economy', '/v1/admin/world']));
    finish[1]!(); await b;
    await vi.waitFor(() => expect(started).toHaveLength(3));
    finish[2]!();
    expect((await c).ok).toBe(true);
  });

  it('a request that never answers ends with a message, and the next one still goes', async () => {
    vi.useFakeTimers();
    let calls = 0;
    vi.stubGlobal('fetch', (_url: string, init: RequestInit) => {
      calls++;
      if (calls === 1) {
        return new Promise<Response>((_, reject) => init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))));
      }
      return Promise.resolve(json({ ok: true }));
    });
    const api = new AdminApi('https://api.test', 't');
    const hung = api.get('/v1/admin/world');
    const next = api.get('/v1/admin/economy');
    await vi.advanceTimersByTimeAsync(ADMIN_REQUEST_TIMEOUT_MS + 10);
    const result = await hung;
    expect(result.ok).toBe(false);
    expect(result.ok ? '' : result.code).toBe('TIMEOUT');
    expect(result.ok ? '' : result.message).toMatch(/too long/i);
    expect((await next).ok).toBe(true);
  });
});


it('keeps the deadline active until the entire response body is read', async () => {
 vi.useFakeTimers();
 vi.stubGlobal('fetch', (_url: string, init: RequestInit) => Promise.resolve(new Response(new ReadableStream({start(c) {
   init.signal?.addEventListener('abort', () => c.error(new DOMException('aborted','AbortError')));
 }}))));
 const api = new AdminApi('https://api.test','test');
 const request = api.get('/v1/admin/world');
 await vi.advanceTimersByTimeAsync(ADMIN_REQUEST_TIMEOUT_MS + 10);
 const result = await request;
 expect(result.ok).toBe(false);
 expect(result.ok ? '' : result.code).toBe('TIMEOUT');
});
