// The typed client: request shape, error mapping and the local session that makes a page refresh
// able to resume a match. Uses a fake fetch, so it runs in Node without a browser or a server.
import { describe, expect, it } from 'vitest';
import { DuelClient, DuelError } from '../src/client.js';
import type { FetchLike, KeyValue } from '../src/client.js';

type Route = { status: number; body: unknown };

const makeFetch = (routes: Record<string, Route>) => {
  const calls: { method: string; url: string; init: { headers: Record<string, string>; body?: string } }[] = [];
  const fetchImpl: FetchLike = async (url, init) => {
    calls.push({ method: init.method, url, init });
    const path = new URL(url).pathname + (new URL(url).search ?? '');
    const route = routes[`${init.method} ${path}`];
    const resolved = route ?? { status: 404, body: { ok: false, code: 'NOT_FOUND', message: 'no route' } };
    return { status: resolved.status, ok: resolved.status < 400, json: async () => resolved.body };
  };
  return { fetchImpl, calls };
};

const memoryStore = (): KeyValue => {
  const map = new Map<string, string>();
  return { get: (k) => map.get(k) ?? null, set: (k, v) => void map.set(k, v), remove: (k) => void map.delete(k) };
};

const SESSION_KEY = 'severgrow.duel.session.v1';

describe('DuelClient', () => {
  it('creates a guest without an Authorization header', async () => {
    const { fetchImpl, calls } = makeFetch({
      'POST /v1/guests': { status: 201, body: { ok: true, player: { id: 'p1', kind: 'guest', displayName: null }, token: 't'.repeat(40) } },
    });
    const client = new DuelClient({ baseUrl: 'https://api.example', fetch: fetchImpl, storage: memoryStore() });
    const created = await client.createGuest('A');
    expect(created.token).toHaveLength(40);
    expect(calls[0]!.method).toBe('POST');
    expect(calls[0]!.url).toBe('https://api.example/v1/guests');
    expect(calls[0]!.init.headers.authorization).toBeUndefined();
  });

  it('sends the bearer token and the JSON body for a match creation', async () => {
    const { fetchImpl, calls } = makeFetch({
      'POST /v1/matches': { status: 201, body: { ok: true, match: { matchId: 'm1' }, player: { matchId: 'm1', seat: 0, revision: 0 } } },
    });
    const client = new DuelClient({ baseUrl: 'https://api.example/', fetch: fetchImpl, storage: memoryStore() });
    await client.createMatch('secret-token-value');
    expect(calls[0]!.url).toBe('https://api.example/v1/matches');
    expect(calls[0]!.init.headers.authorization).toBe('Bearer secret-token-value');
    expect(calls[0]!.init.headers['content-type']).toBe('application/json');
  });

  it('passes sinceRevision as a query for a view and as a body for a reconnect', async () => {
    const { fetchImpl, calls } = makeFetch({
      'GET /v1/matches/m1/view?since=3': { status: 200, body: { ok: true, player: { matchId: 'm1', seat: 0, revision: 4 } } },
      'POST /v1/matches/m1/reconnect': { status: 200, body: { ok: true, player: { matchId: 'm1', seat: 0, revision: 4 } } },
    });
    const client = new DuelClient({ baseUrl: 'https://api.example', fetch: fetchImpl, storage: memoryStore() });
    await client.getState('tok', 'm1', 3);
    await client.reconnect('tok', 'm1', 3);
    expect(calls[0]!.url).toContain('/v1/matches/m1/view?since=3');
    expect(JSON.parse(calls[1]!.init.body!)).toEqual({ sinceRevision: 3 });
  });

  it('throws a DuelError carrying the server code and message', async () => {
    const { fetchImpl } = makeFetch({
      'POST /v1/matches/m1/actions': { status: 409, body: { ok: false, code: 'STALE_REVISION', message: 'Expected revision 1, current is 2.' } },
    });
    const client = new DuelClient({ baseUrl: 'https://api.example', fetch: fetchImpl, storage: memoryStore() });
    await expect(client.submitAction('tok', 'm1', { expectedRevision: 1, requestId: 'r', action: { t: 'EndAct' } })).rejects.toMatchObject({
      name: 'DuelError',
      code: 'STALE_REVISION',
      status: 409,
    });
    await expect(client.submitAction('tok', 'm1', { expectedRevision: 1, requestId: 'r', action: { t: 'EndAct' } })).rejects.toBeInstanceOf(DuelError);
  });

  it('round-trips the session so a refresh can resume, and clears it on demand', async () => {
    const store = memoryStore();
    const { fetchImpl } = makeFetch({
      'POST /v1/matches/m1/reconnect': { status: 200, body: { ok: true, player: { matchId: 'm1', seat: 1, revision: 9, view: { hand: [] } } } },
    });
    const client = new DuelClient({ baseUrl: 'https://api.example', fetch: fetchImpl, storage: store });
    client.saveSession({ token: 'tok', matchId: 'm1', seat: 1 });
    expect(store.get(SESSION_KEY)).toContain('m1');

    const resumed = await client.resume();
    expect(resumed?.player.revision).toBe(9);
    expect(resumed?.session.seat).toBe(1);

    client.clearSession();
    expect(store.get(SESSION_KEY)).toBeNull();
    expect(client.loadSession()).toBeNull();
  });

  it('ignores a corrupt stored session instead of throwing', () => {
    const store = memoryStore();
    store.set(SESSION_KEY, '{not json');
    const client = new DuelClient({ baseUrl: 'https://api.example', fetch: makeFetch({}).fetchImpl, storage: store });
    expect(client.loadSession()).toBeNull();
  });
});
