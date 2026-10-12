// The multiplayer vertical slice, over real HTTP with two independent clients:
//
//   1. Guest A creates a match.
//   2. Guest B joins with the invite code.
//   3. Both receive the correct private player views.
//   4. The player to act submits a legal action.
//   5. The server validates, commits and persists it.
//   6. Both receive their updated views.
//   7. A "refresh" (a brand-new client with the stored session) reconstructs the match.
//
// It also checks the security boundary: no token, no access; no seed/hidden cards in any payload.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createCards } from '../../src/engine/index.js';
import { DEFAULT_SERVER_CONFIG } from '../src/config.js';
import { createHttpServer } from '../src/http.js';
import { MatchService } from '../src/service.js';
import { MemoryStorage } from '../src/storage/memory.js';
import { DuelClient, DuelError } from '../src/client.js';
import type { FetchLike, KeyValue } from '../src/client.js';

/** A tiny in-memory KeyValue, standing in for localStorage across a simulated refresh. */
const makeStore = (): KeyValue & { raw(): string | null } => {
  const map = new Map<string, string>();
  return {
    get: (k) => map.get(k) ?? null,
    set: (k, v) => void map.set(k, v),
    remove: (k) => void map.delete(k),
    raw: () => map.get('severgrow.duel.session.v1') ?? null,
  };
};

/** Two clients that share one "browser profile" (storage) — so a refresh keeps the session. */
const browserProfile = makeStore();
const clientOn = (baseUrl: string, store: KeyValue = browserProfile) =>
  new DuelClient({ baseUrl, fetch: globalThis.fetch as unknown as FetchLike, storage: store });

