// Self-healing identity: a stored token the server rejects (401 UNAUTHORIZED) must never leave a
// player stuck. The lobby client discards the dead identity, mints a fresh guest and retries the
// ORIGINAL call exactly once — no generic "Something went wrong" dead end. A live duel runs on its
// own client with no such hook, so a rejected token during an ACTIVE match surfaces honestly.
//
// Everything here uses a fake fetch: no server, no network.
import { describe, expect, it } from 'vitest';
import { DuelClient } from '../../server/src/client.js';
import type { FetchLike, KeyValue } from '../../server/src/client.js';
import { createIdentityStore, IDENTITY_STORAGE_KEY } from '../src/online/identity.js';
import type { IdentityStore } from '../src/online/identity.js';

const mem = (): KeyValue => {
  const map = new Map<string, string>();
  return {
    get: (k) => map.get(k) ?? null,
    set: (k, v) => void map.set(k, v),
    remove: (k) => void map.delete(k),
  };
};

type Call = { method: string; path: string; token: string | null; body: string | null };
type Route = { status: number; body: unknown } | ((call: Call) => { status: number; body: unknown });

const bear = (headers: Record<string, string>): string | null => {
  const raw = headers.authorization;
  return raw?.startsWith('Bearer ') ? raw.slice(7) : null;
};

/**
 * Builds a client + identity store wired EXACTLY like `web/src/online/lobby-ui.ts`: the client's
 * 401 hook calls `identity.recover()` and returns the fresh token.
 */
const wireLobby = (opts: { storage: KeyValue | null; routes: Record<string, Route> }) => {
  const calls: Call[] = [];
  const fetchImpl: FetchLike = async (url, init) => {
    const parsed = new URL(url);
    const call: Call = {
      method: init.method,
      path: parsed.pathname + (parsed.search ?? ''),
      token: bear(init.headers),
      body: init.body ?? null,
    };
    calls.push(call);
    const route = opts.routes[`${init.method} ${call.path}`];
    const resolved =
      typeof route === 'function'
        ? route(call)
        : route ?? { status: 404, body: { ok: false, code: 'NOT_FOUND', message: 'no route' } };
    return { status: resolved.status, ok: resolved.status < 400, json: async () => resolved.body };
  };
  let identityStore: IdentityStore | null = null;
  const client = new DuelClient({
    baseUrl: 'https://api.example',
    fetch: fetchImpl,
    storage: opts.storage,
    onUnauthorized: async () => {
      if (!identityStore) return null;
      const status = await identityStore.recover();
      return status.ok ? status.identity.token : null;
    },
  });
  const replaced: string[] = [];
  const identity = createIdentityStore({
    client,
    storage: opts.storage,
    onReplaced: (i) => replaced.push(i.token),
  });
  identityStore = identity;
  return { client, identity, calls, replaced };
};

const stored = (storage: KeyValue, token: string): void =>
  storage.set(
    IDENTITY_STORAGE_KEY,
    JSON.stringify({ token, playerId: 'p-old', displayName: null, kind: 'guest' }),
  );

const guestResponse = (token: string): { status: number; body: unknown } => ({
  status: 201,
  body: { ok: true, player: { id: 'p-new', kind: 'guest', displayName: 'MossHare' }, token, serverNow: 1 },
});

const unauthorized = {
  status: 401,
  body: { ok: false, code: 'UNAUTHORIZED', message: 'A valid token is required.' },
};

const matchesWith = (calls: Call[]): Call[] => calls.filter((c) => c.path === '/v1/matches');
const guestsWith = (calls: Call[]): Call[] => calls.filter((c) => c.path === '/v1/guests');

