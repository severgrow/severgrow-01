// Cancel a WAITING match you own — the invite screen's "Cancel match".
//
// Before this endpoint the only way out of an invite nobody ever joined was to wait out the 48-hour
// window, so abandoned invites lingered as "open" duels. These tests pin the safety properties:
//   * only the OWNER may cancel their own match (a stranger gets a calm `false`, no change);
//   * only a `waiting` match is retired (an `active` one is left alone);
//   * it is idempotent (a repeat call is a calm `false`);
//   * a cancelled match can no longer be joined — its invite code resolves to nothing.
import { describe, expect, it } from 'vitest';
import { DEFAULT_SERVER_CONFIG } from '../src/config.js';
import type { ServerConfig } from '../src/config.js';
import { createFetchApp } from '../src/fetch-app.js';
import { MatchService } from '../src/service.js';
import { MemoryStorage } from '../src/storage/memory.js';

const config = (overrides: Partial<ServerConfig> = {}): ServerConfig => ({
  ...DEFAULT_SERVER_CONFIG,
  turnTimeoutMs: 10_000,
  waitingExpireMs: 3_600_000,
  rateLimits: {
    ...DEFAULT_SERVER_CONFIG.rateLimits,
    guestPerIpPerHour: 10_000,
    joinPerPlayerPerHour: 10_000,
    joinPerIpPerHour: 10_000,
    createPerPlayerPerHour: 10_000,
    createPerIpPerHour: 10_000,
  },
  ...overrides,
});

const harness = (overrides: Partial<ServerConfig> = {}) => {
  const storage = new MemoryStorage();
  const cfg = config(overrides);
  const service = new MatchService({ storage, config: cfg, now: () => 1_000_000 });
  return { storage, service, cfg };
};

const guest = async (service: MatchService, name: string) => {
  const created = await service.createGuest(name);
  return { token: created.token, player: await service.authenticate(created.token) };
};

describe('cancelWaitingMatch (service)', () => {
  it('retires the owner\'s waiting invite, and the code can no longer be joined', async () => {
    const { service, storage } = harness();
    const a = await guest(service, 'A');
    const created = await service.createMatch(a.player);
    expect(created.match.status).toBe('waiting');

    const result = await service.cancelWaitingMatch(a.player, created.match.matchId);
    expect(result).toEqual({ cancelled: true });
    expect(await storage.matchById(created.match.matchId)).toBeNull();

    // A cancelled match is no longer joinable: the code resolves to nothing.
    const b = await guest(service, 'B');
    await expect(service.joinMatch(b.player, created.match.inviteCode)).rejects.toMatchObject({
      code: 'MATCH_NOT_FOUND',
    });
  });

  it('is idempotent: a second cancel is a calm no-op', async () => {
    const { service } = harness();
    const a = await guest(service, 'A');
    const created = await service.createMatch(a.player);
    expect((await service.cancelWaitingMatch(a.player, created.match.matchId)).cancelled).toBe(true);
    expect((await service.cancelWaitingMatch(a.player, created.match.matchId)).cancelled).toBe(false);
  });

  it('refuses to cancel a match owned by somebody ELSE, leaving it intact', async () => {
    const { service, storage } = harness();
    const a = await guest(service, 'A');
    const created = await service.createMatch(a.player);
    const b = await guest(service, 'B');
    expect((await service.cancelWaitingMatch(b.player, created.match.matchId)).cancelled).toBe(false);
    // The owner's invite is untouched and still joinable.
    expect((await storage.matchById(created.match.matchId))?.status).toBe('waiting');
  });

  it('never cancels an ACTIVE match (a real duel is not a waiting invite)', async () => {
    const { service, storage } = harness();
    const a = await guest(service, 'A');
    const created = await service.createMatch(a.player);
    const b = await guest(service, 'B');
    await service.joinMatch(b.player, created.match.inviteCode);
    expect((await storage.matchById(created.match.matchId))?.status).toBe('active');
    expect((await service.cancelWaitingMatch(a.player, created.match.matchId)).cancelled).toBe(false);
    expect((await storage.matchById(created.match.matchId))?.status).toBe('active');
  });
});

describe('POST /v1/matches/:id/cancel (real HTTP)', () => {
  it('requires authentication and cancels the owner\'s waiting match', async () => {
    const { service, cfg } = harness();
    const app = createFetchApp({ service, config: cfg });
    const a = await guest(service, 'A');
    const created = await service.createMatch(a.player);

    const unauthenticated = await app(
      new Request(`http://localhost/v1/matches/${created.match.matchId}/cancel`, { method: 'POST', body: '{}' }),
    );
    expect(unauthenticated.status).toBe(401);

    const ok = await app(
      new Request(`http://localhost/v1/matches/${created.match.matchId}/cancel`, {
        method: 'POST',
        headers: { authorization: `Bearer ${a.token}`, 'content-type': 'application/json' },
        body: '{}',
      }),
    );
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ ok: true, cancelled: true });
  });
});