describe('online duel vertical slice (real HTTP)', () => {
  let server: Server;
  let baseUrl: string;
  const service = new MatchService({ storage: new MemoryStorage(), config: DEFAULT_SERVER_CONFIG });

  beforeAll(async () => {
    server = createHttpServer({ service, config: DEFAULT_SERVER_CONFIG });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('runs the whole flow and reconstructs it after a refresh', async () => {
    const a = clientOn(baseUrl);
    const b = clientOn(baseUrl, makeStore());

    // 1. Guest A creates a match.
    const guestA = await a.createGuest('A');
    const created = await a.createMatch(guestA.token);
    expect(created.match.status).toBe('waiting');
    expect(created.match.inviteCode).toMatch(/^[0-9A-HJKMNP-TV-Z]{8}$/);
    expect(created.player.seat).toBe(0);
    expect(created.player.legalActions).toEqual([]);
    a.saveSession({ token: guestA.token, matchId: created.match.matchId, seat: created.player.seat });

    // 2. Guest B joins with the code.
    const guestB = await b.createGuest('B');
    const joined = await b.joinMatch(guestB.token, created.match.inviteCode);
    expect(joined.match.status).toBe('active');
    expect(joined.player.seat).toBe(1);
    b.saveSession({ token: guestB.token, matchId: joined.match.matchId, seat: joined.player.seat });

    const matchId = created.match.matchId;

    // 3. Both views are private: the opponent's hand is only a count; no seed or deck anywhere.
    const viewA = (await a.getState(guestA.token, matchId)).player;
    const viewB = (await b.getState(guestB.token, matchId)).player;
    const authoritative = await service.viewPayload(await service.authenticate(guestA.token), matchId);
    expect(authoritative.seat).toBe(0);
    for (const [payload, seat] of [
      [viewA, 0],
      [viewB, 1],
    ] as const) {
      // Structural: no slot for authoritative fields; only the viewer's own hand is present.
      for (const key of ['seed', 'deck', 'hands', 'history', 'fruitKnown']) {
        expect(Object.keys(payload.view)).not.toContain(key);
      }
      expect(Object.keys(payload)).not.toContain('state');
      expect(payload.seat).toBe(seat);
      expect(payload.view.hand.length).toBeGreaterThan(0);
      expect(payload.view.opponentHandCount).toBeGreaterThan(0);
    }

    // 4/5. The player to act submits a legal action; the server commits it.
    const acting = viewA.legalActions.length > 0 ? { client: a, token: guestA.token, payload: viewA } : { client: b, token: guestB.token, payload: viewB };
    expect(acting.payload.legalActions.length).toBeGreaterThan(0);
    const action = acting.payload.legalActions[0]!;
    const submitted = await acting.client.submitAction(acting.token, matchId, {
      expectedRevision: acting.payload.revision,
      requestId: 'slice-move-1',
      action,
    });
    expect(submitted.replayed).toBe(false);
    expect(submitted.player.revision).toBe(1);

    // 6. Both players see the updated revision and the same public event.
    const afterA = (await a.getState(guestA.token, matchId)).player;
    const afterB = (await b.getState(guestB.token, matchId)).player;
    expect(afterA.revision).toBe(1);
    expect(afterB.revision).toBe(1);
    expect(afterA.events.length).toBeGreaterThan(0);
    expect(afterB.events.length).toBeGreaterThan(0);

    // 7. Refresh: a brand-new client with the same stored session reconstructs the match.
    const refreshed = clientOn(baseUrl);
    const resumed = await refreshed.resume();
    expect(resumed).not.toBeNull();
    expect(resumed!.player.matchId).toBe(matchId);
    expect(resumed!.player.revision).toBe(1);
    expect(resumed!.player.seat).toBe(0);
    expect(resumed!.player.view.hand.map((c) => c.id)).toEqual(afterA.view.hand.map((c) => c.id));

    // A duplicate submission from the same client is idempotent.
    const retry = await acting.client.submitAction(acting.token, matchId, {
      expectedRevision: acting.payload.revision,
      requestId: 'slice-move-1',
      action,
    });
    expect(retry.replayed).toBe(true);
    expect(retry.player.revision).toBe(1);

    // A *different* player reusing that request id is refused (never a cross-player replay).
    const other = acting.client === a ? b : a;
    const otherToken = acting.client === a ? guestB.token : guestA.token;
    await expect(
      other.submitAction(otherToken, matchId, { expectedRevision: 1, requestId: 'slice-move-1', action: { t: 'EndAct' } }),
    ).rejects.toMatchObject({ code: 'REQUEST_ID_CONFLICT' });
  });

  it('rejects unauthenticated and unauthorized access', async () => {
    const client = clientOn(baseUrl, makeStore());
    await expect(client.createMatch('not-a-real-token-value-1234567890')).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
      status: 401,
    });
    // No Authorization header at all.
    const anon = new DuelClient({ baseUrl, fetch: globalThis.fetch as unknown as FetchLike, storage: makeStore() });
    const guest = await anon.createGuest();
    const created = await anon.createMatch(guest.token);
    // A different guest cannot see or join that match.
    const outsider = clientOn(baseUrl, makeStore());
    const outsiderGuest = await outsider.createGuest();
    await expect(outsider.getState(outsiderGuest.token, created.match.matchId)).rejects.toMatchObject({
      code: 'NOT_A_PARTICIPANT',
      status: 403,
    });
    await expect(
      outsider.submitAction(outsiderGuest.token, created.match.matchId, {
        expectedRevision: 0,
        requestId: 'x',
        action: { t: 'EndAct' },
      }),
    ).rejects.toMatchObject({ code: 'NOT_A_PARTICIPANT' });
  });

  it('returns precise errors for stale revisions, bad paths and unknown routes', async () => {
    const client = clientOn(baseUrl, makeStore());
    const guest = await client.createGuest();
    const created = await client.createMatch(guest.token);
    const second = clientOn(baseUrl, makeStore());
    const guestB = await second.createGuest();
    await second.joinMatch(guestB.token, created.match.inviteCode);

    // Stale revision (0 is stale only after a move; use a huge one to be unambiguous).
    await expect(
      client.submitAction(guest.token, created.match.matchId, { expectedRevision: 99, requestId: 'stale-1', action: { t: 'EndAct' } }),
    ).rejects.toMatchObject({ code: expect.stringMatching(/STALE_REVISION|NOT_YOUR_TURN/) });

    // Unknown match id.
    await expect(client.getState(guest.token, '00000000-0000-0000-0000-000000000000')).rejects.toMatchObject({
      code: 'MATCH_NOT_FOUND',
      status: 404,
    });

    // Unknown route.
    await expect(client.getMatch(guest.token, 'nope/no-route')).rejects.toBeInstanceOf(DuelError);
  });
});

describe('cards can never be reconstructed from a payload', () => {
  it('a player view never contains more card ids than the viewer is allowed to know', async () => {
    const service = new MatchService({ storage: new MemoryStorage(), config: DEFAULT_SERVER_CONFIG });
    const a = await service.createGuest();
    const b = await service.createGuest();
    const pa = await service.authenticate(a.token);
    const pb = await service.authenticate(b.token);
    const { match } = await service.createMatch(pa);
    await service.joinMatch(pb, match.inviteCode);

    const view = await service.viewPayload(pa, match.matchId);
    const allCards = createCards(view.view.config);
    const publicIds = new Set([...view.view.hand, ...view.view.discard].map((c) => c.id));
    const seen = new Set([...JSON.stringify(view).matchAll(/"id":(\d+)/g)].map((m) => Number(m[1])));
    // Strictly fewer than the deck: the unplayed cards and the opponent's hand stay hidden.
    expect(seen.size).toBeLessThan(allCards.length);
    expect([...seen].every((id) => publicIds.has(id))).toBe(true);
  });
});
