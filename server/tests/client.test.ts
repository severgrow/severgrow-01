// The typed client: request shape, error mapping and the local session that makes a page refresh
// able to resume a match. Uses a fake fetch, so it runs in Node without a browser or a server.
import { describe, expect, it } from 'vitest';
import { DuelClient, DuelError, lastOpponentTurn } from '../src/client.js';
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

  // OWNER REPORT (2026-10-27): reopening an online match from the list replayed MORE than the
  // opponent's last move — the whole game — and flickered. The list asked for the full history and
  // the driver replays whatever events a payload carries. Each match now remembers how far THIS
  // device has seen it, so a reopen asks only for the gap.
  it('remembers how far each match was seen, per match, so a reopen asks only for the gap', async () => {
    const store = memoryStore();
    const client = new DuelClient({ baseUrl: 'https://api.example', fetch: makeFetch({}).fetchImpl, storage: store });
    expect(client.seenRevision('m1')).toBeUndefined();
    client.saveSession({ token: 'tok', matchId: 'm1', seat: 0, revision: 12 });
    client.saveSession({ token: 'tok', matchId: 'm2', seat: 1, revision: 4 });
    expect(client.seenRevision('m1')).toBe(12);
    expect(client.seenRevision('m2')).toBe(4);
    // a fresh client on the same storage (a reload) still knows
    const again = new DuelClient({ baseUrl: 'https://api.example', fetch: makeFetch({}).fetchImpl, storage: store });
    expect(again.seenRevision('m1')).toBe(12);
    // never goes backwards (an older view arriving late)
    again.saveSession({ token: 'tok', matchId: 'm1', seat: 0, revision: 10 });
    expect(again.seenRevision('m1')).toBe(12);
  });

  it('keeps the seen list small (the most recent matches only)', () => {
    const client = new DuelClient({ baseUrl: 'https://api.example', fetch: makeFetch({}).fetchImpl, storage: memoryStore() });
    for (let i = 0; i < 80; i++) client.saveSession({ token: 'tok', matchId: `m${i}`, seat: 0, revision: i + 1 });
    expect(client.seenRevision('m79')).toBe(80);
    expect(client.seenRevision('m0')).toBeUndefined();
  });

  it('a match never seen on this device replays only the opponent\'s last turn', () => {
    const events = [
      { t: 'Draw', player: 0 }, { t: 'Sprout', player: 0 }, { t: 'Discard', player: 0 },
      { t: 'Draw', player: 1 }, { t: 'Bloom', player: 1 }, { t: 'Sever', player: 0 }, { t: 'Discard', player: 1 },
      { t: 'Draw', player: 0 }, { t: 'Sprout', player: 0 }, { t: 'Discard', player: 0 },
      { t: 'Draw', player: 1 }, { t: 'Sprout', player: 1 }, { t: 'Discard', player: 1 },
    ] as never[];
    expect(lastOpponentTurn(events, 0)).toEqual(events.slice(10));
    // it is the opponent's own turn now (my turn was the last one): nothing of theirs to show
    expect(lastOpponentTurn(events.slice(0, 10), 0)).toEqual([]);
    expect(lastOpponentTurn([], 0)).toEqual([]);
  });

  it('reopening asks for the gap since the seen revision, and withholds history it cannot place', async () => {
    const view = (revision: number, events: unknown[]) => ({ status: 200, body: { ok: true, serverNow: 1, player: { matchId: 'm1', revision, seat: 0, status: 'active', events } } });
    const { fetchImpl, calls } = makeFetch({
      'GET /v1/matches/m1/view?since=12': view(14, [{ t: 'EndAct' }]),
      'GET /v1/matches/m1/view': view(14, [{ t: 'A' }, { t: 'B' }, { t: 'EndAct' }]),
    });
    const store = memoryStore();
    const client = new DuelClient({ baseUrl: 'https://api.example', fetch: fetchImpl, storage: store });
    const unknown = await client.openView('tok', 'm1');
    expect(calls.at(-1)!.url).toBe('https://api.example/v1/matches/m1/view');
    // no Draw by the opponent in this history: nothing to place, nothing replayed
    expect(unknown.player.events).toEqual([]);
    client.saveSession({ token: 'tok', matchId: 'm1', seat: 0, revision: 12 });
    const gap = await client.openView('tok', 'm1');
    expect(calls.at(-1)!.url).toBe('https://api.example/v1/matches/m1/view?since=12');
    expect(gap.player.events).toEqual([{ t: 'EndAct' }]);
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
