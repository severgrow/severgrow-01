// A mutual rematch for a finished STANDARD duel (owner, 2026-10-22: "they both press rematch =
// they're straight in a new game"). Live duels already did this through their challenge channel;
// a standard duel's Rematch used to create a fresh invite for whoever pressed it, so two presses
// made two separate invites and nobody played.
//
// The rule: the first press creates the rematch match (tagged with the finished match's id, at most
// one per finished match) and waits on it; the second press, by the other player, takes the other
// seat and the match is active for both.
import { describe, expect, it } from 'vitest';
import { DEFAULT_SERVER_CONFIG } from '../src/config.js';
import type { ServerConfig } from '../src/config.js';
import { createFetchApp } from '../src/fetch-app.js';
import { MatchService } from '../src/service.js';
import { MemoryStorage } from '../src/storage/memory.js';

const config = (): ServerConfig => ({
  ...DEFAULT_SERVER_CONFIG,
  turnTimeoutMs: 10_000,
  waitingExpireMs: 3_600_000,
  rateLimits: {
    ...DEFAULT_SERVER_CONFIG.rateLimits,
    guestPerIpPerHour: 10_000, joinPerPlayerPerHour: 10_000, joinPerIpPerHour: 10_000,
    createPerPlayerPerHour: 10_000, createPerIpPerHour: 10_000,
  },
});

const harness = () => {
  const storage = new MemoryStorage();
  const service = new MatchService({ storage, config: config(), now: () => 1_000_000 });
  return { storage, service };
};
const guest = async (service: MatchService, name: string) => {
  const created = await service.createGuest(name);
  return { token: created.token, player: await service.authenticate(created.token) };
};
/** Two players who just finished a standard duel (one resigned). */
const finishedDuel = async (service: MatchService) => {
  const a = await guest(service, 'Alder');
  const b = await guest(service, 'Birch');
  const created = await service.createMatch(a.player);
  await service.joinMatch(b.player, created.match.inviteCode!);
  await service.resign(b.player, created.match.matchId);
  return { a, b, finishedId: created.match.matchId };
};

describe('a mutual rematch for a finished standard duel', () => {
  it('first press waits on a new match; the second press puts both players in it, active', async () => {
    const { service } = harness();
    const { a, b, finishedId } = await finishedDuel(service);

    const first = await service.rematch(a.player, finishedId);
    expect(first.match.status).toBe('waiting');
    expect(first.match.matchId).not.toBe(finishedId);

    const second = await service.rematch(b.player, finishedId);
    expect(second.match.matchId).toBe(first.match.matchId);
    expect(second.match.status).toBe('active');
    // The first presser sees the same match active too (their waiting screen polls it).
    expect((await service.getMatch(a.player, first.match.matchId)).status).toBe('active');
  });

  it('pressing again is harmless: the same match comes back, never a second one', async () => {
    const { service, storage } = harness();
    const { a, b, finishedId } = await finishedDuel(service);
    const one = await service.rematch(a.player, finishedId);
    const two = await service.rematch(a.player, finishedId);
    expect(two.match.matchId).toBe(one.match.matchId);
    expect(two.match.status).toBe('waiting');
    await service.rematch(b.player, finishedId);
    const three = await service.rematch(a.player, finishedId);
    expect(three.match.matchId).toBe(one.match.matchId);
    expect(three.match.status).toBe('active');
    const open = (await storage.matchesOfPlayer(a.player.id)).filter((m) => m.status !== 'finished');
    expect(open).toHaveLength(1);
  });

  it('both pressing at the same moment still makes exactly one match, with both seated', async () => {
    const { service, storage } = harness();
    const { a, b, finishedId } = await finishedDuel(service);
    const [x, y] = await Promise.all([service.rematch(a.player, finishedId), service.rematch(b.player, finishedId)]);
    expect(x.match.matchId).toBe(y.match.matchId);
    expect((await storage.participantsOf(x.match.matchId)).map((p) => p.playerId).sort()).toEqual([a.player.id, b.player.id].sort());
    expect((await service.getMatch(a.player, x.match.matchId)).status).toBe('active');
  });

  it('only the two players of the finished duel may rematch it, and only once it is finished', async () => {
    const { service } = harness();
    const { a, finishedId } = await finishedDuel(service);
    const stranger = await guest(service, 'Cedar');
    await expect(service.rematch(stranger.player, finishedId)).rejects.toMatchObject({ code: 'NOT_A_PARTICIPANT' });
    const c = await guest(service, 'Dogwood');
    const running = await service.createMatch(a.player);
    await service.joinMatch(c.player, running.match.inviteCode!);
    await expect(service.rematch(a.player, running.match.matchId)).rejects.toMatchObject({ code: 'MATCH_NOT_FINISHED' });
  });

  it('is served at POST /v1/matches/:id/rematch', async () => {
    const { service } = harness();
    const { a, b, finishedId } = await finishedDuel(service);
    const app = createFetchApp({ service, config: { ...config(), corsOrigins: ['*'] } });
    const post = (token: string) => app(new Request(`http://x/v1/matches/${finishedId}/rematch`, {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: '{}',
    }));
    const r1 = await post(a.token);
    expect(r1.status).toBe(200);
    const b1 = (await r1.json()) as { ok: boolean; match: { matchId: string; status: string }; player: { status: string } };
    expect(b1.match.status).toBe('waiting');
    const r2 = (await (await post(b.token)).json()) as { match: { matchId: string; status: string }; player: { status: string } };
    expect(r2.match).toMatchObject({ matchId: b1.match.matchId, status: 'active' });
    expect(r2.player.status).toBe('active');
  });
});