describe('self-healing identity (401 recovery)', () => {
  it('replaces a server-rejected token, retries the original call once, and succeeds', async () => {
    const storage = mem();
    stored(storage, 'dead');
    let succeededWithFresh = 0;
    const { client, calls, replaced } = wireLobby({
      storage,
      routes: {
        'POST /v1/matches': (call) => {
          if (call.token !== 'fresh') return unauthorized;
          succeededWithFresh++;
          return {
            status: 201,
            body: {
              ok: true,
              match: { matchId: 'm1', inviteCode: 'ABCD', status: 'waiting', revision: 0 },
              player: { matchId: 'm1', seat: 0, revision: 0 },
              serverNow: 1,
            },
          };
        },
        'POST /v1/guests': guestResponse('fresh'),
      },
    });

    const res = await client.createMatch('dead');
    expect(res.match.matchId).toBe('m1');
    expect(succeededWithFresh).toBe(1);
    // The dead token was tried once, then the fresh one — exactly one retry, exactly one guest.
    expect(matchesWith(calls).map((c) => c.token)).toEqual(['dead', 'fresh']);
    expect(guestsWith(calls)).toHaveLength(1);
    // Storage now holds the fresh guest, and the store announced the replacement once.
    expect(JSON.parse(storage.get(IDENTITY_STORAGE_KEY)!).token).toBe('fresh');
    expect(replaced).toEqual(['fresh']);
  });

  it('retries exactly once: a second 401 surfaces the error and never loops', async () => {
    const storage = mem();
    stored(storage, 'dead');
    const { client, calls } = wireLobby({
      storage,
      routes: {
        // Even the fresh guest is refused here, so the retry itself must fail — honestly.
        'GET /v1/players/me/matches': unauthorized,
        'POST /v1/guests': guestResponse('fresh'),
      },
    });

    await expect(client.listMatches('dead')).rejects.toMatchObject({ code: 'UNAUTHORIZED', status: 401 });
    expect(calls.filter((c) => c.path === '/v1/players/me/matches')).toHaveLength(2);
    expect(guestsWith(calls)).toHaveLength(1);
  });

  it('never retries a non-401 failure, and never swallows it', async () => {
    const storage = mem();
    stored(storage, 'dead');
    const { client, calls } = wireLobby({
      storage,
      routes: {
        'POST /v1/matches': { status: 500, body: { ok: false, code: 'HTTP_ERROR', message: 'boom' } },
        'POST /v1/guests': guestResponse('fresh'),
      },
    });

    await expect(client.createMatch('dead')).rejects.toMatchObject({ code: 'HTTP_ERROR', status: 500 });
    expect(matchesWith(calls)).toHaveLength(1);
    expect(guestsWith(calls)).toHaveLength(0);
    // A non-401 must not touch the identity.
    expect(JSON.parse(storage.get(IDENTITY_STORAGE_KEY)!).token).toBe('dead');
  });

  it('an action submit retried after the swap keeps the SAME requestId (idempotency)', async () => {
    const storage = mem();
    stored(storage, 'dead');
    const bodies: string[] = [];
    const { client } = wireLobby({
      storage,
      routes: {
        'POST /v1/matches/m1/actions': (call) => {
          bodies.push(call.body ?? '');
          if (call.token !== 'fresh') return unauthorized;
          return {
            status: 200,
            body: { ok: true, replayed: false, player: { matchId: 'm1', seat: 0, revision: 2 }, serverNow: 1 },
          };
        },
        'POST /v1/guests': guestResponse('fresh'),
      },
    });

    await client.submitAction('dead', 'm1', {
      expectedRevision: 1,
      requestId: 'stable-id',
      action: { t: 'EndAct' },
    });
    const requestIds = bodies.map((b) => (JSON.parse(b) as { requestId: string }).requestId);
    expect(requestIds).toEqual(['stable-id', 'stable-id']);
  });

  it('malformed or absent identity still behaves as today (creates a guest)', async () => {
    for (const seed of [null, '{not json', JSON.stringify({ token: 42 }), JSON.stringify({ token: 't', playerId: 5, kind: 'guest' })]) {
      const storage = mem();
      if (seed !== null) storage.set(IDENTITY_STORAGE_KEY, seed);
      const { identity, calls } = wireLobby({ storage, routes: { 'POST /v1/guests': guestResponse('fresh') } });
      const status = await identity.ensure();
      expect(status.ok).toBe(true);
      if (status.ok) expect(status.identity.token).toBe('fresh');
      expect(guestsWith(calls)).toHaveLength(1);
    }
  });

  it('storage-blocked still behaves honestly: no guest, no crash, recover reports blocked', async () => {
    const { identity, calls } = wireLobby({ storage: null, routes: { 'POST /v1/guests': guestResponse('fresh') } });
    const status = await identity.ensure();
    expect(status.ok).toBe(false);
    if (!status.ok) expect(status.reason).toBe('storage_blocked');
    const recovered = await identity.recover();
    expect(recovered.ok).toBe(false);
    if (!recovered.ok) expect(recovered.reason).toBe('storage_blocked');
    expect(calls).toHaveLength(0);
  });

  it('a rejected token during an ACTIVE match does NOT swap identity or abandon the match', async () => {
    const storage = mem();
    stored(storage, 'dead');
    const calls: string[] = [];
    const fetchImpl: FetchLike = async (url, init) => {
      calls.push(`${init.method} ${new URL(url).pathname}`);
      return { status: 401, ok: false, json: async () => unauthorized.body };
    };
    // The duel client `web/src/main.ts` builds for an open match: no recovery hook.
    const matchClient = new DuelClient({ baseUrl: 'https://api.example', fetch: fetchImpl, storage });

    await expect(
      matchClient.submitAction('dead', 'm1', { expectedRevision: 1, requestId: 'r', action: { t: 'EndAct' } }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED', status: 401 });
    // Exactly one attempt, no guest minted, and the stored identity is untouched.
    expect(calls).toEqual(['POST /v1/matches/m1/actions']);
    expect(JSON.parse(storage.get(IDENTITY_STORAGE_KEY)!).token).toBe('dead');
  });

  it('concurrent recoveries share one guest (no pile-up)', async () => {
    const storage = mem();
    stored(storage, 'dead');
    const { identity, calls } = wireLobby({ storage, routes: { 'POST /v1/guests': guestResponse('fresh') } });
    const [a, b] = await Promise.all([identity.recover(), identity.recover()]);
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    expect(guestsWith(calls)).toHaveLength(1);
  });

  it('a failed recovery clears the dead token; the next ensure() creates a guest', async () => {
    const storage = mem();
    stored(storage, 'dead');
    let attempts = 0;
    const { identity } = wireLobby({
      storage,
      routes: {
        'POST /v1/guests': () => {
          attempts++;
          if (attempts === 1) return { status: 503, body: { ok: false, code: 'DB_UNAVAILABLE', message: 'busy' } };
          return guestResponse('fresh');
        },
      },
    });

    const failed = await identity.recover();
    expect(failed.ok).toBe(false);
    // The unusable token is gone — ensure() can never keep returning it.
    expect(storage.get(IDENTITY_STORAGE_KEY)).toBeNull();
    const next = await identity.ensure();
    expect(next.ok).toBe(true);
    if (next.ok) expect(next.identity.token).toBe('fresh');
  });
});
